const mongoose = require('mongoose');

/* AI SUPPORT CHAT — one document per conversation, messages embedded
   (bounded) so a session + its follow-up context is a single read.

   PRIVACY BY DESIGN
     · We store ONLY what the customer typed and the assistant replied —
       never IPs, user agents, addresses, or phone numbers.
     · `user` links an authenticated customer so THEY (and the admin)
       can find the thread; guests stay fully anonymous behind
       sessionKey (a client-generated UUID). */

const msgSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true, maxlength: 4000 },
    at: { type: Date, default: Date.now },
    intent: { type: String, default: '' },
    lang: { type: String, default: 'en' },
    provider: { type: String, default: '' },
    grounded: { type: Boolean, default: true },
    refs: { type: [String], default: [] }, // product slugs attached to the answer
  },
  { _id: false }
);

const aiChatSchema = new mongoose.Schema(
  {
    sessionKey: { type: String, required: true, index: true }, // client UUID (guest) or 'u:<userId>'
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    channel: { type: String, enum: ['web', 'admin-test'], default: 'web', index: true },
    lang: { type: String, enum: ['en', 'bn'], default: 'en' },
    lastIntent: { type: String, default: '', index: true },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    messages: { type: [msgSchema], default: [] }, // bounded at MAX_MESSAGES (80) — oldest trimmed
  },
  { timestamps: true }
);

aiChatSchema.index({ lastMessageAt: -1 });
aiChatSchema.index({ createdAt: -1 });

aiChatSchema.statics.MAX_MESSAGES = 80;

aiChatSchema.statics.findOrCreate = async function ({ sessionKey, user, channel }) {
  let doc = await this.findOne({ sessionKey, channel: channel || 'web' });
  if (!doc) doc = await this.create({ sessionKey, user: user || null, channel: channel || 'web', messages: [] });
  else if (user && !doc.user) { doc.user = user; await doc.save(); }
  return doc;
};

module.exports = mongoose.model('AiChat', aiChatSchema);
