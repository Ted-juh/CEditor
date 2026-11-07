#pragma once

// QuitGate — the page is asked before CEditor quits.
//
// Quitting used to be immediate: the window's close button, Alt+F4 and File → Close Program all
// went straight to quit(), and every panel, script workspace, component and device profile with
// unsaved changes went with it (only the recovery copy survived). The documents live in the page,
// so the page is the one that can say what is unsaved; this is the native half of asking it.
//
//   native -> page   "quitRequested"
//   page -> native   "quitAnswer"  { answer: "asking" | "quit" | "stay" }
//
// "asking" says the page has the request and is asking the person (the answer may take as long as
// they take); "quit" runs the quit; "stay" drops it. A page that says nothing at all — not loaded,
// hung, or the request not delivered — must never keep the program open, so without an answer in
// `answerTimeoutMs` the quit goes ahead, as it always did.
//
// Pure logic over two injected functions (deliver the request, run something later), so
// tests/QuitGateTests.cpp drives it without a window or a message loop.

#include <juce_core/juce_core.h>
#include <functional>
#include <memory>

namespace ceditor
{
class QuitGate
{
public:
    using Action = std::function<void()>;
    using Schedule = std::function<void (int milliseconds, Action)>;

    /** `askPage` delivers "quitRequested" and returns whether there is a page to deliver it to. */
    QuitGate (std::function<bool()> askPageToUse, Schedule scheduleToUse, int answerTimeoutMsToUse = 4000)
        : askPage (std::move (askPageToUse)), schedule (std::move (scheduleToUse)), answerTimeoutMs (answerTimeoutMsToUse) {}

    ~QuitGate() { *alive = false; }

    /** The program wants to quit. `quitNow` runs when the page agrees, or when it does not answer. */
    void request (Action quitNow)
    {
        pending = std::move (quitNow);
        acknowledged = false;
        const auto serial = ++requestSerial;
        if (! askPage || ! askPage())
        {
            finish();
            return;
        }
        if (schedule)
        {
            schedule (answerTimeoutMs, [this, serial, alive = alive]
            {
                if (! *alive) return;
                if (serial == requestSerial && ! acknowledged) finish();
            });
        }
    }

    /** The page's answer. Anything else is ignored: a page cannot make the program quit by mistake. */
    void answer (const juce::String& what)
    {
        if (pending == nullptr) return;
        if (what == "asking")    acknowledged = true;
        else if (what == "quit") finish();
        else if (what == "stay") { pending = nullptr; acknowledged = false; ++requestSerial; }
    }

    bool isPending() const noexcept { return pending != nullptr; }

private:
    void finish()
    {
        if (pending == nullptr) return;
        auto quit = std::move (pending);
        pending = nullptr;
        ++requestSerial;
        quit();
    }

    std::function<bool()> askPage;
    Schedule schedule;
    int answerTimeoutMs;
    Action pending;
    bool acknowledged = false;
    int requestSerial = 0;
    std::shared_ptr<bool> alive = std::make_shared<bool> (true);
};
} // namespace ceditor
