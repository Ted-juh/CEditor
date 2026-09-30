// LibraryBench.cpp — what the sound library costs to keep, at the size it is designed for.
//
//   cmake --build build/native --config Release --target CEditorLibraryBench
//   build/native/Release/CEditorLibraryBench [vendorRecords=12000] [capturedRecords=300]
//
// A measurement, not a test: it is not registered with CTest and is not built by default. It was
// written to answer one question with numbers — does the one-file JSON index hold at twelve
// thousand presets, or does it need a database? — and it answered it: a second per favourite
// click, nearly five with a few hundred captured sounds, and two CEditor processes that could not
// share a library at all (docs/design/library-storage-measurement-2026-09-30.md). The library is
// now kept in SQLite (LibraryStore), and this measures that the same way, so the two sets of
// numbers can be read side by side.
//
// What it builds is what a real library holds after a vendor scan and an analysis pass: every
// vendor record measured (a SonicProfile with its 48-point envelope), a few tags and favourites,
// and captured sounds, each carrying its processor state and a few earlier versions of it.
//
// Every operation goes through the real code path. The ones that matter most are what the service
// does on a click: setUserMetadata + write (favourite, rating, tag) and noteRecordUsed + write
// (every load and every audition).

#include <InstrumentHost/Library.h>
#include <InstrumentHost/LibraryStore.h>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <functional>
#include <vector>

using namespace ceditor::host;

namespace
{
double millis (const std::function<void()>& work)
{
    const auto start = std::chrono::steady_clock::now();
    work();
    return std::chrono::duration<double, std::milli> (std::chrono::steady_clock::now() - start).count();
}

/** The median of `runs` timings — one slow run (a page-cache miss, the OS) does not decide it. */
double median (int runs, const std::function<void()>& work)
{
    std::vector<double> times;
    for (int i = 0; i < runs; ++i) times.push_back (millis (work));
    std::sort (times.begin(), times.end());
    return times[times.size() / 2];
}

const char* kCategories[] = { "Bass", "Lead", "Pad", "Keys", "Pluck", "FX", "Drum", "Sequence", "Strings", "Brass" };
const char* kInstruments[] = { "Surge XT", "Diva", "Pigments", "Serum", "Vital", "Massive X", "Omnisphere", "Zebra2" };

LibraryRecord vendorRecord (int i, juce::Random& random)
{
    LibraryRecord r;
    r.type = "preset";
    r.sourceType = "vstpreset";
    const auto instrument = juce::String (kInstruments[i % 8]);
    const auto category = juce::String (kCategories[(i / 8) % 10]);
    r.instrument = instrument;
    r.manufacturer = instrument + " Audio";
    r.category = category;
    r.name = category + " " + juce::String (i) + " " + juce::String::toHexString (random.nextInt());
    r.sourceLocator = "C:/Users/someone/Documents/VST3 Presets/" + instrument + "/" + category + "/" + r.name + ".vstpreset";
    r.targetCeId = "vst3:" + juce::String::toHexString (instrument.hashCode64());
    r.classIdHex = juce::String::toHexString (instrument.hashCode64()).paddedLeft ('0', 32);
    r.fingerprint = juce::String::toHexString (random.nextInt64());
    r.factory = true;
    r.addedAtMs = juce::Time::currentTimeMillis() - random.nextInt (1000) * 86400000LL;

    auto& s = r.sonic;
    s.measured = true;
    s.brightness = random.nextFloat();   s.centroidHz = 120 + s.brightness * 8880;
    s.attack = random.nextFloat();       s.attackSeconds = s.attack * 2;
    s.tail = random.nextFloat();         s.tailSeconds = s.tail * 10;
    s.width = random.nextFloat();
    s.noisiness = random.nextFloat();
    s.dynamics = random.nextFloat();
    s.peak = random.nextFloat();
    s.cost = random.nextFloat();         s.costPercent = s.cost * 25;
    for (int p = 0; p < sonicEnvelopePoints; ++p) s.envelope.add (random.nextFloat());
    r.sonicFingerprint = r.fingerprint;
    return r;
}

juce::String stateBlob (int bytes, juce::Random& random)
{
    juce::MemoryBlock block ((size_t) bytes);
    for (size_t b = 0; b < block.getSize(); ++b) block[b] = (char) random.nextInt (256);
    return juce::Base64::toBase64 (block.getData(), block.getSize());   // what the service writes
}

juce::int64 sizeOnDisk (const juce::File& database)
{
    juce::int64 total = 0;
    for (const auto* suffix : { "", "-wal", "-shm" })
        total += database.getSiblingFile (database.getFileName() + suffix).getSize();
    return total;
}
} // namespace

