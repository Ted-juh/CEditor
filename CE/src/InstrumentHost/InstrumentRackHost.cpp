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
    graph.removeNode (lp->filterNode->nodeID);
    graph.removeNode (lp->gainNode->nodeID);

    live.erase (partId);
    model.removePart (partId);
    applyMixerState();
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

    connectInstrument (*lp);

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
        refreshStateBlob (part);
    return model;
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

    model = std::move (performance);

    juce::Array<UnresolvedPart> unresolved;
    for (const auto& part : model.parts)
    {
        createLiveNodes (part);
        if (part.pluginCeId.isNotEmpty())
            unresolved.add ({ part.partId, part.pluginCeId, part.pluginModulePath });
    }

    applyMixerState();
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
    graph.addConnection ({ { lp.gainNode->nodeID, 0 }, { audioOutNode->nodeID, 0 } });
    graph.addConnection ({ { lp.gainNode->nodeID, 1 }, { audioOutNode->nodeID, 1 } });

    applyPartToLive (part, lp);
    live[part.partId] = lp;
}

void InstrumentRackHost::connectInstrument (LivePart& lp)
{
    graph.addConnection ({ { lp.filterNode->nodeID, midiChannel },
                           { lp.instrumentNode->nodeID, midiChannel } });

    // One stereo pair in Stage 1 (explicit multi-output routing is Stage 5); a mono
    // instrument feeds both sides.
    const auto outs = lp.instrumentNode->getProcessor()->getTotalNumOutputChannels();
    if (outs >= 2)
    {
        graph.addConnection ({ { lp.instrumentNode->nodeID, 0 }, { lp.gainNode->nodeID, 0 } });
        graph.addConnection ({ { lp.instrumentNode->nodeID, 1 }, { lp.gainNode->nodeID, 1 } });
    }
    else if (outs == 1)
    {
        graph.addConnection ({ { lp.instrumentNode->nodeID, 0 }, { lp.gainNode->nodeID, 0 } });
        graph.addConnection ({ { lp.instrumentNode->nodeID, 0 }, { lp.gainNode->nodeID, 1 } });
    }
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
