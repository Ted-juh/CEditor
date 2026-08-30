#include "PatternModel.h"

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
        case Mode::chord:  return "chord";
    }
    return "up";
}

ArpSettings::Mode ArpSettings::modeFromName (const juce::String& name) noexcept
{
    for (int i = 0; i <= (int) Mode::chord; ++i)
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
    }
    return "off";
}

MidiFxSettings::ChordType MidiFxSettings::chordTypeFromName (const juce::String& name) noexcept
{
    for (int i = 0; i <= (int) ChordType::octaveDouble; ++i)
        if (name == chordTypeName ((ChordType) i))
            return (ChordType) i;
    return ChordType::off;
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

    auto* s = new juce::DynamicObject();
    s->setProperty ("sceneId",        scene.sceneId);
    s->setProperty ("name",           scene.name);
    s->setProperty ("clipIds",        clipVars);
    s->setProperty ("slots",          slotVars);
    s->setProperty ("macros",         macroVars);
    s->setProperty ("focusPartId",    scene.focusPartId);
    s->setProperty ("pageId",         scene.pageId);
    s->setProperty ("launchQuantize", quantizeName (scene.launchQuantize));
    s->setProperty ("stopOtherClips", scene.stopOtherClips);
    s->setProperty ("tempo",          scene.tempo);
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
        i->setProperty ("notes",   item.notes);
        i->setProperty ("tempo",   item.tempo);
        itemVars.add (juce::var (i));
    }

    auto* s = new juce::DynamicObject();
    s->setProperty ("items",        itemVars);
    s->setProperty ("currentIndex", setlist.currentIndex);
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
            item.notes   = i.getProperty ("notes", {}).toString();
            item.tempo   = juce::jlimit (0.0, 300.0, (double) i.getProperty ("tempo", 0.0));
            out.items.add (std::move (item));
        }

    out.currentIndex = juce::jlimit (-1, out.items.size() - 1,
                                     (int) stored.getProperty ("currentIndex", -1));
    return true;
}

juce::var arpToVar (const ArpSettings& arp)
{
    juce::Array<juce::var> velocities;
    for (const auto velocity : arp.velocityPattern)
        velocities.add (velocity);

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
}

juce::var midiFxToVar (const MidiFxSettings& fx)
{
    auto* f = new juce::DynamicObject();
    f->setProperty ("transpose",        fx.transpose);
    f->setProperty ("constrainToScale", fx.constrainToScale);
    f->setProperty ("scaleRoot",        fx.scaleRoot);
    f->setProperty ("scaleType",        fx.scaleType);
    f->setProperty ("chord",            MidiFxSettings::chordTypeName (fx.chord));
    f->setProperty ("velocityFixed",    fx.velocityFixed);
    f->setProperty ("velocityScale",    fx.velocityScale);
    return juce::var (f);
}

void midiFxFromVar (const juce::var& stored, MidiFxSettings& out)
{
    out = MidiFxSettings();
    if (! stored.isObject())
        return;

    out.transpose        = intOf (stored, "transpose", 0, -48, 48);
    out.constrainToScale = (bool) stored.getProperty ("constrainToScale", false);
    out.scaleRoot        = intOf (stored, "scaleRoot", 0, 0, 11);
    out.scaleType        = stored.getProperty ("scaleType", "major").toString();
    out.chord            = MidiFxSettings::chordTypeFromName (stored.getProperty ("chord", {}).toString());
    out.velocityFixed    = intOf (stored, "velocityFixed", 0, 0, 127);
    out.velocityScale    = floatOf (stored, "velocityScale", 1.0f, 0.1f, 2.0f);
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
