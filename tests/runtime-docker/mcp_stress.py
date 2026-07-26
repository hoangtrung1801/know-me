#!/usr/bin/env python3
import concurrent.futures
import json
import os
import select
import subprocess
import sys
import time
from pathlib import Path


class MCPClient:
    def __init__(self, index: int, project: str):
        self.index = index
        self.project = project
        self.next_id = 1
        self.stderr_path = Path(f"/tmp/knowns-mcp-{index}.stderr")
        self.stderr_file = self.stderr_path.open("w", encoding="utf-8")
        env = os.environ.copy()
        env.setdefault("NO_COLOR", "1")
        env.setdefault("NO_UPDATE_CHECK", "1")
        self.proc = subprocess.Popen(
            ["knowns", "mcp", "--stdio", "--project", project],
            cwd=project,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=self.stderr_file,
            text=True,
            bufsize=1,
        )

    def close(self):
        try:
            if self.proc.stdin:
                self.proc.stdin.close()
        except OSError:
            pass
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=5)
        self.stderr_file.close()

    def _stderr_excerpt(self) -> str:
        try:
            return self.stderr_path.read_text(encoding="utf-8")[-4000:]
        except OSError:
            return ""

    def request(self, method: str, params, timeout: float = 30.0):
        if self.proc.poll() is not None:
            raise RuntimeError(
                f"mcp client {self.index} exited early with {self.proc.returncode}\n"
                + self._stderr_excerpt()
            )
        req_id = self.next_id
        self.next_id += 1
        payload = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
        assert self.proc.stdin is not None
        assert self.proc.stdout is not None
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()

        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"mcp client {self.index} exited with {self.proc.returncode}\n"
                    + self._stderr_excerpt()
                )
            remaining = max(0.0, deadline - time.time())
            ready, _, _ = select.select([self.proc.stdout], [], [], remaining)
            if not ready:
                break
            line = self.proc.stdout.readline()
            if not line:
                continue
            line = line.strip()
            if not line:
                continue
            try:
                response = json.loads(line)
            except json.JSONDecodeError:
                continue
            if response.get("id") != req_id:
                continue
            if response.get("error") is not None:
                raise RuntimeError(
                    f"mcp client {self.index} {method} error: {response['error']}\n"
                    + self._stderr_excerpt()
                )
            return response
        raise TimeoutError(
            f"timeout waiting for mcp client {self.index} response to {method}\n"
            + self._stderr_excerpt()
        )

    def initialize(self):
        self.request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "knowns-runtime-docker-smoke", "version": "1.0.0"},
            },
        )

    def call_tool(self, name: str, arguments: dict, timeout: float = 60.0):
        return self.request(
            "tools/call",
            {"name": name, "arguments": arguments},
            timeout=timeout,
        )


def run_knowns_json(args):
    raw = subprocess.check_output(["knowns", *args], text=True)
    return json.loads(raw)


