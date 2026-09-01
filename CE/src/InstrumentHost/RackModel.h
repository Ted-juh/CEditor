#pragma once

#include <juce_core/juce_core.h>
#include "PartMidiRules.h"
#include "SessionRecovery.h"
#include "Performance/PatternModel.h"

// RackModel — the persistent Performance → InstrumentRack → Part hierarchy (VIP-successor
// Stage 1).
//
// This is the document side of the rack: the one persistent root object the baseline requires
// from the beginning, so that Stage 4 can index the same records as Multis and Stage 5 can
// extend the same manifest with effects and routes instead of introducing a second structure.
// The live side — graph nodes, processors, atomics — is InstrumentRackHost, which owns one of
// these as its authoritative document and keeps it current.
//
// Identity rules (the baseline's, and they are load-bearing):
//   partId is minted once and never changes; reordering the rack reorders the array, not the
//   identities. pluginCeId is the catalogue's stable class identity (PluginCatalog.h); an
//   empty one means an empty or unresolved part — a Performance whose plug-in is missing keeps
//   the part and its state blob rather than deleting either.
//
// juce_core only, JSON through juce::var, same conventions as PluginCatalog: this embeds
// unchanged into a Host Project document, a session file, or (later) the outer VST3's DAW
// state.

namespace ceditor::host
{

// One VST3 effect in an insert chain (VIP-successor Stage 5). The same identity rules as a
// part's instrument: effectId is minted once and stable, pluginCeId is the catalogue's class
// identity, and an empty pluginCeId means an empty or unresolved slot whose state blob is
// kept for repair, never deleted.
struct EffectSlot
{
    juce::String effectId;
    juce::String pluginCeId;
    juce::String pluginModulePath;
    juce::String pluginName;
    juce::String pluginVendor;
    juce::String stateBlobBase64;
    /** A digest of the blob as it was captured (§17.3 "plug-in state hashes"). Written on
        save, checked on load: a blob that no longer matches is reported rather than handed to
        a plug-in as if it were sound. Empty for a state written before hashes existed, which
        reads as "unchecked", never as "damaged". */
    juce::String stateBlobHash;
    bool bypassed = false;
};

// A shared return chain (Stage 5): every part can tap its post-fader signal into it by send
// level, the chain's effects process the sum, and the chain's own level rejoins the master
// path. Effects here follow the insert rules exactly — same identities, same transaction.
// A group bus (Stage 8, phase 2): several parts join here and the combined signal keeps
// going through the bus's own inserts. Returns already existed and are a different animal —
// a part SENDS a copy to a return and still reaches the master itself, while a part ROUTED
// to a bus goes there and nowhere else, which is what "these two instruments become one
// thing I then process" means.
//
// A bus feeds the master by default, or another bus: sub-buses of sub-buses are how a real
// desk is laid out. Cycles are refused where they are made, not discovered while the audio
// thread is walking the graph.
struct BusChain
{
    juce::String busId;
    juce::String name;
    juce::Array<EffectSlot> effects;
    float level = 1.0f;               // linear, 0..2, like part volume
    juce::String destinationBusId;    // empty = the master chain
};

struct ReturnChain
{
    juce::String returnId;
    juce::String name;
    juce::Array<EffectSlot> effects;
    float level = 1.0f;               // linear, 0..2, like part volume
};

// One part's send into one return chain. Absent = level 0; the pair (part, return) is the
// identity, so removing a return simply strands (and drops) its sends.
struct PartSend
{
    juce::String returnId;
    float level = 0.0f;               // linear, 0..2
};

// Explicit multi-output routing (Stage 5): one extra stereo pair of a multi-output instrument
// gets its own mixer gain into the master path. Pair k is instrument channels 2k/2k+1; pair 0
// is the main pair and always takes the part's insert chain and fader, so it is never listed
// here.
struct ExtraOut
{
    int pairIndex = 1;
    float gain = 1.0f;                // linear, 0..2
};

struct RackPart
{
    juce::String partId;
    /** Which stereo output pair this part leaves through (Stage 7, §18.9.3). 0 is the main
        pair, which is the only one that runs the master chain — every multi-output instrument
        works this way, and a DAW project that routes a part to its own channel expects it to
        arrive unprocessed by the master bus. */
    int outputPair = 0;
    juce::String pluginCeId;          // empty = empty/unresolved part
    juce::String pluginModulePath;
    juce::String pluginName;          // display cache; never identity
    juce::String pluginVendor;
    juce::String stateBlobBase64;     // captured processor state, or empty
    juce::String stateBlobHash;       // digest of the above, checked on load (§17.3)
    juce::Array<EffectSlot> effects;  // the part's serial insert chain, pre-fader (Stage 5)
    juce::Array<PartSend> sends;      // post-fader taps into return chains (Stage 5)
    juce::Array<ExtraOut> extraOuts;  // explicit multi-output pairs (Stage 5)
    PartMidiRules midi;
    // The Stage 6 event chain for this part: the MIDI FX that shape what arrives and the
    // arpeggiator that may replay it. Both are modes over the shared transport, so they live
    // beside the zone rules rather than in a document of their own.
    // LEGACY, kept for migration only: a session written before the chain existed carries
    // its event chain in these two blocks, and they are mirrored on save so an older build
    // can still open the file. The runtime reads `midiChain` and nothing else.
    perf::MidiFxSettings midiFx;
    perf::ArpSettings arp;
    // The part's MIDI inserts, in order: what used to be a fixed chain is now a list you
    // compose (see perf::MidiSlot). A part loaded from a pre-chain session gets the two
    // slots its old settings describe, so it opens sounding identical.
    juce::Array<perf::MidiSlot> midiChain;
    bool enabled = true;
    bool mute = false;
    bool solo = false;
    float volume = 1.0f;              // linear gain, 0..2
    float pan = 0.0f;                 // -1..+1
    bool editorOpen = false;
    // The part's place in the preset walk: the library record last applied to it, plus the
    // name as a display cache (never identity — the record can be renamed or gone, and the
    // cache still truthfully names the sound that was loaded). Empty until a preset loads.
    juce::String lastPresetRecordId;
    juce::String lastPresetName;

