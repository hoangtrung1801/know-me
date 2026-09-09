#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin" "$tmp/archive"
printf '#!/bin/sh\necho knowme\n' > "$tmp/archive/knowme"
chmod +x "$tmp/archive/knowme"
tar -czf "$tmp/knowme-linux-arm64.tar.gz" -C "$tmp/archive" knowme

printf '#!/usr/bin/env bash\ncase $1 in -s) echo Linux ;; -m) echo aarch64 ;; esac\n' > "$tmp/bin/uname"
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$@" > "$TEST_SUDO_ARGS"\ncp "$4" "$TEST_BINARY"\n' > "$tmp/bin/sudo"
chmod +x "$tmp/bin/uname" "$tmp/bin/sudo"

TEST_BINARY="$tmp/installed-knowme" TEST_SUDO_ARGS="$tmp/sudo-args" PATH="$tmp/bin:$PATH" \
  "$root/scripts/install-deb.sh" "$tmp/knowme-linux-arm64.tar.gz"

cmp "$tmp/archive/knowme" "$tmp/installed-knowme"
[[ $(sed -n '1p' "$tmp/sudo-args") == install ]]
[[ $(sed -n '2p' "$tmp/sudo-args") == -m ]]
[[ $(sed -n '3p' "$tmp/sudo-args") == 0755 ]]
[[ $(sed -n '5p' "$tmp/sudo-args") == /usr/local/bin/knowme ]]
