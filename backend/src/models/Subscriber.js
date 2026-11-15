const mongoose = require('mongoose');

/* Phase 4 (4.4) — Subscriber. Canonical newsletter list (the legacy flow kept a
   ContactMessage(topic:'newsletter') row — still written for the Messages
   inbox, but marketing needs a real list: status, source, one-click
   unsubscribe token, GDPR-friendly audit fields). */

const subscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 160 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    source: { type: String, enum: ['footer', 'checkout', 'popup', 'admin'], default: 'footer' },
    status: { type: String, enum: ['active', 'unsubscribed'], default: 'active', index: true },
    unsubToken: { type: String, required: true, select: false }, // random — GET /newsletter/unsubscribe?email&token — audit fix: never serialized by casual finds (capability secret)
    unsubscribedAt: { type: Date, default: null },
    lastEmailAt: { type: Date, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

subscriberSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Subscriber', subscriberSchema);