    // Hardware-instrument parts (Stage 5, baseline §18.7.6): the part is an external synth
    // reached over MIDI, optionally returning audio through the interface's inputs. It reuses
    // the whole Stage 1 story — zones, mute/solo/fader, focus, ordering — and its returned
    // audio runs the same insert chain and gain as a plug-in's would. The MIDI output is
    // identified by the system's device id; the name is a display cache for the "port is
    // gone" diagnostic, never identity.
    // Where this part's audio goes: empty is the master path, exactly as it always was, so
    // a session written before buses existed keeps its routing by saying nothing.
    juce::String destinationBusId;

    bool hardware = false;
    juce::String midiOutputId;
    juce::String midiOutputName;
    int midiOutChannel = 1;           // 1..16 — the channel the external synth listens on
    int audioReturnChannel = -1;      // first input channel of the managed return; -1 = none
    bool audioReturnStereo = true;
    int programBank = -1;             // -1 = never send bank select
    int programNumber = -1;           // -1 = never send program change
    juce::String deviceProfileId;     // reference into CEditor's Device Profiles, when linked

    // -- total recall for a hardware part -------------------------------------------------
    //
    // A hardware part remembered its port, its channel, its audio return and its program
    // number, and forgot the one thing that makes it that sound: the patch. Open the rig six
    // months later and the synth is on whatever somebody left it on, which from the player's
    // chair is indistinguishable from the session not having been saved.
    //
    // So the patch travels with the part, as the BYTES the synth itself sent. CEditor does not
    // parse them and does not need to: a dump is a dump, and refusing to understand it is what
    // makes this work for every synth ever made rather than for a supported list. That is the
    // same bet the generic controller drawing makes, and it is the bet worth making twice.
    juce::String hardwarePatchBase64;   // exactly what came back, untouched
    juce::String hardwarePatchName;     // what the player called it; display only
    /** "ask" | "always" | "never" — what to do about sending it when the session opens.
        Never silent-by-default: a program that blasts SysEx at whatever is plugged in
        whenever a project opens is a bad citizen, and the device may be a different synth
        today or the same synth mid-take. */
    juce::String hardwareRestore { "ask" };
};


// A binding connects one named control slot to one parameter address (VIP-successor Stage 2,
// baseline §18.4.3). The address keeps the class identity BESIDE the part id on purpose:
// partId says which slot in the rack, pluginCeId says which plug-in the author assigned
// against — so when a part later loads something else, the binding shows as unresolved
// instead of silently driving whatever now answers to the same parameter id. Transformations
// are only the ones CEditor already needs; conditional logic and fan-out arrive with the
// stages that require them.
struct ControlBinding
{
    juce::String partId;
    juce::String pluginCeId;
    juce::String parameterId;     // the plug-in's own stable parameter id — never a display name
    juce::String label;           // display override; empty = the parameter's own name
    float rangeMin = 0.0f;
    float rangeMax = 1.0f;
    bool inverted = false;
    bool bipolar = false;
    /** A press flips the parameter between the two ends of the range instead of following
        the control's position. What a pad wants for "filter open" or "reverb on": momentary
        by default (down is the top of the range, up is the bottom), latching with this. */
    bool toggle = false;

