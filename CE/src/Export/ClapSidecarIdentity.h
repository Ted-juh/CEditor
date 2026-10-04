#pragma once

#include <string>

#include "Export/PanelIdentitySidecar.h"

/**
 * The CLAP half of the template player: a prebuilt .clap that reports the identity of the panel it
 * was copied with, the way Vst3SidecarIdentity.h does for the VST3.
 *
 * The other end is a patch inside the vendored clap-juce-extensions wrapper
 * (CE/thirdparty/clap-juce-extensions/VENDORED.md). As with the VST3 hook, everything that can live
 * on this side of the line does, so the patch stays a few lines and survives an update of the
 * wrapper.
 *
 * WHAT A CLAP REPORTS. A CLAP plugin is known to a host by the descriptor its factory hands out: an
 * id, a name, a vendor and a version, as C strings. The wrapper's descriptor is a static built from
 * compile-time defines, so every copy of one binary would claim to be the same plugin. The fix is to
 * fill those fields at `clap_entry.init`, the first call a host makes, from the panel beside the
 * module, using the same derivation the compiling exporter uses — `identity.clapId` is the id a
 * per-panel build of the same panel bakes, so a session saved against either finds the plugin.
 *
 * WHERE THE PANEL IS. A CLAP on Windows and Linux is one file, and the CLAP folder is shared by
 * every CLAP a user has. A panel loose in that folder would be ambiguous, so the template exporter
 * writes each CLAP into a folder of its own — `<Name>/<Name>.clap` beside `panel.cepanel` and the
 * device profiles — and hosts find it there because the CLAP spec has them search CLAP folders
 * recursively (clap/entry.h). The lookup is PanelIdentitySidecar.h's own: the one .cepanel in the
 * module's directory.
 *
 * WITHOUT A PANEL, NO PLUGIN. A template copied without its panel would otherwise report the
 * template's compiled-in identity, and every such copy would be the same plugin to a host — the
 * collision this exists to prevent. So a template build with no panel beside it reports no plugins
 * at all (`clapSidecarPluginCount`), which a host shows as a file that contains nothing rather than
 * as a second copy of something else.
 */
namespace ceditor
{

struct ClapSidecarDescriptor
{
    bool valid = false;
    // Owned here, because the descriptor holds `const char*` into them for the life of the module.
    std::string id, name, vendor, version;
};

/** The descriptor fields for a derived identity. Pure, so a test can pin it without a module. */
inline ClapSidecarDescriptor clapDescriptorFrom (const exporter::SidecarIdentity& identity)
{
    ClapSidecarDescriptor out;
    if (! identity.valid || identity.identity.clapId.isEmpty())
        return out;

    out.valid = true;
    out.id = identity.identity.clapId.toStdString();
    out.name = identity.identity.productName.toStdString();
    out.vendor = identity.identity.vendorName.toStdString();
    out.version = identity.identity.version.toStdString();
    return out;
}

/** Read once, the first time it is asked for, and fixed for the life of the module. */
inline const ClapSidecarDescriptor& clapSidecarDescriptor()
{
    static const ClapSidecarDescriptor descriptor = clapDescriptorFrom (exporter::readIdentityBesideModule (
        juce::File::getSpecialLocation (juce::File::currentExecutableFile)));
    return descriptor;
}

/** One plugin when there is a panel to be, none when there is not. */
inline unsigned clapSidecarPluginCount()
{
    return clapSidecarDescriptor().valid ? 1u : 0u;
}

/**
 * Point the fields of a clap_plugin_descriptor at this module's identity. A template with no panel
 * leaves them as they are (and reports no plugins, above). Templated on the descriptor type so this
 * header needs nothing from CLAP's own headers.
 */
template <typename Descriptor>
void applyClapSidecarIdentity (Descriptor& descriptor)
{
    const auto& sidecar = clapSidecarDescriptor();
    if (! sidecar.valid)
        return;

    descriptor.id = sidecar.id.c_str();
    descriptor.name = sidecar.name.c_str();
    descriptor.vendor = sidecar.vendor.c_str();
    descriptor.version = sidecar.version.c_str();
}

} // namespace ceditor
