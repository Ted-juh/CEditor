// Ctrl49ScreenLabTests — what the CTRL49 screen lab sends its pages (Ctrl49ScreenLab.h), and how
// its preset mode loads a design (Ctrl49ScreenLabPreset.h). No keyboard: the payloads' shapes,
// the maths the device cannot do, one golden envelope that the browser preview
// (CE/web/browser-checks/ctrl49ScreenLab.mjs) asserts too, so the preview renders exactly the
// bytes the tool sends, and the preset loader's rules, run over every committed design.

#include "ControlSurface/Ctrl49ScreenLab.h"
#include "ControlSurface/Ctrl49ScreenLabPreset.h"

#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>

namespace
{
namespace lab = ceditor::ctrl49::lab;

int failures = 0;

void check (bool cond, const std::string& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

// buildEnvelope (32, 64, 80, 40): shared with the browser check. If this changes on purpose,
// change it there too — the two are the proof that preview and hardware get the same bytes.
const ceditor::ctrl49::Bytes kGoldenEnvelope {
    0, 41, 69, 89, 102, 111, 118, 122, 125, 127, 129, 130, 121, 114, 109, 104, 100, 97, 94, 92, 91,
    89, 88, 87, 86, 86, 85, 85, 85, 84, 84, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83,
    83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83,
    83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83, 83,
    83, 83, 83, 83, 83, 61, 45, 33, 24, 18, 13, 10, 7, 5, 4, 3, 2, 11, 30, 97, 83, 5, 49, 48, 32,
    109, 115, 6, 49, 48, 52, 32, 109, 115, 4, 54, 51, 32, 37, 5, 49, 56, 32, 109, 115 };
} // namespace

int main()
{
    std::cout << "CTRL49 screen lab payloads" << std::endl;

    {   // --- the showcase frame ------------------------------------------------------------
        const auto frame = lab::buildShowcaseFrame (2, 300, { 0, 10, 127, 200, -5, 64, 64, 64 },
                                                    3, 7, 12, 99, 0b10000001);
        check (frame.size() == 16, "a showcase frame is 16 bytes");
        check (frame[0] == 2 && frame[1] == (300 & 0xFF), "page, then the frame counter's low byte");
        check (frame[2] == 0 && frame[4] == 127 && frame[5] == 127 && frame[6] == 0,
               "encoders are clamped to 0..127");
        check (frame[10] == 3 && frame[11] == 7, "then the last encoder moved and the playhead");
        check (frame[13] == lab::kVuFrames - 1, "a needle frame past the strip is pinned to its last frame");
        check (frame[14] == 0b10000001, "then the lit pads as a bitmask");
        check (frame[15] == (300 >> 8), "and last the frame counter's high byte, so a loop never jumps at 255");
        check (lab::buildShowcaseFrame (9, 0, {}, 0, 0, 0, 0, 0)[0] == lab::kShowcasePages - 1,
               "and a page past the end is the last page");
    }

    {   // --- the animation page's clock -------------------------------------------------
        check (lab::kShowcasePageNames[lab::kAnimationPage] == std::string ("ANIMATION"),
               "the animation page is the showcase's last");
        check (lab::animationFps (0) == 5 && lab::animationFps (127) == 30,
               "its E1 sets 5 to 30 redraws per second");
        check (lab::showcaseIntervalMs (lab::kAnimationPage, 127) == 33
                 && lab::showcaseIntervalMs (0, 127) == 100,
               "which only the animation page follows; the others redraw at the proven 10");
    }

    {   // --- the envelope ------------------------------------------------------------------
        check (lab::buildEnvelope (32, 64, 80, 40) == kGoldenEnvelope,
               "the envelope for (32, 64, 80, 40) is the golden the browser check also asserts");

        const auto env = lab::buildEnvelope (20, 60, 100, 50);
        bool inRange = true;
        for (int c = 0; c < lab::kEnvelopeColumns; ++c)
            inRange = inRange && env[(std::size_t) c] <= lab::kEnvelopeTop;
        check (inRange, "every column fits the graph");
        const int attackEnd = env[110], decayEnd = env[111], releaseStart = env[112], sustain = env[113];
        check (0 < attackEnd && attackEnd < decayEnd && decayEnd < releaseStart
                 && releaseStart < lab::kEnvelopeColumns,
               "the breakpoints come in order: attack, decay, release");
        bool rising = true;
        for (int c = 1; c < attackEnd; ++c)
            rising = rising && env[(std::size_t) c] >= env[(std::size_t) c - 1];
        check (rising, "the attack only rises");
        check (sustain == (int) std::lround (100 / 127.0 * lab::kEnvelopeTop)
                 && env[(std::size_t) decayEnd + 2] == sustain,
               "the sustain holds at its level");
        check (env[lab::kEnvelopeColumns - 1] < 10, "and the release falls back towards zero");

        const auto slow = lab::buildEnvelope (127, 127, 64, 127);
        check (slow[110] < slow[111] && slow[111] < slow[112],
               "the longest stages still fit, in order, with room left for the sustain");

        check (lab::envelopeTimeText (0) == "1 ms" && lab::envelopeTimeText (127) == "10.0 s",
               "stage times run from 1 ms to 10 s");
        check (lab::envelopeMilliseconds (64) > 90.0 && lab::envelopeMilliseconds (64) < 120.0,
               "exponentially, so the middle of the knob is about a tenth of a second");
    }

    {   // --- the meters --------------------------------------------------------------------
        check (lab::vuFrame (0.0) == 0 && lab::vuFrame (1.0e-6) == 0, "silence rests the needle");
        check (lab::vuFrame (1.0) == 41, "0 dB sits most of the way up, as on a VU");
        check (lab::vuFrame (10.0) == lab::kVuFrames - 1, "and too much pins it");
        bool moves = false;
        for (int f = 1; f < 40; ++f)
            moves = moves || lab::vuFrame (lab::demoLevel (0, f, 90)) != lab::vuFrame (lab::demoLevel (0, 0, 90));
        check (moves, "the demo signal moves the needle");
        check (lab::demoLevel (0, 7, 0) == 0.0, "and gain 0 silences it");
    }

    {   // --- the stress page ---------------------------------------------------------------
        const auto load = lab::stressLoad ({ 127, 127, 127, 127, 127, 127, 0, 0 });
        check (load.rects == 2032 && load.images == 1016 && load.texts == 127,
               "the encoders reach 2032 rects, 1016 sprites and 127 texts per redraw");
        check (load.fullScreens == 7 && load.memoryBlocks == lab::kStressMemoryBlocks && load.fps == 30,
               "7 full-screen blits, every memory block, 30 redraws per second");
        const auto idle = lab::stressLoad ({ 0, 0, 0, 0, 0, 0, 0, 0 });
        check (idle.rects == 0 && idle.memoryBlocks == 0 && idle.fps == 1, "and at rest, nothing at 1 per second");
        check (lab::stressLoad ({ 0, 0, 0, 0, 0, 39, 0, 0 }).fps == 9, "the lab starts at about 10 per second");

        const auto frame = lab::buildStressFrame (load, 0x1234);
        check (frame.size() == 8 && frame[0] == 127 && frame[1] == 127 && frame[6] == 0x12 && frame[7] == 0x34,
               "a stress frame carries the load in units the page multiplies back, and a 16-bit counter");
        check (lab::describe (load).find ("2032 rects") != std::string::npos
                 && lab::describe (load).find ("95460 draw calls/s") != std::string::npos,
               "and the console line says what the screen was asked for");
    }

    {   // --- preset mode: the manifest's rules -------------------------------------------------
        const std::string good =
            "; a comment\n[Preset]\nversion=1\nname=Test\nwidth=480\nheight=272\nlua=Skin.lua\npages=2\n"
            "envelopePage=1\nfps=15\nassets=1\n\n[Asset0]\nid=576\nfile=panels.png\n\n"
            "[Page0]\ntitle=One\nencoders=4\ne1=1\ne2=2\ne3=3\ne4=4\ne5=5\ne6=6\ne7=7\ne8=127\n"
            "[Page1]\ntitle=Two\nencoders=8\ne1=0\ne2=0\ne3=0\ne4=0\ne5=0\ne6=0\ne7=0\ne8=0\n";
        const auto parsed = lab::parsePreset (good);
        check (parsed.preset && parsed.errors.empty(), "a manifest that keeps every rule loads");
        check (parsed.preset && parsed.preset->name == "Test" && parsed.preset->pages == 2
                 && parsed.preset->envelopePage == 1 && parsed.preset->fps == 15 && parsed.preset->lua == "Skin.lua",
               "with its name, pages, envelope page, rate and page");
        check (parsed.preset && parsed.preset->assets.size() == 1 && parsed.preset->assets[0].id == 576
                 && parsed.preset->assets[0].file == "panels.png",
               "its assets");
        check (parsed.preset && parsed.preset->pageList[0].title == "One" && parsed.preset->pageList[0].encoders == 4
                 && parsed.preset->pageList[0].values[0] == 1 && parsed.preset->pageList[0].values[7] == 127,
               "and each page's title, encoder count and where its encoders start");

        std::string crlf;
        for (const char c : good)
            crlf += c == '\n' ? std::string ("\r\n") : std::string (1, c);
        check (lab::parsePreset (crlf).preset.has_value(), "Windows line endings read the same");

        const auto broken = [&good] (const std::string& from, const std::string& to)
        {
            auto text = good;
            text.replace (text.find (from), from.size(), to);
            return lab::parsePreset (text);
        };
        const auto refuses = [&] (const std::string& from, const std::string& to, const std::string& why)
        {
            const auto result = broken (from, to);
            bool named = false;
            for (const auto& error : result.errors)
                named = named || error.find (why) != std::string::npos;
            auto label = "refused: " + from + " -> " + (to.empty() ? std::string ("nothing") : to);
            if (const auto newline = label.find ('\n'); newline != std::string::npos)
                label.erase (newline, 1);
            check (! result.preset && named, label + " (" + why + ")");
        };
        refuses ("version=1", "version=2", "version");
        refuses ("width=480", "width=320", "480 x 272");
        refuses ("pages=2", "pages=7", "pages must be 1-6");
        refuses ("pages=2", "pages=0", "pages must be 1-6");
        refuses ("envelopePage=1", "envelopePage=2", "envelopePage");
        refuses ("envelopePage=1", "envelopePage=-2", "envelopePage");
        check (broken ("envelopePage=1", "envelopePage=-1").preset.has_value(), "envelopePage=-1 is a preset with no envelope page");
        refuses ("fps=15", "fps=4", "fps must be 5-30");
        refuses ("fps=15", "fps=31", "fps must be 5-30");
        refuses ("lua=Skin.lua", "lua=../Skin.lua", "beside the manifest");
        refuses ("lua=Skin.lua", "lua=sub/Skin.lua", "beside the manifest");
        refuses ("id=576", "id=1024", "512-1023");
        refuses ("id=576", "id=511", "512-1023");
        refuses ("id=576", "id=257", "512-1023");
        refuses ("assets=1", "assets=0", "assets must be 1-8");
        refuses ("assets=1", "assets=9", "assets must be 1-8");
        refuses ("file=panels.png", "file=art\\panels.png", "beside the manifest");
        refuses ("assets=1", "assets=2", "[Asset1] is missing");
        refuses ("encoders=4", "encoders=9", "encoders must be 1-8");
        refuses ("e8=127", "e8=128", "e8 must be 0-127");
        refuses ("e8=127\n", "", "e8 must be 0-127");
        refuses ("[Page1]", "[Page9]", "[Page1] is missing");
        refuses ("name=Test", "name Test", "unreadable line");
        check (lab::parsePreset ("nothing here").errors.size() >= 1 && ! lab::parsePreset ("[Other]\n").preset,
               "and text with no [Preset] is not a preset");

        auto twice = good;
        twice.replace (twice.find ("assets=1"), 8, "assets=2");
        twice.replace (twice.find ("[Page0]"), 7, "[Asset1]\nid=576\nfile=other.png\n[Page0]");
        check (! lab::parsePreset (twice).preset, "two assets cannot share an id");
    }

    {   // --- preset mode: PNGs and memory ---------------------------------------------------
        ceditor::ctrl49::Bytes header { 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 'I', 'H', 'D', 'R',
                                        0, 0, 0x01, 0xE0, 0, 0, 0x03, 0x30 };
        const auto size = lab::pngSize (header);
        check (size && size->first == 480 && size->second == 816, "a PNG's size comes from its header");
        header[1] = 'X';
        check (! lab::pngSize (header), "and something that is not a PNG has none");

        // The files beside a manifest: the Lua's size and each PNG's sides are held to the rules.
        const auto folder = std::filesystem::temp_directory_path() / "ctrl49-preset-files-test";
        std::filesystem::remove_all (folder);
        std::filesystem::create_directories (folder);
        const auto write = [&folder] (const std::string& name, const ceditor::ctrl49::Bytes& bytes)
        {
            std::ofstream (folder / name, std::ios::binary).write ((const char*) bytes.data(), (std::streamsize) bytes.size());
        };
        const auto manifest = folder / "Design.ctrl49preset";
        {
            std::ofstream (manifest) << "[Preset]\nversion=1\nname=Files\nwidth=480\nheight=272\nlua=Skin.lua\npages=1\n"
                                        "envelopePage=-1\nfps=10\nassets=1\n[Asset0]\nid=576\nfile=panels.png\n"
                                        "[Page0]\ntitle=One\nencoders=8\ne1=0\ne2=0\ne3=0\ne4=0\ne5=0\ne6=0\ne7=0\ne8=0\n";
        }
        const auto saysSo = [] (const lab::LoadedPreset& loaded, const std::string& why)
        {
            for (const auto& error : loaded.errors)
                if (error.find (why) != std::string::npos)
                    return ! loaded.preset;
            return false;
        };
        auto png = header;
        png[1] = 'P';
        write ("panels.png", png);
        write ("Skin.lua", ceditor::ctrl49::Bytes (100, 'x'));
        check (lab::loadPreset (manifest).preset.has_value(), "a small Lua and a PNG beside the manifest load");
        write ("Skin.lua", {});
        check (saysSo (lab::loadPreset (manifest), "1-65536 bytes"), "an empty Lua is refused");
        write ("Skin.lua", ceditor::ctrl49::Bytes (65537, 'x'));
        check (saysSo (lab::loadPreset (manifest), "1-65536 bytes"), "and so is one over 64 KiB");
        write ("Skin.lua", ceditor::ctrl49::Bytes (65536, 'x'));
        png[16] = 0; png[17] = 0; png[18] = 0x23; png[19] = 0x29;     // 9001 px wide
        write ("panels.png", png);
        check (saysSo (lab::loadPreset (manifest), "outside 1-8192"), "a PNG over 8192 px a side is refused");
        std::filesystem::remove_all (folder);

        lab::Preset preset;
        preset.assets.push_back ({ 576, "a.png", 480, 816 });
        preset.assets.push_back ({ 578, "b.png", 80, 5120 });
        check (lab::presetDecodedBytes (preset) == (480u * 816u + 80u * 5120u) * 4u,
               "decoded memory is counted at four bytes a pixel");
    }

    {   // --- preset mode: every committed design ---------------------------------------------
        // The tool's own loader over the folders the browser checks render: a design that a
        // check passes and the tool would refuse (or the other way round) fails here.
        int designs = 0, loads = 0;
        const auto tryLoad = [&] (const std::filesystem::path& manifest)
        {
            ++designs;
            const auto loaded = lab::loadPreset (manifest);
            if (loaded.preset && ! loaded.lua.empty() && loaded.pngs.size() == loaded.preset->assets.size())
                ++loads;
            else
                for (const auto& error : loaded.errors)
                    std::cout << "        " << manifest.parent_path().filename().string() << ": " << error << std::endl;
        };
        for (const auto* folder : { "era-presets", "feature-mockups", "design-presets" })
            for (const auto& entry : std::filesystem::directory_iterator (std::filesystem::path (CTRL49_LAB_DIR) / folder))
                if (const auto manifest = entry.path() / "Design.ctrl49preset"; std::filesystem::exists (manifest))
                    tryLoad (manifest);
        tryLoad (std::filesystem::path (CTRL49_LAB_DIR) / "machined-metal/MachinedMetal.ctrl49preset");
        check (designs >= 18, "the screen lab holds the era designs, the feature mockups, the design presets and "
                                 "Machined Metal (" + std::to_string (designs) + " designs)");
        check (loads == designs, "and the preset mode loads every one, its Lua and its PNGs");

        const auto rig = lab::loadPreset (std::filesystem::path (CTRL49_LAB_DIR) / "feature-mockups/hostage-rig/Design.ctrl49preset");
        check (rig.preset && rig.preset->pages == 5 && rig.preset->assets.size() == 3
                 && lab::describe (*rig.preset, rig.lua.size(), 0).find ("5 pages at 15 redraws/s") != std::string::npos,
               "the console line says what a design will ask of the keyboard");
        check (lab::loadPreset (std::filesystem::path (CTRL49_LAB_DIR) / "no-such/Design.ctrl49preset").errors.size() == 1,
               "and a manifest that is not there says so");
    }

    std::cout << "-------------------" << std::endl;
    std::cout << (failures == 0 ? "ALL PASS" : std::to_string (failures) + " FAILED") << std::endl;
    return failures == 0 ? 0 : 1;
}
