// RestorePolicyTests — when an exported plugin may push a restored patch at the hardware.
//
// This is the one part of Total Recall S2 that is all ordering and timing, and the plan
// (tools/docs/total-recall-plan.md §1) warns about exactly that: "the failure modes here are all
// timing and ordering, so test those rather than the happy path."
//
// It is also the only part testable off Windows. The rest lives in PluginProcessor.h, which needs
// WebView2 and does not build here — which is precisely why the rules were pulled out into
// RestorePolicy.h rather than written inline in the timer callback.
//
// The failures being designed against, in order of how bad they are:
//
//   A silent no-restore.       The user saves a project, reopens it, and the synth is on whatever
//                              patch it was left on. Every Abandon below has a stated reason for
//                              that reason: a restore that did not happen has to be explicable.
//   A push at the wrong time.  SysEx at a synth that is mid-take, or at a different synth than the
//                              one the session was saved against.
//   A push before ready.       setStateInformation can arrive before the ports are open.

#include "Player/RestorePolicy.h"
#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

const char* actionName (ce::RestoreAction a)
{
    switch (a)
    {
        case ce::RestoreAction::Wait:    return "Wait";
        case ce::RestoreAction::Send:    return "Send";
        case ce::RestoreAction::Ask:     return "Ask";
        case ce::RestoreAction::Abandon: return "Abandon";
    }
    return "?";
}

void expect (const ce::RestoreSituation& s, ce::RestoreAction wanted, const juce::String& label)
{
    const auto verdict = ce::decideRestore (s);
    const bool ok = verdict.action == wanted;
    std::cout << (ok ? "  PASS  " : "  FAIL  ") << label
              << "  [" << actionName (verdict.action) << ": " << verdict.reason << "]" << std::endl;
    if (! ok)
    {
        std::cout << "         expected " << actionName (wanted) << std::endl;
        ++failures;
    }
}

/** A device that is ready, a panel that asks, a window that is open, nothing answered yet. */
ce::RestoreSituation base()
{
    ce::RestoreSituation s;
    s.policy = ce::RestorePolicy::Ask;
    s.deviceReady = true;
    s.windowOpen = true;
    return s;
}

void testPolicyParsing()
{
    std::cout << "\nReading the policy off the panel" << std::endl;

    check (ce::parseRestorePolicy ("always") == ce::RestorePolicy::Always, "\"always\" parses");
    check (ce::parseRestorePolicy ("Never")  == ce::RestorePolicy::Never,  "case does not matter");
    check (ce::parseRestorePolicy ("  ask ") == ce::RestorePolicy::Ask,    "whitespace does not matter");

    // The migration case, and the one that matters most: a panel exported before this setting
    // existed pushed nothing at all, so it must not start pushing silently now.
    check (ce::parseRestorePolicy ("")        == ce::RestorePolicy::Ask, "absent means ask");
    check (ce::parseRestorePolicy ("yes")     == ce::RestorePolicy::Ask, "an unrecognised value means ask");

    check (ce::restorePolicyName (ce::RestorePolicy::Always) == "always", "the name round-trips");
    check (ce::parseRestorePolicy (ce::restorePolicyName (ce::RestorePolicy::Never)) == ce::RestorePolicy::Never,
           "and back again");

    auto doc = juce::JSON::parse (R"({"exportSettings":{"restoreHardware":"always"}})");
    check (ce::readPanelRestorePolicy (doc) == ce::RestorePolicy::Always, "read from a panel document");
    check (ce::readPanelRestorePolicy (juce::JSON::parse ("{}")) == ce::RestorePolicy::Ask,
           "a panel with no exportSettings means ask");
    check (ce::readPanelRestorePolicy (juce::var()) == ce::RestorePolicy::Ask,
           "and so does no document at all");
}

void testTheThreePolicies()
{
    std::cout << "\nThe three policies" << std::endl;

    auto always = base();
    always.policy = ce::RestorePolicy::Always;
    expect (always, ce::RestoreAction::Send, "always pushes without asking");

    auto never = base();
    never.policy = ce::RestorePolicy::Never;
    expect (never, ce::RestoreAction::Abandon, "never does not push");

    expect (base(), ce::RestoreAction::Ask, "ask raises the question");

    // Never is checked before readiness on purpose: a policy of never means the question is
    // settled, so waiting thirty seconds for a device it will not use is pointless work and a
    // pending flag left set.
    auto neverNoDevice = never;
    neverNoDevice.deviceReady = false;
    expect (neverNoDevice, ce::RestoreAction::Abandon, "never does not even wait for the device");
}

