# Bundled build toolchains — "done at install"

CEditor exports plugins by *compiling* on the user's machine. To make a freshly-installed CEditor able
to export **every** language with **zero** manual setup — no Visual Studio, no .NET SDK, no GraalVM —
it provisions small, redistributable toolchains here instead of requiring heavyweight system installs.

The key enabler: handler modules talk to the host only over a flat **C ABI** (`NativeHandlerAbi.h`), so
the compiler is free to choose — a self-contained Clang loads into an MSVC-built host fine.

## What gets provisioned (`manifest.json`)

| id | what | replaces | ships |
|---|---|---|---|
| `llvm-mingw` | self-contained Clang/LLD (no VS, no Windows SDK) — builds the C++ handler module and the C# host shim. **Not the JUCE plugin**: JUCE `#error`s on `__MINGW32__` (`juce_TargetPlatform.h:113`) and `WebView2LoaderStatic.lib` is MSVC-mangled, so neither the compile nor the link can work. See below. | — | download (~178 MB win) |
| `python-embed` | CPython embeddable runtime, bundled *into* the exported plugin | system Python | download (~11 MB) |
| `dotnet` | portable .NET SDK (Roslyn + publish) via Microsoft's `dotnet-install` — compiles C# handlers to managed IL + self-contained-publishes a CoreCLR | **.NET SDK / Visual Studio** | download (~230 MB) |
| `jdk` | Temurin JDK 21 — `javac` + `jlink` to ship a ~30–50 MB JRE inside the plugin (JNI) | **GraalVM** | download (~195 MB) |
| `ninja` | the generator for the bundled-Clang JUCE plugin build | — | download (~1 MB) |

### How each language ships (no runtime pre-installed on the END-USER's machine)

- **C++** → compiled to a tiny native module by bundled Clang. **C# / Java / Python** → the user's code
  is compiled to IL/bytecode (Roslyn / `javac`) or transpiled, and a *redistributable* runtime is
  bundled **into the plugin**: a self-contained **CoreCLR** for C# (MIT), a `jlink`'d **JRE** for Java
  (GPLv2+CE), the **CPython embeddable** for Python (PSF). No Visual Studio, no .NET SDK, no GraalVM on
  the end-user's box. (C# was pivoted off NativeAOT — that needs non-redistributable MSVC/WinSDK import
  libs on Windows; see `CE/src/Scripting/native-handlers-design.md` §C#.)

## Usage

```bash
node tools/toolchains/provision.mjs              # download all toolchains for this OS
node tools/toolchains/provision.mjs dotnet       # just one (e.g. the C# SDK)
node tools/toolchains/provision.mjs --force      # re-download
# or the launchers (find Node on PATH first — the same node CEditor uses to export):
tools\toolchains\provision.cmd dotnet llvm-mingw   (Windows)
./tools/toolchains/provision.sh dotnet llvm-mingw  (macOS/Linux)
```

The exporter resolves compilers via `resolveToolchain.mjs` — **bundled first, system as a fallback** —
so it never depends on a system Visual Studio / .NET SDK / GraalVM. CEditor runs the exporter (and can
run `provision.mjs`) with the user's Node.js from the source tree.

> **Installer status:** the GUI installer (`CEditor.iss`) currently stages only the editor; export runs
> from the source tree, so provisioning is a one-line `provision.cmd`/`provision.sh` there. Bundling the
> full `tools/` tree + a download-at-install step into the installer is a separate packaging task
> (tracked) — it must stage the exporter scripts + their `node_modules` too, not just download binaries.

Binaries are **gitignored** (never committed); only the manifest + scripts live here.


## llvm-mingw cannot build the plugin shell

Worth stating plainly, because three documents used to say it could and one code path still tried.

`export-panel-vst3.mjs` had a fallback that configured the whole JUCE plugin with
`llvm-mingw-win.cmake` when no Visual Studio was found, logging `[EXPERIMENTAL]`. It was never
validated, and it cannot be: it fails twice over, for reasons that are not fixable here.

1. **JUCE rejects the compiler.** `juce_TargetPlatform.h:113` is `#error "MinGW is not supported."`
   under `#ifdef __MINGW32__`, and clang targeting `x86_64-w64-mingw32` — the exact triple that
   toolchain file sets — defines `__MINGW32__`. Reproducible in one command:

   ```
   clang++ -target x86_64-w64-mingw32 -fsyntax-only \
     -I JUCE/include/JUCE-8.0.7/modules some_file_including_juce.cpp
   ```

2. **The link would fail even with the `#error` patched out.** `WebView2LoaderStatic.lib` is a
   Microsoft-built MSVC static library, and its C++ symbols carry MSVC mangling
   (`?HexEncode@internal@embedded_browser_webview@@YA_NPEBX_K_NPEAV...@Z`). A MinGW/Itanium-ABI
   link cannot resolve them.

The toolchain file's own header already conceded that Direct2D is unavailable and "the VST3 wrapper
needs a known link tweak". Both were understatements.

**What replaced it.** Not another compiler — no compiler. `CEDITOR_TEMPLATE_PLAYER` builds a
panel-agnostic player that reads its identity and its panel from the `.cepanel` beside it, so an
export is a file copy (`tools/scripts/export-panel-template.mjs`). llvm-mingw stays exactly where it
was always genuinely needed: the ~100-line C shims for the C++, C# and Java handler modules, which
contain no JUCE and no WebView2.
