const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const service = require('../controllers/serviceController');
const { protect, protectOptional } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

/* Phase 4 (4.2) — after-sales public APIs.
   Warranty registration + lookup, service tickets (open + track), centers.
   Admin management mounted under /api/admin/* (adminRoutes). */

/* audit fix — the warranty/ticket lookups prove ownership with a 6-digit
   phone suffix, exactly like /orders/track; they now share the same tight
   per-IP budget so the suffix cannot be brute-forced. */
const proofLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 400,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many attempts — try again in 15 minutes.' },
});

/* warranty */
router.post('/warranty', protectOptional, service.registerWarranty);
router.get('/warranty/:regNumber', proofLimiter, service.lookupWarranty);

/* tickets — multipart (up to 3 proof images) or plain JSON */
router.post('/tickets', protectOptional, upload.array('attachments', 3), service.createTicket);
router.get('/tickets/:ticketNumber', proofLimiter, protectOptional, service.trackTicket);

/* centers */
router.get('/centers', service.listCenters);

/* account-scoped ticket list lives on /api/my/* (Phase 6 wires the page);
   keep this mount public-shape only. */

module.exports = router;
