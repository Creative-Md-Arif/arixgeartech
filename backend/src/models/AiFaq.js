const mongoose = require('mongoose');

/* AI KNOWLEDGE SOURCE — admin-curated FAQ entries for the assistant.
   The RAG layer merges these with the storefront content FAQs
   (Settings → Content → FAQs) at ask-time; this collection is the
   AI-first place for richer, tagged, bilingual knowledge. */

const aiFaqSchema = new mongoose.Schema(
  {
    q: { type: String, required: true, trim: true, maxlength: 400 },
    a: { type: String, required: true, trim: true, maxlength: 4000 },
    qBn: { type: String, default: '', trim: true, maxlength: 400 },
    aBn: { type: String, default: '', trim: true, maxlength: 4000 },
    topic: { type: String, default: 'general', trim: true, lowercase: true, maxlength: 40 }, // delivery | payment | warranty | returns | general
    tags: { type: [String], default: [] }, // retrieval boost tokens
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

aiFaqSchema.index({ q: 'text', a: 'text', tags: 'text' });

module.exports = mongoose.model('AiFaq', aiFaqSchema);
