/* ArixGear — route map & lazy registry (Phase 2 architecture).
   ------------------------------------------------------------------
   The full 44-page conversion map lives here as data: every planned
   storefront route is registered with its group + build phase; pages
   that exist load through React.lazy (per-route chunks), pages still
   ahead of us render a clean "launching" panel instead of a 404, so
   the nav never dead-ends and Phase 6 ships by flipping `enabled`.

   Groups (from the conversion spec):
     shopping  — 12 pages · account — 13 · support — 9 · business — 10
   `phase` marks the Phase 6 sprint that builds it (a/b/c/d). */

import { lazy } from 'react';

/* built pages — lazy so every route is its own chunk */
const pages = {
  shop: lazy(() => import('./pages/shop.jsx')),
  product: lazy(() => import('./pages/product.jsx')),
  category: lazy(() => import('./pages/category.jsx')),
  brand: lazy(() => import('./pages/brand.jsx')),
  search: lazy(() => import('./pages/search.jsx')),
  cart: lazy(() => import('./pages/cart.jsx')),
  wishlist: lazy(() => import('./pages/wishlist.jsx')),
  about: lazy(() => import('./pages/about.jsx')),
  guides: lazy(() => import('./pages/guides.jsx')),
  contact: lazy(() => import('./pages/contact.jsx')),
  account: lazy(() => import('./pages/account.jsx')),
  resetPassword: lazy(() => import('./pages/reset-password.jsx')),
  checkout: lazy(() => import('./pages/checkout.jsx')),
  success: lazy(() => import('./pages/success.jsx')),
  trackOrder: lazy(() => import('./pages/track-order.jsx')),
  compare: lazy(() => import('./pages/compare.jsx')),
  flashSale: lazy(() => import('./pages/flash-sale.jsx')),
  blog: lazy(() => import('./pages/blog.jsx')),
  post: lazy(() => import('./pages/post.jsx')),
  paymentSandbox: lazy(() => import('./pages/payment-sandbox.jsx')),
  /* Phase 6b — routed account pages */
  login: lazy(() => import('./pages/login.jsx')),
  register: lazy(() => import('./pages/register.jsx')),
  forgotPassword: lazy(() => import('./pages/forgot-password.jsx')),
  verifyEmail: lazy(() => import('./pages/verify-email.jsx')),
  accountOrders: lazy(() => import('./pages/account-orders.jsx')),
  accountOrder: lazy(() => import('./pages/account-order.jsx')),
  accountProfile: lazy(() => import('./pages/account-profile.jsx')),
  accountAddresses: lazy(() => import('./pages/account-addresses.jsx')),
  accountReviews: lazy(() => import('./pages/account-reviews.jsx')),
  accountReturns: lazy(() => import('./pages/account-returns.jsx')),
  accountNotifications: lazy(() => import('./pages/account-notifications.jsx')),
  /* Phase 6c — support pages */
  faq: lazy(() => import('./pages/faq.jsx')),
  help: lazy(() => import('./pages/help.jsx')),
  policy: lazy(() => import('./pages/policy.jsx')),
  /* Phase 6d — business / discovery pages */
  deals: lazy(() => import('./pages/deals.jsx')),
  newArrivals: lazy(() => import('./pages/new-arrivals.jsx')),
  bestSellers: lazy(() => import('./pages/best-sellers.jsx')),
  featured: lazy(() => import('./pages/featured.jsx')),
  brands: lazy(() => import('./pages/brands.jsx')),
  serviceCenter: lazy(() => import('./pages/service-center.jsx')),
  productRegistration: lazy(() => import('./pages/product-registration.jsx')),
};

