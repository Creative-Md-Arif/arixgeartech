const mongoose = require('mongoose');

/* Phase 4 (4.3) — DeviceToken. FCM registration tokens for customer devices.
   The storefront/PWA registers after login (or anonymously — guest tokens are
   allowed but broadcast treats logged-in tokens as the useful ones). FCM
   delivery itself runs through services/fcm.js — HTTP v1 over a service
   account; until env keys exist every send is a logged dry-run. */

const deviceTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, trim: true }, // FCM registration token
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    platform: { type: String, enum: ['web', 'android', 'ios'], default: 'web' },
    agent: { type: String, default: '', trim: true, maxlength: 200 },
    topics: { type: [String], default: ['general'] }, // e.g. general, offers, order-updates
    lastSeenAt: { type: Date, default: Date.now },
    fails: { type: Number, default: 0 }, // consecutive send failures → prune at 5
  },
  { timestamps: true }
);

deviceTokenSchema.index({ user: 1, platform: 1 });

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
