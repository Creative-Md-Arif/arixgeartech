const mongoose = require('mongoose');

/**
 * Product review — submitted from the PDP (guest OK, better as a member).
 * Lands UNAPPROVED; the admin approves it from Admin → Reviews, which also
 * recomputes the product's public rating/reviews counters.
 *
 * Task 29 upgrades:
 *  - user            → account link (absent on guest reviews; sparse-unique
 *                      compound index enforces ONE review per account/product)
 *  - verified        → true when the author has a DELIVERED order containing
 *                      this product (server-checked, never client-claimed)
 *  - orderNumber     → the delivered order that earned the verified badge
 *  - reply           → brand/owner response, shown under the review on the PDP
 *  - helpfulCount    → "was this helpful?" votes from other visitors
 *  - voters          → dedupe keys ('u:<userId>' | 'i:<iphash>'), capped 1000
 *  - images          → up to 3 customer photos (Cloudinary), shown after approval
 */
const replySchema = new mongoose.Schema(
  {
    text: { type: String, default: '', maxlength: 600, trim: true },
    by: { type: String, default: '', maxlength: 80 },
    at: { type: Date, default: null },
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    /* NO default on purpose — guest docs must NOT carry user:null, or the
       sparse unique index would treat every guest review as a duplicate
       (same lesson as Order.idemKey in Task 28). */
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: [true, 'Review text is required'], trim: true, maxlength: 1500 },
    approved: { type: Boolean, default: false, index: true },
    homepageFeatured: { type: Boolean, default: true, index: true },

    verified: { type: Boolean, default: false },
    orderNumber: { type: String, default: '', maxlength: 20 },

    reply: { type: replySchema, default: () => ({}) },

    helpfulCount: { type: Number, default: 0 },
    voters: {
      type: [String],
      default: [],
      validate: { validator: (v) => v.length <= 1000, message: 'Too many votes' },
    },

    images: [
      {
        url: { type: String, default: '' },
        publicId: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, approved: 1, createdAt: -1 });
/* one review per ACCOUNT per product. NOTE: a sparse COMPOUND index does NOT
   work here — MongoDB includes a doc in a compound sparse index when ANY of
   its fields is present, so every guest review (product set, user missing)
   would be indexed as { user: null, product } and collide. A
   partialFilterExpression on the BSON type is the correct tool: only real
   account reviews get unique enforcement, guests are excluded entirely. */
reviewSchema.index(
  { user: 1, product: 1 },
  { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } }
);

module.exports = mongoose.model('Review', reviewSchema);
