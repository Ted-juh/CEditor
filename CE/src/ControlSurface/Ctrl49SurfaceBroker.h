#pragma once

#include <array>

#include "Ctrl49Reducer.h"
#include "Ctrl49Session.h"
#include "InstrumentHost/InstrumentHostService.h"

#include <memory>
#include <stdexcept>
#include <string>
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
// THE SCREEN IN THE APP. Every display payload the broker builds is also emitted to the UI
// ("instrumentHostSurfaceScreen", the exact bytes), and the UI's own buttons and knobs arrive
// as the same CC messages the hidden cable carries (the service's "surfaceInput"). Neither
// needs the keyboard: without one the broker still pages, reduces and paints — to the app's
// screen only — so the pages a person builds can be seen and walked on any machine, in the
// real build, with the real Lua page drawing the real bytes.
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

/** Why the keyboard is not connected, when discovery can tell. The discover hook throws this
    instead of returning null when the answer is more useful than "not found": a keyboard that
    is plugged in but has no MIDI port (the M-Audio driver is missing), a port another program
    holds (VIP, a DAW), a private capture that would not open. Returning null still means what
    it always meant: no keyboard here. All of these used to read "searching" in the app. */
struct Ctrl49DiscoveryProblem : std::runtime_error
{
    /** "noDriver", "portBusy" or "captureFailed". */
    Ctrl49DiscoveryProblem (std::string reasonCode, const std::string& message)
        : std::runtime_error (message), reason (std::move (reasonCode)) {}
    std::string reason;
};

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
        /** How long the HoSTage splash stays up before the first page. The demo's 900 ms was
            gone before anyone saw it; the startup is paced anyway, so this is time well spent. */
        int loadingMilliseconds = 2500;
        /** A keepalive every this many upload chunks during startup (see Ctrl49SessionOptions). */
        int keepaliveEveryUploadFrames = 16;

        /** Clock and cadences. `now` is milliseconds, monotonic. */
        std::function<double()> now = [] { return juce::Time::getMillisecondCounterHiRes(); };
        double searchIntervalMs = 2000.0;     // §17.4: poll, never block
        double heldRetryMs = 5000.0;          // another instance owns the surface — back off
        double displayIntervalMs = 100.0;     // the demo's proven 10 Hz
    };

    /** `paused` is the service saying not to drive the keyboard at all — the editor's HoSTage
        tab is closed. The claim is released and discovery stops until it says so again. */
    enum class State { searching, heldElsewhere, connecting, connected, failed, paused };

    Ctrl49SurfaceBroker (host::InstrumentHostService& serviceToDrive, Options optionsToUse);
    ~Ctrl49SurfaceBroker();

    Ctrl49SurfaceBroker (const Ctrl49SurfaceBroker&) = delete;
    Ctrl49SurfaceBroker& operator= (const Ctrl49SurfaceBroker&) = delete;

    /** Controlling thread, UI rate — beside drainParameterEvents. Everything that touches
        the service happens inside this call. */
    void tick();

    State state() const noexcept        { return currentState; }
    /** Which page the surface is showing, and what the pages are. Public because the status
        readout names the page, and because a test can then say which page it expected rather
        than inferring it from bytes it cannot decode. */
    int currentPage() const noexcept    { return reducer.page(); }

    /** Where the pages are. The control pages come first, then the performance page, then the
        stage pages (CUE, LAYERS, SOUNDCHECK: Ctrl49StagePages.h), then DISCOVER, CHANGES and the browser
        (Sound Browser Stage F) — last because they are the ones you go to deliberately rather
        than the ones you play from, and Page Right walks towards them.

        The pages after the performance page are only THERE when they have been asked for
        (cueOnSurface, layersOnSurface, soundcheckOnSurface, discoverOnSurface, changesOnSurface,
        browsingOnSurface). A surface that quietly grew
        an extra page under somebody's hands is a surface that stopped doing what they had it
        doing, which is the same rule each flag itself follows. */
    struct Pages
    {
        int control = 0;       // pages [0, control)
        int performance = 0;
        int cue = -1;          // -1 when the page is off
        int layers = -1;
        int soundcheck = -1;
        int discover = -1;
        int changes = -1;
        int browse = -1;       // -1 when browsing is off, which is most of the time
        int count = 1;
    };

    Pages pages() const;
    juce::String stateName() const;
    juce::String detail() const         { return statusDetail; }

