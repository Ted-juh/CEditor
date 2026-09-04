#pragma once

#include <array>
#include <memory>
#include <vector>
#include <juce_audio_basics/juce_audio_basics.h>
#include "CompiledPattern.h"
#include "MidiCaptureJournal.h"
#include "Transport.h"

// PerformanceEngine — the Stage 6 scheduler (baseline §18.8.3, §18.8.4, §18.8.13).
//
// One transport, one event model, one place where musical time becomes MIDI. The arpeggiator
// (ArpEngine.h) and the per-part MIDI FX read the SAME transport; nothing in this stage runs
// a second clock.
//
// THE REAL-TIME RULES, and how each is kept structurally rather than by discipline:
//
//   No allocation, no locks, no strings on the audio thread.
//       Patterns arrive pre-compiled (CompiledPattern.h). Launch and stop requests arrive
//       through a lock-free command FIFO. Generated events leave through preallocated
//       per-part MidiBuffers and a lock-free outbound FIFO. Every array here is fixed size.
//
//   Edits never corrupt what is playing.
//       A new CompiledSong is built on the message thread and published by swapping one
//       atomic pointer. The audio thread reads that pointer once per block. The old song is
//       destroyed only after a block has demonstrably completed past the swap, so the audio
//       thread can never be inside a song that is being freed.
//
//   Stop, panic and scene changes leave no orphan notes.
//       Every note the engine emits is tracked with the clip that owns it and an absolute
//       release position. Stopping a clip, stopping the transport, jumping the playhead and
//       panicking all flush through the same path — the note-off is emitted, then forgotten.
//
// WHAT LEAVES, AND WHERE. Note and CC lanes are written into per-part staging buffers that
// the rack's part processors merge into their own MIDI stream (they run downstream of this
// node in the graph, so the staging is always written before it is read). A frozen MIDI clip
// uses a parallel post-FX staging buffer because its steps already are that chain's output.
// Parameter lanes do
// NOT write plug-in parameters from the audio thread: they push (target index, value) into
// the outbound FIFO, and the message thread applies them through the same Stage 2 path as a
// knob or a macro. That is §18.8.7's "bounded, block-aware delivery" and the reason automation
// needs no parallel parameter engine.

namespace ceditor::perf
{

class PerformanceEngine
{
public:
    static constexpr int maxParts = 64;
    static constexpr int maxClips = 256;
    static constexpr int maxSoundingNotes = 512;
    static constexpr int maxGlideLanes = 32;
    /** Musical positions accumulate block by block, so an instant that is arithmetically one
        value can differ in its last bits. Any comparison against a boundary carries this
        tolerance — small enough to be a millionth of a sample, large enough to swallow the
        drift that would otherwise let an event fall between two blocks. */
    static constexpr double timingEpsilon = 1.0e-9;

    PerformanceEngine();
    ~PerformanceEngine();

    Transport& getTransport() noexcept                    { return transport; }
    const Transport& getTransport() const noexcept        { return transport; }

    // -- message thread -------------------------------------------------------------------

    void prepare (double sampleRate, int blockSize, int numParts);

    /** Publishes a freshly compiled song. `generation` travels with every outbound event so
        the drainer can ignore anything that predates the swap. */
    void setSong (std::unique_ptr<CompiledSong> song, int generation);

    /** The song currently published, for the message thread's own lookups (target names,
        clip indices). Never dereferenced from the audio thread by the caller. */
    const CompiledSong* getSong() const noexcept          { return liveSong.load(); }
    int getGeneration() const noexcept                    { return songGeneration.load(); }

    /** Launch/stop requests. They cross to the audio thread through a lock-free FIFO and take
        effect at the clip's own quantization boundary — passing a quantize overrides it. */
    void launchClip (int clipIndex);
    void launchClip (int clipIndex, Quantize quantize);
    void stopClip (int clipIndex, Quantize quantize);
    void stopAllClips (Quantize quantize);

    /** Temporarily renders another compiled pattern at the clip's current phase. A negative
        pattern index releases the fill. Both edges cross the same quantized command queue as
        clip launch, so a held UI button or MIDI pedal never edits the song on the audio thread. */
    void setClipFill (int clipIndex, int patternIndex, Quantize quantize);

    /** A scene's clips, launched together at one boundary. `token` comes back through the
        outbound FIFO when the launch actually lands, so the message thread applies the
        non-audio half of the scene (macros, mixer, focus) at the same musical instant. */
    void launchScene (const juce::Array<int>& clipIndices, bool stopOthers, Quantize quantize,
                      int token);

