#pragma once

#include <juce_core/juce_core.h>
#include "Transport.h"

// PatternModel — the editable half of the Stage 6 event engine (baseline §18.8.4, §18.8.6).
//
// Everything a person edits lives here: patterns, their lanes and steps, the clips that
// launch them, the scenes that recall whole rig states, and the setlist that walks them. It
// is juce_core plus a Quantize enum, serializes through juce::var like the rest of the
// Performance manifest, and is NEVER touched by the audio thread — PatternCompiler turns it
// into the flat, preallocated form the scheduler reads (CompiledPattern.h). That split is the
// baseline's rule about not parsing JSON or allocating during playback, made structural
// rather than remembered.
//
// ONE PATTERN OBJECT, MANY LANE TYPES (§18.8.6). A drum lane is not a different engine from a
// melody lane or an automation lane; it is a lane whose type says how its steps are read.
// Lanes carry their own step count and rate, which is polymeter for free: a 7-step lane and a
// 16-step lane in one pattern simply come back into phase when they do.
//
// IDENTITY, as everywhere else in this codebase: ids are minted once and never reused, a
// target is remembered as (targetId, parameterId) with the class captured beside it, and a
// target that no longer resolves is SHOWN unresolved rather than silently retargeted.

namespace ceditor::perf
{

enum class LaneType
{
    note = 0,     // one note per step, monophonic per lane
    chord,        // a stack of notes per step
    drum,         // one fixed note per lane, steps are hits (velocity/probability vary)
    cc,           // continuous controller values
    parameter,    // a Stage 2 parameter address or a Stage 5 macro
};

const char* laneTypeName (LaneType type) noexcept;
LaneType laneTypeFromName (const juce::String& name) noexcept;

/** One step of one lane. The fields are the full Section 14 vocabulary — the architecture
    carries all of it once, and the product tier decides which editors expose which (§18.8.6). */
struct PatternStep
{
    bool active = false;
    int note = 60;                  // note/chord/drum lanes: the pitch (drum lanes use the lane's)
    juce::Array<int> chordNotes;    // chord lane: absolute note numbers, played together
    int velocity = 100;             // 1..127
    float value = 0.0f;             // cc/parameter lanes: normalized 0..1
    float gate = 0.5f;              // note length as a fraction of the step (0.05..4.0 with ties)
    float microtiming = 0.0f;       // -0.5..+0.5 of a step, the humanizing nudge
    int probability = 100;          // 0..100, rolled against a deterministic seed
    int ratchets = 1;               // 1..8 retriggers inside the step
    bool tie = false;               // hold the previous step through this one instead of retriggering
    int conditionEvery = 1;         // play only on every Nth loop (1 = always)
    int conditionOffset = 0;        // which loop of the N (0-based)

    bool isEmpty() const noexcept   { return ! active; }
};

struct Lane
{
    juce::String laneId;
    LaneType type = LaneType::note;
    juce::String name;
    juce::String targetPartId;      // which rack part hears it (note/chord/drum/cc lanes)
    juce::String targetId;          // parameter lanes: part, effect or macro id
    juce::String parameterId;       // parameter lanes: the address ("cutoff", "@gain", "@macro")
    juce::String targetCeId;        // the class captured at assignment — identity honesty
    int channel = 1;                // 1..16, the channel the events carry
    int ccNumber = 74;              // cc lanes
    int drumNote = 36;              // drum lanes: the one note every hit uses
    int stepCount = 16;             // lane length in steps — polymeter lives here
    int stepsPerBeat = 4;           // rate: 4 = sixteenths, 6 = sextuplets, 2 = eighths
    bool muted = false;
    bool glide = false;             // cc/parameter lanes: interpolate between steps
    juce::String lockSourceLaneId;  // non-empty: hidden lane carrying per-step parameter locks
    juce::Array<PatternStep> steps;

    // Euclidean generation is a fill button, not a mode: it writes real steps the user can
    // then edit, so nothing downstream has to know a lane was generated.
    int euclidPulses = 0;
    int euclidRotation = 0;

