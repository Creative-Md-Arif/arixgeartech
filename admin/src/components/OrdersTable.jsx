/* ArixGear ADMIN — shared orders table + chip kit (React port of admin.js ordersTable/chips)
   Used by dashboard + orders pages. Props: { items, onOpen } */
import { money, dt, stChipCls, payChipCls } from '../lib/admin.js';
import { navTo } from '../lib/nav.js';
import { tr, useLang } from '../lib/i18n.jsx';

/* chip base — legacy .chip */
export const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide whitespace-nowrap';

/* method chips — legacy .pm-* palette (no pmChipCls in lib → local map) */
const PM_CHIP = {
  bkash: 'text-red border-red/40 bg-red/10',
  nagad: 'text-red border-red/60 bg-red/15',
  rocket: 'text-purple border-purple/40 bg-purple/10',
  cod: 'text-yellow border-yellow/40 bg-yellow/10',
};

export const StChip = ({ s }) => (
  <span className={CHIP + ' ' + (stChipCls(s) || '')}>{String(s || '')}</span>
);

export const PmChip = ({ m }) => (
  <span className={CHIP + ' ' + (PM_CHIP[m] || 'text-dim border-line2 bg-white/5')}>
    {m === 'cod' ? 'COD' : String(m || '')}
  </span>
);

export const PayChip = ({ p }) => {
  /* legacy also has pay-cod-pending (blue) / pay-cod-collected (green) — lib PAY_CHIP lacks them */
  const cls = p === 'cod-pending' ? 'text-blue border-blue/40 bg-blue/10'
    : p === 'cod-collected' ? 'text-green border-green/40 bg-green/10'
    : payChipCls(p);
  return <span className={CHIP + ' ' + cls}>{String(p || '')}</span>;
};

export const GuestChip = ({ label = 'GUEST' }) => (
  <span className={CHIP + ' !text-[9.5px] text-dim border-line2'}>{label}</span>
);

/* manual order chip — WhatsApp / phone entries (orange, matches brand accent) */
export const ManualChip = ({ channel }) => (
  <span className={CHIP + ' !text-[9.5px] text-acc border-acc/50 bg-acc/10'} title={channel ? 'Manual entry — received via ' + channel : 'Manual entry'}>
    MANUAL{channel ? ' · ' + channel : ''}
  </span>
);

/* order rows navigate to the dedicated detail page (/orders/:id) */
export const openOrder = (id) => { navTo('/orders/' + encodeURIComponent(id)); };

/* row action buttons (✎ edit manual / 🗑 delete) — only rendered when handlers are passed */
const RowAct = ({ label, title, cls, onClick }) => (
  <button
    type="button"
    title={title}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={'rounded-md border px-1.5 py-0.5 text-[11px] leading-none transition-colors ' + cls}
  >{label}</button>
);

const TH = 'px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.14em] text-dim border-b border-line2 whitespace-nowrap';
const TD = 'px-3 py-2.5 align-middle';
const SUB = 'mt-0.5 block text-[11px] text-dim2';

export default function OrdersTable({ items = [], onOpen = openOrder, onEdit, onDelete }) {
  const { t } = useLang();   /* subscribe → re-render on BN/EN toggle */
  return (
    <div className="tbl-wrap overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={TH}>{tr('Order')}</th>
            <th className={TH}>{tr('Customer')}</th>
            <th className={TH}>{tr('Items')}</th>
            <th className={TH}>{tr('Total')}</th>
            <th className={TH}>{tr('Method')}</th>
            <th className={TH}>{tr('Payment')}</th>
            <th className={TH}>{tr('Status')}</th>
            <th className={TH}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <tr
              key={o._id}
              data-oid={o._id}
              onClick={() => onOpen && onOpen(o._id)}
              className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-panel2"
            >
              <td className={TD}>
                <b>{o.orderNumber}</b>
                <span className={SUB}>{dt(o.createdAt)}</span>
              </td>
              <td className={TD}>
                <span>{o.customer?.name}</span>{' '}
                {o.source === 'manual' ? <ManualChip channel={o.channel} /> : null}
                {o.isGuest && o.source !== 'manual' ? <GuestChip /> : null}
                <span className={SUB}>{o.customer?.phone}</span>
              </td>
              <td className={TD}>{(o.items || []).reduce((a, i) => a + (i.qty || 0), 0)} {tr('pcs')}</td>
              <td className={TD + ' font-cond text-[15.5px] font-bold tracking-[.03em]'}>{money(o.totals?.grandTotal)}</td>
              <td className={TD}><PmChip m={o.payment?.method} /></td>
              <td className={TD}>
                <PayChip p={o.payment?.status} />
                {o.payment?.trxId ? <span className={SUB + ' font-mono'}>{o.payment.trxId}</span> : null}
              </td>
              <td className={TD}><StChip s={o.status} /></td>
              <td className={TD + ' text-dim2'}>
                <span className="flex items-center justify-end gap-1.5">
                  {onEdit && o.source === 'manual' && o.status !== 'delivered' ? (
                    <RowAct label="✎" title={tr('Edit manual order (correct entry)')} cls="border-line2 text-dim hover:border-acc hover:text-acc" onClick={() => onEdit(o)} />
                  ) : null}
                  {onDelete && o.status !== 'delivered' ? (
                    <RowAct label="🗑" title={tr('Delete order (stock restored)')} cls="border-line2 text-dim hover:border-red hover:text-red" onClick={() => onDelete(o)} />
                  ) : null}
                  <span>→</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
