import { NextRequest, NextResponse } from 'next/server';
import {
  ReceiptDomainNotReadyError,
  ReceiptInputError,
  parseUpdateReceiptItemInput,
  updateReceiptItem,
} from '@/lib/receipts';

type RouteContext = {
  params: Promise<{
    id: string;
    itemId: string;
  }>;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id, itemId } = await context.params;
    const body = await request.json();
    const input = parseUpdateReceiptItemInput(body);
    const item = await updateReceiptItem(id, itemId, input);

    if (item === null) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    if (item === false) {
      return NextResponse.json({ error: 'Receipt item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, item });
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

    console.error('Update receipt item error:', error);
    return NextResponse.json(
      { error: 'Failed to update receipt item' },
      { status: 500 }
    );
  }
}
