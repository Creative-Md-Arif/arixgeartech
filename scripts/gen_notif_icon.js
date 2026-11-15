/* Task 37 — generate 192x192 notification icon PNG (no deps).
 * Brand: orange #ff5a00 plate + black dumbbell (pure rect drawing).
 * Output: frontend/public/assets/notif-icon.png (+ copy to qa-shots)
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const W = 192, H = 192;
const px = Buffer.alloc(W * H * 4); // RGBA

const set = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
};
const rect = (x0, y0, x1, y1, r, g, b) => {
  for (let y = Math.round(y0); y <= Math.round(y1); y++)
    for (let x = Math.round(x0); x <= Math.round(x1); x++) set(x, y, r, g, b);
};
/* rounded rect */
const rrect = (x0, y0, x1, y1, rad, r, g, b) => {
  for (let y = Math.round(y0); y <= Math.round(y1); y++)
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      const dx = Math.max(x0 + rad - x, x - (x1 - rad), 0);
      const dy = Math.max(y0 + rad - y, y - (y1 - rad), 0);
      if (dx * dx + dy * dy <= rad * rad || (dx === 0 || dy === 0)) set(x, y, r, g, b);
    }
};

/* background: orange plate with slight vertical shading + rounded corners (radius 36) */
const R = 36;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = Math.max(R - x, x - (W - 1 - R), 0);
    const dy = Math.max(R - y, y - (H - 1 - R), 0);
    if (dx * dx + dy * dy <= R * R) {
      const shade = 1 - (y / H) * 0.18; // top brighter
      set(x, y, Math.round(0xff * shade), Math.round(0x5a * shade), Math.round(0x00 * shade));
    }
  }
}

/* black dumbbell — centered, plate coords */
const B = [10, 8, 6]; // rgb ~ #0a0806
rect(30, 88, 162, 104, ...B);            // handle
rrect(20, 52, 44, 140, 9, ...B);         // left big plate
rrect(48, 64, 62, 128, 7, ...B);         // left small plate
rrect(148, 52, 172, 140, 9, ...B);       // right big plate
rrect(130, 64, 144, 128, 7, ...B);       // right small plate
/* orange highlight slot on handle (brand pop) */
rect(88, 92, 104, 100, 0xff, 0x5a, 0x00);

/* ---- encode PNG ---- */
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0; // filter none
  px.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}
const crcTable = [...Array(256)].map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'download', 'forged-full-project', 'frontend', 'public', 'assets', 'notif-icon.png');
fs.writeFileSync(out, png);
console.log('written', out, png.length, 'bytes');
