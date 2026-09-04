#pragma once

#include <vector>
#include <functional>
#include "PatternModel.h"

// CompiledPattern — the real-time half of the Stage 6 event engine (baseline §18.8.4).
//
// The editable model (PatternModel.h) is convenient for people and hostile to an audio
// thread: strings, arrays that grow, conditions expressed as intent. This is what the
// scheduler actually reads — flat vectors of plain structs, everything pre-resolved, sorted
// by musical position, allocated once on the message thread and thereafter read-only.
//
// WHAT THE COMPILER DECIDES, so the audio thread never has to:
//   ties        fold into the previous event's duration
//   ratchets    expand into that many shorter events
//   microtiming and swing are already in the event's ppq
//   targets     are already an index (a part slot, a parameter-target row) — no string lookup
//
// WHAT STAYS FOR PLAYBACK, because it depends on which loop we are in:
//   probability and conditions, rolled from the pattern's seed with the loop index — so the
//   same seed reproduces the same performance (§18.8.13) rather than being merely random.
//
// POLYMETER IS FREE HERE. Each lane keeps its own loop length and wraps independently; a
// 7-step lane against a 16-step lane is not a special case, it is two lanes with different
// lengthPpq.

namespace ceditor::perf
{

enum class CompiledEventType : juce::uint8
{
    note = 0,     // data1 = note, data2 = velocity, durationPpq = how long it holds
    controller,   // data1 = cc number, data2 = value
    parameter,    // targetIndex + value: leaves through the parameter FIFO, not MIDI
};

struct CompiledEvent
{
    double ppq = 0.0;             // position inside the lane's own loop
    double durationPpq = 0.0;     // notes only
    CompiledEventType type = CompiledEventType::note;
    juce::uint8 channel = 1;
    juce::uint8 data1 = 60;
    juce::uint8 data2 = 100;
    float value = 0.0f;           // parameter events
    juce::uint8 probability = 100;
    juce::uint8 conditionEvery = 1;
    juce::uint8 conditionOffset = 0;
    juce::uint32 seed = 1;        // per-event, already mixed with the pattern's seed
};

struct CompiledLane
{
    LaneType type = LaneType::note;
    double lengthPpq = 4.0;
    int stepCount = 16;           // kept so capture can snap a played note to this lane's grid
    int stepsPerBeat = 4;
    bool muted = false;
    bool glide = false;
    int partIndex = -1;           // resolved rack slot for MIDI lanes; -1 = unresolved
    int targetIndex = -1;         // resolved row in CompiledSong::parameterTargets; -1 = unresolved
    std::vector<CompiledEvent> events;   // sorted by ppq
};

struct CompiledPattern
{
    juce::String patternId;
    double lengthPpq = 4.0;       // the longest lane: what "one loop of this clip" means
    std::vector<CompiledLane> lanes;
};

struct CompiledClip
{
    enum class FollowAction : juce::uint8 { none = 0, clip, next, random, stop };

    juce::String clipId;
    int patternIndex = -1;        // -1 = the clip names a pattern that is gone
    int fillPatternIndex = -1;    // related pattern rendered only while the fill is held
    Quantize launchQuantize = Quantize::bar;
    bool loop = true;
    int followClipIndex = -1;
    int followAfterLoops = 0;
    FollowAction followAction = FollowAction::none;
    juce::uint32 followSeed = 1;
    bool bypassMidiFx = false;     // rendered/frozen events join after the part's MIDI chain
};

/** One resolved automation destination. The strings stay here for the message thread to read
    back when it drains events; the audio thread only ever handles the index. */
struct CompiledParameterTarget
{
    juce::String targetId;
    juce::String parameterId;
};

/** Everything the scheduler needs for one Performance, built as a unit so a swap is atomic.
    Immutable once published: the compiler builds a new one and hands the pointer over. */
struct CompiledSong
{
    std::vector<CompiledPattern> patterns;
    std::vector<CompiledClip> clips;
    std::vector<CompiledParameterTarget> parameterTargets;

    int indexOfClip (const juce::String& clipId) const
    {
        for (size_t i = 0; i < clips.size(); ++i)
            if (clips[i].clipId == clipId)
                return (int) i;
        return -1;
    }

    int indexOfPattern (const juce::String& patternId) const
    {
        for (size_t i = 0; i < patterns.size(); ++i)
            if (patterns[i].patternId == patternId)
                return (int) i;
        return -1;
    }
};

/** How the compiler turns document ids into the indices the audio thread uses. Both run on
    the message thread, during compilation only. */
struct CompileContext
{
    /** Rack slot for a partId, or -1 when the part is gone. */
    std::function<int (const juce::String&)> partIndexFor;
    /** True when (targetId, parameterId) resolves right now AND still carries the class the
        lane was authored against — the Stage 2 honesty rule, applied to automation
        (§18.8.7): an unresolved lane is marked, never retargeted by name. */
    std::function<bool (const juce::String& targetId, const juce::String& parameterId,
                        const juce::String& expectedCeId)> parameterResolves;
};

/** Compiles patterns and clips into the real-time form. Never called from the audio thread. */
std::unique_ptr<CompiledSong> compileSong (const juce::Array<Pattern>& patterns,
                                           const juce::Array<Clip>& clips,
                                           const CompileContext& context);

/** The deterministic roll behind probability and conditions: pure, seeded, and stable across
    runs and machines, so "seed 42" is a performance you can rehearse. */
inline juce::uint32 deterministicRoll (juce::uint32 seed, int loopIndex, int salt) noexcept
{
    // A small integer hash (Wang/Jenkins style): cheap, allocation-free, well distributed.
    juce::uint32 h = seed ^ (juce::uint32) (loopIndex * 0x9e3779b9) ^ (juce::uint32) (salt * 0x85ebca6b);
    h ^= h >> 16; h *= 0x7feb352d;
    h ^= h >> 15; h *= 0x846ca68b;
    h ^= h >> 16;
    return h;
}

/** True when an event with this probability and condition plays on `loopIndex`. */
inline bool eventPlaysOnLoop (const CompiledEvent& event, int loopIndex, int salt) noexcept
{
    if (event.conditionEvery > 1)
    {
        const auto every = (int) event.conditionEvery;
        const auto offset = (int) event.conditionOffset % every;
        if (((loopIndex % every) + every) % every != offset)
            return false;
    }

    if (event.probability >= 100)
        return true;
    if (event.probability == 0)
        return false;

    return (deterministicRoll (event.seed, loopIndex, salt) % 100u) < (juce::uint32) event.probability;
}

} // namespace ceditor::perf
