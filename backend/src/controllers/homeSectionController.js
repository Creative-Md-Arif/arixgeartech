const HomeSection = require('../models/HomeSection');
const HomeSectionMetadata = require('../models/HomeSectionMetadata');

// GET /api/admin/home-sections/metadata
exports.metadata = async (_req, res, next) => {
  try {
    const metadata = await HomeSectionMetadata.findOne({ key: 'homepage' }).lean();
    if (!metadata) return res.status(404).json({ message: 'Homepage metadata is not configured' });
    res.json(metadata);
  } catch (e) { next(e); }
};

async function ensureSupportedType(type) {
  const metadata = await HomeSectionMetadata.findOne({ key: 'homepage' }).select('sectionTypes').lean();
  return Boolean(metadata && metadata.sectionTypes.some((option) => option.value === type));
}

// GET /api/home-sections (public — active only, ordered)
exports.publicList = async (_req, res, next) => {
  try {
    const sections = await HomeSection.find({ active: true }).sort({ order: 1 });
    /* keys of inactive sections — the storefront hides these DOM blocks */
    const inactive = await HomeSection.find({ active: false }).select('key').lean();
    res.json({ items: sections, hidden: inactive.map((x) => x.key) });
  } catch (e) { next(e); }
};

// GET /api/admin/home-sections (all)
exports.adminList = async (_req, res, next) => {
  try {
    const sections = await HomeSection.find().sort({ order: 1 });
    res.json({ items: sections });
  } catch (e) { next(e); }
};

// POST /api/admin/home-sections
exports.create = async (req, res, next) => {
  try {
    const { key, title, subtitle, type, order, active, config } = req.body;
    if (!key || !type) return res.status(400).json({ message: 'key and type are required' });
    if (!(await ensureSupportedType(type))) return res.status(400).json({ message: 'Unsupported homepage section type' });
    let cfg = config;
    if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch (_e) { return res.status(400).json({ message: 'config must be valid JSON' }); } }
    const section = await HomeSection.create({
      key: String(key).toLowerCase(), title: title || '', subtitle: subtitle || '',
      titleBn: req.body.titleBn || '', subtitleBn: req.body.subtitleBn || '', // Task 58
      type, order: Number(order) || 0, active: active !== undefined ? !!active : true,
      config: cfg || {},
    });
    res.status(201).json({ section });
  } catch (e) { next(e); }
};

// PUT /api/admin/home-sections/:id
exports.update = async (req, res, next) => {
  try {
    const section = await HomeSection.findById(req.params.id);
    if (!section) return res.status(404).json({ message: 'Section not found' });
    const b = req.body;
    ['title', 'subtitle', 'type', 'titleBn', 'subtitleBn'].forEach((f) => { if (b[f] !== undefined) section[f] = b[f]; }); // Task 58 — Bn twins
    if (b.key !== undefined) section.key = String(b.key).toLowerCase();
    if (b.type !== undefined && !(await ensureSupportedType(b.type))) return res.status(400).json({ message: 'Unsupported homepage section type' });
    if (b.order !== undefined) section.order = Number(b.order);
    if (b.active !== undefined) section.active = !!b.active && b.active !== 'false';
    if (b.config !== undefined) {
      let cfg = b.config;
      if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch (_e) { return res.status(400).json({ message: 'config must be valid JSON' }); } }
      section.config = cfg;
    }
    await section.save();
    res.json({ section });
  } catch (e) { next(e); }
};

// DELETE /api/admin/home-sections/:id
exports.remove = async (req, res, next) => {
  try {
    const section = await HomeSection.findById(req.params.id);
    if (!section) return res.status(404).json({ message: 'Section not found' });
    await section.deleteOne();
    res.json({ message: 'Section deleted' });
  } catch (e) { next(e); }
};
