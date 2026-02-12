import { prisma } from '@/lib/prisma';
import { RecurringExpensesList } from '@/components/recurring/RecurringExpensesList';
import { Decimal } from 'decimal.js';
import dayjs from 'dayjs';

async function getRecurringTransactions() {
  const transactions = await prisma.transaction.findMany({
    where: { isRecurring: true, isExcluded: false },
    include: {
      category: true,
      account: true
    },
    orderBy: { date: 'desc' }
  });

  return transactions.map(tx => ({
    id: tx.id,
    date: tx.date.toISOString(),
    description: tx.description,
    amount: tx.amount.toString(),
    categoryId: tx.categoryId,
    category: tx.category ? {
      id: tx.category.id,
      name: tx.category.name,
      icon: tx.category.icon || '',
      color: tx.category.color || '#888'
    } : null,
    account: {
      id: tx.account.id,
      name: tx.account.name,
      institution: tx.account.institution
    },
    isRecurring: true,
    notes: tx.notes
  }));
}

async function getIncomeBaseline() {
  const transactions = await prisma.transaction.findMany({
    where: { isExcluded: false },
    select: {
      date: true,
      amount: true
    }
  });

  const incomeByMonth: Record<string, Decimal> = {};

  for (const tx of transactions) {
    const amount = new Decimal(tx.amount.toString());
    if (amount.lte(0)) continue;

    const monthKey = dayjs(tx.date).format('YYYY-MM');
    if (!incomeByMonth[monthKey]) {
      incomeByMonth[monthKey] = new Decimal(0);
    }
    incomeByMonth[monthKey] = incomeByMonth[monthKey].plus(amount);
  }

  const incomeMonths = Math.max(1, Object.keys(incomeByMonth).length);
  const totalIncome = Object.values(incomeByMonth).reduce((sum, amount) => sum.plus(amount), new Decimal(0));

  return {
    averageMonthlyIncome: totalIncome.div(incomeMonths).toNumber(),
    incomeMonths
  };
}

export default async function RecurringPage() {
  const [transactions, incomeBaseline] = await Promise.all([
    getRecurringTransactions(),
    getIncomeBaseline()
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">הוצאות קבועות</h1>
        <p className="text-gray-600 mt-1">
          {transactions.length} תנועות שסומנו כקבועות בהיסטוריה
        </p>
      </div>

      <RecurringExpensesList
        transactions={transactions}
        averageMonthlyIncome={incomeBaseline.averageMonthlyIncome}
        incomeMonths={incomeBaseline.incomeMonths}
      />
    </div>
  );
}
