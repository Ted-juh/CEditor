// Transport interfaces for the CTRL49 control surface. The session and page logic depend
// only on these; the Win32 backends (WinMM output, KSPROPERTY private input) live behind
// them so a future Advance or Windows MIDI Services backend can slot in without touching
// session code. Design record: tools/docs/screen-builder-design.md.

#pragma once

#include "Ctrl49Protocol.h"

namespace ceditor::ctrl49
{

// Sends complete F0..F7 SysEx frames to the controller. Implementations must be safe to
// call from any single thread at a time; the session serializes callers itself.
class IControllerOutput
{
public:
    virtual ~IControllerOutput() = default;
    virtual void sendSysEx (const Bytes& frame) = 0;
};

} // namespace ceditor::ctrl49
