// WinMM backend for IControllerOutput: long-message SysEx to the public "CTRL49 USB"
// Windows MIDI output. Display commands go out this ordinary port (USB cable 0); only
// the replies travel the hidden cable 2 (see Ctrl49PrivateInput). Windows-only.

#pragma once

#ifdef _WIN32

#include "Ctrl49Transport.h"

#include <optional>
#include <string>

namespace ceditor::ctrl49
{

class Ctrl49WinMmOutput : public IControllerOutput
{
public:
    static constexpr const wchar_t* kDefaultPortName = L"CTRL49 USB";

    // Finds the first output port whose name starts with `name` (the tested port
    // enumerates exactly as "CTRL49 USB"). Returns the device id, or nullopt.
    static std::optional<unsigned int> findPort (const std::wstring& name,
                                                 std::wstring* actualName = nullptr);

    // All available WinMM output port names, in device-id order (for diagnostics).
    static std::vector<std::wstring> listOutputPortNames();

    // Opens the port; throws std::runtime_error on failure.
    explicit Ctrl49WinMmOutput (unsigned int deviceId);
    ~Ctrl49WinMmOutput() override;

    Ctrl49WinMmOutput (const Ctrl49WinMmOutput&) = delete;
    Ctrl49WinMmOutput& operator= (const Ctrl49WinMmOutput&) = delete;

    void sendSysEx (const Bytes& frame) override;

    // Sends a channel-voice / short MIDI message (1-3 status+data bytes). Used for the
    // synth side, where a device profile may compile a parameter to CC/NRPN rather than
    // SysEx. SysEx frames (leading 0xF0) must go through sendSysEx instead.
    void sendShortMessage (const Bytes& bytes);

    // Dispatches by leading byte: 0xF0 -> sendSysEx, otherwise sendShortMessage.
    void send (const Bytes& bytes);

private:
    void* handle_ = nullptr;  // HMIDIOUT
};

} // namespace ceditor::ctrl49

#endif // _WIN32
