const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/newsletterController');
const { protectOptional } = require('../middleware/auth');

/* newsletter signup — generous for humans, tight against abuse
   (dev/QA bucket wide so suites don't trip it) */
const subscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 8 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many newsletter attempts — try again in an hour.' },
});

// POST /api/newsletter — public signup → welcome coupon ARIX10 (Task 49)
router.post('/', subscribeLimiter, protectOptional, c.subscribe);

// GET /api/newsletter/unsubscribe — one-click opt-out (Phase 4, Subscriber list)
router.get('/unsubscribe', c.unsubscribe);

module.exports = router;
