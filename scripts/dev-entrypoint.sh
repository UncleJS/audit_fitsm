#!/bin/sh
set -eu

bun run --cwd /workspace/apps/api dev &
api_pid=$!

bun run --cwd /workspace/apps/web dev &
web_pid=$!

cleanup() {
  kill "$api_pid" "$web_pid" 2>/dev/null || true
  wait "$api_pid" 2>/dev/null || true
  wait "$web_pid" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

while :; do
  if ! kill -0 "$api_pid" 2>/dev/null; then
    wait "$api_pid" || true
    exit 1
  fi

  if ! kill -0 "$web_pid" 2>/dev/null; then
    wait "$web_pid" || true
    exit 1
  fi

  sleep 2
done
