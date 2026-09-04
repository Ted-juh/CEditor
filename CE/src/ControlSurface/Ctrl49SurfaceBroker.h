#pragma once

#include "Ctrl49Reducer.h"
#include "Ctrl49Session.h"
#include "InstrumentHost/InstrumentHostService.h"

#include <memory>
#include <optional>
#include <thread>

// Ctrl49SurfaceBroker — the CTRL49 as a resident front end of the running application.
//
// Everything this drives was built and proven stages ago: the session's startup sequence,
// the reducer's reading of the VIP control layer, the rack and performance display payloads,
// and the service's surface API. What was missing is embarrassing to write down: nothing in
// the actual application ever CONSTRUCTED them. The whole hardware story ran only in demo
// executables, so the product's defining feature worked everywhere except the product.
//
// This is the demo's proven loop, promoted: discover the device, claim the one hardware
// surface (Stage 7's arbitration — two instances must not fight over a physical keyboard),
// play the startup sequence, then pump — input events into the service's surface calls,
// service state onto the display at 10 Hz, only bytes that changed.
//
// SHAPE. The broker is owned by whoever owns the service (the editor's bridge, the generated
// product's shell) and pumped from the same UI-rate timer that already drains parameter
// events. Discovery and the session's startup sequence run on a worker thread — start() is
// deliberately a slow, paced protocol, and freezing the message thread for it would make the
// app stutter at every reconnect — but every touch of the SERVICE happens in tick(), on the
// controlling thread, because the service is controlling-thread-only and that rule does not
// bend for hardware.
//
// RECONNECT is §17.4 verbatim: on loss stop sending immediately, mark offline, keep the
// software state, no blocking retry loops — the worker polls for the device at a slow rate
// and the session is rebuilt from scratch when it returns (device RAM is gone; a fresh
// start() is the only honest resume). The claim is released the moment the device is lost,
// so another instance (or this one, relaunched) can take over cleanly.
//
// PORTABLE ON PURPOSE. The Win32 pieces (WinMM output, the private KSPROPERTY input) stay
// behind Endpoints, injected by the caller: the app passes the real transports, the tests
// pass scripted fakes and drive the whole life cycle — discovery, claim, refusal when
// another instance holds the surface, startup, input-to-service, display diffing, loss,
// reconnect — on any machine. The one thing tests cannot prove is the cable; that is what
// the owner's keyboard is for.

namespace ceditor::ctrl49
{

/** The transport half of a connected CTRL49, built by the discover hook. Output sends
    complete SysEx frames; input hands back the VIP-layer messages the reducer reads. */
struct Ctrl49SurfaceEndpoints
{
    std::unique_ptr<IControllerOutput> output;
    std::function<std::optional<Bytes>()> dequeueInput;
    std::function<bool()> inputRunning;
    std::function<std::string()> inputFailure;
    std::function<void()> closeInput;         // idempotent; called on loss and destruction
    juce::String description;                 // for the status readout ("CTRL49 USB")
};

class Ctrl49SurfaceBroker
{
public:
    struct Options
    {
        /** Finds the hardware. Called on the worker thread — it may block briefly. Returns
            null when no CTRL49 is present, which is a state, not an error. */
        std::function<std::unique_ptr<Ctrl49SurfaceEndpoints>()> discover;

        /** Status events for the UI ("instrumentHostSurface"). May be null. */
        std::function<void (const juce::String&, const juce::var&)> emit;

        /** The display page and its assets. The app passes the embedded CEditor_MultiKnob
            page and knob filmstrip; tests pass a few bytes. */
        Bytes pageLua;
        std::vector<Ctrl49Session::PngAsset> pngAssets;

        /** Session pacing, injectable so tests do not sleep out the real loading page. */
        std::function<void (int)> sessionSleep;
        int loadingMilliseconds = 900;

        /** Clock and cadences. `now` is milliseconds, monotonic. */
        std::function<double()> now = [] { return juce::Time::getMillisecondCounterHiRes(); };
        double searchIntervalMs = 2000.0;     // §17.4: poll, never block
        double heldRetryMs = 5000.0;          // another instance owns the surface — back off
        double displayIntervalMs = 100.0;     // the demo's proven 10 Hz
    };

    enum class State { searching, heldElsewhere, connecting, connected, failed };

    Ctrl49SurfaceBroker (host::InstrumentHostService& serviceToDrive, Options optionsToUse);
    ~Ctrl49SurfaceBroker();

    Ctrl49SurfaceBroker (const Ctrl49SurfaceBroker&) = delete;
    Ctrl49SurfaceBroker& operator= (const Ctrl49SurfaceBroker&) = delete;

    /** Controlling thread, UI rate — beside drainParameterEvents. Everything that touches
        the service happens inside this call. */
    void tick();

    State state() const noexcept        { return currentState; }
    juce::String stateName() const;
    juce::String detail() const         { return statusDetail; }

private:
    void enter (State next, const juce::String& withDetail);
    void emitStatus() const;
    void beginDiscovery();
    void beginSessionStart();
    void joinWorker();
    void disconnect (const juce::String& why, State next);
    void pumpInput();
    void refreshDisplay();

    host::InstrumentHostService& service;
    Options options;

    State currentState = State::searching;
    juce::String statusDetail;
    double lastAttemptMs = -1.0e12;
    double lastDisplayMs = 0.0;
    bool triedPageGeneration = false;

    // Worker hand-off: the thread fills exactly one of these under the lock and exits;
    // tick() collects. The worker never touches the service or the members below the lock.
    std::thread worker;
    std::mutex handoffLock;
    bool workerDone = false;
    std::unique_ptr<Ctrl49SurfaceEndpoints> discovered;
    bool sessionReady = false;
    juce::String workerFailure;

    std::unique_ptr<Ctrl49SurfaceEndpoints> endpoints;
    std::unique_ptr<Ctrl49Session> session;
    Ctrl49Reducer reducer;
    juce::int64 movementSequence = 0;
    int movingSlot = -1;
    Bytes lastLabels, lastState;
};

} // namespace ceditor::ctrl49
