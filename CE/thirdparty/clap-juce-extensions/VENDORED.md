# Vendored: clap-juce-extensions

Vendored copy (same philosophy as the JUCE/ install: the build must work offline),
git metadata stripped, `docs/`, `examples/`, `.github/`, and clap's `artwork/` removed.
Everything else is upstream source, except the local patches listed below.

| Project | Upstream | Pinned commit |
|---|---|---|
| clap-juce-extensions | https://github.com/free-audio/clap-juce-extensions | `54b3c3268ab6721a7afeef813c9e1ce43a3d0fcd` (2026-07-21) |
| clap (in `clap-libs/clap`) | https://github.com/free-audio/clap | `29ffcc273be7c7c651f6c9953b99e69700e2387a` |
| clap-helpers (in `clap-libs/clap-helpers`) | https://github.com/free-audio/clap-helpers | `a61bcdf0ecc2c8db1e80bfe8bf9cb7e8d9fd2bbc` |

All three are MIT licensed (LICENSE files kept in place).

To update: clone upstream with `--recurse-submodules`, strip the same directories,
replace this folder wholesale, and update the commit table above.

## Local patches

Each is marked `CEditor patch (VENDORED.md)` in the source. Re-apply them after an update, or drop
one once upstream has the same fix; `clap-validator` (tools/scripts/validate-plugins.mjs) fails
without them.

- `src/wrapper/clap-juce-wrapper.cpp`, `paramsTextToValue`: the host's text is decoded as UTF-8
  (`juce::String::fromUTF8`). The implicit `juce::String(const char*)` reads it as ASCII, so a
  choice label with any non-ASCII character in it — the GAIA's `Up · keep low+high` — matched no
  choice and converted to the first one. clap-validator's `param-conversions` test found it.
- `src/wrapper/clap-juce-wrapper.cpp`, `paramsValueToText`: written with `copyToUTF8`, which
  NUL-terminates and stops at a whole character. `strncpy` did neither for text that fills the
  host's buffer.
