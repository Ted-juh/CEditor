#include "CompiledPattern.h"
#include <algorithm>

namespace ceditor::perf
{

namespace
{
    /** Where a step lands, in quarter notes from the top of the lane's loop, once swing and
        microtiming have had their say. Swing delays the odd steps of the lane's own grid,
        which is what every groove box means by it. */
    double stepPosition (int stepIndex, double stepPpq, float swing, float microtiming) noexcept
    {
        auto position = (double) stepIndex * stepPpq;
        if (swing > 0.0f && (stepIndex % 2) == 1)
            position += stepPpq * (double) swing * 0.5;
        position += (double) microtiming * stepPpq;
        return juce::jmax (0.0, position);
    }

    /** How long a note runs: its gate, plus every tied step that follows it. A tie is the
        editor's way of saying "and hold", so it belongs in the duration, not in playback. */
    double noteDuration (const Lane& lane, int stepIndex, double stepPpq) noexcept
    {
        const auto& step = lane.steps.getReference (stepIndex);
        auto duration = (double) step.gate * stepPpq;

        for (int next = stepIndex + 1; next < lane.steps.size(); ++next)
        {
            const auto& following = lane.steps.getReference (next);
            if (! following.tie)
                break;
            duration += stepPpq;
        }

        return juce::jmax (stepPpq * 0.02, duration);
    }

