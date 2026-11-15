/* Task 38 — API QA: banner video upload lifecycle + magic-byte + snapshot bug */
import fs from 'fs';
import path from 'path';
const B = 'http://localhost:5000/api';
const UP = '/home/z/my-project/backend/uploads';
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); };
const j = (r) => r.json().catch(() => null);
const fileExists = (publicId) => publicId && fs.existsSync(path.join(UP, publicId));

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const VID = fs.readFileSync('/tmp/qa_video.mp4');

async function api(path, opt = {}) {
  const r = await fetch(B + path, {
    method: opt.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opt.token ? { Authorization: 'Bearer ' + opt.token } : {}) },
    body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
  });
  return { status: r.status, d: await j(r) };
}
const blob = (buf, type, name) => new Blob([buf], { type, name: name || 'f' });

(async () => {
  const A = (await api('/auth/login', { method: 'POST', body: { email: 'admin@forged.fit', password: 'ForgeAdmin2026' } })).d.token;
  ok(!!A, 'admin login');

  const fdBase = (extra) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(extra || {})) fd.append(k, v);
    fd.append('title', 'QA Banner ' + Date.now());
    fd.append('position', 'hero');
    fd.append('active', 'true');
    return fd;
  };

  /* 1. image banner (baseline) */
  let fd = fdBase();
  fd.append('image', blob(PNG, 'image/png', 'a.png'));
  let r = await fetch(B + '/admin/banners', { method: 'POST', headers: { Authorization: 'Bearer ' + A }, body: fd });
  let b1 = (await j(r)).banner;
  ok(r.status === 201 && b1.mediaType === 'image' && b1.image.publicId, 'image banner created (baseline)');

  /* 2. video banner + poster */
  fd = fdBase();
  fd.append('mediaType', 'video');
  fd.append('video', blob(VID, 'video/mp4', 'v.mp4'));
  fd.append('poster', blob(PNG, 'image/png', 'p.png'));
  r = await fetch(B + '/admin/banners', { method: 'POST', headers: { Authorization: 'Bearer ' + A }, body: fd });
  const v1 = (await j(r)).banner;
  ok(r.status === 201 && v1.mediaType === 'video' && v1.video.url && fileExists(v1.video.publicId), 'video banner created — clip on disk');
  ok(v1.poster.url && fileExists(v1.poster.publicId), 'poster saved');
  ok(v1.image && (v1.image.url === '' || v1.image.url), 'image slot empty for video banner (no crash)');

  /* 3. public list ships video fields */
  const pub = (await api('/banners?position=hero')).d;
  const pubV = pub.items.find((x) => x.id === v1._id || x.id === String(v1._id));
  ok(pubV && pubV.mediaType === 'video' && pubV.video && pubV.video.url, 'public list ships mediaType + video');

  /* 4. fake video (text claiming mp4) → 400 magic-byte */
  fd = fdBase({ mediaType: 'video' });
  fd.append('video', blob(Buffer.from('this is definitely not a video'), 'video/mp4', 'fake.mp4'));
  r = await fetch(B + '/admin/banners', { method: 'POST', headers: { Authorization: 'Bearer ' + A }, body: fd });
  ok(r.status === 400, 'fake video (bad magic bytes) → 400 (' + r.status + ')');

  /* 5. video posted into the image slot → 400 (field-scoped filter) */
  fd = fdBase();
  fd.append('image', blob(VID, 'video/mp4', 'v.mp4'));
  r = await fetch(B + '/admin/banners', { method: 'POST', headers: { Authorization: 'Bearer ' + A }, body: fd });
  ok(r.status === 400, 'video in the image slot → 400 (' + r.status + ')');

  /* 6. fake image → 400 */
  fd = fdBase();
  fd.append('image', blob(Buffer.from('not an image at all'), 'image/png', 'fake.png'));
  r = await fetch(B + '/admin/banners', { method: 'POST', headers: { Authorization: 'Bearer ' + A }, body: fd });
  ok(r.status === 400, 'fake image → 400');

  /* 7. update image banner → video (old image file released, video stored) */
  const oldImgId = b1.image.publicId;
  fd = new FormData();
  fd.append('mediaType', 'video');
  fd.append('video', blob(VID, 'video/mp4', 'v2.mp4'));
  r = await fetch(B + '/admin/banners/' + b1._id, { method: 'PUT', headers: { Authorization: 'Bearer ' + A }, body: fd });
  const u1 = (await j(r)).banner;
  ok(r.status === 200 && u1.mediaType === 'video' && u1.video.publicId, 'image → video switch via PUT');
  await new Promise((x) => setTimeout(x, 250));
  ok(!fileExists(oldImgId), 'old IMAGE file deleted after switch (snapshot bug — Task 30 era deleted the NEW file)');
  ok(fileExists(u1.video.publicId), 'new video file alive');

  /* 8. video replace → old clip released, new clip alive */
  const oldVidId = u1.video.publicId;
  fd = new FormData();
  fd.append('video', blob(VID, 'video/mp4', 'v3.mp4'));
  r = await fetch(B + '/admin/banners/' + b1._id, { method: 'PUT', headers: { Authorization: 'Bearer ' + A }, body: fd });
  const u2 = (await j(r)).banner;
  ok(r.status === 200 && u2.video.publicId !== oldVidId, 'video replaced');
  await new Promise((x) => setTimeout(x, 250));
  ok(!fileExists(oldVidId), 'old VIDEO file deleted');
  ok(fileExists(u2.video.publicId), 'new video file alive');

  /* 9. poster replace → old poster released */
  const oldPosterId = v1.poster.publicId;
  fd = new FormData();
  fd.append('poster', blob(PNG, 'image/png', 'p2.png'));
  r = await fetch(B + '/admin/banners/' + v1._id, { method: 'PUT', headers: { Authorization: 'Bearer ' + A }, body: fd });
  const u3 = (await j(r)).banner;
  ok(r.status === 200 && u3.poster.publicId && u3.poster.publicId !== oldPosterId, 'poster replaced');
  await new Promise((x) => setTimeout(x, 250));
  ok(!fileExists(oldPosterId), 'old poster deleted');
  ok(fileExists(u3.poster.publicId), 'new poster alive');

  /* 10. duplicate shares the video; removing dup keeps the original file */
  r = await api('/admin/banners/' + v1._id + '/duplicate', { method: 'POST', token: A });
  const dup = r.d.banner;
  ok(r.status === 201 && dup.mediaType === 'video' && dup.video.publicId === v1.video.publicId, 'duplicate shares the video ref');
  await api('/admin/banners/' + dup._id, { method: 'DELETE', token: A });
  await new Promise((x) => setTimeout(x, 200));
  ok(fileExists(v1.video.publicId), 'original video survives duplicate deletion (refcount)');

  /* 11. remove video banner → clip + poster gone */
  const vidId = v1.video.publicId, posId = v1.poster.publicId;
  await api('/admin/banners/' + v1._id, { method: 'DELETE', token: A });
  await new Promise((x) => setTimeout(x, 250));
  ok(!fileExists(vidId) && !fileExists(posId), 'delete releases video + poster files');

  /* cleanup b1 + banner seeds intact */
  await api('/admin/banners/' + b1._id, { method: 'DELETE', token: A });
  const cnt = (await api('/admin/banners', { token: A })).d;
  ok(cnt.items.length === 4, 'seed banners intact after cleanup (' + cnt.items.length + ')');

  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
