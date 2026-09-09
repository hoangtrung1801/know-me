# Contributing

Thank you for considering contributing to Know-Me!

Before you start, please read our [Philosophy](./PHILOSOPHY.md) and [Architecture](./ARCHITECTURE.md) to understand the principles and structure that guide this project.

---

## Core Principles for Contributors

### 1. Keep it simple

Know-Me is intentionally minimal. Before adding a feature, ask:

- Does this align with the [philosophy](./PHILOSOPHY.md)?
- Can this be achieved with existing primitives (tasks, docs, decisions, memories, refs)?
- Will this add complexity for all users, or just some?

**We'd rather have fewer features that work well than many features that complicate.**

### 2. Files are the source of truth

Any new feature must respect that `.know-me/` files are the source of truth.

- Don't introduce hidden remote state
- Human-readable Markdown and JSON in `.know-me/` are the canonical format
- Make sure data survives without Know-Me

### 3. CLI-first & Agent-native

The CLI and MCP server are primary interfaces:

- Work fully from the CLI (`knowme`)
- Provide `--plain` output for human and AI consumption
- Support `--json` for programmatic integration
- Maintain clean MCP tools in `internal/mcp/`

The Web UI visualizes and coordinates, but core flows must be fully functional from the CLI.

---

## Getting Started

### Prerequisites

- **Go** >= 1.24.2
- **Bun** (for UI building and Playwright tests)
- **golangci-lint** (for Go linting)
- **Make**

### Setup

```bash
# Clone the repository
git clone https://github.com/hoangtrung1801/know-me.git
cd know-me

# Build UI and CLI binary
make all

# Verify the build
./bin/knowme --version
```

### Project Structure

```
known-me/
├── cmd/
│   ├── knowme/           # Main CLI entry point
│   └── knowns/           # Distribution alias entry point
├── internal/
│   ├── cli/              # Cobra commands and flags
│   ├── mcp/              # Model Context Protocol server and tools
│   ├── models/           # Core domain models (tasks, docs, memories, decisions)
│   ├── storage/          # Local file-based storage (.know-me/)
│   ├── server/           # Local HTTP server and API routes
│   ├── search/           # Keyword, hybrid, and semantic search
│   └── lsp/              # Code intelligence & LSP daemon
├── ui/                   # React + Vite + TypeScript local workspace UI
├── install/              # Install and uninstall scripts
└── tests/                # CLI, MCP, and structural E2E tests
```

---

## Development Workflow

### Useful Make Targets

```bash
make all             # Build both UI and CLI
make build           # Build Go CLI binary (bin/knowme)
make test            # Run Go unit and race tests
make lint            # Run golangci-lint
make test-e2e        # Run CLI and MCP E2E tests
make test-e2e-ui     # Run Playwright UI E2E tests
make dev-go          # Run Go server with hot reload (requires air)
make dev-ui          # Run Vite UI dev server
make dev-all         # Run both Go and UI dev servers concurrently
```

### Making Changes

1. **Create a branch**:
   ```bash
   git checkout -b feature/my-feature
   # or
   git checkout -b fix/my-fix
   ```

2. **Make your changes**:
   - Write clear, idiomatic Go and TypeScript
   - Keep functions focused and packages cohesive
   - Add tests for new behavior or bug fixes
   - Keep changes minimal and focused

3. **Verify locally**:
   ```bash
   make test
   make lint
   ```

4. **Commit with clear Conventional Commits messages**:
   ```bash
   git commit -m "feat(cli): add --filter flag to task list"
   ```

5. **Open a Pull Request**:
   - Describe what changed and why
   - Reference any relevant issues
   - Ensure all CI checks pass

---

## Community & Code of Conduct

This project is governed by the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
