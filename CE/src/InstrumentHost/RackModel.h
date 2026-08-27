#pragma once

#include <juce_core/juce_core.h>
#include "PartMidiRules.h"

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
    bool bypassed = false;
};

struct RackPart
{
    juce::String partId;
    juce::String pluginCeId;          // empty = empty/unresolved part
    juce::String pluginModulePath;
    juce::String pluginName;          // display cache; never identity
    juce::String pluginVendor;
    juce::String stateBlobBase64;     // captured processor state, or empty
    juce::Array<EffectSlot> effects;  // the part's serial insert chain, pre-fader (Stage 5)
    PartMidiRules midi;
    bool enabled = true;
    bool mute = false;
    bool solo = false;
    float volume = 1.0f;              // linear gain, 0..2
    float pan = 0.0f;                 // -1..+1
    bool editorOpen = false;
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

    bool isEmpty() const          { return parameterId.isEmpty(); }
};

struct ControlSlot
{
    juce::String slotId;          // stable within its page ("s1".."s8")
    ControlBinding binding;       // empty binding = unassigned slot
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

    /** Mints a page with a fresh stable id and `numSlots` empty slots ("s1".."sN"). */
    static ControlPage create (const juce::String& name, int numSlots = 8);

    ControlSlot* findSlot (const juce::String& slotId);
    const ControlSlot* findSlot (const juce::String& slotId) const;
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

struct Performance
{
    juce::String performanceId;
    juce::String name;
    juce::String focusedPartId;
    juce::Array<RackPart> parts;
    juce::Array<EffectSlot> masterEffects;   // the master insert chain (Stage 5)
    juce::Array<Macro> macros;
    juce::Array<ControlPage> pages;

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

    /** The slot and (via chainIdOut) whose chain holds it — a partId, or "master". */
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
