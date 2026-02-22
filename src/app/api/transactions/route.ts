import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { Institution, Prisma } from '@prisma/client';

interface CreateManualTransactionPayload {
  description?: unknown;
  amount?: unknown;
  type?: unknown;
  date?: unknown;
  categoryId?: unknown;
  accountId?: unknown;
  notes?: unknown;
  isRecurring?: unknown;
}

async function getOrCreateManualAccountId() {
  const existing = await prisma.account.findFirst({
    where: {
      institution: Institution.OTHER,
      cardNumber: 'MANUAL',
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  try {
    const created = await prisma.account.create({
      data: {
        name: 'ידני / מזומן',
        institution: Institution.OTHER,
        cardNumber: 'MANUAL',
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      const manual = await prisma.account.findFirst({
        where: {
          institution: Institution.OTHER,
          cardNumber: 'MANUAL',
        },
        select: { id: true },
      });
      if (manual) return manual.id;
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get('categoryId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {
      isExcluded: false
    };

    if (categoryId) {
      where.categoryId = categoryId === 'uncategorized' ? null : categoryId;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) (where.date as Record<string, Date>).gte = new Date(startDate);
      if (endDate) (where.date as Record<string, Date>).lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          category: true,
          account: true
        },
        orderBy: { date: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.transaction.count({ where })
    ]);

    return NextResponse.json({
      transactions,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return NextResponse.json(
      { error: 'Failed to get transactions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CreateManualTransactionPayload;
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const amountValue = Number(body.amount);
    const type = body.type === 'income' ? 'income' : body.type === 'expense' ? 'expense' : null;
    const dateInput = typeof body.date === 'string' ? body.date : '';
    const accountIdInput = typeof body.accountId === 'string' ? body.accountId.trim() : '';
    const categoryIdInput = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    const isRecurring = Boolean(body.isRecurring);

    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    if (!type) {
      return NextResponse.json({ error: 'Type must be income or expense' }, { status: 400 });
    }

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    if (!dateInput) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    const parsedDate = new Date(dateInput);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    const accountId = accountIdInput || await getOrCreateManualAccountId();

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    let categoryId: string | null = null;
    if (categoryIdInput) {
      const category = await prisma.category.findUnique({
        where: { id: categoryIdInput },
        select: { id: true, type: true },
      });
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
      }
      if (type === 'expense' && category.type === 'INCOME') {
        return NextResponse.json({ error: 'Income category cannot be used for expense' }, { status: 400 });
      }
      if (type === 'income' && category.type === 'EXPENSE') {
        return NextResponse.json({ error: 'Expense category cannot be used for income' }, { status: 400 });
      }
      categoryId = category.id;
    }

    const signedAmount = type === 'expense' ? -Math.abs(amountValue) : Math.abs(amountValue);

    const transaction = await prisma.transaction.create({
      data: {
        accountId,
        date: parsedDate,
        valueDate: parsedDate,
        amount: signedAmount,
        description,
        categoryId,
        notes: notes || null,
        isRecurring,
        isAutoCategorized: false,
      },
      include: {
        category: true,
        account: true,
      },
    });

    revalidatePath('/transactions');
    revalidatePath('/monthly-summary');
    revalidatePath('/recurring');
    revalidatePath('/');
    revalidatePath('/tips');

    return NextResponse.json({ success: true, transaction });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Transaction already exists' },
        { status: 409 }
      );
    }

    console.error('Create manual transaction error:', error);
    return NextResponse.json(
      { error: 'Failed to create transaction' },
      { status: 500 }
    );
  }
}
