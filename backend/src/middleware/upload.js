const multer = require('multer');

/** Images only, max 5MB, kept in memory (piped to Cloudinary or disk by storageService). */
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG, PNG or WEBP images are allowed'));
  },
});

/** CSV only, max 2MB, kept in memory (catalog import). */
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel' || /\.csv$/i.test(file.originalname || '');
    if (ok) return cb(null, true);
    cb(new Error('Only CSV files are allowed'));
  },
});

/* Task 38 — field-scoped media uploader for banners: the `image`/`poster`
   fields accept images only (5MB), the `video` field accepts MP4/WEBM/MOV
   (40MB). A video posted into the image slot is rejected HERE, not later. */
const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    const isImage = ALLOWED.includes(file.mimetype);
    const isVideo = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.mimetype);
    if (file.fieldname === 'video') {
      if (isVideo) return cb(null, true);
      return cb(new Error('The video slot accepts MP4, WEBM or MOV only'));
    }
    if (file.fieldname === 'image' || file.fieldname === 'poster') {
      if (isImage) return cb(null, true);
      return cb(new Error('Only JPG, PNG or WEBP images are allowed'));
    }
    return cb(new Error('Unexpected upload field: ' + file.fieldname));
  },
});

module.exports = { upload, uploadCsv, uploadMedia };
