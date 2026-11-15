const mongoose = require('mongoose');
require('dotenv').config();

const HomeSection = require('../models/HomeSection');
const HomeSectionMetadata = require('../models/HomeSectionMetadata');
const metadataSeed = require('../seed/homeSectionMetadata');
const cards = require('../seed/quickServiceData');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear');

  const section = await HomeSection.findOne({ key: 'quick-services' });
  if (!section) throw new Error('quick-services HomeSection does not exist; run the full seed first');
  section.config = { ...(section.config || {}), cards };
  await section.save();

  let metadata = await HomeSectionMetadata.findOne({ key: 'homepage' });
  if (!metadata) metadata = new HomeSectionMetadata({ key: 'homepage' });
  metadata.actions = metadataSeed.actions;
  await metadata.save();

  console.log(`[quick services seed] updated ${cards.length} cards and ${metadata.actions.length} actions`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('[quick services seed] failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
