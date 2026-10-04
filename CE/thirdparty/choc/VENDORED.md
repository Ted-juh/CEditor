# Vendored: choc (three headers)

Three headers from Tracktion's [choc](https://github.com/Tracktion/choc), ISC licence
(`LICENSE.md` beside this file), for one use: the player plug-in's script-MIDI output queue,
`CE/src/Player/ScriptMidiOutQueue.h`. Header-only; the root `CMakeLists.txt` exposes them as the
`ce_choc` interface target. Vendored rather than fetched for the same reason as JUCE and SQLite: the
build works offline.

| | |
| --- | --- |
| Upstream | `https://github.com/Tracktion/choc`, `VERSION.txt` 1.0.1 |
| Commit | `9606a6615b592605993d92733cdfd6ca6ecbd825` (2026-08-16) |
| `choc/threading/choc_SpinLock.h` SHA-256 | `cd1bd0e1599dbc3949d4752dc2ee2a13c4c4ba82728c24f3b3d7bbba86a8f525`, unmodified |
| `choc/platform/choc_Assert.h` SHA-256 | `3d26633e425cd35f74f740bcbae146a75078d8ffa71b94cc5157078d737fb01e`, unmodified |
| `choc/containers/choc_VariableSizeFIFO.h` SHA-256, upstream | `6fb4d3ad3ef1be0a6ddd6ed92f9594a87c43926acb74afd645319ab99fd4d8ce` |
| `choc/containers/choc_VariableSizeFIFO.h` SHA-256, as patched here | `577d4f0cbc31176cd8f3967ebe61da2d277d939a13e631a3410a19ea9022e683` |

## Local patches

All three are in `choc_VariableSizeFIFO.h` and each is marked `CEditor patch N` in the file. The
first two were found by stress-testing the FIFO under AddressSanitizer before using it
(`docs/design/checkers-run-2026-10-02.md`); both are still in upstream at the commit above.

1. **A full FIFO could read as empty.** `push` accepted an item ending exactly at `capacity`,
   which wraps the write position to 0. With the read position also at 0, the two are equal, which
   is how the FIFO says "empty": every queued item was lost, then overwritten. `>` became `>=`, so
   such an item wraps to the start instead, or is refused when there is no room there.
   `ScriptMidiOutQueueTests` "four messages that fill the queue to the byte" fails without it.
2. **A write past the end of the buffer.** When an item does not fit at the end, `push` writes a
   4-byte "skip to the start" header at the write position, which can be within 4 bytes of the end.
   The buffer had one spare byte. It now has a whole header's worth. AddressSanitizer reported the
   overrun on the first random stress run; in a plain build it lands in allocator slack and nothing
   shows.
3. **A missing include.** The header uses `std::memcpy` and `std::memset` without `<cstring>`,
   and compiles only where something else included it first.

## To update

Copy the three headers and `LICENSE.md` from a new commit, check whether upstream has fixed 1 and 2,
re-apply what it has not, and update the table. Then run `CEditorScriptMidiOutTests` in a plain
build and under AddressSanitizer and ThreadSanitizer, and `tools/rtsan/run.sh sysex`, which
should report nothing.
