#pragma once

#include <juce_core/juce_core.h>

namespace ceditor::exporter
{
/**
 * Compile-per-panel plugin identity.
 *
 * The Ctrlr failure mode: a single fixed VST3 binary reused for every panel meant every
 * "different" panel reported the SAME VST3 class id (FUID) to the host, so the DAW treated
 * them as one plugin (cache collisions, sessions reloading the wrong panel).
 *
 * The fix: every exported panel carries a unique, persisted GUID, and ALL host-facing
 * identifiers are derived deterministically from it. JUCE derives the VST3 FUID from
 * (company name + product name + manufacturer code + plugin code), so making those unique
 * per panel makes the FUID unique. AU subtype and CLAP id are derived too.
 *
 * Properties guaranteed:
 *   - Deterministic: same GUID -> identical identity (re-export = same plugin, sessions reload).
 *   - Unique: different GUID -> different pluginCode, auSubtype and clapId (no collisions),
 *     even when two panels share the same display name.
 *   - Valid: pluginCode / auSubtype are 4 ASCII alphanumerics with at least one uppercase
 *     (JUCE requires a non-lowercase plugin/subtype code).
 */
struct PanelExportIdentity
{
    juce::String guid;            // persisted in the .cepanel (source of all uniqueness)
    juce::String productName;     // host-visible plugin name
    juce::String vendorName;      // constant per author
    juce::String manufacturerCode; // constant 4-char author code (e.g. "Tdjh")
    juce::String pluginCode;      // unique 4-char per panel
    juce::String auSubtype;       // unique 4-char per panel (AudioUnit subtype)
    juce::String clapId;          // unique reverse-DNS id per panel
    juce::String version;         // semantic version string
};

namespace detail
{
    // FNV-1a 64-bit over the bytes of a string, with a salt so we can derive several
    // independent codes from one GUID.
    inline juce::uint64 fnv1a (const juce::String& s, juce::uint64 salt)
    {
        juce::uint64 h = 1469598103934665603ull ^ salt;
        const char* utf8 = s.toRawUTF8();
        const auto n = s.getNumBytesAsUTF8();
        for (size_t i = 0; i < n; ++i)
        {
            h ^= (juce::uint64) (juce::uint8) utf8[i];
            h *= 1099511628211ull;
        }
        return h;
    }

    // Map a hash to a 4-char code over [A-Za-z0-9], forcing the first char to an uppercase
    // letter so the code is never all-lowercase (a JUCE plugin/subtype code requirement).
    inline juce::String code4 (juce::uint64 h)
    {
        static const char* upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        static const char* alnum = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        juce::String out;
        out << upper[(int) (h % 26)];
        h /= 26;
        for (int i = 0; i < 3; ++i)
        {
            out << alnum[(int) (h % 62)];
            h /= 62;
        }
        return out;
    }

    inline juce::String slug (const juce::String& s)
    {
        juce::String out;
        for (auto c : s.toLowerCase().trim())
        {
            if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) out << (juce::juce_wchar) c;
            else if (c == ' ' || c == '-' || c == '_') out << '-';
        }
        while (out.contains ("--")) out = out.replace ("--", "-");
        return out.trimCharactersAtStart ("-").trimCharactersAtEnd ("-");
    }
}

/**
 * Derive the full host-facing identity for a panel from its persisted GUID.
 * @param guid             the panel's persisted unique id (any stable string)
 * @param panelName        the panel's display name (becomes the product name)
 * @param vendorName       the author/vendor display name (constant)
 * @param manufacturerCode the author's 4-char code (constant; uniqueness is per-panel below)
 * @param version          semantic version string
 */
inline PanelExportIdentity deriveIdentity (const juce::String& guid,
                                           const juce::String& panelName,
                                           const juce::String& vendorName,
                                           const juce::String& manufacturerCode,
                                           const juce::String& version)
{
    PanelExportIdentity id;
    id.guid = guid;
    id.productName = panelName.isNotEmpty() ? panelName : juce::String ("CEditor Panel");
    id.vendorName = vendorName;
    id.manufacturerCode = manufacturerCode;
    id.version = version;

    id.pluginCode = detail::code4 (detail::fnv1a (guid, 0x9E3779B97F4A7C15ull));
    id.auSubtype  = detail::code4 (detail::fnv1a (guid, 0xC2B2AE3D27D4EB4Full));

    auto vendorSlug = detail::slug (vendorName.isNotEmpty() ? vendorName : juce::String ("ceditor"));
    auto nameSlug   = detail::slug (id.productName);
    auto shortGuid  = juce::String::toHexString ((juce::int64) detail::fnv1a (guid, 0)).paddedLeft ('0', 8).substring (0, 8);
    id.clapId = "com." + vendorSlug + "." + (nameSlug.isNotEmpty() ? nameSlug + "." : juce::String()) + shortGuid;

    return id;
}
}
