/* ArixGear — Google submission log (Search Console automation + GA4 calls)
   Every automated/manual Google submission lands here so the admin can see
   exactly what was sent, when, in which mode (live / dry-run) and what
   Google answered. Mirrors the emails.jsonl dry-run philosophy: the system
   is fully usable BEFORE any Google credentials exist.                     */
const mongoose = require('mongoose');

const gscLogSchema = new mongoose.Schema(
  {
    kind: { type: String, default: 'url' },      // url | sitemap | batch | ga4
    target: { type: String, default: '' },       // URL submitted / property / summary
    type: { type: String, default: '' },         // URL_UPDATED | URL_DELETED | SITEMAP_SUBMIT | INDEX_BATCH | FUNNEL_REPORT
    mode: { type: String, default: 'dry-run' },  // live | dry-run
    ok: { type: Boolean, default: false },
    status: { type: Number, default: 0 },        // HTTP status from Google (0 = not attempted)
    message: { type: String, default: '' },
  },
  { timestamps: true, collection: 'gsclogs' }
);

/* safe append — logging must never break the request that triggered it */
gscLogSchema.statics.log = function (entry) {
  return this.create(entry)
    .then(async () => {
      /* keep the log bounded — drop everything but the newest 400 rows */
      const newest = await this.find().sort({ createdAt: -1 }).limit(400).select('_id');
      await this.deleteMany({ _id: { $nin: newest.map((d) => d._id) } });
    })
    .catch(() => {});
};

module.exports = mongoose.model('GscLog', gscLogSchema);
