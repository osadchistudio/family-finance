import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { transactions: true, keywords: true }
        },
        keywords: {
          take: 5
        }
      }
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    return NextResponse.json(
      { error: 'Failed to get categories' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, nameEn, icon, color, type } = body;

    if (!name) {
      return NextResponse.json(
        { message: 'שם הקטגוריה נדרש' },
        { status: 400 }
      );
    }

    // Get max sortOrder
    const maxOrder = await prisma.category.aggregate({
      _max: { sortOrder: true }
    });

    const category = await prisma.category.create({
      data: {
        name,
        nameEn: nameEn || null,
        icon: icon || '📁',
        color: color || '#6B7280',
        type: type || 'EXPENSE',
        sortOrder: (maxOrder._max.sortOrder || 0) + 1,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error('Create category error:', error);
    return NextResponse.json(
      { message: 'שגיאה ביצירת הקטגוריה' },
      { status: 500 }
    );
  }
}
