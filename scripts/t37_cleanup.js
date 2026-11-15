/* Task 37 cleanup — remove QA artifacts, restore DB to seed state.
 * 1. Delete ContactMessages created during QA (outbound compose tests, probes, demo reply)
 * 2. Clear notifications for admin + demo audiences (bell noise from QA)
 */
const { createRequire } = require('module');
const req = createRequire('/home/z/my-project/download/forged-full-project/backend/package.json');
const mongoose = req('mongoose');
const ContactMessage = req('/home/z/my-project/download/forged-full-project/backend/src/models/ContactMessage');
const Notification = req('/home/z/my-project/download/forged-full-project/backend/src/models/Notification');

const MONGO = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/arixgear';

const QA_MARKERS = [
  /Task 37 QA/i,
  /Task 37 browser QA/i,
  /Toast probe/i,
  /Live QA/i,
  /hidden-tab push probe/i,
  /When does the belt restock/i,
];

(async () => {
  await mongoose.connect(MONGO);
  const msgs = await ContactMessage.find({}).select('name email topic direction message createdAt').lean();
  const ids = msgs
    .filter((m) => m.direction === 'out' || QA_MARKERS.some((r) => r.test(m.message)) || m.name === 'QA Probe')
    .map((m) => m._id);
  const r1 = await ContactMessage.deleteMany({ _id: { $in: ids } });
  const r2 = await Notification.deleteMany({});
  console.log('contact messages deleted:', r1.deletedCount);
  console.log('notifications cleared:', r2.deletedCount);
  const left = await ContactMessage.countDocuments({});
  console.log('inbox rows remaining (seed):', left);
  await mongoose.disconnect();
})().catch((e) => { console.error('cleanup failed:', e.message); process.exit(1); });