    /** All notes off, everywhere, now. */
    void panic();

    struct OutEvent
    {
        enum class Type : juce::uint8
        {
            parameterValue = 0,
            sceneApplied,
            clipStarted,
            clipStopped,
            fillChanged,
            capturedNote,      // a played note, already quantized to the armed lane's grid
            modulationSource,  // a normalized live MIDI value for the modulation matrix
            envelopeGate,      // raw input note gate: index 1=on, 0=off; value is velocity
        };
        Type type = Type::parameterValue;
        int index = -1;        // parameter target index, clip index, scene token, or step index
        float value = 0.0f;
        int data1 = 0;         // captured note number, or MIDI channel
        int data2 = 0;         // captured velocity, CC number, or poly-pressure note
        int generation = 0;
    };

    enum ModulationSource : int
    {
        velocitySource = 0,
        midiCcSource,
        channelPressureSource,
        polyAftertouchSource,
        pitchBendSource,
    };

    /** Arms capture into one lane of one clip's pattern (§18.8.2): live note-ons are snapped
        to that lane's own step grid and reported through the queue, so the document is edited
        on the message thread and the audio thread only ever observes. clipIndex < 0 disarms. */
    void armCapture (int clipIndex, int laneIndex) noexcept;
    bool isCapturing() const noexcept                     { return captureClip.load() >= 0; }

    /** Message thread: pops one queued event. Returns false when the queue is empty. */
    bool popEvent (OutEvent& event);

    /** The always-listening performance history. Copying is message-thread work; recording
        into it is fixed-capacity and lock-free on the audio thread. */
    MidiCaptureJournal::Snapshot recentMidi (double seconds) const
    {
        return midiJournal.snapshot (seconds);
    }
    double midiHistorySecondsAvailable() const noexcept { return midiJournal.secondsAvailable(); }
    int midiHistoryEventCount() const noexcept          { return midiJournal.retainedEventCount(); }
    juce::int64 midiHistorySamplePosition() const noexcept
    {
        return (juce::int64) midiJournal.currentSamplePosition();
    }
    double midiHistorySampleRate() const noexcept       { return midiJournal.sampleRate(); }
    bool hasRecentMidiNotes (double seconds) const noexcept
    {
        return midiJournal.hasRecentNoteOn (seconds);
    }

    /** Message thread: schedules one recorded channel-voice message against the engine's
        monotonic sample clock. The audio thread merges it into the universal inlet, before
        zones, MIDI FX, modulation observation and the retrospective journal. */
    bool scheduleReplayMidi (const juce::MidiMessage& message, juce::int64 absoluteSample);
    void clearReplayMidi() noexcept;
    int replayMidiSlotsAvailable() const noexcept;
    bool hasReplayMidiPending() const noexcept { return replayOutstanding.load() > 0; }

    // -- status, readable from any thread --------------------------------------------------

    bool isClipActive (int clipIndex) const noexcept;
    /** 0..1 through the clip's current loop, for playhead display; 0 when inactive. */
    float clipPhase (int clipIndex) const noexcept;
    bool isClipPending (int clipIndex) const noexcept;
    bool isClipFillActive (int clipIndex) const noexcept;
    bool isClipFillPending (int clipIndex) const noexcept;

    // -- audio thread -----------------------------------------------------------------------

    /** Advances time and renders this block's events into the per-part staging buffers. */
    void processBlock (int numSamples, juce::MidiBuffer& liveInput);

    /** The events generated for one rack slot this block. Valid until the next processBlock;
        the part processors read it downstream in the same graph pass. */
    const juce::MidiBuffer& stagingFor (int partIndex) const noexcept;
    /** Already-rendered MIDI from frozen clips. Part processors merge this after their
        inserts, preventing a captured chorder/arpeggiator performance from being processed
        a second time. */
    const juce::MidiBuffer& postFxStagingFor (int partIndex) const noexcept;

    /** The musical window of the block just processed. The per-part arpeggiators read this
        rather than advancing a clock of their own — same window, same grid, one authority. */
    const Transport::BlockTime& lastBlockTime() const noexcept   { return lastBlock; }

private:
    struct Command
    {
        enum class Type : juce::uint8
        {
            launchClip = 0, stopClip, stopAll, launchScene, setFill, panic
        };
        Type type = Type::panic;
        int index = -1;
        int patternIndex = -1;
        Quantize quantize = Quantize::bar;
        bool stopOthers = false;
        int token = 0;
        // A scene's clip list rides along as a fixed bitset: no allocation, no pointer into
        // message-thread memory the audio thread would have to trust.
        std::array<juce::uint64, 4> clipMask {};
    };

