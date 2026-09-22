// Library persistence — the rule that an index we could not READ is never written over.
//
// The failure this exists to prevent has no error message and no user action behind it: the
// index fails to load (a truncated file, a lock held by something else, a half-finished save
// from last time), the library comes up empty because that is what failing to read produces,
// and the first favourite or captured preset afterwards saves that emptiness over the file.
// Every rating, note, tag, collection and user preset is then gone, and the only evidence that
// anything happened is a library that is suddenly small.
//
// So the tests below are mostly about what does NOT happen: no silent empty library, no save
// after a failed read, and no half-written file left where a good one was.

#include "InstrumentHost/Library.h"
#include "AtomicFileWrite.h"

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

void testStaleProcessCannotOverwriteANewerLibrary()
{
    std::cout << "\na stale process cannot overwrite a newer library" << std::endl;

    const auto dir = makeTempDir ("multi-instance");
    const auto file = dir.getChildFile ("library.json");

    Library first, stale;
    check (first.loadFrom (file) == Library::LoadResult::absent, "first process sees a new index");
    check (stale.loadFrom (file) == Library::LoadResult::absent, "second process sees the same baseline");

    LibraryRecord fromFirst;
    fromFirst.name = "First process preset";
    first.addCapturedRecord (std::move (fromFirst));
    check (first.saveTo (file), "the first process saves its change");
    const auto afterFirst = file.loadFileAsString();

    LibraryRecord fromStale;
    fromStale.name = "Stale process preset";
    stale.addCapturedRecord (std::move (fromStale));
    check (! stale.saveTo (file), "a stale writer is refused");
    check (stale.lastSaveFailure() == Library::SaveFailure::changedExternally,
           "the refusal is reported as an external-change conflict");
    check (file.loadFileAsString() == afterFirst, "the newer process's complete index is untouched");

    Library reloaded;
    check (reloaded.loadFrom (file) == Library::LoadResult::loaded
             && reloaded.allRecords().size() == 1
             && reloaded.allRecords()[0].name == "First process preset",
           "the winning process's record survives intact");

    dir.deleteRecursively();
}

} // namespace

int main()
{
    testRoundTripAndFirstRun();
    testUnreadableIndexIsNeverOverwritten();
    testQuarantineThenStartFresh();
    testWriteFailureLeavesTheGoodFileAlone();
    testStaleProcessCannotOverwriteANewerLibrary();

    std::cout << (failures == 0 ? "ALL PASSED" : "FAILED") << '\n';
    return failures == 0 ? 0 : 1;
}
