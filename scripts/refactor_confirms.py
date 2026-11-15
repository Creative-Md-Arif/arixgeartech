#!/usr/bin/env python3
"""Phase 5 (5.1) — replace every window.confirm/window.prompt in admin pages
with the modal-based useConfirm()/usePrompt() kit (components/ui.jsx).
Mechanical, assertion-guarded per file — run once, idempotence not a goal."""
import re, sys, pathlib

ROOT = pathlib.Path('/home/z/my-project/arixgear/admin/src/pages')
ok, fail = [], []

def patch(fname, edits, hooks):
    p = ROOT / fname
    t = p.read_text()
    for old, new in edits:
        if old not in t:
            fail.append(f'{fname}: MISSING ANCHOR: {old[:70]!r}')
            return
        t = t.replace(old, new, 1)
    # hook insertions: (anchor_line, hook_line)
    for anchor, hook in hooks:
        if hook in t:
            continue  # already inserted
        if anchor not in t:
            fail.append(f'{fname}: MISSING HOOK ANCHOR: {anchor!r}')
            return
        t = t.replace(anchor, anchor + '\n' + hook, 1)
    p.write_text(t)
    ok.append(fname)

# ── team.jsx ──
patch('team.jsx', [
    ("import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';",
     "import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';\nimport { useConfirm } from '../components/ui.jsx';"),
    ("if (!window.confirm(`Remove ${s.name} (${s.email})? Their login stops working immediately.`)) return;",
     "if (!(await confirm({ title: 'Remove staff account', body: `Remove ${s.name} (${s.email})? Their login stops working immediately.`, danger: true, ok: 'Remove' }))) return;"),
], [("  const toast = useToast();\n", "  const confirm = useConfirm();")])

# ── reviews.jsx ──
patch('reviews.jsx', [
    ("if (!window.confirm('Delete this review permanently?')) return;",
     "if (!(await confirm({ title: 'Delete review', body: 'Delete this review permanently? Rating averages recalculate immediately.', danger: true, ok: 'Delete' }))) return;"),
    ("if (action === 'delete' && !window.confirm('Delete ' + selIds.length + ' review(s) permanently?')) return;",
     "if (action === 'delete' && !(await confirm({ title: 'Bulk delete', body: 'Delete ' + selIds.length + ' review(s) permanently?', danger: true, ok: 'Delete' }))) return;"),
], [("  const toast = useToast();\n  const [q, setQ]", "  const confirm = useConfirm();\n  const toast = useToast();\n  const [q, setQ]")])

# ── returns.jsx (confirm + 3 prompts) ──
patch('returns.jsx', [
    ("import { OverlayProvider, useToast } from '../components/Overlays.jsx';",
     "import { OverlayProvider, useToast } from '../components/Overlays.jsx';\nimport { useConfirm, usePrompt } from '../components/ui.jsx';"),
    ("    if (status === 'rejected') {\n      note = window.prompt(tr('Rejection note (sent to the customer):')) || '';\n      if (!note) return;",
     "    if (status === 'rejected') {\n      note = await ask({ title: 'Reject return', label: 'Rejection note (sent to the customer):', required: true, multiline: true, ok: 'Reject' });\n      if (!note) return;"),
    ("      const raw = window.prompt(tr('Refund amount (BDT) for {num}:', { num: r.orderNumber }), String(Math.round(suggested * 100) / 100));\n      if (raw === null) return;\n      refundAmount = Math.max(0, Number(raw) || 0);\n      note = window.prompt(tr('Refund note (optional):')) || '';",
     "      const raw = await ask({ title: 'Refund ' + r.orderNumber, label: 'Refund amount (BDT):', initial: String(Math.round(suggested * 100) / 100), ok: 'Next' });\n      if (raw === null) return;\n      refundAmount = Math.max(0, Number(raw) || 0);\n      note = await ask({ title: 'Refund note', label: 'Refund note (optional):', multiline: true, ok: 'Refund' }) || '';"),
], [("  const toast = useToast();\n", "  const confirm = useConfirm();\n  const ask = usePrompt();\n  const toast = useToast();\n")])

