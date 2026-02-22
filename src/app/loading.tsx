export default function DashboardLoading() {
  return (
    <div className="space-y-4 sm:space-y-6 animate-pulse">
      <div className="h-10 w-52 rounded bg-gray-200" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="h-32 rounded-xl bg-gray-100 border border-gray-200" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="h-80 rounded-xl bg-gray-100 border border-gray-200" />
        <div className="h-80 rounded-xl bg-gray-100 border border-gray-200" />
      </div>
    </div>
  );
}
