// Ctrl49ScreenLabPreset — the screen lab's preset mode: a set of pages designed elsewhere, as a
// folder holding a manifest, a Lua page and its PNGs, loaded and run on the keyboard.
//
// The designs in tools/ctrl49/screen-lab/era-presets and feature-mockups are presets. The
// manifest (Design.ctrl49preset) is INI:
//
//   [Preset]  version=1, name, width=480, height=272, lua=<file>, pages=1..6,
//             envelopePage=<one of the pages>, fps=5..30, assets=<how many>
//   [AssetN]  id=0..1023 (not the page's own 0x0101), file=<a PNG beside the manifest>
//   [PageN]   title, encoders=1..8, e1..e8=0..127 (where each encoder starts on that page)
//
// The page is sent what the showcase is sent: set_mode, set_frame (buildShowcaseFrame's bytes)
// every redraw at the manifest's rate, and set_envelope (buildEnvelope from E1-E4) whenever those
// change on the envelope page. CE/web/browser-checks/ctrl49EraPresets.mjs holds every committed
// design to these same rules and renders it from the same bytes; keep the two in step.
//
// Pure std. parsePreset reads text and nothing else; loadPreset adds the files beside the
// manifest (the Lua, and each PNG's size for the memory guard), so the test runs the tool's own
// loader over every committed design.

#pragma once

#include "Ctrl49Protocol.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <map>
#include <optional>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

