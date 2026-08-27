#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <atomic>

// Transport — the one timing authority (VIP-successor Stage 6, baseline §18.8.3).
//
// The audio engine owns musical time. Everything else — the WebView's playhead, the
// hardware's position display, the pattern scheduler — READS this; nothing else schedules
// musical events. That is the whole point of the baseline's "one native timing/event engine"
// rule: an arpeggiator that keeps its own clock and a step sequencer that keeps another is
// how two features end up a millisecond apart on stage.
//
// THE BLOCK CONTRACT. advance() is called once per audio block, on the audio thread, and
// returns the musical window that block covers: [startPpq, endPpq) plus the ppq-per-sample
// slope, so any event inside it converts to an exact sample offset. Position is in quarter
// notes (PPQ, the same unit JUCE, VST3 and every DAW speak), never in bars — bars are a
// presentation of ppq through the time signature and change meaning when the signature does.
//
// THREADING. Setters are atomic and safe from the message thread while audio runs: tempo and
// time signature take effect at the next block boundary, which is musically inaudible and
// keeps the block's own slope constant (a tempo change mid-block would make the sample
// offsets inside that block lie). start/stop/continue are requests the audio thread consumes
// at the top of advance() so a transport change never lands halfway through a block.
//
// EXTERNAL CLOCK. In external mode the transport is a slave: 0xF8 ticks (24 per quarter note)
// arrive with their sample offsets, tempo is derived from the interval between them, and the
// position follows the tick count rather than free-running. Because a stopped or unplugged
// master is silence rather than an error, clock loss has a defined fallback (§18.8.13): after
// `clockTimeoutMs` without a tick the transport stops itself and says why.
//
// DAW HOST SYNC (Stage 7, §18.9.3) is the third source, and deliberately the SAME contract:
// the outer VST3 reads its AudioPlayHead once per block and hands the host's tempo, signature,
// position and play state to applyHostPosition(); the transport then follows that position
// instead of integrating its own, exactly as it follows a MIDI master's tick count. There is
// still one transport — a source selector, not a second clock — which is what keeps Stage 6's
// sequencer, arpeggiators and hardware display agreeing about where bar three is whether the
// clock came from inside, from a cable, or from Cubase.

namespace ceditor::perf
{

/** Launch quantization: when a clip, scene or pattern change is allowed to take effect. */
enum class Quantize
{
    immediate = 0,
    sixteenth,
    eighth,
    beat,
    halfBar,
    bar,
    twoBars,
    fourBars,
};

inline const char* quantizeName (Quantize q) noexcept
{
    switch (q)
    {
        case Quantize::immediate: return "immediate";
        case Quantize::sixteenth: return "1/16";
        case Quantize::eighth:    return "1/8";
        case Quantize::beat:      return "beat";
        case Quantize::halfBar:   return "1/2 bar";
        case Quantize::bar:       return "bar";
        case Quantize::twoBars:   return "2 bars";
        case Quantize::fourBars:  return "4 bars";
    }
    return "bar";
}

inline Quantize quantizeFromName (const juce::String& name) noexcept
{
    for (int i = 0; i <= (int) Quantize::fourBars; ++i)
        if (name == quantizeName ((Quantize) i))
            return (Quantize) i;
    return Quantize::bar;
}

class Transport
{
public:
    /** The musical window one audio block covers. */
    struct BlockTime
    {
        double startPpq = 0.0;
        double endPpq = 0.0;
        double ppqPerSample = 0.0;
        bool playing = false;
        /** True on the block where playback started — the scheduler arms its state here. */
        bool justStarted = false;
        /** True on the block where playback stopped — the scheduler flushes its notes here. */
        bool justStopped = false;

        /** The sample offset inside this block for a position in the window; clamped so a
            boundary exactly at endPpq lands on the last sample rather than the next block. */
        int sampleFor (double ppq, int numSamples) const noexcept
        {
            if (ppqPerSample <= 0.0)
                return 0;
            const auto offset = (int) ((ppq - startPpq) / ppqPerSample);
            return juce::jlimit (0, juce::jmax (0, numSamples - 1), offset);
        }