private:
    void enter (State next, const juce::String& withDetail);
    void emitStatus() const;
    void beginDiscovery();
    void beginSessionStart();
    void joinWorker();
    void dropFinishedDiscovery();
    void disconnect (const juce::String& why, State next);
    void pumpInput (bool fromHardware);
    void refreshDisplay (bool toHardware);
    void emitScreen (const Bytes& labels, const Bytes& state, const std::string& stageCall,
                     const Bytes& stage) const;
    void paintPads();
    void forgetPadState();

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
    juce::String workerReason;

    std::unique_ptr<Ctrl49SurfaceEndpoints> endpoints;
    std::unique_ptr<Ctrl49Session> session;
    Ctrl49Reducer reducer;
    juce::int64 movementSequence = 0;
    int movingSlot = -1;
    Bytes lastLabels, lastState;             // last sent to the keyboard
    Bytes shownLabels, shownState;           // last emitted to the app's screen
    // The stage pages are one call each (set_layers, set_check) rather than the knob pages'
    // set_labels + set_values. Sending one kind clears the other's cache: the page on the
    // keyboard switches kind on the call, so a knob page left unchanged while a stage page was
    // up still has to be sent whole when it comes back.
    Bytes lastStage, shownStage;
    std::string lastStageCall;
    // The stage pages' own cursors: the song SOUNDCHECK shows in full and the part LAYERS edits.
    // -1 until first shown, when they start on the song on stage and the rack's focused part.
    int soundcheckSong = -1;
    int layersPart = -1;
    double lastCheckMs = -1.0e12;            // E8 on SOUNDCHECK re-checks, at most once a second
    // DISCOVER's cursor and the kind it keeps to, and what it last read from the library. A read
    // walks the whole library, so it is kept for two seconds, or until a turn changes what it
    // should hold; the pads and E4 act on the sounds the screen is showing, which are these.
    int cuePicked = -1;                      // CUE: the song E1 has picked; -1 = the one on stage
    // CHANGES: the change picked, the save compared against (0 = the latest), where E1 has the
    // part playing between that save and now, and the changes put back here, newest last, with
    // the value each had, so E3 the other way can take them back. Read as DISCOVER is read.
    int changesSelected = 0;
    int changesBack = 0;
    float changesListen = 1.0f;
    std::vector<std::pair<juce::String, float>> changesPutBack;
    host::InstrumentHostService::SurfaceChanges changesRead;
    double changesReadMs = -1.0e12;
    double changesPutBackMs = -1.0e12;
    bool changesStale = true;
    int discoverSelected = 0;
    juce::String discoverKind;
    host::InstrumentHostService::SurfaceDiscover discoverRead;
    double discoverReadMs = -1.0e12;
    bool discoverStale = true;
    bool shownOnKeyboard = false;
    juce::String deviceError;                // the keyboard's last refusal, by name
    int deviceRefusals = 0;
    // Why discovery last came back empty: "unplugged", "noDriver", "portBusy",
    // "captureFailed", or "error" for anything else. Empty while connecting or connected.
    juce::String searchReason;

    // The eight small buttons above the pads, one per pad: when each went down (-1 = up) and
    // whether its hold has already fired, so a held button steps its pad's layer ONCE, at the
    // threshold, rather than on release — you feel the pad change under your finger.
    static constexpr double longPressMs = 450.0;
    std::array<double, 8> switchDownAt { -1, -1, -1, -1, -1, -1, -1, -1 };
    std::array<bool, 8> switchFired {};
    // What each pad was last painted (0xRRGGBB, -1 = unknown), so only a change is sent.
    std::array<int, 8> paintedPads { -1, -1, -1, -1, -1, -1, -1, -1 };
};

} // namespace ceditor::ctrl49