    bool isEmpty() const          { return parameterId.isEmpty(); }
};

struct ControlSlot
{
    juce::String slotId;          // stable within its page ("s1".."s8")
    ControlBinding binding;       // empty binding = unassigned slot

    // Which physical control on the surface this slot rides, in the surface layout's own
    // terms (SurfaceControl::kind and ::index). A page began as eight encoder slots and the
    // join was their position — encoder N is slot N — and that is still what an old manifest
    // reads back as: a slot with no kind is an encoder, and its index is its place among the
    // encoders. Faders and pads get slots of their own, minted the first time something is
    // dropped on one, which is why a page is no longer exactly eight of anything.
    juce::String kind { "encoder" };   // "encoder" | "fader" | "pad"
    int index = -1;

    // MIDI learn: a controller number bound to this slot drives it from any enabled MIDI
    // input, absolute 0..127 onto the slot's mapped range. Learn always stores the concrete
    // channel it heard (1..16) so two keyboards on different channels stay two controllers;
    // 0 means any channel and exists for hand-edited manifests. -1 = unbound. Older
    // manifests simply lack the fields and read back unbound — no schema bump needed.
    int midiCc = -1;
    int midiChannel = 0;
    // Or a note: most pads send one, and a key on the keyboard is a pad if you say so. One
    // controller per slot — binding a note clears the controller and the other way round.
    int midiNote = -1;
    // The toggle's own memory, kept with the slot so a latched pad is still latched when the
    // session comes back rather than silently reset under a lit LED.
    bool latched = false;
};

// The neutral page: named control slots over parameter addresses, no hardware bytes anywhere.
// Stage 3 compiles pages for actual surfaces; until then the Web UI drives the same slots.
struct ControlPage
{
    juce::String pageId;
    juce::String name;
    juce::Array<ControlSlot> slots;
    // Generated pages (Stage 3's automatic first pass) are marked so regeneration can
    // replace them without ever touching a user-authored page — and marked with WHOSE
    // registry produced them, so regenerating one part leaves another part's pages alone.
    bool generated = false;
    juce::String generatedForPartId;

    /** Mints a page with a fresh stable id and `numSlots` empty encoder slots ("s1".."sN",
        indexed 0..N-1). */
    static ControlPage create (const juce::String& name, int numSlots = 8);

    ControlSlot* findSlot (const juce::String& slotId);
    const ControlSlot* findSlot (const juce::String& slotId) const;

    /** The slot riding one physical control, or null when nothing has been put there yet. */
    ControlSlot* findSurfaceSlot (const juce::String& kind, int index);
    const ControlSlot* findSurfaceSlot (const juce::String& kind, int index) const;

    /** Encoders, faders and pads of a big desk, with room to spare; a bound on hand-edited
        manifests rather than a number anybody should reach. */
    static constexpr int maxSlots = 256;
};

// A Performance macro (Stage 5, baseline §18.7.8): one 0..1 control fanning into several
// parameter addresses. Targets reuse ControlBinding — the address, range, inversion and the
// class-identity honesty are exactly the page-slot story, and a macro must never bypass the
// central parameter path any more than a hardware knob may. (A target's partId field holds
// any target id: a rack part's or an effect slot's.)
struct Macro
{
    juce::String macroId;
    juce::String name;
    float value = 0.0f;
    juce::Array<ControlBinding> targets;
};

/** Where the user dragged one box on the rack canvas.

    A side table on the Performance rather than an x/y on RackPart, BusChain and ReturnChain,
    because a canvas node is not a model object: the master has a box and no struct, and every
    one of those three would otherwise carry two fields that the engine, the exporter and the
    parameter model all have to ignore. One list, one node-id vocabulary — the same ids the
    canvas already uses for routing drops ("@master" included).

    Positions are a preference, never a requirement. A node with no entry is auto-laid-out, so
    a session written before this existed opens exactly as it did, and clearing the list is a
    complete undo. Entries for nodes that no longer exist are dropped on save. */
struct CanvasNodePosition
{
    juce::String nodeId;              // partId, busId, returnId, or "@master"
    int x = 0;
    int y = 0;
};

struct Performance
{
    /** The manifest's own version (Stage 6, §18.8.12). 1 is everything up to Stage 5, which
        had no version field at all — an absent version therefore reads as 1 and migrates by
        simply gaining the Stage 6 defaults. Written as the current version on every save. */
    static constexpr int currentSchemaVersion = 2;

