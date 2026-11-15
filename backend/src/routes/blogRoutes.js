const router = require('express').Router();
const blog = require('../controllers/blogController');

/* Public Journal — published posts only */
router.get('/', blog.list);
router.get('/:slug', blog.get);

module.exports = router;
