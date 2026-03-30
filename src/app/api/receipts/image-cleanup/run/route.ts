import { NextRequest, NextResponse } from 'next/server';
import {
  ReceiptImageCleanupDomainNotReadyError,
  runReceiptImageCleanup,
} from '@/lib/receipt-image-cleanup';

function isAuthorized(request: NextRequest) {
  const configuredSecret = process.env.RECEIPT_IMAGE_CLEANUP_SECRET?.trim();

  if (!configuredSecret) {
    return false;
  }

  const headerSecret = request.headers.get('x-receipt-image-cleanup-secret')?.trim();
  return headerSecret === configuredSecret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';
    const retentionDaysParam = url.searchParams.get('retentionDays');
    const retentionDays = retentionDaysParam ? Number(retentionDaysParam) : undefined;

    const result = await runReceiptImageCleanup({
      dryRun,
      retentionDays,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof ReceiptImageCleanupDomainNotReadyError) {
      return NextResponse.json(
        { error: 'Receipt domain migration has not been applied yet' },
        { status: 503 }
      );
    }

    console.error('Receipt image cleanup run error:', error);
    return NextResponse.json(
      { error: 'Failed to run receipt image cleanup' },
      { status: 500 }
    );
  }
}
