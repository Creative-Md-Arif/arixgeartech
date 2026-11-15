/**
 * Task 39 — team (sub-admin) management + audit log reader.
 * Both are OWNER-only (full admins): sub-admins can never manage staff or
 * read the audit trail, even if someone grants them a matching module key.
 */
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Category = require('../models/Category'); // Step 7 — schema edit stream
const { MODULES } = require('../middleware/auth');

const STAFF_SELECT = 'name email role permissions active createdAt lastLoginAt';

/* ── GET /api/admin/team — staff list (sub-admins only; the owner comes from login) ── */
exports.list = async (_req, res, next) => {
  try {
    const items = await User.find({ role: 'subadmin' }).select(STAFF_SELECT).sort({ createdAt: -1 });
    res.json({ items, modules: MODULES });
  } catch (e) { next(e); }
};

/* ── POST /api/admin/team — create a sub-admin ── */
exports.create = async (req, res, next) => {
  try {
    const { name, email, password, permissions } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
    if (!email || !/^\S+@\S+\.\S+$/.test(String(email).toLowerCase())) return res.status(400).json({ message: 'A valid email is required' });
    if (!password || String(password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const perms = Array.isArray(permissions) ? permissions.filter((p) => MODULES.includes(p)) : [];
    if (!perms.length) return res.status(400).json({ message: 'Grant at least one module permission' });

    const dupe = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (dupe) return res.status(400).json({ message: 'This email is already registered' });

    const sub = await User.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      password: String(password),
      role: 'subadmin',
      permissions: perms,
      active: true,
      emailVerified: true, /* Task 51 — internal staff, owner-invited: no OTP gate */
    });

    res.status(201).json({ subadmin: sub.toSafeJSON() });
  } catch (e) { next(e); }
};

/* ── PUT /api/admin/team/:id — rename / re-permission / (re)set password / activate ── */
exports.update = async (req, res, next) => {
  try {
    const sub = await User.findOne({ _id: req.params.id, role: 'subadmin' });
    if (!sub) return res.status(404).json({ message: 'Sub-admin not found' });

    const { name, password, permissions, active } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Name cannot be empty' });
      sub.name = String(name).trim();
    }
    if (password !== undefined) {
      if (!password || String(password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
      sub.password = String(password);
    }
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) return res.status(400).json({ message: 'permissions must be an array' });
      const perms = permissions.filter((p) => MODULES.includes(p));
      if (!perms.length) return res.status(400).json({ message: 'Grant at least one module permission' });
      sub.permissions = perms;
    }
    if (active !== undefined) sub.active = !!active;

    await sub.save();
    res.json({ subadmin: sub.toSafeJSON() });
  } catch (e) { next(e); }
};

/* ── DELETE /api/admin/team/:id — remove the staff account entirely ── */
exports.remove = async (req, res, next) => {
  try {
    const sub = await User.findOneAndDelete({ _id: req.params.id, role: 'subadmin' });
    if (!sub) return res.status(404).json({ message: 'Sub-admin not found' });
    res.json({ ok: true, id: sub._id });
  } catch (e) { next(e); }
};

/* ── GET /api/admin/audit?entity=&action=&q=&limit= — audit trail reader ── */
exports.auditList = async (req, res, next) => {
  try {
    const { entity, action, actor, q } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 300);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const qy = {};
    if (entity) qy.entity = String(entity);
    if (action) qy.action = String(action);
    if (actor) qy.actor = String(actor);
    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      qy.$or = [{ label: rx }, { actorEmail: rx }, { actorName: rx }, { entityId: rx }];
    }
    const [items, total, facetsAgg, byDayAgg] = await Promise.all([
      AuditLog.find(qy).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      AuditLog.countDocuments(qy),
      AuditLog.aggregate([
        { $group: { _id: '$action', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 30 },
      ]),
      /* Task 57 — last 14 days of activity for the audit page sparkline */
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 14 * 864e5) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    res.json({
      items: items.map((i) => i.publicView()),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      modules: MODULES,
      /* Task 57 — quick stats: action facets + per-day volume */
      facets: Object.fromEntries(facetsAgg.map((f) => [f._id, f.n])),
      stats: { byDay: byDayAgg },
      /* Step 7 — SCHEMA EDIT STREAM (#7): the embedded per-category schemaAudit
         trail (Step 6) surfaces here too, so spec-schema mutations (editor
         saves, template applies, AI-import auto-creates) show up on the Audit
         page next to every other staff action. Recent 40 across categories. */
      schemaEdits: (await Category.find({ schemaAudit: { $exists: true, $ne: [] } })
        .select('name slug schemaVersion schemaAudit').lean())
        .flatMap((c) => (c.schemaAudit || []).map((a, i) => ({
          type: 'schema', entity: 'category', action: a.action, categoryName: c.name, category: c.slug,
          at: a.at, by: a.by, byEmail: a.byEmail, summary: a.summary,
          version: Math.max(0, (c.schemaVersion || 0) - i),
        })))
        .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
        .slice(0, 40),
    });
  } catch (e) { next(e); }
};
