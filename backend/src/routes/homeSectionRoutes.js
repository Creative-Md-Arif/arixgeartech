const router = require('express').Router();
const hs = require('../controllers/homeSectionController');

// public (admin CRUD lives at /api/admin/home-sections)
router.get('/', hs.publicList);

module.exports = router;
