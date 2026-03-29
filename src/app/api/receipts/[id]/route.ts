import { NextRequest, NextResponse } from 'next/server';
import {
  ReceiptDomainNotReadyError,
  ReceiptInputError,
  getReceiptById,
  parseUpdateReceiptInput,
  updateReceipt,
} from '@/lib/receipts';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const receipt = await getReceiptById(id);

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    return NextResponse.json({ receipt });
  } catch (error) {
    if (error instanceof ReceiptDomainNotReadyError) {
      return NextResponse.json(
        { error: 'Receipt domain migration has not been applied yet' },
        { status: 503 }
      );
    }

    console.error('Get receipt error:', error);
    return NextResponse.json(
      { error: 'Failed to get receipt' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = parseUpdateReceiptInput(body);
    const receipt = await updateReceipt(id, input);

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

    console.error('Update receipt error:', error);
    return NextResponse.json(
      { error: 'Failed to update receipt' },
      { status: 500 }
    );
  }
}
