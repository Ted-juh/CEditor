// ScannerStubMain — a fake CEditorPluginScanner for the coordinator tests.
//
// The coordinator's whole job is surviving what a worker does to it — hang, die, print
// garbage, report an error — and none of that needs a real VST3 or juce_audio_processors.
// This stub speaks the worker's command line and picks its behaviour from the module path it
// is handed, so one binary covers every case and the tests read as scenarios:
//
//   path contains "hang"    never answers (sleeps far past any test timeout)
//   path contains "crash"   dies without output, exit 3
//   path contains "garbage" prints non-XML, exit 0
//   path contains "error"   prints an ERROR document, exit 2
//   anything else           prints a SCANRESULT with one instrument and one effect, exit 0
//
// It stands in for the AUDITION worker too (--audition), where the scenarios are per PRESET
// rather than per module, because that is the unit the real worker reports and blames:
//
//   preset name contains "crash"    prints its TRYING line and then dies, exit 3
//   preset name contains "hang"     prints its TRYING line and never speaks again
//   preset name contains "refuse"   reports a problem instead of a measurement
//   job ceId contains "noload"      prints FATAL before any preset, exit 2
//   job ceId contains "chatty"      prints junk between the lines, to be ignored
//   anything else                   measures, with numbers derived from the preset's position
//
// Pure std on purpose: it must build and run anywhere the tests do, with no JUCE link.

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <thread>
#include <vector>

namespace
{

std::string attributeAfter (const std::string& text, size_t from, const char* name)
{
    const std::string key = std::string (name) + "=\"";
    const auto at = text.find (key, from);
    if (at == std::string::npos)
        return {};
    const auto start = at + key.size();
    const auto end = text.find ('"', start);
    return end == std::string::npos ? std::string() : text.substr (start, end - start);
}

int runAudition (const std::string& jobPath)
{
    std::string job;
    if (auto* file = std::fopen (jobPath.c_str(), "rb"))
    {
        char buffer[4096];
        size_t read = 0;
        while ((read = std::fread (buffer, 1, sizeof (buffer), file)) > 0)
            job.append (buffer, read);
        std::fclose (file);
    }
    else
    {
        std::printf ("<FATAL detail=\"stub could not read the job file\"/>\n");
        return 2;
    }

    const auto ceId = attributeAfter (job, 0, "ceId");
    const auto jobHas = [&ceId] (const char* needle) { return ceId.find (needle) != std::string::npos; };

    if (jobHas ("noload"))
    {
        std::printf ("<FATAL detail=\"the plug-in would not load\"/>\n");
        std::fflush (stdout);
        return 2;
    }

    struct Preset { std::string recordId, fingerprint, name; };
    std::vector<Preset> presets;
    for (size_t at = job.find ("<PRESET "); at != std::string::npos; at = job.find ("<PRESET ", at + 1))
        presets.push_back ({ attributeAfter (job, at, "recordId"),
                             attributeAfter (job, at, "fingerprint"),
                             attributeAfter (job, at, "name") });

    int index = 0;
    for (const auto& preset : presets)
    {
        ++index;

        // Named before it is touched: this is the marker that lets the coordinator blame
        // exactly one preset when the process dies.
        std::printf ("<TRYING recordId=\"%s\"/>\n", preset.recordId.c_str());
        std::fflush (stdout);

        if (jobHas ("chatty"))
        {
            std::puts ("i am a plug-in and i print things on load");
            std::fflush (stdout);
        }

        if (preset.name.find ("crash") != std::string::npos)
            std::_Exit (3);

        if (preset.name.find ("hang") != std::string::npos)
        {
            std::this_thread::sleep_for (std::chrono::seconds (120));
            return 0;
        }

        if (preset.name.find ("refuse") != std::string::npos)
        {
            std::printf ("<FINDING recordId=\"%s\" fingerprint=\"%s\" problem=\"the stub refused\""
                         " measured=\"0\"/>\n",
                         preset.recordId.c_str(), preset.fingerprint.c_str());
            std::fflush (stdout);
            continue;
        }

        // Numbers that differ per preset, so a test can tell one finding from another.
        std::printf ("<FINDING recordId=\"%s\" fingerprint=\"%s\" measured=\"1\" silent=\"0\""
                     " brightness=\"%.3f\" centroidHz=\"%d\" attack=\"0.25\" attackSeconds=\"0.01\""
                     " tail=\"0.5\" tailSeconds=\"0.4\" width=\"0\" noisiness=\"0.1\""
                     " dynamics=\"0.5\" peak=\"0.8\" cost=\"0.02\" costPercent=\"0.5\""
                     " latencySamples=\"0\" envelope=\"0.1,0.2,0.3\"/>\n",
                     preset.recordId.c_str(), preset.fingerprint.c_str(),
                     0.1f * (float) index, 200 * index);
        std::fflush (stdout);
    }

    std::printf ("<DONE/>\n");
    std::fflush (stdout);
    return 0;
}

} // namespace

int main (int argc, char* argv[])
{
    if (argc == 3 && std::string (argv[1]) == "--audition")
        return runAudition (argv[2]);

    if (argc != 3 || std::string (argv[1]) != "--scan")
        return 64;

    const std::string path = argv[2];
    const auto has = [&path] (const char* needle) { return path.find (needle) != std::string::npos; };

    if (has ("hang"))
    {
        std::this_thread::sleep_for (std::chrono::seconds (60));
        return 0;
    }

    if (has ("crash"))
        std::_Exit (3);

    if (has ("garbage"))
    {
        std::puts ("this is not an xml document");
        return 0;
    }

    if (has ("error"))
    {
        std::printf ("<SCANRESULT module=\"%s\"><ERROR message=\"stub reported error\"/></SCANRESULT>\n",
                     path.c_str());
        return 2;
    }

    std::printf ("<SCANRESULT module=\"%s\">"
                 "<PLUGIN name=\"Stub Synth\" manufacturer=\"Stub Audio\" version=\"1.2.3\""
                 " category=\"Instrument\" isInstrument=\"1\" ceId=\"VST3-stub-synth-1\""
                 " ceSnapshot=\"/plugins/Stub.vst3/Contents/Resources/Snapshots/synth.png\"/>"
                 "<PLUGIN name=\"Stub Verb\" manufacturer=\"Stub Audio\" version=\"1.2.3\""
                 " category=\"Fx\" isInstrument=\"0\" ceId=\"VST3-stub-verb-1\"/>"
                 "</SCANRESULT>\n",
                 path.c_str());
    return 0;
}
