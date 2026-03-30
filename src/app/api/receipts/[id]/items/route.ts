import { NextRequest, NextResponse } from 'next/server';
import {
  ReceiptDomainNotReadyError,
  ReceiptInputError,
  createReceiptItems,
  listReceiptItems,
  parseCreateReceiptItemsInput,
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
    const items = await listReceiptItems(id);

    if (!items) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof ReceiptDomainNotReadyError) {
      return NextResponse.json(
        { error: 'Receipt domain migration has not been applied yet' },
        { status: 503 }
      );
    }

    console.error('List receipt items error:', error);
    return NextResponse.json(
      { error: 'Failed to list receipt items' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const itemsInput = parseCreateReceiptItemsInput(body);
    const items = await createReceiptItems(id, itemsInput);

    if (!items) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, items },
      { status: 201 }
    );
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

    console.error('Create receipt items error:', error);
    return NextResponse.json(
      { error: 'Failed to create receipt items' },
      { status: 500 }
    );
  }
}
