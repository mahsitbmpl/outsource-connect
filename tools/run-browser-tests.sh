#!/bin/sh
# Runs every browser test, each against a fresh local test server. Usage: sh tools/run-browser-tests.sh [screenshot folder]
OUT=${1:-/tmp/osc-shots}; mkdir -p "$OUT"; cd "$(dirname "$0")/.."
run() { flags="$1"; test="$2"
  pkill -f tools/dev-server.js 2>/dev/null; sleep 1
  node tools/dev-server.js $flags > "$OUT/server.log" 2>&1 & sleep 6
  python3 "tests/$test" "$OUT" || { echo "FAILED: $test"; pkill -f tools/dev-server.js; exit 1; }
}
run "--demo" e2e_console.py
run "--demo" e2e_kiosk.py
run "--demo --punches" e2e_duties.py
run "--demo --punches" e2e_phase4.py
run "--demo --month" e2e_phase5.py
pkill -f tools/dev-server.js; echo "ALL BROWSER TESTS OK"
