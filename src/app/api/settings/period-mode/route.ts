import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { DEFAULT_PERIOD_MODE, PERIOD_MODE_SETTING_KEY, normalizePeriodMode } from '@/lib/period-utils';

export async function GET() {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: PERIOD_MODE_SETTING_KEY },
    });

    const periodMode = normalizePeriodMode(setting?.value);
    return NextResponse.json({ periodMode });
  } catch (error) {
    console.error('Get period mode error:', error);
    return NextResponse.json({ periodMode: DEFAULT_PERIOD_MODE });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { periodMode } = await request.json();
    const normalized = normalizePeriodMode(periodMode);

    await prisma.setting.upsert({
      where: { key: PERIOD_MODE_SETTING_KEY },
      update: { value: normalized },
      create: { key: PERIOD_MODE_SETTING_KEY, value: normalized },
    });

    revalidatePath('/');
    revalidatePath('/monthly-summary');
    revalidatePath('/recurring');
    revalidatePath('/tips');

    return NextResponse.json({ success: true, periodMode: normalized });
  } catch (error) {
    console.error('Save period mode error:', error);
    return NextResponse.json({ error: 'Failed to save period mode' }, { status: 500 });
  }
}
