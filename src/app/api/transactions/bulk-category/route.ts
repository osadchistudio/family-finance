import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const rawIds: unknown[] = Array.isArray(body?.transactionIds) ? body.transactionIds : [];
    const transactionIds = Array.from(
      new Set(
        rawIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      )
    );

    if (transactionIds.length === 0) {
      return NextResponse.json(
        { error: 'No transaction ids provided' },
        { status: 400 }
      );
    }

    const rawCategoryId = body?.categoryId;
    let categoryId: string | null = null;

    if (rawCategoryId === null) {
      categoryId = null;
    } else if (typeof rawCategoryId === 'string' && rawCategoryId.trim()) {
      categoryId = rawCategoryId.trim();
    } else {
      return NextResponse.json(
        { error: 'Invalid categoryId' },
        { status: 400 }
      );
    }

    if (categoryId) {
      const existingCategory = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });

      if (!existingCategory) {
        return NextResponse.json(
          { error: 'Category not found' },
          { status: 404 }
        );
      }
    }

    const result = await prisma.transaction.updateMany({
      where: {
        id: { in: transactionIds },
        isExcluded: false,
      },
      data: {
        categoryId,
        isAutoCategorized: false,
      },
    });

    revalidatePath('/transactions');
    revalidatePath('/recurring');
    revalidatePath('/');
    revalidatePath('/monthly-summary');

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
      categoryId,
    });
  } catch (error) {
    console.error('Bulk category update error:', error);
    return NextResponse.json(
      { error: 'Failed to bulk update categories' },
      { status: 500 }
    );
  }
}
