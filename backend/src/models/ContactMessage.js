const mongoose = require('mongoose');

/**
 * Contact / support message sent from the storefront contact page.
 * Lands in the admin Messages inbox (unread by default).
 */
const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 120 },
    /* email optional — the live-chat widget sends name+message only (topic 'chat') */
    email: { type: String, trim: true, lowercase: true, maxlength: 160, default: '' },
    orderNo: { type: String, trim: true, maxlength: 40, default: '' },
    topic: { type: String, trim: true, maxlength: 60, default: 'general' },
    message: { type: String, required: [true, 'Message is required'], trim: true, maxlength: 4000 },
    read: { type: Boolean, default: false },
    /* Task 37 — two-way messaging. direction 'in' = customer → admin (inbox),
       'out' = admin → customer (composed from Admin → Messages). user binds
       the thread to an account so the customer's bell + inbox find it. */
    direction: { type: String, enum: ['in', 'out'], default: 'in', index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    subject: { type: String, trim: true, maxlength: 160, default: '' },
  },
  { timestamps: true }
);

contactMessageSchema.index({ read: 1, createdAt: -1 });

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
