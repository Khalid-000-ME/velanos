#!/usr/bin/env bash
# Stops the local services. Kills by port and by working directory because tsx spawns a child node
# process whose argv does not contain the script path, and the watcher listens on no port.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for port in 3000 4000 4100; do
  for pid in $(lsof -nP -iTCP:$port -sTCP:LISTEN -t 2>/dev/null); do kill "$pid" 2>/dev/null; done
done
for pid in $(pgrep -f node 2>/dev/null); do
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep ^n | sed 's/^n//')
  case "$cwd" in "$ROOT"/apps/server|"$ROOT"/apps/agent|"$ROOT"/apps/watcher|"$ROOT"/apps/web) kill "$pid" 2>/dev/null ;; esac
done
pkill -f "next dev" 2>/dev/null
sleep 1
