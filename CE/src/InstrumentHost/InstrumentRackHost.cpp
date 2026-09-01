#include "InstrumentRackHost.h"

namespace ceditor::host
{

using IOProcessor = juce::AudioProcessorGraph::AudioGraphIOProcessor;
constexpr int midiChannel = juce::AudioProcessorGraph::midiChannelIndex;

InstrumentRackHost::InstrumentRackHost()
{
    model = Performance::create();
    midiInNode   = graph.addNode (std::make_unique<IOProcessor> (IOProcessor::midiInputNode));
    audioInNode  = graph.addNode (std::make_unique<IOProcessor> (IOProcessor::audioInputNode));
    audioOutNode = graph.addNode (std::make_unique<IOProcessor> (IOProcessor::audioOutputNode));

    // The engine sits between the MIDI input and every part, so the graph's own ordering
    // makes "the engine has already run" a structural fact rather than a convention.
    engineNode = graph.addNode (std::make_unique<PerformanceEngineProcessor> (engine));
    graph.addConnection ({ { midiInNode->nodeID, midiChannel },
                           { engineNode->nodeID, midiChannel } });

    // The Performance fader sits at the very end of the main pair, after the master chain:
    // it is the product's level, not another insert, so nothing on the master bus can be
    // driven by it and it cannot be bypassed by an effect that is.
    masterGainNode = graph.addNode (std::make_unique<GainPanProcessor>());
}

InstrumentRackHost::~InstrumentRackHost() = default;

void InstrumentRackHost::prepare (double sampleRate, int blockSize, int numInputChannels)
{
    currentSampleRate = sampleRate;
    currentBlockSize = blockSize;
    graph.setPlayConfigDetails (juce::jmax (0, numInputChannels),
                                juce::jlimit (2, 16, model.outputPairs * 2), sampleRate, blockSize);
    graph.prepareToPlay (sampleRate, blockSize);
    engine.prepare (sampleRate, blockSize, perf::PerformanceEngine::maxParts);
    prepared = true;

    // The input IO node only knows its channels once prepared, and a hardware part's return
    // wires against those channels — so the wiring is rebuilt on every prepare rather than
    // trusted to predate it.
    rewireAudio();
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
    syncEngineBindings();
    return partId;
}

int InstrumentRackHost::partIndexFor (const juce::String& partId) const
{
    const auto index = model.indexOfPart (partId);
    return index < perf::PerformanceEngine::maxParts ? index : -1;
}

void InstrumentRackHost::syncEngineBindings()
{
    // Slots follow document order, so reordering the rack re-binds rather than reassigning
    // identities — the same rule movePart has always kept for nodes and state.
    for (int i = 0; i < model.parts.size(); ++i)
    {
        const auto& part = model.parts.getReference (i);
        if (auto* lp = findLive (part.partId))
        {
            lp->filter->setEngine (&engine, i < perf::PerformanceEngine::maxParts ? i : -1);
            lp->filter->getMidiInserts().setSlots (part.midiChain);
        }
    }
}

bool InstrumentRackHost::setPartMidiChain (const juce::String& partId,
                                           juce::Array<perf::MidiSlot> chain)
{
    auto* part = model.findPart (partId);
    auto* lp = findLive (partId);
    if (part == nullptr || lp == nullptr)
        return false;

    while (chain.size() > perf::MidiInsertRack::maxSlots)
        chain.removeLast();

    part->midiChain = std::move (chain);
    lp->filter->getMidiInserts().setSlots (part->midiChain);
    return true;
}

// The two legacy setters stay, and they are not deprecation theatre: the control pages,
// MIDI learn and every existing caller address "the part's arp" and "the part's note
// shaping", which in a chain means the first slot of that family. They write there, minting
// the slot when a chain does not carry one yet.
bool InstrumentRackHost::setPartMidiFx (const juce::String& partId,
                                        const perf::MidiFxSettings& settings)
{
    auto* part = model.findPart (partId);
    if (part == nullptr)
        return false;

    part->midiFx = settings;

    auto chain = part->midiChain;
    int target = -1;
    for (int i = 0; i < chain.size(); ++i)
        if (chain.getReference (i).type != "arp")
        {
            target = i;
            break;
        }

    if (target < 0)
    {
        chain.insert (0, perf::MidiSlot::create ("fx", juce::Uuid().toDashedString()));
        target = 0;
    }
    chain.getReference (target).fx = settings;

    // The arp always took its scale from this block, so the mirror keeps that true: a scale
    // chosen here still folds the arpeggio, chain or no chain.
    for (auto& slot : chain)
        if (slot.type == "arp")
        {
            slot.fx.scaleType = settings.scaleType;
            slot.fx.scaleRoot = settings.scaleRoot;
        }

    return setPartMidiChain (partId, std::move (chain));
}

int InstrumentRackHost::arpLiveStep (const juce::String& partId) const
{
    const auto* lp = findLive (partId);
    return lp != nullptr ? lp->filter->getMidiInserts().arpPatternStep() : -1;
}

bool InstrumentRackHost::setPartArp (const juce::String& partId, const perf::ArpSettings& settings)
{
    auto* part = model.findPart (partId);
    if (part == nullptr)
        return false;

    part->arp = settings;

    auto chain = part->midiChain;
    int target = -1;
    for (int i = 0; i < chain.size(); ++i)
        if (chain.getReference (i).type == "arp")
        {
            target = i;
            break;
        }

    if (target < 0)
    {
        auto minted = perf::MidiSlot::create ("arp", juce::Uuid().toDashedString());
        minted.fx.scaleType = part->midiFx.scaleType;
        minted.fx.scaleRoot = part->midiFx.scaleRoot;
        chain.add (std::move (minted));
        target = chain.size() - 1;
    }
    chain.getReference (target).arp = settings;

    return setPartMidiChain (partId, std::move (chain));
}

juce::Array<EffectSlot>* InstrumentRackHost::chainFor (const juce::String& chainId)
{
    if (chainId == masterChainId)
        return &model.masterEffects;
    if (auto* part = model.findPart (chainId))
        return &part->effects;
    if (auto* ret = model.findReturn (chainId))
        return &ret->effects;
    if (auto* bus = model.findBus (chainId))
        return &bus->effects;
    return nullptr;
}

juce::String InstrumentRackHost::addEffectSlot (const juce::String& chainId)
{
    auto* chain = chainFor (chainId);
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

    auto& chain = *chainFor (chainId);
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

    auto& chain = *chainFor (chainId);
    for (int i = 0; i < chain.size(); ++i)
        if (chain.getReference (i).effectId == effectId)
        {
            chain.move (i, juce::jlimit (0, chain.size() - 1, newIndex));
            break;
        }

    rewireAudio();
    return true;
}

bool InstrumentRackHost::setCanvasPosition (const juce::String& nodeId, int x, int y)
{
    const auto isNode = nodeId == "@master"
                          || model.findPart (nodeId) != nullptr
                          || model.findBus (nodeId) != nullptr
                          || model.findReturn (nodeId) != nullptr;
    if (! isNode)
        return false;

    const auto clampedX = juce::jlimit (0, 100000, x);
    const auto clampedY = juce::jlimit (0, 100000, y);

    for (auto& position : model.canvasPositions)
        if (position.nodeId == nodeId)
        {
            position.x = clampedX;
            position.y = clampedY;
            return true;
        }

    model.canvasPositions.add ({ nodeId, clampedX, clampedY });
    return true;
}

void InstrumentRackHost::clearCanvasPositions()
{
    model.canvasPositions.clear();
}

bool InstrumentRackHost::setMasterLevel (float level)
{
    model.masterLevel = juce::jlimit (0.0f, 2.0f, level);
    if (masterGainNode != nullptr)
        static_cast<GainPanProcessor*> (masterGainNode->getProcessor())
            ->setVolumePan (model.masterLevel, 0.0f, true);
    return true;
}

bool InstrumentRackHost::setOutputPairs (int pairs)
{
    model.outputPairs = juce::jlimit (1, 8, pairs);
    // Parts routed past the new end fall back to the main pair rather than silently vanishing
    // into a bus that no longer exists.
    for (auto& part : model.parts)
        part.outputPair = juce::jlimit (0, model.outputPairs - 1, part.outputPair);
    rewireAudio();
    return true;
}

bool InstrumentRackHost::setPartOutputPair (const juce::String& partId, int pair)
{
    auto* part = model.findPart (partId);
    if (part == nullptr)
        return false;

    part->outputPair = juce::jlimit (0, model.outputPairs - 1, pair);
    rewireAudio();
    return true;
}

double InstrumentRackHost::tailLengthSeconds() const
{
    // The longest tail anything in the rack claims: a DAW bounce has to keep rendering that
    // long after the last note or it truncates the reverb it can hear.
    double longest = 0.0;

    for (const auto& [partId, lp] : live)
    {
        juce::ignoreUnused (partId);
        if (lp.instrumentNode != nullptr)
            longest = juce::jmax (longest, lp.instrumentNode->getProcessor()->getTailLengthSeconds());
    }

    for (const auto& [effectId, effect] : liveEffects)
    {
        juce::ignoreUnused (effectId);
        if (effect.node != nullptr)
            longest = juce::jmax (longest, effect.node->getProcessor()->getTailLengthSeconds());
    }

    return longest;
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

juce::String InstrumentRackHost::addBus (const juce::String& name)
{
    BusChain bus;
    bus.busId = juce::Uuid().toDashedString();
    bus.name = name;
    const auto busId = bus.busId;
    model.buses.add (std::move (bus));
    rewireAudio();
    return busId;
}

bool InstrumentRackHost::removeBus (const juce::String& busId)
{
    auto* bus = model.findBus (busId);
    if (bus == nullptr)
        return false;

    for (const auto& slot : juce::Array<EffectSlot> (bus->effects))
        destroyEffectNode (slot.effectId);

    for (int i = 0; i < model.buses.size(); ++i)
        if (model.buses.getReference (i).busId == busId)
        {
            model.buses.remove (i);
            break;
        }

    // Anything routed into a gone bus goes back to the master rather than to silence: a
    // removed group must never take its instruments off the desk with it.
    for (auto& part : model.parts)
        if (part.destinationBusId == busId)
            part.destinationBusId.clear();
    for (auto& other : model.buses)
        if (other.destinationBusId == busId)
            other.destinationBusId.clear();

    rewireAudio();
    return true;
}

bool InstrumentRackHost::renameBus (const juce::String& busId, const juce::String& name)
{
    auto* bus = model.findBus (busId);
    if (bus == nullptr)
        return false;
    bus->name = name;
    return true;
}

bool InstrumentRackHost::setBusLevel (const juce::String& busId, float level)
{
    auto* bus = model.findBus (busId);
    if (bus == nullptr)
        return false;

    bus->level = juce::jlimit (0.0f, 2.0f, level);
    if (const auto it = busLevelNodes.find (busId); it != busLevelNodes.end() && it->second != nullptr)
        static_cast<GainPanProcessor*> (it->second->getProcessor())
            ->setVolumePan (bus->level, 0.0f, true);
    return true;
}

bool InstrumentRackHost::setBusDestination (const juce::String& busId,
                                            const juce::String& destinationId)
{
    auto* bus = model.findBus (busId);
    if (bus == nullptr)
        return false;
    if (destinationId.isNotEmpty() && model.findBus (destinationId) == nullptr)
        return false;
    if (model.busRoutingWouldLoop (busId, destinationId))
        return false;

    bus->destinationBusId = destinationId;
    rewireAudio();
    return true;
}

bool InstrumentRackHost::setPartDestination (const juce::String& partId, const juce::String& busId)
{
    auto* part = model.findPart (partId);
    if (part == nullptr)
        return false;
    if (busId.isNotEmpty() && model.findBus (busId) == nullptr)
        return false;

    part->destinationBusId = busId;
    rewireAudio();
    return true;
}

juce::String InstrumentRackHost::addReturn (const juce::String& name)
{
    ReturnChain chain;
    chain.returnId = juce::Uuid().toDashedString();
    chain.name = name;
    const auto returnId = chain.returnId;
    model.returns.add (std::move (chain));
    rewireAudio();
    return returnId;
}

bool InstrumentRackHost::removeReturn (const juce::String& returnId)
{
    auto* chain = model.findReturn (returnId);
    if (chain == nullptr)
        return false;

    for (const auto& slot : juce::Array<EffectSlot> (chain->effects))
        destroyEffectNode (slot.effectId);

    for (int i = 0; i < model.returns.size(); ++i)
        if (model.returns.getReference (i).returnId == returnId)
        {
            model.returns.remove (i);
            break;
        }

    // Sends into a gone return are stranded, and stranded means dropped — the model never
    // keeps an address nothing can resolve.
    for (auto& part : model.parts)
        for (int i = part.sends.size(); --i >= 0;)
            if (part.sends.getReference (i).returnId == returnId)
                part.sends.remove (i);

    rewireAudio();
    return true;
}

bool InstrumentRackHost::renameReturn (const juce::String& returnId, const juce::String& name)
{
    if (auto* chain = model.findReturn (returnId))
    {
        chain->name = name;
        return true;
    }
    return false;
}

bool InstrumentRackHost::setReturnLevel (const juce::String& returnId, float level)
{
    auto* chain = model.findReturn (returnId);
    if (chain == nullptr)
        return false;

    chain->level = juce::jlimit (0.0f, 2.0f, level);
    if (const auto it = returnLevelNodes.find (returnId); it != returnLevelNodes.end())
        static_cast<GainPanProcessor*> (it->second->getProcessor())
            ->setVolumePan (chain->level, 0.0f, true);
    return true;
}

bool InstrumentRackHost::setSendLevel (const juce::String& partId, const juce::String& returnId,
                                       float level)
{
    auto* part = model.findPart (partId);
    if (part == nullptr || model.findReturn (returnId) == nullptr)
        return false;

    PartSend* send = nullptr;
    for (auto& existing : part->sends)
        if (existing.returnId == returnId)
            send = &existing;

    if (send == nullptr)
    {
        part->sends.add ({ returnId, 0.0f });
        send = &part->sends.getReference (part->sends.size() - 1);
    }

    send->level = juce::jlimit (0.0f, 2.0f, level);

    // A send created just now needs its node and wire; an existing one only a new level.
    auto* lp = findLive (partId);
    if (lp != nullptr)
    {
        if (const auto it = lp->sendNodes.find (returnId); it != lp->sendNodes.end())
        {
            static_cast<GainPanProcessor*> (it->second->getProcessor())
                ->setVolumePan (send->level, 0.0f, true);
            return true;
        }
    }
    rewireAudio();
    return true;
}

bool InstrumentRackHost::setExtraOut (const juce::String& partId, int pairIndex, float gain)
{
    auto* part = model.findPart (partId);
    if (part == nullptr || pairIndex < 1 || pairIndex > 15)
        return false;

    ExtraOut* extra = nullptr;
    for (auto& existing : part->extraOuts)
        if (existing.pairIndex == pairIndex)
            extra = &existing;

    const bool created = extra == nullptr;
    if (created)
    {
        part->extraOuts.add ({ pairIndex, 1.0f });
        extra = &part->extraOuts.getReference (part->extraOuts.size() - 1);
    }

    extra->gain = juce::jlimit (0.0f, 2.0f, gain);

    auto* lp = findLive (partId);
    if (! created && lp != nullptr)
        if (const auto it = lp->extraOutNodes.find (pairIndex); it != lp->extraOutNodes.end())
        {
            static_cast<GainPanProcessor*> (it->second->getProcessor())
                ->setVolumePan (extra->gain, 0.0f, true);
            return true;
        }
    rewireAudio();
    return true;
}

bool InstrumentRackHost::removeExtraOut (const juce::String& partId, int pairIndex)
{
    auto* part = model.findPart (partId);
    if (part == nullptr)
        return false;

    for (int i = 0; i < part->extraOuts.size(); ++i)
        if (part->extraOuts.getReference (i).pairIndex == pairIndex)
        {
            part->extraOuts.remove (i);
            rewireAudio();
            return true;
        }
    return false;
}

int InstrumentRackHost::instrumentOutputChannels (const juce::String& partId) const
{
    if (auto* instrument = getInstrument (partId))
        return instrument->getTotalNumOutputChannels();
    return 0;
}

bool InstrumentRackHost::setHardwareConfig (const juce::String& partId, const HardwareConfig& config)
{
    auto* part = model.findPart (partId);
    if (part == nullptr)
        return false;

    // The two roles are exclusive live: a plug-in instrument leaves (its identity and blob
    // stay in the document for the day the part turns back to software).
    if (! part->hardware && partHasInstrument (partId))
        unloadInstrument (partId);

    part->hardware           = true;
    part->midiOutputId       = config.midiOutputId;
    part->midiOutputName     = config.midiOutputName;
    part->midiOutChannel     = juce::jlimit (1, 16, config.midiOutChannel);
    part->audioReturnChannel = juce::jlimit (-1, 63, config.audioReturnChannel);
    part->audioReturnStereo  = config.audioReturnStereo;
    part->programBank        = juce::jlimit (-1, 16383, config.programBank);
    part->programNumber      = juce::jlimit (-1, 127, config.programNumber);
    part->deviceProfileId    = config.deviceProfileId;

    rewireAudio();
    return true;
}

bool InstrumentRackHost::clearHardware (const juce::String& partId)
{
    auto* part = model.findPart (partId);
    if (part == nullptr || ! part->hardware)
        return false;

    part->hardware = false;
    rewireAudio();
    return true;
}

bool InstrumentRackHost::setHardwareMidiSink (const juce::String& partId, MidiSendProcessor::Sink sink)
{
    auto* lp = findLive (partId);
    if (lp == nullptr || lp->midiSend == nullptr)
        return false;

    lp->midiSend->setSink (std::move (sink));
    return true;
}

bool InstrumentRackHost::sendHardwareProgram (const juce::String& partId)
{
    const auto* part = model.findPart (partId);
    auto* lp = findLive (partId);
    if (part == nullptr || ! part->hardware || lp == nullptr || lp->midiSend == nullptr)
        return false;
    if (part->programBank < 0 && part->programNumber < 0)
        return false;

    juce::MidiBuffer messages;
    int sample = 0;
    if (part->programBank >= 0)
    {
        messages.addEvent (juce::MidiMessage::controllerEvent (part->midiOutChannel, 0,
                                                               part->programBank >> 7), sample++);
        messages.addEvent (juce::MidiMessage::controllerEvent (part->midiOutChannel, 32,
                                                               part->programBank & 0x7f), sample++);
    }
    if (part->programNumber >= 0)
        messages.addEvent (juce::MidiMessage::programChange (part->midiOutChannel,
                                                             part->programNumber), sample);

    lp->midiSend->sendNow (messages);
    return true;
}

int InstrumentRackHost::partLatencySamples (const juce::String& partId) const
{
    const auto* part = model.findPart (partId);
    const auto* lp = findLive (partId);
    if (part == nullptr || lp == nullptr)
        return 0;

    int total = lp->instrumentNode != nullptr
                  ? lp->instrumentNode->getProcessor()->getLatencySamples() : 0;
    for (const auto& slot : part->effects)
        if (auto* fx = getEffect (slot.effectId))
            total += fx->getLatencySamples();

    // Everything the part's signal passes on the way to the master counts, buses included.
    //
    // This is what the PART costs, not what the rig costs. The graph compensates — two parts
    // joining one bus through unequal inserts arrive together, and always have (the header
    // carries the correction and the evidence). So this number does not say "you are early or
    // late"; it says "this is the path everything else is waiting for", which is what the
    // mixer wants to show. The rig's own figure is graphLatencySamples().
    auto at = part->destinationBusId;
    for (int hops = 0; at.isNotEmpty() && hops <= model.buses.size(); ++hops)
    {
        const auto* bus = model.findBus (at);
        if (bus == nullptr)
            break;
        for (const auto& slot : bus->effects)
            if (auto* fx = getEffect (slot.effectId))
                total += fx->getLatencySamples();
        at = bus->destinationBusId;
    }

    return total;
}

int InstrumentRackHost::busLatencySamples (const juce::String& busId) const
{
    int total = 0;
    auto at = busId;
    for (int hops = 0; at.isNotEmpty() && hops <= model.buses.size(); ++hops)
    {
        const auto* bus = model.findBus (at);
        if (bus == nullptr)
            break;
        for (const auto& slot : bus->effects)
            if (auto* fx = getEffect (slot.effectId))
                total += fx->getLatencySamples();
        at = bus->destinationBusId;
    }
    return total;
}

int InstrumentRackHost::masterLatencySamples() const
{
    int total = 0;
    for (const auto& slot : model.masterEffects)
        if (auto* fx = getEffect (slot.effectId))
            total += fx->getLatencySamples();
    return total;
}

int InstrumentRackHost::graphLatencySamples() const
{
    return graph.getLatencySamples();
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

bool InstrumentRackHost::setPartLastPreset (const juce::String& partId, const juce::String& recordId,
                                            const juce::String& name)
{
    auto* part = model.findPart (partId);
    if (part == nullptr)
        return false;

    part->lastPresetRecordId = recordId;
    part->lastPresetName = name;
    return true;
}

bool InstrumentRackHost::setSlotMidi (const juce::String& pageId, const juce::String& slotId,
                                      int cc, int channel)
{
    auto* page = model.findPage (pageId);
    auto* slot = page != nullptr ? page->findSlot (slotId) : nullptr;
    if (slot == nullptr)
        return false;

    slot->midiCc = juce::jlimit (-1, 127, cc);
    slot->midiChannel = juce::jlimit (0, 16, channel);
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

    destroyAuxNodes (*lp);
    graph.removeNode (lp->filterNode->nodeID);
    graph.removeNode (lp->gainNode->nodeID);

    live.erase (partId);
    model.removePart (partId);
    applyMixerState();
    syncEngineBindings();   // slots follow document order, so removing one re-binds the rest
    rewireAudio();
    return true;
}

bool InstrumentRackHost::movePart (const juce::String& partId, int newIndex)
{
    // Presentation order only — nodes, connections and identities do not move with it. The
    // engine's slots DO follow the order, so they are re-bound; a lane addressed at a partId
    // still finds the same part.
    if (! model.movePart (partId, newIndex))
        return false;

    syncEngineBindings();
    return true;
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
    for (auto& chain : model.returns)
        refreshEffectBlobs (chain.effects);
    // Group buses carry inserts like everything else, and a capture that skipped them would
    // save a bus chain that comes back empty — found while building chain presets on top.
    for (auto& bus : model.buses)
        refreshEffectBlobs (bus.effects);
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
        destroyAuxNodes (lp);
        graph.removeNode (lp.filterNode->nodeID);
        graph.removeNode (lp.gainNode->nodeID);
    }
    live.clear();

    for (auto& [returnId, node] : returnLevelNodes)
    {
        juce::ignoreUnused (returnId);
        graph.removeNode (node->nodeID);
    }
    returnLevelNodes.clear();

    // Every live insert dies with the old rack, announced like the instruments.
    while (! liveEffects.empty())
        destroyEffectNode (liveEffects.begin()->first);

    model = std::move (performance);

    juce::Array<UnresolvedPart> unresolved;
    for (const auto& part : model.parts)
    {
        createLiveNodes (part);
        // A hardware part's plug-in identity (if it ever had one) is dormant, not missing —
        // no instantiation is asked for while the part plays an external synth.
        if (part.pluginCeId.isNotEmpty() && ! part.hardware)
            unresolved.add ({ part.partId, part.pluginCeId, part.pluginModulePath });
    }

    applyMixerState();
    syncEngineBindings();
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
    // The engine holds notes of its own, and so do the per-part FX and arps: one panic has to
    // reach all three or the "no orphan notes" rule is only true of the zone filter.
    engine.panic();

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

    // Live MIDI reaches a part through the engine node, never around it: one path in means
    // the engine sees everything the rack hears (external clock included).
    graph.addConnection ({ { engineNode->nodeID, midiChannel },
                           { lp.filterNode->nodeID, midiChannel } });

    applyPartToLive (part, lp);
    live[part.partId] = lp;
    rewireAudio();
}

void InstrumentRackHost::connectAudio (juce::AudioProcessorGraph::Node* from,
                                       juce::AudioProcessorGraph::Node* to)
{
    connectAudioPair (from, 0, from->getProcessor()->getTotalNumOutputChannels() >= 2, to);
}

void InstrumentRackHost::connectAudioPair (juce::AudioProcessorGraph::Node* from, int firstChannel,
                                           bool stereo, juce::AudioProcessorGraph::Node* to)
{
    // One stereo pair remains the rack's currency: a mono source feeds both sides, a mono
    // destination sums both sides, several sources into one destination sum on its inputs.
    // The output IO node reports its channels only once the graph is prepared, and the rack
    // is always stereo out — so it is pinned rather than asked.
    const auto ins  = to == audioOutNode.get()
                        ? 2
                        : juce::jmax (1, to->getProcessor()->getTotalNumInputChannels());
    const auto sourceRight = stereo ? firstChannel + 1 : firstChannel;

    if (ins >= 2)
    {
        graph.addConnection ({ { from->nodeID, firstChannel }, { to->nodeID, 0 } });
        graph.addConnection ({ { from->nodeID, sourceRight },  { to->nodeID, 1 } });
    }
    else
    {
        graph.addConnection ({ { from->nodeID, firstChannel }, { to->nodeID, 0 } });
        if (sourceRight != firstChannel)
            graph.addConnection ({ { from->nodeID, sourceRight }, { to->nodeID, 0 } });
    }
}

void InstrumentRackHost::connectAudioToOutputPair (juce::AudioProcessorGraph::Node* from, int pair)
{
    // The output IO node reports its channels only once the graph is prepared, so the pair
    // count comes from the model rather than from the node — the same reason connectAudio
    // pins the output at stereo.
    const auto first = juce::jlimit (0, 14, pair * 2);
    const auto outs = juce::jmax (1, from->getProcessor()->getTotalNumOutputChannels());
    const auto sourceRight = outs >= 2 ? 1 : 0;

    graph.addConnection ({ { from->nodeID, 0 },           { audioOutNode->nodeID, first } });
    graph.addConnection ({ { from->nodeID, sourceRight }, { audioOutNode->nodeID, first + 1 } });
}

void InstrumentRackHost::destroyAuxNodes (LivePart& lp)
{
    for (auto& [returnId, node] : lp.sendNodes)
    {
        juce::ignoreUnused (returnId);
        graph.removeNode (node->nodeID);
    }
    lp.sendNodes.clear();

    for (auto& [pairIndex, node] : lp.extraOutNodes)
    {
        juce::ignoreUnused (pairIndex);
        graph.removeNode (node->nodeID);
    }
    lp.extraOutNodes.clear();

    if (lp.midiSendNode != nullptr)
    {
        graph.removeNode (lp.midiSendNode->nodeID);
        lp.midiSendNode = nullptr;
        lp.midiSend = nullptr;
    }
}

void InstrumentRackHost::syncAuxNodes()
{
    // Return levels: one gain per chain, alive exactly as long as its chain.
    for (auto it = returnLevelNodes.begin(); it != returnLevelNodes.end();)
    {
        if (model.findReturn (it->first) == nullptr)
        {
            graph.removeNode (it->second->nodeID);
            it = returnLevelNodes.erase (it);
        }
        else
            ++it;
    }
    for (const auto& chain : model.returns)
    {
        auto& node = returnLevelNodes[chain.returnId];
        if (node == nullptr)
            node = graph.addNode (std::make_unique<GainPanProcessor>());
        static_cast<GainPanProcessor*> (node->getProcessor())
            ->setVolumePan (chain.level, 0.0f, true);
    }

    // Bus faders: the same life cycle, one per group bus.
    for (auto it = busLevelNodes.begin(); it != busLevelNodes.end();)
    {
        if (model.findBus (it->first) == nullptr)
        {
            graph.removeNode (it->second->nodeID);
            it = busLevelNodes.erase (it);
        }
        else
            ++it;
    }
    for (const auto& bus : model.buses)
    {
        auto& node = busLevelNodes[bus.busId];
        if (node == nullptr)
            node = graph.addNode (std::make_unique<GainPanProcessor>());
        static_cast<GainPanProcessor*> (node->getProcessor())
            ->setVolumePan (bus.level, 0.0f, true);
    }

    for (auto& [partId, lp] : live)
    {
        const auto* part = model.findPart (partId);
        if (part == nullptr)
            continue;

        // Send gains per (part, return) the model still names.
        for (auto it = lp.sendNodes.begin(); it != lp.sendNodes.end();)
        {
            bool wanted = false;
            for (const auto& send : part->sends)
                wanted = wanted || send.returnId == it->first;
            if (! wanted)
            {
                graph.removeNode (it->second->nodeID);
                it = lp.sendNodes.erase (it);
            }
            else
                ++it;
        }
        for (const auto& send : part->sends)
        {
            auto& node = lp.sendNodes[send.returnId];
            if (node == nullptr)
                node = graph.addNode (std::make_unique<GainPanProcessor>());
            static_cast<GainPanProcessor*> (node->getProcessor())
                ->setVolumePan (send.level, 0.0f, true);
        }

        // Extra-out gains per routed pair.
        for (auto it = lp.extraOutNodes.begin(); it != lp.extraOutNodes.end();)
        {
            bool wanted = false;
            for (const auto& extra : part->extraOuts)
                wanted = wanted || extra.pairIndex == it->first;
            if (! wanted)
            {
                graph.removeNode (it->second->nodeID);
                it = lp.extraOutNodes.erase (it);
            }
            else
                ++it;
        }
        for (const auto& extra : part->extraOuts)
        {
            auto& node = lp.extraOutNodes[extra.pairIndex];
            if (node == nullptr)
                node = graph.addNode (std::make_unique<GainPanProcessor>());
            static_cast<GainPanProcessor*> (node->getProcessor())
                ->setVolumePan (extra.gain, 0.0f, true);
        }

        // The hardware MIDI sender comes and goes with the part's role.
        if (part->hardware && lp.midiSendNode == nullptr)
        {
            auto sender = std::make_unique<MidiSendProcessor>();
            lp.midiSend = sender.get();
            lp.midiSendNode = graph.addNode (std::move (sender));
        }
        else if (! part->hardware && lp.midiSendNode != nullptr)
        {
            graph.removeNode (lp.midiSendNode->nodeID);
            lp.midiSendNode = nullptr;
            lp.midiSend = nullptr;
        }
        if (lp.midiSend != nullptr)
            lp.midiSend->setOutChannel (part->midiOutChannel);
    }
}

void InstrumentRackHost::rewireAudio()
{
    syncAuxNodes();

    // Every audio connection in this graph belongs to the one path this rebuilds (MIDI wires
    // ride the dedicated channel index), so drop-and-rebuild keeps the whole topology in one
    // readable place instead of tracking edits wire by wire.
    for (const auto& connection : graph.getConnections())
        if (connection.source.channelIndex != midiChannel)
            graph.removeConnection (connection);

    // Master chain first, because everything downstream of the parts needs its head: part
    // gains, extra outs and return tails all sum there (or at the output while it is empty).
    juce::Array<juce::AudioProcessorGraph::Node*> masterNodes;
    for (const auto& slot : model.masterEffects)
        if (const auto it = liveEffects.find (slot.effectId);
            it != liveEffects.end() && it->second.node != nullptr)
            masterNodes.add (it->second.node.get());

    // The master chain runs into the Performance fader, and the fader is pair 0's output.
    // Parts routed to another pair skip both, which is what "multi-output" means to a DAW.
    static_cast<GainPanProcessor*> (masterGainNode->getProcessor())
        ->setVolumePan (model.masterLevel, 0.0f, true);
    auto* masterSink = masterNodes.isEmpty() ? masterGainNode.get() : masterNodes.getFirst();

    // Group buses: every head exists before anything connects, so a bus feeding another bus
    // needs no ordering pass — the destinations are resolved once all the nodes are there.
    std::map<juce::String, juce::AudioProcessorGraph::Node*> busHeads;
    std::map<juce::String, juce::AudioProcessorGraph::Node*> busTails;
    for (const auto& bus : model.buses)
    {
        auto* levelNode = busLevelNodes[bus.busId].get();
        if (levelNode == nullptr)
            continue;

        juce::Array<juce::AudioProcessorGraph::Node*> fx;
        for (const auto& slot : bus.effects)
            if (const auto it = liveEffects.find (slot.effectId);
                it != liveEffects.end() && it->second.node != nullptr)
                fx.add (it->second.node.get());

        busHeads[bus.busId] = fx.isEmpty() ? levelNode : fx.getFirst();
        busTails[bus.busId] = levelNode;

        for (int i = 0; i + 1 < fx.size(); ++i)
            connectAudio (fx[i], fx[i + 1]);
        if (! fx.isEmpty())
            connectAudio (fx.getLast(), levelNode);
    }

    // Where each bus lands: another bus's head, or the master. The model refuses cycles when
    // the routing is made, and this refuses them again — a manifest edited by hand must not
    // be able to build a feedback loop in an audio graph.
    for (const auto& bus : model.buses)
    {
        const auto tail = busTails.find (bus.busId);
        if (tail == busTails.end())
            continue;

        auto* destination = masterSink;
        if (bus.destinationBusId.isNotEmpty()
            && ! model.busRoutingWouldLoop (bus.busId, bus.destinationBusId))
            if (const auto head = busHeads.find (bus.destinationBusId); head != busHeads.end())
                destination = head->second;

        connectAudio (tail->second, destination);
    }

    // Return chains: sends sum into the chain's head (its first loaded effect, else its
    // level gain), run the effects in order, and the level gain rejoins the master path.
    std::map<juce::String, juce::AudioProcessorGraph::Node*> returnHeads;
    for (const auto& chain : model.returns)
    {
        auto* levelNode = returnLevelNodes[chain.returnId].get();

        juce::Array<juce::AudioProcessorGraph::Node*> fx;
        for (const auto& slot : chain.effects)
            if (const auto it = liveEffects.find (slot.effectId);
                it != liveEffects.end() && it->second.node != nullptr)
                fx.add (it->second.node.get());

        returnHeads[chain.returnId] = fx.isEmpty() ? levelNode : fx.getFirst();
        for (int i = 0; i + 1 < fx.size(); ++i)
            connectAudio (fx[i], fx[i + 1]);
        if (! fx.isEmpty())
            connectAudio (fx.getLast(), levelNode);
        connectAudio (levelNode, masterSink);
    }

    // Per part: the audio source is the loaded instrument (software) or the configured
    // audio-return input channels (hardware) → inserts in slot order → the part's gain. A
    // part with neither leaves its chain idle rather than wiring effects to nothing.
    for (auto& [partId, lp] : live)
    {
        const auto* part = model.findPart (partId);
        if (part == nullptr)
            continue;

        if (part->hardware)
        {
            if (lp.midiSendNode != nullptr)
                graph.addConnection ({ { lp.filterNode->nodeID, midiChannel },
                                       { lp.midiSendNode->nodeID, midiChannel } });
        }
        else if (lp.instrumentNode != nullptr)
            graph.addConnection ({ { lp.filterNode->nodeID, midiChannel },
                                   { lp.instrumentNode->nodeID, midiChannel } });

        juce::Array<juce::AudioProcessorGraph::Node*> inserts;
        for (const auto& slot : part->effects)
            if (const auto it = liveEffects.find (slot.effectId);
                it != liveEffects.end() && it->second.node != nullptr)
                inserts.add (it->second.node.get());

        auto* chainHead = inserts.isEmpty() ? lp.gainNode.get() : inserts.getFirst();

        bool hasSource = false;
        if (part->hardware)
        {
            if (part->audioReturnChannel >= 0
                && part->audioReturnChannel < audioInNode->getProcessor()->getTotalNumOutputChannels())
            {
                connectAudioPair (audioInNode.get(), part->audioReturnChannel,
                                  part->audioReturnStereo, chainHead);
                hasSource = true;
            }
        }
        else if (lp.instrumentNode != nullptr)
        {
            connectAudio (lp.instrumentNode.get(), chainHead);
            hasSource = true;
        }

        if (hasSource)
        {
            for (int i = 0; i + 1 < inserts.size(); ++i)
                connectAudio (inserts[i], inserts[i + 1]);
            if (! inserts.isEmpty())
                connectAudio (inserts.getLast(), lp.gainNode.get());
        }

        // Pair 0 is the master path; any other pair leaves straight through the output node,
        // unprocessed by the master chain and untouched by the Performance fader. On the
        // main pair a part joins its group bus when it names one — that is the whole of
        // "these two instruments become one thing I then process".
        const auto pair = juce::jlimit (0, juce::jmax (0, model.outputPairs - 1), part->outputPair);
        if (pair == 0)
        {
            auto* destination = masterSink;
            if (part->destinationBusId.isNotEmpty())
                if (const auto head = busHeads.find (part->destinationBusId); head != busHeads.end())
                    destination = head->second;
            connectAudio (lp.gainNode.get(), destination);
        }
        else
        {
            connectAudioToOutputPair (lp.gainNode.get(), pair);
        }

        // Post-fader sends: the part's gain output, scaled per send, into each return head.
        for (const auto& send : part->sends)
            if (const auto nodeIt = lp.sendNodes.find (send.returnId);
                nodeIt != lp.sendNodes.end())
                if (const auto headIt = returnHeads.find (send.returnId);
                    headIt != returnHeads.end())
                {
                    connectAudio (lp.gainNode.get(), nodeIt->second.get());
                    connectAudio (nodeIt->second.get(), headIt->second);
                }

        // Explicit multi-output pairs, straight to the master path with their own gain —
        // the main pair keeps the inserts and the fader.
        if (! part->hardware && lp.instrumentNode != nullptr)
        {
            const auto channels = lp.instrumentNode->getProcessor()->getTotalNumOutputChannels();
            for (const auto& extra : part->extraOuts)
                if (const auto it = lp.extraOutNodes.find (extra.pairIndex);
                    it != lp.extraOutNodes.end() && extra.pairIndex * 2 < channels)
                {
                    connectAudioPair (lp.instrumentNode.get(), extra.pairIndex * 2,
                                      extra.pairIndex * 2 + 1 < channels, it->second.get());
                    connectAudio (it->second.get(), masterSink);
                }
        }
    }

    // Master serial hops, tail into the fader, fader into output pair 0.
    for (int i = 0; i + 1 < masterNodes.size(); ++i)
        connectAudio (masterNodes[i], masterNodes[i + 1]);
    if (! masterNodes.isEmpty())
        connectAudio (masterNodes.getLast(), masterGainNode.get());
    connectAudioToOutputPair (masterGainNode.get(), 0);
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
