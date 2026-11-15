/* Phase 8 — Centralized Deals seed. Every type gets one representative
   promotion, so the admin Deals Manager and the storefront deals hub open
   fully populated. Windows are computed RELATIVE TO NOW (like the flash
   seed's 'live'/'+3d') so the suite is live whenever the seed runs.

   Regression safety contract (do not break):
     · NO seeded deal covers 'gaming-laptops', ARG-LAP-002 or buds-air-3 —
       qa_phase2 (PDP flash 142900) and qa_phase4 (campaign flash 2499)
       assert those exact prices.
     · NO seeded live deal uses scope 'all' — qa_phase2 facet bounds
       (min ≥ 1000 / max ≥ 150000) must stay untouched.
     · The 12.12 campaign is SCHEDULED (not live) and the custom promotion
       is a DRAFT — visible in admin, invisible to pricing and the public. */

const Deal = require('../models/Deal');

const DAY = 24 * 60 * 60 * 1000;

const BUNDLE_GAMING = 'cpu-hexa-5600-gpu-vortex-rtx-ram-pulse-16gb';

function windows(now) {
  return {
    live: { startsAt: new Date(now - 1 * DAY), endsAt: new Date(now + 15 * DAY) },
    short: { startsAt: new Date(now - 6 * 3600e3), endsAt: new Date(now + 36 * 3600e3) },
    scheduled: { startsAt: new Date(now + 30 * DAY), endsAt: new Date(now + 45 * DAY) },
  };
}