    juce::String performanceId;
    juce::String name;
    juce::String focusedPartId;
    int schemaVersion = currentSchemaVersion;
    juce::Array<RackPart> parts;
    juce::Array<EffectSlot> masterEffects;   // the master insert chain (Stage 5)
    juce::Array<ReturnChain> returns;        // shared send/return chains (Stage 5)
    juce::Array<BusChain> buses;             // group buses parts route INTO (Stage 8)
    juce::Array<Macro> macros;
    juce::Array<ControlPage> pages;
    /** Hand-placed canvas boxes; anything absent is laid out automatically (Stage 5 of the
        rack-canvas plan). Purely a drawing concern — nothing downstream reads it. */
    juce::Array<CanvasNodePosition> canvasPositions;

    // -- the Stage 6 performance system -------------------------------------------------
    /** Master level, 0..2 linear (Stage 7): the one Performance-wide control the generated
        product exposes to DAW automation beside its macros, and the fader the standalone
        always lacked. */
    float masterLevel = 1.0f;
    /** How many stereo output pairs the product offers. 1 is the plain stereo instrument;
        more declares aux buses on the outer VST3 (§18.9.3, "multi-output where justified"). */
    int outputPairs = 1;

    perf::TransportSettings transport;
    juce::Array<perf::Pattern> patterns;
    juce::Array<perf::Clip> clips;
    juce::Array<perf::Scene> scenes;
    perf::Setlist setlist;

    perf::Pattern* findPattern (const juce::String& patternId);
    const perf::Pattern* findPattern (const juce::String& patternId) const;
    perf::Clip* findClip (const juce::String& clipId);
    const perf::Clip* findClip (const juce::String& clipId) const;
    perf::Scene* findScene (const juce::String& sceneId);
    const perf::Scene* findScene (const juce::String& sceneId) const;
    int indexOfClip (const juce::String& clipId) const;

    /** Mints a Performance with a fresh stable id. */
    static Performance create();

    /** Appends an empty part with a fresh stable id and returns that id. The first part added
        becomes focused. */
    juce::String addPart();

    bool removePart (const juce::String& partId);

    /** Reorders presentation only — identities never move with the index. */
    bool movePart (const juce::String& partId, int newIndex);

    RackPart* findPart (const juce::String& partId);
    const RackPart* findPart (const juce::String& partId) const;
    int indexOfPart (const juce::String& partId) const;

    ControlPage* findPage (const juce::String& pageId);
    const ControlPage* findPage (const juce::String& pageId) const;

    Macro* findMacro (const juce::String& macroId);
    const Macro* findMacro (const juce::String& macroId) const;

    ReturnChain* findReturn (const juce::String& returnId);
    const ReturnChain* findReturn (const juce::String& returnId) const;
    BusChain* findBus (const juce::String& busId);
    const BusChain* findBus (const juce::String& busId) const;
    /** True when routing `busId` into `destinationId` would close a loop — including the
        bus into itself. Checked where the routing is made; the audio graph never discovers
        a cycle by walking into one. */
    bool busRoutingWouldLoop (const juce::String& busId, const juce::String& destinationId) const;

    /** The slot and (via chainIdOut) whose chain holds it — a partId, "master", or a
        returnId. */
    EffectSlot* findEffect (const juce::String& effectId, juce::String* chainIdOut = nullptr);
    const EffectSlot* findEffect (const juce::String& effectId, juce::String* chainIdOut = nullptr) const;

    juce::var toVar() const;

    /** Parses and validates. Structural damage (not an object, duplicate or empty part ids)
        returns false and leaves `out` empty; out-of-range numbers are clamped, an inverted
        key or velocity range is swapped, and a focusedPartId naming no part is cleared —
        a readable document should load, not fail on a nit. */
    static bool fromVar (const juce::var& stored, Performance& out);
};

} // namespace ceditor::host
