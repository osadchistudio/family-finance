import { prisma } from '@/lib/prisma';
import { TransactionList } from '@/components/transactions/TransactionList';

async function getTransactions() {
  const transactions = await prisma.transaction.findMany({
    where: { isExcluded: false },
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
    isAutoCategorized: tx.isAutoCategorized,
    isRecurring: tx.isRecurring,
    notes: tx.notes
  }));
}

async function getCategories() {
  return await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' }
  });
}

async function getAccounts() {
  return await prisma.account.findMany({
    orderBy: { name: 'asc' }
  });
}

export default async function TransactionsPage() {
  const [transactions, categories, accounts] = await Promise.all([
    getTransactions(),
    getCategories(),
    getAccounts()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">תנועות</h1>
          <p className="text-gray-600 mt-1">
            {transactions.length} תנועות
          </p>
        </div>
      </div>

      <TransactionList
        transactions={transactions}
        categories={categories}
        accounts={accounts}
      />
    </div>
  );
}
