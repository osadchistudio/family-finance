import { NextResponse } from 'next/server';
import {
  completeReceiptReview,
  ReceiptDomainNotReadyError,
} from '@/lib/receipts';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const receipt = await completeReceiptReview(id);

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, receipt });
  } catch (error) {
    if (error instanceof ReceiptDomainNotReadyError) {
      return NextResponse.json(
        { error: 'Receipt domain migration has not been applied yet' },
        { status: 503 }
      );
    }

    console.error('Complete receipt review error:', error);
    return NextResponse.json(
      { error: 'Failed to complete receipt review' },
      { status: 500 }
    );
  }
}
