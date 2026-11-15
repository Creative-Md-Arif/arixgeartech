export default function Pagination({ page = 1, pages = 1, total = 0, onPageChange, loading = false }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-3" aria-label="Pagination">
      <button type="button" className="rounded-lg border border-line2 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc disabled:cursor-not-allowed disabled:opacity-40" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>← Previous</button>
      <span className="text-[12px] text-dim2">Page {page} of {pages} · {total} total</span>
      <button type="button" className="rounded-lg border border-line2 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc disabled:cursor-not-allowed disabled:opacity-40" disabled={loading || page >= pages} onClick={() => onPageChange(page + 1)}>Next →</button>
    </div>
  );
}
