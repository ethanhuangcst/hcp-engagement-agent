#!/usr/bin/env bash
# Stop processes started by scripts/init.sh (pids under .run/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="$ROOT/.run"

stop_one() {
  local name="$1"
  local pidf="$RUN/${name}.pid"
  [[ -f "$pidf" ]] || return 0
  local pid
  pid="$(cat "$pidf")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "stopping $name pid=$pid"
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$pidf"
}

stop_one web
stop_one mcp
stop_one qdrant
echo "done"