    void addNoteEvents (CompiledLane& compiled, const Lane& lane, const Pattern& pattern,
                        int stepIndex, int noteNumber, double stepPpq)
    {
        const auto& step = lane.steps.getReference (stepIndex);
        const auto base = stepPosition (stepIndex, stepPpq, pattern.swing, step.microtiming);
        const auto ratchets = juce::jlimit (1, 8, step.ratchets);
        const auto full = noteDuration (lane, stepIndex, stepPpq);
        // Ratchets share the step: each retrigger gets its slice, gated like the original.
        const auto slice = stepPpq / (double) ratchets;
        const auto duration = ratchets > 1 ? juce::jmin (full, slice * 0.9) : full;

        for (int r = 0; r < ratchets; ++r)
        {
            CompiledEvent event;
            event.ppq = base + slice * (double) r;
            event.durationPpq = duration;
            event.type = CompiledEventType::note;
            event.channel = (juce::uint8) juce::jlimit (1, 16, lane.channel);
            event.data1 = (juce::uint8) juce::jlimit (0, 127, noteNumber);
            event.data2 = (juce::uint8) juce::jlimit (1, 127, step.velocity);
            event.probability = (juce::uint8) juce::jlimit (0, 100, step.probability);
            event.conditionEvery = (juce::uint8) juce::jlimit (1, 16, step.conditionEvery);
            event.conditionOffset = (juce::uint8) juce::jlimit (0, 15, step.conditionOffset);
            // Each event rolls its own dice, but from the pattern's seed: reproducible, and
            // not correlated between steps the way a single stream would be.
            event.seed = deterministicRoll (pattern.seed, stepIndex,
                                            noteNumber * 31 + r * 7 + (int) lane.laneId.hashCode());
            compiled.events.push_back (event);
        }
    }
}

std::unique_ptr<CompiledSong> compileSong (const juce::Array<Pattern>& patterns,
                                           const juce::Array<Clip>& clips,
                                           const CompileContext& context)
{
    auto song = std::make_unique<CompiledSong>();
    song->patterns.reserve ((size_t) patterns.size());

    for (const auto& pattern : patterns)
    {
        CompiledPattern compiledPattern;
        compiledPattern.patternId = pattern.patternId;
        compiledPattern.lengthPpq = pattern.lengthPpq();

        for (const auto& lane : pattern.lanes)
        {
            CompiledLane compiled;
            compiled.type = lane.type;
            compiled.lengthPpq = lane.lengthPpq();
            compiled.muted = lane.muted;
            compiled.glide = lane.glide;

            if (lane.type == LaneType::parameter)
            {
                // An automation lane resolves to a row, or to nothing — and "nothing" is a
                // marked lane that plays silence, never a lane retargeted by name.
                const bool resolves = context.parameterResolves != nullptr
                                        && context.parameterResolves (lane.targetId, lane.parameterId,
                                                                      lane.targetCeId);
                if (resolves)
                {
                    compiled.targetIndex = (int) song->parameterTargets.size();
                    song->parameterTargets.push_back ({ lane.targetId, lane.parameterId });
                }
            }
            else
            {
                compiled.partIndex = context.partIndexFor != nullptr
                                       ? context.partIndexFor (lane.targetPartId) : -1;
            }

            const auto stepPpq = 1.0 / (double) juce::jmax (1, lane.stepsPerBeat);

            for (int i = 0; i < lane.steps.size(); ++i)
            {
                const auto& step = lane.steps.getReference (i);
                if (! step.active || step.tie)
                    continue;   // a tie is duration on the step before it, never an event

                switch (lane.type)
                {
                    case LaneType::note:
                        addNoteEvents (compiled, lane, pattern, i, step.note, stepPpq);
                        break;

                    case LaneType::drum:
                        addNoteEvents (compiled, lane, pattern, i, lane.drumNote, stepPpq);
                        break;

                    case LaneType::chord:
                    {
                        addNoteEvents (compiled, lane, pattern, i, step.note, stepPpq);
                        for (const auto extra : step.chordNotes)
                            if (extra != step.note)
                                addNoteEvents (compiled, lane, pattern, i, extra, stepPpq);
                        break;
                    }

                    case LaneType::cc:
                    case LaneType::parameter:
                    {
                        CompiledEvent event;
                        event.ppq = stepPosition (i, stepPpq, pattern.swing, step.microtiming);
                        event.type = lane.type == LaneType::cc ? CompiledEventType::controller
                                                               : CompiledEventType::parameter;
                        event.channel = (juce::uint8) juce::jlimit (1, 16, lane.channel);
                        event.data1 = (juce::uint8) juce::jlimit (0, 127, lane.ccNumber);
                        event.data2 = (juce::uint8) juce::jlimit (0, 127,
                                                                  juce::roundToInt (step.value * 127.0f));
                        event.value = juce::jlimit (0.0f, 1.0f, step.value);
                        event.probability = (juce::uint8) juce::jlimit (0, 100, step.probability);
                        event.conditionEvery = (juce::uint8) juce::jlimit (1, 16, step.conditionEvery);
                        event.conditionOffset = (juce::uint8) juce::jlimit (0, 15, step.conditionOffset);
                        event.seed = deterministicRoll (pattern.seed, i, (int) lane.laneId.hashCode());
                        compiled.events.push_back (event);
                        break;
                    }
                }
            }

            std::stable_sort (compiled.events.begin(), compiled.events.end(),
                              [] (const CompiledEvent& a, const CompiledEvent& b)
                              { return a.ppq < b.ppq; });

            compiledPattern.lanes.push_back (std::move (compiled));
        }

        song->patterns.push_back (std::move (compiledPattern));
    }

    song->clips.reserve ((size_t) clips.size());
    for (const auto& clip : clips)
    {
        CompiledClip compiled;
        compiled.clipId = clip.clipId;
        compiled.patternIndex = song->indexOfPattern (clip.patternId);
        compiled.launchQuantize = clip.launchQuantize;
        compiled.loop = clip.loop;
        compiled.followAfterLoops = clip.followAfterLoops;
        song->clips.push_back (std::move (compiled));
    }

    // Follow targets resolve after every clip exists, so a clip may follow one declared later.
    for (size_t i = 0; i < song->clips.size(); ++i)
        song->clips[i].followClipIndex = song->indexOfClip (clips.getReference ((int) i).followClipId);

    return song;
}

} // namespace ceditor::perf
