const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema(
  {
    value: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    requiresHref: { type: Boolean, default: false },
    configurable: { type: Boolean, default: false },
    kind: { type: String, default: 'none', trim: true },
  },
  { _id: false },
);

const homeSectionMetadataSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sectionTypes: { type: [optionSchema], default: [] },
    sources: { type: [optionSchema], default: [] },
    actions: { type: [optionSchema], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model('HomeSectionMetadata', homeSectionMetadataSchema);
