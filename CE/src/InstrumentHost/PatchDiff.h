#pragma once

#include <juce_core/juce_core.h>
#include <vector>

// PatchDiff — what changed between two captured hardware patches.
//
// Total recall keeps a synth's patch as the bytes it sent, deliberately unread: no profile, no
// field names, and that is what makes it work for every synth ever made. This is the one thing
// that can be said about those bytes without understanding them — WHERE two dumps of the same
// synth differ — and it turns out to be most of what a person wants to know. "Is the patch on
// the part the one I saved?" is answered by `identical`. "What did I change since?" is a short
// list of offsets, which a person who knows the synth can read against its manual, and which
// the Capture Session reads against nothing at all: a byte that moves when one knob moves is
// that knob's address.
//
// Messages are compared one against one, in order, because a multi-message dump is one message
// per bank slot or per parameter block and a byte at the same offset in the same message means
// the same thing. Comparing the concatenation would report a one-byte length change as every
// byte after it having changed, which is true and useless.
//
// juce_core only, so a plain test executable can prove it.

namespace ceditor::host::patchDiff
{

struct Difference
{
    int message = 0;     // which system-exclusive message, 0-based
    int offset = 0;      // byte offset within that message, counting the F0
    int before = -1;     // the byte in A, or -1 when A has no byte there
    int after = -1;      // the byte in B, or -1 when B has no byte there
};

struct Result
{
    int messagesA = 0, messagesB = 0;
    int bytesA = 0, bytesB = 0;
    bool identical = false;
    int totalDifferences = 0;              // every differing byte, counted
    bool truncated = false;                // the list below stopped at the cap
    juce::Array<Difference> differences;   // the first `cap` of them, in order
};

/** F0 … F7 spans, as (offset, length) pairs. Anything outside a pair is skipped; an
    unterminated tail is dropped, as the service's own splitter drops it. */
inline std::vector<std::pair<size_t, size_t>> messageSpans (const juce::MemoryBlock& blob)
{
    std::vector<std::pair<size_t, size_t>> spans;
    const auto* bytes = static_cast<const juce::uint8*> (blob.getData());
    const auto size = (size_t) blob.getSize();

    for (size_t i = 0; i < size;)
    {
        if (bytes[i] != 0xf0) { ++i; continue; }
        size_t end = i + 1;
        while (end < size && bytes[end] != 0xf7)
            ++end;
        if (end >= size)
            break;
        spans.emplace_back (i, end - i + 1);
        i = end + 1;
    }
    return spans;
}

inline Result compare (const juce::MemoryBlock& a, const juce::MemoryBlock& b, int cap = 512)
{
    Result result;
    const auto spansA = messageSpans (a);
    const auto spansB = messageSpans (b);
    const auto* bytesA = static_cast<const juce::uint8*> (a.getData());
    const auto* bytesB = static_cast<const juce::uint8*> (b.getData());

    result.messagesA = (int) spansA.size();
    result.messagesB = (int) spansB.size();
    for (const auto& span : spansA) result.bytesA += (int) span.second;
    for (const auto& span : spansB) result.bytesB += (int) span.second;

    const auto note = [&result, cap] (int message, int offset, int before, int after)
    {
        ++result.totalDifferences;
        if (result.differences.size() < cap)
            result.differences.add ({ message, offset, before, after });
        else
            result.truncated = true;
    };

    const auto messages = juce::jmax (spansA.size(), spansB.size());
    for (size_t m = 0; m < messages; ++m)
    {
        const auto hasA = m < spansA.size();
        const auto hasB = m < spansB.size();
        const auto lengthA = hasA ? spansA[m].second : 0;
        const auto lengthB = hasB ? spansB[m].second : 0;
        const auto longest = juce::jmax (lengthA, lengthB);

        for (size_t i = 0; i < longest; ++i)
        {
            const int before = (hasA && i < lengthA) ? bytesA[spansA[m].first + i] : -1;
            const int after  = (hasB && i < lengthB) ? bytesB[spansB[m].first + i] : -1;
            if (before != after)
                note ((int) m, (int) i, before, after);
        }
    }

    result.identical = result.totalDifferences == 0
                    && result.messagesA == result.messagesB
                    && result.bytesA == result.bytesB;
    return result;
}

inline juce::var toVar (const Result& result)
{
    juce::Array<juce::var> differences;
    for (const auto& d : result.differences)
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("message", d.message);
        obj->setProperty ("offset",  d.offset);
        obj->setProperty ("before",  d.before);
        obj->setProperty ("after",   d.after);
        differences.add (juce::var (obj));
    }

    auto* root = new juce::DynamicObject();
    root->setProperty ("identical",        result.identical);
    root->setProperty ("messagesA",        result.messagesA);
    root->setProperty ("messagesB",        result.messagesB);
    root->setProperty ("bytesA",           result.bytesA);
    root->setProperty ("bytesB",           result.bytesB);
    root->setProperty ("totalDifferences", result.totalDifferences);
    root->setProperty ("truncated",        result.truncated);
    root->setProperty ("differences",      differences);
    return juce::var (root);
}

} // namespace ceditor::host::patchDiff
