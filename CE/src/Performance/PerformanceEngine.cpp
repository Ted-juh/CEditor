#include "PerformanceEngine.h"

namespace ceditor::perf
{

PerformanceEngine::PerformanceEngine()
{
    for (auto& buffer : staging)
        buffer.ensureSize (512);   // once, here — never on the audio thread
}

PerformanceEngine::~PerformanceEngine()
{
    liveSong.store (nullptr);
}

void PerformanceEngine::prepare (double sampleRate, int blockSize, int numParts)
{
    currentSampleRate = sampleRate > 0.0 ? sampleRate : 44100.0;
    activeParts = juce::jlimit (0, maxParts, numParts);

    const auto bytes = (size_t) juce::jmax (512, blockSize * 4);
    for (auto& buffer : staging)
        buffer.ensureSize (bytes);
}

void PerformanceEngine::setSong (std::unique_ptr<CompiledSong> song, int generation)
{
    reclaimRetiredSongs();

    auto* raw = song.get();

    if (ownedSong != nullptr)
        retiredSongs.push_back ({ std::move (ownedSong), blockCounter.load() });

    ownedSong = std::move (song);
    songGeneration.store (generation);
    liveSong.store (raw);   // the swap: one atomic store, nothing half-published
}

void PerformanceEngine::reclaimRetiredSongs()
{
    // A retired song is safe to destroy once a block has completed after it was retired: the
    // audio thread reads liveSong at the top of a block and does not hold it past the end.
    const auto now = blockCounter.load();
    for (int i = (int) retiredSongs.size(); --i >= 0;)
        if (retiredSongs[(size_t) i].atBlock < now)
            retiredSongs.erase (retiredSongs.begin() + i);
}

void PerformanceEngine::launchClip (int clipIndex)
{
    const auto* song = liveSong.load();
    const auto quantize = song != nullptr && juce::isPositiveAndBelow (clipIndex, (int) song->clips.size())
                            ? song->clips[(size_t) clipIndex].launchQuantize
                            : Quantize::bar;
    launchClip (clipIndex, quantize);
}

void PerformanceEngine::launchClip (int clipIndex, Quantize quantize)
{
    Command command;
    command.type = Command::Type::launchClip;
    command.index = clipIndex;
    command.quantize = quantize;

    const auto scope = commandFifo.write (1);
    if (scope.blockSize1 > 0)
        commandSlots[(size_t) scope.startIndex1] = command;
}

void PerformanceEngine::stopClip (int clipIndex, Quantize quantize)
{
    Command command;
    command.type = Command::Type::stopClip;
    command.index = clipIndex;
    command.quantize = quantize;

    const auto scope = commandFifo.write (1);
    if (scope.blockSize1 > 0)
        commandSlots[(size_t) scope.startIndex1] = command;
}

void PerformanceEngine::stopAllClips (Quantize quantize)
{
    Command command;
    command.type = Command::Type::stopAll;
    command.quantize = quantize;

    const auto scope = commandFifo.write (1);
    if (scope.blockSize1 > 0)
        commandSlots[(size_t) scope.startIndex1] = command;
}

void PerformanceEngine::launchScene (const juce::Array<int>& clipIndices, bool stopOthers,
                                     Quantize quantize, int token)
{
    Command command;
    command.type = Command::Type::launchScene;
    command.quantize = quantize;
    command.stopOthers = stopOthers;
    command.token = token;

    for (const auto clipIndex : clipIndices)
        if (juce::isPositiveAndBelow (clipIndex, maxClips))
            command.clipMask[(size_t) (clipIndex / 64)] |= (juce::uint64) 1 << (clipIndex % 64);

    const auto scope = commandFifo.write (1);
    if (scope.blockSize1 > 0)
        commandSlots[(size_t) scope.startIndex1] = command;
}

void PerformanceEngine::panic()
{
    panicRequested.store (true);
}

bool PerformanceEngine::popEvent (OutEvent& event)
{
    const auto scope = eventFifo.read (1);
    if (scope.blockSize1 <= 0)
        return false;

    event = eventSlots[(size_t) scope.startIndex1];
    return true;
}

void PerformanceEngine::pushEvent (OutEvent::Type type, int index, float value)
{
    OutEvent event;
    event.type = type;
    event.index = index;
    event.value = value;
    event.generation = songGeneration.load();

    const auto scope = eventFifo.write (1);
    if (scope.blockSize1 > 0)
        eventSlots[(size_t) scope.startIndex1] = event;
    // A full queue drops the oldest news rather than blocking the audio thread; the state
    // push that follows any real edit re-synchronises the UI anyway.
}

bool PerformanceEngine::isClipActive (int clipIndex) const noexcept
{
    return juce::isPositiveAndBelow (clipIndex, maxClips) && clips[(size_t) clipIndex].active;
}

bool PerformanceEngine::isClipPending (int clipIndex) const noexcept
{
    return juce::isPositiveAndBelow (clipIndex, maxClips) && clips[(size_t) clipIndex].pending;
}

float PerformanceEngine::clipPhase (int clipIndex) const noexcept
{
    if (! isClipActive (clipIndex))
        return 0.0f;

    const auto* song = liveSong.load();
    if (song == nullptr || ! juce::isPositiveAndBelow (clipIndex, (int) song->clips.size()))
        return 0.0f;

    const auto& clip = song->clips[(size_t) clipIndex];
    if (! juce::isPositiveAndBelow (clip.patternIndex, (int) song->patterns.size()))
        return 0.0f;

    const auto length = song->patterns[(size_t) clip.patternIndex].lengthPpq;
    if (length <= 0.0)
        return 0.0f;

    const auto local = transport.getPositionPpq() - clips[(size_t) clipIndex].startPpq;
    if (local < 0.0)
        return 0.0f;

    return (float) (std::fmod (local, length) / length);
}

const juce::MidiBuffer& PerformanceEngine::stagingFor (int partIndex) const noexcept
{
    if (! juce::isPositiveAndBelow (partIndex, maxParts))
        return emptyStaging;
    return staging[(size_t) partIndex];
}

void PerformanceEngine::applyLaunch (int clipIndex, double atPpq, int sceneToken)
{
    if (! juce::isPositiveAndBelow (clipIndex, maxClips))
        return;

    auto& state = clips[(size_t) clipIndex];

    // Relaunching a clip restarts it from the top of its pattern: that is what a player
    // pressing the pad twice means, and it keeps the phase predictable.
    if (state.active)
        flushNotes (clipIndex, 0);

    state.active = true;
    state.pending = false;
    state.startPpq = atPpq;
    state.stopAtPpq = -1.0;
    state.loopsPlayed = 0;
    state.sceneToken = sceneToken;
    state.lastGlide.fill (-1.0f);
    pushEvent (OutEvent::Type::clipStarted, clipIndex, 0.0f);
}

void PerformanceEngine::handleCommands (double positionPpq)
{
    Command command;

    while (commandFifo.getNumReady() > 0)
    {
        {
            const auto scope = commandFifo.read (1);
            if (scope.blockSize1 <= 0)
                break;
            command = commandSlots[(size_t) scope.startIndex1];
        }

        const auto boundary = transport.isPlaying()
                                ? transport.nextBoundary (positionPpq, command.quantize)
                                : positionPpq;

        switch (command.type)
        {
            case Command::Type::launchClip:
                if (juce::isPositiveAndBelow (command.index, maxClips))
                {
                    auto& state = clips[(size_t) command.index];
                    state.pending = true;
                    state.pendingLaunchPpq = boundary;
                    state.sceneToken = 0;
                }
                break;

            case Command::Type::stopClip:
                if (juce::isPositiveAndBelow (command.index, maxClips))
                {
                    auto& state = clips[(size_t) command.index];
                    if (state.active)
                        state.stopAtPpq = boundary;
                    state.pending = false;
                }
                break;

            case Command::Type::stopAll:
                for (int i = 0; i < maxClips; ++i)
                {
                    auto& state = clips[(size_t) i];
                    state.pending = false;
                    if (state.active)
                        state.stopAtPpq = boundary;
                }
                break;

            case Command::Type::launchScene:
            {
                for (int i = 0; i < maxClips; ++i)
                {
                    const bool inScene = (command.clipMask[(size_t) (i / 64)]
                                            & ((juce::uint64) 1 << (i % 64))) != 0;
                    auto& state = clips[(size_t) i];

                    if (inScene)
                    {
                        state.pending = true;
                        state.pendingLaunchPpq = boundary;
                        state.sceneToken = command.token;
                    }
                    else if (command.stopOthers && state.active)
                    {
                        state.stopAtPpq = boundary;
                        state.pending = false;
                    }
                    else if (command.stopOthers)
                    {
                        state.pending = false;
                    }
                }

                // An empty scene still has to announce itself at its boundary, or a scene that
                // only recalls macros would never be applied. A pending marker on no clip is
                // impossible, so the announcement rides a dedicated pending slot: clip -1.
                bool anyClip = false;
                for (const auto word : command.clipMask)
                    anyClip = anyClip || word != 0;
                if (! anyClip && command.token != 0)
                    pushEvent (OutEvent::Type::sceneApplied, command.token, 0.0f);
                break;
            }

            case Command::Type::panic:
                break;
        }
    }
}

void PerformanceEngine::emitNote (int partIndex, int clipIndex, juce::uint8 channel,
                                  juce::uint8 note, juce::uint8 velocity, double releasePpq,
                                  int sampleOffset)
{
    if (! juce::isPositiveAndBelow (partIndex, maxParts))
        return;

    // A retrigger of the same note on the same destination gets its predecessor's note-off
    // first: two note-ons and one note-off is how a hung note is born.
    for (auto& slot : sounding)
        if (slot.active && slot.partIndex == partIndex && slot.note == note
            && slot.channel == channel)
        {
            staging[(size_t) partIndex].addEvent (juce::MidiMessage::noteOff (channel, note),
                                                  sampleOffset);
            slot.active = false;
        }

    for (auto& slot : sounding)
    {
        if (slot.active)
            continue;

        slot.active = true;
        slot.releasePpq = releasePpq;
        slot.partIndex = partIndex;
        slot.clipIndex = clipIndex;
        slot.channel = channel;
        slot.note = note;
        staging[(size_t) partIndex].addEvent (juce::MidiMessage::noteOn (channel, note, velocity),
                                              sampleOffset);
        return;
    }
    // Out of voices: the note is not started, so it cannot hang. Dropping a note under an
    // absurd load beats emitting one nothing will ever release.
}

void PerformanceEngine::releaseDueNotes (const Transport::BlockTime& block, int numSamples)
{
    for (auto& slot : sounding)
    {
        if (! slot.active || slot.releasePpq >= block.endPpq)
            continue;

        const auto offset = block.sampleFor (juce::jmax (slot.releasePpq, block.startPpq), numSamples);
        if (juce::isPositiveAndBelow (slot.partIndex, maxParts))
            staging[(size_t) slot.partIndex].addEvent (juce::MidiMessage::noteOff (slot.channel,
                                                                                    slot.note),
                                                       offset);
        slot.active = false;
    }
}

void PerformanceEngine::flushNotes (int clipIndex, int sampleOffset)
{
    for (auto& slot : sounding)
    {
        if (! slot.active)
            continue;
        if (clipIndex >= 0 && slot.clipIndex != clipIndex)
            continue;

        if (juce::isPositiveAndBelow (slot.partIndex, maxParts))
            staging[(size_t) slot.partIndex].addEvent (juce::MidiMessage::noteOff (slot.channel,
                                                                                    slot.note),
                                                       sampleOffset);
        slot.active = false;
    }
}

void PerformanceEngine::renderClip (int clipIndex, const CompiledSong& song,
                                    const Transport::BlockTime& block, int numSamples)
{
    auto& state = clips[(size_t) clipIndex];
    const auto& clip = song.clips[(size_t) clipIndex];

    if (! juce::isPositiveAndBelow (clip.patternIndex, (int) song.patterns.size()))
        return;

    const auto& pattern = song.patterns[(size_t) clip.patternIndex];

    const auto clipStart = juce::jmax (block.startPpq, state.startPpq);
    auto clipEnd = block.endPpq;
    if (state.stopAtPpq >= 0.0)
        clipEnd = juce::jmin (clipEnd, state.stopAtPpq);
    if (clipEnd <= clipStart)
        return;

    const auto localStart = clipStart - state.startPpq;
    const auto localEnd = clipEnd - state.startPpq;

    // A clip that does not loop, or one that has served its follow count, ends at the top of
    // the loop after its last: the boundary is decided here, in musical time.
    const auto patternLength = juce::jmax (0.0625, pattern.lengthPpq);
    const auto loopsAtEnd = (int) std::floor (localEnd / patternLength);
    if (loopsAtEnd > state.loopsPlayed)
    {
        state.loopsPlayed = loopsAtEnd;

        const bool doneLooping = ! clip.loop && state.loopsPlayed >= 1;
        const bool doneFollowing = clip.followAfterLoops > 0
                                     && state.loopsPlayed >= clip.followAfterLoops;

        if (doneLooping || doneFollowing)
        {
            const auto boundary = state.startPpq + patternLength * (double) state.loopsPlayed;
            state.stopAtPpq = boundary;

            if (doneFollowing && juce::isPositiveAndBelow (clip.followClipIndex, maxClips))
            {
                auto& next = clips[(size_t) clip.followClipIndex];
                next.pending = true;
                next.pendingLaunchPpq = boundary;
                next.sceneToken = 0;
            }

            clipEnd = juce::jmin (clipEnd, boundary);
        }
    }

    for (size_t laneIndex = 0; laneIndex < pattern.lanes.size(); ++laneIndex)
    {
        const auto& lane = pattern.lanes[laneIndex];
        if (lane.muted || lane.events.empty())
            continue;

        const bool isParameterLane = lane.type == LaneType::parameter;
        if (isParameterLane ? lane.targetIndex < 0 : lane.partIndex < 0)
            continue;   // unresolved: marked in the UI, silent here — never retargeted

        const auto laneLength = juce::jmax (0.0625, lane.lengthPpq);
        const auto windowStart = clipStart - state.startPpq;
        const auto windowEnd = juce::jmin (clipEnd, block.endPpq) - state.startPpq;
        if (windowEnd <= windowStart)
            continue;

        // The window can be a hair wide when a launch boundary lands within floating-point
        // noise of a block edge, so the loop range is clamped rather than allowed to invert —
        // and the membership test below carries the same tolerance on both ends, which keeps
        // adjacent windows disjoint (no event plays twice) while an event sitting exactly on
        // the launch instant still plays once.
        const auto firstLoop = (int) std::floor (windowStart / laneLength);
        const auto lastLoop = (int) std::floor (juce::jmax (windowStart, windowEnd - timingEpsilon)
                                                  / laneLength);

        for (int loop = firstLoop; loop <= lastLoop; ++loop)
        {
            const auto loopStartPpq = (double) loop * laneLength;
            const auto from = juce::jmax (windowStart, loopStartPpq) - loopStartPpq;
            const auto to = juce::jmin (windowEnd, loopStartPpq + laneLength) - loopStartPpq;

            for (const auto& event : lane.events)
            {
                if (event.ppq < from - timingEpsilon || event.ppq >= to - timingEpsilon)
                    continue;
                if (! eventPlaysOnLoop (event, loop, (int) laneIndex))
                    continue;

                const auto absolute = state.startPpq + loopStartPpq + event.ppq;
                const auto offset = block.sampleFor (absolute, numSamples);

                switch (event.type)
                {
                    case CompiledEventType::note:
                        emitNote (lane.partIndex, clipIndex, event.channel, event.data1,
                                  event.data2, absolute + event.durationPpq, offset);
                        break;

                    case CompiledEventType::controller:
                        if (juce::isPositiveAndBelow (lane.partIndex, maxParts))
                            staging[(size_t) lane.partIndex].addEvent (
                                juce::MidiMessage::controllerEvent (event.channel, event.data1,
                                                                    event.data2), offset);
                        break;

                    case CompiledEventType::parameter:
                        // Straight out to the message thread; the audio thread never touches
                        // a plug-in parameter object.
                        pushEvent (OutEvent::Type::parameterValue, lane.targetIndex, event.value);
                        break;
                }
            }
        }

        // Glide: one interpolated value per block, so a ramp is smooth without the audio
        // thread ever emitting more than a bounded number of events (§18.8.7).
        if (lane.glide && laneIndex < maxGlideLanes
            && (lane.type == LaneType::parameter || lane.type == LaneType::cc)
            && lane.events.size() >= 2)
        {
            const auto local = std::fmod (juce::jmax (0.0, windowEnd), laneLength);

            const CompiledEvent* before = &lane.events.back();
            const CompiledEvent* after = &lane.events.front();
            double beforePpq = lane.events.back().ppq - laneLength;
            double afterPpq = lane.events.front().ppq;

            for (const auto& event : lane.events)
            {
                if (event.ppq <= local) { before = &event; beforePpq = event.ppq; }
                else                    { after = &event;  afterPpq = event.ppq; break; }
            }
            if (afterPpq <= beforePpq)
                afterPpq = beforePpq + laneLength;

            const auto span = juce::jmax (1.0e-6, afterPpq - beforePpq);
            const auto t = juce::jlimit (0.0, 1.0, (local - beforePpq) / span);
            const auto value = (float) ((double) before->value * (1.0 - t) + (double) after->value * t);

            auto& last = state.lastGlide[laneIndex];
            if (std::abs (value - last) > 0.002f)
            {
                last = value;
                if (lane.type == LaneType::parameter)
                {
                    pushEvent (OutEvent::Type::parameterValue, lane.targetIndex, value);
                }
                else if (juce::isPositiveAndBelow (lane.partIndex, maxParts))
                {
                    const auto cc = (int) juce::jlimit (0, 127, juce::roundToInt (value * 127.0f));
                    staging[(size_t) lane.partIndex].addEvent (
                        juce::MidiMessage::controllerEvent (before->channel, before->data1, cc),
                        juce::jmax (0, numSamples - 1));
                }
            }
        }
    }
}

void PerformanceEngine::processBlock (int numSamples, const juce::MidiBuffer& liveInput)
{
    for (int i = 0; i < maxParts; ++i)
        staging[(size_t) i].clear();

    transport.consumeExternalClock (liveInput, currentSampleRate);

    const auto block = transport.advance (numSamples, currentSampleRate);
    blockCounter.fetch_add (1);

    if (panicRequested.exchange (false))
    {
        flushNotes (-1, 0);
        for (auto& state : clips)
        {
            if (state.active)
                pushEvent (OutEvent::Type::clipStopped, (int) (&state - clips.data()), 0.0f);
            state.active = false;
            state.pending = false;
            state.stopAtPpq = -1.0;
        }
    }

    // A jump or a stop releases everything the engine is holding: no orphan notes, ever
    // (§18.8.13). The notes belong to this engine, so nothing else has to know.
    if (transport.consumeJumped() || block.justStopped)
        flushNotes (-1, 0);

    handleCommands (block.startPpq);

    const auto* song = liveSong.load();
    if (song == nullptr || ! block.playing)
        return;

    // Pending launches whose boundary lands inside this block become active now.
    for (int i = 0; i < (int) song->clips.size() && i < maxClips; ++i)
    {
        auto& state = clips[(size_t) i];
        if (! state.pending)
            continue;

        if (state.pendingLaunchPpq < block.endPpq)
        {
            const auto token = state.sceneToken;
            applyLaunch (i, juce::jmax (state.pendingLaunchPpq, block.startPpq), token);
            if (token != 0)
            {
                // Announce once per scene, not once per clip: the first clip of the scene to
                // land is the instant the scene took effect.
                bool alreadyAnnounced = false;
                for (int j = 0; j < i; ++j)
                    alreadyAnnounced = alreadyAnnounced || clips[(size_t) j].sceneToken == token;
                if (! alreadyAnnounced)
                    pushEvent (OutEvent::Type::sceneApplied, token, 0.0f);
            }
        }
    }

    releaseDueNotes (block, numSamples);

    for (int i = 0; i < (int) song->clips.size() && i < maxClips; ++i)
    {
        auto& state = clips[(size_t) i];
        if (! state.active)
            continue;

        renderClip (i, *song, block, numSamples);

        // A stop that falls inside this block ends the clip here, with its notes released at
        // the same instant rather than at the end of the buffer.
        if (state.stopAtPpq >= 0.0 && state.stopAtPpq < block.endPpq)
        {
            const auto offset = block.sampleFor (juce::jmax (state.stopAtPpq, block.startPpq),
                                                 numSamples);
            flushNotes (i, offset);
            state.active = false;
            state.stopAtPpq = -1.0;
            pushEvent (OutEvent::Type::clipStopped, i, 0.0f);
        }
    }
}

} // namespace ceditor::perf
