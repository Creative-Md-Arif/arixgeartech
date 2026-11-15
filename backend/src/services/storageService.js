const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { cloudinary, isCloudinaryEnabled } = require('../config/cloudinary');

/* Step 6 — IMAGE DERIVATIVES. sharp is optional: when present, local uploads
   get a 420px .webp thumbnail next to the original (uploads/thumbs/) and the
   descriptor carries { thumb } — grids render ~10× fewer bytes. When sharp
   is missing the thumbnail generation is skipped silently (thumb = url).
   Cloudinary-hosted files don't need re-encoding: thumbUrl() derives the
   documented w_420,q_auto,f_auto transformation from the delivery URL. */
let sharp = null;
try { sharp = require('sharp'); } catch (_e) { /* optional dependency */ }
const THUMB_DIR = path.join(__dirname, '..', '..', 'uploads', 'thumbs');
const THUMB_WIDTH = 420;

/* Cloudinary delivery URL → transformed thumbnail URL (idempotent) */
function thumbUrl(url, width = THUMB_WIDTH) {
  const s = String(url || '');
  if (!s) return s;
  /* only Cloudinary delivery URLs (/upload/ + optional existing transforms) */
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/[^/]+\/)upload\/(?:([a-zA-Z0-9_.,-]+)\/)?(.+)$/.exec(s);
  if (!m) return s;
  /* existing transformation segment (no slash, contains commas/dots) → replace;
     otherwise insert ours right after upload/ */
  const [, base, existing, rest] = m;
  if (existing && /,/.test(existing)) return base + 'upload/' + existing + '/' + rest; // already transformed
  return `${base}upload/w_${width},q_auto,f_auto/${rest}`;
}

/* local disk thumbnail — returns the relative /uploads/thumbs/<name> or null */
async function makeLocalThumb(file, name) {
  if (!sharp) return null;
  try {
    fs.mkdirSync(THUMB_DIR, { recursive: true });
    const thumbName = name.replace(/\.(png|jpe?g|webp)$/i, '') + '.webp';
    const out = path.join(THUMB_DIR, thumbName);
    await sharp(file.buffer).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toFile(out);
    return '/uploads/thumbs/' + thumbName;
  } catch (_e) { return null; }
}

/* Step 7 — same pipeline from an ON-DISK source file (thumbnail backfill /
   prefetch queue operate on uploads that were written earlier, no buffer). */
async function makeLocalThumbFromPath(srcPath, name) {
  if (!sharp) return null;
  try {
    if (!fs.existsSync(srcPath)) return null;
    fs.mkdirSync(THUMB_DIR, { recursive: true });
    const thumbName = name.replace(/\.(png|jpe?g|webp)$/i, '') + '.webp';
    const out = path.join(THUMB_DIR, thumbName);
    await sharp(srcPath).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toFile(out);
    return '/uploads/thumbs/' + thumbName;
  } catch (_e) { return null; }
}

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

/* audit fix — the local-disk fallback previously trusted the client-supplied
   filename extension; a "image/png" upload named payload.svg (or .html) was
   written as-is and served by express.static, giving stored XSS on the API
   origin. Extensions are now derived server-side: magic-byte sniff first,
   then the multer-validated mimetype, then a hard reject. */
const EXT_BY_MIME = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
};
function sniffExt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return '.webp';
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return '.mp4';
  return null;
}

/**
 * File Upload System.
 * Saves an in-memory image (multer) to Cloudinary when configured,
 * otherwise to backend/uploads/ and serves it at /uploads/<file>.
 * Returns a uniform descriptor: { url, publicId, thumb }
 * Step 6 — thumb: a grid-sized derivative (sharp local / Cloudinary transform).
 */
async function saveImage(file, folder = 'forged', kind = 'image') {
  if (!file) throw new Error('No file provided');
  if (isCloudinaryEnabled) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: kind, overwrite: false },
        (err, result) => {
          if (err) return reject(err);
          resolve({ url: result.secure_url, publicId: result.public_id, thumb: thumbUrl(result.secure_url) });
        }
      );
      stream.end(file.buffer);
    });
  }

  // Local fallback
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = sniffExt(file.buffer) || EXT_BY_MIME[String(file.mimetype || '').toLowerCase()] || null;
  if (!ext) throw new Error('Unsupported media type — could not verify a safe image/video format');
  const name = `${folder.replace(/[^\w-]/g, '_')}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer);
  const thumb = kind === 'image' ? await makeLocalThumb(file, name) : null;
  return { url: `/uploads/${name}`, publicId: name, thumb: thumb || `/uploads/${name}` };
}

/** Delete a previously stored image (both providers). Fire-and-forget safe. */
async function deleteImage(publicId) {
  if (!publicId) return;
  try {
    if (isCloudinaryEnabled && !publicId.startsWith('/uploads/')) {
      await cloudinary.uploader.destroy(publicId);
    } else {
      const p = path.join(UPLOAD_DIR, path.basename(publicId.replace('/uploads/', '')));
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch (e) {
    console.warn('[storage] delete failed:', e.message);
  }
}

module.exports = { saveImage, deleteImage, thumbUrl, makeLocalThumb, makeLocalThumbFromPath, UPLOAD_DIR, THUMB_DIR, THUMB_WIDTH };