        bool contains (double ppq) const noexcept   { return ppq >= startPpq && ppq < endPpq; }
    };

    // -- message-thread setters ----------------------------------------------------------

    void setTempo (double bpm) noexcept
    {
        tempoBpm.store (juce::jlimit (20.0, 300.0, bpm));
    }

    double getTempo() const noexcept                { return tempoBpm.load(); }

    void setTimeSignature (int numerator, int denominator) noexcept
    {
        tsNumerator.store (juce::jlimit (1, 32, numerator));
        // Only the powers of two a musician can actually write.
        const int d = denominator >= 16 ? 16 : denominator >= 8 ? 8 : denominator >= 4 ? 4 : 2;
        tsDenominator.store (d);
    }

    int getTimeSignatureNumerator() const noexcept   { return tsNumerator.load(); }
    int getTimeSignatureDenominator() const noexcept { return tsDenominator.load(); }

    /** Quarter notes per bar under the current signature. */
    double barLengthPpq() const noexcept
    {
        return 4.0 * (double) tsNumerator.load() / (double) tsDenominator.load();
    }

    void start() noexcept                           { startRequested.store (true); }
    void stop() noexcept                            { stopRequested.store (true); }

    /** Start from wherever the position already is (the MIDI "continue" verb). */
    void continuePlayback() noexcept
    {
        continueRequested.store (true);
        startRequested.store (true);
    }

    /** Moves the playhead. Takes effect at the next block; while playing this is a jump, and
        the scheduler treats it as one (its sounding notes are released). */
    void setPosition (double ppq) noexcept
    {
        requestedPosition.store (juce::jmax (0.0, ppq));
        positionRequested.store (true);
    }

    // -- DAW host sync (Stage 7) ---------------------------------------------------------

    /** Turns host sync on. While on, the transport follows whatever applyHostPosition()
        reports and refuses local start/stop — the DAW's play button is the play button. */
    void setHostSyncEnabled (bool shouldFollowHost) noexcept
    {
        hostSync.store (shouldFollowHost);
        if (! shouldFollowHost)
            haveHostPosition.store (false);
    }

    bool isHostSyncEnabled() const noexcept         { return hostSync.load(); }
    /** True once the host has actually reported a position — a DAW that exposes no playhead
        leaves this false, and the transport keeps running on its own rather than freezing. */
    bool hasHostPosition() const noexcept           { return haveHostPosition.load(); }

    /** Audio thread, once per block, BEFORE advance(). Everything the host knows: its tempo,
        its signature, where its playhead is in quarter notes, and whether it is rolling. */
    void applyHostPosition (double tempo, int numerator, int denominator, double ppqPosition,
                            bool hostIsPlaying) noexcept
    {
        if (! hostSync.load())
            return;

        haveHostPosition.store (true);

        if (tempo > 0.0)
            tempoBpm.store (juce::jlimit (20.0, 300.0, tempo));
        if (numerator > 0 && denominator > 0)
            setTimeSignature (numerator, denominator);

        // The host's position is the position. Following it rather than integrating our own
        // is what makes a loop jump, a locate or a tempo ramp land in the right place — the
        // same reason external clock follows its tick count.
        const auto position = juce::jmax (0.0, ppqPosition);
        if (std::abs (position - positionPpq.load()) > 1.0e-9)
        {
            positionPpq.store (position);
            if (hostIsPlaying)
                hostJumped.store (true);
        }

        hostPlaying.store (hostIsPlaying);
    }

    void setExternalClockEnabled (bool shouldSlave) noexcept
    {
        externalClock.store (shouldSlave);
        if (! shouldSlave)
        {
            // Leaving external mode retires the diagnostic with it: "no clock" is only a
            // fault while something is supposed to be sending one.
            clockSampleCounter.store (0);
            haveClock.store (false);
            externalClockLost.store (false);
        }
    }

    bool isExternalClockEnabled() const noexcept    { return externalClock.load(); }

    // -- readable from any thread ---------------------------------------------------------

    bool isPlaying() const noexcept                 { return playing.load(); }
    double getPositionPpq() const noexcept          { return positionPpq.load(); }

