import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fileParserService } from '@/services/parsers/FileParserService';
import { keywordCategorizer } from '@/services/categorization/KeywordCategorizer';
import { recurringKeywordMatcher } from '@/services/categorization/RecurringKeywordMatcher';
import { Institution } from '@prisma/client';

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
        status: 'COMPLETED'
      }
    });

    // Get existing transactions for duplicate check (batch query)
    const existingTransactions = await prisma.transaction.findMany({
      where: { accountId: account.id },
      select: { date: true, amount: true, description: true, reference: true }
    });

    // Create Sets for fast duplicate lookup using multiple strategies
    const existingKeysByContent = new Set(
      existingTransactions.map(tx =>
        `${tx.date.toISOString()}_${tx.amount}_${tx.description}`
      )
    );
    const existingKeysByRef = new Set(
      existingTransactions
        .filter(tx => tx.reference)
        .map(tx => tx.reference!)
    );

    // Filter out duplicates and prepare batch data
    const transactionsToCreate = [];
    let duplicates = 0;

    for (const tx of parseResult.transactions) {
      // Check duplicate by reference (voucher number) first - most reliable
      if (tx.reference && existingKeysByRef.has(tx.reference)) {
        duplicates++;
        continue;
      }

      // Fallback: check by content
      const key = `${tx.date.toISOString()}_${tx.amount}_${tx.description}`;
      if (existingKeysByContent.has(key)) {
        duplicates++;
        continue;
      }

      // Mark as seen to avoid duplicates within same file
      existingKeysByContent.add(key);
      if (tx.reference) existingKeysByRef.add(tx.reference);

      // Categorize (sync operation - no DB call)
      const categorization = await keywordCategorizer.categorize(tx.description);

      // Check if this is a recurring expense
      const isRecurring = await recurringKeywordMatcher.match(tx.description);

      transactionsToCreate.push({
        accountId: account.id,
        fileUploadId: fileUpload.id,
        date: tx.date,
        valueDate: tx.valueDate,
        amount: tx.amount,
        description: tx.description,
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
