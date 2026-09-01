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
        page.slots.add ({ "s" + juce::String (i), {} });
    return page;
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

ReturnChain* Performance::findReturn (const juce::String& returnId)
{
    for (auto& chain : returns)
        if (chain.returnId == returnId)
            return &chain;
    return nullptr;
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
        p->setProperty ("lastPresetRecordId", part.lastPresetRecordId);
        p->setProperty ("lastPresetName",     part.lastPresetName);
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
            s->setProperty ("midiCc",      slot.midiCc);
            s->setProperty ("midiChannel", slot.midiChannel);
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
        m->setProperty ("value",   macro.value);
        m->setProperty ("targets", targetVars);
        macroVars.add (juce::var (m));
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

    juce::Array<juce::var> clipVars;
    for (const auto& clip : clips)
        clipVars.add (perf::clipToVar (clip));

    juce::Array<juce::var> sceneVars;
    for (const auto& scene : scenes)
        sceneVars.add (perf::sceneToVar (scene));

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

    root->setProperty ("canvasPositions", positionVars);
    root->setProperty ("schemaVersion", currentSchemaVersion);
    root->setProperty ("masterLevel",   masterLevel);
    root->setProperty ("outputPairs",   outputPairs);
    root->setProperty ("parts",         partVars);
    root->setProperty ("masterEffects", effectsToVar (masterEffects));
    root->setProperty ("returns",       returnVars);
    root->setProperty ("buses",         busVars);
    root->setProperty ("macros",        macroVars);
    root->setProperty ("pages",         pageVars);
    root->setProperty ("transport",     perf::transportSettingsToVar (transport));
    root->setProperty ("patterns",      patternVars);
    root->setProperty ("clips",         clipVars);
    root->setProperty ("scenes",        sceneVars);
    root->setProperty ("setlist",       perf::setlistToVar (setlist));
    return juce::var (root);
}

bool Performance::fromVar (const juce::var& stored, Performance& out)
{
    out = Performance();

    if (! stored.isObject())
        return false;

    Performance parsed;
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
        part.lastPresetRecordId = p.getProperty ("lastPresetRecordId", {}).toString();
        part.lastPresetName     = p.getProperty ("lastPresetName", {}).toString();
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
                    target.inverted    = (bool) t.getProperty ("inverted", false);
                    macro.targets.add (std::move (target));
                }

            parsed.macros.add (std::move (macro));
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
            if (const auto* slotArray = pg.getProperty ("slots", {}).getArray())
                for (const auto& s : *slotArray)
                {
                    ControlSlot slot;
                    slot.slotId = s.getProperty ("slotId", {}).toString();
                    if (slot.slotId.isEmpty() || seenSlotIds.contains (slot.slotId))
                        return false;
                    seenSlotIds.add (slot.slotId);

                    slot.binding.partId      = s.getProperty ("partId", {}).toString();
                    slot.binding.pluginCeId  = s.getProperty ("pluginCeId", {}).toString();
                    slot.binding.parameterId = s.getProperty ("parameterId", {}).toString();
                    slot.binding.label       = s.getProperty ("label", {}).toString();
                    slot.binding.rangeMin    = floatOf (s, "rangeMin", 0.0f, 0.0f, 1.0f);
                    slot.binding.rangeMax    = floatOf (s, "rangeMax", 1.0f, 0.0f, 1.0f);
                    slot.binding.inverted    = (bool) s.getProperty ("inverted", false);
                    slot.binding.bipolar     = (bool) s.getProperty ("bipolar", false);
                    slot.midiCc      = juce::jlimit (-1, 127, (int) s.getProperty ("midiCc", -1));
                    slot.midiChannel = juce::jlimit (0, 16, (int) s.getProperty ("midiChannel", 0));
                    page.slots.add (std::move (slot));
                }

            parsed.pages.add (std::move (page));
        }
    }

    // The Stage 6 performance system. Identity damage fails the load the way it does for
    // parts and pages; an absent array is a pre-Stage-6 document and loads clean.
    perf::transportSettingsFromVar (stored.getProperty ("transport", {}), parsed.transport);

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
