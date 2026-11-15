/* Initial homepage editor metadata. This is seed data, not runtime content. */
module.exports = {
  key: 'homepage',
  sectionTypes: [
    { value: 'slider', label: 'Slider' },
    { value: 'ticker', label: 'Ticker' },
    { value: 'quick-services', label: 'Quick Services' },
    { value: 'categories', label: 'Categories' },
    { value: 'flash-deals', label: 'Flash Deals' },
    { value: 'product-carousel', label: 'Product Carousel' },
    { value: 'best-sellers', label: 'Best Sellers' },
    { value: 'combo-bundles', label: 'Combo Bundles' },
    { value: 'product-grid', label: 'Product Grid' },
    { value: 'goal-panels', label: 'Goal Panels' },
    { value: 'custom-banner', label: 'Custom Banner' },
    { value: 'html', label: 'HTML' },
  ],
  sources: [
    { value: 'newest', label: 'Newest' },
    { value: 'featured', label: 'Featured' },
    { value: 'best-selling', label: 'Best Selling' },
    { value: 'trending', label: 'Trending' },
    { value: 'rating', label: 'Rating' },
  ],
  actions: [
    { value: 'finder', label: 'Laptop Finder', kind: 'modal', target: 'finder', configurable: true },
    { value: 'calculator', label: 'AC Calculator', kind: 'modal', target: 'calculator', configurable: true },
    { value: 'link', label: 'Internal Link', kind: 'internal-link', requiresHref: true },
    { value: 'external-link', label: 'External Link', kind: 'external-link', requiresHref: true },
    { value: 'none', label: 'No Action', kind: 'none' },
  ],
};
