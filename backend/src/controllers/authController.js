const User = require('../models/User');
const Order = require('../models/Order');
const LoyaltyLog = require('../models/LoyaltyLog');
const crypto = require('crypto');
const { sendPasswordReset, sendEmailOtp } = require('../services/emailService');
const { referralCodeFor } = require('../services/notify');
const loyaltyEngine = require('../services/loyalty');
const auditTrail = require('../services/audit'); // Task 57 (security audit) — login events
const { SESSION_COOKIE } = require('../middleware/auth');

/* ── Step 4 (4.2) — HttpOnly session cookie helpers ─────────────────────
   The browser-facing flows (storefront + admin SPAs) authenticate through
   this cookie instead of persisting the JWT in localStorage. Cookie flags:
   HttpOnly (invisible to JS → XSS cannot exfiltrate the session),
   SameSite=Lax (cross-site POSTs don't carry it — CSRF layer #1; layer #2
   is the Origin check in server.js), Path=/, and Secure in production
   (opt-out via COOKIE_SECURE=false for http-only deployments). Max-Age
   mirrors the JWT TTL so the cookie never outlives its token. */
function jwtTtlSeconds() {
  const raw = String(process.env.JWT_EXPIRES || '7d').trim();
  const m = /^([0-9]+)([dhms])$/.exec(raw);
  if (!m) return 7 * 24 * 60 * 60;
  const unit = { d: 86400, h: 3600, m: 60, s: 1 }[m[2]];
  return parseInt(m[1], 10) * unit;
}

function setSessionCookie(res, token) {
  const parts = [
    SESSION_COOKIE + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + jwtTtlSeconds(),
  ];
  const secure = process.env.NODE_ENV === 'production' && String(process.env.COOKIE_SECURE || 'true') !== 'false';
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  const parts = [SESSION_COOKIE + '=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  const secure = process.env.NODE_ENV === 'production' && String(process.env.COOKIE_SECURE || 'true') !== 'false';
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
exports._setSessionCookie = setSessionCookie;
exports._clearSessionCookie = clearSessionCookie;

/* Task 28 — guest order → account linking (Layer 2 #8): on register AND on
   every login, guest orders whose checkout phone/email match the account are
   adopted, so order history survives the guest→account upgrade. Only orders
   with user:null (never claimed) are touched — idempotent by construction. */
async function linkGuestOrders(user) {
  try {
    if (!user) return 0;
    const or = [];
    const ph = String(user.phone || '').trim();
    const em = String(user.email || '').toLowerCase().trim();
    if (ph) or.push({ 'customer.phone': ph });
    if (em) or.push({ 'customer.email': em });
    if (!or.length) return 0;
    const r = await Order.updateMany(
      { user: null, isGuest: true, $or: or },
      { $set: { user: user._id, isGuest: false } }
    );
    return r.modifiedCount || 0;
  } catch (_e) { return 0; } /* linking must never break auth */
}

/* ── forgot-password helpers ─────────────────────────────────────────────── */
const RESET_TTL_MIN = 15;
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

/* opaque, single-use token — only its SHA-256 hash is stored */
async function issueResetToken(user, req) {
  const token = crypto.randomBytes(32).toString('hex');
  user.resetTokenHash = sha256(token);
  user.resetTokenExpires = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000);
  await user.save({ validateBeforeSave: false });
  /* storefront gets /reset-password, admin console gets /admin/reset-password */
  const base = `${req.protocol}://${req.get('host')}`;
  const path = user.role === 'admin' || user.role === 'subadmin' ? '/admin/reset-password' : '/reset-password';
  return { token, resetUrl: `${base}${path}?token=${token}` };
}

// POST /api/auth/forgot-password — { email }
/* Always 200 + generic copy (never leaks whether the account exists). Delivery:
   • RESEND_API_KEY set  → branded email sent (link never appears in responses)
   • otherwise DRY-RUN   → email logged to console + logs/emails.jsonl, and the
     link is mirrored back as `resetUrl` so the flow stays completable in
     development (set RESET_LINK_HIDE=true to suppress that).                  */
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) {
      return res.status(400).json({ message: 'A valid email is required' });
    }
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    const generic = {
      message: 'If an account exists for this email, a password reset link has been sent.',
      expiresIn: RESET_TTL_MIN,
    };
    const hideLink = String(process.env.RESET_LINK_HIDE || '') === 'true'
      || !!process.env.RESEND_API_KEY
      || process.env.NODE_ENV === 'production';
    if (!user) return res.json({ ...generic, ...(!hideLink ? { delivery: 'none' } : {}) });

    const { resetUrl } = await issueResetToken(user, req);
    const mail = await sendPasswordReset({
      to: user.email, name: user.name, resetUrl, minutes: RESET_TTL_MIN,
    });
    /* audit fix — production never mirrors the reset link into the response,
       even in dry-run mode (the link still lands in logs/emails.jsonl) */
    res.json({
      ...generic,
      ...(!hideLink ? {
        delivery: mail.sent ? 'email' : mail.dryRun ? 'dry-run' : 'failed',
        resetUrl,
      } : {}),
    });
  } catch (e) { next(e); }
};