namespace ceditor::ctrl49::lab
{

inline constexpr int kPresetWidth = 480;
inline constexpr int kPresetHeight = 272;
inline constexpr int kPresetMaxPages = 6;            // what buildShowcaseFrame's page byte reaches
inline constexpr int kPresetMinFps = 5;
inline constexpr int kPresetMaxFps = 30;
inline constexpr int kPresetLuaObjectId = 0x0101;    // the session's own id for the page
// A software guard on what the PNGs decode to, counted at four bytes a pixel. It is not the
// device's limit, which nobody has measured; it stops a design nobody meant to be that large.
inline constexpr std::size_t kPresetMemoryGuard = 8u * 1024u * 1024u;

struct PresetAsset
{
    int id = 0;
    std::string file;
    int width = 0;       // filled in by loadPreset
    int height = 0;
};

struct PresetPage
{
    std::string title;
    int encoders = 8;
    std::array<int, 8> values {};
};

struct Preset
{
    std::string name;
    std::string lua;
    int pages = 0;
    int envelopePage = 0;
    int fps = 10;
    std::vector<PresetAsset> assets;
    std::vector<PresetPage> pageList;
};

struct PresetResult
{
    std::optional<Preset> preset;      // set when there are no errors
    std::vector<std::string> errors;   // every rule broken, not only the first
};

namespace detail
{
inline std::string trim (std::string_view s)
{
    const auto first = s.find_first_not_of (" \t\r");
    if (first == std::string_view::npos)
        return {};
    const auto last = s.find_last_not_of (" \t\r");
    return std::string (s.substr (first, last - first + 1));
}

inline std::optional<int> integer (const std::string& s)
{
    if (s.empty() || s.size() > 9)
        return std::nullopt;
    std::size_t i = s[0] == '-' ? 1 : 0;
    if (i == s.size())
        return std::nullopt;
    int value = 0;
    for (; i < s.size(); ++i)
    {
        if (s[i] < '0' || s[i] > '9')
            return std::nullopt;
        value = value * 10 + (s[i] - '0');
    }
    return s[0] == '-' ? -value : value;
}

// A file named in a manifest must sit beside it: a bare name, no folders, no way up.
inline bool besideManifest (const std::string& file)
{
    return ! file.empty() && file.find_first_of ("/\\") == std::string::npos
        && file.find ("..") == std::string::npos;
}
} // namespace detail

/** The manifest's rules, from its text alone. Every broken rule is reported. */
inline PresetResult parsePreset (std::string_view text)
{
    using Section = std::map<std::string, std::string>;
    std::map<std::string, Section> sections;
    PresetResult result;
    auto& errors = result.errors;

    std::string current;
    std::size_t start = 0;
    while (start <= text.size())
    {
        const auto end = text.find ('\n', start);
        const auto line = detail::trim (text.substr (start, end == std::string_view::npos ? std::string_view::npos : end - start));
        start = end == std::string_view::npos ? text.size() + 1 : end + 1;
        if (line.empty() || line[0] == ';')
            continue;
        if (line.front() == '[' && line.back() == ']')
        {
            current = line.substr (1, line.size() - 2);
            sections[current];
            continue;
        }
        const auto equals = line.find ('=');
        if (equals == std::string::npos || current.empty())
        {
            errors.push_back ("unreadable line \"" + line + "\"");
            continue;
        }
        sections[current][detail::trim (line.substr (0, equals))] = detail::trim (line.substr (equals + 1));
    }

    const auto found = sections.find ("Preset");
    if (found == sections.end())
    {
        errors.push_back ("no [Preset] section");
        return result;
    }
    const auto& head = found->second;
    const auto value = [] (const Section& s, const std::string& key) -> std::string
    {
        const auto it = s.find (key);
        return it == s.end() ? std::string() : it->second;
    };
    const auto number = [&] (const Section& s, const std::string& key) { return detail::integer (value (s, key)); };

    Preset preset;
    preset.name = value (head, "name");
    preset.lua = value (head, "lua");
    if (number (head, "version") != 1)
        errors.push_back ("version must be 1");
    if (number (head, "width") != kPresetWidth || number (head, "height") != kPresetHeight)
        errors.push_back ("the screen is 480 x 272");
    const auto pages = number (head, "pages");
    if (! pages || *pages < 1 || *pages > kPresetMaxPages)
        errors.push_back ("pages must be 1-6");
    else
        preset.pages = *pages;
    const auto envelope = number (head, "envelopePage");
    if (! envelope || *envelope < 0 || (preset.pages > 0 && *envelope >= preset.pages))
        errors.push_back ("envelopePage must be one of the pages (0 to pages - 1)");
    else
        preset.envelopePage = *envelope;
    const auto fps = number (head, "fps");
    if (! fps || *fps < kPresetMinFps || *fps > kPresetMaxFps)
        errors.push_back ("fps must be 5-30");
    else
        preset.fps = *fps;
    if (! detail::besideManifest (preset.lua))
        errors.push_back ("lua must name a file beside the manifest");

    const auto assets = number (head, "assets");
    if (! assets || *assets < 0 || *assets > 64)
        errors.push_back ("assets must be a count, 0-64");
    for (int i = 0; assets && i < *assets && i <= 64; ++i)
    {
        const auto section = sections.find ("Asset" + std::to_string (i));
        if (section == sections.end())
        {
            errors.push_back ("[Asset" + std::to_string (i) + "] is missing");
            continue;
        }
        PresetAsset asset;
        const auto id = number (section->second, "id");
        asset.file = value (section->second, "file");
        if (! id || *id < 0 || *id > kMaxObjectTableId || *id == kPresetLuaObjectId)
            errors.push_back ("[Asset" + std::to_string (i) + "] id must be 0-1023, and not the page's own 257");
        else
        {
            for (const auto& other : preset.assets)
                if (other.id == *id)
                    errors.push_back ("[Asset" + std::to_string (i) + "] id " + std::to_string (*id) + " is used twice");
            asset.id = *id;
        }
        if (! detail::besideManifest (asset.file))
            errors.push_back ("[Asset" + std::to_string (i) + "] file must name a PNG beside the manifest");
        preset.assets.push_back (asset);
    }

    for (int p = 0; p < preset.pages; ++p)
    {
        const auto label = "[Page" + std::to_string (p) + "]";
        const auto section = sections.find ("Page" + std::to_string (p));
        if (section == sections.end())
        {
            errors.push_back (label + " is missing");
            continue;
        }
        PresetPage page;
        page.title = value (section->second, "title");
        if (page.title.empty())
            errors.push_back (label + " needs a title");
        const auto encoders = number (section->second, "encoders");
        if (! encoders || *encoders < 1 || *encoders > 8)
            errors.push_back (label + " encoders must be 1-8");
        else
            page.encoders = *encoders;
        for (int e = 0; e < 8; ++e)
        {
            const auto v = number (section->second, "e" + std::to_string (e + 1));
            if (! v || *v < 0 || *v > 127)
                errors.push_back (label + " e" + std::to_string (e + 1) + " must be 0-127");
            else
                page.values[(std::size_t) e] = *v;
        }
        preset.pageList.push_back (page);
    }

    if (errors.empty())
        result.preset = preset;
    return result;
}

/** A PNG's width and height from its header, or nullopt when it is not a PNG. */
inline std::optional<std::pair<int, int>> pngSize (const Bytes& png)
{
    static constexpr std::uint8_t signature[8] { 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A };
    if (png.size() < 24 || ! std::equal (std::begin (signature), std::end (signature), png.begin()))
        return std::nullopt;
    const auto word = [&png] (std::size_t at)
    {
        return (int) ((std::uint32_t) png[at] << 24 | (std::uint32_t) png[at + 1] << 16
                      | (std::uint32_t) png[at + 2] << 8 | (std::uint32_t) png[at + 3]);
    };
    return std::make_pair (word (16), word (20));
}

/** What a preset's images decode to, counted at four bytes a pixel. */
inline std::size_t presetDecodedBytes (const Preset& preset)
{
    std::size_t total = 0;
    for (const auto& asset : preset.assets)
        total += (std::size_t) asset.width * (std::size_t) asset.height * 4u;
    return total;
}

struct LoadedPreset
{
    std::optional<Preset> preset;
    std::vector<std::string> errors;
    Bytes lua;                                  // the page's source
    std::vector<std::pair<int, Bytes>> pngs;    // id, file bytes, in manifest order
};

/** A manifest and everything beside it: its rules, then the Lua and the PNGs (each must be a
    PNG), and the memory guard over what they decode to. */
inline LoadedPreset loadPreset (const std::filesystem::path& manifest)
{
    LoadedPreset loaded;
    const auto read = [] (const std::filesystem::path& path) -> std::optional<Bytes>
    {
        std::ifstream file (path, std::ios::binary);
        if (! file)
            return std::nullopt;
        std::stringstream buffer;
        buffer << file.rdbuf();
        const auto data = buffer.str();
        return Bytes (data.begin(), data.end());
    };
    const auto text = read (manifest);
    if (! text)
    {
        loaded.errors.push_back ("could not read " + manifest.string());
        return loaded;
    }
    auto parsed = parsePreset (std::string_view ((const char*) text->data(), text->size()));
    loaded.errors = parsed.errors;
    if (! parsed.preset)
        return loaded;

    auto preset = *parsed.preset;
    const auto folder = manifest.parent_path();
    if (const auto lua = read (folder / preset.lua))
        loaded.lua = *lua;
    else
        loaded.errors.push_back ("lua: " + preset.lua + " is not beside the manifest");
    for (auto& asset : preset.assets)
    {
        const auto png = read (folder / asset.file);
        if (! png)
        {
            loaded.errors.push_back (asset.file + " is not beside the manifest");
            continue;
        }
        const auto size = pngSize (*png);
        if (! size)
        {
            loaded.errors.push_back (asset.file + " is not a PNG");
            continue;
        }
        asset.width = size->first;
        asset.height = size->second;
        loaded.pngs.emplace_back (asset.id, *png);
    }
    if (presetDecodedBytes (preset) > kPresetMemoryGuard)
        loaded.errors.push_back ("the images decode to " + std::to_string (presetDecodedBytes (preset) / 1024)
                                 + " KiB, over the 8 MiB guard");
    if (loaded.errors.empty())
        loaded.preset = preset;
    return loaded;
}

/** One line a preset's load can be judged by before anything is sent. */
inline std::string describe (const Preset& preset, std::size_t luaBytes, std::size_t pngBytes)
{
    return preset.name + ": " + std::to_string (preset.pages) + " pages at " + std::to_string (preset.fps)
         + " redraws/s, Lua " + std::to_string (luaBytes / 1024) + " KB, PNGs " + std::to_string (pngBytes / 1024)
         + " KB, decoded " + std::to_string (presetDecodedBytes (preset) / 1024) + " KiB at 4 bytes a pixel";
}

} // namespace ceditor::ctrl49::lab
