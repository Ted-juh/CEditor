#pragma once
//
// TimerManager — message-thread multiplexer for named script timers (Milestone: timer subsystem).
//
// Backs the panel API's startTimer(id, ms) / stopTimer(id) / onTimer events. One juce::Timer ticks
// and fires each due named timer's callback. Timers REPEAT by default (matches the timer-system
// design: a bare startTimer(id, ms) fires every ms until stopped). Scheduling is fixed-rate with
// drift compensation: missed fires are coalesced to a single fire and the schedule realigns.
//
// THREADING: all methods run on the JUCE message thread (juce::Timer callbacks are message-thread),
// matching the ScriptRuntime threading contract. The fire callback is invoked on the message thread.
//
// Reentrancy: a fired callback may start/stop timers (including itself); the tick snapshots the due
// ids before firing, so mutation during firing is safe.
//
// See CE/web/src/CE_Application/docs/timer-system.md.

#include <juce_events/juce_events.h>
#include <functional>
#include <vector>

namespace ceditor::scripting
{

class TimerManager final : private juce::Timer
{
public:
    /** Invoked (message thread) when a named timer fires. */
    using FireCallback = std::function<void (const juce::String& id)>;

    void setFireCallback (FireCallback cb) { onFire = std::move (cb); }

    /** Start, or reconfigure + restart, a timer. intervalMs is clamped to a minimum.
        Repeats by default; `once` fires a single time and removes itself. */
    void start (const juce::String& id, int intervalMs, bool once = false)
    {
        const auto interval = (juce::uint32) juce::jmax (kMinIntervalMs, intervalMs);
        const auto now = juce::Time::getMillisecondCounter();

        for (auto& t : timers)
        {
            if (t.id == id)
            {
                t.intervalMs = interval;
                t.nextDue = now + interval;
                t.once = once;
                ensureTicking();
                return;
            }
        }

        timers.push_back ({ id, interval, now + interval, once });
        ensureTicking();
    }

    void stop (const juce::String& id)
    {
        for (int i = (int) timers.size(); --i >= 0;)
            if (timers[(size_t) i].id == id)
                timers.erase (timers.begin() + i);

        if (timers.empty())
            stopTimer();
    }

    void stopAll()
    {
        timers.clear();
        stopTimer();
    }

private:
    struct Entry { juce::String id; juce::uint32 intervalMs; juce::uint32 nextDue; bool once = false; };

    static constexpr int kMinIntervalMs = 5;   // practical message-thread floor
    static constexpr int kTickMs        = 5;   // internal poll resolution

    void ensureTicking()
    {
        if (! isTimerRunning())
            startTimer (kTickMs);
    }

    void timerCallback() override
    {
        const auto now = juce::Time::getMillisecondCounter();

        // Snapshot the ids that are due BEFORE firing, so callbacks may safely mutate `timers`.
        juce::StringArray due;
        juce::StringArray finished;   // one-shots that just fired
        for (auto& t : timers)
        {
            if (now >= t.nextDue)
            {
                due.add (t.id);
                if (t.once)
                {
                    finished.add (t.id);
                    continue;
                }
                t.nextDue += t.intervalMs;             // fixed-rate advance
                if (now >= t.nextDue)                   // fell behind (missed fires) -> coalesce + realign
                    t.nextDue = now + t.intervalMs;
            }
        }

        // Remove finished one-shots BEFORE firing, so a callback restarting the same id wins.
        for (const auto& id : finished)
            stop (id);

        for (const auto& id : due)
            if (onFire)
                onFire (id);
    }

    std::vector<Entry> timers;
    FireCallback onFire;
};

} // namespace ceditor::scripting