// GET /api/auth/reset-password/verify?token=… — pre-flight check for reset pages
exports.verifyResetToken = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ valid: false, message: 'Reset token missing' });
    const user = await User.findOne({
      resetTokenHash: sha256(String(token)),
      resetTokenExpires: { $gt: new Date() },
    }).select('+resetTokenHash +resetTokenExpires');
    if (!user) return res.status(400).json({ valid: false, message: 'This reset link is invalid or has expired' });
    const [name] = user.email.split('@');
    const masked = name.slice(0, 2) + '•••@' + user.email.split('@')[1];
    res.json({ valid: true, email: masked });
  } catch (e) { next(e); }
};

// POST /api/auth/reset-password — { token, password }
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token) return res.status(400).json({ message: 'Reset token missing' });
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const user = await User.findOne({
      resetTokenHash: sha256(String(token)),
      resetTokenExpires: { $gt: new Date() },
    }).select('+password +resetTokenHash +resetTokenExpires');
    if (!user) return res.status(400).json({ message: 'This reset link is invalid or has expired — request a new one' });

    user.password = String(password);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.passwordChangedAt = new Date();
    await user.save();
    res.json({ message: 'Password updated — log in with your new password now.' });
  } catch (e) { next(e); }
};

/* shared with adminController (ERP-assisted customer reset) */
exports._issueResetToken = issueResetToken;
exports._linkGuestOrders = linkGuestOrders;

/* ════════ Task 51 — email verification (OTP) + email/phone login ════════
   Design rules (user-approved):
   • Register creates an UNVERIFIED customer and emails a 6-digit OTP
     (SHA-256 hash stored, 10-min TTL, single-use, 5 wrong attempts max).
   • Customers must verify before login → 403 { needsVerification }.
   • Staff/admin accounts are created pre-verified (internal, not self-serve).
   • Login accepts { identifier } = email OR BD phone (normalized).
   • Referral +50/+100 credits move from register-time to verify-time.
   • Guest checkout stays phone-based and is NEVER gated by verification.   */
const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_S = 60;

/* "01712-345678" / "+880 1712 345 678" / "8801712345678" → "01712345678" (or null) */
function normalizeBdPhone(raw) {
  let d = String(raw || '').replace(/[^\d]/g, '');
  if (d.startsWith('880') && d.length >= 12) d = '0' + d.slice(3);
  if (!d.startsWith('0') && d.length === 10) d = '0' + d;
  return /^01[3-9]\d{8}$/.test(d) ? d : null;
}

/* phone-ish input for the login identifier: digits/spaces/dashes, no @ */
function looksLikePhone(raw) {
  return !String(raw || '').includes('@') && /^[+\d][\d\s\-()]{5,}$/.test(String(raw || '').trim());
}

