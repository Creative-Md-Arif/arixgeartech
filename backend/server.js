const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const app = require("./app");
const connectDB = require("./src/config/db");

const isProd = process.env.NODE_ENV === "production";
const isVercel = Boolean(process.env.VERCEL);

/* ---------- boot ---------- */
const PORT = process.env.PORT || 5000;

/* Task 30 — production readiness report, printed once at boot (prod only).
   Every line is either ✓ (ready) or ⚠ (works, but fix before launch). */
function prodChecklist(rs) {
  const lines = [];
  const jwt =
    process.env.JWT_SECRET &&
    !/change-this|dev-secret|changeme/i.test(process.env.JWT_SECRET);
  const corsN = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;
  const cloudinary = Boolean(
    process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET),
  );
  const smsLive =
    String(process.env.SMS_DRY_RUN ?? "true") === "false" &&
    process.env.SSLWIRELESS_API_TOKEN &&
    process.env.SSLWIRELESS_SID;
  const smsOff = String(process.env.SMS_PROVIDER || "").toLowerCase() === "off";

  lines.push(
    `${jwt ? "✓" : "✗"} JWT_SECRET ${jwt ? "set" : "MISSING/weak — server already refused to boot if we got here"}`,
  );
  lines.push(
    `${corsN ? "✓" : "⚠"} CORS_ORIGINS ${corsN ? `(${corsN} domain${corsN > 1 ? "s" : ""})` : "empty — ALL origins allowed in production"}`,
  );
  lines.push(
    `${rs ? "✓" : "⚠"} MongoDB ${rs ? "replica set — transactions ON" : "NOT a replica set — multi-doc transactions disabled (fallback mode)"}`,
  );
  lines.push(
    `${cloudinary ? "✓" : "⚠"} Images ${cloudinary ? "on Cloudinary" : "on LOCAL disk — lost on redeploy; set CLOUDINARY_*"}`,
  );
  lines.push(
    `${process.env.RESEND_API_KEY ? "✓" : "⚠"} Email ${process.env.RESEND_API_KEY ? "live (Resend)" : "DRY-RUN — customers get no real emails; set RESEND_API_KEY"}`,
  );
  lines.push(
    `${smsOff ? "⚠" : smsLive ? "✓" : "⚠"} SMS ${smsOff ? "OFF" : smsLive ? "LIVE (SSLWireless)" : "DRY-RUN — set SMS_DRY_RUN=false + SSLWIRELESS_* for real SMS"}`,
  );
  lines.push(
    `${process.env.ADMIN_NOTIFY_EMAIL ? "✓" : "⚠"} Question alerts ${process.env.ADMIN_NOTIFY_EMAIL ? "→ " + process.env.ADMIN_NOTIFY_EMAIL : "disabled — set ADMIN_NOTIFY_EMAIL"}`,
  );
  /* Phase 9 — AI stack: informational (rules mode is a valid zero-cost end state) */
  const aiLlm = Boolean(
    process.env.GEMINI_API_KEY || process.env.OPENAI_BASE_URL,
  );
  lines.push(
    `${aiLlm ? "✓" : "ℹ"} AI ${aiLlm ? "LLM provider available (Gemini / OpenAI-compatible)" : "grounded-rules mode — zero cost, zero hallucination; set GEMINI_API_KEY (or Admin → AI Console) for conversational answers"}`,
  );
  console.log("\n ── PRODUCTION READINESS ─────────────────────────────");
  lines.forEach((l) => console.log("  " + l));
  console.log(" ─────────────────────────────────────────────────────\n");
}

let server;
let aiImportRecoveryTimer;

/* Vercel serverless-এ listen / Socket.IO / setInterval চলে না —
   এই boot অংশ শুধু লোকাল বা VPS-এ (VERCEL সেট না থাকলে) চলবে */
if (!isVercel) {
  connectDB()
    .then(async (rs) => {
      if (isProd) prodChecklist(rs);
      /* Step 6 — SPEC-SYSTEM MIGRATION AUTO-RUN. The migrate-specs-v3 pass is
         idempotent; a cheap probe checks for legacy-flat products that never
         grew canonical specValues (CSV import, restore from an old backup) and
         bootstraps them so the PDP/filters/compare never meet a schema-less
         doc. Never blocks or fails the boot. */
      try {
        const specMigration = require("./src/services/specMigration");
        if (await specMigration.needsMigration()) {
          const r = await specMigration.runMigration();
          console.log(
            `[boot] spec migration auto-ran — ${r.migrated} products, ${r.schemasGrown} category schemas grown`,
          );
        }
      } catch (e) {
        console.warn("[boot] spec migration skipped:", e.message);
      }
      const aiImporter = require("./src/services/ai/importer");
      const recoverAiImports = async () => {
        try {
          const result = await aiImporter.recoverStuckImports();
          if (result.failed || result.resumed) {
            console.warn(
              `[ai-import] recovery: ${result.failed} stalled, ${result.resumed} pending resumed`,
            );
          }
        } catch (e) {
          console.error("[ai-import] recovery check failed:", e.message);
        }
      };
      await recoverAiImports();
      aiImportRecoveryTimer = setInterval(recoverAiImports, 60_000);
      const httpServer = require("http").createServer(app);
      /* Phase 4 (4.3) — Socket.IO gateway (JWT handshake, user/admin/order rooms).
         SSE stays for the existing bells; this is the additive realtime channel. */
      require("./src/services/realtime").init(httpServer);
      server = httpServer.listen(PORT, () => {
        console.log(`\n ArixGear API ready → http://localhost:${PORT}`);
        console.log(`   storefront  http://localhost:${PORT}/`);
        console.log(`   admin panel http://localhost:${PORT}/admin/`);
        console.log(
          `   realtime    ws://localhost:${PORT}/socket.io (JWT auth)\n`,
        );
      });
      server.on("error", (e) => {
        if (e.code === "EADDRINUSE") {
          console.error(
            `[server] Port ${PORT} is already in use. Stop the existing API process or set PORT to a free port.`,
          );
        } else {
          console.error("[server] HTTP listener failed:", e.message);
        }
        if (aiImportRecoveryTimer) clearInterval(aiImportRecoveryTimer);
        require("mongoose")
          .connection.close()
          .finally(() => process.exit(1));
      });
    })
    .catch((e) => {
      console.error("MongoDB connection failed:", e.message);
      console.error(
        "Tip: run `npm run mongo` in another terminal (local dev DB), or set MONGODB_URI to Atlas.",
      );
      process.exit(1);
    });

  /* ---------- graceful shutdown (local / VPS only) ---------- */
  function shutdown(signal) {
    console.log(`\n[${signal}] shutting down…`);
    if (aiImportRecoveryTimer) clearInterval(aiImportRecoveryTimer);
    if (server) {
      server.close(() => {
        const mongoose = require("mongoose");
        mongoose.connection.close().then(() => process.exit(0));
      });
      setTimeout(() => process.exit(0), 8000).unref(); // force-exit if connections hang
    } else process.exit(0);
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
