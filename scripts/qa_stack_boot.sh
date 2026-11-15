#!/bin/bash
# FORGED — boot stack (mongo + seed + API) and LEAVE IT RUNNING for browser QA
set -u
cd /home/z/my-project/backend

pkill -f dev-mongo.js 2>/dev/null; pkill -f "node server.js" 2>/dev/null; sleep 1

nohup node scripts/dev-mongo.js > /tmp/mongo.log 2>&1 &
for i in $(seq 1 30); do ss -tln 2>/dev/null | grep -q 27017 && break; sleep 1; done
ss -tln | grep -q 27017 && echo "OK mongo up" || { echo "FAIL mongo"; tail -5 /tmp/mongo.log; exit 1; }

npm run seed 2>&1 | tail -3

nohup node server.js > /tmp/api.log 2>&1 &
for i in $(seq 1 20); do curl -sf -m 2 localhost:5000/api/health >/dev/null 2>&1 && break; sleep 1; done
curl -sf localhost:5000/api/health && echo "  <- api up" || { echo "FAIL api"; tail -8 /tmp/api.log; exit 1; }
echo "STACK READY (left running)"
