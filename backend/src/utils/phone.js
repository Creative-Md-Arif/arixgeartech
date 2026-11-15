/* Phase 4 (4.5) — unified BD phone utilities. One regex, one normalizer —
   orderController / authController / adminController / serviceController all
   validate the same way (01[3-9] + 8 digits; 880/+880 prefixes normalized). */

const BD_PHONE_RE = /^01[3-9]\d{8}$/;

/** "01712-345678" | "+8801712345678" | "8801712345678" → "01712345678" | null */
function validBDPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const local = digits.replace(/^880/, '0').slice(-11);
  return BD_PHONE_RE.test(local) ? local : null;
}

/** non-throwing normalizer for storage/display — returns trimmed input if invalid */
function normalizeBDPhone(raw) {
  return validBDPhone(raw) || String(raw || '').trim();
}

/** masked display — 01712****78 */
function maskBDPhone(raw) {
  const p = validBDPhone(raw) || String(raw || '').replace(/\D/g, '');
  return p.length === 11 ? `${p.slice(0, 5)}****${p.slice(-2)}` : p;
}

module.exports = { validBDPhone, normalizeBDPhone, maskBDPhone, BD_PHONE_RE };
