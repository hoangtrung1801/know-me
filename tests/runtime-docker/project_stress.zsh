#!/usr/bin/env zsh
emulate -L zsh
set -e
set -u
set -o pipefail

export NO_COLOR="${NO_COLOR:-1}"
export NO_UPDATE_CHECK="${NO_UPDATE_CHECK:-1}"

PROJECT="${PROJECT:-/workspace/project}"
MCP_CLIENTS="${MCP_CLIENTS:-3}"
MCP_CALLS="${MCP_CALLS:-3}"
RUN_CODE="${RUN_CODE:-0}"
MCP_SEARCH_MODE="${MCP_SEARCH_MODE:-keyword}"
MCP_QUERY="${MCP_QUERY:-knowns runtime MCP}"
MCP_CODE_PATH="${MCP_CODE_PATH:-cmd/knowns/main.go}"
MCP_HOLD_SECONDS="${MCP_HOLD_SECONDS:-5}"
LSP_STRESS="${LSP_STRESS:-0}"
LSP_PATHS="${LSP_PATHS:-cmd/knowns/main.go,ui/src/lib/utils.ts,ui/src/api/client.ts,tests/runtime-docker/fixtures/csharp/Program.cs}"
VERBOSE="${VERBOSE:-0}"
USE_ONNX="${USE_ONNX:-0}"
ONNX_MODEL="${ONNX_MODEL:-gte-small}"
ONNX_REINDEX="${ONNX_REINDEX:-1}"

if [[ "$LSP_STRESS" == "1" ]]; then
  RUN_CODE=1
fi

CONFIG_BACKUP="/tmp/knowns-project-config.before.json"
RESTORE_CONFIG=0

mkdir -p "$HOME"

restore_project_config() {
  if (( RESTORE_CONFIG == 1 )) && [[ -f "$CONFIG_BACKUP" && -d "$PROJECT/.knowns" ]]; then
    cp "$CONFIG_BACKUP" "$PROJECT/.knowns/config.json" || true
  fi
}

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

  if [[ "$LSP_STRESS" == "1" ]]; then
    echo "=== ${label}: lsp summary ==="
    knowns lsp list --json 2>/tmp/knowns-lsp-list.err \
      | jq '[.[] | select(.id == "go" or .id == "typescript" or .id == "csharp") | {id,status,running_state,readiness_state,owner,daemon_pid,binary,backend}]' \
      || { cat /tmp/knowns-lsp-list.err || true; true; }
  fi

  echo "=== ${label}: process RSS top ==="
  ps -eo pid,ppid,stat,rss,vsz,comm,args --sort=-rss | head -25 || true
  echo "=== ${label}: knowns-related processes ==="
  pgrep -af 'knowns|gopls|typescript-language-server|csharp|node|onnx|knowns-embed' || true
  dump_memory "$label"
}

