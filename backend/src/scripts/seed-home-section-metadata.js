const mongoose = require('mongoose');
require('dotenv').config();

const HomeSectionMetadata = require('../models/HomeSectionMetadata');
const metadata = require('../seed/homeSectionMetadata');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear');
  await HomeSectionMetadata.findOneAndUpdate(
    { key: metadata.key },
    metadata,
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  console.log('[homepage metadata] saved');
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('[homepage metadata] failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
