# Vendored: SQLite

The amalgamation (`sqlite3.c`, `sqlite3.h`) is copied byte for byte from the official
`sqlite-autoconf-3520000.tar.gz` tarball, with no local patches. It is vendored for the same
reason as JUCE and clap-juce-extensions: the build must work offline. SQLite is in the public
domain (<https://sqlite.org/copyright.html>), so there is no licence file to keep.

| | |
| --- | --- |
| Version | 3.52.0 (`SQLITE_SOURCE_ID` 2026-03-06 16:01:44 557aeb43869d…dceab6) |
| Tarball | `sqlite-autoconf-3520000.tar.gz`, 3,258,980 bytes |
| Tarball SHA3-256 | `45a4911475950ab5fd486afb776102eb29d69e7569b48947f21e3c8501b51822` |
| `sqlite3.c` SHA3-256 | `316c7fd33bad77f7b71660d553053c06bb4e1e6f4929ad2701860ccf341a1a39` |
| `sqlite3.h` SHA3-256 | `f330daf7a6761e191dc891a7b24028923acbd0d252e65f2bf91d037d82795c04` |

sqlite.org publishes a SHA3-256 for each download, so the tarball hash above can be checked
against it.

**Where this copy came from.** sqlite.org was not reachable from the machine that vendored it.
The tarball was taken instead from the `sqlite3` package on npm (node-sqlite3 6.0.1,
`deps/sqlite-autoconf-3520000.tar.gz`), which redistributes the upstream tarball unchanged.
better-sqlite3 also carries a newer amalgamation (3.53.4), but with a local patch applied, so it
was not used: this copy is meant to be upstream exactly.

## Who uses it

Only Hostage's sound library (`CE/src/InstrumentHost/LibraryStore.cpp`), through the
`ce_sqlite` static library in the root `CMakeLists.txt`. The compile options there follow
sqlite.org's recommended set (<https://sqlite.org/compile.html#recommended_compile_time_options>)
and add `SQLITE_OMIT_LOAD_EXTENSION`: nothing loads extensions, and leaving it out would pull in
`dlopen` on Linux.

## To update

Download `sqlite-autoconf-<version>.tar.gz` from <https://sqlite.org/download.html>, check its
SHA3-256 against the one on that page, copy `sqlite3.c` and `sqlite3.h` over these, and update the
table above. Then run `CEditorLibraryPersistenceTests` and `CEditorInstrumentHostServiceTests`.
The library database's format is SQLite's file format, which is stable and backwards-compatible
across every 3.x release, so an update never needs a migration.
