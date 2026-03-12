import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const upload = await prisma.fileUpload.findUnique({
      where: { id },
      select: {
        id: true,
        filename: true,
        account: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            transactions: true,
          },
        },
      },
    });

    if (!upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    const deletedTransactions = await prisma.$transaction(async (tx) => {
      const result = await tx.transaction.deleteMany({
        where: {
          fileUploadId: id,
        },
      });

      await tx.fileUpload.delete({
        where: { id },
      });

      return result.count;
    });

    revalidatePath('/upload');
    revalidatePath('/transactions');
    revalidatePath('/');
    revalidatePath('/monthly-summary');
    revalidatePath('/recurring');
    revalidatePath('/tips');

    return NextResponse.json({
      success: true,
      id,
      filename: upload.filename,
      accountName: upload.account.name,
      deletedTransactions,
      linkedTransactionsBeforeDelete: upload._count.transactions,
    });
  } catch (error) {
    console.error('Delete upload error:', error);
    return NextResponse.json(
      { error: 'Failed to delete upload' },
      { status: 500 }
    );
  }
}
