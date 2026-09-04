#include "MidiInsertRack.h"

namespace ceditor::perf
{

namespace
{
    /** The settings one module runs with: a note-shaping slot does exactly its own job, so
        a "transpose" slot cannot quietly also constrain a scale because the block it shares
        with the other types happens to carry one. "fx" is the migrated combined block and
        keeps every field, which is what makes a pre-chain session sound unchanged. */
    MidiFxSettings settingsFor (const MidiSlot& slot)
    {
        MidiFxSettings out;
        if (slot.type == "fx")
            return slot.fx;

        if (slot.type == "transpose")
        {
            out.transpose = slot.fx.transpose;
        }
        else if (slot.type == "scale")
        {
            out.constrainToScale = slot.fx.constrainToScale;
            out.scaleType = slot.fx.scaleType;
            out.scaleRoot = slot.fx.scaleRoot;
        }
        else if (slot.type == "chord")
        {
            out.chord = slot.fx.chord;
            out.keyChords = slot.fx.keyChords;
            // Diatonic chords are chosen per scale degree, so the chorder reads the scale
            // even when it is not folding anything into it.
            out.scaleType = slot.fx.scaleType;
            out.scaleRoot = slot.fx.scaleRoot;
        }
        else if (slot.type == "velocity")
        {
            out.velocityFixed = slot.fx.velocityFixed;
            out.velocityScale = slot.fx.velocityScale;
        }

        return out;
    }
} // namespace

MidiInsertRack::MidiInsertRack() = default;
MidiInsertRack::~MidiInsertRack() = default;

/** Every later module lets go, whichever one this is. Written once because there are two
    paths that must reach all of them — panic, and a slot being retyped or removed — and a
    module missed by either leaves a note sounding with nothing left to end it. */
void MidiInsertRack::releaseNoteModules (Module& module, juce::MidiBuffer& out, int position)
{
    if (module.echo != nullptr)     module.echo->allNotesOff (out, position);
    if (module.strum != nullptr)    module.strum->allNotesOff (out, position);
    if (module.humanize != nullptr) module.humanize->allNotesOff (out, position);
    if (module.chance != nullptr)   module.chance->allNotesOff (out, position);
    if (module.length != nullptr)   module.length->allNotesOff (out, position);
    if (module.latch != nullptr)    module.latch->allNotesOff (out, position);
}

std::unique_ptr<MidiInsertRack::Module> MidiInsertRack::build (const MidiSlot& slot)
{
    auto module = std::make_unique<Module>();
    module->slotId = slot.slotId;
    module->type = slot.type;

    if (slot.type == "arp")            module->arp      = std::make_unique<ArpEngine>();
    else if (slot.type == "echo")      module->echo     = std::make_unique<NoteEchoEngine>();
    else if (slot.type == "strum")     module->strum    = std::make_unique<StrumEngine>();
    else if (slot.type == "humanize")  module->humanize = std::make_unique<HumanizeEngine>();
    else if (slot.type == "chance")    module->chance   = std::make_unique<ChanceEngine>();
    else if (slot.type == "length")    module->length   = std::make_unique<NoteLengthEngine>();
    else if (slot.type == "latch")     module->latch    = std::make_unique<LatchEngine>();
    else                               module->fx       = std::make_unique<MidiFxChain>();

    configure (*module, slot);
    return module;
}

void MidiInsertRack::configure (Module& module, const MidiSlot& slot)
{
    module.bypassed = slot.bypassed;

    if (module.arp != nullptr)
    {
        module.arp->setSettings (slot.arp);
        module.arp->setScaleMask (scaleMask (slot.fx.scaleType, slot.fx.scaleRoot));
        module.arp->setConstrainToScale (slot.arp.constrainToScale);
    }
    else if (module.fx != nullptr)
    {
        module.fx->setSettings (settingsFor (slot));
    }
    else
    {
        if (module.echo != nullptr)     module.echo->setSettings (slot.mod);
        if (module.strum != nullptr)    module.strum->setSettings (slot.mod);
        if (module.humanize != nullptr) module.humanize->setSettings (slot.mod);
        if (module.chance != nullptr)   module.chance->setSettings (slot.mod);
        if (module.length != nullptr)   module.length->setSettings (slot.mod);
        if (module.latch != nullptr)    module.latch->setSettings (slot.mod);
    }
}

void MidiInsertRack::setSlots (const juce::Array<MidiSlot>& slots)
{
    // Built outside the lock: allocation is the message thread's business, never the audio
    // thread's. A slot that kept its id AND its type keeps its live module, so editing a
    // knob mid-performance never restarts an arpeggio or strands a held note.
    std::vector<std::unique_ptr<Module>> rebuilt;
    std::vector<std::unique_ptr<Module>> retired;
    juce::MidiBuffer stranded;

    {
        const juce::SpinLock::ScopedLockType sl (lock);
        rebuilt.reserve ((std::size_t) juce::jmin (maxSlots, slots.size()));

        for (int i = 0; i < slots.size() && i < maxSlots; ++i)
        {
            const auto& slot = slots.getReference (i);

            auto existing = std::find_if (modules.begin(), modules.end(),
                                          [&slot] (const std::unique_ptr<Module>& candidate)
                                          {
                                              return candidate != nullptr
                                                  && candidate->slotId == slot.slotId
                                                  && candidate->type == slot.type;
                                          });

            if (existing != modules.end())
            {
                configure (**existing, slot);
                rebuilt.push_back (std::move (*existing));
            }
            else
            {
                rebuilt.push_back (nullptr);   // filled outside the lock, below
            }
        }

        // Whatever survived here is leaving the chain — retyped, removed or reordered out.
        // It may be holding notes, and it is about to be destroyed, so collect its releases
        // now: the new chain emits them on its next block and nothing is left sounding.
        for (auto& module : modules)
        {
            if (module == nullptr)
                continue;
            if (module->fx != nullptr)  module->fx->allNotesOff (stranded, 0);
            if (module->arp != nullptr) module->arp->allNotesOff (stranded, 0);
            releaseNoteModules (*module, stranded, 0);
            retired.push_back (std::move (module));
        }
        modules.clear();
    }

    // The genuinely new modules are constructed here, off the lock.
    for (int i = 0; i < (int) rebuilt.size(); ++i)
        if (rebuilt[(std::size_t) i] == nullptr)
            rebuilt[(std::size_t) i] = build (slots.getReference (i));

    {
        const juce::SpinLock::ScopedLockType sl (lock);
        modules.swap (rebuilt);
        for (const auto metadata : stranded)
            pendingFlush.addEvent (metadata.getMessage(), 0);
        hasPendingFlush = hasPendingFlush || ! stranded.isEmpty();
    }

    // `retired` and the leftovers in `rebuilt` free here, outside the lock.
}

void MidiInsertRack::prepare (int maximumExpectedSamplesPerBlock)
{
    const auto size = (std::size_t) juce::jmax (256, maximumExpectedSamplesPerBlock * 4);
    front.ensureSize (size);
    back.ensureSize (size);
    const juce::SpinLock::ScopedLockType sl (lock);
    pendingFlush.ensureSize (size);
}

void MidiInsertRack::process (const juce::MidiBuffer& in, juce::MidiBuffer& out,
                              const Transport::BlockTime& block, int numSamples)
{
    const juce::SpinLock::ScopedLockType sl (lock);

    front.clear();
    front.addEvents (in, 0, -1, 0);

    for (const auto& module : modules)
    {
        if (module == nullptr || module->bypassed)
            continue;

        if (module->arp != nullptr)
        {
            // A disabled arp is a straight copy inside the engine itself, so it stays in
            // the chain rather than being skipped — that is what keeps its own note
            // bookkeeping honest across an enable/disable while keys are down.
            module->arp->process (front, back, block, juce::jmax (1, numSamples));
        }
        else if (module->fx != nullptr)
        {
            if (module->fx->isTransparent())
                continue;
            module->fx->process (front, back);
        }
        // The six later modules. Every one of them stays in the chain even when it is doing
        // nothing, for the arp's reason: each owns notes it emitted or note-offs it swallowed,
        // and a module skipped mid-phrase is a module that never gets to let go.
        else if (module->echo != nullptr)
            module->echo->process (front, back, block, juce::jmax (1, numSamples));
        else if (module->strum != nullptr)
            module->strum->process (front, back, block, juce::jmax (1, numSamples));
        else if (module->humanize != nullptr)
            module->humanize->process (front, back, block, juce::jmax (1, numSamples));
        else if (module->length != nullptr)
            module->length->process (front, back, block, juce::jmax (1, numSamples));
        else if (module->chance != nullptr)
            module->chance->process (front, back);
        else if (module->latch != nullptr)
            module->latch->process (front, back);
        else
        {
            continue;
        }

        front.swapWith (back);
    }

    out.clear();
    out.addEvents (front, 0, -1, 0);

    // Releases owed by modules that left the chain mid-note: emitted by whoever is here
    // now, at the top of the block, so a rebuild under a held chord ends in silence rather
    // than a stuck note.
    if (hasPendingFlush)
    {
        for (const auto metadata : pendingFlush)
            out.addEvent (metadata.getMessage(), 0);
        pendingFlush.clear();
        hasPendingFlush = false;
    }
}

void MidiInsertRack::allNotesOff (juce::MidiBuffer& out, int position)
{
    const juce::SpinLock::ScopedLockType sl (lock);
    for (auto& module : modules)
    {
        if (module == nullptr)
            continue;
        if (module->fx != nullptr)  module->fx->allNotesOff (out, position);
        if (module->arp != nullptr) module->arp->allNotesOff (out, position);
        releaseNoteModules (*module, out, position);
    }

    for (const auto metadata : pendingFlush)
        out.addEvent (metadata.getMessage(), position);
    pendingFlush.clear();
    hasPendingFlush = false;
}

int MidiInsertRack::arpPatternStep() const noexcept
{
    const juce::SpinLock::ScopedLockType sl (lock);
    for (const auto& module : modules)
        if (module != nullptr && module->arp != nullptr)
            return module->arp->patternStep();
    return -1;
}

} // namespace ceditor::perf
