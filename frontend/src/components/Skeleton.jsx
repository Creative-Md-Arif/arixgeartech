/* ArixGear skeleton loaders — Task 47 polish.
   Pulse-placeholder twins of the real card shapes: shown while the catalog's
   first fetch is in flight so shop/home don't pop in with a jarring layout
   jump. Pure presentation — zero logic. */
export function CardSkeleton() {
  return (
    <article className="card skeleton-card bg-panel border border-line" aria-hidden="true">
      <div className="aspect-square w-full animate-pulse bg-line/60" />
      <div className="flex h-[168px] flex-col p-4">
        <div className="h-3 w-1/3 animate-pulse bg-line/60" />
        <div className="mt-1 h-10 animate-pulse bg-transparent">
          <div className="h-3.5 w-4/5 animate-pulse bg-line/70" />
          <div className="mt-1.5 h-3.5 w-3/5 animate-pulse bg-line/70" />
        </div>
        <div className="mt-2 flex h-6 items-center gap-1.5 overflow-hidden">
          <div className="h-4 w-10 animate-pulse bg-line/50" />
          <div className="h-4 w-12 animate-pulse bg-line/50" />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <div className="h-4 w-2/5 animate-pulse bg-line/60" />
          <div className="h-3 w-2/5 animate-pulse bg-line/50" />
        </div>
      </div>
    </article>
  );
}

export function GridSkeleton({ n = 9, cls = 'grid grid-cols-2 gap-[1.1rem] md:grid-cols-3 lg:grid-cols-4' }) {
  return (
    <div className={cls} data-testid="gridSkeleton">
      {Array.from({ length: n }, (_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}
