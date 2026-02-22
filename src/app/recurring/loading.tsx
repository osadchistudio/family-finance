export default function RecurringLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-9 w-44 rounded bg-gray-200" />
        <div className="h-5 w-72 rounded bg-gray-100 mt-2" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 space-y-4">
        <div className="h-32 rounded-lg bg-gray-50 border border-gray-100" />
        <div className="h-64 rounded-lg bg-gray-50 border border-gray-100" />
      </div>
    </div>
  );
}
