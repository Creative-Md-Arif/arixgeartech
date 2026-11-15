const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/productController');
const reviews = require('../controllers/reviewController');
const questions = require('../controllers/questionController');
const { protect, protectOptional } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

/* review submission — per-IP budget so bots can't flood the moderation queue
   (dup-content + one-per-account rules live in the controller) */
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 15 : 400,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many reviews submitted — try again later.' },
});

/* question submission — Task 30: same anti-flood budget for the Q&A queue
   (link-spam + duplicate guards live in the controller) */
const questionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 400,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many questions asked — try again later.' },
});

/* static paths MUST sit above /:slug so they aren't eaten as a slug */
router.get('/', c.list);
router.get('/flash', c.flashList); // Task 57 — live flash-sale items (before /:slug)
router.get('/filters', c.filters);
router.get('/search/suggest', c.suggest);

/* dynamic product paths */
router.get('/:slug', c.bySlug);
router.get('/:slug/related', c.related);
router.get('/:slug/stock', c.stock);

/* PDP review & question system (public) */
router.get('/:slug/reviews', protectOptional, reviews.listByProduct); // JWT → `mine` flags
router.post('/:slug/reviews', reviewLimiter, protectOptional, upload.array('images', 3), reviews.create);
router.patch('/:slug/reviews/:revId', protect, reviews.updateMine); // owner edit → re-moderation
router.delete('/:slug/reviews/:revId', protect, reviews.removeMine); // owner delete
router.get('/:slug/questions', protectOptional, questions.listByProduct); // JWT → mine flags
router.post('/:slug/questions', questionLimiter, protectOptional, questions.create);

module.exports = router;