function techDeals(now = Date.now()) {
  const w = windows(now);
  return [
    {
      name: '11.11 Mega Monitor Sale', nameBn: '১১.১১ মেগা মনিটর সেল',
      slug: '11-11-mega-monitor-sale', type: 'mega',
      description: 'The 11.11 mega event — single-digit-digit prices on every 4K panel in the store.',
      badge: '11.11 SALE', accent: '#7C5CFF', featured: true,
      channels: ['home', 'deals', 'pdp'],
      discount: { kind: 'percentage', value: 11, maxOff: 15000 },
      scope: { kind: 'categories', categories: ['monitors'], brands: [], products: [] },
      window: w.live, published: true, active: true, priority: 10,
      usageLimit: 0,
    },
    {
      name: '12.12 Grand Finale Campaign', nameBn: '১২.১২ গ্র্যান্ড ফিনালে',
      slug: '12-12-grand-finale', type: 'campaign',
      description: 'Scheduled now, goes live by itself on 12.12 — the store-wide year-end blowout.',
      badge: '12.12', accent: '#22D3EE', featured: true,
      channels: ['home', 'deals'],
      discount: { kind: 'percentage', value: 12, maxOff: 20000 },
      scope: { kind: 'all', categories: [], brands: [], products: [] },
      window: w.scheduled, published: true, active: true, priority: 5,
      usageLimit: 0,
    },
    {
      name: 'Flash Hour — RTX 4060 Ti', nameBn: 'ফ্ল্যাশ আওয়ার — RTX 4060 Ti',
      slug: 'flash-hour-rtx-4060-ti', type: 'flash',
      description: '36-hour flash window on the MSI Ventus — when it ends, it ends.',
      badge: 'FLASH', accent: '#F59E0B', featured: true,
      channels: ['home', 'deals', 'pdp', 'cart'],
      discount: { kind: 'percentage', value: 15, maxOff: 0 },
      scope: { kind: 'products', categories: [], brands: [], products: ['gpu-vortex-rtx-ti'] },
      window: w.short, published: true, active: true, priority: 20, usageLimit: 0,
    },
    {
      name: 'Deals of the Day — Audio', nameBn: 'আজকের ডিল — অডিও',
      slug: 'daily-audio-deals', type: 'daily',
      description: 'Every day a category gets the daily-deal shave. Today: everything that makes sound.',
      badge: 'DAILY DEAL', accent: '#10B981', featured: false,
      channels: ['home', 'deals'],
      discount: { kind: 'percentage', value: 10, maxOff: 500 },
      scope: { kind: 'categories', categories: ['audio'], brands: [], products: [] },
      window: w.live, published: true, active: true, priority: 40, usageLimit: 0,
    },
    {
      name: 'Winter Seasonal Offer — Samsung', nameBn: 'শীতকালীন অফার — স্যামসাং',
      slug: 'winter-seasonal-samsung', type: 'seasonal',
      description: 'Winter stock refresh — Samsung monitors, storage and appliances at seasonal prices.',
      badge: 'SEASONAL', accent: '#3B82F6', featured: false,
      channels: ['deals', 'pdp'],
      discount: { kind: 'percentage', value: 8, maxOff: 0 },
      scope: { kind: 'brands', categories: [], brands: ['samsung'], products: [] },
      window: w.live, published: true, active: true, priority: 60, usageLimit: 0,
    },
    {
      name: 'Lenovo Brand Deal', nameBn: 'লেনোভো ব্র্যান্ড ডিল',
      slug: 'lenovo-brand-deal', type: 'brand',
      description: 'Official Lenovo promotion — IdeaPads, ThinkBooks and mini PCs, straight from the brand desk.',
      badge: 'BRAND DEAL', accent: '#EF4444', featured: true,
      channels: ['home', 'deals', 'pdp'],
      discount: { kind: 'percentage', value: 10, maxOff: 12000 },
      scope: { kind: 'brands', categories: [], brands: ['lenovo'], products: [] },
      window: w.live, published: true, active: true, priority: 50, usageLimit: 0,
    },
    {
      name: 'BOGO — Buy 2 Get 1 Mouse', nameBn: 'বোগো — ২টি কিনুন ১টি ফ্রি',
      slug: 'bogo-mouse-buy2get1', type: 'bogo',
      description: 'Two G102 units in the cart, the third rides for free — applied at checkout automatically.',
      badge: 'BOGO', accent: '#8B5CF6', featured: false,
      channels: ['deals', 'pdp', 'cart'],
      discount: { kind: 'percentage', value: 0, maxOff: 0 },
      bogo: { buyQty: 2, getQty: 1 },
      scope: { kind: 'products', categories: [], brands: [], products: ['mouse-glide-pro'] },
      window: w.live, published: true, active: true, priority: 30, usageLimit: 0,
    },
    {
      name: 'Combo Week — Budget Gaming Build', nameBn: 'কম্বো সপ্তাহ — বাজেট গেমিং বিল্ড',
      slug: 'combo-week-budget-gaming', type: 'combo',
      description: 'The Budget Gaming Build bundle gets the spotlight this week — one SKU price, three parts.',
      badge: 'COMBO', accent: '#14B8A6', featured: false,
      channels: ['home', 'deals'],
      discount: { kind: 'percentage', value: 0, maxOff: 0 },
      bundleSlug: BUNDLE_GAMING,
      scope: { kind: 'all', categories: [], brands: [], products: [] },
      window: w.live, published: true, active: true, priority: 70, usageLimit: 0,
    },
    {
      name: 'Clearance — RAM & Routers', nameBn: 'ক্লিয়ারেন্স — র‍্যাম ও রাউটার',
      slug: 'clearance-ram-routers', type: 'clearance',
      description: 'Last units of last-gen stock, priced to leave. No restock — when they are gone, they are gone.',
      badge: 'CLEARANCE', accent: '#F97316', featured: false,
      channels: ['deals', 'pdp'],
      discount: { kind: 'percentage', value: 30, maxOff: 0 },
      scope: { kind: 'products', categories: [], brands: [], products: ['ram-pulse-16gb', 'router-mesh-ac6'] },
      window: w.live, published: true, active: true, priority: 90, usageLimit: 0,
    },
    {
      name: 'Loyalty Week (drafting…)', nameBn: 'লয়্যালটি সপ্তাহ (ড্রাফট)',
      slug: 'loyalty-week-draft', type: 'custom',
      description: 'A custom promotion being drafted — stays invisible until an admin hits publish.',
      badge: 'DRAFT', accent: '#6B7280', featured: false,
      channels: ['deals'],
      discount: { kind: 'percentage', value: 5, maxOff: 0 },
      scope: { kind: 'products', categories: [], brands: [], products: ['powerbank-titan-20k'] },
      window: w.live, published: false, active: true, priority: 100, usageLimit: 0,
    },
  ];
}

async function seedDeals() {
  const docs = techDeals();
  await Deal.insertMany(docs);
  console.log('[seed] deals: ' + docs.length + ' (11.11 mega · 12.12 scheduled · flash · daily · seasonal · brand · bogo · combo · clearance · custom draft)');
}

module.exports = { techDeals, seedDeals };
