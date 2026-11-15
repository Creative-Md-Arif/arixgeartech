/* Task 42 — PWA icon set generator (pure JS, zero image deps).
   Draws the FORGED brand plate: dark rounded square + orange edge + white
   dumbbell glyph, rasterized manually and encoded as PNG (zlib via node:zlib).
   Outputs: icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
   (all into frontend/public/, apple + 192 also into admin/public/).            */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

/* ---------- minimal PNG encoder (RGBA, 8-bit) ---------- */
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  /* filter 0 per scanline */
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- rasterizer helpers ---------- */
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

function drawIcon(size, { maskable = false } = {}) {
  const img = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    /* simple src-over for antialiased edges */
    const na = a / 255, oa = img[i + 3] / 255;
    const outA = na + oa * (1 - na);
    if (outA <= 0) return;
    img[i] = Math.round((r * na + img[i] * oa * (1 - na)) / outA);
    img[i + 1] = Math.round((g * na + img[i + 1] * oa * (1 - na)) / outA);
    img[i + 2] = Math.round((b * na + img[i + 2] * oa * (1 - na)) / outA);
    img[i + 3] = Math.round(outA * 255);
  };
  /* coverage in [0,1] → alpha */
  const A = (c) => Math.round(Math.max(0, Math.min(1, c)) * 255);

  const DARK = hex('#141414'), ORANGE = hex('#ff5a00'), WHITE = hex('#f5f1ea');

  /* plate: rounded square (inset 12% — safe zone for maskable round masks) */
  const inset = maskable ? size * 0.12 : 0;
  const plateR = maskable ? size * 0.20 : size * 0.22;
  const inPlate = (x, y) => {
    const x0 = inset, x1 = size - inset, y0 = inset, y1 = size - inset;
    if (x < x0 || x > x1 || y < y0 || y > y1) return 0;
    const rx = Math.max(x0 + plateR - x, x - (x1 - plateR), 0);
    const ry = Math.max(y0 + plateR - y, y - (y1 - plateR), 0);
    const d = Math.sqrt(rx * rx + ry * ry);
    return d <= plateR ? 1 : Math.max(0, plateR - d + 0.5); // ~1px AA
  };

  /* dumbbell geometry — centered, spans 62% width */
  const cx = size / 2, cy = size / 2;
  const barH = size * 0.055;                 // connecting bar thickness
  const barW = size * 0.30;                  // half-length of the bar
  const plateW = size * 0.045;               // big outer plates (thickness)
  const plateH = size * 0.30;                // big outer plates (height)
  const innerW = size * 0.030;               // small inner plates
  const innerH = size * 0.20;
  const gap = size * 0.055;                  // offset between inner and outer plates

  const glyph = (x, y) => {
    /* bar */
    if (Math.abs(y - cy) <= barH / 2 && Math.abs(x - cx) <= barW) return 1;
    /* left outer plate */
    if (Math.abs(x - (cx - barW - plateW / 2)) <= plateW / 2 && Math.abs(y - cy) <= plateH / 2) return 1;
    /* right outer plate */
    if (Math.abs(x - (cx + barW + plateW / 2)) <= plateW / 2 && Math.abs(y - cy) <= plateH / 2) return 1;
    /* left inner plate */
    if (Math.abs(x - (cx - barW + gap)) <= innerW / 2 && Math.abs(y - cy) <= innerH / 2) return 1;
    /* right inner plate */
    if (Math.abs(x - (cx + barW - gap)) <= innerW / 2 && Math.abs(y - cy) <= innerH / 2) return 1;
    return 0;
  };

  /* supersample 2×2 for smooth glyph edges */
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = inPlate(x + 0.5, y + 0.5);
      if (p > 0) set(x, y, DARK, A(p));
      /* orange keyline just inside the plate edge (solid mode only) */
      if (!maskable && p > 0) {
        const inset2 = size * 0.045, r2 = size * 0.185;
        const x0 = inset2, x1 = size - inset2, y0 = inset2, y1 = size - inset2;
        if (x + 0.5 > x0 && x + 0.5 < x1 && y + 0.5 > y0 && y + 0.5 < y1) {
          const rx = Math.max(x0 + r2 - (x + 0.5), (x + 0.5) - (x1 - r2), 0);
          const ry = Math.max(y0 + r2 - (y + 0.5), (y + 0.5) - (y1 - r2), 0);
          const d = Math.sqrt(rx * rx + ry * ry);
          const ring = Math.abs(d - r2) <= size * 0.012 ? 1 : 0;
          if (ring) set(x, y, ORANGE, A(ring * p));
        }
      }
      /* glyph (supersampled) */
      let cov = 0;
      for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) cov += glyph(x + dx, y + dy);
      cov /= 4;
      if (cov > 0) set(x, y, WHITE, A(cov * p));
    }
  }
  /* maskable: transparent corners + full-bleed orange floor strip */
  if (maskable) {
    const stripY = size * 0.78;
    for (let y = Math.floor(stripY); y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (inPlate(x + 0.5, y + 0.5) > 0.5) continue;
        set(x, y, ORANGE, 140);
      }
    }
  }
  return img;
}

mkdirSync('frontend/public', { recursive: true });
const outs = [
  ['frontend/public/pwa-icon-192.png', 192, {}],
  ['frontend/public/pwa-icon-512.png', 512, {}],
  ['frontend/public/pwa-maskable-512.png', 512, { maskable: true }],
  ['frontend/public/apple-touch-icon.png', 180, {}],
  ['admin/public/pwa-icon-192.png', 192, {}],
  ['admin/public/pwa-icon-512.png', 512, {}],
];
for (const [path, size, opt] of outs) {
  const png = encodePNG(size, size, drawIcon(size, opt));
  writeFileSync(path, png);
  console.log('wrote', path, (png.length / 1024).toFixed(1) + 'KB');
}
console.log('PWA icon set done');
