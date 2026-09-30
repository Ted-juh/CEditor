# The sound library's storage, measured

*Measurement, 2026-09-30; built the same day, see [What was built](#what-was-built).* The question: does Hostage's sound library, kept as
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

## What was built

The library now lives in `library.db`, a SQLite database, through `LibraryStore`
(`CE/src/InstrumentHost/LibraryStore.h`, which carries the full rules). SQLite 3.52.0 is vendored
under `CE/thirdparty/sqlite`, unpatched. Panels and the editor's storage are unchanged.

**Measured the same way** (`CEditorLibraryBench`, now pointed at the store; same machine, same
libraries). The "before" numbers are the table at the top.

| Library | On disk, before → after | Load → open | Favourite click | Audition | Capture a sound |
| --- | --- | --- | --- | --- | --- |
| 2,000 + 20 captured | 10.6 → 5.3 MB | 95 → 12 ms | 360 → 0.05 ms | 344 → 0.02 ms | 1.3 ms |
| 12,000 | 33.0 → 8.7 MB | 539 → 50 ms | 1,156 → 0.32 ms | 1,096 → 0.07 ms | 1.7 ms |
| 12,000 + 300 captured | 109.0 → 65.6 MB | 947 → 187 ms | 4,736 → 0.45 ms | 4,701 → 0.05 ms | 1.7 ms |
| 30,000 + 300 captured | 158.5 → 78.6 MB | 1,717 → 269 ms | 6,402 → 1.4 ms | 6,285 → 0.23 ms | 2.2 ms |

Searching is unchanged, as intended: it still runs over the records in memory. A check for
another instance's changes, when there are none, costs a microsecond. The one-time import of an
old `library.json` takes 0.5 s at 12,000 presets and 2.3 s with 300 captured sounds.

**Two instances.** The same scenario as above: A rates a sound, then B, which has not seen that,
favourites the same sound and three others. Before, all of B's clicks were refused and 99 MB of
conflict copies were written. Now all four land, the shared sound keeps both A's rating and B's
favourite, nothing is copied, and A reads B's changes in 14 ms at 12,000 presets.

### How it works

- **Library keeps a journal.** Every mutator notes what it changed, by field group, in
  `LibraryChanges`: a star is `rating`, a rescan that edited one file is that record's `identity`,
  an audition is a count delta. `find` became read-only and `edit (id, fields)` is the one way to
  change a record in place, so the compiler found every site that had changed a record behind the
  journal's back. There were two: saving a version and storing a measurement.
- **The store writes the journal**, one transaction per save, each field group an `UPDATE` of its
  columns. The partial updates, the whole-row upsert and the read are all generated from one column
  table, so no field can be written and not read. Processor state is stored as bytes.
- **Two processes merge by field.** Usage counts are added (`load_count = load_count + ?`), not
  written, so two auditions in two processes make two. A record removed in one process and
  favourited in the other comes back, because the favourite is the newer word. A record removed
  in one and only auditioned in the other stays removed.
- **Everyone sees everyone's changes.** Each write bumps a revision and stamps its rows; removals
  leave tombstones. Once a second, the service's pump asks SQLite whether another connection has
  committed (`PRAGMA data_version`, no I/O). If one has, it reads the newer rows and refreshes the
  browser. Commands only write and never read. Reading can move records in memory, and a command
  may be holding a pointer to one.
- **A busy database delays, it does not drop.** If another process holds the write lock past the
  timeout, the journal goes back into the library and the next save or tick writes it. A captured
  sound is the exception: it is confirmed only once it is on disk, and otherwise taken back and
  reported, as before.

### The old rules, kept

- **Unreadable is never written over.** A damaged database is moved aside with its write-ahead
  log, and a damaged `library.json` is moved aside before anything is imported. The store checks
  the SQLite header itself before opening the file. Given a file that is not a database, SQLite
  deletes the `-wal` beside it as stale, and that log may hold the last changes. The old
  `library.json` is not imported over a damaged database, because it is older than the database
  that was set aside.
- **A newer format is left alone.** The layout has a version (`PRAGMA user_version`, now 1) and an
  application id. A database from a newer CEditor is not opened, and nothing is written to it.
- **The old file is the backup.** `library.json` is imported once, when there is no database yet,
  and is then left exactly as it was. It is not read again, so changes an older CEditor makes to
  it afterwards do not arrive.

### Bugs fixed along the way

- Every favourite, rating, tag, load and audition froze the Hostage window while the whole library
  was rewritten: 1.1 s per click at 12,000 presets, 4.7 s with captured sounds.
- Every save re-read the whole file to check it was not stale, and kept a second full copy of the
  library in memory to compare it against.
- A second instance's saves were refused for the rest of its session once the first had saved,
  and each refusal wrote a complete copy of the library to disk.
- A running instance never saw another instance's changes.
- Usage counts from two instances overwrote each other.
- A rescan of an unchanged folder rewrote every record it found. It now writes only what moved.
- The JSON form, now only the import source and export format, is written compact, with floats
  to seven places, instead of pretty-printed with fifteen-digit tails.

Two defects in this migration were caught before commit, and both have tests.
`removeRecord (record->recordId)` read the id after destroying the record it belonged to
(AddressSanitizer). And new records were given their place in the library in UUID order,
because the journal is sorted by id.

### Not done

The state blobs are still held in memory as base64 for every captured sound and version, as
before. Loading them on demand would cut resident memory by roughly the size of the captures
(about 60 MB at 300). It is the natural next step, and it would change every reader of
`stateBlobBase64`.
