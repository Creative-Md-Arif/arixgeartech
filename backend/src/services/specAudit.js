/* Step 6 — SHARED SPEC-SCHEMA AUDIT WRITER. Every schema mutation (admin
   editor save, template apply, AI-import auto-create) increments the
   category's schemaVersion and appends one audit entry (who · when · what).
   Lives in a service so backend controllers AND the AI importer share the
   exact same semantics without circular imports. */
const MAX_ENTRIES = 20;

async function auditSchemaMutation(cat, action, summary, user) {
  cat.schemaVersion = (cat.schemaVersion || 0) + 1;
  const entry = {
    at: new Date(),
    by: (user && user.name) || 'admin',
    byEmail: (user && user.email) || '',
    action: String(action || 'edit').slice(0, 40),
    summary: String(summary || '').slice(0, 400),
  };
  cat.schemaAudit = [entry, ...(cat.schemaAudit || [])].slice(0, MAX_ENTRIES);
  return entry;
}

module.exports = { auditSchemaMutation };