    /** Bars/beats for display: bar and beat are 1-based, the way a musician counts. */
    void positionInBarsBeats (int& bar, int& beat, double& fractionOfBeat) const noexcept
    {
        const auto ppq = positionPpq.load();
        const auto barPpq = barLengthPpq();
        const auto beatPpq = 4.0 / (double) tsDenominator.load();
        const auto barIndex = std::floor (ppq / barPpq);
        const auto intoBar = ppq - barIndex * barPpq;
        const auto beatIndex = std::floor (intoBar / beatPpq);
        bar = (int) barIndex + 1;
        beat = (int) beatIndex + 1;
        fractionOfBeat = (intoBar - beatIndex * beatPpq) / beatPpq;
    }

    /** True when external mode has lost its master (nothing to follow) — the UI says so
        rather than showing a transport that mysteriously will not run. */
    bool hasLostExternalClock() const noexcept      { return externalClockLost.load(); }

    // -- audio thread ---------------------------------------------------------------------

    /** Consumes any pending transport requests and advances the playhead by one block.
        Nothing here allocates or locks. */
    BlockTime advance (int numSamples, double sampleRate) noexcept
    {
        BlockTime block;

        if (positionRequested.exchange (false))
        {
            positionPpq.store (requestedPosition.load());
            jumped.store (true);
        }

        const bool wasPlaying = playing.load();
        const bool followingHost = hostSync.load() && haveHostPosition.load();

        if (followingHost)
        {
            // The DAW's play button is the play button: local requests are consumed so they
            // cannot fire later, but they do not move a transport the host owns.
            startRequested.store (false);
            stopRequested.store (false);
            continueRequested.store (false);
            playing.store (hostPlaying.load());
            if (hostJumped.exchange (false))
                jumped.store (true);
        }

        if (! followingHost && stopRequested.exchange (false))
            playing.store (false);

        if (! followingHost && startRequested.exchange (false))
        {
            // "Start" rewinds, "continue" does not — the MIDI verbs, kept apart because a
            // player pressing start expects the top of the pattern.
            if (! continueRequested.exchange (false))
                positionPpq.store (0.0);
            playing.store (true);
        }

        // External mode: the master's ticks move the playhead, so a slave that has heard
        // nothing recently must not free-run past its master.
        if (externalClock.load())
        {
            const auto samplesSinceTick = clockSampleCounter.fetch_add (numSamples) + numSamples;
            const auto timeoutSamples = (juce::int64) (sampleRate * clockTimeoutMs / 1000.0);
            if (haveClock.load() && samplesSinceTick > timeoutSamples)
            {
                externalClockLost.store (true);
                haveClock.store (false);
                playing.store (false);
            }
        }
        else
        {
            externalClockLost.store (false);
        }

        const bool nowPlaying = playing.load();
        block.playing = nowPlaying;
        block.justStarted = nowPlaying && ! wasPlaying;
        block.justStopped = wasPlaying && ! nowPlaying;

        const auto bpm = tempoBpm.load();
        block.ppqPerSample = sampleRate > 0.0 ? bpm / 60.0 / sampleRate : 0.0;
        block.startPpq = positionPpq.load();
        block.endPpq = nowPlaying ? block.startPpq + block.ppqPerSample * (double) numSamples
                                  : block.startPpq;

        // Under host sync the next block's start comes from the host, not from here: writing
        // an integrated position would fight the playhead and drift against it.
        if (nowPlaying && ! followingHost)
            positionPpq.store (block.endPpq);

        return block;
    }

    /** True once per jump, for the scheduler to release what it was holding. */
    bool consumeJumped() noexcept                   { return jumped.exchange (false); }

