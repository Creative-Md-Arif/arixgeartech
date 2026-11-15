const router = require('express').Router();
const c = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', c.register);
router.post('/login', c.login);
/* Task 51 — email verification: OTP verify + resend (rate-limited in server.js) */
router.post('/verify-email', c.verifyEmail);
router.post('/resend-verification', c.resendVerification);
router.get('/me', protect, c.me);
router.post('/logout', c.logout); // Step 4 — clears the HttpOnly session cookie

/* Task 42 — account packs: address book, profile, password, loyalty */
router.get('/addresses', protect, c.listAddresses);
router.post('/addresses', protect, c.addAddress);
router.put('/addresses/:id', protect, c.updateAddress);
router.delete('/addresses/:id', protect, c.deleteAddress);
router.patch('/profile', protect, c.updateProfile);
router.post('/change-password', protect, c.changePassword);
router.get('/loyalty', protect, c.loyalty);

/* forgot password (public, rate-limited in server.js) */
router.post('/forgot-password', c.forgotPassword);
router.get('/reset-password/verify', c.verifyResetToken); // pre-flight for reset pages
router.post('/reset-password', c.resetPassword);

module.exports = router;
