#pragma once

// PartMidiRules — one rack part's MIDI acceptance zone (VIP-successor Stage 1).
//
// Shared by the persisted rack model (RackModel.h) and the real-time filter
// (PartMidiFilterCore.h), so the saved document and the audio thread cannot drift apart on
// what a rule means. Kept JUCE-free: it is six small integers.
//
// Semantics, fixed here so every consumer agrees:
//   channel        0 accepts every channel (Omni); 1..16 accepts exactly that channel.
//   keyLow/High    inclusive zone tested against the INCOMING note number, before transpose.
//   velocityLow/High  inclusive, tested on note-ons only (a note-off's velocity is not a filter).
//   transpose      semitones added after acceptance; a result outside 0..127 drops the note-on
//                  (and, having produced no note-on, can leave no orphan note behind).

namespace ceditor::host
{

struct PartMidiRules
{
    int channel = 0;        // 0 = Omni
    int keyLow = 0;
    int keyHigh = 127;
    int velocityLow = 1;
    int velocityHigh = 127;
    int transpose = 0;
};

} // namespace ceditor::host
