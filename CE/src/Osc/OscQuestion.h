#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace ceditor::osc
{

/** ce.osc's question about the network, in a dialog of the app's own: "Allow" or "Don't allow". The
    first of two buttons answers 1 and the second 0 (LookAndFeel::createAlertWindow). Set as the
    device service's askAboutNetwork by each owner that has a screen to ask on. */
inline void askAboutNetworkWithDialog (const juce::String& question, std::function<void (bool yes)> answer)
{
    const auto options = juce::MessageBoxOptions()
                             .withIconType (juce::MessageBoxIconType::QuestionIcon)
                             .withTitle ("Open Sound Control")
                             .withMessage (question + "\n\nThe answer is kept on this computer, for this panel.")
                             .withButton ("Allow")
                             .withButton ("Don't allow");
    juce::AlertWindow::showAsync (options, [answer = std::move (answer)] (int result) { answer (result == 1); });
}

} // namespace ceditor::osc
