// Ctrl49StagePagesTests — the SOUNDCHECK and LAYERS payloads (Ctrl49StagePages.h). No keyboard:
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
    view.songs = { { "Glass Harbour", true, 0, true, -18.4, -3.2 },
                   { "Salt Road", true, 2, false, -120.0, -120.0 },
                   { "Night Bus", false, 0, false, -120.0, -120.0 } };
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
                   { "Brass", 60, 84, 100, 127, -12, true, true, false } };
    view.focused = 1;
    view.held = { { 48, 90 }, { 72, 112 } };
    return view;
}

const c49::Bytes kGoldenSoundcheck {
    3, 0, 3, 1, 1, 1, 1, 1,
    1, 43, 0, 13, 'G', 'l', 'a', 's', 's', ' ', 'H', 'a', 'r', 'b', 'o', 'u', 'r',
    2, 0, 2, 9, 'S', 'a', 'l', 't', ' ', 'R', 'o', 'a', 'd',
    0, 0, 0, 9, 'N', 'i', 'g', 'h', 't', ' ', 'B', 'u', 's',
    25, 'C', 'u', 'r', 'r', 'e', 'n', 't', ' ', 'r', 'i', 'g', ' ', 'a', 't', ' ', 'c', 'h', 'e', 'c', 'k', ' ', 't', 'i', 'm', 'e',
    2, 2,
    35, 'M', 'I', 'D', 'I', ' ', 'o', 'u', 't', 'p', 'u', 't', ' ', 'u', 'n', 'a', 'v', 'a', 'i', 'l', 'a', 'b', 'l', 'e', ':', ' ',
        'U', 'S', 'B', ' ', 'M', 'I', 'D', 'I', ' ', '2',
    32, 'D', 'r', 'i', 'f', 't', 'e', 'r', ':', ' ', 'p', 'l', 'u', 'g', '-', 'i', 'n', ' ', 'f', 'i', 'l', 'e', ' ',
        'i', 's', ' ', 'm', 'i', 's', 's', 'i', 'n', 'g',
    0, 0, 0 };

const c49::Bytes kGoldenLayers {
    2, 0, 2, 1, 36,
    36, 54, 1, 127, 64, 5, 8, 'S', 'u', 'b', ' ', 'B', 'a', 's', 's',
    60, 84, 100, 127, 52, 3, 5, 'B', 'r', 'a', 's', 's',
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
        check (c49::buildSoundcheckPayload (c49::SoundcheckView {}).size() == 14 && c49::buildSoundcheckPayload (c49::SoundcheckView {})[0] == 0,
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
            namesCut = namesCut && cut[at + 3] <= c49::kSoundcheckNameChars;
            at += 4 + cut[at + 3];
        }
        at += 1 + cut[at];
        check (cut[at] == 6 && cut[at + 1] == c49::kSoundcheckProblemLines, "six problems: the count says six, four are sent");
        lineCut = text (cut, at + 2).size() == c49::kSoundcheckLineChars && text (cut, at + 2).ends_with ("...");
        check (namesCut && lineCut, "names stop at 24 characters, problem lines at 44 with \"...\"");

        c49::SoundcheckView odd = goldenSoundcheck();
        odd.songs[0].name = "Caf\xC3\xA9";
        const auto ascii = c49::buildSoundcheckPayload (odd);
        check (ascii[11] == 5 && ascii[15] == '?' && ascii[16] == '?', "anything not ASCII is sent as '?'");
    }

    {   // --- LAYERS ---------------------------------------------------------------------------
        const auto bytes = c49::buildLayersPayload (goldenLayers());
        check (bytes == kGoldenLayers, "the layers payload is the golden the app's test also asserts");
        check (bytes[10] == (1 | 4) && bytes[25] == (1 | 2), "flags: enabled 1, muted 2, from the keyboard 4");
        check (bytes[24] == 64 - 12, "transpose is sent with 64 added");

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
        wild.parts = { { "X", -5, 300, 0, 200, 99, false, false, false } };
        for (int n = 0; n < 30; ++n)
            wild.held.push_back ({ 40 + n, 100 });
        wild.firstKey = 120;
        const auto clamped = c49::buildLayersPayload (wild);
        check (clamped[4] == 127 - 48, "the 49 keys drawn always fit 0-127");
        check (clamped[5] == 0 && clamped[6] == 127 && clamped[8] == 127 && clamped[9] == 127 && clamped[10] == 0,
               "keys, velocities and transpose are clamped; a disabled part has no flags");
        check (clamped[13] == c49::kLayersHeldNotes && clamped.size() == 14u + 2u * c49::kLayersHeldNotes,
               "at most sixteen held notes are sent");
    }

    std::cout << "-------------------" << std::endl;
    std::cout << (failures == 0 ? "ALL PASS" : std::to_string (failures) + " FAILED") << std::endl;
    return failures == 0 ? 0 : 1;
}
