const mongoose = require('mongoose');

/**
 * Product question — visitors ask from the PDP; admin answers from
 * Admin → Questions. Only answered questions appear on the storefront.
 * Task 30: +user (account asker, ABSENT for guests — no default, same
 * partial-index trap as Review), +answeredAt (response-time analytics),
 * +helpfulCount/voters[] ("was this helpful?" — same pattern as reviews).
 */
const questionSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    question: { type: String, required: [true, 'Question is required'], trim: true, maxlength: 600 },
    answer: { type: String, trim: true, maxlength: 2000, default: '' },
    answered: { type: Boolean, default: false, index: true },
    answeredAt: { type: Date, default: null }, // set/cleared by answer/unanswer — powers response-time stats

    /* asker — logged-in visitors only; guests keep the field ABSENT */
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    helpfulCount: { type: Number, default: 0, min: 0 },
    /* audit fix — cap 1000 now enforced at the schema level, same as reviews */
    voters: {
      type: [{ key: { type: String }, at: { type: Date, default: Date.now } }],
      default: [],
      validate: { validator: (v) => v.length <= 1000, message: 'Too many votes' },
    },
  },
  { timestamps: true }
);

questionSchema.index({ product: 1, answered: 1, createdAt: -1 });
questionSchema.index({ user: 1, createdAt: -1 }); // "my questions" (missing field = not indexed, no null trap here)

module.exports = mongoose.model('Question', questionSchema);
