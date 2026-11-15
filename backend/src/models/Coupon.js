const mongoose = require('mongoose');

/**
 * Discount coupon — validated at checkout and consumed by placeOrder.
 *
 * Task 29 upgrades:
 *  - perUser         → max uses per customer (0 = unlimited). Enforced in the
 *                      public validate endpoint (JWT) and authoritatively in
 *                      placeOrder (user id OR normalized checkout phone).
 *  - firstOrderOnly  → only redeemable by customers with no prior
 *                      non-cancelled order (same identity rule as perUser).
 *  - public          → listed on GET /api/coupons/active for the storefront
 *                      coupon picker (private/influencer codes stay hidden).
 *  - description     → one-line storefront blurb shown in the picker.
 *  - appliesTo       → scope the discount to selected categories / products.
 *                      The discount BASE becomes the eligible lines' subtotal
 *                      only (other items pay full price); minOrder still uses
 *                      the FULL cart subtotal so stacking thresholds stay sane.
 */
const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      /* letters/digits with inner hyphens allowed (campaign codes: QA29-XXXXXX) */
      match: [/^[A-Z0-9]([A-Z0-9-]{1,18})[A-Z0-9]$/, 'Code must be 3–20 chars: letters/digits, inner hyphens allowed'],
    },
    type: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    value: {
      type: Number, required: [true, 'Discount value is required'], min: 0,
      /* audit fix — a typo'd 150 must not pass validation and silently become
         a 100%-off (free-order) coupon at runtime via discountFor's clamp */
      validate: { validator(v) { return this.type !== 'percent' || v <= 100; }, message: 'Percent discount cannot exceed 100' },
    },
    minOrder: { type: Number, default: 0 },
    maxUses: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },

    perUser: { type: Number, default: 0, min: 0 },          // 0 = unlimited per customer
    firstOrderOnly: { type: Boolean, default: false },
    public: { type: Boolean, default: false },
    description: { type: String, default: '', trim: true, maxlength: 140 },
    descriptionBn: { type: String, default: '', trim: true, maxlength: 140 }, // Task 58 — Bengali blurb (falls back to description)

    appliesTo: {
      mode: { type: String, enum: ['all', 'categories', 'products'], default: 'all' },
      categories: { type: [String], default: [] },   // Product.category strings (lowercase)
      products: { type: [String], default: [] },     // Product slugs (lowercase)
    },

    /* Phase 4 (4.1) — coupon/flash interplay. Flash-deal lines are ALREADY
       discounted (live deal price); by default a coupon skips them so a
       customer cannot stack 10% on top of a slashed deal. When true, the
       coupon treats flash lines like any other (full stacking). */
    stackWithFlash: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/* scope filter for a cart line { slug, category, flashLive } — a line is
   eligible when it matches appliesTo AND (stackWithFlash OR not flash-live) */
function inScope(line) {
  if (line.flashLive && !this.stackWithFlash) return false; // Phase 4 — interplay
  const a = this.appliesTo || {};
  if (!a.mode || a.mode === 'all') return true;
  if (a.mode === 'products') return (a.products || []).includes(String(line.slug || '').toLowerCase());
  if (a.mode === 'categories') return (a.categories || []).includes(String(line.category || '').toLowerCase());
  return true;
}

/**
 * Full validity check. `lines` = cart lines [{ slug, category, lineTotal }]
 * (order/preview items carry these); omit/null lines → scope check skipped
 * (legacy shape, treated as an all-products cart).
 * Returns { ok, msg?, base?, eligible? } — `base` is the discountable subtotal
 * when scoped, `eligible` names the scope for friendlier UI messages.
 */
couponSchema.methods.isValidFor = function (subtotal, lines) {
  if (!this.active) return { ok: false, msg: 'Coupon is inactive' };
  if (this.expiresAt && this.expiresAt < new Date()) return { ok: false, msg: 'Coupon has expired' };
  if (this.maxUses > 0 && this.usedCount >= this.maxUses) return { ok: false, msg: 'Coupon usage limit reached' };

  /* scope — compute the eligible base out of the actual cart lines */
  let base = subtotal;
  if (lines && lines.length) {
    const eligible = lines.filter((l) => inScope.call(this, l));
    base = Math.round(eligible.reduce((s, l) => s + (Number(l.lineTotal) || 0), 0) * 100) / 100;
    if (eligible.length === 0 || base <= 0) {
      /* friendlier message when flash stacking is the reason nothing qualified */
      const flashOnly = lines.every((l) => l.flashLive);
      if (flashOnly && !this.stackWithFlash) {
        return { ok: false, msg: 'This coupon cannot be combined with flash-deal prices', base: 0 };
      }
      const target = this.appliesTo.mode === 'products' ? (this.appliesTo.products || []).join(', ') : (this.appliesTo.categories || []).join(', ');
      return { ok: false, msg: `This coupon applies only to: ${target || 'selected items'}`, base: 0 };
    }
  }

  if (subtotal < this.minOrder) {
    return { ok: false, msg: `Minimum order for this coupon is ৳${Number(this.minOrder).toLocaleString('en-US')}` };
  }
  return { ok: true, base, eligible: this.appliesTo && this.appliesTo.mode !== 'all' };
};

/* legacy shape — list/validate calls that don't pass cart lines */
couponSchema.methods.isValid = function (subtotal) {
  return this.isValidFor(subtotal, null);
};

/**
 * Discount for a cart. When scoped, the percentage/fixed value is applied to
 * the eligible base only and can never exceed it (scoped coupons can't make
 * unrelated items negative). Falls back to the full subtotal when no lines.
 */
couponSchema.methods.discountFor = function (subtotal, lines) {
  let base = subtotal;
  if (lines && lines.length) {
    const eligible = lines.filter((l) => inScope.call(this, l));
    base = Math.round(eligible.reduce((s, l) => s + (Number(l.lineTotal) || 0), 0) * 100) / 100;
    if (base <= 0) return 0;
  }
  const discount = this.type === 'percent' ? (base * this.value) / 100 : this.value;
  return Math.round(Math.min(discount, base) * 100) / 100;
};

/* storefront/public projection (never leaks usedCount/limits internals) */
couponSchema.methods.publicView = function () {
  return {
    code: this.code,
    type: this.type,
    value: this.value,
    minOrder: this.minOrder,
    expiresAt: this.expiresAt,
    description: this.description,
    descriptionBn: this.descriptionBn || '', // Task 58
  };
};

module.exports = mongoose.model('Coupon', couponSchema);
