import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { CategoryType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getPeriodModeSetting } from '@/lib/system-settings';
import {
  getCurrentPeriodKey,
  getVariableBudgetPlan,
  parseBudgetPeriodKey,
  saveVariableBudgetPlan,
} from '@/lib/variable-budget';

interface SaveBudgetItemPayload {
  categoryId?: unknown;
  amount?: unknown;
}

interface SaveVariableBudgetPayload {
  periodKey?: unknown;
  items?: unknown;
}

function normalizeIncomingItems(rawItems: unknown): Record<string, number> {
  if (!Array.isArray(rawItems)) return {};

  const normalized: Record<string, number> = {};
  for (const rawItem of rawItems) {
    const item = rawItem as SaveBudgetItemPayload;
    if (!item || typeof item !== 'object') continue;

    const categoryId = typeof item.categoryId === 'string' ? item.categoryId.trim() : '';
    const amount = Number(item.amount);
    if (!categoryId) continue;
    if (!Number.isFinite(amount) || amount <= 0) continue;

    normalized[categoryId] = Number(amount.toFixed(2));
  }

  return normalized;
}

export async function GET(request: NextRequest) {
  try {
    const periodMode = await getPeriodModeSetting();
    const queryPeriodKey = request.nextUrl.searchParams.get('periodKey');
    const periodKey = parseBudgetPeriodKey(queryPeriodKey) || getCurrentPeriodKey(periodMode);

    const plan = await getVariableBudgetPlan(periodMode, periodKey);
    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error('Get variable budget error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load variable budget plan' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const periodMode = await getPeriodModeSetting();
    const body = await request.json() as SaveVariableBudgetPayload;
    const periodKey = parseBudgetPeriodKey(body.periodKey) || getCurrentPeriodKey(periodMode);
    const items = normalizeIncomingItems(body.items);

    const categoryIds = Object.keys(items);
    if (categoryIds.length > 0) {
      const categories = await prisma.category.findMany({
        where: {
          id: { in: categoryIds },
        },
        select: {
          id: true,
          type: true,
        },
      });

      const expenseCategoryIds = new Set(
        categories
          .filter((category) => category.type === CategoryType.EXPENSE)
          .map((category) => category.id)
      );

      const validatedItems: Record<string, number> = {};
      for (const [categoryId, amount] of Object.entries(items)) {
        if (!expenseCategoryIds.has(categoryId)) continue;
        validatedItems[categoryId] = amount;
      }

      const plan = await saveVariableBudgetPlan(periodMode, periodKey, validatedItems);

      revalidatePath('/');
      revalidatePath('/monthly-summary');

      return NextResponse.json({ success: true, plan });
    }

    const plan = await saveVariableBudgetPlan(periodMode, periodKey, {});
    revalidatePath('/');
    revalidatePath('/monthly-summary');

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error('Save variable budget error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save variable budget plan' },
      { status: 500 }
    );
  }
}
