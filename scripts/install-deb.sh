#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 path/to/package.deb" >&2
  exit 2
fi

deb=$1

if [[ $OSTYPE != linux* ]]; then
  echo "This installer only supports Linux." >&2
  exit 1
fi

if [[ ! -f $deb || ! -r $deb ]]; then
  echo "File not found or unreadable: $deb" >&2
  exit 1
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
