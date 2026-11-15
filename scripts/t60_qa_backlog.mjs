/* Task 60 QA — backlog trio: light-mode fixes · email OTP upgrade · guest checkout switch.
   API/dist layer here; browser E2E (hero colors, segmented OTP boxes, drawer
   notice) runs separately via agent-browser. Regression suites (51/52/48/58/59/42)
   must stay green — they guard the untouched behavior. */
import { readFileSync } from 'fs';
const BASE = 'http://127.0.0.1:5000';
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { PASS++; console.log('  ✓ ' + name + (extra ? ' — ' + extra : '')); }
  else { FAIL++; console.log('  ✗ FAIL: ' + name + (extra ? ' — ' + extra : '')); }
};
const j = async (path, opts = {}) => {
  const r = await fetch(BASE + path, opts);
  let body = null;
  try { body = await r.json(); } catch { /* empty */ }
  return { status: r.status, body };
};
const hasBn = (s) => typeof s === 'string' && /[\u0980-\u09FF]/.test(s);

console.log('— 1. LIGHT-MODE FIX (built dist carries the hero overrides) —');
{
  const cssFile = (readFileSync('/home/z/my-project/frontend/dist/index.html', 'utf8').match(/assets\/index-[\w-]+\.css/) || [])[0];
  const cssText = readFileSync('/home/z/my-project/frontend/dist/' + cssFile, 'utf8');
  ok('dist CSS has html.light .hero-title override', cssText.includes('html.light .hero-title'));
  ok('dist CSS has hero btn-ghost light override', cssText.includes('html.light #hero .btn-ghost'));
  ok('dist CSS pins outline stroke on hero', cssText.includes('html.light #hero .text-outline'));
  ok('dark tokens untouched (txt stays 244)', cssText.includes('--c-txt-rgb: 244 244 242'));
}

console.log('— 2. EMAIL OTP UPGRADE — bn line in the mail + attemptsLeft surfaced —');
{
  const stamp = Date.now();
  const em = 'qa60_' + stamp + '@forged.test';
  const r = await j('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'QA Sixty', email: em, password: 'forge60x', phone: '017' + String(stamp).slice(-8) }) });
  ok('register → 201 + retryAfter', r.status === 201 && (r.body.retryAfter || r.body.devOtp), 'status ' + r.status);
  const regDev = r.body && r.body.devOtp;
  ok('register hands out devOtp (dry-run)', /^\d{6}$/.test(String(regDev || '')));

  /* dry-run mail log — the OTP email must now carry the Bengali helper line */
  const { readFileSync: rf } = await import('fs');
  let last = '';
  try {
    const lines = rf('/home/z/my-project/backend/logs/emails.jsonl', 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const rec = JSON.parse(lines[i]);
      if (rec.to === em && /verification code/i.test(rec.subject || '')) { last = rec.html || ''; break; }
    }
  } catch (_e) { /* no log yet */ }
  ok('OTP email logged (dry-run)', last.length > 100);
  ok('OTP email carries Bengali line', hasBn(last) && last.includes('ভেরিফিকেশন বক্সে'));
  ok('OTP email keeps English validity note', last.includes('works exactly once'));

  /* wrong code → 400 with attemptsLeft */
  const v = await j('/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, code: '000000' }) });
  ok('wrong code → 400', v.status === 400, 'got ' + v.status);
  ok('attemptsLeft exposed for the UI', v.body && typeof v.body.attemptsLeft === 'number', 'left=' + (v.body && v.body.attemptsLeft));

  /* unverified login routes to verification (403 needsVerification) — the fresh
     code it auto-sends is suppressed by the register cooldown, so no devOtp here */
  const r2 = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: em, password: 'forge60x' }) });
  ok('unverified login → 403 needsVerification', r2.status === 403 && r2.body && r2.body.needsVerification === true, 'status ' + r2.status);
  const v2 = await j('/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, code: regDev }) });
  ok('verify with register devOtp → token', v2.status === 200 && v2.body && v2.body.token);
}

console.log('— 3. GUEST CHECKOUT SWITCH — drawer notice data source —');
{
  const p = await j('/api/settings/payment');
  ok('public /settings/payment exposes checkout.guestEnabled', p.body && p.body.checkout && typeof p.body.checkout.guestEnabled === 'boolean');
  const at = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'admin@forged.fit', password: 'ForgeAdmin2026' }) });
  const tok = at.body && at.body.token;
  const off = await j('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ checkout: { guestEnabled: false } }) });
  ok('admin can flip the switch off', off.body && off.body.setting && off.body.setting.checkout && off.body.setting.checkout.guestEnabled === false);
  const pubOff = await j('/api/settings/payment');
  ok('storefront sees guestEnabled=false (drawer + gate data)', pubOff.body.checkout.guestEnabled === false);
  await j('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ checkout: { guestEnabled: true } }) });
  const pubOn = await j('/api/settings/payment');
  ok('switch restored to ON', pubOn.body.checkout.guestEnabled === true);
  /* the QA user from step 2 stays registered — cleanup not possible via public API */
}

console.log(`Task 60 QA: ${PASS} PASS · ${FAIL} FAIL`);
process.exit(FAIL ? 1 : 0);
