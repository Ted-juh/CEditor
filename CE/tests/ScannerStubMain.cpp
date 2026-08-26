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
// Pure std on purpose: it must build and run anywhere the tests do, with no JUCE link.

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <thread>

int main (int argc, char* argv[])
{
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
                 " category=\"Instrument\" isInstrument=\"1\" ceId=\"VST3-stub-synth-1\"/>"
                 "<PLUGIN name=\"Stub Verb\" manufacturer=\"Stub Audio\" version=\"1.2.3\""
                 " category=\"Fx\" isInstrument=\"0\" ceId=\"VST3-stub-verb-1\"/>"
                 "</SCANRESULT>\n",
                 path.c_str());
    return 0;
}