    /** Grows/shrinks `steps` to stepCount, keeping what is there. */
    void resizeSteps();
    PatternStep* findStep (int index);
    const PatternStep* findStep (int index) const;
    /** Lane loop length in quarter notes. */
    double lengthPpq() const noexcept;
};

/** A reusable groove cycle. Timing values are fractions of the template's own step and
    velocity values are multipliers, so the same feel can be mapped onto lanes at different
    rates without assuming every pattern is a sixteenth-note drum grid. */
struct GrooveTemplate
{
    juce::String grooveId;
    juce::String name;
    juce::String source { "imported" }; // factory | imported
    int stepsPerBeat = 4;
    juce::Array<float> timingOffsets;    // -0.5..+0.5 template steps
    juce::Array<float> velocityMultipliers; // 0.25..2.0; empty keeps dynamics

    static juce::Array<GrooveTemplate> factoryTemplates();
};

struct Pattern
{
    juce::String patternId;
    juce::String name;
    juce::Array<Lane> lanes;
    float swing = 0.0f;             // 0..0.75: how late every second step lands
    juce::uint32 seed = 1;          // deterministic randomness (§18.8.13)

    // Pattern Variations. A is the authored source; B/C/D are generated, editable patterns
    // with their own stable ids. The group/source fields make regeneration explicit and let
    // the service replace generated contents without invalidating clips which reference them.
    juce::String variationGroupId;
    juce::String variationLabel;    // empty for an ordinary pattern, otherwise A | B | C | D
    juce::String variationSourcePatternId;
    float variationAmount = 0.55f;  // 0..1, the intensity used for the last generation

    // The last groove committed to the editable steps. Informational only: playback reads
    // the real microtiming/velocity fields, so later hand edits remain authoritative.
    juce::String appliedGrooveId;
    float appliedGrooveAmount = 0.0f;

    static Pattern create (const juce::String& name);
    Lane* findLane (const juce::String& laneId);
    const Lane* findLane (const juce::String& laneId) const;
    /** The pattern's own loop: the longest lane. Shorter lanes repeat inside it. */
    double lengthPpq() const noexcept;
};

/** Creates one deterministic, musically related B/C/D pattern. It remints lane ids and
    rewrites parameter-lock links so the result is a self-contained editable pattern. */
Pattern makePatternVariation (const Pattern& source, char label, float amount = 0.55f);

/** Commits a reusable groove into the pattern's real step data. Timing is replaced; optional
    velocity accents are blended into active note/chord/drum steps. */
void applyGrooveTemplate (Pattern& pattern, const GrooveTemplate& groove,
                          float amount = 1.0f, bool applyVelocity = true);

/** A clip is a launchable reference to a pattern (§18.8.8): what plays, when it may start,
    whether it loops, and what follows it. */
struct Clip
{
    juce::String clipId;
    juce::String name;
    juce::String patternId;
    Quantize launchQuantize = Quantize::bar;
    bool loop = true;
    juce::String followClipId;      // what to launch when this one has run its course
    int followAfterLoops = 0;       // 0 = never follow
    juce::String followAction { "none" }; // none | clip | next | random | stop
    bool looperLayer = false;       // created as one independently looping performance layer
    int overdubPasses = 0;          // completed additions after the first recorded pass
    bool gestureClip = false;       // created by the gesture recorder as an automation performance
    int gesturePasses = 0;          // completed gesture takes written into this clip

    // MIDI Freeze/Bounce. The stored steps are the already-rendered output of the source
    // clip's per-part MIDI chain, so replay joins after that chain instead of applying its
    // chorder, arpeggiator or echo a second time.
    bool frozenMidi = false;
    juce::String frozenFromClipId;
    int frozenCycles = 1;
    int frozenNoteCount = 0;

