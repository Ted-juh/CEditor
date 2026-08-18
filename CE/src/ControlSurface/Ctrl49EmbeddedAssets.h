// Embedded assets for the self-contained CTRL49 bridge exe: the Lua display pages, the
// knob filmstrip PNG, the default assignment/preset bank, and the GAIA device profile.
// Definitions are generated at build time by tools/ctrl49/embed_assets.cmake from the
// authoritative files in tools/ctrl49 and CE/profiles.

#pragma once

namespace ceditor::ctrl49::assets
{

extern const unsigned char kKnobPageLua[];        extern const unsigned int kKnobPageLuaSize;
extern const unsigned char kPresetListLua[];      extern const unsigned int kPresetListLuaSize;
extern const unsigned char kKnobStripPng[];       extern const unsigned int kKnobStripPngSize;
extern const unsigned char kDefaultAssignment[];  extern const unsigned int kDefaultAssignmentSize;
extern const unsigned char kDefaultPresetBank[];  extern const unsigned int kDefaultPresetBankSize;
extern const unsigned char kGaiaProfileJson[];    extern const unsigned int kGaiaProfileJsonSize;

} // namespace ceditor::ctrl49::assets
