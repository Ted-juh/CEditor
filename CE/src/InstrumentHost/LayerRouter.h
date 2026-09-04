#pragma once

#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <utility>
#include <juce_audio_basics/juce_audio_basics.h>

// LayerRouter — one decision for every live note before the rack fans out to its parts.
//
// A round-robin decision cannot live in each part's filter: all of those filters see the same
// input and would each decide that they won. This router runs once in the upstream engine node,
// writes a private live-MIDI buffer for every grouped part, and remembers the winning parts so
// the matching note-off reaches exactly those destinations. Ungrouped parts keep seeing the
// original MIDI and therefore retain the old split/layer behaviour byte for byte.
//
// Continuous sources (CC, expression and macros) also publish an atomic gain per member. The
// part's existing ramped GainPanProcessor reads it later in the same graph pass, which makes a
// crossfade an audio fade rather than a velocity trick that only changes the next note.

namespace ceditor::host
{

class LayerRouter
{
public:
    static constexpr int maxParts = 64;
    static constexpr int maxGroups = 32;
    static constexpr int maxMembers = 8;

    enum class Allocation { all = 0, roundRobin, leastBusy };
    enum class Source { velocity = 0, key, cc, expression, macro };

    struct Member
    {
        int partIndex = -1;
        float minimum = 0.0f;
        float maximum = 1.0f;
        float crossfade = 0.0f;
    };

    struct Group
    {
        Allocation allocation = Allocation::all;
        Source source = Source::velocity;
        int controller = 11;
        std::uint64_t macroKey = 0;
        float initialSourceValue = 0.0f;
        int memberCount = 0;
        std::array<Member, maxMembers> members;
    };

    struct Configuration
    {
        int groupCount = 0;
        std::array<Group, maxGroups> groups;
        std::array<bool, maxParts> routed {};
    };

    LayerRouter()
    {
        for (auto& gain : partGains)
            gain.store (1.0f);
    }

    static std::uint64_t macroKeyFor (const juce::String& macroId) noexcept
    {
        return (std::uint64_t) macroId.hashCode64();
    }

    void prepare (int maximumExpectedSamplesPerBlock)
    {
        const auto bytes = (size_t) juce::jmax (256, maximumExpectedSamplesPerBlock * 4);
        for (auto& output : outputs)
            output.ensureSize (bytes);
    }

    /** Publishes a changed routing snapshot. Returns false when the requested snapshot is
        already pending, so callers do not panic held notes for unrelated rack edits. */
    bool setConfiguration (Configuration next)
    {
        next.groupCount = juce::jlimit (0, maxGroups, next.groupCount);
        for (int i = 0; i < next.groupCount; ++i)
            next.groups[(size_t) i].memberCount = juce::jlimit (
                0, maxMembers, next.groups[(size_t) i].memberCount);
        const juce::SpinLock::ScopedLockType lock (configurationLock);
        if (sameConfiguration (pendingConfiguration, next))
            return false;
        pendingConfiguration = std::move (next);
        ++pendingRevision;
        return true;
    }

    void setMacroSourceValue (const juce::String& macroId, float value)
    {
        const auto key = macroKeyFor (macroId);
        const juce::SpinLock::ScopedLockType lock (configurationLock);
        for (int i = 0; i < pendingConfiguration.groupCount; ++i)
            if (pendingConfiguration.groups[(size_t) i].source == Source::macro
                && pendingConfiguration.groups[(size_t) i].macroKey == key)
                macroValues[(size_t) i].store (juce::jlimit (0.0f, 1.0f, value));
    }

    bool routesPart (int partIndex) const noexcept
    {
        return juce::isPositiveAndBelow (partIndex, maxParts)
            && routedParts[(size_t) partIndex].load();
    }

    const juce::MidiBuffer& outputFor (int partIndex) const noexcept
    {
        static const juce::MidiBuffer empty;
        return juce::isPositiveAndBelow (partIndex, maxParts)
                 ? outputs[(size_t) partIndex] : empty;
    }

    float gainForPart (int partIndex) const noexcept
    {
        return juce::isPositiveAndBelow (partIndex, maxParts)
                 ? partGains[(size_t) partIndex].load() : 1.0f;
    }