def csv_env(name: str, default: str) -> list[str]:
    value = os.environ.get(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


def language_for_path(path: str) -> str | None:
    suffix = Path(path).suffix.lower()
    if suffix == ".go":
        return "go"
    if suffix in {".ts", ".tsx", ".js", ".jsx"}:
        return "typescript"
    if suffix == ".cs":
        return "csharp"
    return None


def compact_runtime_status(status: dict) -> dict:
    runtime_status = status.get("status", {})
    clients = runtime_status.get("clients") or []
    return {
        "running": runtime_status.get("running"),
        "pid": runtime_status.get("pid"),
        "version": runtime_status.get("version"),
        "client_count": len(clients),
        "client_pids": sorted({client.get("pid") for client in clients if client.get("pid")}),
        "projects": runtime_status.get("projects") or [],
    }


def compact_lsp_rows(rows: list[dict], languages: list[str]) -> list[dict]:
    wanted = set(languages)
    return [
        {
            "id": row.get("id"),
            "status": row.get("status"),
            "running_state": row.get("running_state"),
            "readiness_state": row.get("readiness_state"),
            "owner": row.get("owner"),
            "daemon_pid": row.get("daemon_pid"),
            "binary": row.get("binary"),
            "backend": row.get("backend"),
        }
        for row in rows
        if isinstance(row, dict) and row.get("id") in wanted
    ]


def assert_runtime_clients(expected: int, verbose: bool):
    status = run_knowns_json(["runtime", "ps", "--json"])
    runtime_status = status.get("status", {})
    clients = runtime_status.get("clients", [])
    print("=== runtime ps while MCP clients are connected ===")
    if verbose:
        print(json.dumps(status, indent=2))
    else:
        print(json.dumps(compact_runtime_status(status), indent=2))
    if not runtime_status.get("running"):
        raise AssertionError("shared runtime is not running")
    if len(clients) < expected:
        raise AssertionError(f"runtime clients = {len(clients)}, want at least {expected}")
    pids = {client.get("pid") for client in clients if client.get("pid")}
    if len(pids) < expected:
        raise AssertionError(f"runtime client pid set = {sorted(pids)}, want {expected} distinct clients")


def ps_args() -> list[str]:
    raw = subprocess.check_output(["ps", "-eo", "args"], text=True)
    return [line.strip() for line in raw.splitlines() if line.strip()]


def assert_lsp_shared(paths: list[str], verbose: bool):
    required_languages = sorted({lang for path in paths if (lang := language_for_path(path))})
    if not required_languages:
        raise AssertionError(f"no LSP languages resolved from paths: {paths}")

    deadline = time.time() + 60
    last_rows = None
    while time.time() < deadline:
        rows = run_knowns_json(["lsp", "list", "--json"])
        last_rows = rows
        by_id = {row.get("id"): row for row in rows if isinstance(row, dict)}
        ready = True
        daemon_pids = set()
        for lang in required_languages:
            row = by_id.get(lang)
            if not row:
                ready = False
                break
            daemon_pid = row.get("daemon_pid")
            daemon_state = row.get("daemon_state")
            owner = row.get("owner")
            if owner != "daemon" or daemon_state != "running" or not daemon_pid:
                ready = False
                break
            daemon_pids.add(daemon_pid)
        if ready and len(daemon_pids) == 1:
            print("=== lsp list after LSP stress ===")
            if verbose:
                print(json.dumps(rows, indent=2))
            else:
                print(json.dumps(compact_lsp_rows(rows, required_languages), indent=2))
            break
        time.sleep(1)
    else:
        print("=== last lsp list before LSP sharing assertion failed ===")
        print(json.dumps(last_rows, indent=2))
        raise AssertionError(f"LSP languages did not converge on one daemon: {required_languages}")

    args = ps_args()
    daemon_lines = [line for line in args if "knowns __lsp-daemon run --project" in line]
    if len(daemon_lines) != 1:
        raise AssertionError(f"LSP daemon process count = {len(daemon_lines)}, want 1: {daemon_lines}")

    if "go" in required_languages:
        gopls_lines = [line for line in args if "gopls" in line and "serve" in line]
        if len(gopls_lines) != 1:
            raise AssertionError(f"gopls process count = {len(gopls_lines)}, want 1: {gopls_lines}")

    if "typescript" in required_languages:
        ts_lines = [line for line in args if "typescript-language-server" in line and "--stdio" in line]
        if len(ts_lines) != 1:
            raise AssertionError(
                f"typescript-language-server process count = {len(ts_lines)}, want 1: {ts_lines}"
            )

    if "csharp" in required_languages:
        csharp_lines = [line for line in args if "csharp-ls" in line]
        if len(csharp_lines) != 1:
            raise AssertionError(f"csharp-ls process count = {len(csharp_lines)}, want 1: {csharp_lines}")

    print("=== lsp shared process assertion ===")
    print(json.dumps({
        "languages": required_languages,
        "daemon_processes": len(daemon_lines),
        "gopls_processes": len([line for line in args if "gopls" in line and "serve" in line]),
        "typescript_language_server_processes": len([
            line for line in args if "typescript-language-server" in line and "--stdio" in line
        ]),
        "csharp_ls_processes": len([line for line in args if "csharp-ls" in line]),
    }, indent=2))


def main():
    if len(sys.argv) != 2:
        print("usage: mcp_stress.py <project-root>", file=sys.stderr)
        return 2
    project = sys.argv[1]
    clients_n = int(os.environ.get("MCP_CLIENTS", "6"))
    calls_n = int(os.environ.get("MCP_CALLS", "2"))
    search_mode = os.environ.get("MCP_SEARCH_MODE", "keyword")
    query = os.environ.get("MCP_QUERY", "runtime smoke shared daemon")
    code_path = os.environ.get("MCP_CODE_PATH", "main.go")
    run_code = os.environ.get("RUN_CODE", "0") == "1"
    lsp_stress = os.environ.get("LSP_STRESS", "0") == "1"
    lsp_paths = csv_env(
        "LSP_PATHS",
        "cmd/knowns/main.go,ui/src/lib/utils.ts,ui/src/api/client.ts,tests/runtime-docker/fixtures/csharp/Program.cs",
    )
    if lsp_stress:
        run_code = True
    hold_seconds = float(os.environ.get("MCP_HOLD_SECONDS", "2"))
    verbose = os.environ.get("VERBOSE", "0") == "1"
    lsp_assignments = [
        {
            "client": index,
            "path": lsp_paths[index % len(lsp_paths)] if lsp_paths else "",
            "language": language_for_path(lsp_paths[index % len(lsp_paths)]) if lsp_paths else None,
        }
        for index in range(clients_n)
    ]
    if lsp_stress:
        print("=== MCP LSP path assignments ===")
        print(json.dumps(lsp_assignments, indent=2 if verbose else None))

    clients = [MCPClient(i, project) for i in range(clients_n)]
    try:
        for client in clients:
            client.initialize()

        assert_runtime_clients(clients_n, verbose)

        def exercise(client: MCPClient):
            client_code_path = lsp_paths[client.index % len(lsp_paths)] if lsp_stress else code_path
            for _ in range(calls_n):
                client.call_tool(
                    "search",
                    {
                        "action": "search",
                        "query": query,
                        "mode": search_mode,
                        "limit": 5,
                    },
                )
                if run_code:
                    client.call_tool(
                        "code",
                        {
                            "action": "symbols",
                            "path": client_code_path,
                            "limit": 20,
                        },
                        timeout=180.0,
                    )

        with concurrent.futures.ThreadPoolExecutor(max_workers=clients_n) as executor:
            futures = [executor.submit(exercise, client) for client in clients]
            for future in concurrent.futures.as_completed(futures):
                future.result()

        assert_runtime_clients(clients_n, verbose)
        if lsp_stress:
            assert_lsp_shared([lsp_paths[index % len(lsp_paths)] for index in range(clients_n)], verbose)
        time.sleep(hold_seconds)
        print(
            f"mcp stress ok: clients={clients_n} calls={calls_n} mode={search_mode} "
            f"run_code={run_code} lsp_stress={lsp_stress}"
        )
        return 0
    finally:
        for client in clients:
            client.close()


if __name__ == "__main__":
    raise SystemExit(main())
