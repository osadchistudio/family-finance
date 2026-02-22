export default function MonthlySummaryLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-9 w-44 rounded bg-gray-200" />
        <div className="h-5 w-56 rounded bg-gray-100 mt-2" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 space-y-4">
        <div className="h-10 w-44 rounded bg-gray-100" />
        <div className="h-72 rounded-lg bg-gray-50 border border-gray-100" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-40 rounded-xl bg-gray-100 border border-gray-200" />
        ))}
      </div>
    </div>
  );
}
