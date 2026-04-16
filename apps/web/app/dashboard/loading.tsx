export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header Skeleton */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
            <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Summary Cards Skeleton */}
        <section>
          <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-24 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </section>

        {/* Filters Skeleton */}
        <section>
          <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse mb-4" />
          <div className="space-y-3">
            <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
            <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse w-48" />
          </div>
        </section>

        {/* Transaction List Skeleton */}
        <section>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-16 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
