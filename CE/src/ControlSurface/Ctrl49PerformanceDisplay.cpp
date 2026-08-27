#include "Ctrl49PerformanceDisplay.h"

#include <cmath>

namespace ceditor::ctrl49
{

namespace
{
    void appendString (Bytes& out, const std::string& s)
    {
        const auto length = s.size() > 255 ? std::size_t { 255 } : s.size();
        out.push_back (static_cast<std::uint8_t> (length));
        for (std::size_t i = 0; i < length; ++i)
        {
            const auto byte = static_cast<std::uint8_t> (s[i]);
            out.push_back (byte < 0x80 ? byte : static_cast<std::uint8_t> ('?'));
        }
    }

    int clamp127 (int value)
    {
        return value < 0 ? 0 : (value > 127 ? 127 : value);
    }

    std::string wholeNumber (double value)
    {
        const auto rounded = static_cast<long long> (std::llround (value));
        return std::to_string (rounded);
    }
} // namespace

std::string buildPerformanceTitle (const PerformanceTransportView& transport)
{
    // ">" and "#" rather than the usual glyphs: the display is ASCII, and a '?' where the
    // play symbol should be is worse than a character that reads as one.
    std::string title = transport.playing ? ">" : "#";
    title += " " + std::to_string (transport.bar) + "." + std::to_string (transport.beat);
    title += " " + wholeNumber (transport.tempo);

    if (transport.clockLost)
        title += " NO CLK";
    else if (transport.externalClock)
        title += " EXT";

    return title;
}

Bytes buildPerformanceLabelPayload (const PerformanceTransportView& transport,
                                    const PerformanceClipViews& clips)
{
    Bytes out;
    appendString (out, buildPerformanceTitle (transport));

    for (const auto& clip : clips)
    {
        if (clip.name.empty())
        {
            appendString (out, std::string());
            continue;
        }
        appendString (out, clip.pending ? ">" + clip.name : clip.name);
    }

    return out;
}

Bytes buildPerformanceStatePayload (int page, int activeClip, const PerformanceClipViews& clips)
{
    Bytes result (22, 0);
    result[0] = static_cast<std::uint8_t> (clamp127 (page));
    result[1] = static_cast<std::uint8_t> (clamp127 (activeClip));

    for (std::size_t clip = 0; clip < clips.size(); ++clip)
    {
        const auto phase = clips[clip].phase < 0.0f ? 0.0f
                            : (clips[clip].phase > 1.0f ? 1.0f : clips[clip].phase);
        result[6 + clip] = static_cast<std::uint8_t> (clamp127 (static_cast<int> (phase * 127.0f)));
        result[14 + clip] = clips[clip].active || clips[clip].pending ? 1 : 0;
    }

    return result;
}

} // namespace ceditor::ctrl49