    // Held Fill System. The clip keeps playing and keeps its phase; the engine temporarily
    // renders this related pattern until the button/pedal is released.
    juce::String fillPatternId;
    Quantize fillQuantize = Quantize::beat;
    int fillCc = -1;                // -1 = no pedal/controller assigned
    int fillChannel = 0;            // 0 = any channel, otherwise 1..16
};

/** One part's state inside a scene — the same fields the mixer already owns, recalled
    through the rack rather than through a second snapshot engine (§18.8.8). */
struct SceneSlot
{
    juce::String partId;
    bool enabled = true;
    bool mute = false;
    float volume = 1.0f;
    bool applyVolume = false;       // a scene may recall mute without touching levels
    float pan = 0.0f;
    bool applyPan = false;
};

struct SceneMacroValue
{
    juce::String macroId;
    float value = 0.0f;
};

/** A parameter exposed on a control page when a scene was captured. Keeping the class
    identity beside the address makes an old snapshot refuse a replacement plug-in rather
    than moving an unrelated parameter that happens to reuse the same id. */
struct SceneParameterValue
{
    juce::String targetId;
    juce::String targetCeId;
    juce::String parameterId;
    float value = 0.0f;
};

struct Scene
{
    juce::String sceneId;
    juce::String name;
    juce::StringArray clipIds;      // launched together, on the scene's quantization
    juce::Array<SceneSlot> slots;
    juce::Array<SceneMacroValue> macros;
    juce::Array<SceneParameterValue> parameters; // resolved control-page destinations
    juce::String focusPartId;       // hardware/editor focus travels with the scene
    juce::String pageId;            // the control page the surface should show
    Quantize launchQuantize = Quantize::bar;
    bool stopOtherClips = true;     // a scene is a state, so by default it silences what it omits
    double tempo = 0.0;             // 0 = keep the current tempo
    double morphBeats = 0.0;        // 0 = cut; continuous values may morph for up to 32 beats
};

struct SetlistItem
{
    juce::String itemId;
    juce::String name;               // song / performance name shown on stage
    juce::String sceneId;            // the scene this item recalls
    juce::String rackRecordId;       // optional full-rack Library capture for another song
    juce::String pageId;             // CTRL49 control page recalled with the song
    juce::String notes;              // what the player needs to read on stage
    double tempo = 0.0;              // 0 = the scene's or the current tempo
};

struct Setlist
{
    juce::Array<SetlistItem> items;
    int currentIndex = -1;          // -1 = nothing recalled yet
    int preloadAhead = 1;            // 0=off, 1=next song, 2=next two songs
};

/** One block in the deliberately small song arranger. It sequences existing scenes for an
    integer number of bars; it does not duplicate clips or introduce a DAW-style timeline. */
struct ArrangementItem
{
    juce::String itemId;
    juce::String name;
    juce::String sceneId;
    int bars = 4;                   // 1..128 bars before the following scene
};

struct Arrangement
{
    juce::Array<ArrangementItem> items;
    bool loop = false;
};

/** Per-part arpeggiator settings (§18.8.5). The arp is a mode over the shared engine, not a
    second clock: rate is in steps per beat, exactly like a lane's. */
struct ArpSettings
{
    enum class Mode { up = 0, down, upDown, downUp, order, random, chord, pattern };

    bool enabled = false;
    Mode mode = Mode::up;
    int stepsPerBeat = 4;
    float gate = 0.5f;              // 0.05..1.0 of a step
    float swing = 0.0f;
    int octaves = 1;                // 1..4
    bool latch = false;             // held after release until the next fresh chord
    juce::Array<int> velocityPattern;   // accents, cycled; empty = play what was played
    // The drawn melody for Mode::pattern: per step, a GRID ROW or -1 for a rest. What a
    // row means is patternSemitones' choice. Degrees (false): the row indexes the
    // pitch-sorted held chord extended across `octaves` — 0 is the lowest held note, past
    // the pool clamps to the top; the drawing re-voices with whatever chord is held.
    // Semitones (true): the row is an offset from the GROUND note (the lowest held key),
    // row 12 = the ground itself, spanning -12..+12 — the drawing transposes chromatically
    // with one finger and can hold notes the chord does not. Ignored by the walk modes.
    juce::Array<int> degreePattern;
    bool patternSemitones = false;
    bool constrainToScale = false;

