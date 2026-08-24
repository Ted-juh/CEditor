#pragma once

#include <juce_core/juce_core.h>

// RestorePolicy.h — when an exported plugin is allowed to push a restored patch at the hardware.
//
// THE GAP THIS CLOSES, from docs/design/total-recall-plan.md §1: `setStateInformation` restores every
// value and reconnects the ports, and then stops. The APVTS holds the patch; the synth holds
// whatever it was left on. The state is *known* and *not transmitted*, which from the user's chair
// is indistinguishable from not having been saved.
//
// WHY THE RULES LIVE IN THEIR OWN HEADER. They are all ordering and timing, which is exactly the
// class of thing that is easy to get subtly wrong and impossible to test through
// `PluginProcessor.h` — that file needs WebView2 and does not build off Windows. `decideRestore`
// below is a pure function of the situation, so `RestorePolicyTests` can drive every ordering the
// plan warns about on any machine.
//
// TWO CONSTRAINTS make the push correct rather than merely present, and both are encoded here:
//
//   IT CANNOT RUN INSIDE setStateInformation. That call arrives before the ports are open, before
//   prepareToPlay, and on a thread with no business sending SysEx. So the processor raises a
//   pending flag and asks this, repeatedly, from its message-thread timer.
//
//   IT MUST BE A STATED POLICY, NOT A DEFAULT. A plugin that blasts SysEx at whatever is plugged in
//   whenever a project opens is a bad citizen: the device may be a different synth today, or the
//   same synth mid-take. Ask / Always / Never, panel-authored, with the answer remembered.

namespace ce
{

enum class RestorePolicy
{
    Ask,      ///< Ask the first time, then remember the answer. The default.
    Always,   ///< Push on every restore, without asking.
    Never,    ///< Never push. The session still restores; the hardware is simply left alone.
};

inline RestorePolicy parseRestorePolicy (const juce::String& value)
{
    const auto v = value.trim().toLowerCase();
    if (v == "always") return RestorePolicy::Always;
    if (v == "never")  return RestorePolicy::Never;
    return RestorePolicy::Ask;   // including "", "ask", and anything unrecognised
}

inline juce::String restorePolicyName (RestorePolicy policy)
{
    switch (policy)
    {
        case RestorePolicy::Always: return "always";
        case RestorePolicy::Never:  return "never";
        case RestorePolicy::Ask:    break;
    }
    return "ask";
}

/**
 * The panel author's choice, read off the exported document.
 *
 * Absent means Ask, which is the conservative reading: a panel exported before this setting existed
 * did not push at all, so asking is strictly more than it did and never less welcome.
 */
inline RestorePolicy readPanelRestorePolicy (const juce::var& panelDocument)
{
    const auto settings = panelDocument.getProperty ("exportSettings", juce::var());
    return parseRestorePolicy (settings.getProperty ("restoreHardware", juce::var()).toString());
}

/** What the processor should do about a pending restore, this tick. */
enum class RestoreAction
{
    Wait,      ///< Not yet — the device is not ready, or nobody has answered the question.
    Send,      ///< Push the restored values now.
    Ask,       ///< Raise the prompt in the panel UI; come back when there is an answer.
    Abandon,   ///< Stop trying. Either policy forbids it or the device never turned up.
};

struct RestoreVerdict
{
    RestoreAction action = RestoreAction::Wait;
    juce::String reason;      ///< For the log. A restore that silently did not happen is the bug.
};

/**
 * Everything the decision depends on, in one struct so the call site cannot get the order wrong.
 *
 * `windowOpen` matters only for Ask: with the editor closed there is nowhere to put the question,
 * so the pending restore waits rather than being abandoned. A user who opens the window ten minutes
 * later still gets asked — which is the honest behaviour, because the patch is still not on the
 * synth.
 */
struct RestoreSituation
{
    RestorePolicy policy = RestorePolicy::Ask;
    /// "", "always" or "never" — an answer the user gave earlier and the session remembered.
    juce::String rememberedAnswer;
    bool deviceReady = false;
    bool windowOpen = false;
    bool promptAlreadySent = false;
    double waitedMs = 0.0;
    /// How long to keep waiting for a device that has not become ready. 0 disables the deadline.
    double readyTimeoutMs = 30000.0;
    /// Whether there is anything to push at all.
    bool hasParametersToSend = true;
};

inline RestoreVerdict decideRestore (const RestoreSituation& s)
{
    if (! s.hasParametersToSend)
        return { RestoreAction::Abandon, "no device-bound parameters to restore" };

    if (s.policy == RestorePolicy::Never)
        return { RestoreAction::Abandon, "panel policy is never" };

    // A remembered "never" outranks a panel that says Always. The panel author states a default;
    // the person at the desk states a decision, and it was made about this session's hardware.
    if (s.rememberedAnswer.equalsIgnoreCase ("never"))
        return { RestoreAction::Abandon, "the user chose never for this session" };

    // Readiness is checked BEFORE the question is asked. Asking "restore the synth?" while nothing
    // is connected offers a choice that cannot be carried out either way.
    if (! s.deviceReady)
    {
        if (s.readyTimeoutMs > 0.0 && s.waitedMs >= s.readyTimeoutMs)
            return { RestoreAction::Abandon, "no device became ready within "
                                             + juce::String (juce::roundToInt (s.readyTimeoutMs / 1000.0)) + "s" };
        return { RestoreAction::Wait, "waiting for the device to become ready" };
    }

    if (s.policy == RestorePolicy::Always || s.rememberedAnswer.equalsIgnoreCase ("always"))
        return { RestoreAction::Send, s.policy == RestorePolicy::Always ? "panel policy is always"
                                                                        : "the user chose always for this session" };

    // Ask, with no answer yet. The deadline deliberately does NOT apply here: an unanswered
    // question is not a stalled restore, it is a restore waiting on a person, and timing that out
    // would silently drop the patch the user is about to ask for.
    if (! s.windowOpen)
        return { RestoreAction::Wait, "holding the question until the panel window is open" };

    return s.promptAlreadySent
        ? RestoreVerdict { RestoreAction::Wait, "waiting for the user to answer" }
        : RestoreVerdict { RestoreAction::Ask, "asking whether to restore the hardware" };
}

} // namespace ce
