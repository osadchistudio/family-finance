import { prisma } from '@/lib/prisma';
import { DEFAULT_PERIOD_MODE, PERIOD_MODE_SETTING_KEY, PeriodMode, normalizePeriodMode } from '@/lib/period-utils';

export async function getPeriodModeSetting(): Promise<PeriodMode> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: PERIOD_MODE_SETTING_KEY },
    });
    return normalizePeriodMode(setting?.value);
  } catch {
    return DEFAULT_PERIOD_MODE;
  }
}
