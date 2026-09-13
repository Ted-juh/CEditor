#pragma once
#include <algorithm>
#include <cmath>

namespace ceditor::host
{
// Transient position memory, in the control's range/inversion-adjusted coordinates.
// Only learned absolute CCs use it; relative nudges and on-screen edits bypass it.
struct MidiPickup
{
    float previous = -1.0f;
    float observed = -1.0f;
    bool acquired = false;
    static constexpr float tolerance = 1.0f / 127.0f;

    bool targetChanged (float target) const
    { return observed >= 0.0f && std::abs (target - observed) > tolerance; }

    bool accept (float input, float target, float minimum, float maximum)
    {
        if (targetChanged (target))
        {
            acquired = previous >= 0.0f && std::abs (previous - target) <= tolerance;
            previous = -1.0f; // an old movement must not cross a newly recalled target
        }
        const bool crossed = previous >= 0.0f
            && target >= std::min (previous, input) && target <= std::max (previous, input);
        // Preserve crossings that occur entirely between two controller drains.
        acquired = acquired || crossed || std::abs (input - target) <= tolerance
            || (target >= minimum && target <= maximum);
        previous = input;
        observed = target;
        return acquired;
    }

    void written (float actual) { observed = actual; }
    int direction (float target) const
    {
        if (previous < 0.0f || (acquired && ! targetChanged (target))
            || std::abs (previous - target) <= tolerance) return 0;
        return previous < target ? 1 : -1;
    }

    // Explicit 1/127 relative mode; other encodings are never guessed from a sweep.
    static int relativeStep (int value) { return value == 1 ? 1 : value == 127 ? -1 : 0; }
};
}
