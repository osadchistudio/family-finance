import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE() {
  try {
    // Delete in order respecting foreign key constraints
    await prisma.transaction.deleteMany({});
    await prisma.fileUpload.deleteMany({});
    await prisma.account.deleteMany({});

    return NextResponse.json({
      success: true,
      message: 'כל הנתונים נמחקו בהצלחה'
    });
  } catch (error) {
    console.error('Reset error:', error);
    return NextResponse.json(
      { error: 'שגיאה במחיקת הנתונים', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
