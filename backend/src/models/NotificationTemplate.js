const mongoose = require('mongoose');

/* Phase 4 (4.3) — NotificationTemplate. Admin-editable copy for transactional
   notifications, keyed like the legacy settings.content.emailTemplates block
   (orderConfirmation, statusUpdate, …) but channel-aware and renderable:

     channel: email | sms | push
     subject/body carry {{vars}}; services/templates.render() fills them —
     unknown vars resolve to '' so a stale placeholder can never leak.

   The email service merges these docs over its hardcoded defaults (safe
   fallback the admin cannot break); SMS/Push channels render through the same
   service. Preview + test-send endpoints make the editor backend complete. */

const templateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9-]+$/, 'Key: lowercase letters/digits/hyphens'] },
    channel: { type: String, enum: ['email', 'sms', 'push'], default: 'email', index: true },
    label: { type: String, default: '', trim: true, maxlength: 80 }, // admin-facing name
    description: { type: String, default: '', trim: true, maxlength: 300 },

    subject: { type: String, default: '', trim: true, maxlength: 200 },  // email subject / push title
    body: { type: String, default: '', trim: true, maxlength: 4000 },    // email intro html / sms text / push body
    statusNotes: { type: mongoose.Schema.Types.Mixed, default: {} },     // per-status overrides (order updates)

    vars: { type: [String], default: [] },  // documentation for the admin UI
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NotificationTemplate', templateSchema);
