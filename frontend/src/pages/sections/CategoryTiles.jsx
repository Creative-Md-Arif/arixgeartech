import { useState } from "react";
import { Link } from "react-router-dom";
import { useCatalog } from "../../store/catalog.jsx";
import { useContent } from "../../store/content.jsx";
import { pick, useLang } from "../../lib/i18n.jsx";
import { SectionHead, OutlineTitle } from "./Head.jsx";

export default function CategoryTiles() {
  useLang();  // subscribe so BN toggles re-render pick() labels
  const { sectionVisible, homeSections } = useContent();
  const { CAT_OBJS } = useCatalog();
  const [broken, setBroken] = useState({});
  const [dbImageFailed, setDbImageFailed] = useState({});

  if (!sectionVisible("categories")) return null;

  const sec = homeSections.find((s) => s && s.key === "categories");
  if (!sec)
    return null; /*no admin config → nothing to head the section with*/

  /*(tree catalog): tiles are ROOT categories ordered by the admin config; counts are live branch totals from /api/categories (productCount includes every subcategory). No config → all roots, API order.*/
  const cfgSlugs = Array.isArray(sec.config && sec.config.categories)
    ? sec.config.categories
    : [];
  const roots = CAT_OBJS.filter((c) => !c.parent);
  const configured = cfgSlugs.length
    ? cfgSlugs
        .map((sl) => roots.find((r) => r.slug === String(sl).toLowerCase()))
        .filter(Boolean)
    : roots;
  const configuredSlugs = new Set(configured.map((c) => c.slug));
  const tiles = [
    ...configured,
    ...roots.filter((c) => !configuredSlugs.has(c.slug)),
  ].map((c) => ({
    slug: c.slug,
    name: c.name,
    nameBn: c.nameBn,
    image: c.image || "",
    count: c.productCount,
  }));
  if (!tiles.length) return null;

  return (
    <section id="shop" className="hsec py-16 lg:py-24">
      <div className="container mx-auto w-[92%] ">
        <SectionHead
          eyebrow={pick(sec, "subtitle")}
          title={sec.title ? <OutlineTitle text={pick(sec, "title")} /> : null}
        />
        <div className="cat-grid grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4 xl:grid-cols-8">
          {tiles.map((c) => (
            <Link
              key={c.slug}
              className="cat-tile group relative flex h-[140px] flex-col overflow-hidden border border-line bg-panel transition-colors hover:border-line2 sm:h-[170px] lg:h-[200px]"
              to={"/shop?cat=" + encodeURIComponent(c.slug)}
              data-cat={c.slug}
            >
              <i className="pointer-events-none absolute inset-x-0 top-0 z-[3] h-[3px] origin-left scale-x-0 bg-acc transition-transform duration-[450ms] ease-forge group-hover:scale-x-100" />
              <div className="cat-image flex h-[85px] w-full items-center justify-center overflow-hidden bg-panel sm:h-[115px] lg:h-[140px]">
                {broken[c.slug] ? (
                  <div className="h-full w-full bg-panel" />
                ) : (
                  <img
                    src={
                      c.image && !dbImageFailed[c.slug]
                        ? c.image
                        : "/assets/cat-" + c.slug + ".png"
                    }
                    alt={c.name + " gear"}
                    loading="lazy"
                    onError={() => {
                      if (c.image && !dbImageFailed[c.slug])
                        setDbImageFailed((b) => ({ ...b, [c.slug]: true }));
                      else setBroken((b) => ({ ...b, [c.slug]: true }));
                    }}
                      className="h-full w-full max-h-full max-w-full object-contain object-center p-3 sm:p-4 lg:p-5 [html:not(.light)_&]:invert"
                  />
                )}
              </div>
              <div className="cat-info flex min-h-[55px] flex-1 flex-col items-center justify-center bg-panel px-2 py-2 text-center">
                <p className="cat-name font-disp text-[.72rem] uppercase leading-[.95] text-txt transition-colors group-hover:text-acc sm:text-[.9rem] lg:text-[1.05rem]">
                  {pick(c, "name")}
                </p>
                <p className="cat-count mt-1 font-cond text-[.52rem] font-semibold uppercase tracking-[.12em] text-dim lg:text-[.6rem]">
                  {c.count} PRODUCTS
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
