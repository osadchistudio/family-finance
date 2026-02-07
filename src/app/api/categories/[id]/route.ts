import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, nameEn, icon, color, type } = body;

    // Check if category exists
    const existing = await prisma.category.findUnique({
      where: { id }
    });

    if (!existing) {
      return NextResponse.json(
        { message: 'הקטגוריה לא נמצאה' },
        { status: 404 }
      );
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(nameEn !== undefined && { nameEn }),
        ...(icon && { icon }),
        ...(color && { color }),
        ...(type && { type }),
      },
    });

    return NextResponse.json(category);
  } catch (error) {
    console.error('Update category error:', error);
    return NextResponse.json(
      { message: 'שגיאה בעדכון הקטגוריה' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check if category exists and get transaction count
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { transactions: true }
        }
      }
    });

    if (!category) {
      return NextResponse.json(
        { message: 'הקטגוריה לא נמצאה' },
        { status: 404 }
      );
    }

    // Remove category from transactions (set to null)
    if (category._count.transactions > 0) {
      await prisma.transaction.updateMany({
        where: { categoryId: id },
        data: { categoryId: null }
      });
    }

    // Delete keywords
    await prisma.categoryKeyword.deleteMany({
      where: { categoryId: id }
    });

    // Delete category
    await prisma.category.delete({
      where: { id }
    });

    return NextResponse.json({
      success: true,
      uncategorizedCount: category._count.transactions
    });
  } catch (error) {
    console.error('Delete category error:', error);
    return NextResponse.json(
      { message: 'שגיאה במחיקת הקטגוריה' },
      { status: 500 }
    );
  }
}
