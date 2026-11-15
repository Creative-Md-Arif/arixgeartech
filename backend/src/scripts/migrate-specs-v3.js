/* Step 5 — DYNAMIC SPEC SYSTEM MIGRATION (idempotent, zero data loss).
   Bootstraps the new system from existing data:
     1. every product with legacy flat `specs` [{k,v}] but no specValues gets
        canonical specValues rows; unknown keys auto-create fields in the
        product's category schema (group 'general' · "Specifications");
     2. every touched category's specGroups schema is saved back (so the
        admin editor + shop facets immediately reflect reality);
     3. legacy flat arrays are left EXACTLY as they are (labels preserved) —
        the next admin save regenerates them from the schema instead.
   Re-running is a no-op: products that already carry specValues are skipped.
   Step 6 — the core lives in services/specMigration.js so server.js can
   auto-run the same pass at boot (needsMigration() probe). The CLI stays
   for manual/on-demand runs with the MIGRATE_DRYRUN report mode.

   usage: node src/scripts/migrate-specs-v3.js
   env:   MIGRATE_DRYRUN=1 → report only, write nothing */
const mongoose = require('mongoose');
require('dotenv').config();
const { runMigration } = require('../services/specMigration');

(async () => {
  const dry = process.env.MIGRATE_DRYRUN === '1';
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear';
  await mongoose.connect(uri);
  console.log('[migrate-specs-v3] connected' + (dry ? ' (DRY RUN)' : ''));
  const r = await runMigration({ dry });
  console.log(`[migrate-specs-v3] done — ${r.migrated} products, ${r.schemasGrown} category schemas grown${dry ? ' (nothing written)' : ''}`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error('[migrate-specs-v3] FATAL', e); process.exit(1); });
