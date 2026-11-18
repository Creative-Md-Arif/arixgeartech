const test = require('node:test');
const assert = require('node:assert/strict');
const Post = require('../src/models/Post');
const blog = require('../src/controllers/blogController');

function replace(object, key, value) {
  const original = object[key];
  object[key] = value;
  return () => { object[key] = original; };
}
function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('public list only exposes published posts and clamps pagination inputs', async () => {
  let query;
  const restoreFind = replace(Post, 'find', (q) => {
    query = q;
    return { sort() { return this; }, skip(n) { this.offset = n; return this; }, limit(n) { this.pageSize = n; return this; }, select() { return this; }, then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); } };
  });
  const restoreCount = replace(Post, 'countDocuments', async () => 0);
  try {
    const res = response();
    await blog.list({ query: { page: '-3', limit: '1000', tag: 'Guide' } }, res, assert.fail);
    assert.deepEqual(query, { published: true, tags: 'guide' });
    assert.equal(res.body.page, 1);
    assert.equal(res.body.pages, 1);
  } finally { restoreFind(); restoreCount(); }
});

test('admin create treats string false as a draft and rejects malformed publish values', async () => {
  let created;
  const restoreExists = replace(Post, 'exists', async () => null);
  const restoreCreate = replace(Post, 'create', async (doc) => { created = doc; return { _id: 'post-id', ...doc }; });
  try {
    const res = response();
    await blog.adminCreate({ body: { title: 'A guide', body: 'Text', published: 'false' } }, res, assert.fail);
    assert.equal(res.statusCode, 201);
    assert.equal(created.published, false);
    assert.equal(created.publishedAt, null);
    const invalid = response();
    await blog.adminCreate({ body: { title: 'Another guide', body: 'Text', published: 'no' } }, invalid, assert.fail);
    assert.equal(invalid.statusCode, 400);
  } finally { restoreExists(); restoreCreate(); }
});

test('missing public post returns a clean 404', async () => {
  const restoreFind = replace(Post, 'findOne', () => ({ lean: async () => null }));
  try {
    const res = response();
    await blog.get({ params: { slug: 'missing' } }, res, assert.fail);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Post not found' });
  } finally { restoreFind(); }
});
