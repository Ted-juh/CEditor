#pragma once

#include "Ctrl49SurfaceBroker.h"

namespace ceditor::ctrl49
{
    /** Opens the CTRL49 display output and VIP control input on the broker's discovery thread. */
    std::unique_ptr<Ctrl49SurfaceEndpoints> discoverCtrl49Endpoints();
}
