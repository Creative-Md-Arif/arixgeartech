import { useUI } from '../store/ui.jsx';

export default function Toasts() {
  const { toasts } = useUI();
  return (
    <div id="toasts" className="fixed bottom-5 right-5 z-[2000] flex w-[min(360px,90vw)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="animate-slideUp border-l-2 border-acc bg-panel2 p-4 shadow-2xl shadow-black">
          <p className="font-head text-[.85rem] font-bold uppercase tracking-[.1em] text-txt">{t.title}</p>
          {t.sub ? <p className="mt-0.5 font-cond text-[.8rem] tracking-[.04em] text-muted">{t.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}