int main (int argc, char** argv)
{
    const int vendorCount = argc > 1 ? juce::String (argv[1]).getIntValue() : 12000;
    const int capturedCount = argc > 2 ? juce::String (argv[2]).getIntValue() : 300;
    constexpr int stateBytes = 48 * 1024;   // a typical synth's saved state (Surge's is 30-60 KB)
    constexpr int versionsPerCapture = 3;

    juce::Random random (20260930);
    Library library;

    const auto buildMs = millis ([&]
    {
        juce::Array<LibraryRecord> scanned;
        for (int i = 0; i < vendorCount; ++i) scanned.add (vendorRecord (i, random));
        library.mergeVendorScan ("vstpreset", std::move (scanned));

        for (int i = 0; i < capturedCount; ++i)
        {
            auto r = vendorRecord (vendorCount + i, random);
            r.sourceType = "userState";
            r.sourceLocator = {};
            r.factory = false;
            r.stateBlobBase64 = stateBlob (stateBytes, random);
            for (int v = 0; v < versionsPerCapture; ++v)
            {
                LibraryVersion version;
                version.versionId = juce::Uuid().toString();
                version.savedAtMs = juce::Time::currentTimeMillis() - v * 86400000LL;
                version.stateBlobBase64 = stateBlob (stateBytes, random);
                r.versions.add (version);
            }
            library.addCapturedRecord (r);
        }

        // Some curation: every 50th a favourite with a tag, every 200th rated.
        for (int i = 0; i < library.allRecords().size(); i += 50)
        {
            auto user = library.allRecords()[i].user;
            user.favourite = true;
            user.tags.add ("warm");
            if (i % 200 == 0) user.rating = 4;
            library.setUserMetadata (library.allRecords()[i].recordId, user);
        }
    });

    const auto dir = juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("ceditor-library-bench");
    dir.deleteRecursively();
    dir.createDirectory();
    const auto json = dir.getChildFile ("library.json");
    const auto database = dir.getChildFile ("library.db");
    constexpr int runs = 7;

    // The JSON form, now only an export and the import source: how big, and what the one-time
    // import into a database costs.
    const auto exportMs = millis ([&] { library.saveTo (json); });
    const auto jsonMb = (double) json.getSize() / (1024.0 * 1024.0);

    Library imported;
    LibraryStore importer;
    const auto importMs = millis ([&] { importer.open (database, json, imported); });
    importer.close();
    const auto databaseMb = (double) sizeOnDisk (database) / (1024.0 * 1024.0);

    const auto openMs = median (runs, [&] { Library fresh; LibraryStore store; store.open (database, {}, fresh); });

    Library live;
    LibraryStore store;
    store.open (database, {}, live);

    const auto someId = live.allRecords()[live.allRecords().size() / 2].recordId;
    bool toggle = false;
    const auto favouriteMs = median (runs, [&]
    {
        auto user = live.find (someId)->user;
        user.favourite = (toggle = ! toggle);
        live.setUserMetadata (someId, user);
        store.write (live);
    });
    const auto favouriteInMemoryMs = median (runs, [&]
    {
        auto user = live.find (someId)->user;
        user.favourite = (toggle = ! toggle);
        live.setUserMetadata (someId, user);
    });
    store.write (live);
    const auto auditionMs = median (runs, [&]
    {
        live.noteRecordUsed (someId, true, juce::Time::currentTimeMillis());
        store.write (live);
    });
    const auto captureMs = median (runs, [&]
    {
        auto r = vendorRecord (vendorCount + capturedCount + 1, random);
        r.sourceType = "userState";
        r.factory = false;
        r.stateBlobBase64 = stateBlob (stateBytes, random);
        live.addCapturedRecord (r);
        store.write (live);
    });
    const auto idleCheckMs = median (runs, [&] { (void) store.sync (live); });

    const auto textSearchMs = median (runs, [&] { (void) searchLibrary (live, juce::String ("pad"), {}); });
    LibraryQuery faceted;
    faceted.categories.include.add ("Pad");
    faceted.brightness.active = true; faceted.brightness.min = 0.2f; faceted.brightness.max = 0.6f;
    faceted.tail.active = true; faceted.tail.min = 0.5f; faceted.tail.max = 1.0f;
    const auto facetSearchMs = median (runs, [&] { (void) searchLibrary (live, faceted); });
    const auto facetCountsMs = median (runs, [&] { (void) libraryFacets (live, faceted); });

    // Two instances of the host — the standalone and the plug-in in a DAW — on one library.
    // A rates a sound; B, which has not seen that, favourites three others and the same one.
    int bLanded = 0;
    bool bothOnOne = false;
    double pullMs = 0;
    {
        Library a, b;
        LibraryStore storeA, storeB;
        storeA.open (database, {}, a);
        storeB.open (database, {}, b);
        const auto shared = a.allRecords()[1].recordId;
        auto userA = a.find (shared)->user; userA.rating = 5;
        a.setUserMetadata (shared, userA);
        storeA.write (a);

        juce::StringArray clicked { shared };
        for (int click = 0; click < 3; ++click)
            clicked.add (b.allRecords()[10 + click].recordId);
        for (const auto& id : clicked)
        {
            auto userB = b.find (id)->user; userB.favourite = true;
            b.setUserMetadata (id, userB);
            storeB.write (b);
        }
        pullMs = millis ([&] { (void) storeA.sync (a); });

        Library check;
        LibraryStore reader;
        reader.open (database, {}, check);
        for (const auto& id : clicked)
            bLanded += check.find (id)->user.favourite ? 1 : 0;
        bothOnOne = check.find (shared)->user.favourite && check.find (shared)->user.rating == 5;
    }

    std::printf ("library: %d vendor + %d captured records (%d KB state, %d versions each)\n",
                 vendorCount, capturedCount, stateBytes / 1024, versionsPerCapture);
    std::printf ("  built in memory               %8.0f ms\n", buildMs);
    std::printf ("  JSON export                   %8.1f MB, %.0f ms\n", jsonMb, exportMs);
    std::printf ("  import into a database        %8.0f ms (once)\n", importMs);
    std::printf ("  database on disk              %8.1f MB\n", databaseMb);
    std::printf ("  open and read all             %8.1f ms\n", openMs);
    std::printf ("  favourite click, written      %8.2f ms\n", favouriteMs);
    std::printf ("  favourite click, memory only  %8.3f ms\n", favouriteInMemoryMs);
    std::printf ("  audition count, written       %8.2f ms\n", auditionMs);
    std::printf ("  capture a %d KB sound         %8.2f ms\n", stateBytes / 1024, captureMs);
    std::printf ("  sync with nothing to do       %8.3f ms\n", idleCheckMs);
    std::printf ("  text search \"pad\"             %8.2f ms\n", textSearchMs);
    std::printf ("  faceted search                %8.2f ms\n", facetSearchMs);
    std::printf ("  facet counts                  %8.2f ms\n", facetCountsMs);
    std::printf ("  two instances: B's 4 clicks   %d of 4 landed; A's rating and B's favourite on one record: %s; A reads them in %.1f ms\n",
                 bLanded, bothOnOne ? "both kept" : "LOST", pullMs);

    // CE_BENCH_KEEP=1 leaves the files behind, to look at what a record costs on disk.
    if (juce::SystemStats::getEnvironmentVariable ("CE_BENCH_KEEP", {}).isEmpty())
        dir.deleteRecursively();
    else
        std::printf ("  kept                          %s\n", dir.getFullPathName().toRawUTF8());
    return 0;
}
