/* ArixGear — online payment routes (Task 40, SSLCOMMERZ).
   init: storefront → backend (phone-proof protected)
   ipn:  gateway server → backend (server-to-server, form-encoded)
   validate/fail/cancel: gateway BROWSER redirects (302 → storefront pages) */
const router = require('express').Router();
const c = require('../controllers/paymentController');
const { protectOptional } = require('../middleware/auth');

router.post('/init', protectOptional, c.init);
router.post('/ipn', c.ipn);
router.get('/validate/:orderNumber', c.validate);
router.get('/fail/:orderNumber', c.fail);
router.get('/cancel/:orderNumber', c.cancel);

module.exports = router;
