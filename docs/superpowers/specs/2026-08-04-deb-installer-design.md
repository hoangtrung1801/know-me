# Local `.deb` Installer Design

## Goal

Provide a small Linux script for installing an existing local Debian package.

## Behavior

- Accept exactly one `.deb` path as an argument.
- Reject missing, unreadable, or non-`.deb` paths with a non-zero exit.
- Reject non-Linux systems and missing `apt-get` with a useful error.
- Install through `sudo apt-get install` using the local path, allowing APT to resolve dependencies.
- Do not download packages, build packages, detect architectures, or modify shell configuration.

## File and verification

Add `scripts/install-deb.sh` with strict shell settings and executable permissions. Verify its syntax with `bash -n` and exercise its validation paths without invoking package installation.
