function Skeleton({ className = '' }: Readonly<{ className?: string }>) {
  return <span aria-hidden="true" className={`skeleton block ${className}`} />;
}

export function PageSkeleton({ rows = 5 }: Readonly<{ rows?: number }>) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3 p-4 md:p-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map(item => <Skeleton key={item} className="h-24 rounded-lg" />)}
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="surface-card flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 flex-none rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/2 rounded" />
            <Skeleton className="h-2.5 w-3/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}