#!/usr/bin/env bash
# Step 4 — boot the stack and run ONE QA suite in the SAME process tree
# (sandbox reaps background processes between invocations).
#   usage: bash scripts/qa_one_suite.sh <p2|p4|p7|p8|ai|socket|step6|xss|step7|all>
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="http://localhost:4000"
S="${1:-all}"

pkill -f dev-mongo.js 2>/dev/null; pkill -f "node server.js" 2>/dev/null; pkill -f "backend/server.js" 2>/dev/null; sleep 1
node "$ROOT/backend/scripts/dev-mongo.js" > /tmp/mongo.log 2>&1 &
for i in $(seq 1 40); do ss -tln 2>/dev/null | grep -q 27017 && break; sleep 1; done
ss -tln | grep -q 27017 || { echo "FATAL: mongo down"; tail -3 /tmp/mongo.log; exit 1; }
(cd "$ROOT/backend" && npm run seed > /tmp/seed.log 2>&1) || { echo "FATAL seed"; tail -5 /tmp/seed.log; exit 1; }
(cd "$ROOT/backend" && PORT=4000 node server.js > /tmp/api4000.log 2>&1) &
for i in $(seq 1 30); do curl -sf -m 2 "$BASE/api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -sf "$BASE/api/health" >/dev/null || { echo "FATAL: api down"; tail -8 /tmp/api4000.log; exit 1; }
echo "✓ stack up (mongo+seed+api)"

case "$S" in
  p2)     bash "$ROOT/scripts/qa_phase2_api.sh" "$BASE" ;;
  p4)     bash "$ROOT/scripts/qa_phase4_api.sh" "$BASE" ;;
  p7)     bash "$ROOT/scripts/qa_phase7_integration.sh" "$BASE" ;;
  p8)     bash "$ROOT/scripts/qa_phase8_deals.sh" "$BASE" ;;
  ai)     bash "$ROOT/scripts/qa_ai.sh" "$BASE" ;;
  socket) node "$ROOT/scripts/qa_phase4_socket.js" "$BASE" ;;
  step6)  node "$ROOT/scripts/qa_step6_ops.js" "$BASE" ;;
  xss)    node "$ROOT/scripts/qa_step6_xss.js" "$BASE" ;;
  step7)  node "$ROOT/scripts/qa_step7_ops.js" "$BASE" ;;
  all)
    T=0; F=0
    for s in p2 p4 p7 p8 ai socket step6 xss step7; do
      echo "──────── $s ────────"
      out=$("$(dirname "$0")/qa_one_suite.sh" "$s" 2>&1) || true
      echo "$out" | tail -2
      p=$(echo "$out" | grep -c '✓' || true); f=$(echo "$out" | grep -c '✗' || true)
      echo "→ $s PASS=$p FAIL=$f"; T=$((T+p)); F=$((F+f))
    done
    echo "═══════ TOTAL PASS=$T FAIL=$F ═══════"
    [ "$F" = "0" ]
    ;;
  *) echo "unknown suite $S"; exit 2 ;;
esac
