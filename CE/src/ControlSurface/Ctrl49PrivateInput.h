// Hidden cable-2 input: receives the CTRL49's VIP-layer controls (encoders, pads,
// buttons) and SysEx replies through the stock signed M-Audio driver's private
// KSPROPERTY capture interface. This class is the single exotic piece of the transport
// layer — every byte of vendor-private knowledge stays inside it.
//
// Proven mechanics (handoff section 5, exercised live by the PowerShell tools):
//   - device path discovered from HKLM\SOFTWARE\WOW6432Node\inMusic\Audio\Drivers
//     (child with DriverName "CTRL49", first LastPath value in its subtree);
//   - CreateFileW on the topology path, then IOCTL_KS_PROPERTY (0x002F0003) against the
//     vendor property set {A0634132-2F7F-4FDA-93BA-EA6D7D1BDD0D}:
//       SET 5 uint32(0)  open private capture index 0
//       GET 11           ready-input bitmask (bit 0 = data waiting)
//       GET 12           receive raw bytes (48-byte request, 16-byte result)
//       SET 7 uint32(0)  close capture
//   - a message is complete on the result's completion flag, an empty chunk, or a
//     trailing 0xF7.
//
// The private capture behaves as a single logical consumer: exactly one process (and in
// it, one instance) may own it. Open failure here is the backstop that keeps a bridge
// from starting a talk-only session (design record: tools/docs/screen-builder-design.md).
// Windows-only.

#pragma once

#ifdef _WIN32

#include "Ctrl49Protocol.h"

#include <atomic>
#include <deque>
#include <mutex>
#include <optional>
#include <string>
#include <thread>

namespace ceditor::ctrl49
{

class Ctrl49PrivateInput
{
public:
    Ctrl49PrivateInput() = default;
    ~Ctrl49PrivateInput();

    Ctrl49PrivateInput (const Ctrl49PrivateInput&) = delete;
    Ctrl49PrivateInput& operator= (const Ctrl49PrivateInput&) = delete;

    // Finds the private topology-device path in the registry. Throws std::runtime_error
    // if the CTRL49 driver entry or its LastPath is missing.
    static std::wstring discoverDevicePath();

    // Opens the device and private capture on a worker thread; blocks until the capture
    // is confirmed open (or throws on failure/timeout). Refuses if already running.
    void start (const std::wstring& devicePath);

    // Requests the worker to close capture and exit; throws std::runtime_error on
    // join timeout. Safe to call when not running.
    void stop (int timeoutMilliseconds = 5000);

    // Dequeues one complete MIDI message (3-byte CC / poly pressure, or a full SysEx
    // reply), or nullopt when the queue is empty.
    std::optional<Bytes> dequeue();

    bool running() const { return running_.load(); }
    std::string failure() const;

private:
    void captureLoop (std::wstring devicePath);
    void setFailure (const std::string& text);

    std::thread worker_;
    std::atomic<bool> running_ { false };
    std::atomic<bool> stopRequested_ { false };

    mutable std::mutex queueMutex_;
    std::deque<Bytes> messages_;

    mutable std::mutex failureMutex_;
    std::string failure_;
};

} // namespace ceditor::ctrl49

#endif // _WIN32
