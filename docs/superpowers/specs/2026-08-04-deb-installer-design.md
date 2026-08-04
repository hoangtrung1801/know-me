# Local `.deb` Installer Design

## Goal

Provide a small Linux script for installing an existing local Debian package
or the Linux ARM64 `knowns` archive.

## Behavior

- Accept exactly one package path as an argument.
- On Linux ARM64 (`arm64` or `aarch64`), accept
  `knowns-linux-arm64.tar.gz`, extract its `knowns` binary, and install it to
  `/usr/local/bin/knowns`.
- Accept a local `.deb` path on supported Linux systems and install it through
  APT.
- Reject missing, unreadable, or unsupported package paths with a non-zero exit.
- Reject non-Linux systems, and reject `.deb` files if `apt-get` is missing,
  with a useful error.
- Install `.deb` files through `sudo apt-get install`, allowing APT to resolve
  dependencies.
- Do not download packages, build packages, or modify shell configuration.

## File and verification

Update `scripts/install-deb.sh` with strict shell settings and executable
permissions. Verify its syntax and exercise the ARM64 archive branch without
modifying the system installation.