    void process (const juce::MidiBuffer& input)
    {
        for (auto& output : outputs)
            output.clear();

        bool changed = false;
        {
            // The audio thread never waits for a layer edit. Missing one block is benign;
            // the old immutable audio-owned snapshot remains valid until the next try.
            const juce::SpinLock::ScopedTryLockType lock (configurationLock);
            if (lock.isLocked() && appliedRevision != pendingRevision)
            {
                activeConfiguration = pendingConfiguration;
                appliedRevision = pendingRevision;
                changed = true;
            }
        }

        const auto& current = activeConfiguration;
        if (changed)
        {
            assigned.fill (0);
            activeCounts.fill (0);
            roundRobin.fill (0);
            sourceValues.fill (0.0f);
            for (int part = 0; part < maxParts; ++part)
            {
                routedParts[(size_t) part].store (current.routed[(size_t) part]);
                partGains[(size_t) part].store (1.0f);
            }
            for (int group = 0; group < current.groupCount; ++group)
                macroValues[(size_t) group].store (
                    current.groups[(size_t) group].initialSourceValue);
        }

        // Continuous source gains update even in a MIDI-empty block (a surface macro is a
        // controlling-thread write and need not coincide with a note or controller event).
        updateContinuousGains (current);

        for (const auto metadata : input)
        {
            const auto message = metadata.getMessage();
            const auto position = metadata.samplePosition;

            if (message.isController())
                rememberController (current, message);

            if (message.isNoteOn())
            {
                routeNoteOn (current, message, position);
                continue;
            }
            if (message.isNoteOff())
            {
                routeNoteOff (message, position);
                continue;
            }

            // Every grouped member receives performance controllers, clocks and expression.
            // `routed` guarantees a part appears in at most one group, so this adds once.
            for (int part = 0; part < maxParts; ++part)
                if (current.routed[(size_t) part])
                    outputs[(size_t) part].addEvent (message, position);
        }

        updateContinuousGains (current);
    }

private:
    static bool sameConfiguration (const Configuration& a, const Configuration& b) noexcept
    {
        if (a.groupCount != b.groupCount || a.routed != b.routed)
            return false;

        for (int groupIndex = 0; groupIndex < a.groupCount; ++groupIndex)
        {
            const auto& left = a.groups[(size_t) groupIndex];
            const auto& right = b.groups[(size_t) groupIndex];
            if (left.allocation != right.allocation || left.source != right.source
                || left.controller != right.controller || left.macroKey != right.macroKey
                || left.initialSourceValue != right.initialSourceValue
                || left.memberCount != right.memberCount)
                return false;

            for (int memberIndex = 0; memberIndex < left.memberCount; ++memberIndex)
            {
                const auto& leftMember = left.members[(size_t) memberIndex];
                const auto& rightMember = right.members[(size_t) memberIndex];
                if (leftMember.partIndex != rightMember.partIndex
                    || leftMember.minimum != rightMember.minimum
                    || leftMember.maximum != rightMember.maximum
                    || leftMember.crossfade != rightMember.crossfade)
                    return false;
            }
        }
        return true;
    }

    static bool continuous (Source source) noexcept
    {
        return source == Source::cc || source == Source::expression || source == Source::macro;
    }

    static float memberWeight (const Member& member, float value) noexcept
    {
        const auto low = juce::jlimit (0.0f, 1.0f, member.minimum);
        const auto high = juce::jlimit (low, 1.0f, member.maximum);
        const auto fade = juce::jlimit (0.0f, 0.5f, member.crossfade);
        if (fade <= 0.0f)
            return value >= low && value <= high ? 1.0f : 0.0f;

        float lower = 1.0f, upper = 1.0f;
        if (low > 0.0f)
            lower = juce::jlimit (0.0f, 1.0f, (value - (low - fade)) / (2.0f * fade));
        if (high < 1.0f)
            upper = juce::jlimit (0.0f, 1.0f, ((high + fade) - value) / (2.0f * fade));
        return juce::jmin (lower, upper);
    }

    float sourceValue (const Group& group, int groupIndex,
                       const juce::MidiMessage& message) const noexcept
    {
        if (group.source == Source::velocity)
            return (float) message.getVelocity() / 127.0f;
        if (group.source == Source::key)
            return (float) message.getNoteNumber() / 127.0f;
        if (group.source == Source::macro)
            return macroValues[(size_t) groupIndex].load();
        return sourceValues[(size_t) groupIndex];
    }

    void rememberController (const Configuration& config, const juce::MidiMessage& message)
    {
        for (int groupIndex = 0; groupIndex < config.groupCount; ++groupIndex)
        {
            const auto& group = config.groups[(size_t) groupIndex];
            const auto expected = group.source == Source::expression ? 11 : group.controller;
            if ((group.source == Source::cc || group.source == Source::expression)
                && message.getControllerNumber() == expected)
                sourceValues[(size_t) groupIndex]
                    = (float) message.getControllerValue() / 127.0f;
        }
    }

    void sendOffMask (std::uint64_t mask, int channel, int note, int position)
    {
        for (int part = 0; part < maxParts; ++part)
            if ((mask & (std::uint64_t (1) << (unsigned) part)) != 0)
            {
                outputs[(size_t) part].addEvent (juce::MidiMessage::noteOff (channel, note),
                                                 position);
                activeCounts[(size_t) part] = juce::jmax (0, activeCounts[(size_t) part] - 1);
            }
    }