    static const char* modeName (Mode mode) noexcept;
    static Mode modeFromName (const juce::String& name) noexcept;
};

/** Per-part MIDI FX (§18.8.5): a defined chain before the instrument, in this order —
    transpose, scale constrain, chord generate, velocity. Not a scripting hook on the RT
    path; four named, bounded operations. */
struct MidiFxSettings
{
    enum class ChordType { off = 0, powerFifth, triad, triadFirstInversion, seventh,
                           octaveDouble, diatonic, diatonicSeventh, keyChords };
    enum class ChordVoicing { close = 0, open, drop2, wide };
    enum class ResponseCurve { linear = 0, soft, hard, sCurve, custom };
    static constexpr int responseCurvePoints = 9;

    /** One learned chord: pressing `key` plays key+each offset (offset 0 = the key itself).
        Captured by the learn flow — arm, tap the target key, play the chord — and only in
        effect while the chord type is keyChords; unmapped keys then pass through plain. */
    struct KeyChord
    {
        int key = 60;
        juce::Array<int> offsets;
    };

    int transpose = 0;              // semitones or scale steps, -48..48
    juce::String transposeMode = "chromatic"; // chromatic | diatonic
    bool constrainToScale = false;
    int scaleRoot = 0;              // 0..11, C..B
    juce::String scaleType = "major";
    ChordType chord = ChordType::off;
    int chordInversion = 0;         // 0 = root position, then rotate bottom voices upward
    ChordVoicing chordVoicing = ChordVoicing::close;
    bool chordVoiceLeading = false; // choose the nearest inversion/octave to the last chord
    juce::Array<KeyChord> keyChords;
    int velocityFixed = 0;          // 0 = keep played velocity, else 1..127
    float velocityScale = 1.0f;     // 0.1..2.0 applied before the fixed override

    // Velocity / Expression Designer. The input window is the measured useful range of the
    // named controller; the output window is the range this instrument responds to well.
    // Nine evenly spaced Y points make a custom response curve without putting arbitrary
    // scripts on the real-time path. Empty custom arrays read as an identity line.
    juce::String responseProfileName;  // e.g. "CTRL49 studio"; identity/documentation only
    ResponseCurve velocityCurve = ResponseCurve::linear;
    int velocityInputMin = 1;
    int velocityInputMax = 127;
    int velocityOutputMin = 1;
    int velocityOutputMax = 127;
    juce::Array<int> velocityCurveValues;

    bool expressionEnabled = false;
    juce::String expressionSource = "cc";  // cc | channel pressure | poly aftertouch
    int expressionCc = 11;
    ResponseCurve expressionCurve = ResponseCurve::linear;
    int expressionInputMin = 0;
    int expressionInputMax = 127;
    int expressionOutputMin = 0;
    int expressionOutputMax = 127;
    juce::Array<int> expressionCurveValues;

    static const char* chordTypeName (ChordType type) noexcept;
    static ChordType chordTypeFromName (const juce::String& name) noexcept;
    static const char* chordVoicingName (ChordVoicing voicing) noexcept;
    static ChordVoicing chordVoicingFromName (const juce::String& name) noexcept;
    static const char* responseCurveName (ResponseCurve curve) noexcept;
    static ResponseCurve responseCurveFromName (const juce::String& name) noexcept;
};

/** What the later MIDI note modules need, all in one block for the same reason MidiFxSettings
    is one: a slot carries one settings object per family, and a struct per module would mean
    separate fields on every slot, separate serializers, and more things to forget.

    EVERY TIME HERE IS IN BEATS, not milliseconds. The obvious alternative needs a sample rate
    this layer does not have, and would make a strum that is right at 90bpm wrong at 160 —
    while beats put every module on the same grid the arpeggiator and the pattern lanes already
    share, which is the one timing authority the baseline insists on. */
struct NoteModuleSettings
{
    enum class StrumPattern { ascending = 0, descending, alternate,
                              outsideIn, insideOut, random };

