import { NextRequest, NextResponse } from 'next/server';
import {
  ReceiptInputError,
  ReceiptDomainNotReadyError,
  getReceiptById,
  receiptExists,
  updateReceipt,
} from '@/lib/receipts';
import {
  ReceiptImageUploadError,
  loadReceiptImageStorageKey,
  saveReceiptImage,
} from '@/lib/receipt-image-storage';

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
    const exists = await receiptExists(id);

    if (!exists) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const savedImage = await saveReceiptImage(id, file);
    const receipt = await updateReceipt(id, {
      imageStorageKey: savedImage.imageStorageKey,
      thumbnailStorageKey: savedImage.thumbnailStorageKey,
      status: 'PROCESSING',
    });

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      receipt,
      upload: savedImage,
    });
  } catch (error) {
    if (error instanceof ReceiptInputError || error instanceof ReceiptImageUploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof ReceiptDomainNotReadyError) {
      return NextResponse.json(
        { error: 'Receipt domain migration has not been applied yet' },
        { status: 503 }
      );
    }

    console.error('Upload receipt image error:', error);
    return NextResponse.json(
      { error: 'Failed to upload receipt image' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const variant = request.nextUrl.searchParams.get('variant') === 'thumbnail'
      ? 'thumbnail'
      : 'image';

    const receipt = await getReceiptById(id);
    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    const storageKey = variant === 'thumbnail'
      ? receipt.thumbnailStorageKey || receipt.imageStorageKey
      : receipt.imageStorageKey;

    if (!storageKey) {
      return NextResponse.json({ error: 'Receipt image not found' }, { status: 404 });
    }

    const asset = await loadReceiptImageStorageKey(storageKey);

    return new NextResponse(new Uint8Array(asset.buffer), {
      status: 200,
      headers: {
        'Content-Type': asset.contentType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    if (error instanceof ReceiptImageUploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof ReceiptDomainNotReadyError) {
      return NextResponse.json(
        { error: 'Receipt domain migration has not been applied yet' },
        { status: 503 }
      );
    }

    console.error('Load receipt image error:', error);
    return NextResponse.json(
      { error: 'Failed to load receipt image' },
      { status: 500 }
    );
  }
}
