// PartMidiFilterTests — Hostage's per-part MIDI gate ordering rules.
//
// The invariant under test is the baseline's note-safety rule: acceptance is decided at
// note-on time and remembered, so a note-off always reaches the destination that got the
// note-on — whatever happened to the rules in between. Everything else here is boundary
// arithmetic (inclusive zones, transpose clamps) and the panic/clear split.
//
// juce_core + juce_audio_basics; runs anywhere. The AudioProcessor shell and the graph around
// it are covered by RackHostTests.

#include "InstrumentHost/PartMidiFilterCore.h"
#include <iostream>
#include <vector>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

using ceditor::host::PartMidiFilterCore;
using ceditor::host::PartMidiRules;

std::vector<juce::MidiMessage> run (PartMidiFilterCore& core,
                                    const std::vector<juce::MidiMessage>& in)
{
    juce::MidiBuffer inBuffer, outBuffer;
    int position = 0;
    for (const auto& m : in)
        inBuffer.addEvent (m, position++);

    core.process (inBuffer, outBuffer);

    std::vector<juce::MidiMessage> out;
    for (const auto metadata : outBuffer)
        out.push_back (metadata.getMessage());
    return out;
}

juce::MidiMessage on (int channel, int note, int velocity = 100)
{
    return juce::MidiMessage::noteOn (channel, note, (juce::uint8) velocity);
}

juce::MidiMessage off (int channel, int note)
{
    return juce::MidiMessage::noteOff (channel, note);
}

void testZones()
{
    std::cout << "\nacceptance zones" << std::endl;

    PartMidiFilterCore core;
    PartMidiRules rules;
    rules.channel = 2;
    rules.keyLow = 36;
    rules.keyHigh = 59;
    rules.velocityLow = 10;
    rules.velocityHigh = 100;
    core.setRules (rules);

    check (run (core, { on (2, 36, 10) }).size() == 1, "low edges are inclusive");
    check (run (core, { on (2, 59, 100) }).size() == 1, "high edges are inclusive");
    check (run (core, { on (2, 35) }).empty(), "below the key zone is out");
    check (run (core, { on (2, 60) }).empty(), "above the key zone is out");
    check (run (core, { on (2, 40, 9) }).empty(), "below the velocity zone is out");
    check (run (core, { on (2, 40, 101) }).empty(), "above the velocity zone is out");
    check (run (core, { on (1, 40) }).empty(), "the wrong channel is out");

    core.setRules (PartMidiRules());   // Omni
    check (run (core, { on (1, 40) }).size() == 1 && run (core, { on (16, 40) }).size() == 1,
           "Omni accepts every channel");
}

void testTransposeAndChannelTraffic()
{
    std::cout << "\ntranspose and non-note traffic" << std::endl;

    PartMidiFilterCore core;
    PartMidiRules rules;
    rules.transpose = 12;
    core.setRules (rules);

    const auto up = run (core, { on (1, 60) });
    check (up.size() == 1 && up[0].getNoteNumber() == 72, "transpose shifts the sent note");

    const auto offAfter = run (core, { off (1, 60) });
    check (offAfter.size() == 1 && offAfter[0].isNoteOff() && offAfter[0].getNoteNumber() == 72,
           "the note-off follows the sent note, keyed by the source note");

    check (run (core, { on (1, 120) }).empty(),
           "a transpose past 127 drops the note-on entirely");
    check (run (core, { off (1, 120) }).empty(),
           "so its note-off has nothing to follow and is dropped too");

    rules.transpose = 0;
    rules.channel = 3;
    core.setRules (rules);
    check (run (core, { juce::MidiMessage::controllerEvent (3, 64, 127) }).size() == 1,
           "a CC on the part's channel passes — key zones do not apply to it");
    check (run (core, { juce::MidiMessage::controllerEvent (2, 64, 127) }).empty(),
           "a CC on another channel is out");
    check (run (core, { juce::MidiMessage::pitchWheel (3, 9000) }).size() == 1,
           "pitch wheel passes the channel gate");
}

