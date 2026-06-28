# Bundled build toolchains — "done at install"

CEditor exports plugins by *compiling* on the user's machine. To make a freshly-installed CEditor able
to export **every** language with **zero** manual setup — no Visual Studio, no .NET SDK, no GraalVM —
it provisions small, redistributable toolchains here instead of requiring heavyweight system installs.

The key enabler: handler modules talk to the host only over a flat **C ABI** (`NativeHandlerAbi.h`), so
the compiler is free to choose — a self-contained Clang loads into an MSVC-built host fine.

## What gets provisioned (`manifest.json`)

| id | what | replaces | ships |
|---|---|---|---|
| `llvm-mingw` | self-contained Clang/LLD (no VS, no Windows SDK) — builds the JUCE plugin, the C++ handler module, and provides `lld-link` for C# | **Visual Studio** | bundled (~178 MB win) |
| `python-embed` | CPython embeddable runtime, bundled *into* the exported plugin | system Python | bundled (~11 MB) |
| `jdk` | Temurin JDK 21 — `javac` + `jlink` to ship a ~30–50 MB JRE inside the plugin (JNI) | **GraalVM** | bundled (~195 MB) |
| C# slim packs | NativeAOT ILCompiler + runtime pack (~40 MB), restored at first export, linked with `llvm-mingw`'s `lld-link` | **.NET SDK** (1–2 GB) | first-use |

## Usage

```bash
node tools/toolchains/provision.mjs            # download all toolchains for this OS
node tools/toolchains/provision.mjs llvm-mingw # just one
node tools/toolchains/provision.mjs --force    # re-download
```

The installer (`tools/installer/CEditor.iss`) bundles these dirs or runs `provision.mjs` so the user is
done at install. The exporter resolves compilers via `resolveToolchain.mjs` — bundled first, system as
a fallback — so it never depends on a system Visual Studio / SDK.

Binaries are **gitignored** (never committed); only the manifest + scripts live here.
