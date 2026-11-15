const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/orderController');
const { protectOptional, protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

/* Phone-suffix endpoints (track / cancel / invoice / returns) prove ownership
   with the checkout phone — tighter per-IP budget so the 6-digit suffix can't
   be brute-forced. Dev gets headroom for QA suites. */
const proofLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 400,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many attempts — try again in 15 minutes.' },
});

// Guest orders allowed — protectOptional links account when token present
router.post('/', protectOptional, upload.single('screenshot'), c.placeOrder);
router.post('/preview', protectOptional, c.preview); // checkout totals preview — no order created (Task 56-a: token → redemption preview)

/* phone-proof endpoints (limiter shared) */
router.get('/track/:orderNumber', proofLimiter, c.track);
router.patch('/:orderNumber/cancel', proofLimiter, protectOptional, c.cancelByCustomer);
router.get('/:orderNumber/invoice.pdf', proofLimiter, protectOptional, c.invoice);
router.post('/:orderNumber/returns', proofLimiter, protectOptional, c.requestReturn);

router.get('/my', protect, c.myOrders);
router.get('/my/returns', protect, c.myReturns); // Phase 6b — account returns list

module.exports = router;