    /** One named articulation selected by an incoming trigger note. The output channel is
        zero when the message should follow the trigger channel; bank values are -1 when that
        half of bank select is intentionally omitted. */
    struct Articulation
    {
        juce::String articulationId;
        juce::String name { "Articulation" };
        int triggerNote = 24;
        int triggerChannel = 0;       // 0 = the part's input channel (or any when the part is omni)
        juce::String type { "keyswitch" }; // keyswitch | program change | cc
        int outputChannel = 0;        // 0 = same as the incoming trigger
        int keyswitchNote = 24;
        int keyswitchVelocity = 100;
        int program = 0;              // MIDI value 0..127 (shown as 1..128 in the editor)
        int bankMsb = -1;             // -1 = do not send CC 0
        int bankLsb = -1;             // -1 = do not send CC 32
        int controller = 0;
        int controllerValue = 127;
    };

    // EVERY DEFAULT HERE IS TRANSPARENT, which is a rule this file already had and these
    // modules nearly broke: an inserted module must not change the sound by existing. So a
    // fresh echo repeats nothing, a fresh strum spreads nothing, a fresh latch latches
    // nothing. They change the sound when you set them up, which is when you meant to.

    // Echo: each note repeats, quieter each time, optionally climbing. 0 repeats = off.
    int echoRepeats = 0;             // 0..8 repeats after the original
    double echoStepBeats = 0.5;      // 1/32 note .. 4 beats
    float echoFeedback = 0.7f;       // velocity multiplier per repeat, 0.1..1
    int echoTranspose = 0;           // semitones added per repeat, -12..12

    // Strum: a chord spread in pitch order. 0 = off, and off means the collection window is
    // skipped too — a strum of nothing must not cost the latency of one.
    double strumBeats = 0.0;         // total spread, 0 .. one beat
    bool strumDown = false;          // legacy session/command compatibility
    StrumPattern strumPattern = StrumPattern::ascending;
    float strumCurve = 0.0f;         // -1 slow start, 0 even, +1 quick start
    int strumVelocityRamp = 0;       // velocity change from first to last note, -64..64

    // Humanize: bounded jitter. Notes move LATER only — earlier would need the future.
    double humanizeTimingBeats = 0.0;
    int humanizeVelocity = 0;        // +/- this much, 0..64
    int humanizeGatePercent = 0;     // +/- percentage of the played duration, 0..100
    bool humanizePreserveChords = false; // simultaneous notes share one timing offset
    bool humanizeProtectBeats = false;   // whole-beat attacks remain on the grid

    // Chance: the probability a note passes at all. 1 = everything does.
    float chance = 1.0f;

    // Length: a fixed note length, or hold each note until the next arrives. 0 and no legato
    // leaves the length you played alone.
    double lengthBeats = 0.0;
    bool legato = false;

    // Latch: the only module that cannot be transparent by doing its job, so it has a switch
    // of its own and starts off.
    bool latchOn = false;

    // MPE transformer: one chosen expression stream enters, one leaves. MPE uses the
    // standard member-channel axes (bend, CC74 timbre, channel pressure); non-MPE formats
    // make the lossy poly-to-mono choice explicit through mpeCollapse.
    bool mpeEnabled = false;
    juce::String mpeInput = "mpe";              // mpe | poly aftertouch | channel pressure | cc
    juce::String mpeOutput = "poly aftertouch";
    juce::String mpeInputAxis = "pressure";     // pressure | timbre | pitch bend
    juce::String mpeOutputAxis = "pressure";
    int mpeInputCc = 74;
    int mpeOutputCc = 74;
    int mpeOutputChannel = 1;                   // base/manager channel
    int mpeMemberFirst = 2;
    int mpeMemberLast = 16;
    juce::String mpeCollapse = "latest";        // latest | highest | average

    // Articulation manager. It is represented beside the other MIDI modules in the document,
    // but runs as a control stage around the note chain: triggers are consumed before the zone
    // and generated messages bypass transpose/chord/scale processors on their way out.
    bool articulationEnabled = false;
    juce::String articulationMapName;
    juce::Array<Articulation> articulations;

