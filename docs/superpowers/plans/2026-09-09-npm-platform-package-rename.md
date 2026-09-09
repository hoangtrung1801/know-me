# npm Platform Package Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename platform-specific npm package identities to `knowme-*` and `@knowme/*` while keeping the public `knowns` wrapper and `knowme` binaries unchanged.

**Architecture:** The wrapper package remains the stable user-facing npm package. Platform identity is defined once by the installer/launcher mapping and mirrored by static manifests, Makefile outputs, release workflow staging, and release assets. No old platform aliases are emitted.

**Tech Stack:** Node.js CommonJS, Bun tests, npm package manifests, Make, GitHub Actions YAML, Go cross-build outputs, shell release validation.

---

## File map

- `npm/knowme-*/package.json`: six platform package manifests; renamed directories and scoped names.
- `npm/knowns/package.json`: stable wrapper package with new optional dependency names.
- `npm/knowns/install.js`: platform mapping and GitHub release fallback asset names.
- `npm/knowns/bin/knowns.js`: runtime lookup of the new scoped platform packages.
- `npm/knowns/install.test.js`: mapping and manifest assertions.
- `Makefile`: local npm build and cleanup output paths.
- `.gitignore`: ignored platform binary paths.
- `.github/workflows/publish.yml`: CI matrix, staging, validation, archives, and release names.
- `docs/en/getting-started/installation.md` and any other active references found by scoped search: release archive examples.
- `docs/superpowers/specs/2026-09-09-npm-platform-package-rename-design.md`: approved design.

### Task 1: Establish failing package identity assertions

**Files:**
- Modify: `npm/knowns/install.test.js`

- [ ] **Step 1: Update mapping expectations to the target identity**

Change the Windows and macOS mapping expectations from `@knowns/*` / `knowns-*` to `@knowme/*` / `knowme-*`. Update the manifest fixture path from `../knowns-darwin-x64/package.json` to `../knowme-darwin-x64/package.json`.

- [ ] **Step 2: Add a manifest identity table test**

Read these six files:

```text
../knowme-darwin-arm64/package.json
../knowme-darwin-x64/package.json
../knowme-linux-arm64/package.json
../knowme-linux-x64/package.json
../knowme-win-arm64/package.json
../knowme-win-x64/package.json
```

Assert each manifest name equals the matching `@knowme/<platform>-<arch>` package name. Assert each manifest has the existing `main` value and platform metadata; do not change executable or native-library contracts in this test.

- [ ] **Step 3: Run the focused test and verify it fails for the old repository state**

Run:

```bash
bun test npm/knowns/install.test.js
```

Expected: failure because the old directories and `@knowns/*` names do not satisfy the new assertions.

### Task 2: Rename static platform packages and wrapper dependencies