export const ROUTES = [
  /* ---------- core ---------- */
  { path: '/', page: 'home', label: 'Home', group: 'core', enabled: true },
  { path: '/shop', page: 'shop', label: 'Shop All', group: 'shopping', enabled: true },
  { path: '/product/:slug', page: 'product', label: 'Product Details', group: 'shopping', enabled: true },

  /* ---------- shopping (12) — Phase 6 sprint a: LIVE ---------- */
  { path: '/category/:slug', page: 'category', label: 'Category', group: 'shopping', enabled: true },
  { path: '/brand/:slug', page: 'brand', label: 'Brand Store', group: 'shopping', enabled: true },
  { path: '/search', page: 'search', label: 'Search', group: 'shopping', enabled: true },
  { path: '/cart', page: 'cart', label: 'Cart', group: 'shopping', enabled: true },
  { path: '/wishlist', page: 'wishlist', label: 'Wishlist', group: 'shopping', enabled: true },
  { path: '/compare', page: 'compare', label: 'Compare', group: 'shopping', enabled: true },
  { path: '/checkout', page: 'checkout', label: 'Checkout', group: 'shopping', enabled: true },
  { path: '/success', page: 'success', label: 'Order Success', group: 'shopping', enabled: true },
  { path: '/track-order', page: 'trackOrder', label: 'Track Order', group: 'shopping', enabled: true },
  { path: '/flash-sale', page: 'flashSale', label: 'Flash Sale', group: 'shopping', enabled: true },
  { path: '/deals', page: 'deals', label: 'Offers & Deals', group: 'shopping', enabled: true },
  { path: '/payment/sandbox', page: 'paymentSandbox', label: 'Payment Sandbox', group: 'shopping', enabled: true },

  /* ---------- account (13) — Phase 6 sprint b: LIVE ---------- */
  { path: '/account', page: 'account', label: 'Account Hub', group: 'account', enabled: true },
  { path: '/login', page: 'login', label: 'Login', group: 'account', enabled: true },
  { path: '/register', page: 'register', label: 'Register', group: 'account', enabled: true },
  { path: '/forgot-password', page: 'forgotPassword', label: 'Forgot Password', group: 'account', enabled: true },
  { path: '/reset-password', page: 'resetPassword', label: 'Reset Password', group: 'account', enabled: true },
  { path: '/verify-email', page: 'verifyEmail', label: 'Verify Email', group: 'account', enabled: true },
  { path: '/account/orders', page: 'accountOrders', label: 'My Orders', group: 'account', enabled: true },
  { path: '/account/orders/:id', page: 'accountOrder', label: 'Order Details', group: 'account', enabled: true },
  { path: '/account/profile', page: 'accountProfile', label: 'Profile', group: 'account', enabled: true },
  { path: '/account/addresses', page: 'accountAddresses', label: 'Addresses', group: 'account', enabled: true },
  { path: '/account/reviews', page: 'accountReviews', label: 'My Reviews', group: 'account', enabled: true },
  { path: '/account/returns', page: 'accountReturns', label: 'Returns & Refunds', group: 'account', enabled: true },
  { path: '/account/notifications', page: 'accountNotifications', label: 'Notifications', group: 'account', enabled: true },

  /* ---------- support (9) — Phase 6 sprint c: LIVE ---------- */
  { path: '/about', page: 'about', label: 'About', group: 'support', enabled: true },
  { path: '/contact', page: 'contact', label: 'Contact', group: 'support', enabled: true },
  { path: '/faq', page: 'faq', label: 'FAQ', group: 'support', enabled: true },
  { path: '/help', page: 'help', label: 'Help Center', group: 'support', enabled: true },
  { path: '/policies/shipping', page: 'policy', label: 'Shipping Policy', group: 'support', enabled: true },
  { path: '/policies/returns', page: 'policy', label: 'Returns Policy', group: 'support', enabled: true },
  { path: '/policies/warranty', page: 'policy', label: 'Warranty Policy', group: 'support', enabled: true },
  { path: '/policies/privacy', page: 'policy', label: 'Privacy Policy', group: 'support', enabled: true },
  { path: '/policies/terms', page: 'policy', label: 'Terms of Service', group: 'support', enabled: true },

  /* ---------- business / discovery (10) — Phase 6 sprint d: LIVE ---------- */
  { path: '/new-arrivals', page: 'newArrivals', label: 'New Arrivals', group: 'business', enabled: true },
  { path: '/best-sellers', page: 'bestSellers', label: 'Best Sellers', group: 'business', enabled: true },
  { path: '/featured', page: 'featured', label: 'Featured Tech', group: 'business', enabled: true },
  { path: '/brands', page: 'brands', label: 'Brand Directory', group: 'business', enabled: true },
  { path: '/blog', page: 'blog', label: 'Tech News', group: 'business', enabled: true },
  { path: '/blog/:slug', page: 'post', label: 'Journal Post', group: 'business', enabled: true },
  { path: '/guides', page: 'guides', label: 'Buying Guides', group: 'business', enabled: true },
  { path: '/service-center', page: 'serviceCenter', label: 'Service Center', group: 'business', enabled: true },
  { path: '/product-registration', page: 'productRegistration', label: 'Product Registration', group: 'business', enabled: true },
];

/* lazy page component for a registry row (null = not built yet) */
export function lazyFor(route) {
  if (!route.enabled || !route.page) return null;
  return pages[route.page];
}

export const PHASE_LABEL = {
  '6a': 'Shopping sprint — Phase 6a',
  '6b': 'Account sprint — Phase 6b',
  '6c': 'Support sprint — Phase 6c',
  '6d': 'Business sprint — Phase 6d',
};

export const ROUTE_MAP_VERSION = 'phase-2';
