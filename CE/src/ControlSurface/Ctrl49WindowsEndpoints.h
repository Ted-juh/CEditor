#pragma once

#include "Ctrl49SurfaceBroker.h"

// The real transports behind the broker's Endpoints: WinMM for the display output, the
// driver's private KSPROPERTY capture for the control input. Everything vendor-specific is
// already inside those two classes; this only bolts them onto the broker's seam.
//
// Compiled into every target for a simple include story; the body exists on Windows only.
// Elsewhere the factory returns null forever, which the broker reads as "no CTRL49 here" —
// true, and exactly the behaviour a Linux test run wants from the REAL factory while the
// tests drive the broker through fakes.

namespace ceditor::ctrl49
{
    /** Finds a CTRL49 and opens both transports. Returns null when absent. Called on the
        broker's worker thread; may block briefly (port probe, capture open). */
    std::unique_ptr<Ctrl49SurfaceEndpoints> discoverCtrl49WindowsEndpoints();
} // namespace ceditor::ctrl49
