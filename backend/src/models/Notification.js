const mongoose = require('mongoose');

/* Task 36 — in-app notification. Two audiences:
   • forAdmin:true  → the admin console bell (no user binding — one console)
   • forAdmin:false → a specific customer bell (user required; guests skipped)
   type drives the bell icon; link is the in-app navigation target. */
const notificationSchema = new mongoose.Schema(
  {
    forAdmin: { type: Boolean, default: false, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    type: { type: String, enum: ['order', 'payment', 'status', 'cancel', 'return', 'message', 'compose', 'system', 'stock', 'loyalty'], default: 'order' },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, default: '', trim: true, maxlength: 400 },
    link: { type: String, default: '', trim: true, maxlength: 200 },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ forAdmin: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
