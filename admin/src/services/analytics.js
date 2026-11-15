/* ArixGear ADMIN services — Google Analytics reporting (Task 26) + order funnel (Task 28) */
import { api } from './http.js';

/* GET /api/admin/analytics/funnel?days=N — GA4 e-commerce funnel report
   configured:false → needs Property ID + service account (SEO → Google Services) */
export const ga4Funnel = (days) => api('/admin/analytics/funnel?days=' + days);

/* GET /api/admin/analytics/orders?days=N — internal order funnel (Task 28):
   placed → verified → shipped → delivered, COD confirmation rate, avg
   fulfillment hours, payment rejection reasons, method split, revenue/AOV. */
export const orderFunnel = (days = 30) => api('/admin/analytics/orders?days=' + days);
