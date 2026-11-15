const mongoose = require('mongoose');

/**
 * Task 39 — AuditLog: append-only trail of every staff mutation in the ERP.
 * Written fire-and-forget (never blocks or fails a request). Kept deliberately
 * flat so the admin Audit page can filter by entity/action/actor quickly.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, default: '' },
    actorEmail: { type: String, default: '', index: true },
    actorRole: { type: String, enum: ['admin', 'subadmin', 'system'], default: 'admin' },

    action: {
      type: String, required: true, index: true,
      /* audit fix — 'approve' was used by the AI import route but missing from
         this enum: every such audit row silently failed validation */
      enum: ['create', 'update', 'delete', 'duplicate', 'bulk', 'import', 'status', 'verify', 'reject', 'dispatch', 'compose', 'approve', 'reset-password', 'login', 'login-failed', 'logout', 'team.create', 'team.update', 'team.delete', 'export'], // Task 57 — failed-login + team.* + DB export
    },
    entity: {
      type: String, required: true, index: true,
      /* audit fix — 19 entities used by adminRoutes (brands, deals, bundles,
         flash campaigns, warranty, tickets, service centers, stock,
         subscribers, templates, loyalty, AI console) were missing here, so
         ZERO audit rows were ever written for those modules */
      enum: ['product', 'category', 'badge', 'banner', 'home-section', 'coupon', 'order', 'return', 'setting', 'seo', 'member', 'membership-plan', 'customer', 'review', 'question', 'message', 'subadmin', 'post', 'user', 'system', 'database', 'brand', 'bundle', 'flash-campaign', 'deal', 'warranty', 'ticket', 'service-center', 'stock', 'subscriber', 'notification-template', 'template-test', 'broadcast', 'email-test', 'loyalty-settings', 'loyalty-adjust', 'ai-settings', 'ai-import', 'ai-faq', 'ai-chat', 'upload'], // Task 47 · Task 57 · audit-fix: full module coverage
    },
    entityId: { type: String, default: '' },
    label: { type: String, default: '', maxlength: 160 }, // human-readable summary
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }, // extra {method, path, changes…}
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

auditLogSchema.methods.publicView = function () {
  return {
    id: this._id,
    actor: this.actor,
    actorName: this.actorName,
    actorEmail: this.actorEmail,
    actorRole: this.actorRole,
    action: this.action,
    entity: this.entity,
    entityId: this.entityId,
    label: this.label,
    meta: this.meta,
    ip: this.ip,
    at: this.createdAt,
  };
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
