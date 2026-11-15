import { useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { get, update } from '../services/quickServices.js';

const CARD = 'rounded-xl border border-line bg-panel p-5';
const BTN = 'rounded-lg bg-acc px-4 py-2 text-[12px] font-bold uppercase tracking-[.08em] text-white hover:bg-acc-hi disabled:opacity-50';
const GHOST = 'rounded-lg border border-line2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const RED = 'rounded-lg border border-red/40 bg-red/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.08em] text-red';

const blankCard = () => ({ key: '', icon: '', title: '', titleBn: '', description: '', descriptionBn: '', actionText: '', actionTextBn: '', action: 'none', href: '', active: true });

function QuickServicesPage() {
  const toast = useToast();
  const [section, setSection] = useState(null);
  const [cards, setCards] = useState([]);
  const [actions, setActions] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = () => get().then((data) => { setSection(data.section); setCards(data.cards || []); setActions(data.actions || []); }).catch((error) => toast(error.message, 'err'));
  useEffect(() => { load(); }, []);

  const patchCard = (index, patch) => setCards((list) => list.map((card, ix) => ix === index ? { ...card, ...patch } : card));
  const save = async () => {
    setBusy(true);
    try {
      await update({
        title: section?.title || '', subtitle: section?.subtitle || '',
        titleBn: section?.titleBn || '', subtitleBn: section?.subtitleBn || '',
        active: section?.active !== false, cards,
      });
      toast('Quick Services saved', 'ok');
      await load();
    } catch (error) { toast(error.message, 'err'); } finally { setBusy(false); }
  };

  if (!section) return <AdminShell active="quick-services" title="Quick Services"><div className={CARD}>Loading…</div></AdminShell>;

  return <AdminShell active="quick-services" title="Quick Services">
    <div className="w-full max-w-none space-y-4">
      <div className={CARD}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-[17px]">Homepage section</h2><p className="text-[12px] text-dim2">Manage the section heading and service cards. Changes are saved to HomeSection.</p></div>
          <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={section.active !== false} onChange={(e) => setSection((s) => ({ ...s, active: e.target.checked }))} /> Show section</label>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {['title', 'subtitle', 'titleBn', 'subtitleBn'].map((field) => <label key={field}><span className="mb-1 block text-[11px] font-bold uppercase tracking-[.1em] text-dim">{field}</span><input value={section[field] || ''} onChange={(e) => setSection((s) => ({ ...s, [field]: e.target.value }))} /></label>)}
        </div>
      </div>
      <div className="w-full overflow-x-auto rounded-xl border border-line bg-panel" data-testid="quickServicesTableWrap">
        <table className="w-full min-w-[1500px] border-collapse text-left text-[12px]" data-testid="quickServicesTable">
          <thead className="bg-panel2 text-[10.5px] uppercase tracking-[.12em] text-dim2"><tr>
            <th className="border-b border-line px-3 py-3 font-bold">#</th><th className="border-b border-line px-3 py-3 font-bold">Key / Icon</th><th className="border-b border-line px-3 py-3 font-bold">Title</th><th className="border-b border-line px-3 py-3 font-bold">Title (বাংলা)</th><th className="border-b border-line px-3 py-3 font-bold">Description</th><th className="border-b border-line px-3 py-3 font-bold">Button</th><th className="border-b border-line px-3 py-3 font-bold">Action</th><th className="border-b border-line px-3 py-3 font-bold">URL</th><th className="border-b border-line px-3 py-3 text-center font-bold">Show</th><th className="border-b border-line px-3 py-3 text-right font-bold">Manage</th>
          </tr></thead>
          <tbody>{cards.map((card, index) => {
            const hrefRequired = actions.find((action) => action.value === card.action)?.requiresHref;
            return <tr key={card.key || index} className="border-b border-line/70 align-top last:border-b-0 hover:bg-panel2/60">
              <td className="px-3 py-3 text-dim2">{index + 1}</td>
              <td className="w-[190px] px-3 py-3"><input className="mb-1 w-full" value={card.key || ''} onChange={(e) => patchCard(index, { key: e.target.value })} placeholder="unique-key" /><input className="w-full" value={card.icon || ''} onChange={(e) => patchCard(index, { icon: e.target.value })} placeholder="emoji or image URL" /></td>
              <td className="w-[190px] px-3 py-3"><input className="w-full" value={card.title || ''} onChange={(e) => patchCard(index, { title: e.target.value })} /><input className="mt-1 w-full text-[11px]" value={card.actionText || ''} onChange={(e) => patchCard(index, { actionText: e.target.value })} placeholder="button text" /></td>
              <td className="w-[190px] px-3 py-3"><input className="w-full" value={card.titleBn || ''} onChange={(e) => patchCard(index, { titleBn: e.target.value })} /><input className="mt-1 w-full text-[11px]" value={card.actionTextBn || ''} onChange={(e) => patchCard(index, { actionTextBn: e.target.value })} placeholder="button text (বাংলা)" /></td>
              <td className="w-[260px] px-3 py-3"><textarea rows={2} className="w-full" value={card.description || ''} onChange={(e) => patchCard(index, { description: e.target.value })} /><textarea rows={2} className="mt-1 w-full text-[11px]" value={card.descriptionBn || ''} onChange={(e) => patchCard(index, { descriptionBn: e.target.value })} placeholder="বাংলা description" /></td>
              <td className="w-[170px] px-3 py-3"><select className="w-full" value={card.action || 'none'} onChange={(e) => patchCard(index, { action: e.target.value })}>{actions.map((action) => <option key={action.value} value={action.value}>{action.label || action.value}</option>)}</select></td>
              <td className="w-[230px] px-3 py-3"><input className="w-full" disabled={!hrefRequired} value={card.href || ''} onChange={(e) => patchCard(index, { href: e.target.value })} placeholder={hrefRequired ? '/contact or https://…' : 'not required'} /></td>
              <td className="px-3 py-3 text-center"><input type="checkbox" checked={card.active !== false} onChange={(e) => patchCard(index, { active: e.target.checked })} /></td>
              <td className="whitespace-nowrap px-3 py-3 text-right"><div className="inline-flex gap-1.5"><button className={GHOST} disabled={index === 0} onClick={() => setCards((list) => { const next = [...list]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>↑</button><button className={GHOST} disabled={index === cards.length - 1} onClick={() => setCards((list) => { const next = [...list]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })}>↓</button><button className={RED} onClick={() => setCards((list) => list.filter((_, ix) => ix !== index))}>Remove</button></div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap justify-end gap-2"><button className={GHOST} onClick={() => setCards((list) => [...list, blankCard()])}>+ Add Card</button><button className={BTN} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Quick Services'}</button></div>
    </div>
  </AdminShell>;
}

export default function Page() { return <OverlayProvider><QuickServicesPage /></OverlayProvider>; }
