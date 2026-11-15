const express = require('express');
const router = express.Router();
const bundle = require('../controllers/bundleController');
const { requirePermission } = require('../middleware/auth');

/* Phase 4 (4.1) — combo bundles.
   Public reads; admin CRUD mounted separately under /api/admin/bundles
   (adminRoutes) so the sub-admin module gate stays in one place. */
router.get('/', bundle.list);
router.get('/:slug', bundle.detail);

module.exports = router;
module.exports.admin = {
  list: bundle.adminList,
  create: bundle.adminCreate,
  update: bundle.adminUpdate,
  remove: bundle.adminDelete,
  guard: requirePermission('catalog'),
};
