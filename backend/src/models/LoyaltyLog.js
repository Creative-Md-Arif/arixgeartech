const mongoose = require('mongoose');

/**
 * Task 56-a — loyalty point ledger. Every balance change (delivery earn,
 * referral award, checkout redemption, admin adjust, cancellation refund)
 * writes exactly one row so the customer AND the admin can replay the full
 * history. `points` is signed: + earned / − spent. Order-linked rows carry
 * orderNumber for one-click lookup.
 */
const loyaltyLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['earn', 'redeem', 'referral', 'adjust', 'refund'], required: true },
    points: { type: Number, required: true }, // signed: + credit / − debit
    note: { type: String, default: '', trim: true, maxlength: 200 },
    orderNumber: { type: String, default: null, trim: true, uppercase: true },
    by: { type: String, enum: ['system', 'admin', 'customer'], default: 'system' },
  },
  { timestamps: true }
);

loyaltyLogSchema.index({ user: 1, createdAt: -1 });

loyaltyLogSchema.statics.log = async function ({ user, type, points, note = '', orderNumber = null, by = 'system' }) {
  try {
    return await this.create({ user, type, points, note, orderNumber, by });
  } catch (_e) { /* ledger must never break the flow that earned it */ }
};

loyaltyLogSchema.statics.historyFor = function (userId, limit = 20) {
  return this.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean();
};

module.exports = mongoose.model('LoyaltyLog', loyaltyLogSchema);
