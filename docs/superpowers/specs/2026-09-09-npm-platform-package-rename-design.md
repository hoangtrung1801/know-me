# npm Platform Package Rename Design

## Goal

Align platform-specific npm package identities with the `knowme` CLI by renaming
staging directories and scoped package names from `knowns-*` / `@knowns/*` to
`knowme-*` / `@knowme/*`.

The public wrapper package remains `knowns` for distribution compatibility.
Platform binaries remain named `knowme` and `knowme.exe`.

## Scope

### Package identities

- Rename the six tracked platform directories under `npm/` to `knowme-*`.
- Change platform manifest names to `@knowme/<platform>-<arch>`.
- Change the wrapper package's optional dependencies to `@knowme/*`.
- Keep the wrapper package name, CLI aliases, executable filenames, OS/CPU
  metadata, and native-library behavior unchanged.

### Build and release flow

- Make `npm-build` write binaries to `npm/knowme-*` directories.
- Update cleanup patterns for the new directories.
- Update the release matrix, artifact staging, package preparation, validation,
  tarball creation, checksums, and release uploads to use `knowme-*` names.
- Generate only the new platform package and archive identities; do not emit
  `@knowns/*` or `knowns-*` platform aliases.

### Runtime resolution

- Map supported hosts to `@knowme/<platform>-<arch>` in the npm installer and
  launcher.
- Download `knowme-*` release assets in the GitHub fallback path.
- Preserve the existing binary-file fallback for `knownme` so previously staged
  executable files can still be discovered, but never generate that spelling.

## Non-goals

- Do not rename the public `knowns` wrapper package.
- Do not rename the `knowme` executable or Windows `.exe` suffix.
- Do not alter platform detection, architecture normalization, ONNX Runtime
  bundling, or installer behavior unrelated to package identity.
- Do not add compatibility publication aliases for the old platform package
  names.

## Data flow

1. The host platform and architecture are normalized by the npm installer.
2. The normalized pair produces a scoped package name under `@knowme` and a
   matching `knowme-*` release asset name.
3. npm resolves the wrapper's optional dependency, or the installer downloads
   the matching release archive into `node_modules/@knowme/...`.
4. The launcher locates `knowme` or `knowme.exe` in that package and executes it.
5. The release workflow builds, stages, validates, archives, and publishes the
   same identity at every boundary.

## Error handling

Unsupported platform/architecture handling remains unchanged. Missing platform
packages continue to report the normalized platform and the `@knowme/*`
install hint. Missing archives or checksum failures continue through the
existing npm-then-GitHub fallback and error aggregation.

## Verification

Focused verification will:

- run the npm installer and launcher tests;
- parse all six platform manifests and assert their new names and main files;
- search active build/release/npm surfaces for stale `@knowns/*` and
  `knowns-*` platform references;
- run `make npm-build` and verify only `npm/knowme-*` outputs are created when
  the local CGO cross-build prerequisites are available.
