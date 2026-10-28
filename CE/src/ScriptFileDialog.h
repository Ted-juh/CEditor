#pragma once

// The dialog ScriptFiles asks the person with: a juce::FileChooser, launched without blocking. Kept
// apart from ScriptFiles.h so that one needs only juce_core, and its tests no window.

#include <juce_gui_basics/juce_gui_basics.h>
#include "ScriptFiles.h"

namespace ceditor
{
/** A ScriptFiles::Dialog over a chooser `holder` keeps alive while it is open. */
inline ScriptFiles::Dialog scriptFileDialog (std::shared_ptr<std::unique_ptr<juce::FileChooser>> holder)
{
    return [holder] (const ScriptFiles::DialogRequest& request, ScriptFiles::DialogDone done)
    {
        juce::MessageManager::callAsync ([holder, request, done]()
        {
            using Flags = juce::FileBrowserComponent;
            int flags = 0;
            auto start = juce::File::getSpecialLocation (juce::File::userDocumentsDirectory);
            switch (request.mode)
            {
                case ScriptFiles::Mode::open:
                    flags = Flags::openMode | Flags::canSelectFiles | (request.multiple ? Flags::canSelectMultipleItems : 0);
                    break;
                case ScriptFiles::Mode::save:
                    flags = Flags::saveMode | Flags::canSelectFiles | Flags::warnAboutOverwriting;
                    if (request.startIn != juce::File()) start = request.startIn;
                    break;
                case ScriptFiles::Mode::folder:
                    flags = Flags::openMode | Flags::canSelectDirectories;
                    break;
            }
            *holder = std::make_unique<juce::FileChooser> (request.title, start, request.patterns);
            (*holder)->launchAsync (flags, [done] (const juce::FileChooser& chooser)
            {
                juce::Array<juce::File> chosen;
                for (const auto& f : chooser.getResults())
                    if (f != juce::File()) chosen.add (f);
                done (chosen);
            });
        });
    };
}
}
