const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const banner = require('../controllers/bannerController');

/* CTA click ping — generous (every visitor click counts) but capped so a
   script can't inflate the leaderboard */
const clickLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 60 : 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// public (admin CRUD lives at /api/admin/banners)
router.get('/', banner.publicList);
router.post('/:id/click', clickLimiter, banner.click);

module.exports = router;
