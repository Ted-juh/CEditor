#pragma once

// The panel this build loads, in a header of its own so the standalone application can read it
// before there is a processor (PlayerStandaloneApp.cpp names its settings after the panel).

#include <juce_core/juce_core.h>

#ifndef CEDITOR_PLAYER_PANEL_PATH
 #define CEDITOR_PLAYER_PANEL_PATH ""
#endif

#ifndef CEDITOR_SIDECAR_IDENTITY
 #define CEDITOR_SIDECAR_IDENTITY 0
#endif

#if CEDITOR_SIDECAR_IDENTITY
 #include "Export/PanelIdentitySidecar.h"
#endif

/**
 * The panel this build loads.
 *
 * A per-panel build bakes the path and this is that path, exactly as before. A TEMPLATE build --
 * one prebuilt binary copied per panel rather than relinked -- has no meaningful path baked in and
 * finds the panel sitting beside itself instead. See CE/src/Export/PanelIdentitySidecar.h.
 *
 * Behind the guard so a build that does not opt in cannot start reading files next to itself.
 */
static inline juce::File ceditorPlayerPanelFile()
{
   #if CEDITOR_SIDECAR_IDENTITY
    return ceditor::exporter::resolvePlayerPanelFile (CEDITOR_PLAYER_PANEL_PATH);
   #else
    return juce::File (CEDITOR_PLAYER_PANEL_PATH);
   #endif
}