dump_state() {
  local label="${1:-state}"
  echo "=== ${label}: knowns runtime ps --json ==="
  knowns runtime ps --json 2>/tmp/knowns-runtime-ps.err || {
    cat /tmp/knowns-runtime-ps.err || true
    true
  }

  echo "=== ${label}: knowns lsp list --json ==="
  knowns lsp list --json 2>/tmp/knowns-lsp-list.err || {
    cat /tmp/knowns-lsp-list.err || true
    true
  }

  echo "=== ${label}: process RSS top ==="
  ps -eo pid,ppid,stat,rss,vsz,comm,args --sort=-rss | head -80 || true

  echo "=== ${label}: knowns-related processes ==="
  pgrep -af 'knowns|gopls|typescript-language-server|csharp|node|onnx|knowns-embed' || true

  dump_memory "$label"

  echo "=== ${label}: knowns logs ==="
  find "$HOME/.knowns" -maxdepth 4 -type f 2>/dev/null | sort || true
  for log in "$HOME/.knowns/logs/runtime.log" "$HOME/.knowns/logs/mcp.log"; do
    if [[ -f "$log" ]]; then
      echo "--- tail ${log} ---"
      tail -120 "$log" || true
    fi
  done
  if [[ -d "$PROJECT/.knowns/logs/lsp" ]]; then
    for log in "$PROJECT"/.knowns/logs/lsp/*.log(N); do
      echo "--- tail ${log} ---"
      tail -80 "$log" || true
    done
  fi
}

on_exit() {
  local code="$?"
  if (( code != 0 )); then
    dump_state "failure"
  fi
  knowns runtime stop >/dev/null 2>&1 || true
  restore_project_config
  exit "$code"
}
trap on_exit EXIT

OOM_BEFORE="$(memory_event_value oom_kill)"
OOM_BEFORE="${OOM_BEFORE:-0}"

echo "=== zsh PATH check ==="
zsh -c 'echo "shell=$SHELL"; echo "path=$PATH"; which knowns; knowns --version'

if [[ ! -d "$PROJECT" ]]; then
  echo "project mount not found: $PROJECT" >&2
  exit 1
fi

cd "$PROJECT"

if [[ ! -d .knowns ]]; then
  echo "mounted project is not a Knowns project: $PROJECT" >&2
  exit 1
fi

if [[ ! -w .knowns ]]; then
  echo "mounted project .knowns is not writable; Docker bind mount must allow writes for runtime state" >&2
  exit 1
fi

if [[ "$USE_ONNX" == "1" ]]; then
  echo "=== configure local ONNX semantic search ==="
  cp .knowns/config.json "$CONFIG_BACKUP"
  RESTORE_CONFIG=1
  knowns model download "$ONNX_MODEL"
  knowns model set "$ONNX_MODEL"
  knowns config set settings.semanticSearch.provider local
  if [[ "$MCP_SEARCH_MODE" == "keyword" ]]; then
    MCP_SEARCH_MODE="semantic"
  fi
  knowns model status --plain || true
  if [[ "$ONNX_REINDEX" == "1" ]]; then
    KNOWNS_RUNTIME_INLINE=1 knowns search --reindex
  fi
fi

echo "=== project stress target ==="
pwd
git rev-parse --show-toplevel 2>/dev/null || true
git rev-parse --short HEAD 2>/dev/null || true

echo "=== start runtime surfaces on mounted project ==="
if [[ "$MCP_SEARCH_MODE" == "keyword" ]]; then
  knowns search "$MCP_QUERY" --keyword --plain >/tmp/knowns-project-search.txt || true
else
  knowns search "$MCP_QUERY" --plain >/tmp/knowns-project-search.txt || true
fi
if is_verbose; then
  knowns runtime ps --json || true
else
  knowns runtime ps --json \
    | jq '{running:.status.running,pid:.status.pid,version:.status.version,clients:(.status.clients // [] | length),projects:(.status.projects // [])}' \
    || true
fi
if [[ "$LSP_STRESS" == "1" ]]; then
  if is_verbose; then
    knowns lsp list --json || true
  else
    knowns lsp list --json \
      | jq '[.[] | select(.id == "go" or .id == "typescript" or .id == "csharp") | {id,status,running_state,readiness_state,owner,daemon_pid,binary,backend}]' \
      || true
  fi
fi

echo "=== concurrent MCP project stress ==="
export MCP_CLIENTS MCP_CALLS RUN_CODE MCP_SEARCH_MODE MCP_QUERY MCP_CODE_PATH MCP_HOLD_SECONDS LSP_STRESS LSP_PATHS VERBOSE
python3 /opt/knowns/mcp_stress.py "$PROJECT"

echo "=== project stress state before shutdown ==="
if is_verbose; then
  dump_state "project-stress"
else
  dump_summary "project-stress"
fi

OOM_AFTER="$(memory_event_value oom_kill)"
OOM_AFTER="${OOM_AFTER:-0}"
if (( OOM_AFTER > OOM_BEFORE )); then
  echo "container reported oom_kill increase: before=${OOM_BEFORE} after=${OOM_AFTER}" >&2
  exit 1
fi

knowns runtime stop || true
echo "runtime docker project stress passed"
