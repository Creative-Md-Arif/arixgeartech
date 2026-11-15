import { useMemo } from 'react';

const pulse = 'animate-pulse rounded bg-line/60';

function SkeletonHead({ compact = false }) {
  return (
    <div className="mb-10 flex min-h-[76px] items-end justify-between gap-6 md:mb-[3.2rem]">
      <div className="w-full">
        <div className={pulse + ' h-3 w-36'} />
        <div className={pulse + ' mt-5 h-10 w-64 max-w-[70%] md:h-14'} />
        {!compact ? <div className={pulse + ' mt-4 h-3 w-80 max-w-full'} /> : null}
      </div>
      <div className="hidden shrink-0 gap-2 md:flex">
        <div className={pulse + ' h-11 w-11'} />
        <div className={pulse + ' h-11 w-11'} />
      </div>
    </div>
  );
}

function ProductPlaceholder({ horizontal = false }) {
  return (
    <div className={'overflow-hidden border border-line bg-panel ' + (horizontal ? 'w-[clamp(248px,23.5vw,306px)] flex-none' : '')} aria-hidden="true">
      <div className={pulse + ' aspect-square w-full rounded-none'} />
      <div className="min-h-[148px] space-y-3 p-4">
        <div className={pulse + ' h-2.5 w-1/3'} />
        <div className={pulse + ' h-3.5 w-4/5'} />
        <div className={pulse + ' h-3 w-1/4'} />
      </div>
    </div>
  );
}

function ProductSection({ count = 4, grid = false, tight = false }) {
  if (count < 1) return null;
  return (
    <section className={'hsec ' + (tight ? 'pb-16 pt-8 lg:pb-24' : 'pb-16 pt-16 lg:pb-24')} aria-hidden="true">
      <div className="container mx-auto w-[92%]">
        <SkeletonHead compact />
        <div className={grid
          ? 'grid grid-cols-2 gap-[.7rem] md:grid-cols-3 lg:gap-[1.15rem] xl:grid-cols-4'
          : 'flex gap-[1.1rem] overflow-hidden pb-[.6rem]'}>
          {Array.from({ length: count }, (_, i) => <ProductPlaceholder key={i} horizontal={!grid} />)}
        </div>
      </div>
    </section>
  );
}

function CampaignSkeleton({ promoCount }) {
  const hasPromos = promoCount > 0;
  return (
    <>
      <div className="home-hero-card home-hero-skeleton relative flex flex-col justify-end overflow-hidden rounded-2xl">
        <div className="flex h-full flex-col justify-end p-6 sm:p-10 lg:p-14">
          <div className={pulse + ' h-3 w-44'} />
          <div className={pulse + ' mt-6 h-16 w-[min(34rem,80%)] sm:h-24'} />
          <div className={pulse + ' mt-4 h-4 w-[min(28rem,75%)]'} />
          <div className="mt-8 flex gap-4">
            <div className={pulse + ' h-12 w-36'} />
            <div className={pulse + ' h-12 w-44'} />
          </div>
          <div className="mt-12 flex items-center justify-between">
            <div className={pulse + ' h-1 w-44'} />
            <div className={pulse + ' hidden h-10 w-64 sm:block'} />
          </div>
        </div>
      </div>
      {hasPromos ? (
        <div className={'hero-promos-rail hidden min-w-0 grid-cols-1 gap-4 xl:grid xl:grid-rows-2' + (promoCount === 1 ? ' single-promo' : '')}>
          {Array.from({ length: promoCount }, (_, i) => <div key={i} className={pulse + ' promo-card min-h-[160px] rounded-2xl'} />)}
        </div>
      ) : null}
      {hasPromos ? (
        <div className="grid grid-cols-2 gap-3 pb-2 pt-4 xl:hidden sm:gap-4">
          {Array.from({ length: promoCount }, (_, i) => <div key={i} className={pulse + ' h-[clamp(128px,36vw,168px)] rounded-xl'} />)}
        </div>
      ) : null}
    </>
  );
}

