// Ctrl49StagePages — the payloads for the HoSTage pages on the CTRL49 screen that are not knob
// pages: SOUNDCHECK (the setlist checked before the show) and LAYERS (which part sounds where on
// the keyboard), which a player reads on stage, and DISCOVER (what you own and have never opened,
// nearest to what you keep loading), which you go to between songs.
//
// All three were mocked up first in tools/ctrl49/screen-lab/feature-mockups (hostage-rig), from
// data HoSTage already holds: the setlist's reference checks and measured levels, each part's key
// and velocity zone, and the library's load counts and measured sounds. The broker fills the views
// below; Hostage_MultiKnob.lua draws them (set_check, set_layers, set_discover). The same builders
// exist in ctrl49Payloads.js for the app's screen card, and a byte test on each side keeps the two
// the same.
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

// --- DISCOVER -------------------------------------------------------------------------------------
//
// The map is the library's own two measured axes: brightness across, attack up, each 0-100. On it
// go the centre of what you load (YOU, the load-weighted average), the sounds you load most, and
// the suggestions.

struct DiscoverPoint
{
    int x = 0;     // brightness, 0 dark .. 100 bright
    int y = 0;     // attack, 0 instant .. 100 slow
};

struct DiscoverSoundView
{
    std::string name;
    std::string instrument;      // the plug-in it is for
    DiscoverPoint at;
    int percent = 0;             // how like what you load: 100 * (1 - distance), as the app says it
    bool kept = false;           // a favourite
};

struct DiscoverView
{
    enum State { notEnough = 0, suggestions = 1, nothingNew = 2 };
    State state = notEnough;                 // too few loads to have a taste; or nothing to suggest
    std::vector<DiscoverSoundView> sounds;   // nearest first, already kept to `kind`
    int selected = 0;
    int neverOpened = 0;                     // records never loaded, in the whole library
    int regularsCounted = 0;                 // the sounds whose loads make the centre
    std::string kind;                        // the category the list is kept to; empty = all
    DiscoverPoint centre;
    std::vector<DiscoverPoint> regulars;     // what you load most, for the map
    std::string likeName;                    // the sound you load that the selected one is nearest
    int likeLoads = 0;                       // and how often you have loaded it
};

inline constexpr int kDiscoverRows = 8;              // listed at once; pad N auditions row N
inline constexpr int kDiscoverRegulars = 48;         // points of what you load, on the map
inline constexpr std::size_t kDiscoverNameChars = 24;
inline constexpr std::size_t kDiscoverInstrumentChars = 16;
inline constexpr std::size_t kDiscoverKindChars = 12;

/** The first sound listed: the window pages by eight, so pad N is always row N of what is shown. */
int discoverFirstRow (int sounds, int selected);

/** set_discover payload:
      [0] state (0 not enough to go on, 1 suggestions, 2 nothing new)   [1] sounds   [2] first row
      [3] rows that follow   [4] selected   [5][6] never opened, low byte first (stops at 65535)
      [7] sounds the centre is made from (stops at 255)   then [kind]   [centre x][centre y]
      then each row: [x][y][percent][kept][name][instrument]
      then the selected sound: [like name][like loads, stops at 255]
      then [points][x][y]... of what you load most
    Strings are [length][ASCII] as on the other pages; x and y are 0-100. */
Bytes buildDiscoverPayload (const DiscoverView& view);

} // namespace ceditor::ctrl49