    static const char* strumPatternName (StrumPattern pattern) noexcept;
    static StrumPattern strumPatternFromName (const juce::String& name) noexcept;
};

// One insert in a part's MIDI chain (the Stage 8 decoupling). The event chain used to be
// welded to the part — zone filter, then transpose, scale, chorder and velocity in that
// fixed order, then exactly one arpeggiator — so chord-before-arp was a decision the code
// had made for every rig ever built. A chain of slots hands that decision back: modules in
// any order, several of a kind, each bypassable, exactly as the audio inserts already work.
//
// A slot carries BOTH settings blocks and uses the one its type needs; the note-shaping
// types are configurations of the same proven MidiFxChain (transpose sets only transpose,
// chord only the chorder), which is why every module inherits its note-off bookkeeping
// instead of re-implementing the invariant per type.
struct MidiSlot
{
    juce::String slotId;
    /** "arp" | "transpose" | "scale" | "chord" | "velocity" | "fx" (the combined legacy
        block, which is what a pre-chain session migrates into) | "echo" | "strum" |
        "humanize" | "chance" | "length" | "latch" | "mpe" | "articulation". */
    juce::String type { "arp" };
    bool bypassed = false;
    ArpSettings arp;
    MidiFxSettings fx;
    NoteModuleSettings mod;

    /** The module kinds this build understands, in the order the UI offers them. */
    static juce::StringArray types();
    /** A slot of `type` with its settings defaulted so it is audibly transparent until
        configured — an inserted module must never change the sound by existing. */
    static MidiSlot create (const juce::String& type, const juce::String& slotId);
};

/** The two slots a pre-chain part's welded settings describe, in the order the old code
    ran them. Public because the migration is a fact worth testing directly. */
juce::Array<MidiSlot> migrateLegacyEventChain (const MidiFxSettings& fx, const ArpSettings& arp);

juce::var noteModuleToVar (const NoteModuleSettings& settings);
void noteModuleFromVar (const juce::var& stored, NoteModuleSettings& out);

juce::var midiSlotToVar (const MidiSlot& slot);
void midiSlotFromVar (const juce::var& stored, MidiSlot& out);

/** Transport defaults saved with the Performance (§18.8.12). */
struct TransportSettings
{
    double tempo = 120.0;
    int timeSignatureNumerator = 4;
    int timeSignatureDenominator = 4;
    bool externalClock = false;
    Quantize defaultQuantize = Quantize::bar;
};

// -- scales, shared by the MIDI FX chain and the arp -----------------------------------------

/** The scale names this build understands; the first is always "chromatic". */
juce::StringArray scaleNames();

/** The pitch classes of `scaleType` rooted at `root` (0..11), as a 12-bit mask. An unknown
    name is chromatic — a wrong name must not silently mute a keyboard. */
juce::uint16 scaleMask (const juce::String& scaleType, int root) noexcept;

/** Moves `note` to the nearest member of the mask (ties resolve upward); chromatic returns
    the note unchanged. */
int constrainNoteToScale (int note, juce::uint16 mask) noexcept;

/** The classic Bjorklund distribution: `pulses` hits spread as evenly as possible over
    `steps`, rotated. Returns a bool per step. */
juce::Array<bool> euclideanPattern (int steps, int pulses, int rotation);

// -- serialization ---------------------------------------------------------------------------

juce::var patternToVar (const Pattern& pattern);
bool patternFromVar (const juce::var& stored, Pattern& out);

juce::var grooveTemplateToVar (const GrooveTemplate& groove);
bool grooveTemplateFromVar (const juce::var& stored, GrooveTemplate& out);

juce::var clipToVar (const Clip& clip);
bool clipFromVar (const juce::var& stored, Clip& out);

juce::var sceneToVar (const Scene& scene);
bool sceneFromVar (const juce::var& stored, Scene& out);

juce::var setlistToVar (const Setlist& setlist);
bool setlistFromVar (const juce::var& stored, Setlist& out);

juce::var arrangementToVar (const Arrangement& arrangement);
bool arrangementFromVar (const juce::var& stored, Arrangement& out);

juce::var arpToVar (const ArpSettings& arp);
void arpFromVar (const juce::var& stored, ArpSettings& out);

juce::var midiFxToVar (const MidiFxSettings& fx);
void midiFxFromVar (const juce::var& stored, MidiFxSettings& out);

juce::var transportSettingsToVar (const TransportSettings& settings);
void transportSettingsFromVar (const juce::var& stored, TransportSettings& out);

} // namespace ceditor::perf
