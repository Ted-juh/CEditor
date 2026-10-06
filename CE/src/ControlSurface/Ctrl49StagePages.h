// Ctrl49StagePages — the payloads for the HoSTage pages on the CTRL49 screen that are not knob
// pages: SOUNDCHECK (the setlist checked before the show), LAYERS (which part sounds where on
// the keyboard) and METERS (every part's level), which a player reads on stage, and DISCOVER (what you own and have never opened,
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
    double loadSeconds = -1.0;   // how long it took to load when last recalled; -1 = not yet
    bool loadTimedOut = false;   // the recall gave up waiting for it
    bool preloaded = false;      // its rig was warm when it was recalled
};

struct SoundcheckView
{
    std::vector<SoundcheckSongView> songs;   // the setlist, in order
    int selected = 0;                         // the song shown in full
    int current = -1;                         // the song on stage; -1 when no set is running
    std::string basis;                        // what the selected song was checked against
    std::vector<std::string> problems;        // the selected song's problems, as the check words them
    double seconds = 0.0;                     // how long the selected song's level was measured
    bool preloadOff = false;                  // the setlist does not preload the next song
};

inline constexpr int kSoundcheckRows = 10;          // songs listed at once; the list scrolls
inline constexpr int kSoundcheckProblemLines = 4;   // problems shown for the selected song
inline constexpr std::size_t kSoundcheckNameChars = 24;
inline constexpr std::size_t kSoundcheckLineChars = 44;

/** A measured level as one byte: 0 = not measured, else 1..61 for -60..0 dBFS. */
std::uint8_t soundcheckLevelByte (bool measured, double db);

/** The first song listed, so the selected one stays in view: centred where it can be. */
int soundcheckFirstRow (int songs, int selected);

/** A load time as one byte: 0 = never recalled, 1-254 = 0.0-25.3 s in tenths, 255 = gave up. */
std::uint8_t soundcheckLoadByte (double seconds, bool timedOut);

/** set_check payload:
      [0] songs in the set   [1] first row listed   [2] rows that follow   [3] selected song
      [4] song on stage + 1 (0 = none)   [5] ready   [6] with problems   [7] not checked
      then each row: [status 0 not checked / 1 ready / 2 problems][level byte][problems]
                     [load byte][name]
      then the selected song: [basis][problems in all][lines that follow][line]...
      [peak byte][rms byte][seconds measured, 0-255]
      [flags: 1 the selected song was preloaded, 2 the setlist preloads nothing]
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
    // Its layer group (RackModel.h LayerGroup), when it is in an enabled one: which group,
    // 1-based (0 = none), what the group reads (0 velocity, 1 key, 2 cc, 3 expression, 4 macro),
    // how it shares notes (0 all, crossfading; 1 round robin; 2 least busy), and this part's
    // share of the source with the crossfade either side, as LayerRouter weighs it, in 0-127.
    int group = 0;
    int source = 0;
    int allocation = 0;
    int layerLow = 0, layerHigh = 127;
    int layerFade = 0;           // 0-64: LayerMember::crossfade (0..0.5) times 127
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
                      [flags: 1 enabled, 2 muted, 4 from the keyboard]
                      [layer group, 0 none][source + 16 * allocation][layer low][layer high][fade]
                      [name]
      then [notes held][note][velocity]...
    Keys and velocities are clamped to 0-127, transpose to -64..+63. */
Bytes buildLayersPayload (const LayersView& view);

// --- CUE ------------------------------------------------------------------------------------------
//
// The setlist's cue screen, read mid-show: the song on stage, where it is in its sections, its
// clock against the time planned for it, and what comes next and whether it has loaded. (The
// mockups call it Stage; CUE here because "stage pages" already names this group.)

