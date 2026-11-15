const mongoose = require('mongoose');
require('dotenv').config();

const HomeSection = require('../models/HomeSection');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear');
  const result = await HomeSection.updateMany(
    { key: { $in: ['athletes', 'stories'] } },
    { $set: { config: {} } },
  );
  console.log(`[community migration] cleared ${result.modifiedCount || 0} section configs`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('[community migration] failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