/* dev convenience — mirrors forgot-password policy: with a real RESEND_API_KEY
   (or RESET_LINK_HIDE=true) the code NEVER appears in API responses.
   Audit fix — additionally NEVER in production: a production deployment that
   has not configured an email provider yet must not fall back to leaking OTP
   codes (and reset links) through the HTTP response. */
function devOtpAllowed() {
  if (process.env.NODE_ENV === 'production') return false;
  return !process.env.RESEND_API_KEY && String(process.env.RESET_LINK_HIDE || '') !== 'true';
}

async function issueEmailOtp(user) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  user.emailOtpHash = sha256(code);
  user.emailOtpExpires = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
  user.emailOtpAttempts = 0;
  user.emailOtpSentAt = new Date();
  await user.save({ validateBeforeSave: false });
  return code;
}

/* Task 42 loyalty, Task 51 timing — award once, at verification */
async function awardDeferredReferral(user) {
  try {
    if (!user.loyalty || !user.loyalty.referredBy || user.loyalty.referralAwarded) return;
    user.loyalty.points = (user.loyalty.points || 0) + 50;
    user.loyalty.referralAwarded = true;
    await User.updateOne({ _id: user.loyalty.referredBy }, { $inc: { 'loyalty.points': 100 } });
  } catch (_e) { /* loyalty must never block verification */ }
}

// POST /api/auth/register — creates UNVERIFIED account + emails OTP (Task 51)
exports.register = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { name, email, phone, password } = body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
    const normPhone = phone !== undefined && phone !== '' && phone !== null ? normalizeBdPhone(phone) : null;
    if (phone && !normPhone) return res.status(400).json({ message: 'Invalid phone — use a BD mobile like 01712345678' });
    const exists = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (exists) return res.status(409).json({ message: 'An account with this email already exists' });
    if (normPhone) {
      const phoneTaken = await User.findOne({ phone: normPhone });
      if (phoneTaken) return res.status(409).json({ message: 'An account with this phone already exists' });
    }
    const user = await User.create({ name, email, phone: normPhone || undefined, password, emailVerified: false });

    /* Task 42 — referral code issued now; the +50/+100 credits wait until the
       email is verified (Task 51) so fake-email farms earn nothing. */
    try {
      user.loyalty = user.loyalty || {};
      if (!user.loyalty.referralCode) user.loyalty.referralCode = referralCodeFor(user);
      const refCode = String(body.ref || '').trim().toUpperCase();
      if (refCode) {
        const referrer = await User.findOne({ 'loyalty.referralCode': refCode });
        if (referrer && String(referrer._id) !== String(user._id)) {
          user.loyalty.referredBy = referrer._id;
        }
      }
      await user.save();
    } catch (_e) { /* loyalty must never block registration */ }

    const code = await issueEmailOtp(user);
    const mail = await sendEmailOtp({ to: user.email, name: user.name, code, minutes: OTP_TTL_MIN });

    /* guest orders are claimed only once the account is verified (see verifyEmail) */
    res.status(201).json({
      needsVerification: true,
      message: 'Account created — we emailed you a 6-digit verification code.',
      email: user.email,
      phone: user.phone || null,
      delivery: mail.sent ? 'email' : 'dry-run',
      ...(devOtpAllowed() ? { devOtp: code } : {}),
    });
  } catch (e) { next(e); }
};

