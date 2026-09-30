// LibraryBench.cpp — what the sound library's JSON index costs at the size it is designed for.
//
//   cmake --build build/native --config Release --target CEditorLibraryBench
//   build/native/Release/CEditorLibraryBench [vendorRecords=12000] [capturedRecords=300]
//
// A measurement, not a test: it is not registered with CTest and is not built by default. It exists
// to answer one question with numbers — does the one-file JSON index (Library::saveTo, loadFrom)
// hold at twelve thousand presets, or does it need a database? — and to be re-run when the answer
// might have changed. docs/design/library-storage-measurement-2026-09-30.md has the numbers it gave.
//
// What it builds is what a real library holds after a vendor scan and an analysis pass: every
// vendor record measured (a SonicProfile with its 48-point envelope), a few tags and favourites,
// and — the part that makes a file big — captured sounds, each carrying its processor state and
// a few earlier versions of it, base64 in the JSON.
//
// Every operation is timed through the real code path. The two that matter most are the ones the
// service runs on a click: setUserMetadata + saveTo (favourite, rating, tag) and noteRecordUsed +
// saveTo (every load and every audition). A save re-reads the file on disk first, to refuse a stale
// write over another process's changes, so a click costs a full read AND a full write.

#include <InstrumentHost/Library.h>

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
    return block.toBase64Encoding();
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
    const auto file = dir.getChildFile ("library.json");

    const auto firstSaveMs = millis ([&] { library.saveTo (file); });
    const auto sizeMb = (double) file.getSize() / (1024.0 * 1024.0);

    constexpr int runs = 7;
    const auto saveMs = median (runs, [&] { library.saveTo (file); });
    const auto loadMs = median (runs, [&] { Library fresh; fresh.loadFrom (file); });

    const auto someId = library.allRecords()[library.allRecords().size() / 2].recordId;
    bool toggle = false;
    const auto favouriteMs = median (runs, [&]
    {
        auto user = library.find (someId)->user;
        user.favourite = (toggle = ! toggle);
        library.setUserMetadata (someId, user);
        library.saveTo (file);
    });
    const auto favouriteInMemoryMs = median (runs, [&]
    {
        auto user = library.find (someId)->user;
        user.favourite = (toggle = ! toggle);
        library.setUserMetadata (someId, user);
    });
    const auto auditionMs = median (runs, [&]
    {
        library.noteRecordUsed (someId, true, juce::Time::currentTimeMillis());
        library.saveTo (file);
    });

    const auto textSearchMs = median (runs, [&] { (void) searchLibrary (library, juce::String ("pad"), {}); });
    LibraryQuery faceted;
    faceted.categories.include.add ("Pad");
    faceted.brightness.active = true; faceted.brightness.min = 0.2f; faceted.brightness.max = 0.6f;
    faceted.tail.active = true; faceted.tail.min = 0.5f; faceted.tail.max = 1.0f;
    const auto facetSearchMs = median (runs, [&] { (void) searchLibrary (library, faceted); });
    const auto facetCountsMs = median (runs, [&] { (void) libraryFacets (library, faceted); });

    // Two instances of the host — the standalone and the plug-in in a DAW — on one library file.
    // A saves first; B then records three clicks of its own.
    int conflictFiles = 0;
    juce::int64 conflictBytes = 0;
    bool bSaved = true;
    {
        Library a, b;
        a.loadFrom (file);
        b.loadFrom (file);
        const auto idA = a.allRecords()[1].recordId;
        auto userA = a.find (idA)->user; userA.rating = 5;
        a.setUserMetadata (idA, userA);
        a.saveTo (file);
        for (int click = 0; click < 3; ++click)
        {
            const auto idB = b.allRecords()[10 + click].recordId;
            auto userB = b.find (idB)->user; userB.favourite = true;
            b.setUserMetadata (idB, userB);
            bSaved = b.saveTo (file) && bSaved;
        }
        for (const auto& f : dir.findChildFiles (juce::File::findFiles, false, "*.conflict-*"))
        {
            ++conflictFiles;
            conflictBytes += f.getSize();
        }
    }

    std::printf ("library: %d vendor + %d captured records (%d KB state, %d versions each)\n",
                 vendorCount, capturedCount, stateBytes / 1024, versionsPerCapture);
    std::printf ("  built in memory              %8.0f ms\n", buildMs);
    std::printf ("  file size                    %8.1f MB\n", sizeMb);
    std::printf ("  first save                   %8.1f ms\n", firstSaveMs);
    std::printf ("  save (median of %d)           %8.1f ms\n", runs, saveMs);
    std::printf ("  load                         %8.1f ms\n", loadMs);
    std::printf ("  favourite click, with save   %8.1f ms\n", favouriteMs);
    std::printf ("  favourite click, memory only %8.3f ms\n", favouriteInMemoryMs);
    std::printf ("  audition/load count + save   %8.1f ms\n", auditionMs);
    std::printf ("  text search \"pad\"            %8.2f ms\n", textSearchMs);
    std::printf ("  faceted search               %8.2f ms\n", facetSearchMs);
    std::printf ("  facet counts                 %8.2f ms\n", facetCountsMs);
    std::printf ("  two instances: B's 3 clicks  %s, %d conflict file(s), %.1f MB\n",
                 bSaved ? "saved" : "REFUSED", conflictFiles, (double) conflictBytes / (1024.0 * 1024.0));

    // CE_BENCH_KEEP=1 leaves the file behind, to look at what a record costs on disk.
    if (juce::SystemStats::getEnvironmentVariable ("CE_BENCH_KEEP", {}).isEmpty())
        dir.deleteRecursively();
    else
        std::printf ("  kept                         %s\n", file.getFullPathName().toRawUTF8());
    return 0;
}
