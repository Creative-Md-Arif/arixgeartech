const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    email: {
      type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    /* Task 51 — unique+sparse: phone-login needs exactly-one match; sparse keeps
       null-phone accounts (legacy/pre-phone users) legal. Normalized 01XXXXXXXXX. */
    phone: { type: String, trim: true, maxlength: 20, unique: true, sparse: true },

    /* Task 51 — email verification: register issues a 6-digit OTP (hashed, 10 min,
       5 wrong attempts max). Customers must verify before login; staff/admin and
       seeded accounts are pre-verified. Guest checkout is NOT gated by this. */
    emailVerified: { type: Boolean, default: false },
    emailOtpHash: { type: String, select: false },
    emailOtpExpires: { type: Date, select: false },
    emailOtpAttempts: { type: Number, default: 0, select: false },
    emailOtpSentAt: { type: Date, select: false },
    password: { type: String, required: [true, 'Password is required'], minlength: 6, select: false },
    role: { type: String, enum: ['customer', 'admin', 'subadmin'], default: 'customer' },

    /* Task 39 — sub-admin team accounts: a restricted staff login that only
       reaches the admin-console modules listed here. Ignored for admins.
       Module keys mirror the sidebar: dashboard, orders, returns, reports,
       products, catalog, reviews, questions, banners, homepage, coupons,
       customers, brands, messages, content, seo, settings.                   */
    permissions: { type: [String], default: [] },
    /* disabled staff accounts fail login instantly (403) but keep history */
    active: { type: Boolean, default: true },
    /* forgot-password (single-use, 15 min) */
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    passwordChangedAt: { type: Date, select: false },
    addresses: [
      {
        label: { type: String, default: 'Home' },
        line: String,
        city: String,
        division: { type: String, enum: ['dhaka','chattogram','rajshahi','khulna','barishal','sylhet','rangpur','mymensingh'] },
        postal: String,
        isDefault: { type: Boolean, default: false },
      },
    ],

    /* Task 42 — loyalty: auto-issued referral code, starter/referral/delivery
       points. awardDeliveryPoints() credits 1pt per ৳100 on delivery, once. */
    loyalty: {
      referralCode: { type: String, default: null, trim: true, uppercase: true },
      points: { type: Number, default: 0 },
      referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      /* Task 51 — +50/+100 credits move from register-time to verify-time so
         fake-email farms cannot harvest points; flag makes the award once-only. */
      referralAwarded: { type: Boolean, default: false },
    },
    /* Task 57 — private CRM layer, admin-eyes only: quick tags (VIP /
       fraud-risk / wholesale / …) + a freeform note. Never leaves the admin API. */
    adminTags: { type: [String], default: [] },
    adminNote: { type: String, default: '', maxlength: 2000 },
    lastLoginAt: { type: Date, default: null }, // Task 57 (security audit)
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

userSchema.methods.signToken = function () {
  /* Task 57 (security audit) — centralised secret helper (prod fail-fast) */
  const { jwtSecret } = require('../middleware/auth');
  return jwt.sign(
    { id: this._id, role: this.role, name: this.name },
    jwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES || '7d' }
  );
};

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id, name: this.name, email: this.email, phone: this.phone, role: this.role,
    emailVerified: Boolean(this.emailVerified),
    addresses: this.addresses,
    loyalty: { referralCode: this.loyalty && this.loyalty.referralCode, points: (this.loyalty && this.loyalty.points) || 0 },
    /* Task 39 — the admin console filters its own nav from this list */
    permissions: this.role === 'subadmin' ? this.permissions : [],
    active: this.active,
    /* Task 57 (security audit) — surfaced for the team/audit views */
    lastLoginAt: this.lastLoginAt || null,
  };
};

module.exports = mongoose.model('User', userSchema);
