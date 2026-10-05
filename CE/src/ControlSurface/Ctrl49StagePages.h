// Ctrl49StagePages — the payloads for two HoSTage pages on the CTRL49 screen that a player reads
// on stage rather than turns knobs on: SOUNDCHECK (the setlist checked before the show) and
// LAYERS (which part sounds where on the keyboard).
//
// Both were mocked up first in tools/ctrl49/screen-lab/feature-mockups (hostage-rig), from the
// data HoSTage already holds: the setlist's reference checks and measured levels, and each
// part's key and velocity zone. The broker fills the views below; Hostage_MultiKnob.lua draws
// them (set_check, set_layers). The same builders exist in ctrl49Payloads.js for the app's
// screen card, and a byte test on each side keeps the two the same.
//
// Pure std, no I/O, no JUCE — same tier as the other display payloads, testable everywhere.

#pragma once

#include "Ctrl49Protocol.h"

#include <string>
#include <vector>

namespace ceditor::ctrl49
{

// --- SOUNDCHECK -----------------------------------------------------------------------------------

struct SoundcheckSongView
{
    std::string name;
    bool checked = false;        // the reference check has run for this song
    int problems = 0;            // what it found (missing plug-ins, a MIDI port gone, ...)
    bool measured = false;       // its level has been measured
    double rmsDb = -120.0;       // the measured average level, dBFS
    double peakDb = -120.0;      // and its peak
};

struct SoundcheckView
{
    std::vector<SoundcheckSongView> songs;   // the setlist, in order
    int selected = 0;                         // the song shown in full
    int current = -1;                         // the song on stage; -1 when no set is running
    std::string basis;                        // what the selected song was checked against
    std::vector<std::string> problems;        // the selected song's problems, as the check words them
    double seconds = 0.0;                     // how long the selected song's level was measured
};

inline constexpr int kSoundcheckRows = 10;          // songs listed at once; the list scrolls
inline constexpr int kSoundcheckProblemLines = 4;   // problems shown for the selected song
inline constexpr std::size_t kSoundcheckNameChars = 24;
inline constexpr std::size_t kSoundcheckLineChars = 44;

/** A measured level as one byte: 0 = not measured, else 1..61 for -60..0 dBFS. */
std::uint8_t soundcheckLevelByte (bool measured, double db);

/** The first song listed, so the selected one stays in view: centred where it can be. */
int soundcheckFirstRow (int songs, int selected);

/** set_check payload:
      [0] songs in the set   [1] first row listed   [2] rows that follow   [3] selected song
      [4] song on stage + 1 (0 = none)   [5] ready   [6] with problems   [7] not checked
      then each row: [status 0 not checked / 1 ready / 2 problems][level byte][problems][name]
      then the selected song: [basis][problems in all][lines that follow][line]...
      [peak byte][rms byte][seconds measured, 0-255]
    Strings are [length][ASCII]; names are cut at 24 characters, problem lines at 44 (with
    "..." where cut) and anything not ASCII becomes '?'. Counts stop at 255. */
Bytes buildSoundcheckPayload (const SoundcheckView& view);

// --- LAYERS ---------------------------------------------------------------------------------------

struct LayersPartView
{
    std::string name;
    int keyLow = 0;
    int keyHigh = 127;
    int velocityLow = 1;
    int velocityHigh = 127;
    int transpose = 0;
    bool enabled = true;
    bool muted = false;
    bool fromKeyboard = true;    // false when it plays another part's MIDI: the keys do not reach it
};

struct LayersNote
{
    int note = 0;
    int velocity = 0;
};

struct LayersView
{
    std::vector<LayersPartView> parts;   // the rack's parts, in order
    int focused = 0;                      // the part the encoders edit
    int firstKey = 36;                    // the keyboard drawn: 49 keys from here (C2-C6)
    std::vector<LayersNote> held;         // notes sounding now, as they were played
};

inline constexpr int kLayersRows = 8;          // parts drawn at once; more scroll with the focus
inline constexpr int kLayersHeldNotes = 16;    // notes sent at most (the rest are not drawn)
inline constexpr std::size_t kLayersNameChars = 20;

/** The first part drawn, so the focused one stays in view. */
int layersFirstRow (int parts, int focused);

/** set_layers payload:
      [0] parts in the rack   [1] first part drawn   [2] parts that follow   [3] focused part
      [4] first key of the 49 drawn
      then each part: [keyLow][keyHigh][velocityLow][velocityHigh][transpose + 64]
                      [flags: 1 enabled, 2 muted, 4 from the keyboard][name]
      then [notes held][note][velocity]...
    Keys and velocities are clamped to 0-127, transpose to -64..+63. */
Bytes buildLayersPayload (const LayersView& view);

} // namespace ceditor::ctrl49
