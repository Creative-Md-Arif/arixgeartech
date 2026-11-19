import { useEffect, useState } from 'react';
import { listAddresses, addAddress, updateAddress, deleteAddress } from '../services/auth.js';
import { DIV_LABELS } from '../lib/format.js';
import { useUI } from '../store/ui.jsx';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { AcctShell, Gate, ErrStrip, OkStrip, inputCls, btnPrimary, labelCls, miniBtn } from '../components/accountKit.jsx';

const BLANK = { label: 'Home', line: '', city: '', division: 'dhaka', postal: '', isDefault: false };

export default function Page() {
  useSEO('account-addresses', { title: 'Addresses — arixgear.tech', robots: 'noindex,follow' });
  const { t } = useLang();
  const { toast } = useUI();

  const [list, setList] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [editIdx, setEditIdx] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    listAddresses()
      .then((d) => setList(d.addresses || []))
      .catch(() => setList([]));
  };
  useEffect(load, []);

  const startEdit = (idx) => {
    const a = list[idx];
    setForm({ label: a.label || 'Home', line: a.line || '', city: a.city || '', division: a.division || 'dhaka', postal: a.postal || '', isDefault: !!a.isDefault });
    setEditIdx(idx);
    setErr(''); setOk('');
    window.scrollTo({ top: 200, behavior: 'smooth' });
  };

  const reset = () => { setForm(BLANK); setEditIdx(null); setErr(''); setOk(''); };

  const submit = (e) => {
    e.preventDefault();
    setErr(''); setOk('');
    if (!form.line.trim()) { setErr(t('Address line is required.')); return; }
    setBusy(true);
    const body = { ...form, line: form.line.trim() };
    const call = editIdx === null ? addAddress(body) : updateAddress(editIdx, body);
    call
      .then((d) => {
        setList(d.addresses || []);
        setOk(editIdx === null ? t('Address added.') : t('Address updated.'));
        toast(editIdx === null ? t('Address added') : t('Address updated'), t('Checkout pre-fills the default row.'));
        reset();
      })
      .catch((e2) => setErr(e2.message || t('Could not save — try again.')))
      .finally(() => setBusy(false));
  };

  const remove = (idx) => {
    setErr(''); setOk('');
    deleteAddress(idx)
      .then((d) => { setList(d.addresses || []); toast(t('Address removed'), t('The default falls back to the first remaining row.')); })
      .catch((e2) => setErr(e2.message || t('Could not delete — try again.')));
  };

  const makeDefault = (idx) => {
    setErr(''); setOk('');
    updateAddress(idx, { isDefault: true })
      .then((d) => setList(d.addresses || []))
      .catch((e2) => setErr(e2.message || t('Could not update — try again.')));
  };

  return (
    <Gate title="Addresses">
      <AcctShell active="/account/addresses" title={t('Addresses')} lede={t('The delivery book — checkout pre-fills the default row and courier calls land on the phone in it.')}>
        <div className="grid gap-6 lg:grid-cols-[1fr_.9fr]">

          <div id="addrList">
            {list === null ? (
              <div className="h-40 animate-pulse border border-line bg-panel" />
            ) : list.length === 0 ? (
              <div className="border border-dashed border-line2 px-6 py-12 text-center text-muted">
                <h3 className="mb-2 font-disp text-[1.5rem] uppercase text-txt">{t('No saved addresses')}</h3>
                <p>{t('Add one — it rides into checkout automatically.')}</p>
              </div>
            ) : (
              list.map((a, i) => (
                <div key={i} className="mb-3.5 border border-line bg-panel px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="font-cond text-[.78rem] font-semibold uppercase tracking-[.26em] text-acc">{a.label || 'Home'}</span>
                    {a.isDefault ? (
                      <span className="border border-ok/40 px-2 py-0.5 font-cond text-[.68rem] uppercase tracking-[.2em] text-ok">{t('Default')}</span>
                    ) : null}
                    <span className="ml-auto flex gap-2">
                      {!a.isDefault ? <button className={miniBtn} onClick={() => makeDefault(i)}>{t('Make default')}</button> : null}
                      <button className={miniBtn} onClick={() => startEdit(i)}>{t('Edit')}</button>
                      <button
                        className="border border-red/40 px-4 py-2.5 font-cond font-semibold uppercase tracking-[.16em] text-[.72rem] text-red transition-colors hover:bg-red/10"
                        onClick={() => remove(i)}
                      >
                        {t('Delete')}
                      </button>
                    </span>
                  </div>
                  <p className="mt-2 text-[.9rem] leading-relaxed text-txt">{a.line}</p>
                  <p className="mt-0.5 text-[.8rem] text-muted">
                    {[a.city, DIV_LABELS[a.division] || a.division, a.postal].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ))
            )}
          </div>

          <form id="addrForm" noValidate onSubmit={submit} className="h-fit border border-line bg-panel p-6">
            <p className="mb-5 font-cond text-[.82rem] font-semibold uppercase tracking-[.3em] text-acc">
              {editIdx === null ? t('Add address') : t('Edit address')}
            </p>
            <ErrStrip>{err}</ErrStrip>
            <OkStrip>{ok}</OkStrip>
            <div className="mb-4">
              <label className={labelCls} htmlFor="adLabel">{t('LABEL')}</label>
              <input id="adLabel" type="text" placeholder={t('Home · Office · Village')} className={inputCls} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
            <div className="mb-4">
              <label className={labelCls} htmlFor="adLine">{t('ADDRESS LINE')}</label>
              <input id="adLine" type="text" placeholder={t('House 42, Road 11, Banani')} className={inputCls} value={form.line} onChange={(e) => setForm((f) => ({ ...f, line: e.target.value }))} />
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="adCity">{t('CITY / AREA')}</label>
                <input id="adCity" type="text" placeholder="Dhaka" className={inputCls} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="adPostal">{t('POSTCODE')}</label>
                <input id="adPostal" type="text" placeholder="1213" className={inputCls} value={form.postal} onChange={(e) => setForm((f) => ({ ...f, postal: e.target.value }))} />
              </div>
            </div>
            <div className="mb-5">
              <label className={labelCls} htmlFor="adDiv">{t('DIVISION')}</label>
              <select id="adDiv" className={inputCls} value={form.division} onChange={(e) => setForm((f) => ({ ...f, division: e.target.value }))}>
                {Object.entries(DIV_LABELS).map(([k, lab]) => <option key={k} value={k} className="bg-bg2">{lab}</option>)}
              </select>
            </div>
            <label className="mb-6 flex cursor-pointer items-center gap-3 text-[.85rem] text-muted">
              <input id="adDefault" type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} className="h-4 w-4 accent-[var(--acc,#f0c34e)]" />
              {t('Make this the default delivery address')}
            </label>
            <div className="flex flex-wrap gap-3">
              <button id="adSave" type="submit" disabled={busy} className={btnPrimary}>{busy ? t('Saving…') : editIdx === null ? t('Add address') : t('Save changes')}</button>
              {editIdx !== null ? <button type="button" onClick={reset} className={miniBtn}>{t('Cancel edit')}</button> : null}
            </div>
          </form>
        </div>
      </AcctShell>
    </Gate>
  );
}
