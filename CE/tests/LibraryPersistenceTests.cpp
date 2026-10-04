// Library persistence — the rules that keep somebody's library from being lost, and the store
// that now carries them.
//
// THE FIRST RULE has no error message and no user action behind it: the library fails to load (a
// truncated file, a damaged database, a half-finished save from last time), comes up empty because
// that is what failing to read produces, and the first favourite afterwards saves that emptiness
// over the original. Every rating, note, tag, collection and user preset is then gone, and the
// only evidence is a library that is suddenly small. So what could not be read is moved aside,
// whole, and only then is anything new started.
//
// THE SECOND is that a change is never lost to another CEditor process. The JSON index answered
// that by refusing a stale save and writing a copy of the whole library beside it — and went on
// refusing for the rest of the session. The store answers it by merging at the level of a field,
// adding usage counts rather than overwriting them, and keeping a journal it could not write
// until it can.
//
// The first half of this file is the JSON form (still the import source and the export format);
// the second is LibraryStore.

#include "InstrumentHost/Library.h"
#include "InstrumentHost/LibraryStore.h"
#include "AtomicFileWrite.h"

#include <sqlite3.h>

#include <iostream>

using namespace ceditor::host;

namespace
{
int failures = 0;

void check (bool condition, const char* message)
{
    if (! condition) { ++failures; std::cerr << "FAIL " << message << '\n'; }
}

juce::File makeTempDir (const juce::String& name)
{
    auto dir = juce::File::getSpecialLocation (juce::File::tempDirectory)
                   .getChildFile ("ceditor-library-persistence-tests")
                   .getChildFile (name);
    dir.deleteRecursively();
    dir.createDirectory();
    return dir;
}

/** A library with one record whose curation is worth losing sleep over. */
Library curatedLibrary()
{
    Library library;
    LibraryRecord record;
    record.name = "Warm Pad";
    record.type = "preset";
    record.targetCeId = "test-synth";
    record.user.favourite = true;
    record.user.rating = 5;
    record.user.notes = "the one from the session";
    library.addCapturedRecord (std::move (record));
    return library;
}

void testRoundTripAndFirstRun()
{
    std::cout << "\nround trip and first run" << std::endl;

    const auto dir = makeTempDir ("roundtrip");
    const auto file = dir.getChildFile ("library.json");

    check (curatedLibrary().saveTo (file), "saveTo writes the index");

    Library loaded;
    check (loaded.loadFrom (file) == Library::LoadResult::loaded, "a good index loads as loaded");
    check (! loaded.savesBlocked(), "a good load leaves saving enabled");
    check (loaded.allRecords().size() == 1 && loaded.allRecords()[0].user.favourite
             && loaded.allRecords()[0].user.rating == 5,
           "records and their curation survive the trip");

    // A first run has no index, and an empty library IS the truth there — the one case where
    // coming up empty must not block anything.
    Library fresh;
    check (fresh.loadFrom (dir.getChildFile ("not-here.json")) == Library::LoadResult::absent,
           "a missing index is absent, not unreadable");
    check (! fresh.savesBlocked() && fresh.saveTo (dir.getChildFile ("not-here.json")),
           "a first run can save its new index");

    // The write leaves nothing behind it: a stray temporary in the data directory is the kind
    // of litter that later looks like a second library.
    juce::Array<juce::File> left;
    dir.findChildFiles (left, juce::File::findFilesAndDirectories, false);
    check (left.size() == 2, "a successful save leaves no temporary files behind");

    dir.deleteRecursively();
}

void testUnreadableIndexIsNeverOverwritten()
{
    std::cout << "\nan unreadable index is never overwritten" << std::endl;

    const char* const cases[] = {
        "{ \"records\": [ { \"name\": \"Warm Pad\"",   // truncated mid-save
        "",                                             // what a locked/unreadable file reads as
        "[1, 2, 3]",                                    // parses, but is not this format
        "not json at all",
    };

    for (const auto* content : cases)
    {
        const auto dir = makeTempDir ("unreadable");
        const auto file = dir.getChildFile ("library.json");
        file.replaceWithText (content);
        const auto before = file.loadFileAsString();

        Library library;
        check (library.loadFrom (file) == Library::LoadResult::unreadable,
               "a file that cannot be read reports unreadable");
        check (library.allRecords().isEmpty(), "nothing is half-loaded out of it");
        check (library.savesBlocked(), "and saving is blocked");

        // The whole point: the emptiness produced by failing to read must not reach the disk.
        library.addCapturedRecord ({});
        check (! library.saveTo (file), "saveTo refuses while the block stands");
        check (file.loadFileAsString() == before, "the original bytes are untouched");

        dir.deleteRecursively();
    }
}

void testQuarantineThenStartFresh()
{
    std::cout << "\nquarantine, then start fresh" << std::endl;

    const auto dir = makeTempDir ("quarantine");
    const auto file = dir.getChildFile ("library.json");
    file.replaceWithText ("{ truncated");

    Library library;
    check (library.loadFrom (file) == Library::LoadResult::unreadable, "the index is unreadable");

    const auto parked = quarantineUnreadableLibrary (file);
    check (parked != juce::File() && parked.existsAsFile(), "the bad index is moved aside");
    check (parked.loadFileAsString() == "{ truncated", "its bytes are kept, not tidied away");
    check (! file.existsAsFile(), "and it no longer sits where the index goes");

    // Only once the original is safe is a new index allowed to be written.
    library.allowSaves();
    check (library.saveTo (file), "a fresh index can be saved in its place");

    Library reloaded;
    check (reloaded.loadFrom (file) == Library::LoadResult::loaded, "and reads back cleanly");

    // A second bad start must not overwrite the evidence from the first.
    file.replaceWithText ("{ truncated again");
    const auto parkedAgain = quarantineUnreadableLibrary (file);
    check (parkedAgain != juce::File() && parkedAgain != parked,
           "a second quarantine picks a new name");
    check (parked.loadFileAsString() == "{ truncated",
           "the first quarantined copy is still intact");

    check (quarantineUnreadableLibrary (dir.getChildFile ("never-existed.json")) == juce::File(),
           "quarantining a file that is not there is a no-op");

    dir.deleteRecursively();
}

void testWriteFailureLeavesTheGoodFileAlone()
{
    std::cout << "\na failed write leaves the good file alone" << std::endl;

    const auto dir = makeTempDir ("writefail");

    // A directory standing where the file should be is the portable way to make the rename
    // fail at the last step, after the bytes have been written to the temporary. The point is
    // what the caller is told: false, and nothing of ours left behind.
    const auto blocked = dir.getChildFile ("library.json");
    blocked.createDirectory();
    blocked.getChildFile ("occupant.txt").replaceWithText ("still here");

    check (! ceditor::writeTextAtomically (blocked, "{}"), "an impossible write reports false");
    check (blocked.getChildFile ("occupant.txt").loadFileAsString() == "still here",
           "and what was there is untouched");

    juce::Array<juce::File> left;
    dir.findChildFiles (left, juce::File::findFiles, true);
    check (left.size() == 1, "a failed write leaves no temporary file behind");

    // And the value the old code could not give: a write that succeeds says so, with the
    // whole document on disk rather than however much of it fitted.
    const auto good = dir.getChildFile ("good.json");
    const juce::String text ("{ \"records\": [] }");
    check (ceditor::writeTextAtomically (good, text), "a possible write reports true");
    check (good.loadFileAsString() == text, "and the whole document lands");

    dir.deleteRecursively();
}

// -- LibraryStore ---------------------------------------------------------------------------------

juce::String asJson (const Library& library)
{
    return juce::JSON::toString (library.toVar(), true);
}

/** SQL run from outside, as another program (or a damaged disk) would. */
bool execSql (const juce::File& database, const char* sql)
{
    sqlite3* handle = nullptr;
    const auto opened = sqlite3_open_v2 (database.getFullPathName().toRawUTF8(), &handle,
                                         SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nullptr) == SQLITE_OK;
    const auto ok = opened && sqlite3_exec (handle, sql, nullptr, nullptr, nullptr) == SQLITE_OK;
    sqlite3_close_v2 (handle);
    return ok;
}

juce::String querySql (const juce::File& database, const char* sql)
{
    sqlite3* handle = nullptr;
    juce::String result;
    if (sqlite3_open_v2 (database.getFullPathName().toRawUTF8(), &handle, SQLITE_OPEN_READONLY, nullptr) == SQLITE_OK)
    {
        sqlite3_stmt* statement = nullptr;
        if (sqlite3_prepare_v2 (handle, sql, -1, &statement, nullptr) == SQLITE_OK
            && sqlite3_step (statement) == SQLITE_ROW)
            if (const auto* text = sqlite3_column_text (statement, 0))
                result = juce::String::fromUTF8 ((const char*) text);
        sqlite3_finalize (statement);
    }
    sqlite3_close_v2 (handle);
    return result;
}

juce::MemoryBlock bytesOf (const juce::File& file)
{
    juce::MemoryBlock block;
    file.loadFileAsData (block);
    return block;
}

/** A record with every field set to something that is not its default, and some of the text
    outside ASCII — the round trip has to prove the column table has no gaps. */
LibraryRecord everyField()
{
    LibraryRecord r;
    r.type = "rack";
    r.sourceType = "rackCapture";
    r.sourceLocator = juce::CharPointer_UTF8 ("C:/Users/someone/Presets/\xc3\x9cmlaut \xc2\xb7 pad.vstpreset");
    r.name = juce::CharPointer_UTF8 ("Glass Pad \xc2\xb7 warm");
    r.manufacturer = "Maker";
    r.instrument = "Synth";
    r.targetCeId = "vst3:abc";
    r.category = "Pad";
    r.rackManifestJson = "{\"parts\":[{\"partId\":\"p1\"}]}";
    r.classIdHex = "ABCDEF0123456789ABCDEF0123456789";
    r.fingerprint = "fp-1";
    r.addedAtMs = 1700000000123;
    r.loadCount = 7;
    r.lastLoadedAtMs = 1700000000999;
    r.auditionCount = 3;

    auto& s = r.sonic;
    s.measured = true;
    s.brightness = 0.25f;   s.centroidHz = 1234.5f;
    s.attack = 0.125f;      s.attackSeconds = 0.0625f;
    s.tail = 0.75f;         s.tailSeconds = 3.5f;
    s.width = 0.3f;         s.noisiness = 0.4f;     s.dynamics = 0.6f;
    s.peak = 0.9f;          s.cost = 0.05f;         s.costPercent = 1.25f;
    s.latencySamples = 64;
    for (int i = 0; i < sonicEnvelopePoints; ++i)
        s.envelope.add ((float) i / (float) (sonicEnvelopePoints - 1));
    r.sonicFingerprint = "fp-0";
    r.sonicRefusal = "The plug-in crashed while playing it";

    juce::MemoryBlock state;
    for (int i = 0; i < 256; ++i)
        state.append (&i, 1);
    r.stateBlobBase64 = juce::Base64::toBase64 (state.getData(), state.getSize());

    LibraryVersion first;
    first.versionId = "v1";
    first.label = "the first one";
    first.savedAtMs = 1;
    first.stateBlobBase64 = r.stateBlobBase64;
    first.origin = true;
    LibraryVersion second;
    second.versionId = "v2";
    second.savedAtMs = 2;
    second.stateBlobBase64 = state.toBase64Encoding();   // JUCE's own encoding, not standard base64
    r.versions.add (first);
    r.versions.add (second);
    r.branchedFromRecordId = "parent-id";

    CapturedPart measured;
    measured.partId = "p1";
    measured.pluginCeId = "vst3:abc";
    measured.pluginName = "Synth";
    measured.presetName = "Warm";
    measured.sonic.measured = true;
    measured.sonic.brightness = 0.5f;
    measured.sonic.tail = 0.25f;
    CapturedPart unmeasured;
    unmeasured.partId = "p2";
    r.parts.add (measured);
    r.parts.add (unmeasured);

    r.user.favourite = true;
    r.user.rating = 4;
    r.user.notes = "a note\nover two lines";
    r.user.tags = { "warm", juce::String (juce::CharPointer_UTF8 ("\xc3\xbf")) };
    r.user.collections = { "Live" };
    return r;
}

LibraryRecord named (const juce::String& name)
{
    LibraryRecord record;
    record.type = "preset";
    record.name = name;
    return record;
}

/** A database holding `names`, one captured record each, closed again. Returns their ids. */
juce::StringArray seedDatabase (const juce::File& database, const juce::StringArray& names)
{
    LibraryStore store;
    Library library;
    store.open (database, {}, library);
    juce::StringArray ids;
    for (const auto& name : names)
        ids.add (library.addCapturedRecord (named (name)));
    store.sync (library);
    return ids;
}

void testStoreRoundTripsEveryField()
{
    std::cout << "\nthe store round-trips every field" << std::endl;

    const auto dir = makeTempDir ("store-roundtrip");
    const auto database = dir.getChildFile ("library.db");

    Library library;
    LibraryStore store;
    const auto opened = store.open (database, dir.getChildFile ("library.json"), library);
    check (opened.result == LibraryStore::OpenResult::created,
           "with nothing there, a new library is created");
    if (opened.error.isNotEmpty())
        std::cerr << "  SQLite: " << opened.error << '\n';
    check (store.isOpen() && library.allRecords().isEmpty(), "open, and empty");

    // Several records, so the order is tested too: the journal is sorted by id, and a library
    // that came back in UUID order would be a library reshuffled by every save.
    for (const auto* name : { "First", "Second", "Third", "Fourth" })
        library.addCapturedRecord (named (name));
    const auto id = library.addCapturedRecord (everyField());
    auto* record = library.edit (id);
    record->factory = true;    // addCapturedRecord says otherwise; the round trip must carry both
    record->missing = true;
    record->hidden = true;
    SmartCollection collection;
    collection.name = "Bright pads";
    collection.query.text = "pad";
    collection.query.categories.exclude.add ("Bass");
    collection.query.brightness.active = true;
    collection.query.brightness.min = 0.5f;
    library.putSmartCollection (collection);
    const auto expected = asJson (library);   // before the sync reads the rows back

    const auto synced = store.sync (library);
    check (synced.ok() && synced.written == 6, "one sync writes the records and the collection");
    check (! library.hasPendingChanges(), "and empties the journal");

    Library reread;
    LibraryStore second;
    check (second.open (database, {}, reread).result == LibraryStore::OpenResult::opened,
           "a second store opens what the first wrote");

    // Earlier versions' states stay on disk until asked for: three in four of a capture's blobs.
    const auto* stored = reread.find (id);
    check (stored != nullptr && stored->versions.size() == 2 && ! stored->versions[0].stateLoaded
             && stored->versions[0].stateBlobBase64.isEmpty(),
           "versions come back without their states");
    check (stored != nullptr && stored->versions[0].stateLength == everyField().versions[0].stateBlobBase64.length()
             && stored->versions[1].stateLength == everyField().versions[1].stateBlobBase64.length(),
           "but say how long each one is, in both encodings");
    check (stored != nullptr && second.versionState (*stored, stored->versions[1]) == everyField().versions[1].stateBlobBase64,
           "and each one is read when asked for");
    check (stored != nullptr && stored->stateBlobBase64 == everyField().stateBlobBase64,
           "the current state stays in memory: every load and audition uses it");

    check (! reread.saveTo (dir.getChildFile ("export.json"))
             && reread.lastSaveFailure() == Library::SaveFailure::statesNotLoaded,
           "an export refuses rather than write states it never read as empty");
    check (second.loadVersionStates (reread) && asJson (reread) == expected,
           "with the states loaded, every field of every record is what went in");
    check (! reread.hasPendingChanges(), "and what was read is not a change");

    check (querySql (database, ("SELECT typeof(state) FROM records WHERE record_id = '" + id + "'").toRawUTF8())
             == "blob",
           "a standard base64 state is stored as bytes");
    check (querySql (database, "SELECT typeof(state) FROM versions WHERE version_id = 'v2'") == "text",
           "and one in any other encoding is kept exactly as the text it was");
    check (querySql (database, "PRAGMA journal_mode") == "wal",
           "the database is in WAL mode, so another CEditor can read while this one writes");

    dir.deleteRecursively();
}

void testStoreImportsTheJsonLibraryOnce()
{
    std::cout << "\nan old library.json is imported once and left alone" << std::endl;

    const auto dir = makeTempDir ("store-import");
    const auto json = dir.getChildFile ("library.json");
    const auto database = dir.getChildFile ("library.db");

    auto old = curatedLibrary();
    old.addCapturedRecord (everyField());
    check (old.saveTo (json), "an old-style library is on disk");
    const auto jsonBefore = bytesOf (json);
    Library asJsonRead;
    asJsonRead.loadFrom (json);

    Library library;
    LibraryStore store;
    const auto report = store.open (database, json, library);
    check (report.result == LibraryStore::OpenResult::imported && report.importedRecords == 2,
           "it is imported, and the report says how much");
    Library everything = library;
    store.loadVersionStates (everything);
    check (asJson (everything) == asJson (asJsonRead), "and the database holds exactly what the file did");
    check (bytesOf (json) == jsonBefore, "the file itself is untouched: it is the backup");

    auto user = library.allRecords()[0].user;
    user.rating = 1;
    library.setUserMetadata (library.allRecords()[0].recordId, user);
    check (store.sync (library).ok(), "a change is saved to the database");
    check (bytesOf (json) == jsonBefore, "and not to the old file");
    store.close();

    Library again;
    LibraryStore reopened;
    check (reopened.open (database, json, again).result == LibraryStore::OpenResult::opened,
           "the next start opens the database and does not import again");
    check (again.allRecords()[0].user.rating == 1, "so the change is there, not the file's old value");

    juce::Array<juce::File> left;
    dir.findChildFiles (left, juce::File::findFiles, false, "*.creating-*");
    check (left.isEmpty(), "building the database left nothing half-made behind");

    dir.deleteRecursively();
}

void testANewVersionKeepsTheOnesNeverRead()
{
    std::cout << "\nsaving a version keeps the earlier ones it never read" << std::endl;

    const auto dir = makeTempDir ("store-versions");
    const auto database = dir.getChildFile ("library.db");
    juce::String id;
    {
        Library library;
        LibraryStore store;
        store.open (database, {}, library);
        id = library.addCapturedRecord (everyField());
        store.sync (library);
    }

    Library library;
    LibraryStore store;
    store.open (database, {}, library);
    // A new save, the way the service makes one: the record's versions are rewritten, and the two
    // already there were never read into memory.
    LibraryVersion third;
    third.versionId = "v3";
    third.savedAtMs = 3;
    third.stateBlobBase64 = juce::Base64::toBase64 ("newer", 5);
    auto* record = library.edit (id, LibraryChanges::state);
    record->versions.add (third);
    record->stateBlobBase64 = third.stateBlobBase64;
    check (store.sync (library).ok(), "the new version is saved");

    Library reread;
    LibraryStore second;
    second.open (database, {}, reread);
    second.loadVersionStates (reread);
    const auto* stored = reread.find (id);
    check (stored != nullptr && stored->versions.size() == 3, "three versions now");
    check (stored != nullptr && stored->versions[0].stateBlobBase64 == everyField().versions[0].stateBlobBase64
             && stored->versions[1].stateBlobBase64 == everyField().versions[1].stateBlobBase64,
           "and the two that were never read still have their states");
    check (stored != nullptr && stored->versions[2].stateBlobBase64 == third.stateBlobBase64, "as does the new one");

    dir.deleteRecursively();
}

void testStoreSetsAsideAnUnreadableJsonImport()
{
    std::cout << "\nan unreadable library.json is set aside, not imported as empty" << std::endl;

    const auto dir = makeTempDir ("store-import-unreadable");
    const auto json = dir.getChildFile ("library.json");
    json.replaceWithText ("{ \"records\": [ { \"name\": \"Warm Pad\"");

    Library library;
    LibraryStore store;
    const auto report = store.open (dir.getChildFile ("library.db"), json, library);
    check (report.result == LibraryStore::OpenResult::unreadable, "the import reports unreadable");
    check (report.quarantined.existsAsFile()
             && report.quarantined.loadFileAsString() == "{ \"records\": [ { \"name\": \"Warm Pad\"",
           "the file is kept whole under another name");
    check (! json.existsAsFile(), "and no longer sits where it would be imported from again");
    check (store.isOpen() && library.allRecords().isEmpty(), "a new, empty library is started");

    library.addCapturedRecord (named ("After"));
    check (store.sync (library).ok(), "and it saves");

    dir.deleteRecursively();
}

void testStoreSetsAsideAnUnreadableDatabase()
{
    std::cout << "\nan unreadable database is set aside with its log" << std::endl;

    for (const auto* kind : { "text", "foreign" })
    {
        const auto dir = makeTempDir (juce::String ("store-unreadable-") + kind);
        const auto database = dir.getChildFile ("library.db");
        const auto json = dir.getChildFile ("library.json");

        if (juce::String (kind) == "text")
            database.replaceWithText ("This is not a database. It is what a damaged disk left behind.");
        else
            check (execSql (database, "CREATE TABLE somebody_elses (x); INSERT INTO somebody_elses VALUES (1);"),
                   "a SQLite database that is not a library");
        const auto before = bytesOf (database);
        // A log beside a file that is not a database at all. (Beside a real SQLite database,
        // SQLite itself decides what a log is worth, and this one would be recognised as junk.)
        const bool withLog = juce::String (kind) == "text";
        if (withLog)
            dir.getChildFile ("library.db-wal").replaceWithText ("committed changes");

        // The old JSON is still there from before the move to a database. It must NOT come back:
        // it is older than the damaged database, and bringing it back silently is its own loss.
        curatedLibrary().saveTo (json);

        Library library;
        LibraryStore store;
        const auto report = store.open (database, json, library);
        check (report.result == LibraryStore::OpenResult::unreadable, "it reports unreadable");
        check (report.quarantined.existsAsFile() && bytesOf (report.quarantined) == before,
               "the database is kept, byte for byte, under another name");
        if (withLog)
            check (report.quarantined.getSiblingFile (report.quarantined.getFileName() + "-wal").loadFileAsString()
                     == "committed changes",
                   "with its write-ahead log beside it, since that holds changes the file does not");
        check (store.isOpen() && library.allRecords().isEmpty(),
               "a new library is started, and the old JSON is not imported into it");

        library.addCapturedRecord (named ("After"));
        check (store.sync (library).ok(), "the new library saves");

        dir.deleteRecursively();
    }
}

void testStoreLeavesANewerDatabaseAlone()
{
    std::cout << "\na database from a newer CEditor is left alone" << std::endl;

    const auto dir = makeTempDir ("store-newer");
    const auto database = dir.getChildFile ("library.db");
    seedDatabase (database, { "Mine" });
    check (execSql (database, "PRAGMA user_version = 99"), "a newer CEditor has been here");
    const auto before = bytesOf (database);

    Library library;
    LibraryStore store;
    check (store.open (database, {}, library).result == LibraryStore::OpenResult::newerFormat,
           "the store says so");
    check (! store.isOpen() && library.allRecords().isEmpty(), "and opens nothing");

    library.addCapturedRecord (named ("Not saved"));
    check (store.sync (library).result == LibraryStore::SyncResult::closed, "a sync writes nothing");
    check (library.hasPendingChanges(), "and keeps the change in memory rather than dropping it");
    check (bytesOf (database) == before, "the newer database is exactly as it was");

    dir.deleteRecursively();
}

void testTwoProcessesMergeByField()
{
    std::cout << "\ntwo processes on one library: both of their changes land" << std::endl;

    const auto dir = makeTempDir ("store-two-processes");
    const auto database = dir.getChildFile ("library.db");
    const auto ids = seedDatabase (database, { "X", "Y" });

    Library a, b;
    LibraryStore storeA, storeB;
    storeA.open (database, {}, a);
    storeB.open (database, {}, b);

    // A favourites X. B, which has not seen that, rates X: B's copy of X still says "not a
    // favourite", and the JSON index would have written that back, or refused B for the rest of
    // the session. Only the rating moved in B, so only the rating is written.
    auto userA = a.find (ids[0])->user;
    userA.favourite = true;
    a.setUserMetadata (ids[0], userA);
    check (storeA.sync (a).ok(), "A saves its favourite");

    auto userB = b.find (ids[0])->user;
    userB.rating = 5;
    b.setUserMetadata (ids[0], userB);
    const auto bSync = storeB.sync (b);
    check (bSync.ok(), "B's save of the same record is not refused");
    check (bSync.changedByOthers == 1, "and B hears that A changed something");
    check (b.find (ids[0])->user.favourite && b.find (ids[0])->user.rating == 5,
           "B now holds both the favourite and the rating");

    auto tagged = b.find (ids[1])->user;
    tagged.tags.add ("warm");
    b.setUserMetadata (ids[1], tagged);
    storeB.sync (b);

    check (storeA.othersHaveWritten(), "A can tell, cheaply, that B wrote");
    check (storeA.sync (a).changedByOthers == 2, "A's next sync reads both of B's changes");
    check (! storeA.othersHaveWritten(), "and after reading them there is nothing new");
    check (a.find (ids[0])->user.favourite && a.find (ids[0])->user.rating == 5
             && a.find (ids[1])->user.tags.contains ("warm"),
           "A holds everything too");

    Library c;
    LibraryStore storeC;
    storeC.open (database, {}, c);
    check (asJson (c) == asJson (a) && asJson (c) == asJson (b), "and so does the database");

    juce::Array<juce::File> files;
    dir.findChildFiles (files, juce::File::findFiles, false);
    bool onlyTheDatabase = true;
    for (const auto& f : files)
        onlyTheDatabase = onlyTheDatabase && f.getFileName().startsWith ("library.db");
    check (onlyTheDatabase, "and no conflict copy was written anywhere");

    dir.deleteRecursively();
}

void testUsageCountsAddAcrossProcesses()
{
    std::cout << "\nusage counts add up across processes" << std::endl;

    const auto dir = makeTempDir ("store-usage");
    const auto database = dir.getChildFile ("library.db");
    const auto id = seedDatabase (database, { "X" })[0];

    Library a, b;
    LibraryStore storeA, storeB;
    storeA.open (database, {}, a);
    storeB.open (database, {}, b);

    a.noteRecordUsed (id, true, 0);
    a.noteRecordUsed (id, true, 0);
    storeA.sync (a);

    // B has not read A's two auditions; an absolute count would write 3 over A's 2.
    for (int i = 0; i < 3; ++i)
        b.noteRecordUsed (id, true, 0);
    b.noteRecordUsed (id, false, 500);
    storeB.sync (b);
    a.noteRecordUsed (id, false, 1000);
    storeA.sync (a);
    storeB.sync (b);

    for (const auto* library : { &a, &b })
    {
        const auto* record = library->find (id);
        check (record->auditionCount == 5 && record->loadCount == 2 && record->lastLoadedAtMs == 1000,
               "five auditions, two loads, and the latest load time, in both processes");
    }

    dir.deleteRecursively();
}

void testRemovalsTravelAndDeliberateEditsWin()
{
    std::cout << "\nremovals reach other processes; a deliberate edit brings a record back" << std::endl;

    const auto dir = makeTempDir ("store-removals");
    const auto database = dir.getChildFile ("library.db");
    const auto ids = seedDatabase (database, { "X", "Y", "Z" });

    Library a, b;
    LibraryStore storeA, storeB;
    storeA.open (database, {}, a);
    storeB.open (database, {}, b);

    a.removeRecord (ids[0]);
    a.removeRecord (ids[1]);
    storeA.sync (a);

    // B, not having seen the removals, favourites X and auditions Y.
    auto user = b.find (ids[0])->user;
    user.favourite = true;
    b.setUserMetadata (ids[0], user);
    b.noteRecordUsed (ids[1], true, 0);
    storeB.sync (b);

    check (b.find (ids[0]) != nullptr && b.find (ids[0])->user.favourite,
           "a favourite given to a record removed elsewhere brings it back: it is the newer word");
    check (b.find (ids[1]) == nullptr, "an audition does not: the removal reaches B");
    check (b.find (ids[2]) != nullptr, "and what nobody touched is still there");

    storeA.sync (a);
    check (a.find (ids[0]) != nullptr && a.find (ids[1]) == nullptr,
           "A hears of X's return and keeps Y removed");

    SmartCollection pads;
    pads.name = "Pads";
    const auto collectionId = a.putSmartCollection (pads);
    storeA.sync (a);
    storeB.sync (b);
    check (b.allSmartCollections().size() == 1, "a saved collection reaches the other process");
    b.removeSmartCollection (collectionId);
    storeB.sync (b);
    storeA.sync (a);
    check (a.allSmartCollections().isEmpty(), "and so does its removal");

    dir.deleteRecursively();
}

void testABusyDatabaseDelaysAndDoesNotDrop()
{
    std::cout << "\na busy database delays a change and does not drop it" << std::endl;

    const auto dir = makeTempDir ("store-busy");
    const auto database = dir.getChildFile ("library.db");
    const auto id = seedDatabase (database, { "X" })[0];

    Library library;
    LibraryStore store (50);
    store.open (database, {}, library);

    // Another process in the middle of a write, holding the lock.
    sqlite3* other = nullptr;
    sqlite3_open_v2 (database.getFullPathName().toRawUTF8(), &other, SQLITE_OPEN_READWRITE, nullptr);
    check (sqlite3_exec (other, "BEGIN IMMEDIATE", nullptr, nullptr, nullptr) == SQLITE_OK,
           "another process holds the write lock");

    auto user = library.find (id)->user;
    user.favourite = true;
    library.setUserMetadata (id, user);
    check (store.sync (library).result == LibraryStore::SyncResult::busy, "the sync reports busy");
    check (library.hasPendingChanges() && library.find (id)->user.favourite,
           "the favourite is still in memory and still pending");

    user.rating = 3;
    library.setUserMetadata (id, user);
    library.noteRecordUsed (id, true, 0);
    check (store.sync (library).result == LibraryStore::SyncResult::busy, "still busy");

    sqlite3_exec (other, "ROLLBACK", nullptr, nullptr, nullptr);
    sqlite3_close_v2 (other);

    check (store.sync (library).ok(), "once the other process lets go, the sync goes through");
    check (! library.hasPendingChanges(), "with nothing left over");

    Library reread;
    LibraryStore second;
    second.open (database, {}, reread);
    const auto* record = reread.find (id);
    check (record != nullptr && record->user.favourite && record->user.rating == 3
             && record->auditionCount == 1,
           "and every change made while it waited is in the database, counted once");

    // A capture taken back before it was ever written leaves nothing to write.
    const auto taken = library.addCapturedRecord (named ("Taken back"));
    library.removeRecord (taken);
    check (! library.hasPendingChanges(), "a record removed before it was saved needs no removal");

    dir.deleteRecursively();
}

void testTheJournalWritesOnlyWhatMoved()
{
    std::cout << "\nthe journal names only what actually changed" << std::endl;

    const auto vendor = [] (const juce::String& locator, const juce::String& fingerprint)
    {
        LibraryRecord record;
        record.type = "preset";
        record.sourceType = "vstpreset";
        record.factory = true;
        record.sourceLocator = locator;
        record.name = locator.fromLastOccurrenceOf ("/", false, false);
        record.fingerprint = fingerprint;
        return record;
    };

    Library library;
    library.mergeVendorScan ("vstpreset", { vendor ("/p/a", "fa"), vendor ("/p/b", "fb"), vendor ("/p/c", "fc") });
    check (library.pendingChanges().records.size() == 3, "a first scan journals three new records");
    library.takePendingChanges();

    library.mergeVendorScan ("vstpreset", { vendor ("/p/a", "fa"), vendor ("/p/b", "fb"), vendor ("/p/c", "fc") });
    check (! library.hasPendingChanges(), "rescanning an unchanged folder journals nothing");

    library.mergeVendorScan ("vstpreset", { vendor ("/p/a", "fa"), vendor ("/p/b", "fb-edited") });
    const auto& changed = library.pendingChanges().records;
    const auto idOf = [&] (const juce::String& locator)
    {
        for (const auto& r : library.allRecords())
            if (r.sourceLocator == locator)
                return r.recordId;
        return juce::String();
    };
    check (changed.size() == 2, "an edited file and a vanished one: two records");
    check (changed.count (idOf ("/p/b")) && changed.at (idOf ("/p/b")) == LibraryChanges::identity,
           "the edited file's identity, and nothing else of it");
    check (changed.count (idOf ("/p/c")) && changed.at (idOf ("/p/c")) == LibraryChanges::missing,
           "the vanished file's missing flag, and nothing else of it");
    library.takePendingChanges();

    const auto id = idOf ("/p/a");
    auto user = library.find (id)->user;
    library.setUserMetadata (id, user);
    check (! library.hasPendingChanges(), "setting the same curation again journals nothing");
    user.rating = 2;
    library.setUserMetadata (id, user);
    check (library.pendingChanges().records.at (id) == LibraryChanges::rating,
           "one star moved: the rating alone");
}

} // namespace

int main()
{
    testRoundTripAndFirstRun();
    testUnreadableIndexIsNeverOverwritten();
    testQuarantineThenStartFresh();
    testWriteFailureLeavesTheGoodFileAlone();
    testStoreRoundTripsEveryField();
    testStoreImportsTheJsonLibraryOnce();
    testANewVersionKeepsTheOnesNeverRead();
    testStoreSetsAsideAnUnreadableJsonImport();
    testStoreSetsAsideAnUnreadableDatabase();
    testStoreLeavesANewerDatabaseAlone();
    testTwoProcessesMergeByField();
    testUsageCountsAddAcrossProcesses();
    testRemovalsTravelAndDeliberateEditsWin();
    testABusyDatabaseDelaysAndDoesNotDrop();
    testTheJournalWritesOnlyWhatMoved();

    std::cout << (failures == 0 ? "ALL PASSED" : "FAILED") << '\n';
    return failures == 0 ? 0 : 1;
}
