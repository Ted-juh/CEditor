#include "PatternModel.h"
#include <algorithm>
#include <cmath>
#include <initializer_list>

namespace ceditor::perf
{

namespace
{
    int intOf (const juce::var& parent, const char* key, int def, int lo, int hi)
    {
        return juce::jlimit (lo, hi, (int) parent.getProperty (key, def));
    }

    float floatOf (const juce::var& parent, const char* key, float def, float lo, float hi)
    {
        return juce::jlimit (lo, hi, (float) (double) parent.getProperty (key, def));
    }

    // The scale table. Intervals from the root, in semitones; the names are the ones a
    // keyboard player would look for rather than a theory catalogue.
    struct ScaleDefinition { const char* name; std::initializer_list<int> degrees; };

    const std::initializer_list<ScaleDefinition> scaleTable
    {
        { "chromatic",       { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 } },
        { "major",           { 0, 2, 4, 5, 7, 9, 11 } },
        { "minor",           { 0, 2, 3, 5, 7, 8, 10 } },
        { "harmonic minor",  { 0, 2, 3, 5, 7, 8, 11 } },
        { "melodic minor",   { 0, 2, 3, 5, 7, 9, 11 } },
        { "dorian",          { 0, 2, 3, 5, 7, 9, 10 } },
        { "phrygian",        { 0, 1, 3, 5, 7, 8, 10 } },
        { "lydian",          { 0, 2, 4, 6, 7, 9, 11 } },
        { "mixolydian",      { 0, 2, 4, 5, 7, 9, 10 } },
        { "locrian",         { 0, 1, 3, 5, 6, 8, 10 } },
        { "pentatonic major",{ 0, 2, 4, 7, 9 } },
        { "pentatonic minor",{ 0, 3, 5, 7, 10 } },
        { "blues",           { 0, 3, 5, 6, 7, 10 } },
        { "whole tone",      { 0, 2, 4, 6, 8, 10 } },
    };
}

const char* laneTypeName (LaneType type) noexcept
{
    switch (type)
    {
        case LaneType::note:      return "note";
        case LaneType::chord:     return "chord";
        case LaneType::drum:      return "drum";
        case LaneType::cc:        return "cc";
        case LaneType::parameter: return "parameter";
    }
    return "note";
}

LaneType laneTypeFromName (const juce::String& name) noexcept
{
    for (int i = 0; i <= (int) LaneType::parameter; ++i)
        if (name == laneTypeName ((LaneType) i))
            return (LaneType) i;
    return LaneType::note;
}

const char* ArpSettings::modeName (Mode mode) noexcept
{
    switch (mode)
    {
        case Mode::up:     return "up";
        case Mode::down:   return "down";
        case Mode::upDown: return "up-down";
        case Mode::downUp: return "down-up";
        case Mode::order:  return "order";
        case Mode::random: return "random";
        case Mode::chord:   return "chord";
        case Mode::pattern: return "pattern";
    }
    return "up";
}

ArpSettings::Mode ArpSettings::modeFromName (const juce::String& name) noexcept
{
    for (int i = 0; i <= (int) Mode::pattern; ++i)
        if (name == modeName ((Mode) i))
            return (Mode) i;
    return Mode::up;
}

const char* MidiFxSettings::chordTypeName (ChordType type) noexcept
{
    switch (type)
    {
        case ChordType::off:                 return "off";
        case ChordType::powerFifth:          return "power fifth";
        case ChordType::triad:               return "triad";
        case ChordType::triadFirstInversion: return "triad (1st inv)";
        case ChordType::seventh:             return "seventh";
        case ChordType::octaveDouble:        return "octave";
        case ChordType::diatonic:            return "diatonic";
        case ChordType::diatonicSeventh:     return "diatonic 7th";
        case ChordType::keyChords:           return "custom keys";
    }
    return "off";
}

MidiFxSettings::ChordType MidiFxSettings::chordTypeFromName (const juce::String& name) noexcept
{
    for (int i = 0; i <= (int) ChordType::keyChords; ++i)
        if (name == chordTypeName ((ChordType) i))
            return (ChordType) i;
    return ChordType::off;
}

const char* MidiFxSettings::chordVoicingName (ChordVoicing voicing) noexcept
{
    switch (voicing)
    {
        case ChordVoicing::close: return "close";
        case ChordVoicing::open:  return "open";
        case ChordVoicing::drop2: return "drop 2";
        case ChordVoicing::wide:  return "wide";
    }
    return "close";
}

const char* MidiFxSettings::responseCurveName (ResponseCurve curve) noexcept
{
    switch (curve)
    {
        case ResponseCurve::soft:    return "soft";
        case ResponseCurve::hard:    return "hard";
        case ResponseCurve::sCurve:  return "s curve";
        case ResponseCurve::custom:  return "custom";
        case ResponseCurve::linear:
        default:                     return "linear";
    }
}

MidiFxSettings::ResponseCurve MidiFxSettings::responseCurveFromName (
    const juce::String& name) noexcept
{
    if (name == "soft")    return ResponseCurve::soft;
    if (name == "hard")    return ResponseCurve::hard;
    if (name == "s curve") return ResponseCurve::sCurve;
    if (name == "custom")  return ResponseCurve::custom;
    return ResponseCurve::linear;
}

MidiFxSettings::ChordVoicing MidiFxSettings::chordVoicingFromName (const juce::String& name) noexcept
{
    for (int i = 0; i <= (int) ChordVoicing::wide; ++i)
        if (name == chordVoicingName ((ChordVoicing) i))
            return (ChordVoicing) i;
    return ChordVoicing::close;
}

const char* NoteModuleSettings::strumPatternName (StrumPattern pattern) noexcept
{
    switch (pattern)
    {
        case StrumPattern::ascending:  return "ascending";
        case StrumPattern::descending: return "descending";
        case StrumPattern::alternate:  return "alternate";
        case StrumPattern::outsideIn:  return "outside in";
        case StrumPattern::insideOut:  return "inside out";
        case StrumPattern::random:     return "random";
    }
    return "ascending";
}

NoteModuleSettings::StrumPattern NoteModuleSettings::strumPatternFromName (
    const juce::String& name) noexcept
{
    for (int i = 0; i <= (int) StrumPattern::random; ++i)
        if (name == strumPatternName ((StrumPattern) i))
            return (StrumPattern) i;
    return StrumPattern::ascending;
}

juce::StringArray scaleNames()
{
    juce::StringArray names;
    for (const auto& scale : scaleTable)
        names.add (scale.name);
    return names;
}

juce::uint16 scaleMask (const juce::String& scaleType, int root) noexcept
{
    const auto rootClass = ((root % 12) + 12) % 12;

    for (const auto& scale : scaleTable)
    {
        if (scaleType != scale.name)
            continue;

        juce::uint16 mask = 0;
        for (const auto degree : scale.degrees)
            mask |= (juce::uint16) (1 << ((degree + rootClass) % 12));
        return mask;
    }

    return 0x0fff;   // unknown name = chromatic; never silently mute a keyboard
}

int constrainNoteToScale (int note, juce::uint16 mask) noexcept
{
    if (mask == 0 || mask == 0x0fff)
        return note;

    const auto pitchClass = ((note % 12) + 12) % 12;
    if ((mask & (1 << pitchClass)) != 0)
        return note;

    // Nearest member, ties upward — a constrained note should move as little as possible.
    for (int distance = 1; distance <= 6; ++distance)
    {
        const auto up = (pitchClass + distance) % 12;
        if ((mask & (1 << up)) != 0)
            return juce::jlimit (0, 127, note + distance);

        const auto down = ((pitchClass - distance) % 12 + 12) % 12;
        if ((mask & (1 << down)) != 0)
            return juce::jlimit (0, 127, note - distance);
    }

    return note;
}

juce::Array<bool> euclideanPattern (int steps, int pulses, int rotation)
{
    juce::Array<bool> out;
    steps = juce::jlimit (1, 128, steps);
    pulses = juce::jlimit (0, steps, pulses);

    // Bresenham's line is Bjorklund's distribution with less ceremony, and it produces the
    // same canonical patterns (E(3,8) = x..x..x.) for every case this app can express.
    int bucket = 0;
    for (int i = 0; i < steps; ++i)
    {
        bucket += pulses;
        const bool hit = bucket >= steps;
        if (hit)
            bucket -= steps;
        out.add (hit);
    }

    if (rotation != 0 && steps > 0)
    {
        juce::Array<bool> rotated;
        for (int i = 0; i < steps; ++i)
            rotated.add (out[((i + rotation) % steps + steps) % steps]);
        return rotated;
    }

    return out;
}

void Lane::resizeSteps()
{
    stepCount = juce::jlimit (1, 128, stepCount);
    while (steps.size() < stepCount)
        steps.add (PatternStep());
    while (steps.size() > stepCount)
        steps.removeLast();
}

PatternStep* Lane::findStep (int index)
{
    return juce::isPositiveAndBelow (index, steps.size()) ? &steps.getReference (index) : nullptr;
}

const PatternStep* Lane::findStep (int index) const
{
    return const_cast<Lane*> (this)->findStep (index);
}

double Lane::lengthPpq() const noexcept
{
    const auto rate = juce::jmax (1, stepsPerBeat);
    return (double) juce::jmax (1, stepCount) / (double) rate;
}

Pattern Pattern::create (const juce::String& name)
{
    Pattern pattern;
    pattern.patternId = juce::Uuid().toDashedString();
    pattern.name = name;
    // A deterministic seed from the id: two patterns roll different dice, and the same
    // pattern rolls the same ones every time it is loaded (§18.8.13).
    pattern.seed = (juce::uint32) juce::jmax (1, std::abs (pattern.patternId.hashCode()));
    return pattern;
}

Lane* Pattern::findLane (const juce::String& laneId)
{
    for (auto& lane : lanes)
        if (lane.laneId == laneId)
            return &lane;
    return nullptr;
}

const Lane* Pattern::findLane (const juce::String& laneId) const
{
    return const_cast<Pattern*> (this)->findLane (laneId);
}

double Pattern::lengthPpq() const noexcept
{
    double longest = 0.0;
    for (const auto& lane : lanes)
        longest = juce::jmax (longest, lane.lengthPpq());
    return longest > 0.0 ? longest : 4.0;
}

juce::Array<GrooveTemplate> GrooveTemplate::factoryTemplates()
{
    const auto make = [] (const juce::String& id, const juce::String& name,
                          std::initializer_list<float> timing,
                          std::initializer_list<float> velocity)
    {
        GrooveTemplate groove;
        groove.grooveId = id;
        groove.name = name;
        groove.source = "factory";
        groove.stepsPerBeat = 4;
        groove.timingOffsets.addArray (timing.begin(), (int) timing.size());
        groove.velocityMultipliers.addArray (velocity.begin(), (int) velocity.size());
        return groove;
    };

    // These are authored MPC-style feels, not extracted proprietary groove files. The
    // percentages describe the long/short sixteenth relationship users already recognise.
    return {
        make ("@hostage-mpc54", "MPC-style 54%",
              { 0.0f, 0.08f, 0.0f, 0.08f, 0.0f, 0.08f, 0.0f, 0.08f,
                0.0f, 0.08f, 0.0f, 0.08f, 0.0f, 0.08f, 0.0f, 0.08f },
              { 1.08f, 0.94f, 1.00f, 0.92f, 1.05f, 0.94f, 0.99f, 0.92f,
                1.08f, 0.94f, 1.00f, 0.92f, 1.05f, 0.94f, 0.99f, 0.92f }),
        make ("@hostage-mpc62", "MPC-style 62%",
              { 0.0f, 0.24f, 0.0f, 0.24f, 0.0f, 0.24f, 0.0f, 0.24f,
                0.0f, 0.24f, 0.0f, 0.24f, 0.0f, 0.24f, 0.0f, 0.24f },
              { 1.10f, 0.90f, 1.01f, 0.88f, 1.07f, 0.91f, 0.98f, 0.88f,
                1.10f, 0.90f, 1.01f, 0.88f, 1.07f, 0.91f, 0.98f, 0.88f }),
        make ("@hostage-laidback", "Laid-back pocket",
              { 0.0f, 0.05f, -0.02f, 0.12f, 0.01f, 0.07f, -0.01f, 0.10f,
                0.0f, 0.06f, -0.03f, 0.13f, 0.02f, 0.08f, -0.01f, 0.11f },
              { 1.12f, 0.91f, 0.98f, 0.87f, 1.07f, 0.92f, 1.00f, 0.88f,
                1.10f, 0.90f, 0.97f, 0.86f, 1.06f, 0.91f, 0.99f, 0.87f })
    };
}

void applyGrooveTemplate (Pattern& pattern, const GrooveTemplate& groove,
                          float amount, bool applyVelocity)
{
    if (groove.timingOffsets.isEmpty())
        return;

    const auto strength = juce::jlimit (0.0f, 1.0f, amount);
    const auto grooveRate = juce::jmax (1, groove.stepsPerBeat);
    for (auto& lane : pattern.lanes)
    {
        const auto laneRate = juce::jmax (1, lane.stepsPerBeat);
        for (int i = 0; i < lane.steps.size(); ++i)
        {
            auto& step = lane.steps.getReference (i);
            const auto phase = (double) i * (double) grooveRate / (double) laneRate;
            const auto grooveStep = ((int) std::round (phase)) % groove.timingOffsets.size();
            const auto laneRelativeOffset = groove.timingOffsets[grooveStep]
                                              * (float) laneRate / (float) grooveRate;
            step.microtiming = juce::jlimit (-0.5f, 0.5f, laneRelativeOffset * strength);

            const auto noteLane = lane.type == LaneType::note || lane.type == LaneType::chord
                                  || lane.type == LaneType::drum;
            if (applyVelocity && noteLane && step.active
                && ! groove.velocityMultipliers.isEmpty())
            {
                const auto multiplier = groove.velocityMultipliers[
                    grooveStep % groove.velocityMultipliers.size()];
                const auto blended = 1.0f + (multiplier - 1.0f) * strength;
                step.velocity = juce::jlimit (1, 127,
                                              juce::roundToInt ((float) step.velocity * blended));
            }
        }
    }

    pattern.appliedGrooveId = groove.grooveId;
    pattern.appliedGrooveAmount = strength;
}

namespace
{
    juce::uint32 variationHash (juce::uint32 value) noexcept
    {
        value ^= value >> 16;
        value *= 0x7feb352du;
        value ^= value >> 15;
        value *= 0x846ca68bu;
        return value ^ (value >> 16);
    }