// POST /api/auth/verify-email — { email, code } → activates account, awards referral, claims guest orders
exports.verifyEmail = async (req, res, next) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ message: 'Email and verification code are required' });
    const user = await User.findOne({ email: String(email).toLowerCase().trim() })
      .select('+emailOtpHash +emailOtpExpires +emailOtpAttempts');
    const invalid = { message: 'Invalid or expired verification code' };
    if (!user) return res.status(400).json(invalid);

    /* already verified → idempotent success (lets the user straight in) */
    if (user.emailVerified) {
      const linkedOrders = await linkGuestOrders(user);
      const token = user.signToken();
      setSessionCookie(res, token);
      return res.json({ token, user: user.toSafeJSON(), linkedOrders, alreadyVerified: true, message: 'Email already verified' });
    }
    if (!user.emailOtpHash || !user.emailOtpExpires || user.emailOtpExpires < new Date()) {
      return res.status(400).json({ ...invalid, needsResend: true });
    }
    if (user.emailOtpAttempts >= OTP_MAX_ATTEMPTS) {
      return res.status(400).json({ ...invalid, needsResend: true, message: 'Too many wrong attempts — request a new code' });
    }
    if (user.emailOtpHash !== sha256(String(code).trim())) {
      user.emailOtpAttempts += 1;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ ...invalid, attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - user.emailOtpAttempts) });
    }

    user.emailVerified = true;
    user.emailOtpHash = undefined;
    user.emailOtpExpires = undefined;
    user.emailOtpAttempts = 0;
    user.emailOtpSentAt = undefined;
    await awardDeferredReferral(user);
    await user.save({ validateBeforeSave: false });
    const linkedOrders = await linkGuestOrders(user);
    const token = user.signToken();
    setSessionCookie(res, token);
    res.json({ token, user: user.toSafeJSON(), linkedOrders, message: 'Email verified — welcome to ArixGear' });
  } catch (e) { next(e); }
};

// POST /api/auth/resend-verification — { email } → always 200 (anti-enumeration)
exports.resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) {
      return res.status(400).json({ message: 'A valid email is required' });
    }
    const generic = { message: 'If an unverified account exists for this email, a new code has been sent.' };
    const user = await User.findOne({ email: String(email).toLowerCase().trim() })
      .select('+emailOtpSentAt +emailOtpExpires');
    const hideDelivery = process.env.NODE_ENV === 'production';
    if (!user || user.emailVerified) {
      return res.json({ ...generic, ...(!hideDelivery ? { delivery: 'none' } : {}) });
    }

    /* 60s cooldown — blocks mail-bombing without leaking account status */
    const cooling = user.emailOtpSentAt && (Date.now() - user.emailOtpSentAt.getTime()) < OTP_RESEND_COOLDOWN_S * 1000;
    if (cooling) {
      return res.json({
        ...generic,
        ...(!hideDelivery ? { delivery: 'cooldown', retryAfter: OTP_RESEND_COOLDOWN_S } : {}),
      });
    }

    const code = await issueEmailOtp(user);
    const mail = await sendEmailOtp({ to: user.email, name: user.name, code, minutes: OTP_TTL_MIN });
    res.json({
      ...generic,
      ...(!hideDelivery ? { delivery: mail.sent ? 'email' : mail.dryRun ? 'dry-run' : 'failed' } : {}),
      ...(devOtpAllowed() ? { devOtp: code } : {}),
    });
  } catch (e) { next(e); }
};

