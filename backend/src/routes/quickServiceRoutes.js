const router = require('express').Router();
const quickServices = require('../controllers/quickServiceController');
const { protect, adminOnly, requirePermission } = require('../middleware/auth');

router.use(protect, adminOnly, requirePermission('homepage'));

router.get('/', quickServices.get);
router.put('/', quickServices.update);

module.exports = router;
