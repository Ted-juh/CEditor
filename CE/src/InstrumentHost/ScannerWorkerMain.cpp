// CEditorPluginScanner — the out-of-process VST3 scan worker (VIP-successor Stage 1).
//
// This executable is the ONE place a third-party VST3 module gets loaded to ask what it
// contains. It is short-lived by design: one module per invocation, so a module that crashes
// or hangs takes this process with it and the coordinator in the editor attributes the death
// to exactly the module it handed over (PluginScannerCoordinator.h documents the protocol and
// the classification).
//
// Output is one XML document on stdout and nothing else — JUCE's own PluginDescription XML per
// exposed class, plus the `ceId` attribute (the identifier string) that the catalogue uses as
// stable identity. Keeping the serialization JUCE's means the app side can reparse a stored
// description into a PluginDescription for instantiation without a single hand-mapped field.

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <iostream>

int main (int argc, char* argv[])
{
    if (argc != 3 || juce::String (argv[1]) != "--scan")
    {
        std::cerr << "usage: CEditorPluginScanner --scan <path-to-vst3>" << std::endl;
        return 64;
    }

    // Scanning instantiates the module briefly, and VST3 module code expects a message
    // manager to exist on the thread doing it — the same footing PluginDirectoryScanner runs on.
    juce::ScopedJuceInitialiser_GUI juceInit;

    const juce::String modulePath = juce::String::fromUTF8 (argv[2]);

    juce::XmlElement out ("SCANRESULT");
    out.setAttribute ("module", modulePath);

    const juce::File moduleFile (modulePath);
    if (! (moduleFile.existsAsFile() || moduleFile.isDirectory()))
    {
        auto* error = out.createNewChildElement ("ERROR");
        error->setAttribute ("message", "module does not exist: " + modulePath);
        std::cout << out.toString() << std::endl;
        return 2;
    }

    juce::VST3PluginFormat format;
    juce::OwnedArray<juce::PluginDescription> descriptions;
    format.findAllTypesForFile (descriptions, modulePath);

    for (const auto* description : descriptions)
    {
        if (auto xml = description->createXml())
        {
            xml->setAttribute ("ceId", description->createIdentifierString());
            out.addChildElement (xml.release());
        }
    }

    std::cout << out.toString() << std::endl;
    return 0;
}
