#include "Ctrl49WindowsEndpoints.h"

#ifdef _WIN32

#include "Ctrl49PrivateInput.h"
#include "Ctrl49WinMmOutput.h"

namespace ceditor::ctrl49
{

std::unique_ptr<Ctrl49SurfaceEndpoints> discoverCtrl49WindowsEndpoints()
{
    const auto portId = Ctrl49WinMmOutput::findPort (Ctrl49WinMmOutput::kDefaultPortName);
    if (! portId)
        return nullptr;

    // Both transports or neither: a talk-only session would paint a display no knob can
    // drive, and the private capture refusing is also how a second process learns the
    // keyboard is taken at the driver level (the broker's own arbitration guards instances
    // of THIS product; the capture guards against everything else).
    auto output = std::make_unique<Ctrl49WinMmOutput> (*portId);
    auto input = std::make_shared<Ctrl49PrivateInput>();

    try
    {
        input->start (Ctrl49PrivateInput::discoverDevicePath());
    }
    catch (const std::exception&)
    {
        return nullptr;
    }

    auto endpoints = std::make_unique<Ctrl49SurfaceEndpoints>();
    endpoints->output = std::move (output);
    endpoints->dequeueInput = [input] { return input->dequeue(); };
    endpoints->inputRunning = [input] { return input->running(); };
    endpoints->inputFailure = [input] { return input->failure(); };
    endpoints->closeInput = [input]
    {
        try { input->stop(); } catch (const std::exception&) {}
    };
    endpoints->description = "CTRL49 USB";
    return endpoints;
}

} // namespace ceditor::ctrl49

#else

namespace ceditor::ctrl49
{
std::unique_ptr<Ctrl49SurfaceEndpoints> discoverCtrl49WindowsEndpoints() { return nullptr; }
} // namespace ceditor::ctrl49

#endif // _WIN32
