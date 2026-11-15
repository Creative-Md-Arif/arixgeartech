/* AI SYSTEM — public storefront routes (mounted at /api/ai).
   /api/ai/chat carries its own strict rate limiter in server.js
   (cost-efficient: LLM endpoints must never be an open tap). */
const router = require('express').Router();
const ai = require('../controllers/aiController');

router.get('/config', ai.config);
router.get('/faqs', ai.faqs);
router.post('/chat', ai.chat);

module.exports = router;
