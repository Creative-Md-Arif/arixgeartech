/**
 * Default site content — the single source of truth for every editable
 * text block on the storefront (footer, about, contact, FAQs, journal).
 *
 * The seed writes these into Setting.content so the admin Content page
 * always shows the full set of fields. GET /api/settings/content merges
 * stored content over these defaults, so a partial save never breaks
 * the storefront (missing keys fall back here).
 *
 * Phase 2: rewritten for the arixgear.tech tech vertical; the gym
 * membership block was archived with the vertical (see _archive/membership).
 */
module.exports = {
  site: {
    tagline: 'Official-warranty tech & gadgets for Bangladesh — laptops, components, monitors, appliances and power gear, delivered nationwide.',
    copyright: '© 2026 ARIXGEAR TECH LTD. POWERING BANGLADESH.',
    instagram: 'https://instagram.com',
    youtube: 'https://youtube.com',
    x: 'https://x.com',
  },

  newsletter: {
    title: 'JOIN THE CIRCUIT.',
    sub: 'Deal alerts, buying guides and early access to drops. No spam — specs only.',
    note: 'First 500 sign-ups this month get 10% off — code ARIX10',
  },

  /* hero fallback copy — used when no hero Banner exists; override from
     Admin → Content → "Hero (fallback)" or simply add a hero Banner. */
  hero: {
    eyebrow: 'Gaming Week — Live Now',
    title: 'GEAR THAT',
    titleAccent: 'KEEPS UP.',
    subtitle: 'Official-warranty laptops, components and monitors — compatibility-checked by our team, delivered across Bangladesh in 48 hours.',
    ctaText: 'Shop the Drop',
    link: '#new',
  },

  about: {
    eyebrow: 'Since 2021 · Built in Dhaka',
    title: 'TECH THAT EARNS ITS PLACE.',
    stats: [
      { value: '2021', label: 'Founded in Dhaka' },
      { value: '18,400+', label: 'Orders delivered nationwide' },
      { value: '11', label: 'Official brand warranties' },
      { value: '48h', label: 'Dhaka delivery window' },
    ],
    prose: [
      '<b>arixgear.tech started because buying tech in Bangladesh was a gamble.</b> Grey-market imports with no warranty cards. "Box-packed" phones that were anything but. Shops that vanished the day a panel failed. Every experienced buyer in this country has a story that ends with "and then they stopped answering the phone."',
      'So we built the opposite shop. Every product is <b>official stock with a real warranty</b> — the card is in the box, the service address is on the card, and our own desk picks up the phone after. Specs are listed the way engineers read them, not the way marketing writes them. Prices are honest per-taka value, and when our team spots a compatibility problem in your cart — a PSU that cannot feed your GPU, RAM that does not fit your board — <b>we flag it before we charge you.</b>',
      'We deliver nationwide in 48 hours through verified couriers, we verify bKash/Nagad/Rocket payments within the hour, and we treat a warranty claim like the promise it legally is. Premium here is not a price point — <b>it is a standard the product and the paperwork both have to survive.</b>',
    ],
    timelineEyebrow: 'The Road So Far',
    timelineTitle: 'ARIXGEAR TIMELINE',
    timeline: [
      { year: '2021', title: 'The First 100 Orders', text: 'One small office in Banani, a spreadsheet of honest prices and a rule on the wall: official stock only, warranty card in every box. The first hundred customers are still with us.' },
      { year: '2023', title: 'The Build Desk', text: 'Free compatibility checks launch — carts get reviewed by an engineer before payment, PSU mismatches and wrong-generation RAM get caught while they still cost nothing to fix.' },
      { year: '2024', title: 'Nationwide Warranty Service', text: 'Authorised service coordination for 11 brands. Warranty claims stopped being a favour and became a process with SLAs, statuses and SMS updates.' },
      { year: '2026', title: 'The Circuit Today', text: '18,400+ orders, categories from laptops to load-shedding insurance, and the same rule as day one: if we would not recommend it to family, we do not stock it.' },
    ],
    quality: {
      eyebrow: 'How We Stock',
      title: 'WHAT WE SELL\nHOW WE STAND BEHIND IT.',
      prose: [
        'Every listing starts with <b>authenticity, not margin</b>: official distribution or verifiable panel imports only, with warranty terms printed on the product page — parts years, labour years, panel years — because that is the page you will re-open when something goes wrong.',
        'The build desk reviews every component cart before payment: wattage against draw, generation against generation, clearance against case. Compatibility mistakes are cheapest the hour before you pay. <b>We would rather lose the margin than ship a build that dies in a month.</b>',
      ],
      qc: [
        { h: 'Official Stock Only', p: 'Warranty card in the box. Service address on the card. No exceptions.' },
        { h: 'Free Build Checks', p: 'Paste your cart — an engineer verifies compatibility before you pay.' },
        { h: 'Printed Warranty Terms', p: 'Parts / labour / panel years listed per product. Read it before you buy.' },
      ],
    },
  },

  guides: {
    eyebrow: 'Buying Guides · Build Help · Care',
    heading: 'THE CIRCUIT JOURNAL',
  },

  contact: {
    heading: 'CONTACT SUPPORT',
    eyebrow: 'We Answer Like Engineers',
    faqEyebrow: 'Before You Ask',
    faqHeading: 'FREQUENT QUESTIONS',
    emails: 'support@arixgear.tech\nwarranty@arixgear.tech',
    responseTime: 'Within 1 working day.\nOrder issues jump the queue.',
    hours: 'Sat–Thu 09:00–18:00 (BST)\nFriday 10:00–14:00 (BST)',
    address: 'House 42, Road 11, Banani\nDhaka 1213, Bangladesh',
  },

  faqs: [
    { q: 'How do I pay for my order?', a: 'Three ways: send money with bKash/Nagad/Rocket to the number shown at checkout and upload the screenshot with your TrxID — or choose Cash on Delivery and pay the courier when the product lands.' },
    { q: 'How long does delivery take?', a: 'Inside Dhaka 1–2 working days. Outside Dhaka 2–4 working days via Steadfast/Pathao Courier. You get an SMS with the tracking code the moment your parcel ships.' },
    { q: 'Are the warranties real?', a: 'Yes — every product page prints the exact terms (parts years, labour years, panel years) and every box ships with a warranty card. We coordinate authorised service for all 11 brands we carry.' },
    { q: 'Do you verify my payment before shipping?', a: 'Yes. Our team checks your TrxID and screenshot against the merchant statement — usually within an hour (9am–10pm). You get a confirmation SMS + email the moment it clears.' },
    { q: 'Will my build actually work together?', a: 'Add the parts to one cart and our build desk checks compatibility before charging you — PSU wattage vs draw, DDR4 vs DDR5, case clearance. Wrong combos get flagged, not shipped.' },
  ],

  /* Journal posts — the bundled fallback set (the seed also creates real
     Post documents; this array keeps the storefront pretty if the API is down). */
  posts: [
    {
      "id": "laptop-guide",
      "tag": "Guides",
      "time": "7 min read",
      "imgk": "jr-0",
      "title": "Laptop Buying Guide for Bangladesh — 2026 Edition",
      "ex": "Ryzen or Intel? How much RAM is enough? Which warranty actually matters? The honest answers, sorted by budget.",
      "kit": ["laptop-voyage-14", "laptop-strix-g15", "ssd-nvme-1tb"],
      "body": "<p>Buy the warranty first, the specs second. An official-panel import with a real service address beats a grey-market discount every single time — ask us how we know.</p><h3>Budgets That Make Sense</h3><p>Under ৳60,000: Ryzen 5 / Core i3 class, 16GB RAM, 512GB NVMe — perfect for study and office. Under ৳90,000: better IPS panels and faster charging. Above ৳120,000: dedicated graphics becomes the point — RTX 4050/4060 class for gaming and editing.</p><p class=\"pull\">\"16GB is the 2026 floor. NVMe-only storage. IPS non-negotiable.\"</p><h3>The Boring Part That Saves Money</h3><p>Warranty terms differ by brand: parts years, labour years, panel years are separate numbers. We print all three on every product page. If the fine print needs a translation, our support desk explains it in Bangla, in English, or in bullet points — whichever lands.</p>"
    },
    {
      "id": "upgrade-order",
      "tag": "Build",
      "time": "5 min read",
      "imgk": "jr-1",
      "title": "The ৳35,000 Upgrade That Feels Like a New PC",
      "ex": "SSD first, RAM second, GPU third — the order that actually multiplies your money.",
      "kit": ["ssd-nvme-1tb", "ram-pulse-16gb", "gpu-vortex-rtx"],
      "body": "<p>Old PC feels slow? Resist the full rebuild. Two upgrades cover ninety percent of the pain.</p><h3>First: The SSD</h3><p>A 1TB NVMe drive turns a five-minute boot into twelve seconds and halves game loads. If your machine is still on a hard drive, nothing else you buy will feel this dramatic.</p><h3>Second: Dual-Channel RAM</h3><p>Two sticks in the correct slots unlock the bandwidth single-channel wastes. Stutter from heavy browsing disappears.</p><p class=\"pull\">\"Match the GPU to your monitor, not your ego.\"</p><h3>Before You Order</h3><p>Confirm PSU wattage and connectors, case clearance, DIMM generation — DDR4 and DDR5 never mix. Or paste your cart and let our build desk check it free, before you pay.</p>"
    },
    {
      "id": "ups-kit",
      "tag": "Power",
      "time": "5 min read",
      "imgk": "jr-2",
      "title": "Load-Shedding Survival Kit for Home Offices",
      "ex": "UPS sizing math, router-first wiring, and the three devices that keep a workday alive.",
      "kit": ["ups-line-650", "powerbank-titan-20k", "router-mesh-ac6"],
      "body": "<p>A workday dies in this order: internet, laptop, light. Build the kit backwards.</p><h3>Router First</h3><p>A 650VA UPS runs router + ONT for 1–2 hours and costs less than one missed client call. Wire it before anything else in the house.</p><p class=\"pull\">\"Buy 30% headroom above your wattage sum — VA is not W.\"</p><h3>Then the Desk</h3><p>Desktops want 1200VA class with AVR, so the brownouts <em>before</em> the blackout do not reboot the machine. Laptops already carry their own hours. A 20,000mAh power bank covers phones and — with USB-C PD — some routers too.</p><h3>The Maths</h3><p>Add device wattages (router 10W, ONT 8W, desktop 250–350W), divide by the UPS <b>W</b> rating, not VA. 650VA = 360W; 1200VA = 720W.</p>"
    },
    {
      "id": "panel-guide",
      "tag": "Monitors",
      "time": "4 min read",
      "imgk": "jr-3",
      "title": "Monitor Panels Explained: IPS vs VA vs TN",
      "ex": "Panel type decides viewing angles, contrast and price. Which one fits which desk — honestly.",
      "kit": ["monitor-view-24", "monitor-ultra-27-4k", "monitor-pro-32-hdr"],
      "body": "<p>Panel type is the decision that outlasts every other spec. Three honest profiles:</p><h3>IPS — The Default</h3><p>Colour and angles for everyone looking at the screen: offices, editing, shared viewing. Modern IPS adds 100Hz+ and HDR400 for gaming that looks as good as it performs.</p><h3>VA — The Movie Night</h3><p>Deeper blacks for dark rooms and curved immersion at 32 inches, at the cost of slightly slower pixel response. Fine for story games; less ideal for competitive twitch.</p><p class=\"pull\">\"FHD at 24 inches. QHD at 27–32. Matte anti-glare, always.\"</p><h3>TN — The Budget Row</h3><p>Still alive in the 22-inch tier. Fast but washed from any angle — single-user office rows, not showcases.</p>"
    }
  ],
};
