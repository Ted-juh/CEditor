#!/usr/bin/env bash
# Package the release targets from a native Ubuntu build.
set -euo pipefail
build=$(realpath "${1:?pass the CMake build directory}")
out=$(realpath -m "${2:?pass the package output directory}")
version=${3:-0.1.4~linuxpreview2}
arch=$(dpkg --print-architecture)
repo=$(cd "$(dirname "$0")/../.." && pwd)
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
root="$stage/package"
app="$root/usr/lib/hostage"
mkdir -p "$app/web-libs" "$root/usr/bin" "$root/usr/share/applications" "$root/DEBIAN" "$stage/debian" "$out"
install -m755 "$build/CEHostStandalone_artefacts/Release/HoSTage" "$build/CEditorPluginScanner" "$build/CEditorPluginWorker" "$app/"
python3 - "$repo/tools/installer/hostage-windows.json" "$app/hostage.json" <<'PY'
import json, sys
with open(sys.argv[1]) as src, open(sys.argv[2], 'w') as dest:
    product = json.load(src)
    json.dump({'role': 'editor', 'product': {'name': product['productName'], 'appId': product['appId']}}, dest)
PY
triplet=$(dpkg-architecture -qDEB_HOST_MULTIARCH)
for lib in libwebkit2gtk-4.1 libjavascriptcoregtk-4.1 libsoup-3.0 libglib-2.0 libgtk-3; do
    ln -s "/usr/lib/$triplet/$lib.so.0" "$app/web-libs/$lib.so"
done
cat > "$root/usr/bin/hostage" <<'LAUNCH'
#!/bin/sh
export LD_LIBRARY_PATH=/usr/lib/hostage/web-libs${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
exec /usr/lib/hostage/HoSTage "$@"
LAUNCH
chmod 755 "$root/usr/bin/hostage"
install -Dm644 "$repo/tools/installer/hostage.svg" "$root/usr/share/icons/hicolor/scalable/apps/hostage.svg"
cat > "$root/usr/share/applications/hostage.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=HoSTage
Exec=/usr/bin/hostage
Icon=hostage
StartupWMClass=HoSTage
Terminal=false
Categories=AudioVideo;Audio;
DESKTOP
cd "$stage"
printf 'Source: hostage\n\nPackage: hostage\nArchitecture: any\n' > debian/control
dependencies=$(dpkg-shlibdeps -O "$app/HoSTage" "$app/CEditorPluginScanner" "$app/CEditorPluginWorker")
cat > "$root/DEBIAN/control" <<CONTROL
Package: hostage
Version: $version
Architecture: $arch
Section: sound
Priority: optional
Maintainer: HoSTage project <noreply@github.com>
Depends: ${dependencies#shlibs:Depends=}, libwebkit2gtk-4.1-0, libgtk-3-0t64, libx11-6, libxext6, libxcursor1, libxinerama1, libxrandr2, libxss1, xwayland | xserver-xorg-core
Description: Standalone HoSTage rack with isolated Linux VST3 playback
 Includes the rack interface, native scanner and out-of-process plug-in worker.
CONTROL
dpkg-deb --root-owner-group --build "$root" "$out/hostage_${version}_${arch}.deb"
