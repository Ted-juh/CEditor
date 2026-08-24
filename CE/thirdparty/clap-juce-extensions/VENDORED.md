# Vendored: clap-juce-extensions

Vendored copy (same philosophy as the JUCE/ install: the build must work offline),
git metadata stripped, `docs/`, `examples/`, `.github/`, and clap's `artwork/` removed.
Everything else is untouched upstream source.

| Project | Upstream | Pinned commit |
|---|---|---|
| clap-juce-extensions | https://github.com/free-audio/clap-juce-extensions | `54b3c3268ab6721a7afeef813c9e1ce43a3d0fcd` (2026-07-21) |
| clap (in `clap-libs/clap`) | https://github.com/free-audio/clap | `29ffcc273be7c7c651f6c9953b99e69700e2387a` |
| clap-helpers (in `clap-libs/clap-helpers`) | https://github.com/free-audio/clap-helpers | `a61bcdf0ecc2c8db1e80bfe8bf9cb7e8d9fd2bbc` |

All three are MIT licensed (LICENSE files kept in place).

To update: clone upstream with `--recurse-submodules`, strip the same directories,
replace this folder wholesale, and update the commit table above.