    float variationUnit (juce::uint32 seed, int lane, int step, juce::uint32 salt) noexcept
    {
        const auto mixed = variationHash (seed ^ salt
                                          ^ ((juce::uint32) lane * 0x9e3779b9u)
                                          ^ ((juce::uint32) step * 0x85ebca6bu));
        return (float) (mixed & 0x00ffffffu) / (float) 0x01000000u;
    }

    bool isNoteLane (LaneType type) noexcept
    {
        return type == LaneType::note || type == LaneType::chord || type == LaneType::drum;
    }

    void makeFeelVariation (Lane& lane, juce::uint32 seed, int laneIndex, float amount)
    {
        for (int stepIndex = 0; stepIndex < lane.steps.size(); ++stepIndex)
        {
            auto& step = lane.steps.getReference (stepIndex);
            if (! step.active)
                continue;

            const auto random = variationUnit (seed, laneIndex, stepIndex, 0x42b1d5a7u);
            if (isNoteLane (lane.type))
            {
                const auto velocityDelta = (int) std::round ((random - 0.42f) * 28.0f * amount);
                step.velocity = juce::jlimit (1, 127, step.velocity + velocityDelta);
                step.gate = juce::jlimit (0.05f, 4.0f,
                                          step.gate + (random - 0.5f) * 0.22f * amount);
                step.microtiming = juce::jlimit (-0.5f, 0.5f,
                                                  step.microtiming
                                                    + ((stepIndex & 1) != 0 ? 0.045f : -0.018f) * amount);
            }
            else
            {
                step.value = juce::jlimit (0.0f, 1.0f,
                                           step.value + (random - 0.5f) * 0.24f * amount);
            }
        }
    }

    void makeSparseVariation (Lane& lane, juce::uint32 seed, int laneIndex, float amount)
    {
        int firstActive = -1;
        int remaining = 0;
        for (int stepIndex = 0; stepIndex < lane.steps.size(); ++stepIndex)
        {
            auto& step = lane.steps.getReference (stepIndex);
            if (! step.active)
                continue;

            if (firstActive < 0)
                firstActive = stepIndex;

            const auto random = variationUnit (seed, laneIndex, stepIndex, 0xc2b2ae35u);
            const auto removeChance = 0.18f + amount * 0.42f;
            if (random < removeChance)
            {
                step.active = false;
                step.tie = false;
                continue;
            }

            ++remaining;
            if (isNoteLane (lane.type)
                && variationUnit (seed, laneIndex, stepIndex, 0x27d4eb2fu) < amount * 0.24f)
            {
                const int octave = variationUnit (seed, laneIndex, stepIndex, 0x165667b1u) < 0.5f
                                     ? -12 : 12;
                step.note = juce::jlimit (0, 127, step.note + octave);
                for (int noteIndex = 0; noteIndex < step.chordNotes.size(); ++noteIndex)
                    step.chordNotes.set (noteIndex,
                                         juce::jlimit (0, 127, step.chordNotes[noteIndex] + octave));
            }
        }

        // A one-note phrase must remain a phrase; sparse never means accidentally empty.
        if (remaining == 0 && firstActive >= 0)
            lane.steps.getReference (firstActive).active = true;
    }

