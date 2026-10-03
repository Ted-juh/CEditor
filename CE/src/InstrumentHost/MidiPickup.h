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

    // The three ways controllers send an encoder turn as one CC value. Chosen per slot, never
    // guessed from a sweep: 1 and 127 mean +1/-1 in two's complement and "far down"/"far up"
    // in offset binary, so no single reading of a value is safe for every controller.
    //   twosComplement  1..63 = +n, 65..127 = n-128 (so 127 = -1). Includes the old 1/127 mode.
    //   offsetBinary    64 is rest, 65.. = +n, ..63 = -n.
    //   signMagnitude   bit 6 is the sign: 1..63 = +n, 65..127 = -(n-64).
    enum class RelativeFormat { twosComplement = 0, offsetBinary = 1, signMagnitude = 2 };
    static constexpr int relativeFormatCount = 3;

    static int relativeStep (int value, RelativeFormat format = RelativeFormat::twosComplement)
    {
        value &= 0x7F;
        switch (format)
        {
            case RelativeFormat::offsetBinary:  return value - 64;
            case RelativeFormat::signMagnitude: return value == 0 || value == 64 ? 0
                                                     : (value & 0x40) ? -(value & 0x3F) : (value & 0x3F);
            case RelativeFormat::twosComplement:
            default:                            return value == 0 || value == 64 ? 0
                                                     : value < 64 ? value : value - 128;
        }
    }
};
}
