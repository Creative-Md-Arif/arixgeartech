const router = require('express').Router();
const badge = require('../controllers/badgeController');

// GET /api/badges — active badges for storefront chip resolution (public)
router.get('/', badge.publicList);

module.exports = router;
