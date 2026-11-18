const test = require('node:test');
const assert = require('node:assert/strict');
const Banner = require('../src/models/Banner');
const storage = require('../src/services/storageService');
const cache = require('../src/services/cache');

const originalSaveImage = storage.saveImage;
const originalDeleteImage = storage.deleteImage;
let uploads = [];
let deleted = [];
storage.saveImage = async (_file, _folder, kind) => {
  const asset = { url: `/uploads/test-${uploads.length + 1}`, publicId: `test-${uploads.length + 1}` };
  uploads.push({ asset, kind });
  return asset;
};
storage.deleteImage = async (publicId) => { deleted.push(publicId); };
const bannerController = require('../src/controllers/bannerController');
storage.saveImage = originalSaveImage;
storage.deleteImage = originalDeleteImage;

function replace(object, key, value) {
  const original = object[key];
  object[key] = value;
  return () => { object[key] = original; };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function imageFile(size = 16) {
  const buffer = Buffer.alloc(size);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return { buffer, size, mimetype: 'image/jpeg' };
}

function videoFile() {
  const buffer = Buffer.alloc(16);
  buffer.write('ftyp', 4, 'ascii');
  return { buffer, size: buffer.length, mimetype: 'video/mp4' };
}

function editableBanner(overrides = {}) {
  const banner = {
    _id: '507f1f77bcf86cd799439011',
    title: 'Banner title',
    subtitle: '',
    ctaText: 'SHOP NOW',
    titleBn: '',
    subtitleBn: '',
    ctaTextBn: '',
    link: '/shop',
    position: 'hero',
    order: 0,
    active: true,
    startsAt: null,
    endsAt: null,
    mediaType: 'image',
    image: { url: '/uploads/old.jpg', publicId: 'old-image' },
    video: { url: '', publicId: null },
    poster: { url: '', publicId: null },
    toObject() { return { ...this }; },
    async save() {},
    async deleteOne() {},
    ...overrides,
  };
  return banner;
}

test('public banner payload preserves the storefront id and position filter', async () => {
  const live = { _id: '507f1f77bcf86cd799439011', title: 'Hero', mediaType: 'image' };
  let liveQuery;
  let cached;
  const restoreFind = replace(Banner, 'find', (query) => {
    if (query.active) liveQuery = query;
    return {
      sort() { return this; },
      select() { return this; },
      lean: async () => query.active ? [live] : [],
    };
  });
  const restoreGet = replace(cache, 'get', () => null);
  const restoreSet = replace(cache, 'set', (_key, value) => { cached = value; });
  try {
    const res = response();
    await bannerController.publicList({ query: { position: 'hero' } }, res, assert.fail);
    assert.equal(liveQuery.position, 'hero');
    assert.equal(String(res.body.items[0].id), live._id);
    assert.equal(cached, res.body);
  } finally {
    restoreFind();
    restoreGet();
    restoreSet();
  }
});

test('click ping returns not-found for an inactive or missing banner', async () => {
  const restoreUpdate = replace(Banner, 'updateOne', async () => ({ matchedCount: 0 }));
  try {
    const res = response();
    await bannerController.click({ params: { id: '507f1f77bcf86cd799439011' } }, res, assert.fail);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { ok: false });
  } finally {
    restoreUpdate();
  }
});

test('unsafe protocol-relative banner links are rejected before media upload', async () => {
  uploads = [];
  const res = response();
  await bannerController.create({
    body: { title: 'Bad link', link: '//outside.example/path' },
    files: { image: [imageFile()] },
  }, res, assert.fail);
  assert.equal(res.statusCode, 400);
  assert.equal(uploads.length, 0);
});

test('duplicate retains Bengali copy, caps order and invalidates public cache', async () => {
  const source = editableBanner({
    titleBn: 'বাংলা শিরোনাম',
    subtitleBn: 'বাংলা বিবরণ',
    ctaTextBn: 'এখনই দেখুন',
  });
  let created;
  let bumps = 0;
  const restoreFindById = replace(Banner, 'findById', async () => source);
  const restoreFindOne = replace(Banner, 'findOne', () => ({
    sort() { return this; },
    select: async () => ({ order: 999 }),
  }));
  const restoreCreate = replace(Banner, 'create', async (doc) => {
    created = doc;
    return { _id: '507f1f77bcf86cd799439012', ...doc };
  });
  const restoreBump = replace(cache, 'bump', () => { bumps += 1; });
  try {
    const res = response();
    await bannerController.duplicate({ params: { id: source._id } }, res, assert.fail);
    assert.equal(res.statusCode, 201);
    assert.equal(created.titleBn, source.titleBn);
    assert.equal(created.subtitleBn, source.subtitleBn);
    assert.equal(created.ctaTextBn, source.ctaTextBn);
    assert.equal(created.order, 999);
    assert.equal(created.active, false);
    assert.equal(bumps, 1);
  } finally {
    restoreFindById();
    restoreFindOne();
    restoreCreate();
    restoreBump();
  }
});

test('updating one duplicate does not delete media still referenced by another', async () => {
  uploads = [];
  deleted = [];
  const banner = editableBanner();
  let bumps = 0;
  const restoreFindById = replace(Banner, 'findById', async () => banner);
  const restoreCount = replace(Banner, 'countDocuments', async () => 1);
  const restoreBump = replace(cache, 'bump', () => { bumps += 1; });
  try {
    const res = response();
    await bannerController.update({
      params: { id: banner._id },
      body: { mediaType: 'image' },
      files: { image: [imageFile()] },
    }, res, assert.fail);
    assert.equal(res.statusCode, 200);
    assert.equal(banner.image.publicId, uploads[0].asset.publicId);
    assert.deepEqual(deleted, []);
    assert.equal(bumps, 1);
  } finally {
    restoreFindById();
    restoreCount();
    restoreBump();
  }
});

test('clearing a video poster removes its stored reference', async () => {
  uploads = [];
  deleted = [];
  const banner = editableBanner({
    mediaType: 'video',
    video: { url: '/uploads/clip.mp4', publicId: 'clip' },
    poster: { url: '/uploads/poster.jpg', publicId: 'poster' },
  });
  const restoreFindById = replace(Banner, 'findById', async () => banner);
  const restoreCount = replace(Banner, 'countDocuments', async () => 0);
  const restoreBump = replace(cache, 'bump', () => {});
  try {
    const res = response();
    await bannerController.update({
      params: { id: banner._id },
      body: { mediaType: 'video', removePoster: 'true' },
      files: {},
    }, res, assert.fail);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(banner.poster, { url: '', publicId: null });
    assert.deepEqual(deleted, ['poster']);
  } finally {
    restoreFindById();
    restoreCount();
    restoreBump();
  }
});

test('failed banner document creation removes the newly uploaded file', async () => {
  uploads = [];
  deleted = [];
  const restoreCreate = replace(Banner, 'create', async () => { throw new Error('database write failed'); });
  try {
    let forwarded;
    const res = response();
    await bannerController.create({
      body: { title: 'Valid banner', link: '/shop', mediaType: 'image' },
      files: { image: [imageFile()] },
    }, res, (error) => { forwarded = error; });
    assert.equal(forwarded.message, 'database write failed');
    assert.equal(uploads.length, 1);
    assert.deepEqual(deleted, [uploads[0].asset.publicId]);
  } finally {
    restoreCreate();
  }
});

test('malformed reorder rows return a client error instead of a server error', async () => {
  const res = response();
  await bannerController.reorder({ body: { items: [null] } }, res, assert.fail);
  assert.equal(res.statusCode, 400);
});
