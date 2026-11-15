/* ArixGear ADMIN — route table (SPA mounted at /admin).
   - /login renders the login page (legacy index.html)
   - every other route is guarded: no token → /login
   - legacy *.html URLs redirect to clean routes
   - Phase 9-opt: every module is its own chunk (React.lazy) — the shell
     stays small and each page streams in on navigation. /login stays
     eager for first paint; everything else loads on demand.             */
import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { auth } from './lib/admin.js';
import { PersistentAdminShell } from './components/AdminShell.jsx';

import LoginPage from './pages/index.jsx'; // eager — the entry screen

const ResetPasswordPage = lazy(() => import('./pages/reset-password.jsx'));
const DashboardPage = lazy(() => import('./pages/dashboard.jsx'));
const OrdersPage = lazy(() => import('./pages/orders.jsx'));
const OrderDetailPage = lazy(() => import('./pages/order-detail.jsx'));
const ReturnsPage = lazy(() => import('./pages/returns.jsx'));
const ReportsPage = lazy(() => import('./pages/reports.jsx'));
const ProductsPage = lazy(() => import('./pages/products.jsx'));
const CatalogPage = lazy(() => import('./pages/catalog.jsx'));
const CategoriesPage = lazy(() => import('./pages/categories.jsx'));
const BadgesPage = lazy(() => import('./pages/badges.jsx'));
const SpecSchemaPage = lazy(() => import('./pages/spec-schema.jsx'));
const ReviewsPage = lazy(() => import('./pages/reviews.jsx'));
const QuestionsPage = lazy(() => import('./pages/questions.jsx'));
const BannersPage = lazy(() => import('./pages/banners.jsx'));
const HomepagePage = lazy(() => import('./pages/homepage.jsx'));
const QuickServicesPage = lazy(() => import('./pages/quick-services.jsx'));
const CouponsPage = lazy(() => import('./pages/coupons.jsx'));
const CustomersPage = lazy(() => import('./pages/customers.jsx'));
const MessagesPage = lazy(() => import('./pages/messages.jsx'));
const ContentPage = lazy(() => import('./pages/content.jsx'));
const SeoPage = lazy(() => import('./pages/seo.jsx'));
const SettingsPage = lazy(() => import('./pages/settings.jsx'));
const TeamPage = lazy(() => import('./pages/team.jsx'));
const AuditPage = lazy(() => import('./pages/audit.jsx'));
const BlogAdminPage = lazy(() => import('./pages/blog.jsx'));
const LoyaltyPage = lazy(() => import('./pages/loyalty.jsx'));
/* Phase 5 — new modules (C3 net-new) */
const BrandsPage = lazy(() => import('./pages/brands.jsx'));
const BundlesPage = lazy(() => import('./pages/bundles.jsx'));
const FlashCampaignsPage = lazy(() => import('./pages/flash-campaigns.jsx'));
const DealsPage = lazy(() => import('./pages/deals.jsx')); // Phase 8 — centralized deals & promotions
const WarrantyPage = lazy(() => import('./pages/warranty.jsx'));
const TicketsPage = lazy(() => import('./pages/tickets.jsx'));
const ServiceCentersPage = lazy(() => import('./pages/service-centers.jsx'));
const StockPage = lazy(() => import('./pages/stock.jsx'));
const SubscribersPage = lazy(() => import('./pages/subscribers.jsx'));
const NotificationTemplatesPage = lazy(() => import('./pages/notification-templates.jsx'));
const PaymentsPage = lazy(() => import('./pages/payments.jsx'));
const AiConsolePage = lazy(() => import('./pages/ai.jsx')); // Phase 9 — AI system console

/* chunk fallback — matches the admin skeleton language */
function PageFallback() {
  return (
    <div className="min-h-[420px] w-full p-1" aria-hidden="true">
      <div className="h-3 w-40 animate-pulse rounded bg-line/60" />
      <div className="mt-5 h-64 animate-pulse rounded-xl bg-line/30" />
    </div>
  );
}

/* old multi-page URLs → clean SPA routes (basename /admin) */
const LEGACY = {
  '/index.html': '/login',
  '/dashboard.html': '/dashboard',
  '/orders.html': '/orders',
  '/order-detail.html': '/orders', /* id query is lost — list page is the safe target */
  '/products.html': '/products',
  '/banners.html': '/banners',
  '/homepage.html': '/homepage',
  '/coupons.html': '/coupons',
  '/customers.html': '/customers',
  '/messages.html': '/messages',
  '/content.html': '/content',
  '/settings.html': '/settings',
};

function Guard() {
  if (!auth.token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AdminLayout() {
  return (
    <PersistentAdminShell>
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
    </PersistentAdminShell>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {Object.entries(LEGACY).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} /> {/* public — single-use token */}
        <Route element={<Guard />}>
          <Route element={<AdminLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/returns" element={<ReturnsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/catalog" element={<Navigate to="/categories" replace />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/badges" element={<BadgesPage />} />
          <Route path="/spec-schema" element={<SpecSchemaPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/banners" element={<BannersPage />} />
          <Route path="/homepage" element={<HomepagePage />} />
          <Route path="/quick-services" element={<QuickServicesPage />} />
          <Route path="/coupons" element={<CouponsPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/content" element={<ContentPage />} />
          <Route path="/blog" element={<BlogAdminPage />} />
          <Route path="/seo" element={<Navigate to="/seo/pages" replace />} />
          <Route path="/seo/:section" element={<SeoPage />} />
          <Route path="/settings" element={<Navigate to="/settings/store" replace />} />
          <Route path="/settings/:section" element={<SettingsPage />} />
          <Route path="/loyalty" element={<LoyaltyPage />} />
          {/* Step 2 audit fix — ownerOnly surfaces: backend 403s subadmins,
              but the shell should never even render for them */}
          {(auth.user?.role !== 'subadmin') ? <Route path="/team" element={<TeamPage />} /> : <Route path="/team" element={<Navigate to="/dashboard" replace />} />}
          {(auth.user?.role !== 'subadmin') ? <Route path="/audit" element={<AuditPage />} /> : <Route path="/audit" element={<Navigate to="/dashboard" replace />} />}
          {/* ── Phase 5 — new modules wired to the Phase 4 APIs ── */}
          <Route path="/brands" element={<BrandsPage />} />
          <Route path="/bundles" element={<BundlesPage />} />
          <Route path="/flash-campaigns" element={<FlashCampaignsPage />} />
          <Route path="/deals" element={<DealsPage />} />
          <Route path="/warranty" element={<WarrantyPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/service-centers" element={<ServiceCentersPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/subscribers" element={<SubscribersPage />} />
          <Route path="/notification-templates" element={<NotificationTemplatesPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          {/* ── Phase 9 — AI system console (imports · knowledge · chats · analytics · settings) ── */}
          <Route path="/ai" element={<Navigate to="/ai/imports" replace />} />
          <Route path="/ai/:section" element={<AiConsolePage />} />
          </Route>
        </Route>
        <Route path="/" element={<Navigate to={auth.token ? '/dashboard' : '/login'} replace />} />
        <Route path="*" element={<Navigate to={auth.token ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </Suspense>
  );
}
