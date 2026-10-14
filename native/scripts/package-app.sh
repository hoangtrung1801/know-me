#!/bin/bash
set -euo pipefail
native_root="$(cd "$(dirname "$0")/.." && pwd)"
configuration="${CONFIGURATION:-debug}"
if [[ "$configuration" != debug && "$configuration" != release ]]; then
  echo 'CONFIGURATION must be debug or release' >&2
  exit 2
fi
swift build --package-path "$native_root" -c "$configuration"
binary_directory="$(swift build --package-path "$native_root" -c "$configuration" --show-bin-path)"
app="$native_root/dist/KnowMe.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$binary_directory/KnowMeApp" "$app/Contents/MacOS/KnowMeApp"
if [[ $# -gt 0 ]]; then
  if [[ ! -x "$1" ]]; then echo 'Helper argument must be an executable KnowMe CLI' >&2; exit 2; fi
  cp "$1" "$app/Contents/Resources/knowme"
else
  # Repackaging without a helper must not retain a stale helper from an older build.
  rm -f "$app/Contents/Resources/knowme"
fi
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>KnowMe</string>
<key>CFBundleDisplayName</key><string>KnowMe</string>
<key>CFBundleIdentifier</key><string>app.knowme.macos</string>
<key>CFBundleExecutable</key><string>KnowMeApp</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
plutil -lint "$app/Contents/Info.plist"
# Local development signature only. No signing identities or distribution credentials are used.
codesign --force --deep --sign - "$app"
echo "$app"
