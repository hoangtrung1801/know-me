# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.0] - 2026-09-09

### Added
- Redesigned Web UI with new theme system (OKLCH color space, unified tokens), refined components, and design system documentation (`DESIGN.md`, `PRODUCT.md`).

### Changed
- Updated release workflow brand name and dual archive generation (`knownme-*` and `knowns-*`).

## [1.7.0] - 2026-09-08

### Changed
- Migrated default project and global storage directory from `.known-me` to `.know-me`.
- Updated all internal path resolvers, CLI commands, LSP routing, MCP servers, and tests to use `.know-me`.
- Updated installer scripts and environment defaults.

## [1.6.2] - 2026-09-08

### Added
- Open source release readiness: canonical public repository setup at `https://github.com/hoangtrung1801/know-me`.
- Added `SECURITY.md` vulnerability reporting policy and guidelines.
- Standardized `CONTRIBUTING.md` for Go 1.24.2 + Bun workspace development.
- Anonymous installation support in `install/install.sh` without requiring a personal access token.

### Changed
- Refined `.gitignore` to preserve agent skill definitions while ignoring local developer artifacts.
- Improved `Makefile` version fallback resolution to read directly from local package metadata.
- Optimized repository clone size by removing unreferenced heavy demo assets.

### Fixed
- Fixed release artifact and self-update download URLs across platforms.
- Fixed Kanban task creation and page navigation state persistence in Web UI.

## [1.6.0] - 2026-08-28

### Added
- Rebranded CLI entry point to `knownme` and local repository storage to `.know-me/`.
- Cross-platform agent integration for Claude Code, Codex, and generic agents.
- Full local Web UI workspace with task board, document viewer, and knowledge graph.

## [1.5.0] - 2026-08-15

### Added
- Model Context Protocol (MCP) server integration (`knownme mcp`).
- Code intelligence indexing and symbol extraction.
- Keyword and semantic search retrieval engine.
