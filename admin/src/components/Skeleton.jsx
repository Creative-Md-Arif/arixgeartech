/* Task 56-b — ArixGear ADMIN skeleton loaders.
   Pulse placeholders shaped like the real panels so data fetches never
   pop in with a jarring layout jump. Pure presentation — zero logic. */

const bar = 'animate-pulse rounded bg-line/60';

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div data-testid="tableSkeleton" className="w-full" aria-hidden="true">
      <div className="flex gap-3 border-b border-line2 px-3 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <div key={i} className={`${bar} h-2.5 flex-1`} style={{ maxWidth: i === 0 ? '22%' : undefined }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-3 border-b border-line px-3 py-3.5 last:border-b-0">
          <div className={`${bar} h-3 w-[22%]`} />
          {Array.from({ length: cols - 1 }, (_, c) => (
            <div key={c} className={`${bar} h-3 flex-1 ${r % 2 ? 'opacity-60' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ n = 5 }) {
  return (
    <div data-testid="cardsSkeleton" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rounded-xl border border-line bg-panel p-5">
          <div className={`${bar} h-2.5 w-1/2`} />
          <div className={`mt-3 ${bar} h-8 w-2/3`} />
          <div className={`mt-2 ${bar} h-2.5 w-1/3 opacity-60`} />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ h = 160, className = '' }) {
  return <div data-testid="panelSkeleton" aria-hidden="true" className={`animate-pulse rounded-[10px] border border-line bg-panel ${className}`} style={{ height: h }} />;
}