struct CueView
{
    int songs = 0;                       // in the setlist
    int current = -1;                    // the song on stage; -1 = none recalled yet
    int picked = -1;                     // the song E1 has picked to go to; -1 = the current one
    bool loading = false;                // the current song's rig is still loading
    std::string song;                    // its name
    double tempo = 0.0;                  // what the transport plays, BPM
    int songSeconds = 0, setSeconds = 0; // the clocks: this song, and the set since its first song
    int plannedSeconds = 0;              // how long the song should take; 0 = not planned
    std::vector<std::string> notes;      // what to read on stage, a line each
    std::string section;                 // the song's section playing now; empty = none
    int sectionBar = 0, sectionBars = 0; // which bar of how many
    std::string nextSection;
    std::string nextSong;                // the song after the current one
    int nextReady = -1;                  // its rig preloaded, 0-100%; -1 = nothing to preload
    std::string pickedSong;              // the name of `picked`, when it is not the current song
};

inline constexpr int kCueNoteLines = 3;
inline constexpr std::size_t kCueNoteChars = 44;

/** set_cue payload:
      [0] songs   [1] current + 1 (0 = none)   [2] picked + 1 (0 = the current one)   [3] loading
      [4][5] song seconds   [6][7] set seconds   [8][9] planned seconds   [10][11] tempo x 10
      (two-byte numbers are low byte first and stop at 65535)
      [12] section bar   [13] section bars (0 = no section playing)
      [14] next song preloaded, 0-100, 255 = nothing to preload
      then [song][section][next section][next song][picked song][note lines][line]...
    Strings are [length][ASCII]: names stop at 24 characters, sections at 16, notes at 44. */
Bytes buildCuePayload (const CueView& view);

// --- CHANGES --------------------------------------------------------------------------------------
//
// The focused part's sound against a save of it: which parameters moved, from what to what. E1
// listens anywhere between the save and now, E2 picks a change, E3 puts it back (and takes it
// back), E4 walks back to older saves.

struct ChangeRowView
{
    std::string name;
    std::string savedText, nowText;    // as the plug-in words each value
    int saved = 0, now = 0;            // the normalised values, 0-100, for the bar
};

struct ChangesView
{
    enum State { problem = 0, unchanged = 1, changed = 2 };
    State state = problem;
    std::vector<ChangeRowView> rows;   // the parameters that differ, in the plug-in's order
    int selected = 0;
    int total = 0;                     // parameters compared
    int listen = 100;                  // where between the save (0) and now (100) the part plays
    int back = 0, saves = 0;           // which save (0 = the latest) of how many
    int putBack = 0;                   // changes put back on this page, which E3 can take back
    std::string sound, against, when;  // the sound, the save it is against, and when it was saved
    std::string problemText;           // why there is nothing to compare
};

inline constexpr int kChangesRows = 8;

/** set_changes payload:
      [0] state (0 problem, 1 unchanged, 2 changed)   [1] changes   [2] first row   [3] rows
      [4] selected   [5][6] parameters compared, low byte first   [7] listen 0-100
      [8] save shown (0 = the latest)   [9] saves   [10] put back
      then [sound][against][when][problem]
      then each row: [saved 0-100][now 0-100][name][saved text][now text]
    Names stop at 20 characters, values at 10, the problem at 44. */
Bytes buildChangesPayload (const ChangesView& view);

// --- LIVE -----------------------------------------------------------------------------------------
//
// The keys as you play them: every part's zone over 49 keys, the keys held in the colour of the
// part that plays them, the notes the focused part's arpeggiator plays from them marked; and that
// arpeggiator's step lane (ArpSettings: velocity, octave, ratchets, chance per step) with its
// playhead, which E1-E5 edit and E6-E8 set the gate, rate and mode of.

struct LiveStep
{
    int velocity = 100;    // 0: a rest
    int octave = 0;        // -2..+2
    int ratchet = 1;       // 1..4 hits in the step
    int chance = 100;      // 0..100 %
    bool tie = false;      // held into the next step
};

struct LiveZone
{
    std::string name;
    int keyLow = 0, keyHigh = 127;
    bool playable = true;  // enabled, not muted, and taking the keyboard's notes
};

