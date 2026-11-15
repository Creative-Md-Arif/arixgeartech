const router = require('express').Router();
const c = require('../controllers/settingController');

// public (admin settings live at /api/admin/settings)
router.get('/payment', c.publicPayment);
router.get('/shipping', c.publicShipping);
router.get('/content', c.publicContent);
router.get('/pixel', c.publicPixel);
router.get('/chat', c.publicChat);
router.get('/size-guide', c.publicSizeGuide);
router.get('/flash-sale', c.publicFlashSale);

module.exports = router;