    struct ClipState
    {
        bool active = false;
        bool pending = false;
        double pendingLaunchPpq = 0.0;
        double startPpq = 0.0;
        double stopAtPpq = -1.0;
        int loopsPlayed = 0;
        int sceneToken = 0;         // non-zero when this launch belongs to a scene
        int fillPatternIndex = -1;
        int pendingFillPatternIndex = -2; // -2 = no edge waiting; -1 = release waiting
        double fillAtPpq = -1.0;
        std::array<float, maxGlideLanes> lastGlide {};
    };

    struct SoundingNote
    {
        bool active = false;
        double releasePpq = 0.0;
        int partIndex = -1;
        int clipIndex = -1;
        juce::uint8 channel = 1;
        juce::uint8 note = 0;
        bool postFx = false;
    };

    void handleCommands (double positionPpq);
    void applyLaunch (int clipIndex, double atPpq, int sceneToken);
    void renderClip (int clipIndex, const CompiledSong& song, const Transport::BlockTime& block,
                     int numSamples);
    void renderPatternWindow (int clipIndex, const CompiledPattern& pattern,
                              const Transport::BlockTime& block, int numSamples,
                              double clipStart, double clipEnd, bool postFx);
    void emitNote (int partIndex, int clipIndex, juce::uint8 channel, juce::uint8 note,
                   juce::uint8 velocity, double releasePpq, int sampleOffset, bool postFx);
    void releaseDueNotes (const Transport::BlockTime& block, int numSamples);
    void flushNotes (int clipIndex, int sampleOffset);   // clipIndex < 0 = every note
    void pushEvent (OutEvent::Type type, int index, float value, int data1 = 0, int data2 = 0);
    void captureFrom (const juce::MidiBuffer& liveInput, const CompiledSong& song,
                      const Transport::BlockTime& block, int numSamples);
    void reclaimRetiredSongs();
    void injectReplayMidi (juce::MidiBuffer& input, int numSamples);

    struct ReplayMidiEvent
    {
        juce::int64 samplePosition = 0;
        juce::uint32 packedMessage = 0;
        juce::uint32 generation = 0;
    };

    Transport transport;

    std::atomic<CompiledSong*> liveSong { nullptr };
    std::unique_ptr<CompiledSong> ownedSong;                 // what liveSong points at
    struct Retired { std::unique_ptr<CompiledSong> song; juce::int64 atBlock = 0; };
    std::vector<Retired> retiredSongs;                       // message thread only
    std::atomic<int> songGeneration { 0 };
    std::atomic<juce::int64> blockCounter { 0 };

    std::array<juce::MidiBuffer, maxParts> staging;
    std::array<juce::MidiBuffer, maxParts> postFxStaging;
    juce::MidiBuffer emptyStaging;
    std::array<ClipState, maxClips> clips;
    std::array<SoundingNote, maxSoundingNotes> sounding;
    // A scene containing no clips still has a musical boundary: its mixer/macros/tempo
    // recall must not jump ahead merely because there is no clip state to carry the token.
    int pendingEmptySceneToken = 0;
    double pendingEmptySceneAtPpq = -1.0;

    // Lock-free command queue in, event queue out. Both are single-producer/single-consumer
    // in practice (message thread ↔ audio thread), which is exactly what AbstractFifo covers.
    juce::AbstractFifo commandFifo { 256 };
    std::array<Command, 256> commandSlots;
    juce::AbstractFifo eventFifo { 1024 };
    std::array<OutEvent, 1024> eventSlots;
    static constexpr int replayMidiCapacity = 8192;
    juce::AbstractFifo replayMidiFifo { replayMidiCapacity };
    std::array<ReplayMidiEvent, replayMidiCapacity> replayMidiSlots;
    ReplayMidiEvent replayMidiPending;
    bool replayMidiPendingValid = false;              // audio-thread owned
    std::atomic<juce::uint32> replayGeneration { 1 };
    std::atomic<int> replayOutstanding { 0 };

    Transport::BlockTime lastBlock;
    double currentSampleRate = 44100.0;
    int activeParts = 0;
    std::atomic<bool> panicRequested { false };
    std::atomic<int> captureClip { -1 };
    std::atomic<int> captureLane { -1 };
    MidiCaptureJournal midiJournal;
};

} // namespace ceditor::perf
