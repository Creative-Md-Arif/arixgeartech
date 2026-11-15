/* ArixGear service — scheduled flash sale (Task 57).
   A product may carry flash: { price, startsAt, endsAt }. While the current
   time is inside the window (and price > 0) the product's live price IS the
   flash price — everywhere: catalog cards, PDP, search suggest, related rails,
   the /flash page and, most importantly, server-authoritative order totals.
   No cron needed: state is computed at read time, so sales start and end by
   themselves the moment the clock passes the boundaries. */

const isActive = (f, now = Date.now()) =>
  !!(f && +f.price > 0 && f.startsAt && f.endsAt &&
    now >= +new Date(f.startsAt) && now <= +new Date(f.endsAt));

/* Mutates a (lean or toObject) product payload in place:
   price → flash price, comparePrice → original price (strikethrough),
   flashLive/flashEnds flags ride along for the storefront chips. */
const applyFlash = (p, now = Date.now()) => {
  if (!p) return p;
  if (isActive(p.flash, now)) {
    p._basePrice = p.price;
    p._baseCompare = p.comparePrice != null ? p.comparePrice : null;
    p.comparePrice = p.price; // crossed-out original
    p.price = +p.flash.price;
    p.flashLive = true;
    p.flashEnds = p.flash.endsAt;
  } else {
    p.flashLive = false;
    p.flashEnds = null;
  }
  return p;
};

/* Mongo match for "flash is live right now" — used by the /flash endpoint */
const liveQuery = (now = new Date()) => ({
  active: true,
  'flash.price': { $gt: 0 },
  'flash.startsAt': { $lte: now },
  'flash.endsAt': { $gte: now },
});

module.exports = { isActive, applyFlash, liveQuery };