// POST /api/auth/login — { identifier, password } where identifier = email OR BD phone
// (legacy { email, password } bodies keep working)
exports.login = async (req, res, next) => {
  try {
    const body = req.body || {};
    const raw = String(body.identifier ?? body.email ?? '').trim();
    const { password } = body;
    if (!raw || !password) return res.status(400).json({ message: 'Email/phone and password are required' });

    let user;
    if (looksLikePhone(raw)) {
      const norm = normalizeBdPhone(raw);
      if (!norm) return res.status(400).json({ message: 'Invalid phone — use a BD mobile like 01712345678' });
      user = await User.findOne({ phone: norm }).select('+password +emailOtpSentAt');
    } else {
      user = await User.findOne({ email: raw.toLowerCase() }).select('+password +emailOtpSentAt');
    }
    if (!user || !(await user.matchPassword(password))) {
      /* Task 57 (security audit) — failed logins land in the audit trail */
      auditTrail(req, 'login-failed', 'user:' + raw, { note: 'wrong email/phone or password' });
      return res.status(401).json({ message: 'Wrong email or password' });
    }
    /* Task 39 — disabled staff accounts cannot sign in to the console */
    if ((user.role === 'admin' || user.role === 'subadmin') && user.active === false) {
      return res.status(403).json({ message: 'This staff account has been disabled — contact the store owner' });
    }
    /* Task 51 — customers must verify their email first (staff/admin pre-verified) */
    if (!user.emailVerified && user.role === 'customer') {
      /* Task 58 — auto-send a FRESH OTP here (the register-time code may be
         long expired): "we sent you a code" must stay true. The 60s resend
         cooldown is honored — inside it we just report retryAfter. */
      let devOtp;
      let retryAfter;
      try {
        const cooling = user.emailOtpSentAt && (Date.now() - user.emailOtpSentAt.getTime()) < OTP_RESEND_COOLDOWN_S * 1000;
        if (cooling) {
          retryAfter = Math.max(1, Math.ceil((user.emailOtpSentAt.getTime() + OTP_RESEND_COOLDOWN_S * 1000 - Date.now()) / 1000));
        } else {
          const code = await issueEmailOtp(user);
          const mail = await sendEmailOtp({ to: user.email, name: user.name, code, minutes: OTP_TTL_MIN });
          if (devOtpAllowed()) devOtp = code;
          retryAfter = OTP_RESEND_COOLDOWN_S;
          void mail;
        }
      } catch (e) { /* mail failure must not block the verify screen */ }
      return res.status(403).json({
        message: 'Please verify your email first — we sent you a 6-digit code.',
        needsVerification: true,
        email: user.email,
        ...(devOtp ? { devOtp } : {}),
        ...(retryAfter ? { retryAfter } : {}),
      });
    }
    const linkedOrders = await linkGuestOrders(user);
    /* Task 57 (security audit) — stamp last login for the audit trail */
    user.lastLoginAt = new Date();
    await user.save().catch(() => {});
    auditTrail(req, 'login', 'user:' + (user.email || user.phone), { role: user.role });
    const token = user.signToken();
    setSessionCookie(res, token); // Step 4 — browser session moves to an HttpOnly cookie
    res.json({ token, user: user.toSafeJSON(), linkedOrders });
  } catch (e) { next(e); }
};

// POST /api/auth/logout — clears the session cookie (the JWT itself is
// stateless; API clients that hold the token still keep it until TTL — same
// doctrine as change-password, which also does not revoke outstanding JWTs).
exports.logout = async (req, res) => {
  clearSessionCookie(res);
  res.json({ message: 'Logged out' });
};

// GET /api/auth/me
exports.me = async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
};

/* ============ Task 42 packs — address book / profile / password / loyalty ============ */

const BD_PHONE = /^01[3-9]\d{8}$/;

// GET /api/auth/addresses
exports.listAddresses = async (req, res) => {
  res.json({ addresses: req.user.addresses || [] });
};

// POST /api/auth/addresses — add; first address becomes the default
exports.addAddress = async (req, res, next) => {
  try {
    const { label, line, city, division, postal, isDefault } = req.body || {};
    if (!line || !String(line).trim()) return res.status(400).json({ message: 'Address line is required' });
    const user = await User.findById(req.user._id);
    if (isDefault) user.addresses.forEach((a) => { a.isDefault = false; });
    user.addresses.push({ label: label || 'Home', line: String(line).trim(), city, division, postal, isDefault: Boolean(isDefault) || user.addresses.length === 0 });
    await user.save();
    res.status(201).json({ addresses: user.addresses });
  } catch (e) {
    if (e && e.name === 'ValidationError') return res.status(400).json({ message: Object.values(e.errors).map((x) => x.message).join(', ') });
    next(e);
  }
};

