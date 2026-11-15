const express = require('express');
const router = express.Router();
const fc = require('../controllers/flashCampaignController');

/* Phase 4 (4.1) — flash campaigns, public side: the current live campaign
   (there is at most one — soonest end wins) + its product cards. Admin CRUD
   mounted under /api/admin/flash-campaigns (adminRoutes). */
router.get('/current', fc.current);

module.exports = router;
module.exports.admin = {
  list: fc.adminList,
  create: fc.adminCreate,
  update: fc.adminUpdate,
  apply: fc.adminApply,
  end: fc.adminEnd,
  remove: fc.adminDelete,
};
