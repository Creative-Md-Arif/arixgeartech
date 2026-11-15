const router = require('express').Router();
const c = require('../controllers/messageController');
const { protectOptional, protect } = require('../middleware/auth');

// POST /api/messages — storefront contact form (public, guest OK; logged-in senders bind the thread)
router.post('/', protectOptional, c.create);
// Task 37 — customer inbox (JWT)
router.get('/mine', protect, c.mine);
router.post('/mine/read', protect, c.markMineRead);

module.exports = router;
