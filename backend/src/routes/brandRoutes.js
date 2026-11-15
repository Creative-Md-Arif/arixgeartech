const router = require('express').Router();
const c = require('../controllers/brandController');

/* public brand endpoints (Phase 2 — v2 catalog) */
router.get('/', c.list);            // ?featured=true — facet list w/ product counts
router.get('/:slug', c.bySlug);     // one active brand + count

module.exports = router;
