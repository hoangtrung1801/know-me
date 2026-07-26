#!/usr/bin/env zsh
emulate -L zsh
set -e
set -u
set -o pipefail

export NO_COLOR="${NO_COLOR:-1}"
export NO_UPDATE_CHECK="${NO_UPDATE_CHECK:-1}"

PROJECT="${PROJECT:-/workspace/project}"
MCP_CLIENTS="${MCP_CLIENTS:-3}"
MCP_CALLS="${MCP_CALLS:-1}"
MCP_HOLD_SECONDS="${MCP_HOLD_SECONDS:-1}"
RUN_CODE="${RUN_CODE:-0}"
MCP_SEARCH_MODE="${MCP_SEARCH_MODE:-keyword}"
VERBOSE="${VERBOSE:-0}"

memory_event_value() {
  local key="$1"
  if [[ -f /sys/fs/cgroup/memory.events ]]; then
    awk -v k="$key" '$1 == k { print $2 }' /sys/fs/cgroup/memory.events
  else
    printf '0\n'
  fi
}

is_verbose() {
  [[ "$VERBOSE" == "1" ]]
}

dump_memory() {
  echo "=== ${1:-state}: cgroup memory ==="
  if [[ -f /sys/fs/cgroup/memory.current ]]; then
    printf 'memory.current='
    cat /sys/fs/cgroup/memory.current
  fi
  if [[ -f /sys/fs/cgroup/memory.max ]]; then
    printf 'memory.max='
    cat /sys/fs/cgroup/memory.max
  fi
  if [[ -f /sys/fs/cgroup/memory.events ]]; then
    cat /sys/fs/cgroup/memory.events
  fi
}

dump_summary() {
  local label="${1:-state}"
  echo "=== ${label}: runtime summary ==="
  knowns runtime ps --json 2>/tmp/knowns-runtime-ps.err \
    | jq '{running:.status.running,pid:.status.pid,version:.status.version,clients:(.status.clients // [] | length),projects:(.status.projects // [])}' \
    || { cat /tmp/knowns-runtime-ps.err || true; true; }

  echo "=== ${label}: process RSS top ==="
  ps -eo pid,ppid,stat,rss,vsz,comm,args --sort=-rss | head -25 || true
  echo "=== ${label}: knowns-related processes ==="
  pgrep -af 'knowns|gopls|csharp|node|onnx|knowns-embed' || true
  dump_memory "$label"
}

dump_state() {
  local label="${1:-state}"
  echo "=== ${label}: knowns runtime ps --json ==="
  knowns runtime ps --json 2>/tmp/knowns-runtime-ps.err || {
    cat /tmp/knowns-runtime-ps.err || true
    true
  }

  echo "=== ${label}: process RSS top ==="
  ps -eo pid,ppid,stat,rss,vsz,comm,args --sort=-rss | head -80 || true

  echo "=== ${label}: knowns-related processes ==="
  pgrep -af 'knowns|gopls|csharp|node|onnx|knowns-embed' || true

  dump_memory "$label"

  echo "=== ${label}: knowns logs ==="
  find "$HOME/.knowns" -maxdepth 4 -type f 2>/dev/null | sort || true
  for log in "$HOME/.knowns/logs/runtime.log" "$HOME/.knowns/logs/mcp.log"; do
    if [[ -f "$log" ]]; then
      echo "--- tail ${log} ---"
      tail -120 "$log" || true
    fi
  done
}

on_exit() {
  local code="$?"
  if (( code != 0 )); then
    dump_state "failure"
  fi
  exit "$code"
}
trap on_exit EXIT

OOM_BEFORE="$(memory_event_value oom_kill)"
OOM_BEFORE="${OOM_BEFORE:-0}"

echo "=== zsh PATH check ==="
zsh -lc 'echo "shell=$SHELL"; echo "path=$PATH"; which knowns; knowns --version'

echo "=== create smoke project ==="
rm -rf "$PROJECT"
mkdir -p "$PROJECT"
cd "$PROJECT"
git init -q

cat > go.mod <<'EOF'
module runtime-smoke

go 1.24.2
EOF

cat > main.go <<'EOF'
package main

import "fmt"

type Runner struct{}

func (Runner) Run() string {
	return "runtime smoke shared daemon"
}

func main() {
	fmt.Println(Runner{}.Run())
}
EOF

knowns init docker-smoke --no-wizard --no-open --git-tracked
knowns task create "Runtime smoke task" \
  --description "Exercise shared Knowns runtime queue and MCP clients in Docker." \
  --label runtime-smoke
knowns doc create "Runtime Smoke Guide" \
  --content "# Runtime Smoke Guide\n\nShared daemon runtime smoke test content."

echo "=== start runtime and LSP status surfaces ==="
knowns search "runtime smoke" --keyword --plain >/tmp/knowns-keyword-search.txt
knowns lsp list --json >/tmp/knowns-lsp-list.json
if is_verbose; then
  cat /tmp/knowns-lsp-list.json
else
  jq '[.[] | select(.owner == "daemon") | {id,status,owner,daemon_pid}]' /tmp/knowns-lsp-list.json
fi

if ! jq -e 'map(select(.owner == "daemon")) | length > 0' /tmp/knowns-lsp-list.json >/dev/null; then
  echo "expected at least one LSP status row with owner=daemon" >&2
  exit 1
fi

echo "=== concurrent MCP stress ==="
export MCP_CLIENTS MCP_CALLS MCP_HOLD_SECONDS RUN_CODE MCP_SEARCH_MODE VERBOSE
python3 /opt/knowns/mcp_stress.py "$PROJECT"

echo "=== post-test state before shutdown ==="
if is_verbose; then
  dump_state "post-test"
else
  dump_summary "post-test"
fi

OOM_AFTER="$(memory_event_value oom_kill)"
OOM_AFTER="${OOM_AFTER:-0}"
if (( OOM_AFTER > OOM_BEFORE )); then
  echo "container reported oom_kill increase: before=${OOM_BEFORE} after=${OOM_AFTER}" >&2
  exit 1
fi

knowns runtime stop || true
echo "runtime docker smoke passed"
