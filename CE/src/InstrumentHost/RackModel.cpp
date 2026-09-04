#include "RackModel.h"

namespace ceditor::host
{

namespace
{
    // Small clamp-on-read helpers keep the parse below readable.
    int intOf (const juce::var& parent, const char* key, int def, int lo, int hi)
    {
        return juce::jlimit (lo, hi, (int) parent.getProperty (key, def));
    }

    float floatOf (const juce::var& parent, const char* key, float def, float lo, float hi)
    {
        return juce::jlimit (lo, hi, (float) (double) parent.getProperty (key, def));
    }
}

ControlPage ControlPage::create (const juce::String& name, int numSlots)
{
    ControlPage page;
    page.pageId = juce::Uuid().toDashedString();
    page.name = name;
    for (int i = 1; i <= juce::jmax (1, numSlots); ++i)
    {
        ControlSlot slot;
        slot.slotId = "s" + juce::String (i);
        slot.kind = "encoder";
        slot.index = i - 1;
        page.slots.add (std::move (slot));
    }
    return page;
}

ControlSlot* ControlPage::findSurfaceSlot (const juce::String& kind, int index)
{
    if (index < 0)
        return nullptr;
    for (auto& slot : slots)
        if (slot.kind == kind && slot.index == index)
            return &slot;
    return nullptr;
}

const ControlSlot* ControlPage::findSurfaceSlot (const juce::String& kind, int index) const
{
    return const_cast<ControlPage*> (this)->findSurfaceSlot (kind, index);
}

ControlSlot* ControlPage::findSlot (const juce::String& slotId)
{
    for (auto& slot : slots)
        if (slot.slotId == slotId)
            return &slot;
    return nullptr;
}

const ControlSlot* ControlPage::findSlot (const juce::String& slotId) const
{
    return const_cast<ControlPage*> (this)->findSlot (slotId);
}

// Effect chains serialize identically wherever they hang (a part or the master path), so the
// shape lives in one pair of helpers.
static juce::var effectsToVar (const juce::Array<EffectSlot>& effects)
{
    juce::Array<juce::var> out;
    for (const auto& slot : effects)
    {
        auto* e = new juce::DynamicObject();
        e->setProperty ("effectId",         slot.effectId);
        e->setProperty ("pluginCeId",       slot.pluginCeId);
        e->setProperty ("pluginModulePath", slot.pluginModulePath);
        e->setProperty ("pluginName",       slot.pluginName);
        e->setProperty ("pluginVendor",     slot.pluginVendor);
        e->setProperty ("stateBlob",        slot.stateBlobBase64);
        e->setProperty ("stateBlobHash",    SessionRecovery::hashState (slot.stateBlobBase64));
        e->setProperty ("bypassed",         slot.bypassed);
        out.add (juce::var (e));
    }
    return out;
}

static bool effectsFromVar (const juce::var& stored, juce::Array<EffectSlot>& out,
                            juce::StringArray& seenEffectIds)
{
    const auto* array = stored.getArray();
    if (array == nullptr)
        return true;   // absent = an older document, loads clean

    for (const auto& e : *array)
    {
        EffectSlot slot;
        slot.effectId = e.getProperty ("effectId", {}).toString();
        if (slot.effectId.isEmpty() || seenEffectIds.contains (slot.effectId))
            return false;
        seenEffectIds.add (slot.effectId);

        slot.pluginCeId       = e.getProperty ("pluginCeId", {}).toString();
        slot.pluginModulePath = e.getProperty ("pluginModulePath", {}).toString();
        slot.pluginName       = e.getProperty ("pluginName", {}).toString();
        slot.pluginVendor     = e.getProperty ("pluginVendor", {}).toString();
        slot.stateBlobBase64  = e.getProperty ("stateBlob", {}).toString();
        slot.stateBlobHash    = e.getProperty ("stateBlobHash", {}).toString();
        slot.bypassed         = (bool) e.getProperty ("bypassed", false);
        out.add (std::move (slot));
    }
    return true;
}

Performance Performance::create()
{
    Performance p;
    p.performanceId = juce::Uuid().toDashedString();
    p.grooves = perf::GrooveTemplate::factoryTemplates();
    return p;
}

juce::String Performance::addPart()
{
    RackPart part;
    part.partId = juce::Uuid().toDashedString();
    // A new part starts with the same two modules a migrated one gets, both idle: the
    // chain is what a person edits, so it should never start as an empty mystery.
    part.midiChain = perf::migrateLegacyEventChain (part.midiFx, part.arp);
    parts.add (part);

    if (focusedPartId.isEmpty())
        focusedPartId = part.partId;

    return part.partId;
}

bool Performance::removePart (const juce::String& partId)
{
    const auto index = indexOfPart (partId);
    if (index < 0)
        return false;

    parts.remove (index);

    // A layer cannot retain a destination that no longer exists. A one-member group is no
    // longer a routing decision, so dissolve it and let that remaining part return to the
    // ordinary keyboard path.
    for (int groupIndex = layerGroups.size(); --groupIndex >= 0;)
    {
        auto& group = layerGroups.getReference (groupIndex);
        for (int memberIndex = group.members.size(); --memberIndex >= 0;)
            if (group.members.getReference (memberIndex).partId == partId)
                group.members.remove (memberIndex);
        if (group.members.size() < 2)
            layerGroups.remove (groupIndex);
    }

    if (focusedPartId == partId)
        focusedPartId = parts.isEmpty() ? juce::String() : parts.getReference (0).partId;

    return true;
}

bool Performance::movePart (const juce::String& partId, int newIndex)
{
    const auto index = indexOfPart (partId);
    if (index < 0)
        return false;

    parts.move (index, juce::jlimit (0, parts.size() - 1, newIndex));
    return true;
}

RackPart* Performance::findPart (const juce::String& partId)
{
    const auto index = indexOfPart (partId);
    return index >= 0 ? &parts.getReference (index) : nullptr;
}

const RackPart* Performance::findPart (const juce::String& partId) const
{
    const auto index = indexOfPart (partId);
    return index >= 0 ? &parts.getReference (index) : nullptr;
}

int Performance::indexOfPart (const juce::String& partId) const
{
    for (int i = 0; i < parts.size(); ++i)
        if (parts.getReference (i).partId == partId)
            return i;
    return -1;
}

Macro* Performance::findMacro (const juce::String& macroId)
{
    for (auto& macro : macros)
        if (macro.macroId == macroId)
            return &macro;
    return nullptr;
}

const Macro* Performance::findMacro (const juce::String& macroId) const
{
    return const_cast<Performance*> (this)->findMacro (macroId);
}

MidiLfo* Performance::findMidiLfo (const juce::String& lfoId)
{
    for (auto& lfo : midiLfos)
        if (lfo.lfoId == lfoId)
            return &lfo;
    return nullptr;
}

const MidiLfo* Performance::findMidiLfo (const juce::String& lfoId) const
{
    return const_cast<Performance*> (this)->findMidiLfo (lfoId);
}

EnvelopeGenerator* Performance::findEnvelope (const juce::String& envelopeId)
{
    for (auto& envelope : envelopes)
        if (envelope.envelopeId == envelopeId)
            return &envelope;
    return nullptr;
}

const EnvelopeGenerator* Performance::findEnvelope (const juce::String& envelopeId) const
{
    return const_cast<Performance*> (this)->findEnvelope (envelopeId);
}

ReturnChain* Performance::findReturn (const juce::String& returnId)
{
    for (auto& chain : returns)
        if (chain.returnId == returnId)
            return &chain;
    return nullptr;
}

MsegGenerator* Performance::findMseg (const juce::String& msegId)
{
    for (auto& mseg : msegs)
        if (mseg.msegId == msegId)
            return &mseg;
    return nullptr;
}

const MsegGenerator* Performance::findMseg (const juce::String& msegId) const
{
    for (const auto& mseg : msegs)
        if (mseg.msegId == msegId)
            return &mseg;
    return nullptr;
}

RandomModulator* Performance::findRandomModulator (const juce::String& randomId)
{
    for (auto& random : randomModulators)
        if (random.randomId == randomId)
            return &random;
    return nullptr;
}

const RandomModulator* Performance::findRandomModulator (const juce::String& randomId) const
{
    return const_cast<Performance*> (this)->findRandomModulator (randomId);
}

const ReturnChain* Performance::findReturn (const juce::String& returnId) const
{
    return const_cast<Performance*> (this)->findReturn (returnId);
}

BusChain* Performance::findBus (const juce::String& busId)
{
    for (auto& bus : buses)
        if (bus.busId == busId)
            return &bus;
    return nullptr;
}

const BusChain* Performance::findBus (const juce::String& busId) const
{
    return const_cast<Performance*> (this)->findBus (busId);
}

bool Performance::busRoutingWouldLoop (const juce::String& busId,
                                       const juce::String& destinationId) const
{
    if (destinationId.isEmpty())
        return false;                 // the master is nobody's upstream
    if (destinationId == busId)
        return true;                  // a bus into itself is the shortest loop there is

    // Walk the destination chain as it would be, bounded by the number of buses: a longer
    // walk than that has already revisited something.
    auto at = destinationId;
    for (int hops = 0; hops <= buses.size(); ++hops)
    {
        const auto* bus = findBus (at);
        if (bus == nullptr)
            return false;             // runs into the master, or into nothing
        if (bus->destinationBusId == busId)
            return true;
        at = bus->destinationBusId;
        if (at.isEmpty())
            return false;
    }
    return true;
}

bool Performance::midiRoutingWouldLoop (const juce::String& partId, const juce::String& sourcePartId) const
{
    if (sourcePartId.isEmpty())
        return false;                 // the keyboard ends every chain
    if (sourcePartId == partId)
        return true;                  // a part driving itself is the shortest loop there is

    // Walk upstream from the proposed source, bounded by the number of parts: a longer walk
    // than that has already revisited something.
    auto at = sourcePartId;
    for (int hops = 0; hops <= parts.size(); ++hops)
    {
        const auto* part = findPart (at);
        if (part == nullptr)
            return false;             // runs into a part that is gone, which is not a loop
        if (part->midiSourcePartId == partId)
            return true;
        at = part->midiSourcePartId;
        if (at.isEmpty())
            return false;             // reached the keyboard
    }
    return true;
}

EffectSlot* Performance::findEffect (const juce::String& effectId, juce::String* chainIdOut)
{
    for (auto& part : parts)
        for (auto& slot : part.effects)
            if (slot.effectId == effectId)
            {
                if (chainIdOut != nullptr) *chainIdOut = part.partId;
                return &slot;
            }

    for (auto& slot : masterEffects)
        if (slot.effectId == effectId)
        {
            if (chainIdOut != nullptr) *chainIdOut = "master";
            return &slot;
        }

    for (auto& chain : returns)
        for (auto& slot : chain.effects)
            if (slot.effectId == effectId)
            {
                if (chainIdOut != nullptr) *chainIdOut = chain.returnId;
                return &slot;
            }

    return nullptr;
}

const EffectSlot* Performance::findEffect (const juce::String& effectId, juce::String* chainIdOut) const
{
    return const_cast<Performance*> (this)->findEffect (effectId, chainIdOut);
}

perf::Pattern* Performance::findPattern (const juce::String& patternId)
{
    for (auto& pattern : patterns)
        if (pattern.patternId == patternId)
            return &pattern;
    return nullptr;
}

const perf::Pattern* Performance::findPattern (const juce::String& patternId) const
{
    return const_cast<Performance*> (this)->findPattern (patternId);
}

perf::Clip* Performance::findClip (const juce::String& clipId)
{
    for (auto& clip : clips)
        if (clip.clipId == clipId)
            return &clip;
    return nullptr;
}

const perf::Clip* Performance::findClip (const juce::String& clipId) const
{
    return const_cast<Performance*> (this)->findClip (clipId);
}

perf::Scene* Performance::findScene (const juce::String& sceneId)
{
    for (auto& scene : scenes)
        if (scene.sceneId == sceneId)
            return &scene;
    return nullptr;
}

const perf::Scene* Performance::findScene (const juce::String& sceneId) const
{
    return const_cast<Performance*> (this)->findScene (sceneId);
}

int Performance::indexOfClip (const juce::String& clipId) const
{
    // The engine addresses clips by index and the index IS document order, so this is the one
    // place the two representations meet.
    for (int i = 0; i < clips.size(); ++i)
        if (clips.getReference (i).clipId == clipId)
            return i;
    return -1;
}

ControlPage* Performance::findPage (const juce::String& pageId)
{
    for (auto& page : pages)
        if (page.pageId == pageId)
            return &page;
    return nullptr;
}

const ControlPage* Performance::findPage (const juce::String& pageId) const
{
    return const_cast<Performance*> (this)->findPage (pageId);
}

juce::var Performance::toVar() const
{
    juce::Array<juce::var> partVars;

    for (const auto& part : parts)
    {
        auto* p = new juce::DynamicObject();
        p->setProperty ("partId",           part.partId);
        p->setProperty ("pluginCeId",       part.pluginCeId);
        p->setProperty ("pluginModulePath", part.pluginModulePath);
        p->setProperty ("pluginName",       part.pluginName);
        p->setProperty ("pluginVendor",     part.pluginVendor);
        p->setProperty ("stateBlob",        part.stateBlobBase64);
        p->setProperty ("stateBlobHash",    SessionRecovery::hashState (part.stateBlobBase64));
        p->setProperty ("channel",          part.midi.channel);
        p->setProperty ("keyLow",           part.midi.keyLow);
        p->setProperty ("keyHigh",          part.midi.keyHigh);
        p->setProperty ("velocityLow",      part.midi.velocityLow);
        p->setProperty ("velocityHigh",     part.midi.velocityHigh);
        p->setProperty ("transpose",        part.midi.transpose);
        p->setProperty ("enabled",          part.enabled);
        p->setProperty ("mute",             part.mute);
        p->setProperty ("solo",             part.solo);
        p->setProperty ("volume",           part.volume);
        p->setProperty ("pan",              part.pan);
        p->setProperty ("editorOpen",       part.editorOpen);
        p->setProperty ("destinationBusId", part.destinationBusId);
        p->setProperty ("midiSourcePartId", part.midiSourcePartId);
        p->setProperty ("lastPresetRecordId", part.lastPresetRecordId);
        p->setProperty ("lastPresetName",     part.lastPresetName);
        p->setProperty ("microtuningEnabled", part.microtuningEnabled);
        p->setProperty ("outputPair",       part.outputPair);
        p->setProperty ("effects",          effectsToVar (part.effects));
        // The legacy blocks are mirrors now, not the source of truth: they carry the first
        // slot of each family so a build older than the chain still opens the file with the
        // event chain it understands.
        {
            auto legacyFx = part.midiFx;
            auto legacyArp = part.arp;
            for (const auto& slot : part.midiChain)
            {
                if (slot.type == "arp")            legacyArp = slot.arp;
                else if (slot.type != "arp")       legacyFx  = slot.fx;
            }
            p->setProperty ("midiFx", perf::midiFxToVar (legacyFx));
            p->setProperty ("arp",    perf::arpToVar (legacyArp));
        }

        juce::Array<juce::var> midiChain;
        for (const auto& slot : part.midiChain)
            midiChain.add (perf::midiSlotToVar (slot));
        p->setProperty ("midiChain", midiChain);

        if (! part.sends.isEmpty())
        {
            juce::Array<juce::var> sendVars;
            for (const auto& send : part.sends)
            {
                auto* s = new juce::DynamicObject();
                s->setProperty ("returnId", send.returnId);
                s->setProperty ("level",    send.level);
                sendVars.add (juce::var (s));
            }
            p->setProperty ("sends", sendVars);
        }

        if (! part.extraOuts.isEmpty())
        {
            juce::Array<juce::var> outVars;
            for (const auto& extra : part.extraOuts)
            {
                auto* o = new juce::DynamicObject();
                o->setProperty ("pairIndex", extra.pairIndex);
                o->setProperty ("gain",      extra.gain);
                outVars.add (juce::var (o));
            }
            p->setProperty ("extraOuts", outVars);
        }

        if (part.hardware)
        {
            p->setProperty ("hardware",           true);
            p->setProperty ("midiOutputId",       part.midiOutputId);
            p->setProperty ("midiOutputName",     part.midiOutputName);
            p->setProperty ("midiOutChannel",     part.midiOutChannel);
            p->setProperty ("audioReturnChannel", part.audioReturnChannel);
            p->setProperty ("audioReturnStereo",  part.audioReturnStereo);
            p->setProperty ("programBank",        part.programBank);
            p->setProperty ("programNumber",      part.programNumber);
            p->setProperty ("deviceProfileId",    part.deviceProfileId);
            p->setProperty ("hardwarePatch",      part.hardwarePatchBase64);
            p->setProperty ("hardwarePatchName",  part.hardwarePatchName);
            p->setProperty ("hardwareRestore",    part.hardwareRestore);
        }

        partVars.add (juce::var (p));
    }

    juce::Array<juce::var> pageVars;
    for (const auto& page : pages)
    {
        juce::Array<juce::var> slotVars;
        for (const auto& slot : page.slots)
        {
            auto* s = new juce::DynamicObject();
            s->setProperty ("slotId",      slot.slotId);
            s->setProperty ("partId",      slot.binding.partId);
            s->setProperty ("pluginCeId",  slot.binding.pluginCeId);
            s->setProperty ("parameterId", slot.binding.parameterId);
            s->setProperty ("label",       slot.binding.label);
            s->setProperty ("rangeMin",    slot.binding.rangeMin);
            s->setProperty ("rangeMax",    slot.binding.rangeMax);
            s->setProperty ("inverted",    slot.binding.inverted);
            s->setProperty ("bipolar",     slot.binding.bipolar);
            s->setProperty ("toggle",      slot.binding.toggle);
            s->setProperty ("kind",        slot.kind);
            s->setProperty ("index",       slot.index);
            s->setProperty ("midiCc",      slot.midiCc);
            s->setProperty ("midiChannel", slot.midiChannel);
            s->setProperty ("midiNote",    slot.midiNote);
            s->setProperty ("latched",     slot.latched);
            slotVars.add (juce::var (s));
        }

        auto* pg = new juce::DynamicObject();
        pg->setProperty ("pageId", page.pageId);
        pg->setProperty ("name",   page.name);
        pg->setProperty ("generated", page.generated);
        pg->setProperty ("generatedForPartId", page.generatedForPartId);
        pg->setProperty ("slots",  slotVars);
        pageVars.add (juce::var (pg));
    }

    juce::Array<juce::var> macroVars;
    for (const auto& macro : macros)
    {
        juce::Array<juce::var> targetVars;
        for (const auto& target : macro.targets)
        {
            auto* t = new juce::DynamicObject();
            t->setProperty ("targetId",    target.partId);
            t->setProperty ("pluginCeId",  target.pluginCeId);
            t->setProperty ("parameterId", target.parameterId);
            t->setProperty ("rangeMin",    target.rangeMin);
            t->setProperty ("rangeMax",    target.rangeMax);
            t->setProperty ("inverted",    target.inverted);
            targetVars.add (juce::var (t));
        }

        auto* m = new juce::DynamicObject();
        m->setProperty ("macroId", macro.macroId);
        m->setProperty ("name",    macro.name);
        auto storedValue = macro.value;
        for (const auto& route : modulationRoutes)
            if (route.targetId == macro.macroId && route.parameterId == "@macro")
            {
                storedValue = route.baseValue;
                break;
            }
        m->setProperty ("value",   storedValue);
        m->setProperty ("targets", targetVars);
        macroVars.add (juce::var (m));
    }

    juce::Array<juce::var> modulationVars;
    for (const auto& route : modulationRoutes)
    {
        auto* r = new juce::DynamicObject();
        r->setProperty ("routeId",       route.routeId);
        r->setProperty ("sourceType",    route.sourceType);
        r->setProperty ("sourceId",      route.sourceId);
        r->setProperty ("sourceChannel", route.sourceChannel);
        r->setProperty ("sourceNumber",  route.sourceNumber);
        r->setProperty ("targetId",      route.targetId);
        r->setProperty ("targetCeId",    route.targetCeId);
        r->setProperty ("parameterId",   route.parameterId);
        r->setProperty ("amount",        route.amount);
        r->setProperty ("baseValue",     route.baseValue);
        r->setProperty ("enabled",       route.enabled);
        modulationVars.add (juce::var (r));
    }

    juce::Array<juce::var> lfoVars;
    for (const auto& lfo : midiLfos)
    {
        juce::Array<juce::var> outputVars;
        for (const auto& output : lfo.outputs)
        {
            auto* o = new juce::DynamicObject();
            o->setProperty ("outputId",      output.outputId);
            o->setProperty ("type",          output.type);
            o->setProperty ("targetPartId",  output.targetPartId);
            o->setProperty ("channel",       output.channel);
            o->setProperty ("number",        output.number);
            o->setProperty ("sysexTemplate", output.sysexTemplate);
            o->setProperty ("enabled",       output.enabled);
            outputVars.add (juce::var (o));
        }

        auto* l = new juce::DynamicObject();
        l->setProperty ("lfoId",       lfo.lfoId);
        l->setProperty ("name",        lfo.name);
        l->setProperty ("shape",       lfo.shape);
        l->setProperty ("enabled",     lfo.enabled);
        l->setProperty ("sync",        lfo.sync);
        l->setProperty ("rateHz",      lfo.rateHz);
        l->setProperty ("syncBeats",   lfo.syncBeats);
        l->setProperty ("phaseOffset", lfo.phaseOffset);
        l->setProperty ("minimum",     lfo.minimum);
        l->setProperty ("maximum",     lfo.maximum);
        l->setProperty ("outputs",     outputVars);
        lfoVars.add (juce::var (l));
    }

    juce::Array<juce::var> envelopeVars;
    for (const auto& envelope : envelopes)
    {
        auto* e = new juce::DynamicObject();
        e->setProperty ("envelopeId",    envelope.envelopeId);
        e->setProperty ("name",          envelope.name);
        e->setProperty ("enabled",       envelope.enabled);
        e->setProperty ("channel",       envelope.channel);
        e->setProperty ("noteLow",       envelope.noteLow);
        e->setProperty ("noteHigh",      envelope.noteHigh);
        e->setProperty ("retrigger",     envelope.retrigger);
        e->setProperty ("attackMs",      envelope.attackMs);
        e->setProperty ("decayMs",       envelope.decayMs);
        e->setProperty ("sustain",       envelope.sustain);
        e->setProperty ("releaseMs",     envelope.releaseMs);
        e->setProperty ("curve",         envelope.curve);
        e->setProperty ("velocityAmount", envelope.velocityAmount);
        envelopeVars.add (juce::var (e));
    }

    juce::Array<juce::var> msegVars;
    for (const auto& mseg : msegs)
    {
        juce::Array<juce::var> pointVars;
        for (const auto& point : mseg.points)
        {
            auto* p = new juce::DynamicObject();
            p->setProperty ("pointId",  point.pointId);
            p->setProperty ("position", point.position);
            p->setProperty ("value",    point.value);
            p->setProperty ("curve",    point.curve);
            pointVars.add (juce::var (p));
        }
        auto* m = new juce::DynamicObject();
        m->setProperty ("msegId",      mseg.msegId);
        m->setProperty ("name",        mseg.name);
        m->setProperty ("enabled",     mseg.enabled);
        m->setProperty ("sync",        mseg.sync);
        m->setProperty ("rateHz",      mseg.rateHz);
        m->setProperty ("syncBeats",   mseg.syncBeats);
        m->setProperty ("phaseOffset", mseg.phaseOffset);
        m->setProperty ("points",      pointVars);
        msegVars.add (juce::var (m));
    }

    juce::Array<juce::var> randomVars;
    for (const auto& random : randomModulators)
    {
        auto* r = new juce::DynamicObject();
        r->setProperty ("randomId",    random.randomId);
        r->setProperty ("name",        random.name);
        r->setProperty ("mode",        random.mode);
        r->setProperty ("enabled",     random.enabled);
        r->setProperty ("sync",        random.sync);
        r->setProperty ("rateHz",      random.rateHz);
        r->setProperty ("syncBeats",   random.syncBeats);
        r->setProperty ("seed",        random.seed);
        r->setProperty ("probability", random.probability);
        r->setProperty ("smoothing",   random.smoothing);
        r->setProperty ("stepSize",    random.stepSize);
        r->setProperty ("chaos",       random.chaos);
        r->setProperty ("minimum",     random.minimum);
        r->setProperty ("maximum",     random.maximum);
        randomVars.add (juce::var (r));
    }

    juce::Array<juce::var> layerGroupVars;
    for (const auto& group : layerGroups)
    {
        juce::Array<juce::var> memberVars;
        for (const auto& member : group.members)
        {
            auto* m = new juce::DynamicObject();
            m->setProperty ("partId",    member.partId);
            m->setProperty ("minimum",   member.minimum);
            m->setProperty ("maximum",   member.maximum);
            m->setProperty ("crossfade", member.crossfade);
            memberVars.add (juce::var (m));
        }

        auto* g = new juce::DynamicObject();
        g->setProperty ("layerGroupId", group.layerGroupId);
        g->setProperty ("name",         group.name);
        g->setProperty ("enabled",      group.enabled);
        g->setProperty ("allocation",   group.allocation);
        g->setProperty ("source",       group.source);
        g->setProperty ("controller",   group.controller);
        g->setProperty ("macroId",      group.macroId);
        g->setProperty ("members",      memberVars);
        layerGroupVars.add (juce::var (g));
    }

    auto* root = new juce::DynamicObject();
    root->setProperty ("performanceId", performanceId);
    root->setProperty ("name",          name);
    root->setProperty ("focusedPartId", focusedPartId);
    juce::Array<juce::var> returnVars;
    for (const auto& chain : returns)
    {
        auto* r = new juce::DynamicObject();
        r->setProperty ("returnId", chain.returnId);
        r->setProperty ("name",     chain.name);
        r->setProperty ("level",    chain.level);
        r->setProperty ("effects",  effectsToVar (chain.effects));
        returnVars.add (juce::var (r));
    }

    juce::Array<juce::var> busVars;
    for (const auto& bus : buses)
    {
        auto* b = new juce::DynamicObject();
        b->setProperty ("busId",            bus.busId);
        b->setProperty ("name",             bus.name);
        b->setProperty ("level",            bus.level);
        b->setProperty ("destinationBusId", bus.destinationBusId);
        b->setProperty ("effects",          effectsToVar (bus.effects));
        busVars.add (juce::var (b));
    }

    juce::Array<juce::var> patternVars;
    for (const auto& pattern : patterns)
        patternVars.add (perf::patternToVar (pattern));

    juce::Array<juce::var> grooveVars;
    for (const auto& groove : grooves)
        grooveVars.add (perf::grooveTemplateToVar (groove));

    juce::Array<juce::var> clipVars;
    for (const auto& clip : clips)
        clipVars.add (perf::clipToVar (clip));

    juce::Array<juce::var> sceneVars;
    for (const auto& scene : scenes)
        sceneVars.add (perf::sceneToVar (scene));

    juce::Array<juce::var> performanceTakeVars;
    for (const auto& take : performanceTakes)
    {
        juce::Array<juce::var> actionVars;
        for (const auto& action : take.actions)
        {
            auto* a = new juce::DynamicObject();
            a->setProperty ("sampleOffset", action.sampleOffset);
            a->setProperty ("commandJson", action.commandJson);
            actionVars.add (juce::var (a));
        }

        auto* t = new juce::DynamicObject();
        t->setProperty ("takeId", take.takeId);
        t->setProperty ("name", take.name);
        t->setProperty ("createdAt", take.createdAt);
        t->setProperty ("sampleRate", take.sampleRate);
        t->setProperty ("durationSamples", take.durationSamples);
        t->setProperty ("startPositionPpq", take.startPositionPpq);
        t->setProperty ("transportWasPlaying", take.transportWasPlaying);
        t->setProperty ("initialStateJson", take.initialStateJson);
        t->setProperty ("midiData", take.midiDataBase64);
        t->setProperty ("midiEventCount", take.midiEventCount);
        t->setProperty ("actions", actionVars);
        t->setProperty ("truncated", take.truncated);
        performanceTakeVars.add (juce::var (t));
    }

    // Written last of the lists so the prune below can see every live id. A position whose
    // node has gone is dropped rather than kept: a stale entry is invisible until the id is
    // reused, at which point a brand-new part appears somewhere the user never put it.
    juce::Array<juce::var> positionVars;
    {
        juce::StringArray liveIds { "@master" };
        for (const auto& part : parts)     liveIds.add (part.partId);
        for (const auto& bus : buses)      liveIds.add (bus.busId);
        for (const auto& chain : returns)  liveIds.add (chain.returnId);

        for (const auto& position : canvasPositions)
            if (liveIds.contains (position.nodeId))
            {
                auto* c = new juce::DynamicObject();
                c->setProperty ("nodeId", position.nodeId);
                c->setProperty ("x",      position.x);
                c->setProperty ("y",      position.y);
                positionVars.add (juce::var (c));
            }
    }

    juce::Array<juce::var> tuningDegrees;
    for (const auto cents : microtuning.degreesCents)
        tuningDegrees.add (cents);
    auto* tuning = new juce::DynamicObject();
    tuning->setProperty ("enabled",            microtuning.enabled);
    tuning->setProperty ("name",               microtuning.name);
    tuning->setProperty ("sourceName",         microtuning.sourceName);
    tuning->setProperty ("rootMidiNote",       microtuning.rootMidiNote);
    tuning->setProperty ("referenceMidiNote",  microtuning.referenceMidiNote);
    tuning->setProperty ("referenceFrequency", microtuning.referenceFrequency);
    tuning->setProperty ("mtsDeviceId",        microtuning.mtsDeviceId);
    tuning->setProperty ("mtsProgram",         microtuning.mtsProgram);
    tuning->setProperty ("degreesCents",       tuningDegrees);

    root->setProperty ("canvasPositions", positionVars);
    root->setProperty ("schemaVersion", currentSchemaVersion);
    root->setProperty ("masterLevel",   masterLevel);
    root->setProperty ("outputPairs",   outputPairs);
    root->setProperty ("parts",         partVars);
    root->setProperty ("masterEffects", effectsToVar (masterEffects));
    root->setProperty ("returns",       returnVars);
    root->setProperty ("buses",         busVars);
    root->setProperty ("macros",        macroVars);
    root->setProperty ("midiLfos",      lfoVars);
    root->setProperty ("envelopes",     envelopeVars);
    root->setProperty ("msegs",         msegVars);
    root->setProperty ("randomModulators", randomVars);
    root->setProperty ("layerGroups",   layerGroupVars);
    root->setProperty ("modulationRoutes", modulationVars);
    root->setProperty ("pages",         pageVars);
    root->setProperty ("transport",     perf::transportSettingsToVar (transport));
    root->setProperty ("grooves",       grooveVars);
    root->setProperty ("patterns",      patternVars);
    root->setProperty ("clips",         clipVars);
    root->setProperty ("scenes",        sceneVars);
    root->setProperty ("setlist",       perf::setlistToVar (setlist));
    root->setProperty ("arrangement",   perf::arrangementToVar (arrangement));
    root->setProperty ("performanceTakes", performanceTakeVars);
    root->setProperty ("microtuning",   juce::var (tuning));
    {
        auto* audition = new juce::DynamicObject();
        audition->setProperty ("enabled",      presetAudition.enabled);
        audition->setProperty ("phrase",       presetAudition.phrase);
        audition->setProperty ("rootNote",     presetAudition.rootNote);
        audition->setProperty ("velocity",     presetAudition.velocity);
        audition->setProperty ("noteLengthMs", presetAudition.noteLengthMs);
        audition->setProperty ("gapMs",        presetAudition.gapMs);
        root->setProperty ("presetAudition", juce::var (audition));
    }
    {
        auto* failover = new juce::DynamicObject();
        failover->setProperty ("enabled", automaticFailover.enabled);
        failover->setProperty ("maxAttempts", automaticFailover.maxAttempts);
        failover->setProperty ("retryDelayMs", automaticFailover.retryDelayMs);
        root->setProperty ("automaticFailover", juce::var (failover));
    }
    return juce::var (root);
}

bool Performance::fromVar (const juce::var& stored, Performance& out)
{
    out = Performance();

    if (! stored.isObject())
        return false;

    Performance parsed = Performance::create();
    parsed.performanceId = stored.getProperty ("performanceId", {}).toString();
    parsed.name          = stored.getProperty ("name", {}).toString();
    parsed.focusedPartId = stored.getProperty ("focusedPartId", {}).toString();
    // Absent = a pre-Stage-6 document. It migrates by gaining this stage's defaults, which is
    // what every field below already does when its key is missing — the version is recorded
    // so a future migration that needs more than defaults can tell the difference.
    parsed.schemaVersion = juce::jlimit (1, currentSchemaVersion,
                                         (int) stored.getProperty ("schemaVersion", 1));
    parsed.masterLevel = floatOf (stored, "masterLevel", 1.0f, 0.0f, 2.0f);
    parsed.outputPairs = intOf (stored, "outputPairs", 1, 1, 8);

    if (const auto audition = stored.getProperty ("presetAudition", {}); audition.isObject())
    {
        static const juce::StringArray phrases { "single", "chord", "scale", "riff" };
        parsed.presetAudition.enabled = (bool) audition.getProperty ("enabled", false);
        const auto phrase = audition.getProperty ("phrase", "chord").toString();
        parsed.presetAudition.phrase = phrases.contains (phrase) ? phrase : juce::String ("chord");
        parsed.presetAudition.rootNote = intOf (audition, "rootNote", 60, 0, 127);
        parsed.presetAudition.velocity = intOf (audition, "velocity", 100, 1, 127);
        parsed.presetAudition.noteLengthMs = intOf (audition, "noteLengthMs", 360, 40, 4000);
        parsed.presetAudition.gapMs = intOf (audition, "gapMs", 90, 0, 2000);
    }

    if (const auto failover = stored.getProperty ("automaticFailover", {}); failover.isObject())
    {
        parsed.automaticFailover.enabled = (bool) failover.getProperty ("enabled", true);
        parsed.automaticFailover.maxAttempts = intOf (failover, "maxAttempts", 3, 1, 5);
        parsed.automaticFailover.retryDelayMs = intOf (failover, "retryDelayMs", 500, 100, 10000);
    }

    if (const auto tuning = stored.getProperty ("microtuning", {}); tuning.isObject())
    {
        auto candidate = perf::Microtuning::equalTemperament();
        candidate.enabled = (bool) tuning.getProperty ("enabled", false);
        candidate.name = tuning.getProperty ("name", candidate.name).toString().substring (0, 80);
        candidate.sourceName = tuning.getProperty ("sourceName", {}).toString().substring (0, 260);
        candidate.rootMidiNote = intOf (tuning, "rootMidiNote", 60, 0, 127);
        candidate.referenceMidiNote = intOf (tuning, "referenceMidiNote", 69, 0, 127);
        candidate.referenceFrequency = (double) floatOf (tuning, "referenceFrequency",
                                                          440.0f, 1.0f, 40000.0f);
        candidate.mtsDeviceId = intOf (tuning, "mtsDeviceId", 127, 0, 127);
        candidate.mtsProgram = intOf (tuning, "mtsProgram", 0, 0, 127);

        if (const auto* degrees = tuning.getProperty ("degreesCents", {}).getArray())
        {
            juce::Array<double> parsedDegrees;
            auto valid = degrees->size() >= 2 && degrees->size() <= 129;
            auto previous = -1.0;
            for (const auto& degree : *degrees)
            {
                const auto cents = (double) degree;
                valid = valid && std::isfinite (cents) && cents >= 0.0
                     && cents > previous && cents <= 19200.0;
                if (parsedDegrees.isEmpty())
                    valid = valid && juce::approximatelyEqual (cents, 0.0);
                parsedDegrees.add (cents);
                previous = cents;
            }
            if (valid)
                candidate.degreesCents = std::move (parsedDegrees);
            else
                candidate.enabled = false;
        }
        parsed.microtuning = std::move (candidate);
    }

    if (parsed.performanceId.isEmpty())
        return false;

    const auto* partArray = stored.getProperty ("parts", {}).getArray();
    if (partArray == nullptr)
        return false;

    juce::StringArray seenIds;

    for (const auto& p : *partArray)
    {
        RackPart part;
        part.partId = p.getProperty ("partId", {}).toString();

        if (part.partId.isEmpty() || seenIds.contains (part.partId))
            return false;
        seenIds.add (part.partId);

        part.pluginCeId       = p.getProperty ("pluginCeId", {}).toString();
        part.pluginModulePath = p.getProperty ("pluginModulePath", {}).toString();
        part.pluginName       = p.getProperty ("pluginName", {}).toString();
        part.pluginVendor     = p.getProperty ("pluginVendor", {}).toString();
        part.stateBlobBase64  = p.getProperty ("stateBlob", {}).toString();
        part.stateBlobHash    = p.getProperty ("stateBlobHash", {}).toString();

        part.midi.channel      = intOf (p, "channel", 0, 0, 16);
        part.midi.keyLow       = intOf (p, "keyLow", 0, 0, 127);
        part.midi.keyHigh      = intOf (p, "keyHigh", 127, 0, 127);
        part.midi.velocityLow  = intOf (p, "velocityLow", 1, 1, 127);
        part.midi.velocityHigh = intOf (p, "velocityHigh", 127, 1, 127);
        part.midi.transpose    = intOf (p, "transpose", 0, -60, 60);

        if (part.midi.keyLow > part.midi.keyHigh)
            std::swap (part.midi.keyLow, part.midi.keyHigh);
        if (part.midi.velocityLow > part.midi.velocityHigh)
            std::swap (part.midi.velocityLow, part.midi.velocityHigh);

        perf::midiFxFromVar (p.getProperty ("midiFx", {}), part.midiFx);
        perf::arpFromVar    (p.getProperty ("arp", {}), part.arp);

        if (const auto* chain = p.getProperty ("midiChain", {}).getArray())
        {
            for (const auto& stored : *chain)
            {
                if (part.midiChain.size() >= 8)
                    break;
                perf::MidiSlot slot;
                perf::midiSlotFromVar (stored, slot);
                if (slot.slotId.isEmpty())
                    slot.slotId = juce::Uuid().toDashedString();
                part.midiChain.add (std::move (slot));
            }
        }
        else
        {
            // MIGRATION, and the rule is that it is inaudible: a pre-chain session becomes
            // the two slots its old settings describe, in the order the old code ran them —
            // the combined note-shaping block first, the arpeggiator after it.
            part.midiChain = perf::migrateLegacyEventChain (part.midiFx, part.arp);
        }

        part.enabled    = (bool) p.getProperty ("enabled", true);
        part.mute       = (bool) p.getProperty ("mute", false);
        part.solo       = (bool) p.getProperty ("solo", false);
        part.volume     = floatOf (p, "volume", 1.0f, 0.0f, 2.0f);
        part.pan        = floatOf (p, "pan", 0.0f, -1.0f, 1.0f);
        part.editorOpen = (bool) p.getProperty ("editorOpen", false);
        part.destinationBusId = p.getProperty ("destinationBusId", {}).toString();
        part.midiSourcePartId = p.getProperty ("midiSourcePartId", {}).toString();
        part.lastPresetRecordId = p.getProperty ("lastPresetRecordId", {}).toString();
        part.lastPresetName     = p.getProperty ("lastPresetName", {}).toString();
        part.microtuningEnabled = (bool) p.getProperty ("microtuningEnabled", false);
        part.outputPair = intOf (p, "outputPair", 0, 0, 7);

        // Explicit multi-output pairs: a clamped pair index, duplicates dropped — a damaged
        // route is a nit, not a reason to refuse the rig.
        if (const auto* outArray = p.getProperty ("extraOuts", {}).getArray())
            for (const auto& o : *outArray)
            {
                ExtraOut extra;
                extra.pairIndex = intOf (o, "pairIndex", 1, 1, 15);
                extra.gain      = floatOf (o, "gain", 1.0f, 0.0f, 2.0f);

                bool duplicate = false;
                for (const auto& existing : part.extraOuts)
                    duplicate = duplicate || existing.pairIndex == extra.pairIndex;
                if (! duplicate)
                    part.extraOuts.add (extra);
            }

        if ((bool) p.getProperty ("hardware", false))
        {
            part.hardware           = true;
            part.midiOutputId       = p.getProperty ("midiOutputId", {}).toString();
            part.midiOutputName     = p.getProperty ("midiOutputName", {}).toString();
            part.midiOutChannel     = intOf (p, "midiOutChannel", 1, 1, 16);
            part.audioReturnChannel = intOf (p, "audioReturnChannel", -1, -1, 63);
            part.audioReturnStereo  = (bool) p.getProperty ("audioReturnStereo", true);
            part.programBank        = intOf (p, "programBank", -1, -1, 16383);
            part.programNumber      = intOf (p, "programNumber", -1, -1, 127);
            part.deviceProfileId    = p.getProperty ("deviceProfileId", {}).toString();
            part.hardwarePatchBase64 = p.getProperty ("hardwarePatch", {}).toString();
            part.hardwarePatchName   = p.getProperty ("hardwarePatchName", {}).toString();
            {
                // Absent reads as "ask", which is the only safe default: a session written
                // before this existed must not start transmitting on open.
                const auto policy = p.getProperty ("hardwareRestore", {}).toString();
                part.hardwareRestore = (policy == "always" || policy == "never") ? policy
                                                                                : juce::String ("ask");
            }
        }

        parsed.parts.add (std::move (part));
    }

    // One part may belong to at most one layer group: otherwise two upstream decisions
    // would compete for the same private MIDI destination. Damaged entries are discarded
    // rather than making the whole performance unloadable; valid groups remain playable.
    if (const auto* groupArray = stored.getProperty ("layerGroups", {}).getArray())
    {
        juce::StringArray seenGroupIds, claimedPartIds;
        static const juce::StringArray allocations { "all", "roundRobin", "leastBusy" };
        static const juce::StringArray sources { "velocity", "key", "cc", "expression", "macro" };

        for (const auto& value : *groupArray)
        {
            if (parsed.layerGroups.size() >= 32)
                break;

            LayerGroup group;
            group.layerGroupId = value.getProperty ("layerGroupId", {}).toString();
            if (group.layerGroupId.isEmpty() || seenGroupIds.contains (group.layerGroupId))
                continue;
            seenGroupIds.add (group.layerGroupId);

            group.name = value.getProperty ("name", "Layer").toString().trim().substring (0, 80);
            group.enabled = (bool) value.getProperty ("enabled", true);
            group.allocation = value.getProperty ("allocation", "all").toString();
            if (! allocations.contains (group.allocation))
                group.allocation = "all";
            group.source = value.getProperty ("source", "velocity").toString();
            if (! sources.contains (group.source))
                group.source = "velocity";
            group.controller = intOf (value, "controller", 11, 0, 127);
            group.macroId = value.getProperty ("macroId", {}).toString();

            juce::StringArray candidatePartIds;
            if (const auto* members = value.getProperty ("members", {}).getArray())
                for (const auto& memberValue : *members)
                {
                    if (group.members.size() >= 8)
                        break;
                    LayerMember member;
                    member.partId = memberValue.getProperty ("partId", {}).toString();
                    if (member.partId.isEmpty() || candidatePartIds.contains (member.partId)
                        || claimedPartIds.contains (member.partId)
                        || parsed.findPart (member.partId) == nullptr
                        || parsed.findPart (member.partId)->midiSourcePartId.isNotEmpty())
                        continue;

                    member.minimum = floatOf (memberValue, "minimum", 0.0f, 0.0f, 1.0f);
                    member.maximum = floatOf (memberValue, "maximum", 1.0f, 0.0f, 1.0f);
                    if (member.minimum > member.maximum)
                        std::swap (member.minimum, member.maximum);
                    member.crossfade = floatOf (memberValue, "crossfade", 0.0f, 0.0f, 0.5f);
                    candidatePartIds.add (member.partId);
                    group.members.add (std::move (member));
                }

            if (group.members.size() < 2)
                continue;
            claimedPartIds.addArray (candidatePartIds);
            parsed.layerGroups.add (std::move (group));
        }
    }

    // Effect identities follow the part rules: empty or duplicated ids (across every chain)
    // fail the load; an absent array is a pre-Stage-5 document and loads clean.
    juce::StringArray seenEffectIds;
    for (int i = 0; i < parsed.parts.size(); ++i)
        if (! effectsFromVar ((*partArray)[i].getProperty ("effects", {}),
                              parsed.parts.getReference (i).effects, seenEffectIds))
            return false;
    if (! effectsFromVar (stored.getProperty ("masterEffects", {}), parsed.masterEffects, seenEffectIds))
        return false;

    // Return chains carry the same identity rules as everything else; their effect ids share
    // the one namespace with every insert chain.
    if (const auto* returnArray = stored.getProperty ("returns", {}).getArray())
    {
        juce::StringArray seenReturnIds;
        for (const auto& r : *returnArray)
        {
            ReturnChain chain;
            chain.returnId = r.getProperty ("returnId", {}).toString();
            if (chain.returnId.isEmpty() || seenReturnIds.contains (chain.returnId))
                return false;
            seenReturnIds.add (chain.returnId);

            chain.name  = r.getProperty ("name", {}).toString();
            chain.level = floatOf (r, "level", 1.0f, 0.0f, 2.0f);
            if (! effectsFromVar (r.getProperty ("effects", {}), chain.effects, seenEffectIds))
                return false;

            parsed.returns.add (std::move (chain));
        }
    }

    // Group buses share the one effect-id namespace with every other insert chain.
    if (const auto* busArray = stored.getProperty ("buses", {}).getArray())
    {
        juce::StringArray seenBusIds;
        for (const auto& b : *busArray)
        {
            BusChain bus;
            bus.busId = b.getProperty ("busId", {}).toString();
            if (bus.busId.isEmpty() || seenBusIds.contains (bus.busId))
                return false;
            seenBusIds.add (bus.busId);

            bus.name  = b.getProperty ("name", {}).toString();
            bus.level = floatOf (b, "level", 1.0f, 0.0f, 2.0f);
            bus.destinationBusId = b.getProperty ("destinationBusId", {}).toString();
            if (! effectsFromVar (b.getProperty ("effects", {}), bus.effects, seenEffectIds))
                return false;

            parsed.buses.add (std::move (bus));
        }

        // A destination naming a bus that is not here, or one that closes a loop, falls back
        // to the master: a damaged routing plays through the desk rather than refusing to
        // load, and it says so by being visibly plain.
        for (auto& bus : parsed.buses)
            if (bus.destinationBusId.isNotEmpty()
                && (parsed.findBus (bus.destinationBusId) == nullptr
                    || parsed.busRoutingWouldLoop (bus.busId, bus.destinationBusId)))
                bus.destinationBusId.clear();
    }

    // A part routed into a bus that did not survive goes back to the master, same rule.
    for (auto& part : parsed.parts)
        if (part.destinationBusId.isNotEmpty() && parsed.findBus (part.destinationBusId) == nullptr)
            part.destinationBusId.clear();

    // Sends parse after returns so a send into a return that no longer exists can be dropped
    // (a stranded send is the damaged nit; the rig still loads).
    for (int i = 0; i < parsed.parts.size(); ++i)
        if (const auto* sendArray = (*partArray)[i].getProperty ("sends", {}).getArray())
            for (const auto& s : *sendArray)
            {
                PartSend send;
                send.returnId = s.getProperty ("returnId", {}).toString();
                send.level    = floatOf (s, "level", 0.0f, 0.0f, 2.0f);

                bool duplicate = false;
                for (const auto& existing : parsed.parts.getReference (i).sends)
                    duplicate = duplicate || existing.returnId == send.returnId;

                if (! duplicate && parsed.findReturn (send.returnId) != nullptr)
                    parsed.parts.getReference (i).sends.add (std::move (send));
            }

    if (const auto* macroArray = stored.getProperty ("macros", {}).getArray())
    {
        juce::StringArray seenMacroIds;
        for (const auto& m : *macroArray)
        {
            Macro macro;
            macro.macroId = m.getProperty ("macroId", {}).toString();
            if (macro.macroId.isEmpty() || seenMacroIds.contains (macro.macroId))
                return false;
            seenMacroIds.add (macro.macroId);

            macro.name  = m.getProperty ("name", {}).toString();
            macro.value = floatOf (m, "value", 0.0f, 0.0f, 1.0f);

            if (const auto* targetArray = m.getProperty ("targets", {}).getArray())
                for (const auto& t : *targetArray)
                {
                    ControlBinding target;
                    target.partId      = t.getProperty ("targetId", {}).toString();
                    target.pluginCeId  = t.getProperty ("pluginCeId", {}).toString();
                    target.parameterId = t.getProperty ("parameterId", {}).toString();
                    target.rangeMin    = floatOf (t, "rangeMin", 0.0f, 0.0f, 1.0f);
                    target.rangeMax    = floatOf (t, "rangeMax", 1.0f, 0.0f, 1.0f);
                    if (target.rangeMin > target.rangeMax)
                        std::swap (target.rangeMin, target.rangeMax);
                    target.inverted    = (bool) t.getProperty ("inverted", false);
                    macro.targets.add (std::move (target));
                }

            parsed.macros.add (std::move (macro));
        }
    }

    // A deleted macro must not leave a silent crossfade behind on restore. The live command
    // performs this migration at deletion time; this is the repair path for hand-edited or
    // older manifests.
    for (auto& group : parsed.layerGroups)
        if (group.source == "macro" && parsed.findMacro (group.macroId) == nullptr)
        {
            group.source = "velocity";
            group.macroId.clear();
        }

    if (const auto* routeArray = stored.getProperty ("modulationRoutes", {}).getArray())
    {
        juce::StringArray seenRouteIds;
        for (const auto& r : *routeArray)
        {
            ModulationRoute route;
            route.routeId = r.getProperty ("routeId", {}).toString();
            if (route.routeId.isEmpty() || seenRouteIds.contains (route.routeId))
                return false;
            seenRouteIds.add (route.routeId);

            route.sourceType    = r.getProperty ("sourceType", {}).toString();
            route.sourceId      = r.getProperty ("sourceId", {}).toString();
            route.sourceChannel = intOf (r, "sourceChannel", 0, 0, 16);
            route.sourceNumber  = intOf (r, "sourceNumber", 0, 0, 127);
            route.targetId      = r.getProperty ("targetId", {}).toString();
            route.targetCeId    = r.getProperty ("targetCeId", {}).toString();
            route.parameterId   = r.getProperty ("parameterId", {}).toString();
            route.amount        = floatOf (r, "amount", 0.25f, -1.0f, 1.0f);
            route.baseValue     = floatOf (r, "baseValue", 0.0f, 0.0f, 1.0f);
            route.enabled       = (bool) r.getProperty ("enabled", true);
            if (route.sourceType == "macro" || route.sourceType == "lfo"
                || route.sourceType == "envelope" || route.sourceType == "mseg"
                || route.sourceType == "random")
            {
                route.sourceChannel = 0;
                route.sourceNumber = 0;
            }

            // Broken cables remain visible and repairable, just like stale control-page and
            // macro bindings. Only malformed source names are omitted: there is no useful
            // way to present or evaluate a cable whose source vocabulary is unknown.
            static const juce::StringArray sourceTypes {
                "velocity", "modWheel", "expression", "channelPressure",
                "polyAftertouch", "pitchBend", "midiCc", "macro", "lfo", "envelope", "mseg",
                "random"
            };
            if (sourceTypes.contains (route.sourceType)
                && route.targetId.isNotEmpty() && route.parameterId.isNotEmpty())
                parsed.modulationRoutes.add (std::move (route));
        }
    }

    if (const auto* lfoArray = stored.getProperty ("midiLfos", {}).getArray())
    {
        juce::StringArray seenLfoIds;
        static const juce::StringArray shapes {
            "sine", "triangle", "sawUp", "sawDown", "square", "sampleHold"
        };
        static const juce::StringArray outputTypes { "cc", "nrpn", "sysex" };

        for (const auto& l : *lfoArray)
        {
            if (parsed.midiLfos.size() >= 32)
                break;

            MidiLfo lfo;
            lfo.lfoId = l.getProperty ("lfoId", {}).toString();
            if (lfo.lfoId.isEmpty() || seenLfoIds.contains (lfo.lfoId))
                return false;
            seenLfoIds.add (lfo.lfoId);

            lfo.name = l.getProperty ("name", {}).toString().trim();
            lfo.shape = l.getProperty ("shape", "sine").toString();
            if (! shapes.contains (lfo.shape))
                lfo.shape = "sine";
            lfo.enabled = (bool) l.getProperty ("enabled", true);
            lfo.sync = (bool) l.getProperty ("sync", true);
            lfo.rateHz = (double) floatOf (l, "rateHz", 1.0f, 0.01f, 40.0f);
            lfo.syncBeats = (double) floatOf (l, "syncBeats", 1.0f, 0.03125f, 64.0f);
            lfo.phaseOffset = floatOf (l, "phaseOffset", 0.0f, 0.0f, 1.0f);
            lfo.minimum = floatOf (l, "minimum", 0.0f, 0.0f, 1.0f);
            lfo.maximum = floatOf (l, "maximum", 1.0f, 0.0f, 1.0f);
            if (lfo.minimum > lfo.maximum)
                std::swap (lfo.minimum, lfo.maximum);

            if (const auto* outputs = l.getProperty ("outputs", {}).getArray())
            {
                juce::StringArray seenOutputIds;
                for (const auto& o : *outputs)
                {
                    if (lfo.outputs.size() >= 32)
                        break;

                    MidiLfoOutput output;
                    output.outputId = o.getProperty ("outputId", {}).toString();
                    if (output.outputId.isEmpty() || seenOutputIds.contains (output.outputId))
                        return false;
                    seenOutputIds.add (output.outputId);

                    output.type = o.getProperty ("type", "cc").toString();
                    if (! outputTypes.contains (output.type))
                        continue;
                    output.targetPartId = o.getProperty ("targetPartId", {}).toString();
                    output.channel = intOf (o, "channel", 1, 1, 16);
                    output.number = intOf (o, "number", 1, 0,
                                           output.type == "nrpn" ? 16383 : 127);
                    output.sysexTemplate = o.getProperty ("sysexTemplate",
                                                          "F0 7D {value7} F7").toString();
                    output.enabled = (bool) o.getProperty ("enabled", false);
                    lfo.outputs.add (std::move (output));
                }
            }

            parsed.midiLfos.add (std::move (lfo));
        }
    }

    if (const auto* envelopeArray = stored.getProperty ("envelopes", {}).getArray())
    {
        juce::StringArray seenEnvelopeIds;
        for (const auto& e : *envelopeArray)
        {
            if (parsed.envelopes.size() >= 32)
                break;

            EnvelopeGenerator envelope;
            envelope.envelopeId = e.getProperty ("envelopeId", {}).toString();
            if (envelope.envelopeId.isEmpty()
                || seenEnvelopeIds.contains (envelope.envelopeId))
                return false;
            seenEnvelopeIds.add (envelope.envelopeId);

            envelope.name = e.getProperty ("name", {}).toString().trim();
            envelope.enabled = (bool) e.getProperty ("enabled", true);
            envelope.channel = intOf (e, "channel", 0, 0, 16);
            envelope.noteLow = intOf (e, "noteLow", 0, 0, 127);
            envelope.noteHigh = intOf (e, "noteHigh", 127, 0, 127);
            if (envelope.noteLow > envelope.noteHigh)
                std::swap (envelope.noteLow, envelope.noteHigh);
            envelope.retrigger = (bool) e.getProperty ("retrigger", true);
            envelope.attackMs = (double) floatOf (e, "attackMs", 20.0f, 0.0f, 60000.0f);
            envelope.decayMs = (double) floatOf (e, "decayMs", 180.0f, 0.0f, 60000.0f);
            envelope.sustain = floatOf (e, "sustain", 0.65f, 0.0f, 1.0f);
            envelope.releaseMs = (double) floatOf (e, "releaseMs", 350.0f, 0.0f, 60000.0f);
            envelope.curve = floatOf (e, "curve", 0.0f, -1.0f, 1.0f);
            envelope.velocityAmount = floatOf (e, "velocityAmount", 0.0f, 0.0f, 1.0f);
            parsed.envelopes.add (std::move (envelope));
        }
    }

    if (const auto* msegArray = stored.getProperty ("msegs", {}).getArray())
    {
        juce::StringArray seenMsegIds;
        for (const auto& m : *msegArray)
        {
            if (parsed.msegs.size() >= 32)
                break;

            MsegGenerator mseg;
            mseg.msegId = m.getProperty ("msegId", {}).toString();
            if (mseg.msegId.isEmpty() || seenMsegIds.contains (mseg.msegId))
                return false;
            seenMsegIds.add (mseg.msegId);
            mseg.name = m.getProperty ("name", {}).toString().trim();
            mseg.enabled = (bool) m.getProperty ("enabled", true);
            mseg.sync = (bool) m.getProperty ("sync", true);
            mseg.rateHz = (double) floatOf (m, "rateHz", 0.5f, 0.01f, 40.0f);
            mseg.syncBeats = (double) floatOf (m, "syncBeats", 4.0f, 0.03125f, 64.0f);
            mseg.phaseOffset = floatOf (m, "phaseOffset", 0.0f, 0.0f, 1.0f);

            const auto* points = m.getProperty ("points", {}).getArray();
            if (points == nullptr || points->size() < 2)
                return false;
            juce::StringArray seenPointIds;
            for (const auto& p : *points)
            {
                if (mseg.points.size() >= 64)
                    break;
                MsegPoint point;
                point.pointId = p.getProperty ("pointId", {}).toString();
                if (point.pointId.isEmpty() || seenPointIds.contains (point.pointId))
                    return false;
                seenPointIds.add (point.pointId);
                point.position = floatOf (p, "position", 0.0f, 0.0f, 1.0f);
                point.value = floatOf (p, "value", 0.0f, 0.0f, 1.0f);
                point.curve = floatOf (p, "curve", 0.0f, -1.0f, 1.0f);
                mseg.points.add (std::move (point));
            }
            std::sort (mseg.points.begin(), mseg.points.end(),
                       [] (const MsegPoint& a, const MsegPoint& b)
                       { return a.position < b.position; });
            mseg.points.getReference (0).position = 0.0f;
            mseg.points.getReference (mseg.points.size() - 1).position = 1.0f;
            parsed.msegs.add (std::move (mseg));
        }
    }

    if (const auto* randomArray = stored.getProperty ("randomModulators", {}).getArray())
    {
        juce::StringArray seenRandomIds;
        static const juce::StringArray modes {
            "sampleHold", "smoothRandom", "chaos", "randomWalk"
        };
        for (const auto& r : *randomArray)
        {
            if (parsed.randomModulators.size() >= 32)
                break;

            RandomModulator random;
            random.randomId = r.getProperty ("randomId", {}).toString();
            if (random.randomId.isEmpty() || seenRandomIds.contains (random.randomId))
                return false;
            seenRandomIds.add (random.randomId);
            random.name = r.getProperty ("name", {}).toString().trim();
            random.mode = r.getProperty ("mode", "sampleHold").toString();
            if (! modes.contains (random.mode))
                random.mode = "sampleHold";
            random.enabled = (bool) r.getProperty ("enabled", true);
            random.sync = (bool) r.getProperty ("sync", true);
            random.rateHz = (double) floatOf (r, "rateHz", 2.0f, 0.01f, 40.0f);
            random.syncBeats = (double) floatOf (r, "syncBeats", 0.5f, 0.03125f, 64.0f);
            random.seed = intOf (r, "seed", 1, 1, 0x7fffffff);
            random.probability = floatOf (r, "probability", 1.0f, 0.0f, 1.0f);
            random.smoothing = floatOf (r, "smoothing", 1.0f, 0.0f, 1.0f);
            random.stepSize = floatOf (r, "stepSize", 0.2f, 0.0f, 1.0f);
            random.chaos = floatOf (r, "chaos", 0.85f, 0.0f, 1.0f);
            random.minimum = floatOf (r, "minimum", 0.0f, 0.0f, 1.0f);
            random.maximum = floatOf (r, "maximum", 1.0f, 0.0f, 1.0f);
            if (random.minimum > random.maximum)
                std::swap (random.minimum, random.maximum);
            parsed.randomModulators.add (std::move (random));
        }
    }

    if (parsed.focusedPartId.isNotEmpty() && parsed.indexOfPart (parsed.focusedPartId) < 0)
        parsed.focusedPartId = {};

    // Pages follow the parts' structural rules: identity damage fails the load, values clamp.
    // An absent pages array is a Stage 1 document and loads clean — bindings simply don't
    // exist yet.
    if (const auto* pageArray = stored.getProperty ("pages", {}).getArray())
    {
        juce::StringArray seenPageIds;
        for (const auto& pg : *pageArray)
        {
            ControlPage page;
            page.pageId = pg.getProperty ("pageId", {}).toString();
            if (page.pageId.isEmpty() || seenPageIds.contains (page.pageId))
                return false;
            seenPageIds.add (page.pageId);

            page.name = pg.getProperty ("name", {}).toString();
            page.generated = (bool) pg.getProperty ("generated", false);
            page.generatedForPartId = pg.getProperty ("generatedForPartId", {}).toString();

            juce::StringArray seenSlotIds;
            int legacyEncoders = 0;   // a slot with no kind is an encoder at its place among them
            if (const auto* slotArray = pg.getProperty ("slots", {}).getArray())
                for (const auto& s : *slotArray)
                {
                    ControlSlot slot;
                    slot.slotId = s.getProperty ("slotId", {}).toString();
                    if (slot.slotId.isEmpty() || seenSlotIds.contains (slot.slotId))
                        return false;
                    seenSlotIds.add (slot.slotId);

                    // Which control the slot rides. Absent — every manifest written before
                    // faders and pads had slots — means encoder N for the Nth such slot,
                    // which is the join those pages were built on and must keep.
                    {
                        const auto kind = s.getProperty ("kind", {}).toString();
                        slot.kind = (kind == "fader" || kind == "pad") ? kind : juce::String ("encoder");
                        const auto index = (int) s.getProperty ("index", -1);
                        if (index >= 0)
                            slot.index = juce::jmin (127, index);
                        else if (slot.kind == "encoder" && ! s.hasProperty ("index"))
                            slot.index = legacyEncoders;
                        else
                            slot.index = -1;
                        if (slot.kind == "encoder")
                            ++legacyEncoders;
                    }

                    slot.binding.partId      = s.getProperty ("partId", {}).toString();
                    slot.binding.pluginCeId  = s.getProperty ("pluginCeId", {}).toString();
                    slot.binding.parameterId = s.getProperty ("parameterId", {}).toString();
                    slot.binding.label       = s.getProperty ("label", {}).toString();
                    slot.binding.rangeMin    = floatOf (s, "rangeMin", 0.0f, 0.0f, 1.0f);
                    slot.binding.rangeMax    = floatOf (s, "rangeMax", 1.0f, 0.0f, 1.0f);
                    slot.binding.inverted    = (bool) s.getProperty ("inverted", false);
                    slot.binding.bipolar     = (bool) s.getProperty ("bipolar", false);
                    slot.binding.toggle      = (bool) s.getProperty ("toggle", false);
                    slot.midiCc      = juce::jlimit (-1, 127, (int) s.getProperty ("midiCc", -1));
                    slot.midiChannel = juce::jlimit (0, 16, (int) s.getProperty ("midiChannel", 0));
                    slot.midiNote    = juce::jlimit (-1, 127, (int) s.getProperty ("midiNote", -1));
                    slot.latched     = (bool) s.getProperty ("latched", false);
                    page.slots.add (std::move (slot));
                }

            parsed.pages.add (std::move (page));
        }
    }

    // The Stage 6 performance system. Identity damage fails the load the way it does for
    // parts and pages; an absent array is a pre-Stage-6 document and loads clean.
    perf::transportSettingsFromVar (stored.getProperty ("transport", {}), parsed.transport);

    if (const auto* grooveArray = stored.getProperty ("grooves", {}).getArray())
    {
        parsed.grooves.clearQuick();
        juce::StringArray seenGrooveIds;
        for (const auto& g : *grooveArray)
        {
            perf::GrooveTemplate groove;
            if (! perf::grooveTemplateFromVar (g, groove)
                || seenGrooveIds.contains (groove.grooveId))
                return false;
            seenGrooveIds.add (groove.grooveId);
            parsed.grooves.add (std::move (groove));
        }
    }

    if (const auto* patternArray = stored.getProperty ("patterns", {}).getArray())
    {
        juce::StringArray seenPatternIds;
        for (const auto& p : *patternArray)
        {
            perf::Pattern pattern;
            if (! perf::patternFromVar (p, pattern) || seenPatternIds.contains (pattern.patternId))
                return false;
            seenPatternIds.add (pattern.patternId);
            parsed.patterns.add (std::move (pattern));
        }
    }

    if (const auto* clipArray = stored.getProperty ("clips", {}).getArray())
    {
        juce::StringArray seenClipIds;
        for (const auto& c : *clipArray)
        {
            perf::Clip clip;
            if (! perf::clipFromVar (c, clip) || seenClipIds.contains (clip.clipId))
                return false;
            seenClipIds.add (clip.clipId);
            parsed.clips.add (std::move (clip));
        }
    }

    if (const auto* sceneArray = stored.getProperty ("scenes", {}).getArray())
    {
        juce::StringArray seenSceneIds;
        for (const auto& s : *sceneArray)
        {
            perf::Scene scene;
            if (! perf::sceneFromVar (s, scene) || seenSceneIds.contains (scene.sceneId))
                return false;
            seenSceneIds.add (scene.sceneId);
            parsed.scenes.add (std::move (scene));
        }
    }

    if (! perf::setlistFromVar (stored.getProperty ("setlist", {}), parsed.setlist))
        return false;
    if (! perf::arrangementFromVar (stored.getProperty ("arrangement", {}), parsed.arrangement))
        return false;

    if (const auto* takeArray = stored.getProperty ("performanceTakes", {}).getArray())
    {
        juce::StringArray seenTakeIds;
        for (const auto& t : *takeArray)
        {
            if (parsed.performanceTakes.size() >= 32 || ! t.isObject())
                break;

            PerformanceTake take;
            take.takeId = t.getProperty ("takeId", {}).toString();
            if (take.takeId.isEmpty() || seenTakeIds.contains (take.takeId))
                return false;
            seenTakeIds.add (take.takeId);
            take.name = t.getProperty ("name", "Performance take").toString().trim().substring (0, 80);
            take.createdAt = t.getProperty ("createdAt", {}).toString().substring (0, 80);
            take.sampleRate = juce::jlimit (8000.0, 768000.0,
                                            (double) t.getProperty ("sampleRate", 44100.0));
            take.durationSamples = juce::jmax ((juce::int64) 0,
                (juce::int64) t.getProperty ("durationSamples", (juce::int64) 0));
            take.startPositionPpq = juce::jmax (0.0,
                (double) t.getProperty ("startPositionPpq", 0.0));
            take.transportWasPlaying = (bool) t.getProperty ("transportWasPlaying", false);
            take.initialStateJson = t.getProperty ("initialStateJson", {}).toString();
            take.midiDataBase64 = t.getProperty ("midiData", {}).toString();
            take.midiEventCount = juce::jlimit (0, 500000,
                (int) t.getProperty ("midiEventCount", 0));
            take.truncated = (bool) t.getProperty ("truncated", false);

            if (const auto* actions = t.getProperty ("actions", {}).getArray())
                for (const auto& a : *actions)
                {
                    if (take.actions.size() >= 100000 || ! a.isObject())
                    {
                        take.truncated = true;
                        break;
                    }
                    PerformanceTakeAction action;
                    action.sampleOffset = juce::jlimit ((juce::int64) 0, take.durationSamples,
                        (juce::int64) a.getProperty ("sampleOffset", (juce::int64) 0));
                    action.commandJson = a.getProperty ("commandJson", {}).toString();
                    if (action.commandJson.isNotEmpty())
                        take.actions.add (std::move (action));
                }

            parsed.performanceTakes.add (std::move (take));
        }
    }

    // Canvas positions are a preference, so a malformed one is skipped rather than refusing
    // the whole session: losing a rig because a box's coordinate was a string would be an
    // absurd trade. An absent list is the pre-Stage-5 document, which auto-lays-out as it
    // always did — the repo's habit of migrating by construction rather than by version.
    if (const auto* positionArray = stored.getProperty ("canvasPositions", {}).getArray())
    {
        juce::StringArray seenNodeIds;
        for (const auto& c : *positionArray)
        {
            CanvasNodePosition position;
            position.nodeId = c.getProperty ("nodeId", {}).toString();

            if (position.nodeId.isEmpty() || seenNodeIds.contains (position.nodeId))
                continue;

            seenNodeIds.add (position.nodeId);
            position.x = intOf (c, "x", 0, 0, 100000);
            position.y = intOf (c, "y", 0, 0, 100000);
            parsed.canvasPositions.add (position);
        }
    }

    out = std::move (parsed);
    return true;
}

} // namespace ceditor::host
