import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fileParserService } from '@/services/parsers/FileParserService';
import { keywordCategorizer } from '@/services/categorization/KeywordCategorizer';
import { recurringKeywordMatcher } from '@/services/categorization/RecurringKeywordMatcher';
import { Institution, Prisma } from '@prisma/client';
import { isLikelySameMerchant } from '@/lib/merchantSimilarity';

const AMOUNT_EPSILON = 0.01;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const institutionParam = formData.get('institution') as string | null;
    const accountName = formData.get('accountName') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read file content
    const buffer = Buffer.from(await file.arrayBuffer());
    const institution = (institutionParam as Institution) || undefined;

    // Parse file (now async to support PDF)
    const parseResult = await fileParserService.parseFile(buffer, file.name, institution);

    if (parseResult.errors.length > 0 && parseResult.transactions.length === 0) {
      return NextResponse.json(
        { error: 'Failed to parse file', details: parseResult.errors },
        { status: 400 }
      );
    }

    // Get or create account - now with card number support
    let account = await prisma.account.findFirst({
      where: {
        institution: parseResult.institution,
        cardNumber: parseResult.cardNumber || null
      }
    });

    if (!account && parseResult.cardNumber) {
      // Maybe account exists without cardNumber - update it
      const existingAccount = await prisma.account.findFirst({
        where: {
          institution: parseResult.institution,
          cardNumber: null
        }
      });

      if (existingAccount) {
        const baseName = getDefaultAccountName(parseResult.institution);
        account = await prisma.account.update({
          where: { id: existingAccount.id },
          data: {
            cardNumber: parseResult.cardNumber,
            name: `${baseName} - ${parseResult.cardNumber}`
          }
        });
      }
    }

    if (!account) {
      // Generate account name with card number if available
      const baseName = accountName || getDefaultAccountName(parseResult.institution);
      const fullName = parseResult.cardNumber
        ? `${baseName} - ${parseResult.cardNumber}`
        : baseName;

      account = await prisma.account.create({
        data: {
          name: fullName,
          institution: parseResult.institution,
          cardNumber: parseResult.cardNumber || null
        }
      });
    }

    // Create file upload record
    const fileUpload = await prisma.fileUpload.create({
      data: {
        accountId: account.id,
        filename: file.name,
        originalName: file.name,
        rowCount: parseResult.rowCount,
        status: 'COMPLETED',
        source: 'WEB',
      }
    });

    // Get existing transactions for duplicate check (batch query)
    const existingTransactions = await prisma.transaction.findMany({
      where: { accountId: account.id },
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        reference: true,
        categoryId: true,
        isRecurring: true,
        merchantName: true,
      }
    });

    // Create Sets/Maps for fast duplicate lookup and correction by reference
    const existingKeysByContent = new Set(
      existingTransactions.map(tx =>
        `${tx.date.toISOString()}_${tx.amount}_${tx.description}`
      )
    );
    const existingByRef = new Map(
      existingTransactions
        .filter(tx => tx.reference)
        .map(tx => [tx.reference!, tx])
    );
    const existingByDateAmount = new Map<string, typeof existingTransactions>();
    for (const tx of existingTransactions) {
      const key = `${tx.date.toISOString()}_${Number(tx.amount).toFixed(2)}`;
      const bucket = existingByDateAmount.get(key) ?? [];
      bucket.push(tx);
      existingByDateAmount.set(key, bucket);
    }
    const seenRefsInFile = new Set<string>();
    const historicalCandidates = await keywordCategorizer.loadHistoricalCandidates();

    // Filter out duplicates and prepare batch data
    const transactionsToCreate = [];
    const existingTransactionsToFix = new Map<string, Prisma.TransactionUncheckedUpdateInput>();
    let duplicates = 0;
    let correctedExisting = 0;
    const fixedTransactionIds = new Set<string>();
    const queueExistingUpdate = (id: string, data: Prisma.TransactionUncheckedUpdateInput) => {
      if (!existingTransactionsToFix.has(id)) {
        correctedExisting++;
      }

      existingTransactionsToFix.set(id, {
        ...(existingTransactionsToFix.get(id) ?? {}),
        ...data,
      });
    };

    for (const tx of parseResult.transactions) {
      const categorization = await keywordCategorizer.categorize(tx.description, {
        historicalCandidates,
      });
      const isRecurring = await recurringKeywordMatcher.match(tx.description);

      // Check duplicate by reference (voucher number) first - most reliable
      if (tx.reference) {
        if (seenRefsInFile.has(tx.reference)) {
          duplicates++;
          continue;
        }

        const existing = existingByRef.get(tx.reference);
        if (existing) {
          const existingAmount = parseFloat(existing.amount.toString());
          const incomingAmount = tx.amount;
          const sameAbsoluteAmount = Math.abs(Math.abs(existingAmount) - Math.abs(incomingAmount)) < AMOUNT_EPSILON;
          const signChanged = Math.sign(existingAmount) !== Math.sign(incomingAmount);

          // If same voucher exists with same absolute amount but opposite sign,
          // treat it as a historical sign bug and fix the existing row in-place.
          if (sameAbsoluteAmount && signChanged && !fixedTransactionIds.has(existing.id)) {
            queueExistingUpdate(existing.id, {
              amount: incomingAmount,
              date: tx.date,
              valueDate: tx.valueDate || null,
              description: tx.description,
              merchantName: tx.description,
              reference: tx.reference || null,
              ...(categorization
                ? {
                    categoryId: categorization.categoryId,
                    isAutoCategorized: true,
                  }
                : {}),
              ...(isRecurring ? { isRecurring: true } : {}),
            });
            fixedTransactionIds.add(existing.id);
          }

          duplicates++;
          continue;
        }
      }

      // Fallback: check by content
      const key = `${tx.date.toISOString()}_${tx.amount}_${tx.description}`;
      if (existingKeysByContent.has(key)) {
        const exactExisting = existingTransactions.find(existing =>
          existing.date.toISOString() === tx.date.toISOString() &&
          Math.abs(Number(existing.amount) - tx.amount) < AMOUNT_EPSILON &&
          existing.description === tx.description
        );
        if (exactExisting) {
          if (!exactExisting.categoryId && categorization) {
            queueExistingUpdate(exactExisting.id, {
              categoryId: categorization.categoryId,
              isAutoCategorized: true,
            });
          }
          if (!exactExisting.isRecurring && isRecurring) {
            queueExistingUpdate(exactExisting.id, {
              isRecurring: true,
            });
          }
        }
        duplicates++;
        continue;
      }

      const dateAmountKey = `${tx.date.toISOString()}_${tx.amount.toFixed(2)}`;
      const similarExisting = (existingByDateAmount.get(dateAmountKey) ?? []).find(existing =>
        isLikelySameMerchant(existing.description, tx.description)
      );
      if (similarExisting) {
        const shouldUpgradeDescription =
          !similarExisting.description.includes(' ') &&
          tx.description.includes(' ');

        if (!similarExisting.categoryId && categorization) {
          queueExistingUpdate(similarExisting.id, {
            categoryId: categorization.categoryId,
            isAutoCategorized: true,
          });
        }
        if (!similarExisting.isRecurring && isRecurring) {
          queueExistingUpdate(similarExisting.id, {
            isRecurring: true,
          });
        }
        if (shouldUpgradeDescription) {
          queueExistingUpdate(similarExisting.id, {
            description: tx.description,
            merchantName: tx.description,
          });
        }

        duplicates++;
        continue;
      }

      // Mark as seen to avoid duplicates within same file
      existingKeysByContent.add(key);
      if (tx.reference) seenRefsInFile.add(tx.reference);

      transactionsToCreate.push({
        accountId: account.id,
        fileUploadId: fileUpload.id,
        date: tx.date,
        valueDate: tx.valueDate,
        amount: tx.amount,
        description: tx.description,
        merchantName: tx.description,
        reference: tx.reference,
        categoryId: categorization?.categoryId || null,
        isAutoCategorized: categorization !== null,
        isRecurring
      });
    }

    // Batch insert all transactions at once
    if (transactionsToCreate.length > 0) {
      await prisma.transaction.createMany({
        data: transactionsToCreate
      });
    }

    // Apply in-place fixes for existing records with wrong sign
    if (existingTransactionsToFix.size > 0) {
      for (const [id, data] of existingTransactionsToFix) {
        await prisma.transaction.update({
          where: { id },
          data,
        });
      }
    }

    const imported = transactionsToCreate.length;

    return NextResponse.json({
      success: true,
      institution: parseResult.institution,
      cardNumber: parseResult.cardNumber,
      accountName: account.name,
      rowCount: parseResult.rowCount,
      total: parseResult.transactions.length,
      imported,
      duplicates,
      correctedExisting,
      skippedRows: parseResult.skippedRows,
      errors: parseResult.errors.length,
      fileUploadId: fileUpload.id
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process file', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function getDefaultAccountName(institution: Institution): string {
  const names: Record<Institution, string> = {
    BANK_HAPOALIM: 'בנק הפועלים',
    BANK_LEUMI: 'בנק לאומי',
    ISRACARD: 'ישראכרט',
    LEUMI_CARD: 'לאומי קארד',
    OTHER: 'חשבון אחר'
  };
  return names[institution];
}
