import { prisma } from '@/lib/prisma';
import { RecurringExpensesList } from '@/components/recurring/RecurringExpensesList';

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

async function getCategories() {
  return await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' }
  });
}

export default async function RecurringPage() {
  const [transactions, categories] = await Promise.all([
    getRecurringTransactions(),
    getCategories()
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">הוצאות קבועות</h1>
        <p className="text-gray-600 mt-1">
          {transactions.length} הוצאות קבועות
        </p>
      </div>

      <RecurringExpensesList
        transactions={transactions}
        categories={categories}
      />
    </div>
  );
}
