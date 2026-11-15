const mongoose = require('mongoose');
require('dotenv').config();

const HomeSection = require('../models/HomeSection');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear');
  const result = await HomeSection.updateOne(
    { key: 'combo-bundles' },
    { $set: { config: {} } },
  );
  console.log(`[homepage combo migration] updated ${result.modifiedCount || 0} section`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('[homepage combo migration] failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
