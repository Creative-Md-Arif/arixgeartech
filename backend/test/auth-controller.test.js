const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const User = require('../src/models/User');
const emailService = require('../src/services/emailService');
const originalPasswordReset = emailService.sendPasswordReset;
const originalEmailOtp = emailService.sendEmailOtp;
let otpSends = 0;
emailService.sendPasswordReset = async () => ({ sent: true });
emailService.sendEmailOtp = async () => { otpSends += 1; return { sent: true }; };
const authController = require('../src/controllers/authController');
emailService.sendPasswordReset = originalPasswordReset;
emailService.sendEmailOtp = originalEmailOtp;

function replace(object, key, value) {
  const original = object[key];
  object[key] = value;
  return () => { object[key] = original; };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}

test('reset token helper waits for persistence before returning the URL', async () => {
  let finishSave;
  let persisted = false;
  const user = {
    role: 'customer',
    async save(options) {
      assert.deepEqual(options, { validateBeforeSave: false });
      await new Promise((resolve) => { finishSave = resolve; });
      persisted = true;
    },
  };
  const pending = authController._issueResetToken(user, {
    protocol: 'https',
    get: () => 'shop.example',
  });
  await Promise.resolve();
  assert.equal(persisted, false);
  finishSave();
  const issued = await pending;
  assert.equal(persisted, true);
  assert.match(issued.resetUrl, /^https:\/\/shop\.example\/reset-password\?token=/);
  assert.equal(user.resetTokenHash, crypto.createHash('sha256').update(issued.token).digest('hex'));
});

test('phone login selects the OTP cooldown timestamp and honors the cooldown', async () => {
  let selectedFields = '';
  otpSends = 0;
  const user = {
    email: 'customer@example.com',
    role: 'customer',
    emailVerified: false,
    emailOtpSentAt: new Date(),
    matchPassword: async () => true,
  };
  const restoreFind = replace(User, 'findOne', (filter) => ({
    select(fields) {
      assert.deepEqual(filter, { phone: '01712345678' });
      selectedFields = fields;
      return Promise.resolve(user);
    },
  }));
  try {
    const res = response();
    await authController.login({ body: { identifier: '01712-345678', password: 'secret' } }, res, assert.fail);
    assert.match(selectedFields, /\+emailOtpSentAt/);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.needsVerification, true);
    assert.ok(res.body.retryAfter > 0);
    assert.equal(otpSends, 0);
  } finally {
    restoreFind();
  }
});

test('login returns a validation response when the request body is missing', async () => {
  const res = response();
  await authController.login({ body: undefined }, res, assert.fail);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /required/i);
});

test('logout expires the browser session cookie', async () => {
  const res = response();
  await authController.logout({}, res);
  assert.match(res.headers['Set-Cookie'], /^arix_session=;/);
  assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
});

test('forgot-password response does not reveal account existence in production', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let existing = false;
  const user = {
    email: 'customer@example.com',
    name: 'Customer',
    role: 'customer',
    async save() {},
  };
  const restoreFind = replace(User, 'findOne', async () => existing ? user : null);
  try {
    const req = { body: { email: 'customer@example.com' }, protocol: 'https', get: () => 'shop.example' };
    const missing = response();
    await authController.forgotPassword(req, missing, assert.fail);
    existing = true;
    const present = response();
    await authController.forgotPassword(req, present, assert.fail);
    assert.deepEqual(present.body, missing.body);
    assert.equal(present.statusCode, missing.statusCode);
  } finally {
    restoreFind();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test('resend-verification response does not reveal cooldown status in production', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let user = null;
  const restoreFind = replace(User, 'findOne', () => ({
    select() { return Promise.resolve(user); },
  }));
  try {
    const req = { body: { email: 'customer@example.com' } };
    const missing = response();
    await authController.resendVerification(req, missing, assert.fail);
    user = {
      email: 'customer@example.com',
      emailVerified: false,
      emailOtpSentAt: new Date(),
    };
    const cooling = response();
    await authController.resendVerification(req, cooling, assert.fail);
    assert.deepEqual(cooling.body, missing.body);
    assert.equal(cooling.statusCode, missing.statusCode);
  } finally {
    restoreFind();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});