struct LiveView
{
    std::string part;                 // the part whose arpeggiator is shown
    bool arpOn = false;
    int mode = 0;                     // ArpSettings::Mode
    int stepsPerBeat = 4;
    int gate = 50;                    // percent of a step
    bool lane = false;                // the arp has a drawn lane; without one every step plays as played
    std::vector<LiveStep> steps;      // the lane, up to kLiveSteps
    int cursor = 0;                   // the step E2-E5 edit
    int playing = -1;                 // the step that last sounded; -1 none
    double tempo = 120.0;
    std::vector<LiveZone> zones;      // the rack's parts, in order
    int focused = -1;                 // which zone is the part shown
    int firstKey = 36;                // the 49 keys drawn start here (C2)
    std::vector<int> held, arpNotes;  // notes held on the keys, notes the arp plays
};

inline constexpr int kLiveSteps = 16;
inline constexpr int kLiveZones = 6;
inline constexpr int kLiveNotes = 16;
inline constexpr std::size_t kLiveNameChars = 16;

/** E7 on LIVE: the arp's rate, steps per beat, through 1 2 3 4 6 8 12 16 (a turn's detents at
    once; a rate between two goes to the next one in the turn's direction). */
int liveNextRate (int stepsPerBeat, int detents);

/** E8 on LIVE: the arp's mode, with off before the first (-1 off, else ArpSettings::Mode 0-7). */
int liveNextMode (int mode, int detents);

/** set_live payload:
      [0] flags: 1 arp on, 2 a drawn lane   [1] mode   [2] steps per beat   [3] gate %
      [4] steps that follow   [5] cursor   [6] playing + 1 (0 none)   [7][8] tempo x 10, low first
      [9] first key   [10] zones that follow   [11] focused zone (255 none)
      then each step: [velocity][octave + 2][ratchet][chance][tie]
      then each zone: [key low][key high][flags: 1 playable][name]
      then [held][note]...  [arp notes][note]...  then [part name]
    Zones stop at six, notes at sixteen each, names at sixteen characters. */
Bytes buildLivePayload (const LiveView& view);

// --- METERS ---------------------------------------------------------------------------------------
//
// Every part's level after its inserts and fader, left and right, and the master's, as the rack
// meters them for the app; the faders on E1-E5 and the master on E6. Peak hold, clip and the
// master's last seconds the page keeps itself, from the levels it is sent.

struct MetersPartView
{
    std::string name;
    float left = 0.0f, right = 0.0f;   // linear peak since the last redraw, 1 = 0 dBFS
    float volume = 1.0f;               // the fader, linear 0..2
    bool muted = false, enabled = true;
};

struct MetersView
{
    std::vector<MetersPartView> parts;   // the rack's parts, in order
    int first = 0;                       // the first part on a strip; E7 moves it
    int touched = -1;                    // the strip whose encoder turned last: 0-4 a part, 5 the master
    float masterLeft = 0.0f, masterRight = 0.0f, masterVolume = 1.0f;
};

inline constexpr int kMetersStrips = 5;              // part strips; the master is a sixth
inline constexpr std::size_t kMetersNameChars = 12;

/** A level or a fader as one byte: 0 silence (or below -57 dB, or a fader at zero), else 1-127 for
    -57..+6 dB in half decibels; 0 dB is 115, and anything over it is a clip. */
std::uint8_t metersLevelByte (float linear);

/** The first part on a strip, kept so that there are five where the rack has them. */
int metersFirstPart (int parts, int first);

/** A fader turned on METERS: half a decibel a detent, from off (0) to +6 dB (2.0, the mixer's
    top). Turning down past -57 dB is off; turning up from off starts at -57 dB. */
float metersNudgeVolume (float volume, int detents);

/** set_meters payload:
      [0] parts in the rack   [1] first part on a strip   [2] strips that follow (0-5)
      [3] the strip turned last (0-4, 5 the master, 255 none)
      then each strip: [left][right][fader][flags: 1 muted, 2 off][name]
      then the master: [left][right][fader]
    Levels and faders are metersLevelByte; names stop at 12 characters. */
Bytes buildMetersPayload (const MetersView& view);

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