    void routeNoteOn (const Configuration& config, const juce::MidiMessage& message, int position)
    {
        const auto channel = message.getChannel();
        const auto note = message.getNoteNumber();
        const auto key = (size_t) ((channel - 1) * 128 + note);
        if (assigned[key] != 0)
            sendOffMask (assigned[key], channel, note, position);
        assigned[key] = 0;

        for (int groupIndex = 0; groupIndex < config.groupCount; ++groupIndex)
        {
            const auto& group = config.groups[(size_t) groupIndex];
            const auto value = sourceValue (group, groupIndex, message);
            std::array<float, maxMembers> weights {};
            std::array<int, maxMembers> eligible {};
            int eligibleCount = 0;
            for (int memberIndex = 0; memberIndex < group.memberCount; ++memberIndex)
            {
                const auto& member = group.members[(size_t) memberIndex];
                if (! juce::isPositiveAndBelow (member.partIndex, maxParts))
                    continue;
                weights[(size_t) memberIndex] = memberWeight (member, value);
                if (weights[(size_t) memberIndex] > 0.0f)
                    eligible[(size_t) eligibleCount++] = memberIndex;
            }

            std::uint64_t selected = 0;
            if (group.allocation == Allocation::all)
            {
                for (int memberIndex = 0; memberIndex < group.memberCount; ++memberIndex)
                    if (juce::isPositiveAndBelow (
                            group.members[(size_t) memberIndex].partIndex, maxParts)
                        && (continuous (group.source) || weights[(size_t) memberIndex] > 0.0f))
                        selected |= std::uint64_t (1)
                                 << (unsigned) group.members[(size_t) memberIndex].partIndex;
            }
            else if (eligibleCount > 0)
            {
                auto winner = eligible[(size_t) (roundRobin[(size_t) groupIndex]
                                                   % eligibleCount)];
                if (group.allocation == Allocation::leastBusy)
                    for (int i = 1; i < eligibleCount; ++i)
                    {
                        const auto candidate = eligible[(size_t) i];
                        const auto candidatePart = group.members[(size_t) candidate].partIndex;
                        const auto winnerPart = group.members[(size_t) winner].partIndex;
                        if (activeCounts[(size_t) candidatePart] < activeCounts[(size_t) winnerPart])
                            winner = candidate;
                    }
                ++roundRobin[(size_t) groupIndex];
                selected = std::uint64_t (1)
                         << (unsigned) group.members[(size_t) winner].partIndex;
            }

            for (int memberIndex = 0; memberIndex < group.memberCount; ++memberIndex)
            {
                const auto part = group.members[(size_t) memberIndex].partIndex;
                if (! juce::isPositiveAndBelow (part, maxParts))
                    continue;
                if ((selected & (std::uint64_t (1) << (unsigned) part)) == 0)
                    continue;
                auto routed = message;
                if (! continuous (group.source) && group.allocation == Allocation::all)
                {
                    const auto velocity = juce::jlimit (1, 127, juce::roundToInt (
                        (float) message.getVelocity() * weights[(size_t) memberIndex]));
                    routed = juce::MidiMessage::noteOn (channel, note, (juce::uint8) velocity);
                }
                outputs[(size_t) part].addEvent (routed, position);
                ++activeCounts[(size_t) part];
            }
            assigned[key] |= selected;
        }
    }

    void routeNoteOff (const juce::MidiMessage& message, int position)
    {
        const auto key = (size_t) ((message.getChannel() - 1) * 128
                                   + message.getNoteNumber());
        sendOffMask (assigned[key], message.getChannel(), message.getNoteNumber(), position);
        assigned[key] = 0;
    }

    void updateContinuousGains (const Configuration& config)
    {
        for (int groupIndex = 0; groupIndex < config.groupCount; ++groupIndex)
        {
            const auto& group = config.groups[(size_t) groupIndex];
            if (group.allocation != Allocation::all || ! continuous (group.source))
                continue;
            const auto value = group.source == Source::macro
                ? macroValues[(size_t) groupIndex].load()
                : sourceValues[(size_t) groupIndex];
            for (int memberIndex = 0; memberIndex < group.memberCount; ++memberIndex)
            {
                const auto& member = group.members[(size_t) memberIndex];
                if (juce::isPositiveAndBelow (member.partIndex, maxParts))
                    partGains[(size_t) member.partIndex].store (memberWeight (member, value));
            }
        }
    }

    juce::SpinLock configurationLock;
    Configuration pendingConfiguration;
    Configuration activeConfiguration;       // audio-thread owned after the try-lock copy
    std::uint64_t pendingRevision = 0;         // protected by configurationLock
    std::uint64_t appliedRevision = 0;         // audio-thread only
    std::array<juce::MidiBuffer, maxParts> outputs;
    std::array<std::atomic<bool>, maxParts> routedParts {};
    std::array<std::atomic<float>, maxParts> partGains;
    std::array<std::atomic<float>, maxGroups> macroValues {};
    std::array<float, maxGroups> sourceValues {};
    std::array<std::uint64_t, 16 * 128> assigned {};
    std::array<int, maxParts> activeCounts {};
    std::array<int, maxGroups> roundRobin {};
};

} // namespace ceditor::host
