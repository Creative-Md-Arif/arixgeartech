const HomeSection = require('../models/HomeSection');
const HomeSectionMetadata = require('../models/HomeSectionMetadata');

function normalizeCard(card) {
  return {
    key: String(card?.key || '').trim(),
    icon: String(card?.icon || '').trim(),
    title: String(card?.title || '').trim(),
    titleBn: String(card?.titleBn || '').trim(),
    description: String(card?.description || '').trim(),
    descriptionBn: String(card?.descriptionBn || '').trim(),
    actionText: String(card?.actionText || '').trim(),
    actionTextBn: String(card?.actionTextBn || '').trim(),
    action: String(card?.action || 'none').trim(),
    href: String(card?.href || '').trim(),
    active: card?.active !== false,
  };
}

async function validateCards(cards) {
  const metadata = await HomeSectionMetadata.findOne({ key: 'homepage' }).select('actions').lean();
  const actions = new Map((metadata?.actions || []).map((item) => [item.value, item]));
  const keys = cards.map((card) => card.key);
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) return 'Every service card needs a unique key';
  for (const card of cards) {
    const action = actions.get(card.action);
    if (!action) return `Unsupported service action: ${card.action}`;
    if (action.requiresHref) {
      const valid = action.kind === 'external-link'
        ? /^https?:\/\//i.test(card.href)
        : card.href.startsWith('/') && !card.href.startsWith('//');
      if (!valid) return `Service "${card.key}" has an invalid action URL`;
    }
  }
  return null;
}

exports.get = async (_req, res, next) => {
  try {
    const section = await HomeSection.findOne({ key: 'quick-services' }).lean();
    if (!section) return res.status(404).json({ message: 'Quick Services section not found' });
    const metadata = await HomeSectionMetadata.findOne({ key: 'homepage' }).select('actions').lean();
    res.json({ section, cards: Array.isArray(section.config?.cards) ? section.config.cards : [], actions: metadata?.actions || [] });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const section = await HomeSection.findOne({ key: 'quick-services' });
    if (!section) return res.status(404).json({ message: 'Quick Services section not found' });
    const cards = (Array.isArray(req.body?.cards) ? req.body.cards : []).map(normalizeCard);
    const error = await validateCards(cards);
    if (error) return res.status(400).json({ message: error });
    if (req.body?.title !== undefined) section.title = String(req.body.title);
    if (req.body?.subtitle !== undefined) section.subtitle = String(req.body.subtitle);
    if (req.body?.titleBn !== undefined) section.titleBn = String(req.body.titleBn);
    if (req.body?.subtitleBn !== undefined) section.subtitleBn = String(req.body.subtitleBn);
    if (req.body?.active !== undefined) section.active = Boolean(req.body.active);
    section.config = { ...(section.config || {}), cards };
    await section.save();
    res.json({ section, cards });
  } catch (e) { next(e); }
};
