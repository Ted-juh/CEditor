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

struct RackPart
{
    juce::String partId;
    juce::String pluginCeId;          // empty = empty/unresolved part
    juce::String pluginModulePath;
    juce::String pluginName;          // display cache; never identity
    juce::String pluginVendor;
    juce::String stateBlobBase64;     // captured processor state, or empty
    PartMidiRules midi;
    bool enabled = true;
    bool mute = false;
    bool solo = false;
    float volume = 1.0f;              // linear gain, 0..2
    float pan = 0.0f;                 // -1..+1
    bool editorOpen = false;
};

struct Performance
{
    juce::String performanceId;
    juce::String name;
    juce::String focusedPartId;
    juce::Array<RackPart> parts;

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

    juce::var toVar() const;

    /** Parses and validates. Structural damage (not an object, duplicate or empty part ids)
        returns false and leaves `out` empty; out-of-range numbers are clamped, an inverted
        key or velocity range is swapped, and a focusedPartId naming no part is cleared —
        a readable document should load, not fail on a nit. */
    static bool fromVar (const juce::var& stored, Performance& out);
};

} // namespace ceditor::host
