const mongoose = require('mongoose');

/* Phase 4 (4.2) — ServiceCenter. Physical walk-in points behind the
   "Servicing Center" quick-service. Admin CRUD; storefront lists active
   centers sorted by sortOrder/city. */

const centerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 60, index: true },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, default: '', lowercase: true, trim: true, maxlength: 160 },
    hours: { type: String, default: 'Sat–Thu 10:00–19:00', trim: true, maxlength: 120 },
    mapUrl: { type: String, default: '', trim: true, maxlength: 300 },
    services: { type: [String], default: ['Diagnostics', 'Repairs', 'Warranty claims'] },
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

centerSchema.methods.publicView = function () {
  return {
    id: String(this._id),
    name: this.name,
    city: this.city,
    address: this.address,
    phone: this.phone,
    email: this.email || '',
    hours: this.hours,
    mapUrl: this.mapUrl || '',
    services: this.services,
  };
};

module.exports = mongoose.model('ServiceCenter', centerSchema);
