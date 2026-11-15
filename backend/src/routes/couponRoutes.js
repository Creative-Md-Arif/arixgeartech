const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/couponController');
const { protectOptional } = require('../middleware/auth');

/* code brute-force protection — one bucket per IP, generous in dev for QA */
const validateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 400,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many coupon attempts — try again in 15 minutes.' },
});

// public (admin CRUD lives at /api/admin/coupons)
router.post('/validate', validateLimiter, protectOptional, c.validate); // JWT → per-user limits
router.get('/active', c.active); // storefront coupon picker (public codes only)

module.exports = router;
