/* Phase 8 — public deals routes (Centralized Deals & Promotions).
   Mounted at /api/deals — the storefront deals hub + per-deal product grids.
   Live deals only: drafts, pauses and out-of-window deals are invisible here
   (admin sees everything under /api/admin/deals). */
const router = require('express').Router();
const deal = require('../controllers/dealController');

router.get('/', deal.listLive);        // ?type=&featured=1&channel=
router.get('/:slug', deal.getBySlug);  // deal + resolved product grid

module.exports = router;