void testNoteOffFollowsRuleChanges()
{
    std::cout << "\nnote-off safety across rule changes" << std::endl;

    PartMidiFilterCore core;
    core.setRules (PartMidiRules());

    check (run (core, { on (1, 60) }).size() == 1, "the note-on passes under the old rules");

    PartMidiRules excluding;
    excluding.keyLow = 0;
    excluding.keyHigh = 10;
    core.setRules (excluding);

    const auto followed = run (core, { off (1, 60) });
    check (followed.size() == 1 && followed[0].isNoteOff() && followed[0].getNoteNumber() == 60,
           "the note-off is delivered although the current rules exclude the key");

    check (run (core, { off (1, 60) }).empty(),
           "a second off for the same note has nothing tracked and is dropped");
    check (run (core, { off (1, 72) }).empty(),
           "an off whose on never passed is dropped");
}

void testRetriggerAcrossTranspose()
{
    std::cout << "\nretrigger across a transpose change" << std::endl;

    PartMidiFilterCore core;
    core.setRules (PartMidiRules());
    check (run (core, { on (1, 60) }).size() == 1, "first note-on sent at 60");

    PartMidiRules up;
    up.transpose = 12;
    core.setRules (up);

    const auto retrigger = run (core, { on (1, 60) });
    check (retrigger.size() == 2
             && retrigger[0].isNoteOff() && retrigger[0].getNoteNumber() == 60
             && retrigger[1].isNoteOn() && retrigger[1].getNoteNumber() == 72,
           "a retrigger offs the previously sent note before sending the new one");

    const auto release = run (core, { off (1, 60) });
    check (release.size() == 1 && release[0].getNoteNumber() == 72,
           "and the final off follows the latest sent note");
}

void testPanicAndClear()
{
    std::cout << "\npanic and clear" << std::endl;

    PartMidiFilterCore core;
    core.setRules (PartMidiRules());
    run (core, { on (1, 60), on (2, 61) });

    core.requestPanic();
    const auto panic = run (core, {});
    int noteOffs = 0, allNotesOff = 0, allSoundOff = 0;
    for (const auto& m : panic)
    {
        if (m.isNoteOff()) ++noteOffs;
        if (m.isController() && m.getControllerNumber() == 123) ++allNotesOff;
        if (m.isController() && m.getControllerNumber() == 120) ++allSoundOff;
    }
    check (noteOffs == 2, "panic offs every tracked note");
    check (allNotesOff == 16 && allSoundOff == 16,
           "and sweeps all-notes-off/all-sound-off across every channel");
    check (run (core, { off (1, 60) }).empty(), "panic forgets the tracking");

    run (core, { on (1, 62) });
    core.requestClear();
    check (run (core, {}).empty(), "clear emits nothing — the destination is being destroyed");
    check (run (core, { off (1, 62) }).empty(), "but the tracking is forgotten all the same");
}

void testDisable()
{
    std::cout << "\ndisable" << std::endl;

    PartMidiFilterCore core;
    core.setRules (PartMidiRules());
    run (core, { on (1, 60) });

    core.setEnabled (false);
    const auto swept = run (core, { on (1, 70) });
    bool sawTrackedOff = false, sawNewNote = false;
    for (const auto& m : swept)
    {
        if (m.isNoteOff() && m.getNoteNumber() == 60) sawTrackedOff = true;
        if (m.isNoteOn()) sawNewNote = true;
    }
    check (sawTrackedOff, "disabling panics the notes that already passed");
    check (! sawNewNote, "and the gate is closed to new notes");

    core.setEnabled (true);
    check (run (core, { on (1, 70) }).size() == 1, "re-enabling opens the gate again");
    check (run (core, {}).empty(), "without a second panic");
}
} // namespace

int main()
{
    std::cout << "PartMidiFilter tests" << std::endl;

    testZones();
    testTransposeAndChannelTraffic();
    testNoteOffFollowsRuleChanges();
    testRetriggerAcrossTranspose();
    testPanicAndClear();
    testDisable();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