# ── questions.jsx ──
patch('questions.jsx', [
    ("if (!window.confirm('Pull this answer back to the unanswered queue? It disappears from the product page.')) return;",
     "if (!(await confirm({ title: 'Withdraw answer', body: 'Pull this answer back to the unanswered queue? It disappears from the product page.', ok: 'Withdraw' }))) return;"),
    ("if (!window.confirm('Delete this question permanently?')) return;",
     "if (!(await confirm({ title: 'Delete question', body: 'Delete this question permanently?', danger: true, ok: 'Delete' }))) return;"),
    ("if (!window.confirm(`Delete ${ids.length} selected question(s) permanently?`)) return;",
     "if (!(await confirm({ title: 'Bulk delete', body: `Delete ${ids.length} selected question(s) permanently?`, danger: true, ok: 'Delete' }))) return;"),
], [("  const toast = useToast();\n", "  const confirm = useConfirm();\n  const toast = useToast();\n")])

# ── products.jsx (2 components) ──
patch('products.jsx', [
    ("import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';",
     "import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';\nimport { useConfirm } from '../components/ui.jsx';"),
    ("if (!window.confirm('Delete \"' + p.name + '\" permanently?')) return;",
     "if (!(await confirm({ title: 'Delete product', body: 'Delete \"' + p.name + '\" permanently? Images are removed too.', danger: true, ok: 'Delete' }))) return;"),
    ("if (action === 'delete' && !window.confirm('Delete ' + sel.size + ' selected product(s) PERMANENTLY? Images are removed too.')) return;",
     "if (action === 'delete' && !(await confirm({ title: 'Bulk delete products', body: 'Delete ' + sel.size + ' selected product(s) PERMANENTLY? Images are removed too.', danger: true, ok: 'Delete all' }))) return;"),
], [
    ("function ProductForm({ p, onDone }) {\n  const toast = useToast();", "function ProductForm({ p, onDone }) {\n  const confirm = useConfirm();\n  const toast = useToast();"),
    ("function ProductsPage() {\n  const toast = useToast();", "function ProductsPage() {\n  const confirm = useConfirm();\n  const toast = useToast();"),
])

# ── order-detail.jsx (3 confirms + 2 prompts) ──
patch('order-detail.jsx', [
    ("if (!window.confirm(tr('Verify {method} payment of {amt} for {num}?\\n\\nOnly click after checking your merchant statement!', { method: o.payment.method.toUpperCase(), amt: money(o.payment.expectedAmount), num: o.orderNumber }))) return;",
     "if (!(await confirm({ title: 'Verify payment', body: tr('Verify {method} payment of {amt} for {num}?\\n\\nOnly click after checking your merchant statement!', { method: o.payment.method.toUpperCase(), amt: money(o.payment.expectedAmount), num: o.orderNumber }), ok: 'Verify' }))) return;"),
    ("const reason = window.prompt(tr('Rejection reason (sent to customer):\\ne.g. \"TrxID not found in bKash statement\"'));\n    if (reason === null) return;",
     "const reason = await ask({ title: 'Reject payment', label: tr('Rejection reason (sent to customer):\\ne.g. \"TrxID not found in bKash statement\"'), required: true, multiline: true, ok: 'Reject' });\n    if (reason === null) return;"),
    ("const note = window.prompt(tr('Note for status \"{status}\" (optional):', { status })) || '';",
     "const note = (await ask({ title: 'Status → ' + status, label: tr('Note for \"{status}\" (optional):', { status }), multiline: true, ok: 'Apply' })) || '';"),
    ("if (!window.confirm(tr('Push {num} to the configured courier?\\n\\nCOD amount {amt} · {phone}', { num: o.orderNumber, amt: money(o.totals.grandTotal), phone: o.customer.phone }))) return;",
     "if (!(await confirm({ title: 'Courier dispatch', body: tr('Push {num} to the configured courier?\\n\\nCOD amount {amt} · {phone}', { num: o.orderNumber, amt: money(o.totals.grandTotal), phone: o.customer.phone }), ok: 'Push' }))) return;"),
    ("if (!window.confirm(tr('Delete order {num}?\\n\\n{cust} · {amt}\\nStock will be restored. This cannot be undone.', { num: o.orderNumber, cust: o.customer.name, amt: money(o.totals.grandTotal) }))) return;",
     "if (!(await confirm({ title: 'Delete order', body: tr('Delete order {num}?\\n\\n{cust} · {amt}\\nStock will be restored. This cannot be undone.', { num: o.orderNumber, cust: o.customer.name, amt: money(o.totals.grandTotal) }), danger: true, ok: 'Delete' }))) return;"),
], [("  const toast = useToast();\n", "  const confirm = useConfirm();\n  const ask = usePrompt();\n  const toast = useToast();\n")])