    void makeFillVariation (Lane& lane, juce::uint32 seed, int laneIndex, float amount)
    {
        const auto count = lane.steps.size();
        if (count == 0)
            return;

        const auto fillStart = juce::jmax (0, count * 3 / 4);
        if (! isNoteLane (lane.type))
        {
            for (int stepIndex = fillStart; stepIndex < count; ++stepIndex)
            {
                auto& step = lane.steps.getReference (stepIndex);
                if (step.active)
                {
                    const auto progress = (float) (stepIndex - fillStart + 1)
                                          / (float) juce::jmax (1, count - fillStart);
                    step.value = juce::jlimit (0.0f, 1.0f,
                                               step.value + progress * amount * 0.18f);
                }
            }
            return;
        }

        int lastActive = -1;
        for (int stepIndex = 0; stepIndex < count; ++stepIndex)
            if (lane.steps.getReference (stepIndex).active)
                lastActive = stepIndex;
        if (lastActive < 0)
            return;

        const auto stride = amount < 0.34f ? 4 : (amount < 0.67f ? 2 : 1);
        for (int stepIndex = fillStart; stepIndex < count; ++stepIndex)
        {
            auto& step = lane.steps.getReference (stepIndex);
            if (! step.active && ((stepIndex - fillStart) % stride) == stride - 1)
            {
                int templateIndex = stepIndex - 1;
                while (templateIndex >= 0 && ! lane.steps.getReference (templateIndex).active)
                    --templateIndex;
                if (templateIndex < 0)
                    templateIndex = lastActive;

                step = lane.steps.getReference (templateIndex);
                step.active = true;
                step.tie = false;
                step.probability = juce::jmax (step.probability, 85);
                step.ratchets = amount > 0.8f ? 3 : 2;
            }
            else if (step.active && stepIndex > fillStart
                     && variationUnit (seed, laneIndex, stepIndex, 0xd3a2646cu) < amount * 0.55f)
            {
                step.ratchets = juce::jmax (step.ratchets, amount > 0.8f ? 3 : 2);
            }
        }
    }
}

Pattern makePatternVariation (const Pattern& source, char label, float amount)
{
    const auto normalizedLabel = label == 'B' || label == 'C' || label == 'D' ? label : 'B';
    const auto intensity = juce::jlimit (0.0f, 1.0f, amount);
    const auto labelText = juce::String::charToString ((juce::juce_wchar) normalizedLabel);

    Pattern variation;
    variation.patternId = juce::Uuid().toDashedString();
    variation.name = source.name + " " + labelText;
    variation.swing = source.swing;
    variation.seed = juce::jmax ((juce::uint32) 1,
                                 variationHash (source.seed ^ ((juce::uint32) normalizedLabel << 24)));
    variation.variationGroupId = source.variationGroupId.isNotEmpty()
                                   ? source.variationGroupId : source.patternId;
    variation.variationLabel = labelText;
    variation.variationSourcePatternId = source.variationSourcePatternId.isNotEmpty()
                                           ? source.variationSourcePatternId : source.patternId;
    variation.variationAmount = intensity;

    juce::StringArray oldLaneIds, newLaneIds;
    for (int laneIndex = 0; laneIndex < source.lanes.size(); ++laneIndex)
    {
        auto lane = source.lanes.getReference (laneIndex);
        oldLaneIds.add (lane.laneId);
        lane.laneId = juce::Uuid().toDashedString();
        newLaneIds.add (lane.laneId);

        if (lane.lockSourceLaneId.isEmpty())
        {
            if (normalizedLabel == 'B') makeFeelVariation (lane, source.seed, laneIndex, intensity);
            if (normalizedLabel == 'C') makeSparseVariation (lane, source.seed, laneIndex, intensity);
            if (normalizedLabel == 'D') makeFillVariation (lane, source.seed, laneIndex, intensity);
        }
        variation.lanes.add (std::move (lane));
    }

    // Repoint each implementation lane at the generated visible lane. Its trigger timing
    // follows that lane, but a D fill never invents parameter locks for newly filled notes.
    for (int laneIndex = 0; laneIndex < variation.lanes.size(); ++laneIndex)
    {
        auto& lockLane = variation.lanes.getReference (laneIndex);
        if (lockLane.lockSourceLaneId.isEmpty())
            continue;

        const auto sourceIndex = oldLaneIds.indexOf (lockLane.lockSourceLaneId);
        if (! juce::isPositiveAndBelow (sourceIndex, newLaneIds.size()))
        {
            lockLane.lockSourceLaneId.clear();
            continue;
        }

        lockLane.lockSourceLaneId = newLaneIds[sourceIndex];
        const auto& triggerLane = variation.lanes.getReference (sourceIndex);
        const auto stepCount = juce::jmin (lockLane.steps.size(), triggerLane.steps.size());
        for (int stepIndex = 0; stepIndex < stepCount; ++stepIndex)
        {
            auto& lock = lockLane.steps.getReference (stepIndex);
            const auto& trigger = triggerLane.steps.getReference (stepIndex);
            lock.active = lock.active && trigger.active;
            if (lock.active)
            {
                lock.microtiming = trigger.microtiming;
                lock.probability = trigger.probability;
                lock.conditionEvery = trigger.conditionEvery;
                lock.conditionOffset = trigger.conditionOffset;
            }
        }
    }

    return variation;
}

// -- serialization ---------------------------------------------------------------------------

static juce::var stepToVar (const PatternStep& step)
{
    auto* s = new juce::DynamicObject();
    s->setProperty ("active",      step.active);
    s->setProperty ("note",        step.note);
    s->setProperty ("velocity",    step.velocity);
    s->setProperty ("value",       step.value);
    s->setProperty ("gate",        step.gate);
    s->setProperty ("microtiming", step.microtiming);
    s->setProperty ("probability", step.probability);
    s->setProperty ("ratchets",    step.ratchets);
    s->setProperty ("tie",         step.tie);
    s->setProperty ("every",       step.conditionEvery);
    s->setProperty ("offset",      step.conditionOffset);

    if (! step.chordNotes.isEmpty())
    {
        juce::Array<juce::var> notes;
        for (const auto note : step.chordNotes)
            notes.add (note);
        s->setProperty ("chord", notes);
    }

    return juce::var (s);
}

static PatternStep stepFromVar (const juce::var& stored)
{
    PatternStep step;
    step.active      = (bool) stored.getProperty ("active", false);
    step.note        = intOf (stored, "note", 60, 0, 127);
    step.velocity    = intOf (stored, "velocity", 100, 1, 127);
    step.value       = floatOf (stored, "value", 0.0f, 0.0f, 1.0f);
    step.gate        = floatOf (stored, "gate", 0.5f, 0.05f, 4.0f);
    step.microtiming = floatOf (stored, "microtiming", 0.0f, -0.5f, 0.5f);
    step.probability = intOf (stored, "probability", 100, 0, 100);
    step.ratchets    = intOf (stored, "ratchets", 1, 1, 8);
    step.tie         = (bool) stored.getProperty ("tie", false);
    step.conditionEvery  = intOf (stored, "every", 1, 1, 16);
    step.conditionOffset = intOf (stored, "offset", 0, 0, 15);

    if (const auto* chord = stored.getProperty ("chord", {}).getArray())
        for (const auto& note : *chord)
            step.chordNotes.add (juce::jlimit (0, 127, (int) note));

    return step;
}

juce::var patternToVar (const Pattern& pattern)
{
    juce::Array<juce::var> laneVars;
    for (const auto& lane : pattern.lanes)
    {
        juce::Array<juce::var> stepVars;
        for (const auto& step : lane.steps)
            stepVars.add (stepToVar (step));

        auto* l = new juce::DynamicObject();
        l->setProperty ("laneId",        lane.laneId);
        l->setProperty ("type",          laneTypeName (lane.type));
        l->setProperty ("name",          lane.name);
        l->setProperty ("targetPartId",  lane.targetPartId);
        l->setProperty ("targetId",      lane.targetId);
        l->setProperty ("parameterId",   lane.parameterId);
        l->setProperty ("targetCeId",    lane.targetCeId);
        l->setProperty ("channel",       lane.channel);
        l->setProperty ("ccNumber",      lane.ccNumber);
        l->setProperty ("drumNote",      lane.drumNote);
        l->setProperty ("stepCount",     lane.stepCount);
        l->setProperty ("stepsPerBeat",  lane.stepsPerBeat);
        l->setProperty ("muted",         lane.muted);
        l->setProperty ("glide",         lane.glide);
        l->setProperty ("lockSourceLaneId", lane.lockSourceLaneId);
        l->setProperty ("euclidPulses",  lane.euclidPulses);
        l->setProperty ("euclidRotation",lane.euclidRotation);
        l->setProperty ("steps",         stepVars);
        laneVars.add (juce::var (l));
    }

    auto* p = new juce::DynamicObject();
    p->setProperty ("patternId", pattern.patternId);
    p->setProperty ("name",      pattern.name);
    p->setProperty ("swing",     pattern.swing);
    p->setProperty ("seed",      (int) pattern.seed);
    p->setProperty ("variationGroupId", pattern.variationGroupId);
    p->setProperty ("variationLabel", pattern.variationLabel);
    p->setProperty ("variationSourcePatternId", pattern.variationSourcePatternId);
    p->setProperty ("variationAmount", pattern.variationAmount);
    p->setProperty ("appliedGrooveId", pattern.appliedGrooveId);
    p->setProperty ("appliedGrooveAmount", pattern.appliedGrooveAmount);
    p->setProperty ("lanes",     laneVars);
    return juce::var (p);
}

bool patternFromVar (const juce::var& stored, Pattern& out)
{
    out = Pattern();
    out.patternId = stored.getProperty ("patternId", {}).toString();
    if (out.patternId.isEmpty())
        return false;

    out.name  = stored.getProperty ("name", {}).toString();
    out.swing = floatOf (stored, "swing", 0.0f, 0.0f, 0.75f);
    out.seed  = (juce::uint32) juce::jmax (1, (int) stored.getProperty ("seed", 1));
    out.variationGroupId = stored.getProperty ("variationGroupId", {}).toString();
    out.variationLabel = stored.getProperty ("variationLabel", {}).toString();
    if (! juce::StringArray { "", "A", "B", "C", "D" }.contains (out.variationLabel))
        out.variationLabel.clear();
    out.variationSourcePatternId = stored.getProperty ("variationSourcePatternId", {}).toString();
    out.variationAmount = floatOf (stored, "variationAmount", 0.55f, 0.0f, 1.0f);
    out.appliedGrooveId = stored.getProperty ("appliedGrooveId", {}).toString();
    out.appliedGrooveAmount = floatOf (stored, "appliedGrooveAmount", 0.0f, 0.0f, 1.0f);

    juce::StringArray seenLaneIds;
    if (const auto* laneArray = stored.getProperty ("lanes", {}).getArray())
    {
        for (const auto& l : *laneArray)
        {
            Lane lane;
            lane.laneId = l.getProperty ("laneId", {}).toString();
            if (lane.laneId.isEmpty() || seenLaneIds.contains (lane.laneId))
                return false;
            seenLaneIds.add (lane.laneId);

            lane.type          = laneTypeFromName (l.getProperty ("type", {}).toString());
            lane.name          = l.getProperty ("name", {}).toString();
            lane.targetPartId  = l.getProperty ("targetPartId", {}).toString();
            lane.targetId      = l.getProperty ("targetId", {}).toString();
            lane.parameterId   = l.getProperty ("parameterId", {}).toString();
            lane.targetCeId    = l.getProperty ("targetCeId", {}).toString();
            lane.channel       = intOf (l, "channel", 1, 1, 16);
            lane.ccNumber      = intOf (l, "ccNumber", 74, 0, 127);
            lane.drumNote      = intOf (l, "drumNote", 36, 0, 127);
            lane.stepCount     = intOf (l, "stepCount", 16, 1, 128);
            lane.stepsPerBeat  = intOf (l, "stepsPerBeat", 4, 1, 16);
            lane.muted         = (bool) l.getProperty ("muted", false);
            lane.glide         = (bool) l.getProperty ("glide", false);
            lane.lockSourceLaneId = l.getProperty ("lockSourceLaneId", {}).toString();
            lane.euclidPulses  = intOf (l, "euclidPulses", 0, 0, 128);
            lane.euclidRotation= intOf (l, "euclidRotation", 0, -128, 128);

            if (const auto* stepArray = l.getProperty ("steps", {}).getArray())
                for (const auto& s : *stepArray)
                    lane.steps.add (stepFromVar (s));

            lane.resizeSteps();   // a short or long step array is a nit, not a bad document
            out.lanes.add (std::move (lane));
        }
    }

    return true;
}

juce::var grooveTemplateToVar (const GrooveTemplate& groove)
{
    juce::Array<juce::var> timing, velocity;
    for (const auto value : groove.timingOffsets)
        timing.add (value);
    for (const auto value : groove.velocityMultipliers)
        velocity.add (value);

    auto* g = new juce::DynamicObject();
    g->setProperty ("grooveId", groove.grooveId);
    g->setProperty ("name", groove.name);
    g->setProperty ("source", groove.source);
    g->setProperty ("stepsPerBeat", groove.stepsPerBeat);
    g->setProperty ("timingOffsets", timing);
    g->setProperty ("velocityMultipliers", velocity);
    return juce::var (g);
}

bool grooveTemplateFromVar (const juce::var& stored, GrooveTemplate& out)
{
    out = GrooveTemplate();
    out.grooveId = stored.getProperty ("grooveId", {}).toString();
    out.name = stored.getProperty ("name", {}).toString().trim().substring (0, 80);
    if (out.grooveId.isEmpty() || out.name.isEmpty())
        return false;
    out.source = stored.getProperty ("source", "imported").toString() == "factory"
                   ? "factory" : "imported";
    out.stepsPerBeat = intOf (stored, "stepsPerBeat", 4, 1, 16);
    if (const auto* values = stored.getProperty ("timingOffsets", {}).getArray())
        for (const auto& value : *values)
        {
            if (out.timingOffsets.size() >= 64)
                break;
            out.timingOffsets.add (juce::jlimit (-0.5f, 0.5f, (float) (double) value));
        }
    if (out.timingOffsets.size() < 2)
        return false;
    if (const auto* values = stored.getProperty ("velocityMultipliers", {}).getArray())
        for (const auto& value : *values)
        {
            if (out.velocityMultipliers.size() >= 64)
                break;
            out.velocityMultipliers.add (juce::jlimit (0.25f, 2.0f, (float) (double) value));
        }
    return true;
}

juce::var clipToVar (const Clip& clip)
{
    auto* c = new juce::DynamicObject();
    c->setProperty ("clipId",           clip.clipId);
    c->setProperty ("name",             clip.name);
    c->setProperty ("patternId",        clip.patternId);
    c->setProperty ("launchQuantize",   quantizeName (clip.launchQuantize));
    c->setProperty ("loop",             clip.loop);
    c->setProperty ("followClipId",     clip.followClipId);
    c->setProperty ("followAfterLoops", clip.followAfterLoops);
    c->setProperty ("followAction",     clip.followAction);
    c->setProperty ("looperLayer",      clip.looperLayer);
    c->setProperty ("overdubPasses",    clip.overdubPasses);
    c->setProperty ("gestureClip",      clip.gestureClip);
    c->setProperty ("gesturePasses",    clip.gesturePasses);
    c->setProperty ("frozenMidi",       clip.frozenMidi);
    c->setProperty ("frozenFromClipId", clip.frozenFromClipId);
    c->setProperty ("frozenCycles",     clip.frozenCycles);
    c->setProperty ("frozenNoteCount",  clip.frozenNoteCount);
    c->setProperty ("fillPatternId",    clip.fillPatternId);
    c->setProperty ("fillQuantize",     quantizeName (clip.fillQuantize));
    c->setProperty ("fillCc",           clip.fillCc);
    c->setProperty ("fillChannel",      clip.fillChannel);
    return juce::var (c);
}

bool clipFromVar (const juce::var& stored, Clip& out)
{
    out = Clip();
    out.clipId = stored.getProperty ("clipId", {}).toString();
    if (out.clipId.isEmpty())
        return false;

    out.name             = stored.getProperty ("name", {}).toString();
    out.patternId        = stored.getProperty ("patternId", {}).toString();
    out.launchQuantize   = quantizeFromName (stored.getProperty ("launchQuantize", {}).toString());
    out.loop             = (bool) stored.getProperty ("loop", true);
    out.followClipId     = stored.getProperty ("followClipId", {}).toString();
    out.followAfterLoops = intOf (stored, "followAfterLoops", 0, 0, 64);
    out.followAction     = stored.getProperty ("followAction", {}).toString();
    if (out.followAction.isEmpty())
        out.followAction = out.followClipId.isNotEmpty() ? "clip"
                           : out.followAfterLoops > 0 ? "stop" : "none";
    if (! juce::StringArray { "none", "clip", "next", "random", "stop" }
           .contains (out.followAction))
        out.followAction = "none";
    out.looperLayer      = (bool) stored.getProperty ("looperLayer", false);
    out.overdubPasses    = intOf (stored, "overdubPasses", 0, 0, 9999);
    out.gestureClip      = (bool) stored.getProperty ("gestureClip", false);
    out.gesturePasses    = intOf (stored, "gesturePasses", 0, 0, 9999);
    out.frozenMidi       = (bool) stored.getProperty ("frozenMidi", false);
    out.frozenFromClipId = stored.getProperty ("frozenFromClipId", {}).toString();
    out.frozenCycles     = intOf (stored, "frozenCycles", 1, 1, 8);
    out.frozenNoteCount  = intOf (stored, "frozenNoteCount", 0, 0, 1000000);
    out.fillPatternId    = stored.getProperty ("fillPatternId", {}).toString();
    out.fillQuantize     = quantizeFromName (stored.getProperty ("fillQuantize", "beat").toString());
    out.fillCc           = intOf (stored, "fillCc", -1, -1, 127);
    out.fillChannel      = intOf (stored, "fillChannel", 0, 0, 16);
    return true;
}

juce::var sceneToVar (const Scene& scene)
{
    juce::Array<juce::var> clipVars;
    for (const auto& clipId : scene.clipIds)
        clipVars.add (clipId);

    juce::Array<juce::var> slotVars;
    for (const auto& slot : scene.slots)
    {
        auto* s = new juce::DynamicObject();
        s->setProperty ("partId",      slot.partId);
        s->setProperty ("enabled",     slot.enabled);
        s->setProperty ("mute",        slot.mute);
        s->setProperty ("volume",      slot.volume);
        s->setProperty ("applyVolume", slot.applyVolume);
        s->setProperty ("pan",         slot.pan);
        s->setProperty ("applyPan",    slot.applyPan);
        slotVars.add (juce::var (s));
    }

    juce::Array<juce::var> macroVars;
    for (const auto& macro : scene.macros)
    {
        auto* m = new juce::DynamicObject();
        m->setProperty ("macroId", macro.macroId);
        m->setProperty ("value",   macro.value);
        macroVars.add (juce::var (m));
    }

    juce::Array<juce::var> parameterVars;
    for (const auto& parameter : scene.parameters)
    {
        auto* p = new juce::DynamicObject();
        p->setProperty ("targetId",    parameter.targetId);
        p->setProperty ("targetCeId",  parameter.targetCeId);
        p->setProperty ("parameterId", parameter.parameterId);
        p->setProperty ("value",       parameter.value);
        parameterVars.add (juce::var (p));
    }

    auto* s = new juce::DynamicObject();
    s->setProperty ("sceneId",        scene.sceneId);
    s->setProperty ("name",           scene.name);
    s->setProperty ("clipIds",        clipVars);
    s->setProperty ("slots",          slotVars);
    s->setProperty ("macros",         macroVars);
    s->setProperty ("parameters",     parameterVars);
    s->setProperty ("focusPartId",    scene.focusPartId);
    s->setProperty ("pageId",         scene.pageId);
    s->setProperty ("launchQuantize", quantizeName (scene.launchQuantize));
    s->setProperty ("stopOtherClips", scene.stopOtherClips);
    s->setProperty ("tempo",          scene.tempo);
    s->setProperty ("morphBeats",     scene.morphBeats);
    return juce::var (s);
}

bool sceneFromVar (const juce::var& stored, Scene& out)
{
    out = Scene();
    out.sceneId = stored.getProperty ("sceneId", {}).toString();
    if (out.sceneId.isEmpty())
        return false;

    out.name           = stored.getProperty ("name", {}).toString();
    out.focusPartId    = stored.getProperty ("focusPartId", {}).toString();
    out.pageId         = stored.getProperty ("pageId", {}).toString();
    out.launchQuantize = quantizeFromName (stored.getProperty ("launchQuantize", {}).toString());
    out.stopOtherClips = (bool) stored.getProperty ("stopOtherClips", true);
    out.tempo          = juce::jlimit (0.0, 300.0, (double) stored.getProperty ("tempo", 0.0));
    out.morphBeats     = juce::jlimit (0.0, 32.0, (double) stored.getProperty ("morphBeats", 0.0));

    if (const auto* clips = stored.getProperty ("clipIds", {}).getArray())
        for (const auto& clipId : *clips)
            out.clipIds.addIfNotAlreadyThere (clipId.toString());

    if (const auto* slots = stored.getProperty ("slots", {}).getArray())
        for (const auto& s : *slots)
        {
            SceneSlot slot;
            slot.partId      = s.getProperty ("partId", {}).toString();
            if (slot.partId.isEmpty())
                continue;
            slot.enabled     = (bool) s.getProperty ("enabled", true);
            slot.mute        = (bool) s.getProperty ("mute", false);
            slot.volume      = floatOf (s, "volume", 1.0f, 0.0f, 2.0f);
            slot.applyVolume = (bool) s.getProperty ("applyVolume", false);
            slot.pan         = floatOf (s, "pan", 0.0f, -1.0f, 1.0f);
            slot.applyPan    = (bool) s.getProperty ("applyPan", false);
            out.slots.add (std::move (slot));
        }

    if (const auto* macros = stored.getProperty ("macros", {}).getArray())
        for (const auto& m : *macros)
        {
            SceneMacroValue macro;
            macro.macroId = m.getProperty ("macroId", {}).toString();
            if (macro.macroId.isEmpty())
                continue;
            macro.value = floatOf (m, "value", 0.0f, 0.0f, 1.0f);
            out.macros.add (std::move (macro));
        }

    if (const auto* parameters = stored.getProperty ("parameters", {}).getArray())
        for (const auto& p : *parameters)
        {
            SceneParameterValue parameter;
            parameter.targetId    = p.getProperty ("targetId", {}).toString();
            parameter.targetCeId  = p.getProperty ("targetCeId", {}).toString();
            parameter.parameterId = p.getProperty ("parameterId", {}).toString();
            if (parameter.targetId.isEmpty() || parameter.parameterId.isEmpty())
                continue;
            parameter.value = floatOf (p, "value", 0.0f, 0.0f, 1.0f);
            out.parameters.add (std::move (parameter));
        }

    return true;
}

juce::var setlistToVar (const Setlist& setlist)
{
    juce::Array<juce::var> itemVars;
    for (const auto& item : setlist.items)
    {
        auto* i = new juce::DynamicObject();
        i->setProperty ("itemId",  item.itemId);
        i->setProperty ("name",    item.name);
        i->setProperty ("sceneId", item.sceneId);
        i->setProperty ("rackRecordId", item.rackRecordId);
        i->setProperty ("pageId",       item.pageId);
        i->setProperty ("notes",   item.notes);
        i->setProperty ("tempo",   item.tempo);
        itemVars.add (juce::var (i));
    }

    auto* s = new juce::DynamicObject();
    s->setProperty ("items",        itemVars);
    s->setProperty ("currentIndex", setlist.currentIndex);
    s->setProperty ("preloadAhead", setlist.preloadAhead);
    return juce::var (s);
}

bool setlistFromVar (const juce::var& stored, Setlist& out)
{
    out = Setlist();
    if (! stored.isObject())
        return true;   // absent = an older document, loads clean

    juce::StringArray seenIds;
    if (const auto* items = stored.getProperty ("items", {}).getArray())
        for (const auto& i : *items)
        {
            SetlistItem item;
            item.itemId = i.getProperty ("itemId", {}).toString();
            if (item.itemId.isEmpty() || seenIds.contains (item.itemId))
                return false;
            seenIds.add (item.itemId);

            item.name    = i.getProperty ("name", {}).toString();
            item.sceneId = i.getProperty ("sceneId", {}).toString();
            item.rackRecordId = i.getProperty ("rackRecordId", {}).toString();
            item.pageId       = i.getProperty ("pageId", {}).toString();
            item.notes   = i.getProperty ("notes", {}).toString();
            item.tempo   = juce::jlimit (0.0, 300.0, (double) i.getProperty ("tempo", 0.0));
            out.items.add (std::move (item));
        }

    out.currentIndex = juce::jlimit (-1, out.items.size() - 1,
                                     (int) stored.getProperty ("currentIndex", -1));
    out.preloadAhead = juce::jlimit (0, 2, (int) stored.getProperty ("preloadAhead", 1));
    return true;
}

juce::var arrangementToVar (const Arrangement& arrangement)
{
    juce::Array<juce::var> itemVars;
    for (const auto& item : arrangement.items)
    {
        auto* i = new juce::DynamicObject();
        i->setProperty ("itemId",  item.itemId);
        i->setProperty ("name",    item.name);
        i->setProperty ("sceneId", item.sceneId);
        i->setProperty ("bars",    item.bars);
        itemVars.add (juce::var (i));
    }

    auto* a = new juce::DynamicObject();
    a->setProperty ("items", itemVars);
    a->setProperty ("loop",  arrangement.loop);
    return juce::var (a);
}

bool arrangementFromVar (const juce::var& stored, Arrangement& out)
{
    out = Arrangement();
    if (! stored.isObject())
        return true;   // absent = an older document

    juce::StringArray seenIds;
    if (const auto* items = stored.getProperty ("items", {}).getArray())
        for (const auto& i : *items)
        {
            ArrangementItem item;
            item.itemId = i.getProperty ("itemId", {}).toString();
            if (item.itemId.isEmpty() || seenIds.contains (item.itemId))
                return false;
            seenIds.add (item.itemId);

            item.name    = i.getProperty ("name", {}).toString();
            item.sceneId = i.getProperty ("sceneId", {}).toString();
            item.bars    = intOf (i, "bars", 4, 1, 128);
            out.items.add (std::move (item));
        }

    out.loop = (bool) stored.getProperty ("loop", false);
    return true;
}

juce::var arpToVar (const ArpSettings& arp)
{
    juce::Array<juce::var> velocities;
    for (const auto velocity : arp.velocityPattern)
        velocities.add (velocity);

    juce::Array<juce::var> degrees;
    for (const auto degree : arp.degreePattern)
        degrees.add (degree);

    auto* a = new juce::DynamicObject();
    a->setProperty ("enabled",           arp.enabled);
    a->setProperty ("mode",              ArpSettings::modeName (arp.mode));
    a->setProperty ("stepsPerBeat",      arp.stepsPerBeat);
    a->setProperty ("gate",              arp.gate);
    a->setProperty ("swing",             arp.swing);
    a->setProperty ("octaves",           arp.octaves);
    a->setProperty ("latch",             arp.latch);
    a->setProperty ("constrainToScale",  arp.constrainToScale);
    a->setProperty ("velocityPattern",   velocities);
    a->setProperty ("degreePattern",     degrees);
    a->setProperty ("patternSemitones",  arp.patternSemitones);
    return juce::var (a);
}

void arpFromVar (const juce::var& stored, ArpSettings& out)
{
    out = ArpSettings();
    if (! stored.isObject())
        return;

    out.enabled          = (bool) stored.getProperty ("enabled", false);
    out.mode             = ArpSettings::modeFromName (stored.getProperty ("mode", {}).toString());
    out.stepsPerBeat     = intOf (stored, "stepsPerBeat", 4, 1, 16);
    out.gate             = floatOf (stored, "gate", 0.5f, 0.05f, 1.0f);
    out.swing            = floatOf (stored, "swing", 0.0f, 0.0f, 0.75f);
    out.octaves          = intOf (stored, "octaves", 1, 1, 4);
    out.latch            = (bool) stored.getProperty ("latch", false);
    out.constrainToScale = (bool) stored.getProperty ("constrainToScale", false);

    if (const auto* velocities = stored.getProperty ("velocityPattern", {}).getArray())
        for (const auto& velocity : *velocities)
            out.velocityPattern.add (juce::jlimit (0, 127, (int) velocity));

    if (const auto* degrees = stored.getProperty ("degreePattern", {}).getArray())
        for (const auto& degree : *degrees)
            out.degreePattern.add (juce::jlimit (-1, 63, (int) degree));
    out.patternSemitones = (bool) stored.getProperty ("patternSemitones", false);
}

juce::var midiFxToVar (const MidiFxSettings& fx)
{
    auto* f = new juce::DynamicObject();
    f->setProperty ("transpose",        fx.transpose);
    f->setProperty ("transposeMode",    fx.transposeMode);
    {
        juce::Array<juce::var> chords;
        for (const auto& keyChord : fx.keyChords)
        {
            juce::Array<juce::var> offsets;
            for (const auto offset : keyChord.offsets)
                offsets.add (offset);
            auto* kc = new juce::DynamicObject();
            kc->setProperty ("key", keyChord.key);
            kc->setProperty ("offsets", offsets);
            chords.add (juce::var (kc));
        }
        f->setProperty ("keyChords", chords);
    }
    f->setProperty ("constrainToScale", fx.constrainToScale);
    f->setProperty ("scaleRoot",        fx.scaleRoot);
    f->setProperty ("scaleType",        fx.scaleType);
    f->setProperty ("chord",            MidiFxSettings::chordTypeName (fx.chord));
    f->setProperty ("chordInversion",   fx.chordInversion);
    f->setProperty ("chordVoicing",     MidiFxSettings::chordVoicingName (fx.chordVoicing));
    f->setProperty ("chordVoiceLeading", fx.chordVoiceLeading);
    f->setProperty ("velocityFixed",    fx.velocityFixed);
    f->setProperty ("velocityScale",    fx.velocityScale);
    f->setProperty ("responseProfileName", fx.responseProfileName);
    f->setProperty ("velocityCurve", MidiFxSettings::responseCurveName (fx.velocityCurve));
    f->setProperty ("velocityInputMin",  fx.velocityInputMin);
    f->setProperty ("velocityInputMax",  fx.velocityInputMax);
    f->setProperty ("velocityOutputMin", fx.velocityOutputMin);
    f->setProperty ("velocityOutputMax", fx.velocityOutputMax);
    {
        juce::Array<juce::var> points;
        for (const auto value : fx.velocityCurveValues)
            points.add (value);
        f->setProperty ("velocityCurveValues", points);
    }
    f->setProperty ("expressionEnabled", fx.expressionEnabled);
    f->setProperty ("expressionSource",  fx.expressionSource);
    f->setProperty ("expressionCc",      fx.expressionCc);
    f->setProperty ("expressionCurve", MidiFxSettings::responseCurveName (fx.expressionCurve));
    f->setProperty ("expressionInputMin",  fx.expressionInputMin);
    f->setProperty ("expressionInputMax",  fx.expressionInputMax);
    f->setProperty ("expressionOutputMin", fx.expressionOutputMin);
    f->setProperty ("expressionOutputMax", fx.expressionOutputMax);
    {
        juce::Array<juce::var> points;
        for (const auto value : fx.expressionCurveValues)
            points.add (value);
        f->setProperty ("expressionCurveValues", points);
    }
    return juce::var (f);
}

void midiFxFromVar (const juce::var& stored, MidiFxSettings& out)
{
    out = MidiFxSettings();
    if (! stored.isObject())
        return;

    out.transpose        = intOf (stored, "transpose", 0, -48, 48);
    out.transposeMode    = stored.getProperty ("transposeMode", "chromatic").toString();
    if (out.transposeMode != "diatonic")
        out.transposeMode = "chromatic";
    out.constrainToScale = (bool) stored.getProperty ("constrainToScale", false);
    out.scaleRoot        = intOf (stored, "scaleRoot", 0, 0, 11);
    out.scaleType        = stored.getProperty ("scaleType", "major").toString();
    out.chord            = MidiFxSettings::chordTypeFromName (stored.getProperty ("chord", {}).toString());
    out.chordInversion   = intOf (stored, "chordInversion", 0, 0, 3);
    out.chordVoicing     = MidiFxSettings::chordVoicingFromName (
                              stored.getProperty ("chordVoicing", "close").toString());
    out.chordVoiceLeading = (bool) stored.getProperty ("chordVoiceLeading", false);
    out.velocityFixed    = intOf (stored, "velocityFixed", 0, 0, 127);
    out.velocityScale    = floatOf (stored, "velocityScale", 1.0f, 0.1f, 2.0f);
    out.responseProfileName = stored.getProperty ("responseProfileName", {}).toString()
                                      .trim().substring (0, 80);
    out.velocityCurve    = MidiFxSettings::responseCurveFromName (
                               stored.getProperty ("velocityCurve", "linear").toString());
    out.velocityInputMin  = intOf (stored, "velocityInputMin", 1, 1, 127);
    out.velocityInputMax  = intOf (stored, "velocityInputMax", 127, 1, 127);
    out.velocityOutputMin = intOf (stored, "velocityOutputMin", 1, 1, 127);
    out.velocityOutputMax = intOf (stored, "velocityOutputMax", 127, 1, 127);
    if (out.velocityInputMin > out.velocityInputMax)
        std::swap (out.velocityInputMin, out.velocityInputMax);
    if (out.velocityOutputMin > out.velocityOutputMax)
        std::swap (out.velocityOutputMin, out.velocityOutputMax);
    if (const auto* points = stored.getProperty ("velocityCurveValues", {}).getArray())
        for (const auto& value : *points)
        {
            if (out.velocityCurveValues.size() >= MidiFxSettings::responseCurvePoints)
                break;
            out.velocityCurveValues.add (juce::jlimit (0, 127, (int) value));
        }

    out.expressionEnabled = (bool) stored.getProperty ("expressionEnabled", false);
    {
        const auto source = stored.getProperty ("expressionSource", "cc").toString();
        const juce::StringArray sources { "cc", "channel pressure", "poly aftertouch" };
        out.expressionSource = sources.contains (source) ? source : juce::String ("cc");
    }
    out.expressionCc = intOf (stored, "expressionCc", 11, 0, 127);
    out.expressionCurve = MidiFxSettings::responseCurveFromName (
                              stored.getProperty ("expressionCurve", "linear").toString());
    out.expressionInputMin  = intOf (stored, "expressionInputMin", 0, 0, 127);
    out.expressionInputMax  = intOf (stored, "expressionInputMax", 127, 0, 127);
    out.expressionOutputMin = intOf (stored, "expressionOutputMin", 0, 0, 127);
    out.expressionOutputMax = intOf (stored, "expressionOutputMax", 127, 0, 127);
    if (out.expressionInputMin > out.expressionInputMax)
        std::swap (out.expressionInputMin, out.expressionInputMax);
    if (out.expressionOutputMin > out.expressionOutputMax)
        std::swap (out.expressionOutputMin, out.expressionOutputMax);
    if (const auto* points = stored.getProperty ("expressionCurveValues", {}).getArray())
        for (const auto& value : *points)
        {
            if (out.expressionCurveValues.size() >= MidiFxSettings::responseCurvePoints)
                break;
            out.expressionCurveValues.add (juce::jlimit (0, 127, (int) value));
        }

    if (const auto* chords = stored.getProperty ("keyChords", {}).getArray())
        for (const auto& entry : *chords)
        {
            MidiFxSettings::KeyChord keyChord;
            keyChord.key = juce::jlimit (0, 127, (int) entry.getProperty ("key", 60));
            if (const auto* offsets = entry.getProperty ("offsets", {}).getArray())
                for (const auto& offset : *offsets)
                {
                    if (keyChord.offsets.size() >= 6)
                        break;
                    keyChord.offsets.add (juce::jlimit (-60, 60, (int) offset));
                }
            if (! keyChord.offsets.isEmpty())
                out.keyChords.add (std::move (keyChord));
        }
}

juce::StringArray MidiSlot::types()
{
    // Order is the order the UI offers them: the two that reorder or repeat what you play,
    // then the shapers, then the performance processors in the order somebody reaches for them.
    return { "arp", "transpose", "scale", "chord", "velocity", "fx",
             "echo", "strum", "humanize", "chance", "length", "latch", "mpe",
             "articulation" };
}

MidiSlot MidiSlot::create (const juce::String& type, const juce::String& slotId)
{
    MidiSlot slot;
    slot.slotId = slotId;
    slot.type = types().contains (type) ? type : "arp";
    // Defaults are already transparent: ArpSettings starts disabled, MidiFxSettings starts
    // at no transpose, no scale, no chord, unity velocity. An inserted module must not
    // change the sound by existing — it changes it when you set it up.
    return slot;
}

juce::var noteModuleToVar (const NoteModuleSettings& settings)
{
    auto* m = new juce::DynamicObject();
    m->setProperty ("echoRepeats",     settings.echoRepeats);
    m->setProperty ("echoStepBeats",   settings.echoStepBeats);
    m->setProperty ("echoFeedback",    settings.echoFeedback);
    m->setProperty ("echoTranspose",   settings.echoTranspose);
    m->setProperty ("strumBeats",      settings.strumBeats);
    m->setProperty ("strumDown",       settings.strumDown);
    m->setProperty ("strumPattern",    NoteModuleSettings::strumPatternName (settings.strumPattern));
    m->setProperty ("strumCurve",      settings.strumCurve);
    m->setProperty ("strumVelocityRamp", settings.strumVelocityRamp);
    m->setProperty ("humanizeTimingBeats", settings.humanizeTimingBeats);
    m->setProperty ("humanizeVelocity",    settings.humanizeVelocity);
    m->setProperty ("humanizeGatePercent", settings.humanizeGatePercent);
    m->setProperty ("humanizePreserveChords", settings.humanizePreserveChords);
    m->setProperty ("humanizeProtectBeats", settings.humanizeProtectBeats);
    m->setProperty ("chance",          settings.chance);
    m->setProperty ("lengthBeats",     settings.lengthBeats);
    m->setProperty ("legato",          settings.legato);
    m->setProperty ("latchOn",         settings.latchOn);
    m->setProperty ("mpeEnabled",       settings.mpeEnabled);
    m->setProperty ("mpeInput",         settings.mpeInput);
    m->setProperty ("mpeOutput",        settings.mpeOutput);
    m->setProperty ("mpeInputAxis",     settings.mpeInputAxis);
    m->setProperty ("mpeOutputAxis",    settings.mpeOutputAxis);
    m->setProperty ("mpeInputCc",       settings.mpeInputCc);
    m->setProperty ("mpeOutputCc",      settings.mpeOutputCc);
    m->setProperty ("mpeOutputChannel", settings.mpeOutputChannel);
    m->setProperty ("mpeMemberFirst",   settings.mpeMemberFirst);
    m->setProperty ("mpeMemberLast",    settings.mpeMemberLast);
    m->setProperty ("mpeCollapse",      settings.mpeCollapse);
    m->setProperty ("articulationEnabled", settings.articulationEnabled);
    m->setProperty ("articulationMapName", settings.articulationMapName);
    juce::Array<juce::var> articulations;
    for (const auto& articulation : settings.articulations)
    {
        auto* a = new juce::DynamicObject();
        a->setProperty ("articulationId", articulation.articulationId);
        a->setProperty ("name", articulation.name);
        a->setProperty ("triggerNote", articulation.triggerNote);
        a->setProperty ("triggerChannel", articulation.triggerChannel);
        a->setProperty ("type", articulation.type);
        a->setProperty ("outputChannel", articulation.outputChannel);
        a->setProperty ("keyswitchNote", articulation.keyswitchNote);
        a->setProperty ("keyswitchVelocity", articulation.keyswitchVelocity);
        a->setProperty ("program", articulation.program);
        a->setProperty ("bankMsb", articulation.bankMsb);
        a->setProperty ("bankLsb", articulation.bankLsb);
        a->setProperty ("controller", articulation.controller);
        a->setProperty ("controllerValue", articulation.controllerValue);
        articulations.add (juce::var (a));
    }
    m->setProperty ("articulations", articulations);
    return juce::var (m);
}

void noteModuleFromVar (const juce::var& stored, NoteModuleSettings& out)
{
    // Absent reads as the defaults, which is how a session written before these modules
    // existed opens: it has no "mod" block and gains one that changes nothing.
    out = NoteModuleSettings();
    if (! stored.isObject())
        return;

    const auto intOf = [&stored] (const char* key, int fallback, int low, int high)
    {
        return juce::jlimit (low, high, (int) stored.getProperty (key, fallback));
    };
    const auto doubleOf = [&stored] (const char* key, double fallback, double low, double high)
    {
        return juce::jlimit (low, high, (double) stored.getProperty (key, fallback));
    };

    out.echoRepeats   = intOf ("echoRepeats", 0, 0, 8);
    out.echoStepBeats = doubleOf ("echoStepBeats", 0.5, 0.03125, 4.0);
    out.echoFeedback  = (float) doubleOf ("echoFeedback", 0.7, 0.1, 1.0);
    out.echoTranspose = intOf ("echoTranspose", 0, -12, 12);
    out.strumBeats    = doubleOf ("strumBeats", 0.0, 0.0, 1.0);
    out.strumDown     = (bool) stored.getProperty ("strumDown", false);
    const auto storedPattern = stored.getProperty ("strumPattern", {}).toString();
    out.strumPattern  = storedPattern.isNotEmpty()
        ? NoteModuleSettings::strumPatternFromName (storedPattern)
        : (out.strumDown ? NoteModuleSettings::StrumPattern::descending
                         : NoteModuleSettings::StrumPattern::ascending);
    out.strumDown     = out.strumPattern == NoteModuleSettings::StrumPattern::descending;
    out.strumCurve    = (float) doubleOf ("strumCurve", 0.0, -1.0, 1.0);
    out.strumVelocityRamp = intOf ("strumVelocityRamp", 0, -64, 64);
    out.humanizeTimingBeats = doubleOf ("humanizeTimingBeats", 0.0, 0.0, 0.25);
    out.humanizeVelocity    = intOf ("humanizeVelocity", 0, 0, 64);
    out.humanizeGatePercent = intOf ("humanizeGatePercent", 0, 0, 100);
    out.humanizePreserveChords = (bool) stored.getProperty ("humanizePreserveChords", false);
    out.humanizeProtectBeats = (bool) stored.getProperty ("humanizeProtectBeats", false);
    out.chance        = (float) doubleOf ("chance", 1.0, 0.0, 1.0);
    out.lengthBeats   = doubleOf ("lengthBeats", 0.0, 0.0, 8.0);
    out.legato        = (bool) stored.getProperty ("legato", false);
    out.latchOn       = (bool) stored.getProperty ("latchOn", false);
    const juce::StringArray formats { "mpe", "poly aftertouch", "channel pressure", "cc" };
    const juce::StringArray axes { "pressure", "timbre", "pitch bend" };
    const juce::StringArray collapseModes { "latest", "highest", "average" };
    const auto format = [&stored, &formats] (const char* key, const char* fallback)
    {
        const auto value = stored.getProperty (key, fallback).toString();
        return formats.contains (value) ? value : juce::String (fallback);
    };
    const auto axis = [&stored, &axes] (const char* key, const char* fallback)
    {
        const auto value = stored.getProperty (key, fallback).toString();
        return axes.contains (value) ? value : juce::String (fallback);
    };
    out.mpeEnabled       = (bool) stored.getProperty ("mpeEnabled", false);
    out.mpeInput         = format ("mpeInput", "mpe");
    out.mpeOutput        = format ("mpeOutput", "poly aftertouch");
    out.mpeInputAxis     = axis ("mpeInputAxis", "pressure");
    out.mpeOutputAxis    = axis ("mpeOutputAxis", "pressure");
    out.mpeInputCc       = intOf ("mpeInputCc", 74, 0, 127);
    out.mpeOutputCc      = intOf ("mpeOutputCc", 74, 0, 127);
    out.mpeOutputChannel = intOf ("mpeOutputChannel", 1, 1, 16);
    out.mpeMemberFirst   = intOf ("mpeMemberFirst", 2, 1, 16);
    out.mpeMemberLast    = intOf ("mpeMemberLast", 16, 1, 16);
    if (out.mpeMemberFirst > out.mpeMemberLast)
        std::swap (out.mpeMemberFirst, out.mpeMemberLast);
    const auto collapse = stored.getProperty ("mpeCollapse", "latest").toString();
    out.mpeCollapse = collapseModes.contains (collapse) ? collapse : "latest";
    out.articulationEnabled = (bool) stored.getProperty ("articulationEnabled", false);
    out.articulationMapName = stored.getProperty ("articulationMapName", {}).toString().trim()
                                  .substring (0, 80);
    const juce::StringArray articulationTypes { "keyswitch", "program change", "cc" };
    if (const auto* articulations = stored.getProperty ("articulations", {}).getArray())
        for (const auto& entry : *articulations)
        {
            if (out.articulations.size() >= 32 || ! entry.isObject())
                break;
            NoteModuleSettings::Articulation articulation;
            articulation.articulationId = entry.getProperty ("articulationId", {}).toString();
            if (articulation.articulationId.isEmpty())
                articulation.articulationId = juce::Uuid().toDashedString();
            articulation.name = entry.getProperty ("name", "Articulation").toString().trim()
                                    .substring (0, 80);
            if (articulation.name.isEmpty())
                articulation.name = "Articulation";
            articulation.triggerNote = juce::jlimit (0, 127,
                (int) entry.getProperty ("triggerNote", 24));
            articulation.triggerChannel = juce::jlimit (0, 16,
                (int) entry.getProperty ("triggerChannel", 0));
            const auto type = entry.getProperty ("type", "keyswitch").toString();
            articulation.type = articulationTypes.contains (type) ? type : "keyswitch";
            articulation.outputChannel = juce::jlimit (0, 16,
                (int) entry.getProperty ("outputChannel", 0));
            articulation.keyswitchNote = juce::jlimit (0, 127,
                (int) entry.getProperty ("keyswitchNote", articulation.triggerNote));
            articulation.keyswitchVelocity = juce::jlimit (1, 127,
                (int) entry.getProperty ("keyswitchVelocity", 100));
            articulation.program = juce::jlimit (0, 127,
                (int) entry.getProperty ("program", 0));
            articulation.bankMsb = juce::jlimit (-1, 127,
                (int) entry.getProperty ("bankMsb", -1));
            articulation.bankLsb = juce::jlimit (-1, 127,
                (int) entry.getProperty ("bankLsb", -1));
            articulation.controller = juce::jlimit (0, 127,
                (int) entry.getProperty ("controller", 0));
            articulation.controllerValue = juce::jlimit (0, 127,
                (int) entry.getProperty ("controllerValue", 127));
            out.articulations.add (std::move (articulation));
        }
}

juce::var midiSlotToVar (const MidiSlot& slot)
{
    auto* s = new juce::DynamicObject();
    s->setProperty ("slotId",   slot.slotId);
    s->setProperty ("type",     slot.type);
    s->setProperty ("bypassed", slot.bypassed);
    s->setProperty ("arp",      arpToVar (slot.arp));
    s->setProperty ("fx",       midiFxToVar (slot.fx));
    s->setProperty ("mod",      noteModuleToVar (slot.mod));
    return juce::var (s);
}

void midiSlotFromVar (const juce::var& stored, MidiSlot& out)
{
    out = MidiSlot();
    if (! stored.isObject())
        return;

    out.slotId   = stored.getProperty ("slotId", {}).toString();
    const auto type = stored.getProperty ("type", {}).toString();
    out.type     = MidiSlot::types().contains (type) ? type : juce::String ("arp");
    out.bypassed = (bool) stored.getProperty ("bypassed", false);
    arpFromVar (stored.getProperty ("arp", {}), out.arp);
    midiFxFromVar (stored.getProperty ("fx", {}), out.fx);
    noteModuleFromVar (stored.getProperty ("mod", {}), out.mod);
}

juce::Array<MidiSlot> migrateLegacyEventChain (const MidiFxSettings& fx, const ArpSettings& arp)
{
    // Both slots always, even when neither does anything: the chain a person opens should
    // show what their rig actually contains, and an idle module is transparent. Order is
    // the order the welded chain ran in, which is what makes the migration inaudible.
    juce::Array<MidiSlot> chain;

    auto shaping = MidiSlot::create ("fx", juce::Uuid().toDashedString());
    shaping.fx = fx;
    chain.add (std::move (shaping));

    auto arpSlot = MidiSlot::create ("arp", juce::Uuid().toDashedString());
    arpSlot.arp = arp;
    // The old arp took its scale from the shared note-shaping block, so the slot carries a
    // copy: constrain-to-scale keeps folding into the same scale it always did.
    arpSlot.fx = fx;
    chain.add (std::move (arpSlot));

    return chain;
}

juce::var transportSettingsToVar (const TransportSettings& settings)
{
    auto* t = new juce::DynamicObject();
    t->setProperty ("tempo",             settings.tempo);
    t->setProperty ("tsNumerator",       settings.timeSignatureNumerator);
    t->setProperty ("tsDenominator",     settings.timeSignatureDenominator);
    t->setProperty ("externalClock",     settings.externalClock);
    t->setProperty ("defaultQuantize",   quantizeName (settings.defaultQuantize));
    return juce::var (t);
}

void transportSettingsFromVar (const juce::var& stored, TransportSettings& out)
{
    out = TransportSettings();
    if (! stored.isObject())
        return;

    out.tempo                      = juce::jlimit (20.0, 300.0, (double) stored.getProperty ("tempo", 120.0));
    out.timeSignatureNumerator     = intOf (stored, "tsNumerator", 4, 1, 32);
    out.timeSignatureDenominator   = intOf (stored, "tsDenominator", 4, 2, 16);
    out.externalClock              = (bool) stored.getProperty ("externalClock", false);
    out.defaultQuantize            = quantizeFromName (stored.getProperty ("defaultQuantize", {}).toString());
}

} // namespace ceditor::perf
