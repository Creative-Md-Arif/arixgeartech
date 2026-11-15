const mongoose = require('mongoose');

/* AI ANALYTICS — one daily aggregate doc. $inc-friendly, tiny footprint:
   the whole year of AI traffic is 365 documents. */

const DAY_MS = 24 * 60 * 60 * 1000;

const aiStatSchema = new mongoose.Schema(
  {
    day: { type: String, required: true, unique: true, match: [/^\d{4}-\d{2}-\d{2}$/, 'day must be YYYY-MM-DD'] },
    chats: { type: Number, default: 0 },          // assistant replies served
    sessions: { type: Number, default: 0 },       // first message of a session
    intents: { type: Map, of: Number, default: {} },
    langs: { type: Map, of: Number, default: {} },
    providerCalls: { type: Map, of: Number, default: {} }, // gemini / openai / rules
    tokens: { prompt: { type: Number, default: 0 }, completion: { type: Number, default: 0 } },
    imports: { type: Map, of: Number, default: {} },       // staged / approved / failed / duplicates
  },
  { timestamps: true }
);

aiStatSchema.statics.today = function () {
  return new Date().toISOString().slice(0, 10);
};

/** Fire-and-forget bump — never awaited from hot paths, never throws. */
aiStatSchema.statics.bump = function (patch = {}, day = null) {
  const d = day || this.today();
  const setOps = {};
  const incOps = {};
  if (patch.chats) incOps.chats = patch.chats;
  if (patch.sessions) incOps.sessions = patch.sessions;
  if (patch.promptTokens) incOps['tokens.prompt'] = patch.promptTokens;
  if (patch.completionTokens) incOps['tokens.completion'] = patch.completionTokens;
  for (const [map, key] of [['intents', patch.intent], ['langs', patch.lang], ['providerCalls', patch.provider], ['imports', patch.importEvent]]) {
    if (key) setOps[`${map}.${key}`] = 1;
  }
  const update = { $inc: incOps, $setOnInsert: { day: d } };
  for (const k of Object.keys(setOps)) update.$inc[k] = 1; // Map counters are incs too (key auto-created)
  return this.findOneAndUpdate({ day: d }, update, { upsert: true, setDefaultsOnInsert: true }).catch(() => {});
};

aiStatSchema.statics.range = async function (days = 7) {
  const from = new Date(Date.now() - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  return this.find({ day: { $gte: from } }).sort({ day: 1 }).lean();
};

module.exports = mongoose.model('AiStat', aiStatSchema);
