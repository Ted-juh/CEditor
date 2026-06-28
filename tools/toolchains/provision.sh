#!/usr/bin/env bash
# provision.sh — one-shot provisioning of CEditor's export toolchains (C++/C#/Java/Python) on
# macOS/Linux. Finds Node.js on PATH (the same node CEditor uses to run the exporter) and runs
# provision.mjs, which downloads the bundled toolchains into tools/toolchains/<id>/ so a user can export
# every language with NO Visual Studio / .NET SDK / GraalVM pre-installed. Pass toolchain ids to
# provision a subset, e.g.  ./provision.sh dotnet llvm-mingw   (just the C# + C++ toolchains).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on PATH. Install Node.js, then re-run this script." >&2
  exit 1
fi
exec node "$DIR/provision.mjs" "$@"
