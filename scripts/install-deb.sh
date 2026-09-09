#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 path/to/package.deb" >&2
  exit 2
fi

deb=$1

if [[ $(uname -s) != Linux ]]; then
  echo "This installer only supports Linux." >&2
  exit 1
fi

if [[ ! -f $deb || ! -r $deb ]]; then
  echo "File not found or unreadable: $deb" >&2
  exit 1
fi

if [[ $deb == */knowns-linux-arm64.tar.gz || $deb == knowns-linux-arm64.tar.gz ]]; then
  case $(uname -m) in
    aarch64|arm64) ;;
    *) echo "knowns-linux-arm64.tar.gz requires Linux ARM64." >&2; exit 1 ;;
  esac

  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  tar -xzf "$deb" -C "$tmp" knowme 2>/dev/null || tar -xzf "$deb" -C "$tmp" knownme
  bin_name="knowme"
  [[ -f $tmp/knowme ]] || bin_name="knownme"
  [[ -f $tmp/$bin_name ]] || { echo "Archive does not contain knowme." >&2; exit 1; }
  sudo install -m 0755 "$tmp/$bin_name" /usr/local/bin/knowme
  exit
fi

case $deb in
  *.deb|*.DEB) ;;
  *) echo "Expected a .deb file: $deb" >&2; exit 1 ;;
esac

command -v apt-get >/dev/null || {
  echo "apt-get is required to install Debian packages." >&2
  exit 1
}

sudo apt-get install -y "$deb"
