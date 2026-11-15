const mongoose = require('mongoose');

/* Phase 4 (4.2) — ServiceTicket. The complaint workflow ("Raise a Complaint" /
   "Servicing Center" from the Phase 3 quick-services block) becomes a real
   ticket queue with a public tracking key and an append-only timeline.

   Status flow:
     open → in-review → approved → in-service → resolved → closed
     (rejected / cancelled are terminal exits from any pre-approved stage) */

const TICKET_STATUSES = ['open', 'in-review', 'approved', 'in-service', 'resolved', 'closed', 'rejected', 'cancelled'];
const OPEN_STATUSES = ['open', 'in-review', 'approved', 'in-service'];

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true, index: true }, // ARG-SRV-XXXXXX

    customer: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      phone: { type: String, required: true, trim: true, maxlength: 16 },
      email: { type: String, default: '', lowercase: true, trim: true, maxlength: 160 },
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    /* category drives the service desk routing */
    category: {
      type: String,
      enum: ['complaint', 'service', 'warranty-claim', 'return', 'general'],
      default: 'complaint',
      index: true,
    },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },

    /* optional bindings — a ticket may float free (bought elsewhere, general ask) */
    orderNumber: { type: String, default: '', uppercase: true, trim: true },
    productSlug: { type: String, default: '', lowercase: true, trim: true },
    productName: { type: String, default: '', trim: true, maxlength: 160 },
    warrantyRegNumber: { type: String, default: null }, // linked WarrantyRegistration

    attachments: {
      type: [{ _id: false, url: String, publicId: String, filename: String }],
      default: [],
    },

    status: { type: String, enum: TICKET_STATUSES, default: 'open', index: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // staff

    timeline: {
      type: [{
        _id: false,
        status: { type: String, enum: TICKET_STATUSES },
        note: { type: String, default: '', maxlength: 500 },
        at: { type: Date, default: Date.now },
        by: { type: String, default: 'system' }, // 'customer' | staff name | 'system'
      }],
      default: [],
    },

    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ticketSchema.index({ status: 1, createdAt: -1 });
ticketSchema.index({ 'customer.phone': 1, createdAt: -1 });

ticketSchema.methods.pushTimeline = function (status, note = '', by = 'system') {
  this.timeline.push({ status, note: String(note || '').slice(0, 500), at: new Date(), by: String(by || 'system').slice(0, 60) });
  this.status = status;
  if (status === 'resolved') this.resolvedAt = this.resolvedAt || new Date();
};

ticketSchema.methods.publicView = function () {
  return {
    ticketNumber: this.ticketNumber,
    subject: this.subject,
    category: this.category,
    description: this.description,
    orderNumber: this.orderNumber || '',
    productName: this.productName || '',
    priority: this.priority,
    status: this.status,
    open: OPEN_STATUSES.includes(this.status),
    timeline: this.timeline.map((t) => ({ status: t.status, note: t.note, at: t.at, by: t.by })),
    createdAt: this.createdAt,
    resolvedAt: this.resolvedAt,
  };
};

ticketSchema.statics.generateTicketNumber = function () {
  const r = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(2, 8);
  return `ARG-SRV-${r}`;
};

module.exports = mongoose.model('ServiceTicket', ticketSchema);
module.exports.TICKET_STATUSES = TICKET_STATUSES;
module.exports.OPEN_STATUSES = OPEN_STATUSES;
