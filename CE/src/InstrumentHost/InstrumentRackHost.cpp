#include "InstrumentRackHost.h"

namespace ceditor::host
{

using IOProcessor = juce::AudioProcessorGraph::AudioGraphIOProcessor;
constexpr int midiChannel = juce::AudioProcessorGraph::midiChannelIndex;

InstrumentRackHost::InstrumentRackHost()
{
    model = Performance::create();
    midiInNode   = graph.addNode (std::make_unique<IOProcessor> (IOProcessor::midiInputNode));
    audioOutNode = graph.addNode (std::make_unique<IOProcessor> (IOProcessor::audioOutputNode));
}

InstrumentRackHost::~InstrumentRackHost() = default;

void InstrumentRackHost::prepare (double sampleRate, int blockSize)
{
    currentSampleRate = sampleRate;
    currentBlockSize = blockSize;
    graph.setPlayConfigDetails (0, 2, sampleRate, blockSize);
    graph.prepareToPlay (sampleRate, blockSize);
    prepared = true;
}

void InstrumentRackHost::release()
{
    graph.releaseResources();
    prepared = false;
}

juce::String InstrumentRackHost::addPart()
{
    const auto partId = model.addPart();
    createLiveNodes (*model.findPart (partId));
    applyMixerState();
    return partId;
}

juce::String InstrumentRackHost::addEffectSlot (const juce::String& chainId)
{
    juce::Array<EffectSlot>* chain = nullptr;
    if (chainId == masterChainId)
        chain = &model.masterEffects;
    else if (auto* part = model.findPart (chainId))
        chain = &part->effects;

    if (chain == nullptr)
        return {};

    EffectSlot slot;
    slot.effectId = juce::Uuid().toDashedString();
    const auto effectId = slot.effectId;
    chain->add (std::move (slot));
    return effectId;
}

void InstrumentRackHost::destroyEffectNode (const juce::String& effectId)
{
    if (const auto it = liveEffects.find (effectId); it != liveEffects.end())
    {
        if (it->second.node != nullptr)
        {
            if (onInstrumentWillBeRemoved != nullptr)
                onInstrumentWillBeRemoved (effectId, *it->second.node->getProcessor());
            graph.removeNode (it->second.node->nodeID);
        }
        liveEffects.erase (it);
    }
}

bool InstrumentRackHost::removeEffectSlot (const juce::String& effectId)
{
    juce::String chainId;
    if (model.findEffect (effectId, &chainId) == nullptr)
        return false;

    destroyEffectNode (effectId);

    auto& chain = chainId == masterChainId ? model.masterEffects
                                           : model.findPart (chainId)->effects;
    for (int i = 0; i < chain.size(); ++i)
        if (chain.getReference (i).effectId == effectId)
        {
            chain.remove (i);
            break;
        }

    rewireAudio();
    return true;
}

bool InstrumentRackHost::moveEffectSlot (const juce::String& effectId, int newIndex)
{
    juce::String chainId;
    if (model.findEffect (effectId, &chainId) == nullptr)
        return false;

    auto& chain = chainId == masterChainId ? model.masterEffects
                                           : model.findPart (chainId)->effects;
    for (int i = 0; i < chain.size(); ++i)
        if (chain.getReference (i).effectId == effectId)
        {
            chain.move (i, juce::jlimit (0, chain.size() - 1, newIndex));
            break;
        }

    rewireAudio();
    return true;
}

bool InstrumentRackHost::setEffectBypassed (const juce::String& effectId, bool bypassed)
{
    auto* slot = model.findEffect (effectId);
    if (slot == nullptr)
        return false;

    slot->bypassed = bypassed;
    if (const auto it = liveEffects.find (effectId); it != liveEffects.end()
                                                     && it->second.node != nullptr)
        it->second.node->setBypassed (bypassed);
    return true;
}

bool InstrumentRackHost::primeEffectSlot (const juce::String& effectId, const ClassInfo& info,
                                          const juce::String& stateBlobBase64)
{
    auto* slot = model.findEffect (effectId);
    if (slot == nullptr)
        return false;

    slot->pluginCeId       = info.ceId;
    slot->pluginModulePath = info.modulePath;
    slot->pluginName       = info.name;
    slot->pluginVendor     = info.vendor;
    slot->stateBlobBase64  = stateBlobBase64;
    return true;
}

int InstrumentRackHost::beginEffectLoad (const juce::String& effectId)
{
    if (model.findEffect (effectId) == nullptr)
        return 0;
    return ++liveEffects[effectId].loadGeneration;
}

bool InstrumentRackHost::commitEffectLoad (const juce::String& effectId, int generation,
                                           std::unique_ptr<juce::AudioProcessor> effect,
                                           const ClassInfo& info)
{
    auto* slot = model.findEffect (effectId);
    const auto it = liveEffects.find (effectId);
    if (slot == nullptr || it == liveEffects.end() || effect == nullptr)
        return false;
    if (generation == 0 || generation != it->second.loadGeneration)
        return false;

    // Same restore rule as instruments: state only re-enters the same class identity.
    if (info.ceId == slot->pluginCeId && slot->stateBlobBase64.isNotEmpty())
    {
        juce::MemoryOutputStream decoded;
        if (juce::Base64::convertFromBase64 (decoded, slot->stateBlobBase64))
            effect->setStateInformation (decoded.getData(), (int) decoded.getDataSize());
    }
    else if (info.ceId != slot->pluginCeId)
    {
        slot->stateBlobBase64 = {};
    }

    if (it->second.node != nullptr)
    {
        if (onInstrumentWillBeRemoved != nullptr)
            onInstrumentWillBeRemoved (effectId, *it->second.node->getProcessor());
        graph.removeNode (it->second.node->nodeID);
    }

    it->second.node = graph.addNode (std::move (effect));
    if (it->second.node == nullptr)
        return false;
    it->second.node->setBypassed (slot->bypassed);

    slot->pluginCeId       = info.ceId;
    slot->pluginModulePath = info.modulePath;
    slot->pluginName       = info.name;
    slot->pluginVendor     = info.vendor;

    rewireAudio();
    return true;
}

juce::AudioProcessor* InstrumentRackHost::getEffect (const juce::String& effectId) const
{
    const auto it = liveEffects.find (effectId);
    return it != liveEffects.end() && it->second.node != nullptr ? it->second.node->getProcessor()
                                                                 : nullptr;
}

bool InstrumentRackHost::effectHasProcessor (const juce::String& effectId) const
{
    return getEffect (effectId) != nullptr;
}

bool InstrumentRackHost::primePartState (const juce::String& partId, const ClassInfo& info,
                                         const juce::String& stateBlobBase64)
{
    auto* part = model.findPart (partId);
    if (part == nullptr)
        return false;

    part->pluginCeId       = info.ceId;
    part->pluginModulePath = info.modulePath;
    part->pluginName       = info.name;
    part->pluginVendor     = info.vendor;
    part->stateBlobBase64  = stateBlobBase64;
    return true;
}

juce::String InstrumentRackHost::addMacro (const juce::String& name)
{
    Macro macro;
    macro.macroId = juce::Uuid().toDashedString();
    macro.name = name;
    const auto macroId = macro.macroId;
    model.macros.add (std::move (macro));
    return macroId;
}

bool InstrumentRackHost::removeMacro (const juce::String& macroId)
{
    for (int i = 0; i < model.macros.size(); ++i)
        if (model.macros.getReference (i).macroId == macroId)
        {
            model.macros.remove (i);
            return true;
        }
    return false;
}

juce::String InstrumentRackHost::addControlPage (const juce::String& name)
{
    auto page = ControlPage::create (name);
    const auto pageId = page.pageId;
    model.pages.add (std::move (page));
    return pageId;
}

bool InstrumentRackHost::removeControlPage (const juce::String& pageId)
{
    for (int i = 0; i < model.pages.size(); ++i)
        if (model.pages.getReference (i).pageId == pageId)
        {
            model.pages.remove (i);
            return true;
        }
    return false;
}

bool InstrumentRackHost::renameControlPage (const juce::String& pageId, const juce::String& name)
{
    if (auto* page = model.findPage (pageId))
    {
        page->name = name;
        return true;
    }
    return false;
}

bool InstrumentRackHost::setSlotBinding (const juce::String& pageId, const juce::String& slotId,
                                         ControlBinding binding)
{
    auto* page = model.findPage (pageId);
    auto* slot = page != nullptr ? page->findSlot (slotId) : nullptr;
    if (slot == nullptr)
        return false;

    slot->binding = std::move (binding);
    return true;
}

bool InstrumentRackHost::removePart (const juce::String& partId)
{
    auto* lp = findLive (partId);
    if (lp == nullptr)
        return false;

    // The destinations are being destroyed, so forget rather than panic — and remove the
    // instrument first so a callback between rebuilds cannot route into a half-gone chain.
    lp->filter->getCore().requestClear();

    if (lp->instrumentNode != nullptr)
    {
        notifyInstrumentWillBeRemoved (partId, *lp);
        graph.removeNode (lp->instrumentNode->nodeID);
    }

    // The part's inserts die with it, each announced first (editor and registry teardown).
    if (const auto* part = model.findPart (partId))
        for (const auto& slot : juce::Array<EffectSlot> (part->effects))
            destroyEffectNode (slot.effectId);

    graph.removeNode (lp->filterNode->nodeID);
    graph.removeNode (lp->gainNode->nodeID);

    live.erase (partId);
    model.removePart (partId);
    applyMixerState();
    rewireAudio();
    return true;
}

bool InstrumentRackHost::movePart (const juce::String& partId, int newIndex)
{
    // Presentation order only — nodes, connections and identities do not move with it.
    return model.movePart (partId, newIndex);
}

bool InstrumentRackHost::focusPart (const juce::String& partId)
{
    if (model.findPart (partId) == nullptr)
        return false;

    model.focusedPartId = partId;
    return true;
}

bool InstrumentRackHost::setMidiRules (const juce::String& partId, const PartMidiRules& rules)
{
    auto* part = model.findPart (partId);
    auto* lp = findLive (partId);
    if (part == nullptr || lp == nullptr)
        return false;

    PartMidiRules clamped;
    clamped.channel      = juce::jlimit (0, 16, rules.channel);
    clamped.keyLow       = juce::jlimit (0, 127, rules.keyLow);
    clamped.keyHigh      = juce::jlimit (0, 127, rules.keyHigh);
    clamped.velocityLow  = juce::jlimit (1, 127, rules.velocityLow);
    clamped.velocityHigh = juce::jlimit (1, 127, rules.velocityHigh);
    clamped.transpose    = juce::jlimit (-60, 60, rules.transpose);
    if (clamped.keyLow > clamped.keyHigh)
        std::swap (clamped.keyLow, clamped.keyHigh);
    if (clamped.velocityLow > clamped.velocityHigh)
        std::swap (clamped.velocityLow, clamped.velocityHigh);

    part->midi = clamped;
    lp->filter->getCore().setRules (clamped);
    return true;
}

bool InstrumentRackHost::setEnabled (const juce::String& partId, bool enabled)
{
    auto* part = model.findPart (partId);
    auto* lp = findLive (partId);
    if (part == nullptr || lp == nullptr)
        return false;

    part->enabled = enabled;
    lp->filter->getCore().setEnabled (enabled);   // disabling panics the part's notes
    applyMixerState();
    return true;
}

bool InstrumentRackHost::setMute (const juce::String& partId, bool mute)
{
    auto* part = model.findPart (partId);
    if (part == nullptr)
        return false;

    part->mute = mute;
    applyMixerState();
    return true;
}

bool InstrumentRackHost::setSolo (const juce::String& partId, bool solo)
{
    auto* part = model.findPart (partId);
    if (part == nullptr)
        return false;

    part->solo = solo;
    applyMixerState();
    return true;
}

bool InstrumentRackHost::setVolume (const juce::String& partId, float volume)
{
    auto* part = model.findPart (partId);
    if (part == nullptr)
        return false;

    part->volume = juce::jlimit (0.0f, 2.0f, volume);
    applyMixerState();
    return true;
}

bool InstrumentRackHost::setPan (const juce::String& partId, float pan)
{
    auto* part = model.findPart (partId);
    if (part == nullptr)
        return false;

    part->pan = juce::jlimit (-1.0f, 1.0f, pan);
    applyMixerState();
    return true;
}

int InstrumentRackHost::beginLoad (const juce::String& partId)
{
    auto* lp = findLive (partId);
    if (lp == nullptr)
        return 0;

    return ++lp->loadGeneration;
}

bool InstrumentRackHost::commitLoad (const juce::String& partId, int generation,
                                     std::unique_ptr<juce::AudioProcessor> instrument,
                                     const ClassInfo& info)
{
    auto* part = model.findPart (partId);
    auto* lp = findLive (partId);
    if (part == nullptr || lp == nullptr || instrument == nullptr)
        return false;

    // The stale-callback rule: only the newest ticket may commit, and a ticket exists only
    // if beginLoad was called at all.
    if (generation == 0 || generation != lp->loadGeneration)
        return false;

    // Restore before insertion, and only into the same class identity — state blobs do not
    // transfer between different instruments.
    if (info.ceId == part->pluginCeId && part->stateBlobBase64.isNotEmpty())
    {
        juce::MemoryOutputStream decoded;
        if (juce::Base64::convertFromBase64 (decoded, part->stateBlobBase64))
            instrument->setStateInformation (decoded.getData(), (int) decoded.getDataSize());
    }
    else if (info.ceId != part->pluginCeId)
    {
        part->stateBlobBase64 = {};
    }

    // Replacement: the old destination is going away, so its tracked notes are forgotten,
    // not forwarded — the incoming instrument never played them.
    lp->filter->getCore().requestClear();

    if (lp->instrumentNode != nullptr)
    {
        notifyInstrumentWillBeRemoved (partId, *lp);
        graph.removeNode (lp->instrumentNode->nodeID);
    }

    lp->instrumentNode = graph.addNode (std::move (instrument));
    if (lp->instrumentNode == nullptr)
        return false;

    rewireAudio();

    part->pluginCeId       = info.ceId;
    part->pluginModulePath = info.modulePath;
    part->pluginName       = info.name;
    part->pluginVendor     = info.vendor;
    return true;
}

bool InstrumentRackHost::unloadInstrument (const juce::String& partId)
{
    auto* part = model.findPart (partId);
    auto* lp = findLive (partId);
    if (part == nullptr || lp == nullptr || lp->instrumentNode == nullptr)
        return false;

    refreshStateBlob (*part);   // reloading the same class later resumes where it left off
    lp->filter->getCore().requestClear();
    notifyInstrumentWillBeRemoved (partId, *lp);
    graph.removeNode (lp->instrumentNode->nodeID);
    lp->instrumentNode = nullptr;
    rewireAudio();   // the part's chain idles until an instrument feeds it again
    return true;
}

bool InstrumentRackHost::partHasInstrument (const juce::String& partId) const
{
    const auto* lp = findLive (partId);
    return lp != nullptr && lp->instrumentNode != nullptr;
}

juce::AudioProcessor* InstrumentRackHost::getInstrument (const juce::String& partId) const
{
    const auto* lp = findLive (partId);
    return lp != nullptr && lp->instrumentNode != nullptr ? lp->instrumentNode->getProcessor()
                                                          : nullptr;
}

Performance InstrumentRackHost::captureState()
{
    for (auto& part : model.parts)
    {
        refreshStateBlob (part);
        refreshEffectBlobs (part.effects);
    }
    refreshEffectBlobs (model.masterEffects);
    return model;
}

void InstrumentRackHost::refreshEffectBlobs (juce::Array<EffectSlot>& effects)
{
    for (auto& slot : effects)
        if (auto* processor = getEffect (slot.effectId))
        {
            juce::MemoryBlock state;
            processor->getStateInformation (state);
            slot.stateBlobBase64 = juce::Base64::toBase64 (state.getData(), state.getSize());
        }
}

juce::Array<InstrumentRackHost::UnresolvedPart> InstrumentRackHost::loadModel (Performance performance)
{
    for (auto& [partId, lp] : live)
    {
        if (lp.instrumentNode != nullptr)
        {
            notifyInstrumentWillBeRemoved (partId, lp);
            graph.removeNode (lp.instrumentNode->nodeID);
        }
        graph.removeNode (lp.filterNode->nodeID);
        graph.removeNode (lp.gainNode->nodeID);
    }
    live.clear();

    // Every live insert dies with the old rack, announced like the instruments.
    while (! liveEffects.empty())
        destroyEffectNode (liveEffects.begin()->first);

    model = std::move (performance);

    juce::Array<UnresolvedPart> unresolved;
    for (const auto& part : model.parts)
    {
        createLiveNodes (part);
        if (part.pluginCeId.isNotEmpty())
            unresolved.add ({ part.partId, part.pluginCeId, part.pluginModulePath });
    }

    applyMixerState();
    rewireAudio();
    return unresolved;
}

void InstrumentRackHost::panicPart (const juce::String& partId)
{
    if (auto* lp = findLive (partId))
        lp->filter->getCore().requestPanic();
}

void InstrumentRackHost::panicAll()
{
    for (auto& [partId, lp] : live)
    {
        juce::ignoreUnused (partId);
        lp.filter->getCore().requestPanic();
    }
}

InstrumentRackHost::LivePart* InstrumentRackHost::findLive (const juce::String& partId)
{
    const auto it = live.find (partId);
    return it != live.end() ? &it->second : nullptr;
}

const InstrumentRackHost::LivePart* InstrumentRackHost::findLive (const juce::String& partId) const
{
    const auto it = live.find (partId);
    return it != live.end() ? &it->second : nullptr;
}

void InstrumentRackHost::createLiveNodes (const RackPart& part)
{
    LivePart lp;

    auto filter = std::make_unique<PartMidiFilterProcessor>();
    lp.filter = filter.get();
    lp.filterNode = graph.addNode (std::move (filter));

    auto gain = std::make_unique<GainPanProcessor>();
    lp.gain = gain.get();
    lp.gainNode = graph.addNode (std::move (gain));

    graph.addConnection ({ { midiInNode->nodeID, midiChannel },
                           { lp.filterNode->nodeID, midiChannel } });

    applyPartToLive (part, lp);
    live[part.partId] = lp;
    rewireAudio();
}

void InstrumentRackHost::connectAudio (juce::AudioProcessorGraph::Node* from,
                                       juce::AudioProcessorGraph::Node* to)
{
    // One stereo pair remains the rack's currency: a mono source feeds both sides, a mono
    // destination sums both sides, several sources into one destination sum on its inputs.
    // The output IO node reports its channels only once the graph is prepared, and the rack
    // is always stereo out — so it is pinned rather than asked.
    const auto outs = juce::jmax (1, from->getProcessor()->getTotalNumOutputChannels());
    const auto ins  = to == audioOutNode.get()
                        ? 2
                        : juce::jmax (1, to->getProcessor()->getTotalNumInputChannels());
    const auto sourceRight = outs >= 2 ? 1 : 0;

    if (ins >= 2)
    {
        graph.addConnection ({ { from->nodeID, 0 },           { to->nodeID, 0 } });
        graph.addConnection ({ { from->nodeID, sourceRight }, { to->nodeID, 1 } });
    }
    else
    {
        graph.addConnection ({ { from->nodeID, 0 }, { to->nodeID, 0 } });
        if (sourceRight != 0)
            graph.addConnection ({ { from->nodeID, sourceRight }, { to->nodeID, 0 } });
    }
}

void InstrumentRackHost::rewireAudio()
{
    // Every audio connection in this graph belongs to the one path this rebuilds (MIDI wires
    // ride the dedicated channel index), so drop-and-rebuild keeps the whole topology in one
    // readable place instead of tracking edits wire by wire.
    for (const auto& connection : graph.getConnections())
        if (connection.source.channelIndex != midiChannel)
            graph.removeConnection (connection);

    // Per part: instrument → its loaded inserts, in slot order → the part's gain. A part
    // with no instrument leaves its chain idle rather than wiring effects to nothing.
    for (auto& [partId, lp] : live)
    {
        const auto* part = model.findPart (partId);
        auto* upstream = lp.instrumentNode.get();
        if (part == nullptr || upstream == nullptr)
            continue;

        graph.addConnection ({ { lp.filterNode->nodeID, midiChannel },
                               { lp.instrumentNode->nodeID, midiChannel } });

        for (const auto& slot : part->effects)
            if (const auto it = liveEffects.find (slot.effectId);
                it != liveEffects.end() && it->second.node != nullptr)
            {
                connectAudio (upstream, it->second.node.get());
                upstream = it->second.node.get();
            }

        connectAudio (upstream, lp.gainNode.get());
    }

    // Master: every gain into the chain head (summing there), serial hops, tail to the
    // output — or straight to the output while the master chain is empty or unloaded.
    juce::Array<juce::AudioProcessorGraph::Node*> masterNodes;
    for (const auto& slot : model.masterEffects)
        if (const auto it = liveEffects.find (slot.effectId);
            it != liveEffects.end() && it->second.node != nullptr)
            masterNodes.add (it->second.node.get());

    auto* sink = masterNodes.isEmpty() ? audioOutNode.get() : masterNodes.getFirst();
    for (auto& [partId, lp] : live)
    {
        juce::ignoreUnused (partId);
        connectAudio (lp.gainNode.get(), sink);
    }
    for (int i = 0; i + 1 < masterNodes.size(); ++i)
        connectAudio (masterNodes[i], masterNodes[i + 1]);
    if (! masterNodes.isEmpty())
        connectAudio (masterNodes.getLast(), audioOutNode.get());
}

void InstrumentRackHost::applyPartToLive (const RackPart& part, LivePart& lp)
{
    lp.filter->getCore().setRules (part.midi);
    lp.filter->getCore().setEnabled (part.enabled);
}

void InstrumentRackHost::applyMixerState()
{
    bool anySolo = false;
    for (const auto& part : model.parts)
        anySolo = anySolo || part.solo;

    for (const auto& part : model.parts)
    {
        if (auto* lp = findLive (part.partId))
        {
            const bool audible = part.enabled && ! part.mute && (! anySolo || part.solo);
            lp->gain->setVolumePan (part.volume, part.pan, audible);
        }
    }
}

void InstrumentRackHost::notifyInstrumentWillBeRemoved (const juce::String& partId, const LivePart& lp)
{
    if (onInstrumentWillBeRemoved != nullptr && lp.instrumentNode != nullptr)
        onInstrumentWillBeRemoved (partId, *lp.instrumentNode->getProcessor());
}

void InstrumentRackHost::refreshStateBlob (RackPart& part)
{
    if (auto* lp = findLive (part.partId); lp != nullptr && lp->instrumentNode != nullptr)
    {
        juce::MemoryBlock state;
        lp->instrumentNode->getProcessor()->getStateInformation (state);
        part.stateBlobBase64 = juce::Base64::toBase64 (state.getData(), state.getSize());
    }
}

} // namespace ceditor::host