// PUT /api/auth/addresses/:id — :id is the 0-based index (QA + legacy contract)
exports.updateAddress = async (req, res, next) => {
  try {
    const idx = parseInt(req.params.id, 10);
    const user = await User.findById(req.user._id);
    if (!Number.isInteger(idx) || idx < 0 || idx >= user.addresses.length) return res.status(404).json({ message: 'Address not found' });
    const { label, line, city, division, postal, isDefault } = req.body || {};
    const a = user.addresses[idx];
    if (label !== undefined) a.label = label;
    if (line !== undefined) a.line = String(line).trim();
    if (city !== undefined) a.city = city;
    if (division !== undefined) a.division = division;
    if (postal !== undefined) a.postal = postal;
    if (isDefault === true) {
      user.addresses.forEach((x) => { x.isDefault = false; });
      a.isDefault = true;
    } else if (isDefault === false) {
      a.isDefault = false;
    }
    await user.save();
    res.json({ addresses: user.addresses });
  } catch (e) {
    if (e && e.name === 'ValidationError') return res.status(400).json({ message: Object.values(e.errors).map((x) => x.message).join(', ') });
    next(e);
  }
};

// DELETE /api/auth/addresses/:id — 0-based index; default falls back to the first remaining
exports.deleteAddress = async (req, res, next) => {
  try {
    const idx = parseInt(req.params.id, 10);
    const user = await User.findById(req.user._id);
    if (!Number.isInteger(idx) || idx < 0 || idx >= user.addresses.length) return res.status(404).json({ message: 'Address not found' });
    user.addresses.splice(idx, 1);
    if (!user.addresses.some((a) => a.isDefault) && user.addresses.length) user.addresses[0].isDefault = true;
    await user.save();
    res.json({ addresses: user.addresses });
  } catch (e) { next(e); }
};

// PATCH /api/auth/profile — name + BD phone (Task 51: normalized + uniqueness-checked)
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone } = req.body || {};
    let normPhone;
    if (phone !== undefined && phone !== '') {
      normPhone = normalizeBdPhone(phone);
      if (!normPhone) return res.status(400).json({ message: 'Invalid phone — use a BD mobile like 01712345678' });
      const taken = await User.findOne({ phone: normPhone, _id: { $ne: req.user._id } });
      if (taken) return res.status(409).json({ message: 'Another account already uses this phone' });
    }
    const user = await User.findById(req.user._id);
    if (name !== undefined) user.name = String(name).trim().slice(0, 80);
    if (phone !== undefined) user.phone = normPhone || undefined;
    await user.save();
    res.json({ user: user.toSafeJSON() });
  } catch (e) { next(e); }
};

// POST /api/auth/change-password — {current, next}
exports.changePassword = async (req, res, next) => {
  try {
    const { current, next: newPass } = req.body || {};
    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await user.matchPassword(String(current || '')))) {
      return res.status(401).json({ message: 'Current password is wrong' });
    }
    if (!newPass || String(newPass).length < 6) return res.status(400).json({ message: 'New password needs 6+ characters' });
    user.password = newPass;
    await user.save();
    res.json({ message: 'Password changed' });
  } catch (e) { next(e); }
};

// GET /api/auth/loyalty — referral code (auto-issued) + point balance
exports.loyalty = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.loyalty.referralCode) {
      user.loyalty.referralCode = referralCodeFor(user);
      await user.save();
    }
    /* Task 56-a — full pack: balance + spendable rules + replayable history */
    const rules = await loyaltyEngine.getRules();
    const history = await LoyaltyLog.historyFor(user._id, 20);
    res.json({
      referralCode: user.loyalty.referralCode,
      points: user.loyalty.points || 0,
      rules: {
        enabled: rules.enabled, pointValue: rules.pointValue,
        minRedeem: rules.minRedeem, maxRedeemPct: rules.maxRedeemPct,
      },
      history: history.map((h) => ({
        id: h._id, type: h.type, points: h.points, note: h.note,
        orderNumber: h.orderNumber, by: h.by, at: h.createdAt,
      })),
    });
  } catch (e) { next(e); }
};
