#!/usr/bin/env bash
# ArixGear — FULL REGRESSION RUNNER (Step-audit era).
# Boots the in-memory mongo + seed + API on :4000 INSIDE THIS PROCESS TREE and
# runs every phase suite in order, printing a grand total. Designed to be run
# as ONE command so CI/sandbox environments that reap background processes
# between invocations still get a complete pass.
#   usage: bash scripts/qa_regress_all.sh [--no-boot]
# Suites: P2 44 · P4 81 · Socket 9 · P7 73 · P8 59 · AI 74  → 340 checks.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACK="$ROOT/backend"
BASE="http://localhost:4000"
BOOT=1
[ "${1:-}" = "--no-boot" ] && BOOT=0

echo "╔══════════════════════════════════════════════╗"
echo "║  ArixGear regression — full suite on :4000   ║"
echo "╚══════════════════════════════════════════════╝"

if [ "$BOOT" = "1" ]; then
  pkill -f dev-mongo.js 2>/dev/null; pkill -f "node server.js" 2>/dev/null; sleep 1
  node "$BACK/scripts/dev-mongo.js" > /tmp/mongo.log 2>&1 &
  MONPID=$!
  for i in $(seq 1 40); do ss -tln 2>/dev/null | grep -q 27017 && break; sleep 1; done
  ss -tln | grep -q 27017 || { echo "FATAL: mongo did not come up"; tail -5 /tmp/mongo.log; exit 1; }
  echo "✓ in-memory mongo up"
  (cd "$BACK" && npm run seed > /tmp/seed.log 2>&1) && echo "✓ seed complete" || { echo "FATAL: seed failed"; tail -5 /tmp/seed.log; exit 1; }
  (cd "$BACK" && PORT=4000 node server.js > /tmp/api4000.log 2>&1) &
  APIPID=$!
  for i in $(seq 1 30); do curl -sf -m 2 "$BASE/api/health" > /dev/null 2>&1 && break; sleep 1; done
  curl -sf "$BASE/api/health" > /dev/null || { echo "FATAL: API did not come up"; tail -8 /tmp/api4000.log; exit 1; }
  echo "✓ API up on :4000"
fi

GRAND=0
run() {
  local name="$1" shiftby="$2"; shift 2
  echo ""
  echo "──────── $name ────────"
  local out
  out=$("$@") || true
  echo "$out" | tail -3
  local p f
  p=$(echo "$out" | grep -c '✓' || true)
  f=$(echo "$out" | grep -c '✗' || true)
  echo "→ $name: PASS=$p FAIL=$f"
  GRAND=$((GRAND + p))
  FAILTOTAL=$((FAILTOTAL + f))
}
FAILTOTAL=0

run "P2 catalog"        0 bash "$ROOT/scripts/qa_phase2_api.sh" "$BASE"
run "P4 auth/orders"    0 bash "$ROOT/scripts/qa_phase4_api.sh" "$BASE"
run "P7 integration"    0 bash "$ROOT/scripts/qa_phase7_integration.sh" "$BASE"
run "P8 deals"          0 bash "$ROOT/scripts/qa_phase8_deals.sh" "$BASE"
run "AI system"         0 bash "$ROOT/scripts/qa_ai.sh" "$BASE"
run "Socket realtime"   0 node "$ROOT/scripts/qa_phase4_socket.js" "$BASE" || true

echo ""
echo "══════════════════════════════════════════════"
echo "  GRAND TOTAL: PASS=$GRAND FAIL=$FAILTOTAL  (target 340/0)"
echo "══════════════════════════════════════════════"
[ "$FAILTOTAL" = "0" ] || exit 1
