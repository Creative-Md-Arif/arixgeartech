const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const reviews = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');

/* helpful votes — moderate per-IP budget (dedupe is per account/IP hash) */
const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 40 : 400,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many votes — try again in 15 minutes.' },
});

// GET /api/reviews/mine — JWT: every review this account has written
// (all approval states, so the customer sees their pending reviews too)
router.get('/mine', protect, reviews.listMine);

// POST /api/reviews/:id/helpful  {vote: 1 | -1}
router.post('/:id/helpful', voteLimiter, reviews.voteHelpful);

module.exports = router;
