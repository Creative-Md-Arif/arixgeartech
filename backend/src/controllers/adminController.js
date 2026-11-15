/* Phase 4 (4.5) — adminController.js is now a BARREL.
   The implementation lives in src/controllers/admin/{_shared,orders,catalog,customers,system}.js;
   every existing import (adminRoutes, QA scripts) keeps working unchanged. */
module.exports = {
  ...require('./admin/orders'),
  ...require('./admin/catalog'),
  ...require('./admin/customers'),
  ...require('./admin/system'),
};