# ── homepage.jsx ──
patch('homepage.jsx', [
    ("if (!window.confirm('Delete this homepage section?')) return;",
     "if (!(await confirm({ title: 'Delete section', body: 'Delete this homepage section? The storefront slot goes empty until re-added.', danger: true, ok: 'Delete' }))) return;"),
], [("  const toast = useToast();\n", "  const confirm = useConfirm();\n  const toast = useToast();\n")])

# ── blog.jsx ──
patch('blog.jsx', [
    ("if (!window.confirm(`Delete \"${p.title}\"? This cannot be undone.`)) return;",
     "if (!(await confirm({ title: 'Delete post', body: `Delete \"${p.title}\"? This cannot be undone.`, danger: true, ok: 'Delete' }))) return;"),
], [("  const toast = useToast();\n", "  const confirm = useConfirm();\n  const toast = useToast();\n")])

# ── orders.jsx ──
patch('orders.jsx', [
    ("if (!window.confirm(tr('Delete {kind} {num}?\\n\\n{cust} · {amt}\\nStock will be restored. This cannot be undone.', { kind, num: o.orderNumber, cust: o.customer?.name, amt: o.totals?.grandTotal ? money(o.totals.grandTotal) : '' }))) return;",
     "if (!(await confirm({ title: 'Delete order', body: tr('Delete {kind} {num}?\\n\\n{cust} · {amt}\\nStock will be restored. This cannot be undone.', { kind, num: o.orderNumber, cust: o.customer?.name, amt: o.totals?.grandTotal ? money(o.totals.grandTotal) : '' }), danger: true, ok: 'Delete' }))) return;"),
], [("  const toast = useToast();\n", "  const confirm = useConfirm();\n  const toast = useToast();\n")])

# ── coupons.jsx ──
patch('coupons.jsx', [
    ("if (!window.confirm('Delete coupon ' + c.code + '?')) return;",
     "if (!(await confirm({ title: 'Delete coupon', body: 'Delete coupon ' + c.code + '? Orders already using it keep their discount.', danger: true, ok: 'Delete' }))) return;"),
], [("  const toast = useToast();\n", "  const confirm = useConfirm();\n  const toast = useToast();\n")])

# ── messages.jsx ──
patch('messages.jsx', [
    ("if (!window.confirm('Delete this message permanently?')) return;",
     "if (!(await confirm({ title: 'Delete message', body: 'Delete this message permanently?', danger: true, ok: 'Delete' }))) return;"),
], [("  const toast = useToast();\n", "  const confirm = useConfirm();\n  const toast = useToast();\n")])

# ── catalog.jsx ──
patch('catalog.jsx', [
    ("if (!window.confirm(tr('Delete category \"{name}\"? Products keep their category label but lose the chip filter.', { name: c.name }))) return;",
     "if (!(await confirm({ title: 'Delete category', body: tr('Delete category \"{name}\"? Products keep their category label but lose the chip filter.', { name: c.name }), danger: true, ok: 'Delete' }))) return;"),
], [("  const toast = useToast();\n", "  const confirm = useConfirm();\n  const toast = useToast();\n")])

# ── banners.jsx ──
patch('banners.jsx', [
    ("if (!window.confirm('Delete this banner?')) return;",
     "if (!(await confirm({ title: 'Delete banner', body: 'Delete this banner? Its slot rotates to the next one.', danger: true, ok: 'Delete' }))) return;"),
], [("function BannersPage() {\n  const toast = useToast();", "function BannersPage() {\n  const confirm = useConfirm();\n  const toast = useToast();")])

print('OK :', ', '.join(ok))
print('FAIL:', fail if fail else 'none')
sys.exit(1 if fail else 0)
