const mongoose = require('mongoose');

/**
 * Banner Management model.
 * position: hero (homepage reel slides) | promo (announcement/promo strip card) | side
 * Task 30: +clicks (CTA click counter from the storefront),
 *          +startsAt/endsAt (optional schedule — banner auto-hides outside the window),
 *          schema-level length caps so bad data can never reach MongoDB.
 */
const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Banner title is required'], trim: true, maxlength: 80 },
    subtitle: { type: String, default: '', trim: true, maxlength: 200 },
    ctaText: { type: String, default: 'SHOP NOW', trim: true, maxlength: 24 },
    /* Task 58 — Bengali twins (optional; storefront falls back to English when empty) */
    titleBn: { type: String, default: '', trim: true, maxlength: 80 },
    subtitleBn: { type: String, default: '', trim: true, maxlength: 200 },
    ctaTextBn: { type: String, default: '', trim: true, maxlength: 24 },
    link: { type: String, default: 'shop.html', trim: true, maxlength: 500 },
    image: {
      url: {
        type: String,
        /* Task 38 — video banners may omit the image (poster optional):
           conditional validator replaces the old hard required (which fired
           even for video banners). */
        validate: { validator: function (v) { return this.mediaType === 'video' || Boolean(v); }, message: 'Banner image is required' },
      },
      publicId: String,
    },
    /* Task 38 — video banners: mediaType=video + the clip (MP4/WEBM/MOV ≤40MB)
       + an optional poster frame shown while the video loads. */
    mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
    video: {
      url: { type: String, default: '' },
      publicId: String,
    },
    poster: {
      url: { type: String, default: '' },
      publicId: String,
    },
    position: { type: String, enum: ['hero', 'promo', 'side'], default: 'hero' },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    startsAt: { type: Date, default: null }, // schedule window (both null = always live)
    endsAt: { type: Date, default: null },
    clicks: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

bannerSchema.index({ position: 1, order: 1 });

module.exports = mongoose.model('Banner', bannerSchema);
