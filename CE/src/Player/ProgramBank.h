#pragma once

#include <juce_core/juce_core.h>

// ProgramBank.h — the exported plugin's program list, read off the baked panel.
//
// THE GAP, from docs/design/total-recall-plan.md §3: the plugin reported one program and named it
// nothing, so a DAW's program menu was empty and there was no host-automatable way to change patch.
// Meanwhile `stores/presetLibrarian.js` has had persisted banks, captured patch data, ROM-write
// blocking and recall for a long time — in the editor's web layer, where the plugin never sees it.
//
// So this is a bridge between two things that already work, not new machinery. The editor bakes the
// chosen bank into the panel document at export; the plugin reads it here.
//
// WHY IT IS BAKED rather than read live. The librarian lives in browser storage, and the exporter
// runs in Node with no access to it — but the deeper reason is that a plugin should not scan an
// instrument's memory on every project load. The honest limit follows and is worth stating in the
// UI: this is a PANEL-AUTHORED bank, a list somebody curated, not a live view of what is in the
// synth right now.
//
// PURE, and separate from PluginProcessor.h for the same reason RestorePolicy.h is: that file needs
// WebView2 and does not build off Windows, so anything with rules in it that lives there is
// untested until a Windows plugin build. Everything here is a pure function of the document.

namespace ce
{

struct ProgramSlot
{
    int slot = 0;              ///< The device slot number this program addresses.
    juce::String name;         ///< What the host shows in its program menu.
    juce::String hex;          ///< Captured patch data, when the librarian has it. May be empty.

    /** With data, recall means "send this patch". Without it, "tell the synth to load that slot". */
    bool hasData() const { return hex.isNotEmpty(); }
};

struct ProgramBank
{
    juce::String label;
    juce::Array<ProgramSlot> programs;

    bool isEmpty() const { return programs.isEmpty(); }
    int size() const { return programs.size(); }
};

/**
 * Read the baked bank out of a panel document.
 *
 * A malformed or absent `programBank` yields an empty bank rather than an error: a panel exported
 * before this existed, or one whose author chose no bank, is the ordinary case and must simply
 * behave as it did before.
 *
 * Entries with no usable slot are dropped, and an entry with no name is given one — a DAW program
 * menu with blank rows in it is worse than one with "Slot 12" in them, because a blank row looks
 * like the plugin is broken rather than like the patch is unnamed.
 */
inline ProgramBank parseProgramBank (const juce::var& panelDocument)
{
    ProgramBank bank;

    const auto declared = panelDocument.getProperty ("programBank", juce::var());
    auto* object = declared.getDynamicObject();
    if (object == nullptr)
        return bank;

    bank.label = object->getProperty ("label").toString();

    auto* entries = object->getProperty ("programs").getArray();
    if (entries == nullptr)
        return bank;

    for (const auto& entry : *entries)
    {
        auto* record = entry.getDynamicObject();
        if (record == nullptr) continue;

        const auto slotValue = record->getProperty ("slot");
        if (! slotValue.isInt() && ! slotValue.isDouble() && ! slotValue.isString()) continue;
        const int slot = (int) slotValue;
        if (slot < 0) continue;

        ProgramSlot program;
        program.slot = slot;
        program.name = record->getProperty ("name").toString().trim();
        if (program.name.isEmpty()) program.name = "Slot " + juce::String (slot);
        program.hex = record->getProperty ("hex").toString().trim();
        bank.programs.add (program);
    }

    return bank;
}

/**
 * How many programs to report to the host.
 *
 * NEVER zero. JUCE and every host assume at least one program exists, and a plugin reporting none
 * is a plugin some hosts refuse to instantiate. A panel with no bank reports the single unnamed
 * program it always did.
 */
inline int hostProgramCount (const ProgramBank& bank)
{
    return juce::jmax (1, bank.size());
}

/**
 * The name for a host program index.
 *
 * Out-of-range is answered rather than asserted: hosts do ask for index 0 of a plugin with no bank,
 * and some ask beyond the count they were given while rebuilding their menus.
 */
inline juce::String hostProgramName (const ProgramBank& bank, int index)
{
    if (bank.isEmpty())
        return index == 0 ? juce::String ("Default") : juce::String();
    return juce::isPositiveAndBelow (index, bank.size()) ? bank.programs[index].name : juce::String();
}

/** The bank entry a host program index selects, or nullptr when there is none. */
inline const ProgramSlot* programForIndex (const ProgramBank& bank, int index)
{
    return juce::isPositiveAndBelow (index, bank.size()) ? &bank.programs.getReference (index) : nullptr;
}

/** Hex text -> bytes. Tolerates the separators the librarian and the profiles both produce. */
inline juce::Array<int> bytesFromHex (const juce::String& hex)
{
    juce::Array<int> bytes;
    for (const auto& token : juce::StringArray::fromTokens (hex.replace ("\n", " ").replace (",", " "), " ", ""))
        if (token.isNotEmpty())
            bytes.add (token.getHexValue32() & 0xff);
    return bytes;
}

} // namespace ce
