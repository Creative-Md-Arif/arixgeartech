const express = require('express');
const router = express.Router();
const device = require('../controllers/deviceController');
const { protect, protectOptional } = require('../middleware/auth');

/* Phase 4 (4.3) — FCM device tokens. Registration is anonymous-friendly
   (JWT optional) so guest carts can still receive order pushes; account
   binding happens automatically when a token rides along. */
router.post('/', protectOptional, device.register);
router.delete('/', protectOptional, device.remove); // audit fix — was fully unauthenticated
router.get('/mine', protect, device.mine);

module.exports = router;