    /** Audio thread: one 0xF8 tick from the master, at `sampleOffset` into the current block.
        Twenty-four ticks make a quarter note; the interval between them is the tempo. */
    void handleExternalClockTick (int sampleOffset, double sampleRate) noexcept
    {
        juce::ignoreUnused (sampleOffset);
        if (! externalClock.load())
            return;

        const auto samplesSinceLast = clockSampleCounter.exchange (0);
        externalClockLost.store (false);

        if (haveClock.load() && samplesSinceLast > 0 && sampleRate > 0.0)
        {
            const auto secondsPerTick = (double) samplesSinceLast / sampleRate;
            const auto bpm = 60.0 / (secondsPerTick * 24.0);
            if (bpm > 20.0 && bpm < 300.0)
            {
                // A light average: MIDI clock jitters, and a tempo readout that flickers is
                // worse than one that settles a beat late.
                const auto smoothed = tempoBpm.load() * 0.8 + bpm * 0.2;
                tempoBpm.store (smoothed);
            }
        }

        haveClock.store (true);

        // The tick itself is the position: one twenty-fourth of a quarter note. Following the
        // count rather than integrating our own tempo is what keeps a slave from drifting.
        if (playing.load())
            positionPpq.store (positionPpq.load() + 1.0 / 24.0);
    }

    /** Audio thread: 0xFA / 0xFB / 0xFC from the master. */
    void handleExternalTransport (bool isStart, bool isContinue, bool isStop) noexcept
    {
        if (! externalClock.load())
            return;

        if (isStop)
            playing.store (false);
        if (isStart)
        {
            positionPpq.store (0.0);
            playing.store (true);
        }
        if (isContinue)
            playing.store (true);
    }

    /** Scans a block's MIDI for clock and transport bytes. Cheap, and only when slaved. */
    void consumeExternalClock (const juce::MidiBuffer& midi, double sampleRate) noexcept
    {
        if (! externalClock.load())
            return;

        for (const auto metadata : midi)
        {
            const auto message = metadata.getMessage();
            if (message.isMidiClock())
                handleExternalClockTick (metadata.samplePosition, sampleRate);
            else if (message.isMidiStart() || message.isMidiContinue() || message.isMidiStop())
                handleExternalTransport (message.isMidiStart(), message.isMidiContinue(),
                                         message.isMidiStop());
        }
    }

    // -- launch quantization ---------------------------------------------------------------

    /** The length of one quantization unit in quarter notes; 0 for `immediate`. */
    double quantizeLengthPpq (Quantize q) const noexcept
    {
        const auto beat = 4.0 / (double) tsDenominator.load();
        switch (q)
        {
            case Quantize::immediate: return 0.0;
            case Quantize::sixteenth: return beat * 0.25;
            case Quantize::eighth:    return beat * 0.5;
            case Quantize::beat:      return beat;
            case Quantize::halfBar:   return barLengthPpq() * 0.5;
            case Quantize::bar:       return barLengthPpq();
            case Quantize::twoBars:   return barLengthPpq() * 2.0;
            case Quantize::fourBars:  return barLengthPpq() * 4.0;
        }
        return barLengthPpq();
    }

    /** The first boundary at or after `fromPpq`. `immediate` returns fromPpq itself, so a
        caller can treat every launch the same way and let the quantization decide. */
    double nextBoundary (double fromPpq, Quantize q) const noexcept
    {
        const auto unit = quantizeLengthPpq (q);
        if (unit <= 0.0)
            return fromPpq;

        const auto index = std::ceil (fromPpq / unit - 1.0e-9);
        return index * unit;
    }

    static constexpr double clockTimeoutMs = 500.0;

private:
    std::atomic<double> tempoBpm { 120.0 };
    std::atomic<int> tsNumerator { 4 };
    std::atomic<int> tsDenominator { 4 };
    std::atomic<double> positionPpq { 0.0 };
    std::atomic<double> requestedPosition { 0.0 };
    std::atomic<bool> playing { false };
    std::atomic<bool> startRequested { false };
    std::atomic<bool> stopRequested { false };
    std::atomic<bool> continueRequested { false };
    std::atomic<bool> positionRequested { false };
    std::atomic<bool> jumped { false };
    std::atomic<bool> externalClock { false };
    std::atomic<bool> hostSync { false };
    std::atomic<bool> haveHostPosition { false };
    std::atomic<bool> hostPlaying { false };
    std::atomic<bool> hostJumped { false };
    std::atomic<bool> haveClock { false };
    std::atomic<bool> externalClockLost { false };
    std::atomic<juce::int64> clockSampleCounter { 0 };
};

} // namespace ceditor::perf
