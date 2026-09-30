#pragma once

#include "Library.h"

#include <memory>

// LibraryStore — Hostage's sound library on disk: one SQLite database, written a row at a time.
//
// WHY A DATABASE. The library used to be one JSON file, rewritten whole after every change, on
// the message thread. At the 12,000 presets it is designed for that was a second per favourite
// click and nearly five with a few hundred captured sounds; every audition froze the window for
// as long. Two CEditor processes on one library (the standalone and the plug-in in a DAW, a normal
// setup) were worse: after the first save, every save from the other was refused, forever, and
// each refusal wrote a complete copy of the library beside it. docs/design/
// library-storage-measurement-2026-09-30.md has the measurements.
//
// WHAT THIS DOES INSTEAD.
//
//   - A change is a row update. `write` takes the Library's journal (LibraryChanges) and writes
//     exactly the fields it names, in one transaction. A favourite is one UPDATE of one column.
//     `sync` does the same and then reads back whatever any other process has written.
//
//   - Several processes share the database safely. SQLite in WAL mode lets them read while one
//     writes. Changes merge at the level of a field: a rating here and a favourite there both
//     land, and usage counts are added (`load_count = load_count + 1`) rather than overwritten.
//     When two processes change the SAME field of the same record, the later write wins, which is
//     what the person who made it expects to see.
//
//   - Nothing is refused and nothing is copied. A database busy in another process makes `sync`
//     answer `busy`; the journal goes back into the Library and is written by the next sync.
//
//   - Every process sees the others' changes. Each write bumps a revision number stored in the
//     database and stamps the rows it touched with it; a removal leaves a tombstone. `sync`
//     reads the rows and tombstones newer than the revision this process last saw, and
//     `othersHaveWritten` says, for the cost of reading a counter, whether there is anything to read.
//
// THE RULES THE JSON INDEX KEPT STILL HOLD, with a different mechanism behind each.
//
//   - A library that could not be read is never written over. A damaged database (or a damaged
//     library.json being imported) is moved aside, whole, under a new name, and only then is a new
//     one started. If it cannot be moved, nothing is opened and nothing will be written.
//   - A database written by a newer CEditor is left exactly as it is, and nothing is written to it.
//   - A change is never lost to a conflict: see "Nothing is refused" above.
//
// THE OLD FILE. When there is no database yet but there is a library.json, it is imported into a
// new database and then left exactly where it was, untouched, as the backup. It is never read
// again once the database exists, so changes an older CEditor makes to it later do not arrive.
//
// Used from one thread, the one that owns the Library (the service's message thread).

namespace ceditor::host
{

class LibraryStore
{
public:
    /** `busyTimeoutMs` is how long a write waits for another process's write to finish before
        `sync` answers `busy`. Writes take milliseconds, so the default is generous. */
    explicit LibraryStore (int busyTimeoutMs = 1000);
    ~LibraryStore();

    LibraryStore (const LibraryStore&) = delete;
    LibraryStore& operator= (const LibraryStore&) = delete;

    /** The version of the database layout this build reads and writes (`PRAGMA user_version`). */
    static constexpr int schemaVersion = 1;

    enum class OpenResult
    {
        opened,       // an existing database was read
        created,      // there was no library at all: a new, empty database
        imported,     // there was no database, but there was a library.json: it was read into a new
                      // database and left where it was
        unreadable,   // what was there could not be read and has been moved to `quarantined`; a new,
                      // empty library was started. If `quarantined` is empty it could not be moved,
                      // nothing was opened, and nothing will be written.
        newerFormat,  // a newer CEditor wrote it: left untouched, nothing opened
        failed        // it could not be opened (busy, permissions, a disk error): left untouched,
                      // nothing opened
    };

    struct OpenReport
    {
        OpenResult result = OpenResult::failed;
        juce::File quarantined;   // where an unreadable library was moved, when it was
        int importedRecords = 0;  // for `imported`
        juce::String error;       // SQLite's own words, for a log or a support bundle
    };

    /** Opens the library at `databaseFile`, creating it (from `legacyJsonFile` when that exists)
        if there is none, and reads all of it into `into`, replacing what `into` held. `into`'s
        journal is empty afterwards, because what it holds is what is stored. */
    OpenReport open (const juce::File& databaseFile, const juce::File& legacyJsonFile, Library& into);

    void close();
    bool isOpen() const;
    juce::File file() const;

    enum class SyncResult
    {
        synced,   // the journal was written (if there was one) and other processes' changes read
        busy,     // another process held the database for longer than the busy timeout; the
                  // journal is back in the Library for the next sync
        failed,   // SQLite reported an error; the journal is back in the Library
        closed    // no database is open (see OpenResult); the journal stays in the Library
    };

    struct SyncReport
    {
        SyncResult result = SyncResult::closed;
        int written = 0;          // records and collections this sync wrote or removed
        int changedByOthers = 0;  // records and collections another process changed, now in memory
                                  // (`sync` only)
        juce::String error;

        bool ok() const { return result == SyncResult::synced; }
    };

    /** Writes the Library's journal and does nothing else. The records in memory are not touched,
        so a pointer into the Library held across it stays valid — which is why this, and not
        `sync`, is what a command calls after changing something. Free when the journal is empty. */
    SyncReport write (Library& library);

    /** `write`, then reads everything any other process wrote since this one last read. That can
        add, replace and remove records in memory, so NO POINTER INTO THE LIBRARY may be held
        across it: call it from the top of a loop, never from inside a command. Cheap when there is
        nothing to do: with an empty journal and no writes from elsewhere it starts no transaction. */
    SyncReport sync (Library& library);

    /** Whether another process has written since this one last read — one counter, no I/O worth
        the name. What a periodic check calls before deciding a sync is worth running. */
    bool othersHaveWritten();

private:
    SyncReport run (Library& library, bool readOthers);

    struct Impl;
    std::unique_ptr<Impl> impl;
};

} // namespace ceditor::host
