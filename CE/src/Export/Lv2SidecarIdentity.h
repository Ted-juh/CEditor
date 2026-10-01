#pragma once

#include <string>

#include "Export/PanelIdentitySidecar.h"

/**
 * The LV2 half of the template player: a prebuilt .lv2 that reports the identity of the panel
 * beside it, the way Vst3SidecarIdentity.h and ClapSidecarIdentity.h do for the other two.
 *
 * The other end is a patch inside vendored JUCE (JUCE/VENDORED.md, patch 4): the LV2 client's
 * compile-time `JucePlugin_LV2URI`, name, vendor and version become calls into this header, behind
 * `CEDITOR_SIDECAR_IDENTITY`. As with the other hooks, everything that can live on this side of the
 * line does.
 *
 * WHAT AN LV2 IS KNOWN BY. A URI, and nothing else: `lv2_descriptor` reports it, every derived URI
 * (the UI, the state keys, the parameters' IRIs, the presets) hangs off it, and the bundle's Turtle
 * files declare it. The compiling exporter passes `urn:ceditor:<clapId>` as CE_LV2_URI; the same
 * string is derived here from the panel, so a session saved against either build finds the plugin.
 *
 * THE TURTLE FILES ARE WRITTEN BY THE PLUG-IN. JUCE generates manifest.ttl, dsp.ttl and ui.ttl by
 * loading the built binary (juce_lv2_helper) and calling its own writers, which read the live
 * processor: its URI, its name, its parameters. So a template's files are regenerated per export by
 * running the same helper over the copied binary WITH THE PANEL BESIDE IT, and come out with the
 * panel's URI and the panel's parameters. No text is rewritten anywhere; the exporter's job is to
 * put the panel in place first.
 *
 * WITHOUT A PANEL. The compiled identity (`urn:ceditor:default`, the template's name). Not "no
 * plugin", as the CLAP does: the template build itself generates its Turtle files from the bare
 * binary, and a descriptor that refused would fail that build. A template .lv2 copied without its
 * panel therefore reports the template's own URI, which is documented, and which the exporter
 * never produces.
 *
 * WHERE THE PANEL IS. An .lv2 is a folder of its own, with the binary at its top, so the panel sits
 * beside the binary and PanelIdentitySidecar.h's lookup finds it there with no special case.
 */
namespace ceditor
{

/** The LV2 URI a panel gets, from the same identity the CLAP id comes from. Pure. */
inline std::string lv2UriFor (const exporter::SidecarIdentity& identity)
{
    if (! identity.valid || identity.identity.clapId.isEmpty())
        return {};
    return "urn:ceditor:" + identity.identity.clapId.toStdString();
}

struct Lv2SidecarIdentity
{
    bool valid = false;
    // Owned here: the LV2 descriptor holds `const char*` into them for the life of the module.
    std::string uri, name, vendor, version;
};

/** The LV2 identity for a derived panel identity. Pure, so a test can pin it without a module. */
inline Lv2SidecarIdentity lv2IdentityFrom (const exporter::SidecarIdentity& identity)
{
    Lv2SidecarIdentity out;
    out.uri = lv2UriFor (identity);
    if (out.uri.empty())
        return out;
    out.valid = true;
    out.name = identity.identity.productName.toStdString();
    out.vendor = identity.identity.vendorName.toStdString();
    out.version = identity.identity.version.toStdString();
    return out;
}

/** Read once, the first time it is asked for, and fixed for the life of the module. */
inline const Lv2SidecarIdentity& lv2SidecarIdentity()
{
    static const Lv2SidecarIdentity identity = lv2IdentityFrom (exporter::readIdentityBesideModule (
        juce::File::getSpecialLocation (juce::File::currentExecutableFile)));
    return identity;
}

/*
 * Each of these takes the compiled value and answers with it when there is no panel. They return
 * `const char*` into storage that lives as long as the module, because the LV2 descriptor keeps the
 * pointer. Each is read once: the first caller's `compiled` is the one kept, which is fine, since
 * the compiled values are constants.
 */
inline const char* lv2PluginUri (const char* compiled)
{
    static const std::string value = lv2SidecarIdentity().valid ? lv2SidecarIdentity().uri : std::string (compiled);
    return value.c_str();
}

inline const char* lv2PluginName (const char* compiled)
{
    static const std::string value = lv2SidecarIdentity().valid ? lv2SidecarIdentity().name : std::string (compiled);
    return value.c_str();
}

inline const char* lv2PluginVendor (const char* compiled)
{
    static const std::string value = lv2SidecarIdentity().valid ? lv2SidecarIdentity().vendor : std::string (compiled);
    return value.c_str();
}

inline const char* lv2PluginVersion (const char* compiled)
{
    static const std::string value = lv2SidecarIdentity().valid ? lv2SidecarIdentity().version : std::string (compiled);
    return value.c_str();
}

} // namespace ceditor
