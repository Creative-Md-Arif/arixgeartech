const router = require('express').Router();
const seo = require('../controllers/seoController');

/* public — the storefront head reads everything in one call */
router.get('/', seo.publicAll);

module.exports = router;
