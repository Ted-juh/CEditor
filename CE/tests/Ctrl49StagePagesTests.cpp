// Ctrl49StagePagesTests — the SOUNDCHECK, LAYERS and DISCOVER payloads (Ctrl49StagePages.h). No keyboard:
// the byte layouts, the scrolling windows, the limits, and one golden payload for each page that
// CE/web/test/ctrl49Preview.test.js asserts too, so the app's screen card draws exactly the bytes
// the keyboard is sent.

#include "ControlSurface/Ctrl49StagePages.h"

#include <iostream>
#include <string>

namespace
{
namespace c49 = ceditor::ctrl49;

int failures = 0;

void check (bool cond, const std::string& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

std::string text (const c49::Bytes& b, std::size_t at)
{
    return std::string (b.begin() + (long) at + 1, b.begin() + (long) at + 1 + b[at]);
}

// The views behind the goldens. ctrl49Preview.test.js builds the same two in JavaScript.
c49::SoundcheckView goldenSoundcheck()
{
    c49::SoundcheckView view;
    view.songs = { { "Glass Harbour", true, 0, true, -18.4, -3.2, 2.3 },
                   { "Salt Road", true, 2, false, -120.0, -120.0 },
                   { "Night Bus", false, 0, false, -120.0, -120.0, 0.0 } };
    view.preloadOff = true;
    view.selected = 1;
    view.current = 0;
    view.basis = "Current rig at check time";
    view.problems = { "MIDI output unavailable: USB MIDI 2", "Drifter: plug-in file is missing" };
    return view;
}

c49::LayersView goldenLayers()
{
    c49::LayersView view;
    view.parts = { { "Sub Bass", 36, 54, 1, 127, 0, true, false, true },
                   { "Brass", 60, 84, 100, 127, -12, true, true, false, 1, 0, 0, 80, 127, 13 } };
    view.focused = 1;
    view.held = { { 48, 90 }, { 72, 112 } };
    return view;
}

const c49::Bytes kGoldenSoundcheck {
    3, 0, 3, 1, 1, 1, 1, 1,
    1, 43, 0, 24, 13, 'G', 'l', 'a', 's', 's', ' ', 'H', 'a', 'r', 'b', 'o', 'u', 'r',
    2, 0, 2, 0, 9, 'S', 'a', 'l', 't', ' ', 'R', 'o', 'a', 'd',
    0, 0, 0, 1, 9, 'N', 'i', 'g', 'h', 't', ' ', 'B', 'u', 's',
    25, 'C', 'u', 'r', 'r', 'e', 'n', 't', ' ', 'r', 'i', 'g', ' ', 'a', 't', ' ', 'c', 'h', 'e', 'c', 'k', ' ', 't', 'i', 'm', 'e',
    2, 2,
    35, 'M', 'I', 'D', 'I', ' ', 'o', 'u', 't', 'p', 'u', 't', ' ', 'u', 'n', 'a', 'v', 'a', 'i', 'l', 'a', 'b', 'l', 'e', ':', ' ',
        'U', 'S', 'B', ' ', 'M', 'I', 'D', 'I', ' ', '2',
    32, 'D', 'r', 'i', 'f', 't', 'e', 'r', ':', ' ', 'p', 'l', 'u', 'g', '-', 'i', 'n', ' ', 'f', 'i', 'l', 'e', ' ',
        'i', 's', ' ', 'm', 'i', 's', 's', 'i', 'n', 'g',
    0, 0, 0, 2 };

c49::DiscoverView goldenDiscover()
{
    c49::DiscoverView view;
    view.state = c49::DiscoverView::suggestions;
    view.sounds = { { "Gritty Strings 62", "Nebula", { 62, 30 }, 87, false },
                    { "Hollow Strings 61", "Nebula", { 40, 70 }, 85, true },
                    { "Bright Strings 12", "Brasswork", { 75, 12 }, 71, false } };
    view.neverOpened = 11903;
    view.regularsCounted = 14;
    view.kind = "Strings";
    view.centre = { 55, 40 };
    view.likeName = "Lush Pad 19";
    view.likeLoads = 11;
    view.regulars = { { 50, 35 }, { 60, 45 } };
    return view;
}

// [length][ASCII], for the goldens below that carry more text than is readable as characters.
void put (c49::Bytes& out, const std::string& s)
{
    out.push_back ((std::uint8_t) s.size());
    out.insert (out.end(), s.begin(), s.end());
}

c49::Bytes goldenDiscoverBytes()
{
    c49::Bytes b { 1, 3, 0, 3, 0, 127, 46, 14 };
    put (b, "Strings");
    b.insert (b.end(), { 55, 40 });
    b.insert (b.end(), { 62, 30, 87, 0 });  put (b, "Gritty Strings 62");  put (b, "Nebula");
    b.insert (b.end(), { 40, 70, 85, 1 });  put (b, "Hollow Strings 61");  put (b, "Nebula");
    b.insert (b.end(), { 75, 12, 71, 0 });  put (b, "Bright Strings 12");  put (b, "Brasswork");
    put (b, "Lush Pad 19");
    b.push_back (11);
    b.insert (b.end(), { 2, 50, 35, 60, 45 });
    return b;
}

c49::CueView goldenCue()
{
    c49::CueView view;
    view.songs = 6;
    view.current = 1;
    view.picked = 2;
    view.song = "Night Bus";
    view.tempo = 124.0;
    view.songSeconds = 252;
    view.setSeconds = 2282;
    view.plannedSeconds = 300;
    view.notes = { "Capo 2. Long intro.", "Watch the drummer" };
    view.section = "Bridge";
    view.sectionBar = 1;
    view.sectionBars = 4;
    view.nextSection = "Chorus";
    view.nextSong = "Glass Harbour";
    view.nextReady = 30;
    view.pickedSong = "Glass Harbour";
    return view;
}

c49::Bytes goldenCueBytes()
{
    // 252 s, 2282 s (8 * 256 + 234), 300 s (256 + 44), 124.0 BPM as 1240 (4 * 256 + 216)
    c49::Bytes b { 6, 2, 3, 0, 252, 0, 234, 8, 44, 1, 216, 4, 1, 4, 30 };
    put (b, "Night Bus");
    put (b, "Bridge");
    put (b, "Chorus");
    put (b, "Glass Harbour");
    put (b, "Glass Harbour");
    b.push_back (2);
    put (b, "Capo 2. Long intro.");
    put (b, "Watch the drummer");
    return b;
}

c49::ChangesView goldenChanges()
{
    c49::ChangesView view;
    view.state = c49::ChangesView::changed;
    view.rows = { { "Cutoff", "2.1 kHz", "4.8 kHz", 40, 62 }, { "Resonance", "12 %", "30 %", 12, 30 } };
    view.selected = 1;
    view.total = 300;
    view.listen = 100;
    view.back = 0;
    view.saves = 3;
    view.putBack = 1;
    view.sound = "Glass Pad";
    view.against = "your last save";
    view.when = "05 Oct 18:42";
    return view;
}

c49::Bytes goldenChangesBytes()
{
    c49::Bytes b { 2, 2, 0, 2, 1, 44, 1, 100, 0, 3, 1 };   // 300 = 256 + 44
    put (b, "Glass Pad");
    put (b, "your last save");
    put (b, "05 Oct 18:42");
    put (b, "");
    b.insert (b.end(), { 40, 62 });  put (b, "Cutoff");  put (b, "2.1 kHz");  put (b, "4.8 kHz");
    b.insert (b.end(), { 12, 30 });  put (b, "Resonance");  put (b, "12 %");  put (b, "30 %");
    return b;
}

const c49::Bytes kGoldenLayers {
    2, 0, 2, 1, 36,
    36, 54, 1, 127, 64, 5, 0, 0, 0, 127, 0, 8, 'S', 'u', 'b', ' ', 'B', 'a', 's', 's',
    60, 84, 100, 127, 52, 3, 1, 0, 80, 127, 13, 5, 'B', 'r', 'a', 's', 's',
    2, 48, 90, 72, 112 };
} // namespace

int main()
{
    std::cout << "CTRL49 stage pages" << std::endl;

    {   // --- SOUNDCHECK ---------------------------------------------------------------------
        const auto bytes = c49::buildSoundcheckPayload (goldenSoundcheck());
        check (bytes == kGoldenSoundcheck, "the soundcheck payload is the golden the app's test also asserts");
        check (bytes[5] == 1 && bytes[6] == 1 && bytes[7] == 1, "the set is counted: one ready, one with problems, one not checked");
        check (bytes[4] == 1, "the song on stage is sent one-based, 0 being none");
        check (c49::soundcheckLevelByte (true, -18.4) == 43 && c49::soundcheckLevelByte (true, 0.0) == 61
                 && c49::soundcheckLevelByte (true, -90.0) == 1 && c49::soundcheckLevelByte (false, -10.0) == 0,
               "a level is one byte: 1-61 for -60..0 dBFS, 0 when not measured");

        c49::SoundcheckView many;
        for (int i = 0; i < 40; ++i)
            many.songs.push_back ({ "Song " + std::to_string (i + 1), true, 0, false, -120.0, -120.0 });
        many.selected = 30;
        const auto scrolled = c49::buildSoundcheckPayload (many);
        check (scrolled[1] == 25 && scrolled[2] == c49::kSoundcheckRows && scrolled[3] == 30,
               "a long set scrolls: ten songs listed, the selected one in the middle");
        many.selected = 39;
        check (c49::buildSoundcheckPayload (many)[1] == 30, "and the last ten when the last song is selected");
        many.selected = 99;
        check (c49::buildSoundcheckPayload (many)[3] == 39, "a selection past the end is the last song");
        check (c49::soundcheckLoadByte (-1.0, false) == 0 && c49::soundcheckLoadByte (0.0, false) == 1
                 && c49::soundcheckLoadByte (2.34, false) == 24 && c49::soundcheckLoadByte (90.0, false) == 254
                 && c49::soundcheckLoadByte (16.0, true) == 255,
               "a load time is one byte: tenths of a second, 0 for never, 255 for gave up");
        check (c49::buildSoundcheckPayload (c49::SoundcheckView {}).size() == 15 && c49::buildSoundcheckPayload (c49::SoundcheckView {})[0] == 0,
               "an empty setlist still makes a payload the page reads");

        c49::SoundcheckView wordy = goldenSoundcheck();
        wordy.songs[1].name = "A song with a much longer name than fits";
        wordy.problems = { std::string (80, 'x'), "two", "three", "four", "five", "six" };
        const auto cut = c49::buildSoundcheckPayload (wordy);
        check (cut.size() < c49::kMaxPayloadBytes, "the payload stays inside one frame");
        bool namesCut = true, lineCut = false;
        std::size_t at = 8;
        for (int r = 0; r < 3; ++r)
        {
            namesCut = namesCut && cut[at + 4] <= c49::kSoundcheckNameChars;
            at += 5 + cut[at + 4];
        }
        at += 1 + cut[at];
        check (cut[at] == 6 && cut[at + 1] == c49::kSoundcheckProblemLines, "six problems: the count says six, four are sent");
        lineCut = text (cut, at + 2).size() == c49::kSoundcheckLineChars && text (cut, at + 2).ends_with ("...");
        check (namesCut && lineCut, "names stop at 24 characters, problem lines at 44 with \"...\"");

        c49::SoundcheckView odd = goldenSoundcheck();
        odd.songs[0].name = "Caf\xC3\xA9";
        const auto ascii = c49::buildSoundcheckPayload (odd);
        check (ascii[12] == 5 && ascii[16] == '?' && ascii[17] == '?', "anything not ASCII is sent as '?'");
    }

    {   // --- LAYERS ---------------------------------------------------------------------------
        const auto bytes = c49::buildLayersPayload (goldenLayers());
        check (bytes == kGoldenLayers, "the layers payload is the golden the app's test also asserts");
        check (bytes[10] == (1 | 4) && bytes[30] == (1 | 2), "flags: enabled 1, muted 2, from the keyboard 4");
        check (bytes[29] == 64 - 12, "transpose is sent with 64 added");
        check (bytes[11] == 0 && bytes[31] == 1 && bytes[33] == 80 && bytes[35] == 13,
               "a part in a layer group carries its group, its share of the source and its crossfade");

        c49::LayersView many;
        for (int i = 0; i < 12; ++i)
            many.parts.push_back ({ "Part " + std::to_string (i + 1), 36, 96, 1, 127, 0, true, false, true });
        many.focused = 10;
        const auto scrolled = c49::buildLayersPayload (many);
        check (scrolled[1] == 4 && scrolled[2] == c49::kLayersRows && scrolled[3] == 10,
               "twelve parts: eight drawn, the window following the focused part");
        many.focused = 0;
        check (c49::buildLayersPayload (many)[1] == 0, "from the top when the first is focused");

        c49::LayersView wild;
        wild.parts = { { "X", -5, 300, 0, 200, 99, false, false, false, 3, 9, 7, -1, 300, 90 } };
        for (int n = 0; n < 30; ++n)
            wild.held.push_back ({ 40 + n, 100 });
        wild.firstKey = 120;
        const auto clamped = c49::buildLayersPayload (wild);
        check (clamped[4] == 127 - 48, "the 49 keys drawn always fit 0-127");
        check (clamped[5] == 0 && clamped[6] == 127 && clamped[8] == 127 && clamped[9] == 127 && clamped[10] == 0,
               "keys, velocities and transpose are clamped; a disabled part has no flags");
        check (clamped[12] == 4 + 16 * 2 && clamped[13] == 0 && clamped[14] == 127 && clamped[15] == 64,
               "a layer's source, sharing, range and crossfade are clamped too");
        check (clamped[18] == c49::kLayersHeldNotes && clamped.size() == 19u + 2u * c49::kLayersHeldNotes,
               "at most sixteen held notes are sent");
    }

    {   // --- CHANGES --------------------------------------------------------------------------
        check (c49::buildChangesPayload (goldenChanges()) == goldenChangesBytes(),
               "the changes payload is the golden the app's test also asserts");

        c49::ChangesView many = goldenChanges();
        many.rows.clear();
        for (int i = 0; i < 20; ++i)
            many.rows.push_back ({ "P" + std::to_string (i), "a", "b", 0, 100 });
        many.selected = 15;
        const auto scrolled = c49::buildChangesPayload (many);
        check (scrolled[1] == 20 && scrolled[2] == 12 && scrolled[3] == c49::kChangesRows,
               "a long list of changes scrolls with the selection, eight at a time");

        c49::ChangesView problem;
        problem.problemText = "Load a sound from the library to compare against its save.";
        const auto refused = c49::buildChangesPayload (problem);
        check (refused[0] == 0 && refused[3] == 0 && refused.size() < 64, "a problem is a page that says why, and no rows");

        c49::ChangesView wordy = goldenChanges();
        wordy.rows[0].savedText = "a very long value text";
        const auto cut = c49::buildChangesPayload (wordy);
        check (cut.size() < c49::kMaxPayloadBytes, "the page fits a frame");
    }

    {   // --- CUE ------------------------------------------------------------------------------
        check (c49::buildCuePayload (goldenCue()) == goldenCueBytes(), "the cue payload is the golden the app's test also asserts");

        c49::CueView same = goldenCue();
        same.picked = same.current;
        const auto here = c49::buildCuePayload (same);
        // header 15, then song 1+9, section 1+6, next section 1+6, next song 1+13: the pick at 53
        check (here[2] == 0 && here[53] == 0,
               "picking the song already on stage is no pick at all");

        c49::CueView none;
        const auto empty = c49::buildCuePayload (none);
        check (empty[0] == 0 && empty[1] == 0 && empty[12] == 0 && empty[13] == 0 && empty[14] == 255
                 && empty.size() == 21,
               "with no setlist the page is still sent: no song, no section, nothing to preload");

        c49::CueView long_ = goldenCue();
        long_.songSeconds = 99999;
        long_.sectionBar = 9;
        long_.notes = { std::string (60, 'n'), "b", "c", "d" };
        const auto cut = c49::buildCuePayload (long_);
        check (cut[4] == 0xFF && cut[5] == 0xFF && cut[12] == 4, "clocks stop at 65535 s, the bar at the section's last");
        check (cut.size() < c49::kMaxPayloadBytes, "and the page fits a frame");
    }

    {   // --- DISCOVER -------------------------------------------------------------------------
        const auto bytes = c49::buildDiscoverPayload (goldenDiscover());
        check (bytes == goldenDiscoverBytes(), "the discover payload is the golden the app's test also asserts");
        check (bytes[5] + 256 * bytes[6] == 11903, "the count of sounds never opened takes two bytes, low first");

        c49::DiscoverView many;
        many.state = c49::DiscoverView::suggestions;
        for (int i = 0; i < 30; ++i)
            many.sounds.push_back ({ "Sound " + std::to_string (i + 1), "Synth", { i, 100 - i }, 90 - i, false });
        many.selected = 13;
        const auto paged = c49::buildDiscoverPayload (many);
        check (paged[2] == 8 && paged[3] == c49::kDiscoverRows && paged[4] == 13,
               "the list pages by eight, so pad N is always row N of what is shown");
        many.selected = 29;
        const auto last = c49::buildDiscoverPayload (many);
        check (last[2] == 24 && last[3] == 6, "and the last page holds what is left");

        c49::DiscoverView wild = goldenDiscover();
        wild.neverOpened = 200000;
        wild.centre = { -10, 400 };
        wild.sounds[0].percent = 140;
        wild.kind = "A kind with a long name";
        for (int i = 0; i < 80; ++i)
            wild.regulars.push_back ({ i, i });
        const auto clamped = c49::buildDiscoverPayload (wild);
        check (clamped[5] == 0xFF && clamped[6] == 0xFF, "never opened stops at 65535");
        check (clamped[8] == c49::kDiscoverKindChars, "a kind stops at twelve characters");
        const auto centreAt = 9 + c49::kDiscoverKindChars;
        check (clamped[centreAt] == 0 && clamped[centreAt + 1] == 100 && clamped[centreAt + 4] == 100,
               "map points and percentages are kept to 0-100");
        check (clamped[clamped.size() - 1 - 2 * c49::kDiscoverRegulars] == c49::kDiscoverRegulars
                 && clamped.size() < c49::kMaxPayloadBytes,
               "at most 48 points of what you load, and the whole page inside one frame");

        c49::DiscoverView none;
        const auto empty = c49::buildDiscoverPayload (none);
        check (empty[0] == 0 && empty[1] == 0 && empty[3] == 0 && empty.size() == 14,
               "with nothing to go on the page is still sent, saying so");
    }

    std::cout << "-------------------" << std::endl;
    std::cout << (failures == 0 ? "ALL PASS" : std::to_string (failures) + " FAILED") << std::endl;
    return failures == 0 ? 0 : 1;
}