function CategorySection({ count }) {
  if (count < 1) return null;
  return (
    <section className="hsec py-16 lg:py-24" aria-hidden="true">
      <div className="container mx-auto w-[92%]">
        <SkeletonHead compact />
        <div className="grid grid-cols-1 gap-[1.1rem] sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: count }, (_, i) => <div key={i} className={pulse + ' h-[340px] lg:h-[430px]'} />)}
        </div>
      </div>
    </section>
  );
}

function ServicesSection({ count }) {
  return (
    <section className="hsec py-16 lg:py-20" aria-hidden="true">
      <div className="container mx-auto w-[92%]">
        <SkeletonHead />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="min-h-[236px] border border-line bg-panel p-6">
              <div className={pulse + ' h-14 w-14'} />
              <div className={pulse + ' mt-5 h-4 w-3/4'} />
              <div className={pulse + ' mt-4 h-3 w-full'} />
              <div className={pulse + ' mt-2 h-3 w-5/6'} />
              <div className={pulse + ' mt-5 h-3 w-1/2'} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FlashSection() {
  return (
    <section className="hsec py-16 lg:py-20" aria-hidden="true">
      <div className="container mx-auto w-[92%]">
        <div className="flex items-end justify-between gap-4">
          <div className="flex-1"><SkeletonHead compact /></div>
          <div className="mb-10 hidden gap-2 sm:flex">
            {[0, 1, 2].map((x) => <div key={x} className="h-14 w-16 animate-pulse border border-line bg-panel" />)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-[.7rem] md:grid-cols-3 lg:gap-[1.15rem] xl:grid-cols-4">
          {[0, 1, 2, 3].map((x) => <ProductPlaceholder key={x} />)}
        </div>
      </div>
    </section>
  );
}

function BundleSection({ count }) {
  return (
    <section className="hsec py-16 lg:py-20" aria-hidden="true">
      <div className="container mx-auto w-[92%]">
        <SkeletonHead />
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="overflow-hidden border border-line bg-panel">
              <div className="space-y-3 border-b border-line p-5"><div className={pulse + ' h-4 w-3/4'} /><div className={pulse + ' h-3 w-1/2'} /></div>
              <div className="grid grid-cols-3 gap-px bg-line p-px">
                {[0, 1, 2].map((x) => <div key={x} className="flex flex-col items-center bg-panel p-3"><div className={pulse + ' h-16 w-16 rounded-full'} /><div className={pulse + ' mt-3 h-3 w-full'} /></div>)}
              </div>
              <div className="flex justify-between p-5"><div className={pulse + ' h-6 w-24'} /><div className={pulse + ' h-10 w-28'} /></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MediaSection({ count, stories = false }) {
  return (
    <section className="hsec py-16 lg:py-24" aria-hidden="true">
      <div className="container mx-auto w-[92%]">
        <SkeletonHead />
        <div className="mx-auto grid max-w-[560px] gap-[1.15rem] lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="overflow-hidden border border-line bg-panel">
              <div className={pulse + (stories ? ' aspect-[4/3.2]' : ' h-[440px] lg:h-[520px]')} />
              {stories ? <div className="space-y-3 p-5"><div className={pulse + ' h-4 w-2/3'} /><div className={pulse + ' h-3 w-full'} /><div className={pulse + ' h-3 w-4/5'} /></div> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GenericSection({ row, productCount }) {
  const cfg = row.config || {};
  const type = row.type || '';
  if (type === 'ticker') return (cfg.items || cfg.itemsBn || []).length ? <div className="my-4 h-12 animate-pulse border-y border-line bg-panel" aria-hidden="true" /> : null;
  if (type === 'product-carousel') return <ProductSection count={Math.min(4, Math.max(1, +cfg.limit || 4))} />;
  if (type === 'product-grid' || row.key === 'arsenal') return <ProductSection count={(Array.isArray(cfg.products) && cfg.products.length) || (row.key === 'arsenal' && productCount) || 8} grid tight />;
  if (type === 'categories') return <CategorySection count={Math.max(2, (cfg.categories || []).length || 4)} />;
  if (type === 'custom-banner') return <section className="hsec py-8 lg:py-12" aria-hidden="true"><div className="container mx-auto w-[92%]"><div className={pulse + ' h-[300px] lg:h-[380px]'} /></div></section>;
  if (type === 'goal-panels' && Array.isArray(cfg.goals) && cfg.goals.length) {
    return <section className="hsec pb-16 pt-8 lg:pb-24" aria-hidden="true"><div className="container mx-auto w-[92%]"><SkeletonHead compact /><div className="grid gap-[1.1rem] lg:grid-cols-3">{cfg.goals.map((goal, i) => <div key={goal.title || i} className={pulse + ' h-[460px] lg:h-[560px]'} />)}</div></div></section>;
  }
  if (type === 'slider' && Array.isArray(cfg.slides) && cfg.slides.length) {
    return <div className={pulse + ' h-[70svh] min-h-[420px]'} aria-hidden="true" />;
  }
  if (type === 'html' && Array.isArray(cfg.items) && cfg.items.length) return <MediaSection count={cfg.items.length} stories />;
  if (type === 'html' && (cfg.html || cfg.heading || cfg.desc)) return <section className="hsec py-16 lg:py-24" aria-hidden="true"><div className="container mx-auto w-[92%]"><SkeletonHead /><div className={pulse + ' h-32 w-full'} /></div></section>;
  return null;
}

export default function HomepageSkeleton({ sections = [], hidden = [], promoCount = 0, categoryCount = 0, productCount = 0 }) {
  const visibleRows = useMemo(() => sections
    .filter((row) => row && (row.key === 'hero-slider' || (row.__configured && !hidden.includes(row.key)))), [sections, hidden]);

  return (
    <div className="homepage-skeleton" aria-label="Loading homepage" aria-busy="true" role="status">
      {visibleRows.map((row) => {
        if (row.key === 'hero-slider') {
          return (
            <div key="hero-zone" className={'container mx-auto w-[92%] home-hero-zone' + (promoCount > 0 ? ' has-side-promos' : '')}>
              <CampaignSkeleton promoCount={promoCount} />
            </div>
          );
        }
        const cfg = row.config || {};
        switch (row.key) {
          case 'ticker':
            return (cfg.items || cfg.itemsBn || []).length ? <div key={row.key} className="my-4 h-12 animate-pulse border-y border-line bg-panel" aria-hidden="true" /> : null;
          case 'quick-services': {
            const serviceCount = Array.isArray(cfg.cards)
              ? cfg.cards.filter((card) => card && card.active !== false).length
              : (cfg.services || ['laptop-finder', 'ac-calc', 'complaint', 'service-center']).length;
            return serviceCount
              ? <ServicesSection key={row.key} count={serviceCount} />
              : null;
          }
          case 'categories':
            return <CategorySection key={row.key} count={categoryCount} />;
          case 'flash-deals':
            return <FlashSection key={row.key} />;
          case 'new-arrivals':
          case 'best-sellers':
            return <ProductSection key={row.key} count={productCount > 0 ? Math.min(4, Math.max(1, +cfg.limit || 4)) : 0} />;
          case 'combo-bundles':
            return (cfg.bundles || []).length ? <BundleSection key={row.key} count={cfg.bundles.length} /> : null;
          case 'arsenal':
            return <ProductSection key={row.key} count={productCount} grid tight />;
          case 'athletes':
            return Array.isArray(cfg.items) && cfg.items.length ? <MediaSection key={row.key} count={cfg.items.length} /> : null;
          case 'stories':
            return Array.isArray(cfg.items) && cfg.items.length ? <MediaSection key={row.key} count={cfg.items.length} stories /> : null;
          default:
            return <GenericSection key={row.key} row={row} productCount={productCount} />;
        }
      })}
    </div>
  );
}
