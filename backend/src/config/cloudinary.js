const { v2: cloudinary } = require('cloudinary');

/**
 * Cloudinary config — optional.
 * If CLOUDINARY_URL (or the 3 vars) are present, every image goes to Cloudinary.
 * If NOT configured, the storage service transparently falls back to local
 * disk (backend/uploads/) so the whole system still works out of the box.
 */
const isCloudinaryEnabled = Boolean(
  process.env.CLOUDINARY_URL ||
  (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
);

if (isCloudinaryEnabled) {
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config(true); // parse CLOUDINARY_URL
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
  console.log('[cloudinary] enabled → cloud:', cloudinary.config().cloud_name);
} else {
  console.log('[cloudinary] NOT configured → images will be stored locally in backend/uploads/');
}

module.exports = { cloudinary, isCloudinaryEnabled };
