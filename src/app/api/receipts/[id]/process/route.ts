import { NextRequest, NextResponse } from 'next/server';
import {
  ReceiptDomainNotReadyError,
  ReceiptInputError,
  parseReceiptProcessInput,
  processReceipt,
} from '@/lib/receipts';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = parseReceiptProcessInput(body);
    const receipt = await processReceipt(id, input);

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, receipt });
  } catch (error) {
    if (error instanceof ReceiptInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof ReceiptDomainNotReadyError) {
      return NextResponse.json(
        { error: 'Receipt domain migration has not been applied yet' },
        { status: 503 }
      );
    }

    console.error('Process receipt error:', error);
    return NextResponse.json(
      { error: 'Failed to process receipt' },
      { status: 500 }
    );
  }
}
