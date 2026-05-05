export function SkeletonPulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-md p-5 space-y-3">
      <SkeletonPulse className="h-4 w-24" />
      <SkeletonPulse className="h-8 w-16" />
      <SkeletonPulse className="h-3 w-20" />
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="bg-navy-600 h-10" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3 border-b">
          {Array.from({ length: cols }).map((_, j) => (
            <SkeletonPulse key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <div className="space-y-6">
      <SkeletonPulse className="h-4 w-32" />
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <SkeletonPulse className="h-8 w-64" />
        <SkeletonPulse className="h-4 w-40" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonPulse key={i} className="h-10" />
          ))}
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-6 space-y-3">
        <SkeletonPulse className="h-6 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonPulse key={i} className="h-12" />
        ))}
      </div>
    </div>
  )
}
