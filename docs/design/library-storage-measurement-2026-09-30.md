# The sound library's storage, measured

*Measurement, 2026-09-30. Nothing changed yet.* The question: does Hostage's sound library, kept as
one JSON file (`CE/src/InstrumentHost/Library.cpp`), hold at the 12,000 presets it is designed for,
or does it need a database? SQLite was on the owner's list of candidates
([storage-validation-libraries-2026-09-30.md](storage-validation-libraries-2026-09-30.md)), and this
is the measurement that record asked for before deciding.

`CE/tests/LibraryBench.cpp` (target `CEditorLibraryBench`, not built by default) builds libraries
through the real code, every vendor record measured, with some favourites and tags, and times the
real operations. Release build, Linux container, 4 cores. A desktop will be faster, but not by the
factor that would change any conclusion below.

| Library | File | Load | Save | Favourite click | Audition | Text search | Facet counts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2,000 presets + 20 captured | 10.6 MB | 95 ms | 344 ms | 360 ms | 344 ms | 0.9 ms | 0.7 ms |
| 12,000 presets | 33.0 MB | 539 ms | 1,122 ms | 1,156 ms | 1,096 ms | 7 ms | 7 ms |
| 12,000 + 300 captured | 109.0 MB | 947 ms | 4,808 ms | 4,736 ms | 4,701 ms | 7 ms | 7 ms |
| 30,000 + 300 captured | 158.5 MB | 1,717 ms | 6,475 ms | 6,402 ms | 6,285 ms | 17 ms | 15 ms |

"Captured" means a sound saved from a plug-in: its state (48 KB, typical of a software synth)
plus three earlier versions of it, base64 in the JSON. A favourite click in memory costs 0.06 ms.
Everything else in those columns is the save.

## What the numbers say

**Browsing is fine; saving is not.** Search and facet counts run over the records in memory and
stay under 20 ms even at 30,000. A database would not make them noticeably faster, so they are not
a reason to change.

**Every click rewrites the whole library, on the UI thread.** `setUserMetadata` (favourite,
rating, tags) and `noteRecordUsed` (every load and every audition) each end in `saveLibrary()`.
Host commands run on the message thread (`ValueTreeBridgeHandlers.cpp`, the `instrumentHost`
listener), so the whole Hostage window freezes for the save. That is 1.1 s per click at 12,000
presets and 4.7 s with a modest set of captures. Auditioning through a category is one freeze
per sound.

**A save costs a full read as well as a full write.** Before writing, `saveTo` re-reads the file
and compares it with a copy of the last save, which is kept in memory for this purpose. At 109 MB
that is a second 109 MB resident for the life of the process.

**Two instances lose one instance's work, and fill the disk.** Running the standalone Hostage
and the plug-in in a DAW on one library is a normal setup. Once one instance saves, every later
save from the other is refused, because the file changed. The instance is never told to reload, so
this lasts the rest of its session. Each refusal also writes a complete conflict copy of the
library. Measured: three favourite clicks in the second instance were all refused and left three
conflict files, 99 MB in total. Its favourites, ratings and play counts never reach the library,
and an afternoon of auditioning in it writes gigabytes.

**Why a vendor record is 2.7 KB.** Half of it is the measured profile's 48-point envelope,
written at 15 significant digits, one number per line. Indentation is a third of the whole file.
Compact output and rounded floats would shrink the file about threefold, but every click would
still rewrite all of it.

## What each fix would buy

**Keep the JSON, and repair around it.** Save in the background, a moment after the last change,
so clicks coalesce and the UI never waits. Write compact JSON with rounded floats. Move captured
states out into their own content-addressed files, so the index stays small. Replace the whole-file
comparison with the file's size and modification time. Reload and merge when another instance has
saved, instead of refusing and copying. The UI freeze goes away. What remains is a full-file
rewrite in the background on every change. The multi-instance case becomes a hand-written merge
of two libraries, and it would have to be right about every field.

**SQLite** (public domain, one C file, compiled in):

- A click is one row update: under a millisecond, durable, and it does not freeze anything.
- Two instances write the same database safely (WAL mode). A favourite in one and a rating in the
  other both land. The file lock, the stale check and the conflict copies all go away.
- Captured states are stored as binary rows, a quarter smaller than base64, and written only when a
  sound is captured.
- Browsing stays as it is: load the records into memory at start, and search there.
- Cost: one new source dependency and a build of it. The persistence half of `Library.cpp` is
  rewritten. `LibraryPersistenceTests` is re-pointed, because several of its rules (never write
  over an unreadable index, never lose a conflicting change) stay rules, with a different
  mechanism. There is also a one-time migration: the existing `library.json` is read into the
  database and kept beside it, untouched, as the backup.

## Recommendation

SQLite, for the host's library only. Panels stay JSON, and the editor's own storage stays in
IndexedDB. The size problem alone could be patched. The two-instance problem is data loss that
already happens in a normal setup, and SQLite's transactions are its tested answer, where a
hand-written merge of two JSON libraries would be a new thing to get right.
