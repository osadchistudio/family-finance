export default function TransactionsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-9 w-36 rounded bg-gray-200" />
        <div className="h-5 w-24 rounded bg-gray-100 mt-2" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="h-11 rounded-lg bg-gray-100" />
        <div className="h-11 rounded-lg bg-gray-100 sm:w-1/2" />
        <div className="h-64 rounded-lg bg-gray-50 border border-gray-100" />
      </div>
    </div>
  );
}
