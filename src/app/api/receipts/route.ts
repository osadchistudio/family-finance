import { NextRequest, NextResponse } from 'next/server';
import {
  ReceiptDomainNotReadyError,
  ReceiptInputError,
  createReceipt,
  listReceipts,
  parseCreateReceiptInput,
  parseReceiptStatusesParam,
} from '@/lib/receipts';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const statuses = parseReceiptStatusesParam(searchParams.get('status'));
    const limit = Number.parseInt(searchParams.get('limit') || '20', 10);
    const offset = Number.parseInt(searchParams.get('offset') || '0', 10);

    const result = await listReceipts({ statuses, limit, offset });
    return NextResponse.json(result);
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

    console.error('List receipts error:', error);
    return NextResponse.json(
      { error: 'Failed to list receipts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = parseCreateReceiptInput(body);
    const receipt = await createReceipt(input);

    if (!receipt) {
      throw new Error('Receipt was created but could not be reloaded');
    }

    return NextResponse.json(
      { success: true, receipt },
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

    console.error('Create receipt error:', error);
    return NextResponse.json(
      { error: 'Failed to create receipt' },
      { status: 500 }
    );
  }
}
