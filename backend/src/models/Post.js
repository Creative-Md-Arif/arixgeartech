const mongoose = require('mongoose');

/**
 * Blog post — the fitness Journal (Task 47 Content Hub).
 * Admin writes plain-text body; paragraphs are split on blank lines at
 * render time (no HTML stored → no injection surface). Cover rides the
 * shared image pipeline (Cloudinary or /uploads fallback).
 */
const postSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    titleBn: { type: String, trim: true, maxlength: 140, default: '' }, // Task 58 — Bengali headline
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 160 },
    excerpt: { type: String, trim: true, maxlength: 320, default: '' },
    excerptBn: { type: String, trim: true, maxlength: 320, default: '' }, // Task 58 — Bengali excerpt
    body: { type: String, required: true, maxlength: 50000 },
    bodyBn: { type: String, maxlength: 50000, default: '' }, // Task 58 — Bengali body (same plain-text rules)
    cover: { type: String, default: '' }, // image URL (uploaded or external)
    tags: { type: [String], default: [] },
    author: { type: String, default: 'ArixGear Editorial', trim: true, maxlength: 80 },
    published: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    views: { type: Number, default: 0 },
    seoTitle: { type: String, trim: true, maxlength: 140, default: '' },
    seoDescription: { type: String, trim: true, maxlength: 320, default: '' },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

/* stable unique slug: slugified title (+ -2, -3… when taken) */
postSchema.statics.slugify = function (title) {
  return String(title).toLowerCase().trim()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-') // keep Bengali letters too
    .replace(/^-+|-+$/g, '').slice(0, 120) || 'post';
};

module.exports = mongoose.model('Post', postSchema);