void testReadiness()
{
    std::cout << "\nWaiting for the device" << std::endl;

    // The core constraint: setStateInformation can arrive before the ports are open, so the push
    // has to wait rather than fire into nothing.
    auto notReady = base();
    notReady.policy = ce::RestorePolicy::Always;
    notReady.deviceReady = false;
    expect (notReady, ce::RestoreAction::Wait, "a device that is not ready yet is waited for");

    notReady.waitedMs = 29000.0;
    expect (notReady, ce::RestoreAction::Wait, "still waiting just before the deadline");

    notReady.waitedMs = 30000.0;
    expect (notReady, ce::RestoreAction::Abandon, "a device that never turns up is given up on");

    auto noDeadline = notReady;
    noDeadline.readyTimeoutMs = 0.0;
    expect (noDeadline, ce::RestoreAction::Wait, "a zero deadline waits indefinitely");

    // Asking before the device is ready would offer a choice that cannot be carried out.
    auto askNotReady = base();
    askNotReady.deviceReady = false;
    expect (askNotReady, ce::RestoreAction::Wait, "the question is not asked before the device is ready");
}

void testTheQuestion()
{
    std::cout << "\nAsking, and remembering the answer" << std::endl;

    // With the editor closed there is nowhere to put the question. The pending restore holds: the
    // patch is still not on the synth, so a user who opens the window later should still be asked.
    auto closed = base();
    closed.windowOpen = false;
    expect (closed, ce::RestoreAction::Wait, "the question waits for a window to ask it in");

    // And it is NOT timed out. An unanswered question is a restore waiting on a person, not a
    // stalled one — dropping it after thirty seconds would silently lose the patch.
    closed.waitedMs = 600000.0;
    expect (closed, ce::RestoreAction::Wait, "ten minutes with the window closed still holds the restore");

    auto asked = base();
    asked.promptAlreadySent = true;
    expect (asked, ce::RestoreAction::Wait, "the question is asked once, not once per tick");

    auto answeredYes = asked;
    answeredYes.rememberedAnswer = "always";
    expect (answeredYes, ce::RestoreAction::Send, "an answered yes pushes");

    auto answeredNo = asked;
    answeredNo.rememberedAnswer = "never";
    expect (answeredNo, ce::RestoreAction::Abandon, "an answered no stops");

    // The person at the desk outranks the panel author: the author states a default, the user
    // states a decision, and the decision was made about the hardware actually plugged in.
    auto overridden = base();
    overridden.policy = ce::RestorePolicy::Always;
    overridden.rememberedAnswer = "never";
    expect (overridden, ce::RestoreAction::Abandon, "a remembered never beats a panel that says always");

    auto caseInsensitive = asked;
    caseInsensitive.rememberedAnswer = "ALWAYS";
    expect (caseInsensitive, ce::RestoreAction::Send, "the remembered answer is not case-sensitive");
}

void testNothingToSend()
{
    std::cout << "\nNothing to restore" << std::endl;

    // A panel with no device-bound parameters has nothing to push. Asking "restore the hardware?"
    // and then sending nothing is the worst of both: a dialog and no effect.
    auto empty = base();
    empty.hasParametersToSend = false;
    expect (empty, ce::RestoreAction::Abandon, "a panel that binds nothing does not ask");

    auto emptyAlways = empty;
    emptyAlways.policy = ce::RestorePolicy::Always;
    expect (emptyAlways, ce::RestoreAction::Abandon, "not even under always");
}

void testEveryVerdictExplainsItself()
{
    std::cout << "\nEvery verdict says why" << std::endl;

    // A restore that silently did not happen is the failure this whole feature exists to prevent,
    // so the reason string is part of the contract rather than a debugging nicety.
    const ce::RestoreSituation cases[] = {
        base(),
        [] { auto s = base(); s.policy = ce::RestorePolicy::Never; return s; }(),
        [] { auto s = base(); s.deviceReady = false; return s; }(),
        [] { auto s = base(); s.hasParametersToSend = false; return s; }(),
        [] { auto s = base(); s.policy = ce::RestorePolicy::Always; return s; }(),
        [] { auto s = base(); s.windowOpen = false; return s; }(),
    };

    bool allExplained = true;
    for (const auto& situation : cases)
        if (ce::decideRestore (situation).reason.isEmpty())
            allExplained = false;

    check (allExplained, "no verdict comes back without a reason");
}
} // namespace

int main()
{
    std::cout << "RestorePolicy tests" << std::endl;

    testPolicyParsing();
    testTheThreePolicies();
    testReadiness();
    testTheQuestion();
    testNothingToSend();
    testEveryVerdictExplainsItself();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
