const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const questions = require('../controllers/questionController');
const { protectOptional } = require('../middleware/auth');

/* helpful votes — moderate per-IP budget (dedupe is per account/IP hash, same
   pattern as the review helpful votes) */
const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 40 : 400,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many votes — try again later.' },
});

/* mounted at /api/questions */
// POST /api/questions/:id/helpful  {vote: 1 | -1}
router.post('/:id/helpful', voteLimiter, protectOptional, questions.voteHelpful);

module.exports = router;