**Files:**
- Rename: `npm/knowns-darwin-arm64/` → `npm/knowme-darwin-arm64/`
- Rename: `npm/knowns-darwin-x64/` → `npm/knowme-darwin-x64/`
- Rename: `npm/knowns-linux-arm64/` → `npm/knowme-linux-arm64/`
- Rename: `npm/knowns-linux-x64/` → `npm/knowme-linux-x64/`
- Rename: `npm/knowns-win-arm64/` → `npm/knowme-win-arm64/`
- Rename: `npm/knowns-win-x64/` → `npm/knowme-win-x64/`
- Modify: all six renamed `package.json` files
- Modify: `npm/knowns/package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Rename the six package directories**

Use `mv` so Git detects each directory as a rename. Do not rename `npm/knowns/`; it is the public wrapper package.

- [ ] **Step 2: Change each platform manifest scope**

In each renamed manifest, replace only the package name:

```json
"name": "@knowns/<platform>-<arch>"
```

with:

```json
"name": "@knowme/<platform>-<arch>"
```

Keep `main`, `files`, OS, CPU, and native-library patterns unchanged.

- [ ] **Step 3: Update wrapper optional dependencies**

In `npm/knowns/package.json`, replace all six `@knowns/*` keys with the corresponding `@knowme/*` keys. Keep their versions, wrapper name, and executable aliases unchanged.

- [ ] **Step 4: Update ignored binary paths**

Replace `.gitignore` patterns `npm/knowns-*/...` with `npm/knowme-*/...` for both executable spellings currently ignored. Do not remove the old binary spelling patterns until the generated output no longer uses them; retain only patterns needed for the new `knowme-*` package directories after this cutover.

### Task 3: Update npm runtime resolution and tests

**Files:**
- Modify: `npm/knowns/install.js`
- Modify: `npm/knowns/bin/knowns.js`
- Modify: `npm/knowns/install.test.js`

- [ ] **Step 1: Update installer platform mapping**

In `getPlatformPackage`, change:

```js
name: `@knowns/${p}-${a}`,
asset: `knowns-${p}-${a}`,
```

to:

```js
name: `@knowme/${p}-${a}`,
asset: `knowme-${p}-${a}`,
```

Leave platform and architecture normalization unchanged.

- [ ] **Step 2: Update launcher package lookup**

In `getBinaryPath`, change the scoped package construction from `@knowns/${p}-${a}` to `@knowme/${p}-${a}`. Keep binary lookup order, Windows staging, and user-facing wrapper package install hints unchanged.

- [ ] **Step 3: Add explicit release asset coverage**

Extend the existing mapping tests so a supported Windows and macOS mapping asserts both the `@knowme/*` package name and `knowme-*` release asset. The existing test already exercises the public mapping contract; do not add tests for internal string copies.

- [ ] **Step 4: Run npm tests after implementation edits**

Run:

```bash
bun test npm/knowns/install.test.js npm/knowns/knowns-bin.test.js
```

Expected: all focused npm tests pass.

### Task 4: Update local and release build output identities

**Files:**
- Modify: `Makefile`
- Modify: `.github/workflows/publish.yml`

- [ ] **Step 1: Update Makefile npm output paths**

Change all six `npm-build` targets from `npm/knowns-*` to `npm/knowme-*`. Keep output files `knowme` and `knowme.exe`.

- [ ] **Step 2: Update Makefile cleanup paths**

Change the platform directory glob in `clean` to `npm/knowme-*` and retain cleanup for both current and historical binary spellings inside those directories only if the paths are still generated or need removal from a dirty workspace.

- [ ] **Step 3: Update release matrix package identities**

In `.github/workflows/publish.yml`, change every platform matrix `npm_pkg` from `knowns-*` to `knowme-*`.

- [ ] **Step 4: Update release staging and validation**

Change artifact download paths, `PLATFORM_PKGS`, package-copy loops, executable checks, native-library checks, and tarball verification paths to `knowme-*`. Keep the binary member names `knowme` and `knowme.exe`.

- [ ] **Step 5: Update wrapper dependency generation**

Change generated optional dependency keys in the workflow from `@knowns/*` to `@knowme/*`. Keep the generated wrapper package name `knowns` and its bin aliases.

- [ ] **Step 6: Generate only new archive identities**

Change the archive loop to produce `knowme-*.tar.gz` and matching checksums directly. Remove the `knowns-*` archive copy alias generation so the workflow emits one canonical platform identity.

- [ ] **Step 7: Search active npm/build/release surfaces for stale platform names**

Use the repository search tool over `npm`, `Makefile`, `.github/workflows`,
`docs/en`, and `docs/vi` with these patterns:

```text
@knowns/(darwin|linux|win)
knowns-(darwin|linux|win)
```

Expected: no active platform package or artifact identity remains with the old scope/prefix. Product name `knowns`, wrapper package references, repository names, and historical design documents are allowed.

### Task 5: Update active installation examples

**Files:**
- Modify: active documentation files returned by the scoped search, initially `docs/en/getting-started/installation.md` if it documents canonical release archive names.

- [ ] **Step 1: Replace canonical archive examples**

Where active instructions construct a platform release archive, change `knowns-${PLATFORM}.tar.gz` to `knowme-${PLATFORM}.tar.gz` and keep release URL structure and install directory unchanged.

- [ ] **Step 2: Check localized documentation for the same contract**

Search both `docs/en` and `docs/vi` for `knowns-${PLATFORM}`, `knowns-darwin`, `knowns-linux`, `knowns-win`, and `@knowns/`. Update only active platform artifact references; preserve product/package `knowns` references that refer to the wrapper or repository.

### Task 6: Verify generated package names and build behavior

**Files:**
- No new files.

- [ ] **Step 1: Run focused npm tests**

```bash
bun test npm/knowns/install.test.js npm/knowns/knowns-bin.test.js
```

Expected: pass.

- [ ] **Step 2: Validate all static manifests with a one-off Node script**

Run a script that loads each `npm/knowme-*/package.json`, asserts its `name` starts with `@knowme/`, asserts its directory suffix matches the package suffix, and asserts the platform-specific executable contract remains present. The script must exit non-zero on any mismatch and print each validated package.

- [ ] **Step 3: Exercise the local npm build target when toolchains permit**

Run:

```bash
make npm-build
```

Expected: the command creates `knowme` or `knowme.exe` only under `npm/knowme-*`. If cross-compilation prerequisites are unavailable on the host, record the exact toolchain failure and still verify the target command strings and generated package manifests through the focused checks.

- [ ] **Step 4: Validate release workflow references**

Run a scoped search over `.github/workflows/publish.yml`, `Makefile`, `npm`, and active install docs. Expected: new platform package scope/prefix only, with no old `@knowns/*` or `knowns-*` platform identity.

- [ ] **Step 5: Review the final diff and commit the implementation**

```bash
git diff --check
git add .gitignore Makefile .github/workflows/publish.yml npm docs/en docs/vi
git commit -m "fix: align npm platform package names with knowme"
```

Expected: one implementation commit containing only the platform package identity cutover and directly affected tests/docs.
