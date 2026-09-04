// CTRL49 display session service: plays the proven startup sequence (identity, scene
// setup, Lua object upload, bind/init/draw, controller/LED setup), keeps the session
// alive with an independent 900 ms keepalive worker, and serializes all live traffic
// (Lua calls, draws, LEDs, pad RGB) on one output.
//
// The frame order, payloads, and inter-frame pauses reproduce the PowerShell minimal
// loader proven live on hardware (see the external handoff, section 11). Objects are
// device RAM only: on reconnect, build a fresh session and start() again.
//
// Threading: start()/stop() from one controlling thread; the live methods are safe from
// any thread once ready() — they serialize on an internal mutex shared with the
// keepalive worker. Failure of the keepalive worker is reported via failure().

#pragma once

#include "Ctrl49Transport.h"

#include <atomic>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace ceditor::ctrl49
{

struct Ctrl49SessionOptions
{
    // Time the loading page stays up before the landing/main page is shown.
    int loadingMilliseconds = 900;

    // Injectable for tests; defaults to a real sleep. Receives milliseconds.
    std::function<void (int)> sleep;

    // Optional logger; defaults to discarding.
    std::function<void (const std::string&)> log;
};

class Ctrl49Session
{
public:
    struct TimedFrame
    {
        Bytes frame;
        int pauseMs = 0;
    };

    // A PNG asset (e.g. a knob filmstrip) uploaded before init() so the Lua page can
    // decode_image it. `png` is the raw PNG file bytes; the session appends the required
    // NUL terminator. Ids must not collide with the Lua object id (0x0101).
    struct PngAsset
    {
        std::uint16_t id = 0;
        Bytes png;
    };

    // The proven startup sequence for one full-screen Lua page. `rawLua` is the plain
    // UTF-8 source: the session appends the object convention's NUL terminator itself
    // (idempotently — a caller-included NUL is left alone), exactly as it does for the
    // PNGs. Uploads any PNG assets before the bind/init so the page can decode them.
    // Pure; exposed for golden-sequence tests.
    static std::vector<TimedFrame> buildStartupSequence (const Bytes& rawLua,
                                                         const std::vector<PngAsset>& assets = {});

    Ctrl49Session (IControllerOutput& output, Bytes rawLua, Ctrl49SessionOptions options = {});
    Ctrl49Session (IControllerOutput& output, Bytes rawLua, std::vector<PngAsset> assets,
                   Ctrl49SessionOptions options = {});
    ~Ctrl49Session();

    Ctrl49Session (const Ctrl49Session&) = delete;
    Ctrl49Session& operator= (const Ctrl49Session&) = delete;

    // Plays the startup sequence, waits out the loading page, shows the landing page
    // (set_mode(1)), marks the session ready, and starts the keepalive worker.
    // Blocking; throws on transport failure.
    void start();

    // Stops the keepalive worker and restores all pads to the captured VIP orange.
    // Idempotent; never throws.
    void stop();

    bool ready() const                { return ready_.load(); }
    std::string failure() const;

    // Live traffic — valid once ready().
    void callLua (const std::string& function, const Bytes& args, bool redraw);
    void setPadRgb (int pad, int red, int green, int blue);
    void setAllPadsRgb (int red, int green, int blue);
    void setActivePadBank (int bank);  // lights exactly one of the four bank LEDs

    static constexpr std::uint8_t kTarget      = 0x02;
    static constexpr std::uint16_t kLuaObjectId = 0x0101;

private:
    void keepaliveLoop();
    void sendLocked (const Bytes& frame);  // caller holds midiMutex_

    IControllerOutput& output_;
    Bytes rawLua_;
    std::vector<PngAsset> assets_;
    Ctrl49SessionOptions options_;

    std::mutex midiMutex_;
    mutable std::mutex failureMutex_;
    std::string failure_;

    std::atomic<bool> ready_ { false };
    std::atomic<bool> stopRequested_ { false };
    std::thread keepaliveThread_;
};

} // namespace ceditor::ctrl49
