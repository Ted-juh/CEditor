// QuitGateTests — CEditor asks the page before it quits (QuitGate.h).
//
// Two failures to design against, and they are not alike:
//
//   QUITTING OVER UNSAVED WORK. What this exists to stop: the page is asked, and while it is asking
//   the person nothing quits, however long they take.
//
//   NOT QUITTING AT ALL. Worse in its way: a page that never answers (not loaded, hung, the event
//   not delivered) would leave a window that cannot be closed. Without an answer in time, the quit
//   goes ahead, as it always did.

#include "QuitGate.h"
#include <iostream>
#include <vector>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

/** Time, by hand: what the gate scheduled, run when the test says. */
struct Clock
{
    std::vector<std::function<void()>> due;
    void runAll() { auto now = std::move (due); due.clear(); for (auto& f : now) f(); }
};
} // namespace

int main()
{
    std::cout << "QuitGate" << std::endl;

    {
        Clock clock;
        int asked = 0, quits = 0;
        ceditor::QuitGate gate ([&] { ++asked; return true; }, [&] (int, std::function<void()> f) { clock.due.push_back (std::move (f)); });
        gate.request ([&] { ++quits; });
        check (asked == 1 && quits == 0, "the page is asked, and nothing quits yet");
        gate.answer ("asking");
        clock.runAll();
        check (quits == 0, "while the page is asking the person, the time limit does not quit");
        gate.answer ("quit");
        check (quits == 1 && ! gate.isPending(), "the page's \"quit\" quits, once");
        gate.answer ("quit");
        check (quits == 1, "a second \"quit\" with nothing pending does nothing");
    }

    {
        Clock clock;
        int quits = 0;
        ceditor::QuitGate gate ([&] { return true; }, [&] (int, std::function<void()> f) { clock.due.push_back (std::move (f)); });
        gate.request ([&] { ++quits; });
        gate.answer ("asking");
        gate.answer ("stay");
        check (quits == 0 && ! gate.isPending(), "\"stay\" keeps the program open and drops the request");
        clock.runAll();
        check (quits == 0, "a dropped request's time limit does nothing");
    }

    {
        Clock clock;
        int quits = 0;
        ceditor::QuitGate gate ([&] { return true; }, [&] (int, std::function<void()> f) { clock.due.push_back (std::move (f)); });
        gate.request ([&] { ++quits; });
        clock.runAll();
        check (quits == 1, "a page that does not answer in time does not keep the program open");
    }

    {
        int quits = 0;
        ceditor::QuitGate gate ([&] { return false; }, [&] (int, std::function<void()>) {});
        gate.request ([&] { ++quits; });
        check (quits == 1, "with no page to ask, the program quits at once");
    }

    {
        Clock clock;
        int quits = 0;
        ceditor::QuitGate gate ([&] { return true; }, [&] (int, std::function<void()> f) { clock.due.push_back (std::move (f)); });
        gate.request ([&] { ++quits; });
        gate.answer ("asking");
        // The close button again while the page is asking: asked again, still not quit.
        gate.request ([&] { ++quits; });
        gate.answer ("asking");
        clock.runAll();
        check (quits == 0, "a second close while the page is asking does not quit behind its back");
        gate.answer ("nonsense");
        check (quits == 0 && gate.isPending(), "an answer the gate does not know changes nothing");
        gate.answer ("quit");
        check (quits == 1, "and the answer, when it comes, quits once");
    }

    {
        Clock clock;
        int quits = 0;
        {
            ceditor::QuitGate gate ([&] { return true; }, [&] (int, std::function<void()> f) { clock.due.push_back (std::move (f)); });
            gate.request ([&] { ++quits; });
        }
        clock.runAll();
        check (quits == 0, "a time limit that outlives its gate touches nothing");
    }

    std::cout << (failures == 0 ? "All QuitGate tests passed." : "QuitGate tests FAILED.") << std::endl;
    return failures == 0 ? 0 : 1;
}
