import { prisma } from '@/lib/prisma';
import dayjs from 'dayjs';
import { Decimal } from 'decimal.js';
import { Lightbulb, TrendingDown, TrendingUp, AlertTriangle, Award } from 'lucide-react';
import { getPeriodModeSetting } from '@/lib/system-settings';
import { buildPeriods, getPeriodKey, PeriodMode } from '@/lib/period-utils';

interface Tip {
  type: 'overspend' | 'underspend' | 'warning' | 'positive' | 'general';
  title: string;
  description: string;
  icon: string;
}

async function generateTips(periodMode: PeriodMode): Promise<Tip[]> {
  const tips: Tip[] = [];

  // Get transactions from last 3 periods in selected mode
  const periods = buildPeriods(periodMode, dayjs(), 3);
  const startDate = periods[0].startDate.startOf('day').toDate();

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: startDate },
      isExcluded: false
    },
    include: { category: true }
  });

  if (transactions.length === 0) {
    return [{
      type: 'general',
      title: 'התחל לעקוב אחר ההוצאות שלך',
      description: 'העלה קבצי תנועות מהבנק וחברות האשראי כדי לקבל ניתוח והמלצות מותאמות אישית.',
      icon: '📊'
    }];
  }

  // Calculate category spending for current vs previous month
  const currentPeriod = periods[periods.length - 1]?.key || getPeriodKey(dayjs(), periodMode);
  const lastPeriod = periods[periods.length - 2]?.key || currentPeriod;

  const categorySpending: Record<string, { current: Decimal; previous: Decimal; name: string; icon: string }> = {};

  for (const tx of transactions) {
    if (!tx.category || parseFloat(tx.amount.toString()) >= 0) continue;

    const monthKey = getPeriodKey(dayjs(tx.date), periodMode);
    const catId = tx.category.id;
    const amount = new Decimal(tx.amount.toString()).abs();

    if (!categorySpending[catId]) {
      categorySpending[catId] = {
        current: new Decimal(0),
        previous: new Decimal(0),
        name: tx.category.name,
        icon: tx.category.icon || '💰'
      };
    }

    if (monthKey === currentPeriod) {
      categorySpending[catId].current = categorySpending[catId].current.plus(amount);
    } else if (monthKey === lastPeriod) {
      categorySpending[catId].previous = categorySpending[catId].previous.plus(amount);
    }
  }

  // Generate tips based on spending patterns
  for (const [, spending] of Object.entries(categorySpending)) {
    if (spending.previous.isZero()) continue;

    const changePercent = spending.current.minus(spending.previous).dividedBy(spending.previous).times(100).toNumber();

    if (changePercent > 30) {
      tips.push({
        type: 'overspend',
        title: `עלייה בהוצאות על ${spending.name}`,
        description: `ההוצאה שלך על ${spending.name} עלתה ב-${Math.round(changePercent)}% מהחודש הקודם. בדוק אם יש הוצאות שניתן לצמצם.`,
        icon: spending.icon
      });
    } else if (changePercent < -20) {
      tips.push({
        type: 'positive',
        title: `כל הכבוד! חסכת ב${spending.name}`,
        description: `ההוצאה שלך על ${spending.name} ירדה ב-${Math.abs(Math.round(changePercent))}% מהחודש הקודם. המשך כך!`,
        icon: spending.icon
      });
    }
  }

  // Add general tips
  tips.push({
    type: 'general',
    title: 'תכנן את ההוצאות מראש',
    description: 'הכנת רשימת קניות לפני היציאה לסופר יכולה לחסוך עד 20% מההוצאות על מכולת.',
    icon: '📝'
  });

  tips.push({
    type: 'general',
    title: 'השווה מחירים',
    description: 'לפני רכישות גדולות, השווה מחירים בין מספר חנויות. זה יכול לחסוך מאות שקלים.',
    icon: '🔍'
  });

  tips.push({
    type: 'general',
    title: 'בדוק מנויים שלא בשימוש',
    description: 'עבור על החיובים החודשיים שלך וודא שאתה משתמש בכל המנויים. בטל מנויים שאינם בשימוש.',
    icon: '📱'
  });

  return tips.slice(0, 6);
}

export default async function TipsPage() {
  const periodMode = await getPeriodModeSetting();
  const tips = await generateTips(periodMode);

  const iconComponents = {
    overspend: AlertTriangle,
    underspend: TrendingDown,
    warning: AlertTriangle,
    positive: Award,
    general: Lightbulb
  };

  const iconColors = {
    overspend: 'text-red-600 bg-red-50',
    underspend: 'text-yellow-600 bg-yellow-50',
    warning: 'text-orange-600 bg-orange-50',
    positive: 'text-green-600 bg-green-50',
    general: 'text-blue-600 bg-blue-50'
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">טיפים לחיסכון</h1>
        <p className="text-gray-600 mt-1">
          המלצות מותאמות אישית בהתאם לדפוסי ההוצאות שלך ({periodMode === 'billing' ? 'מחזור 10-10' : 'חודש קלנדרי'})
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tips.map((tip, index) => {
          const IconComponent = iconComponents[tip.type];
          const colorClass = iconColors[tip.type];

          return (
            <div
              key={index}
              className="bg-white rounded-xl shadow-sm p-5"
            >
              <div className="flex gap-4">
                <div className={`p-3 rounded-full ${colorClass} shrink-0`}>
                  <span className="text-2xl">{tip.icon}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{tip.title}</h3>
                  <p className="text-sm text-gray-600">{tip.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-blue-50 rounded-xl p-6">
        <h3 className="font-semibold text-blue-900 mb-2">כללי זהב לחיסכון</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span>•</span>
            <span>שמור לפחות 10% מההכנסה החודשית כחיסכון</span>
          </li>
          <li className="flex items-start gap-2">
            <span>•</span>
            <span>הגדר תקציב חודשי לכל קטגוריית הוצאה</span>
          </li>
          <li className="flex items-start gap-2">
            <span>•</span>
            <span>עקוב אחר ההוצאות באופן קבוע - מודעות היא הצעד הראשון לשינוי</span>
          </li>
          <li className="flex items-start gap-2">
            <span>•</span>
            <span>הימנע מקניות אימפולסיביות - המתן 24 שעות לפני רכישות גדולות</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
