#include "Ctrl49SurfaceBroker.h"
#include "Ctrl49LuaStrip.h"
#include "Ctrl49RackDisplay.h"
#include "Ctrl49PerformanceDisplay.h"
#include "Ctrl49StagePages.h"

#include <algorithm>

namespace ceditor::ctrl49
{

Ctrl49SurfaceBroker::Ctrl49SurfaceBroker (host::InstrumentHostService& serviceToDrive,
                                          Options optionsToUse)
    : service (serviceToDrive), options (std::move (optionsToUse))
{
    emitStatus();
}

Ctrl49SurfaceBroker::~Ctrl49SurfaceBroker()
{
    joinWorker();

    if (session != nullptr)
        session->stop();          // never throws; restores the pads
    if (endpoints != nullptr && endpoints->closeInput != nullptr)
        endpoints->closeInput();

    // The claim is the one piece of shared state: hand the surface back so another instance
    // (or this one, relaunched) does not wait out the heartbeat timeout.
    if (currentState == State::connected || currentState == State::connecting)
        service.releaseHardwareSurface();
}

juce::String Ctrl49SurfaceBroker::stateName() const
{
    switch (currentState)
    {
        case State::searching:     return "searching";
        case State::heldElsewhere: return "heldElsewhere";
        case State::connecting:    return "connecting";
        case State::connected:     return "connected";
        case State::failed:        return "failed";
        case State::paused:        return "paused";
    }
    return "searching";
}

void Ctrl49SurfaceBroker::enter (State next, const juce::String& withDetail)
{
    if (currentState == next && statusDetail == withDetail)
        return;

    currentState = next;
    statusDetail = withDetail;
    emitStatus();
}

void Ctrl49SurfaceBroker::emitStatus() const
{
    if (options.emit == nullptr)
        return;

    auto* obj = new juce::DynamicObject();
    obj->setProperty ("state", stateName());
    obj->setProperty ("detail", statusDetail);
    obj->setProperty ("device", endpoints != nullptr ? endpoints->description : juce::String());
    // The software Stage view mirrors the page the keyboard is actually showing. Connection
    // status alone made it guess page zero, which became wrong the first time Page Right was
    // pressed on the hardware.
    obj->setProperty ("pageIndex", reducer.page());
    obj->setProperty ("activeSlot", reducer.activeSlot());
    obj->setProperty ("padBank", reducer.padBank());
    // Value deltas for plug-in parameters travel on a separate, focused-part stream, so the
    // Stage monitor cannot reliably infer every hardware turn from rack state alone. This
    // counter is transient hardware activity, not document state: every encoder message
    // advances it even when the same encoder remains focused or a parameter value is clamped.
    obj->setProperty ("movementSeq", movementSequence);
    obj->setProperty ("movingSlot", movingSlot);
    // The last thing the keyboard refused, and how many times it has refused anything since
    // this connection started. Empty and zero when all is well.
    obj->setProperty ("deviceError", deviceError);
    obj->setProperty ("deviceRefusals", deviceRefusals);
    obj->setProperty ("searchReason", searchReason);
    options.emit ("instrumentHostSurface", juce::var (obj));
}

void Ctrl49SurfaceBroker::joinWorker()
{
    if (worker.joinable())
        worker.join();
}

void Ctrl49SurfaceBroker::dropFinishedDiscovery()
{
    std::unique_ptr<Ctrl49SurfaceEndpoints> found;
    {
        const std::scoped_lock lock (handoffLock);
        if (! workerDone)
            return;
        workerDone = false;
        found = std::move (discovered);
    }
    joinWorker();
    if (found != nullptr && found->closeInput != nullptr)
        found->closeInput();
}

void Ctrl49SurfaceBroker::beginDiscovery()
{
    joinWorker();
    {
        const std::scoped_lock lock (handoffLock);
        workerDone = false;
        discovered.reset();
        workerFailure.clear();
    }

    worker = std::thread ([this]
    {
        std::unique_ptr<Ctrl49SurfaceEndpoints> found;
        juce::String failure, reason;
        try
        {
            if (options.discover != nullptr)
                found = options.discover();
            if (found == nullptr)
                reason = "unplugged";
        }
        catch (const Ctrl49DiscoveryProblem& problem)
        {
            failure = problem.what();
            reason = problem.reason;
        }
        catch (const std::exception& e)
        {
            failure = e.what();
            reason = "error";
        }

        const std::scoped_lock lock (handoffLock);
        discovered = std::move (found);
        workerFailure = failure;
        workerReason = reason;
        workerDone = true;
    });
}

void Ctrl49SurfaceBroker::beginSessionStart()
{
    joinWorker();
    {
        const std::scoped_lock lock (handoffLock);
        workerDone = false;
        sessionReady = false;
        workerFailure.clear();
    }

    // The session's startup sequence is a paced protocol — identity, scene select, asset
    // upload, the loading page's dwell — and it belongs on a worker exactly as much as a
    // network handshake would. The session object itself is safe to build here: it does not
    // touch the service, and tick() will not use it before sessionReady.
    worker = std::thread ([this]
    {
        juce::String failure;
        bool ready = false;
        try
        {
            Ctrl49SessionOptions sessionOptions;
            sessionOptions.loadingMilliseconds = options.loadingMilliseconds;
            // Keepalives during the upload. The proven sequence sends none, which was fine for
            // one 19 KB filmstrip; HoSTage uploads the logo too, and a keyboard whose watchdog
            // fires mid-upload never shows the splash that follows. Every 16 chunks is ~8 KB.
            sessionOptions.keepaliveEveryUploadFrames = options.keepaliveEveryUploadFrames;
            sessionOptions.sleep = options.sessionSleep;
            // The page as the keyboard needs it: comments, indentation and empty lines out
            // (Ctrl49LuaStrip.h). The file stays written to be read; the upload is a third smaller.
            session = std::make_unique<Ctrl49Session> (*endpoints->output, stripLuaForUpload (options.pageLua),
                                                       options.pngAssets, sessionOptions);
            session->start();
            ready = true;
        }
        catch (const std::exception& e)
        {
            failure = e.what();
            session.reset();
        }

        const std::scoped_lock lock (handoffLock);
        sessionReady = ready;
        workerFailure = failure;
        workerDone = true;
    });
}

void Ctrl49SurfaceBroker::disconnect (const juce::String& why, State next)
{
    if (session != nullptr)
    {
        session->stop();
        session.reset();
    }
    if (endpoints != nullptr)
    {
        if (endpoints->closeInput != nullptr)
            endpoints->closeInput();
        endpoints.reset();
    }

    service.releaseHardwareSurface();
    lastLabels.clear();
    lastStage.clear();
    lastState.clear();
    triedPageGeneration = false;
    lastAttemptMs = options.now();
    enter (next, why);
}

void Ctrl49SurfaceBroker::tick()
{
    const auto now = options.now();

    // No keyboard driving yet: the app's screen still pages and paints. Everything below
    // touches only the service and the reducer, never a session or an endpoint.
    if (currentState != State::connected)
    {
        pumpInput (false);
        if (now - lastDisplayMs >= options.displayIntervalMs)
        {
            lastDisplayMs = now;
            refreshDisplay (false);
        }
    }

    switch (currentState)
    {
        case State::searching:
        case State::heldElsewhere:
        case State::failed:
        case State::paused:
        {
            // Not wanted: leave the keyboard alone. A discovery already out is collected and
            // what it found is let go, so nothing is held open while paused.
            if (! service.hardwareSurfaceWanted())
            {
                dropFinishedDiscovery();
                enter (State::paused, "HoSTage is closed");
                return;
            }
            if (currentState == State::paused)
            {
                enter (State::searching, {});
                lastAttemptMs = -1.0e12;          // look straight away, not in two seconds
            }

            // Collect a finished discovery, or start one when the poll is due and no worker
            // is out. §17.4: this never blocks — absence costs one cheap check per interval.
            bool done = false;
            std::unique_ptr<Ctrl49SurfaceEndpoints> found;
            juce::String failure, reason;
            {
                const std::scoped_lock lock (handoffLock);
                if (workerDone)
                {
                    done = true;
                    workerDone = false;
                    found = std::move (discovered);
                    failure = workerFailure;
                    reason = workerReason;
                }
            }

            if (done)
            {
                joinWorker();

                if (found == nullptr)
                {
                    // The reason is news only when it changes: the poll runs every two
                    // seconds, and an unchanged "unplugged" should not re-announce itself.
                    const auto reasonChanged = reason != searchReason;
                    searchReason = reason;
                    const auto next = currentState == State::heldElsewhere ? State::heldElsewhere
                                                                           : State::searching;
                    const auto detailNow = reason == "unplugged" ? juce::String() : failure;
                    if (reasonChanged && currentState == next && statusDetail == detailNow)
                        emitStatus();
                    enter (next, detailNow);
                    return;
                }

                // The device is here. The Stage 7 arbitration decides whether it is OURS:
                // driving a surface another instance holds would splice two racks onto one
                // keyboard, which is worse than doing nothing.
                if (! service.claimHardwareSurface())
                {
                    if (found->closeInput != nullptr)
                        found->closeInput();
                    lastAttemptMs = now;
                    enter (State::heldElsewhere, "another instance is using the keyboard");
                    return;
                }

                endpoints = std::move (found);
                deviceError.clear();
                deviceRefusals = 0;
                searchReason.clear();
                enter (State::connecting, endpoints->description);
                beginSessionStart();
                return;
            }

            const auto interval = currentState == State::heldElsewhere ? options.heldRetryMs
                                                                       : options.searchIntervalMs;
            if (now - lastAttemptMs >= interval && ! worker.joinable())
            {
                lastAttemptMs = now;
                beginDiscovery();
            }
            return;
        }

        case State::connecting:
        {
            bool done = false;
            bool ready = false;
            juce::String failure;
            {
                const std::scoped_lock lock (handoffLock);
                if (workerDone)
                {
                    done = true;
                    workerDone = false;
                    ready = sessionReady;
                    failure = workerFailure;
                }
            }

            if (! done)
                return;

            joinWorker();

            if (ready && ! service.hardwareSurfaceWanted())
            {
                disconnect ("HoSTage is closed", State::paused);
                return;
            }

            if (! ready)
            {
                disconnect (failure.isNotEmpty() ? failure : "the startup sequence failed",
                            State::failed);
                return;
            }

            // The keyboard starts where the app's screen was, rather than on page one: the
            // reducer is kept, only what was last SENT is forgotten, so the first refresh
            // paints the device in full.
            lastLabels.clear();
            lastState.clear();
            lastStage.clear();
            forgetPadState();
            enter (State::connected, endpoints->description);
            lastDisplayMs = 0.0;   // paint immediately
            return;
        }

        case State::connected:
        {
            if (! service.hardwareSurfaceWanted())
            {
                // Stop sending and hand the keyboard back: its watchdog restores its own
                // screen once the keepalive stops.
                disconnect ("HoSTage is closed", State::paused);
                return;
            }

            if (! service.ownsHardwareSurface())
            {
                disconnect ("hardware ownership was lost", State::heldElsewhere);
                return;
            }

            // Transport health first: a dead input or a failed keepalive means the device is
            // gone, and §17.4 says stop sending IMMEDIATELY and mark offline — not "try one
            // more frame".
            if ((endpoints->inputRunning != nullptr && ! endpoints->inputRunning())
                || (session != nullptr && ! session->failure().empty()))
            {
                auto why = session != nullptr && ! session->failure().empty()
                             ? juce::String (session->failure())
                             : juce::String (endpoints->inputFailure != nullptr
                                                 ? endpoints->inputFailure() : std::string());
                disconnect (why.isNotEmpty() ? why : "the keyboard went away", State::searching);
                return;
            }

            // The demo's convenience, kept: a rack with an instrument but no pages yet gets
            // its automatic first pass, once per connection, through the same command the UI
            // uses — so the state emit reaches the editor too.
            const auto& performance = service.getRackHost().getPerformance();
            // Not in a player: a show's pages are its editor's, and a show made without any
            // has none to grow (docs/design/hostage-creator-editor-player.md).
            if (! triedPageGeneration && ! service.isStageLocked() && ! service.isPlayer()
                && performance.pages.isEmpty()
                && performance.focusedPartId.isNotEmpty()
                && service.getRackHost().partHasInstrument (performance.focusedPartId))
            {
                triedPageGeneration = true;
                auto* payload = new juce::DynamicObject();
                payload->setProperty ("cmd", "generateControlPages");
                payload->setProperty ("partId", performance.focusedPartId);
                service.handleCommand (juce::var (payload));
            }

            pumpInput (true);
            paintPads();

            if (now - lastDisplayMs >= options.displayIntervalMs)
            {
                lastDisplayMs = now;
                refreshDisplay (true);
            }
            return;
        }
    }
}

Ctrl49SurfaceBroker::Pages Ctrl49SurfaceBroker::pages() const
{
    Pages layout;
    // Every control page reaches the keyboard. This used to stop at two — the reducer's four
    // mode-button pages less the performance and browser pages — so a third page existed on the
    // computer and Page Right simply never arrived at it.
    layout.control = service.getRackHost().getPerformance().pages.size();
    layout.performance = layout.control;
    auto next = layout.performance + 1;
    layout.cue = service.cueOnSurface() ? next++ : -1;
    layout.live = service.liveOnSurface() ? next++ : -1;
    layout.layers = service.layersOnSurface() ? next++ : -1;
    layout.meters = service.metersOnSurface() ? next++ : -1;
    layout.soundcheck = service.soundcheckOnSurface() ? next++ : -1;
    layout.discover = service.discoverOnSurface() ? next++ : -1;
    layout.changes = service.changesOnSurface() ? next++ : -1;
    layout.browse = service.browsingOnSurface() ? next++ : -1;
    layout.count = next;
    return layout;
}

void Ctrl49SurfaceBroker::pumpInput (bool fromHardware)
{
    const auto& performance = service.getRackHost().getPerformance();
    const auto layout = pages();
    const auto controlPages = layout.control;
    const auto performancePage = layout.performance;
    const auto pageBeforeCountChange = reducer.page();
    reducer.setPageCount (layout.count);
    if (pageBeforeCountChange != reducer.page())
        emitStatus();
    // Listening on CHANGES is only while the page is up: off it, the part plays as it is.
    if (changesListen < 1.0f && reducer.page() != layout.changes)
    {
        service.surfaceChangesListen (changesBack, 1.0f);
        changesListen = 1.0f;
    }

    // Scene/setlist page recall is intentionally consumed once. It moves the hardware to
    // the requested layout, then gets out of the way so the player's next Page press wins.
    if (const auto requested = service.consumeSurfacePageRequest(); requested.isNotEmpty())
        for (int i = 0; i < controlPages; ++i)
            if (performance.pages.getReference (i).pageId == requested)
            {
                if (reducer.setPage (i))
                {
                    lastLabels.clear();
                    lastState.clear();
                    lastStage.clear();
                    emitStatus();
                }
                break;
            }

    service.noteSurfacePage (reducer.page() < controlPages
        ? performance.pages.getReference (reducer.page()).pageId : juce::String());

    // LAYERS edits a part's zone by turning; the turns of one pump are summed and sent as one
    // edit, so a fast turn is one save of the rack rather than one a detent.
    std::array<int, 8> zoneTurns {};
    // METERS likewise: E1-E5 the faders of the parts on its strips, E6 the master.
    std::array<int, 6> meterTurns {};
    // LIVE likewise: E2-E8 edit the arp, and a pad turns a step on or off (-1 none).
    std::array<int, 8> liveTurns {};
    int livePad = -1;

    // One reading for both sources: the app's screen sends what the cable sends, so nothing
    // below knows or cares which it was.
    const auto handle = [&] (const std::uint8_t* data, std::size_t size)
    {
        // The keyboard answers every display command. A refusal used to be dropped with the
        // rest of the SysEx here, which is how a page it would not draw became a black screen
        // with no reason given; now the reason reaches the app.
        if (const auto ack = parseAck (Bytes (data, data + size)); ack && ! ack->ok())
        {
            ++deviceRefusals;
            deviceError = "The keyboard refused " + juce::String (displayCommandName (ack->command))
                          + ": " + juce::String (ackStatusName (ack->status));
            emitStatus();
            return;
        }

        const auto previousPage = reducer.page();
        const auto previousSlot = reducer.activeSlot();
        const auto previousBank = reducer.padBank();
        const auto action = reducer.process (data, size);
        if (! action)
            return;

        // Shift + Page Left / Right steps the setlist from any page: the song is the one thing
        // a player needs to change without looking for it. Through the command surface, so the
        // stage lock and the screen see it like a click.
        if (action->setlistStep != 0)
        {
            auto* payload = new juce::DynamicObject();
            payload->setProperty ("cmd", action->setlistStep < 0 ? "setlistPrev" : "setlistNext");
            service.handleCommand (juce::var (payload));
            return;
        }

        const auto encoderMoved = action->encoderMoved && action->encoderSlot >= 0;
        if (encoderMoved)
        {
            movingSlot = juce::jlimit (0, 7, action->encoderSlot);
            ++movementSequence;
        }

        if (previousPage != reducer.page() || previousSlot != reducer.activeSlot()
            || previousBank != reducer.padBank() || encoderMoved)
            emitStatus();

        if (previousPage != reducer.page())
        {
            service.noteSurfacePage (reducer.page() < controlPages
                ? performance.pages.getReference (reducer.page()).pageId : juce::String());
            switchDownAt.fill (-1.0);   // a hold does not carry over to another page's pads
            discoverStale = true;       // DISCOVER opens on what the library holds now
            changesStale = true;
            if (changesListen < 1.0f)   // and CHANGES stops listening when it is left
            {
                service.surfaceChangesListen (changesBack, 1.0f);
                changesListen = 1.0f;
            }
        }

        if (action->switchChanged && action->switchSlot >= 0 && action->switchSlot < 8)
        {
            const auto slot = (std::size_t) action->switchSlot;
            switchDownAt[slot] = action->switchDown ? options.now() : -1.0;
            switchFired[slot] = false;
        }

        if (reducer.page() == performancePage)
        {
            // The demo's mapping, verbatim: pads launch clips (bank A) or scenes (bank B);
            // the encoders are the performance set in groove-box order.
            if (action->padChanged && action->pad >= 1 && action->velocity > 0)
            {
                const auto index = action->pad - 1;
                if (reducer.padBank() == 1)
                    service.surfaceScenePad (index);
                else
                    service.surfaceClipPad (index);
            }

            if (action->encoderMoved && action->encoderSlot >= 0)
            {
                using SurfaceEncoder = host::InstrumentHostService::SurfaceEncoder;
                static constexpr SurfaceEncoder encoders[] =
                {
                    SurfaceEncoder::tempo,  SurfaceEncoder::swing,
                    SurfaceEncoder::rate,   SurfaceEncoder::length,
                    SurfaceEncoder::gate,   SurfaceEncoder::velocity,
                    SurfaceEncoder::probability, SurfaceEncoder::masterLevel,
                };
                service.nudgePerformanceEncoder (
                    encoders[(std::size_t) juce::jlimit (0, 7, action->encoderSlot)],
                    action->encoderDelta);
            }
        }
        else if (reducer.page() == layout.browse)
        {
            // Straight through the command surface rather than through a second API of its
            // own: the browser the hardware drives has to be the SAME browser the workspace
            // draws, down to the cursor, or the mirror beside the encoder map is a picture of
            // something else. These commands emit as they go, so the screen on the computer
            // follows the hands on the keyboard for free.
            if (action->encoderMoved)
            {
                auto* payload = new juce::DynamicObject();
                payload->setProperty ("cmd", "browseTurn");
                payload->setProperty ("encoder", action->encoderSlot);
                payload->setProperty ("delta", action->encoderDelta);
                service.handleCommand (juce::var (payload));
            }
            else if (action->padChanged && action->pad >= 1 && action->velocity > 0)
            {
                auto* payload = new juce::DynamicObject();
                payload->setProperty ("cmd", "browsePad");
                payload->setProperty ("pad", action->pad - 1);
                service.handleCommand (juce::var (payload));
            }
        }
        else if (reducer.page() == layout.soundcheck)
        {
            // E1 walks the setlist. E8 checks it again, through the command surface so the
            // edition and the stage lock see it as they see the app's Check button; a turn is
            // many detents, so it checks once a second at most.
            if (action->encoderMoved && action->encoderSlot == 0)
                soundcheckSong = juce::jlimit (0, juce::jmax (0, performance.setlist.items.size() - 1),
                                               soundcheckSong + action->encoderDelta);
            else if (action->encoderMoved && action->encoderSlot == 7 && options.now() - lastCheckMs >= 1000.0)
            {
                lastCheckMs = options.now();
                auto* payload = new juce::DynamicObject();
                payload->setProperty ("cmd", "checkSetlistSoundcheck");
                service.handleCommand (juce::var (payload));
            }
        }
        else if (reducer.page() == layout.changes)
        {
            // E1 listens between the save and now, E2 picks a change, E3 puts it back (one at a
            // time, a turn being many detents) or the other way takes the last one back, E4 walks
            // back through the saves. Putting back is setParameter, as the app's own knob is.
            const auto& rows = changesRead.changed;
            if (action->encoderMoved && action->encoderSlot == 0 && changesRead.problem.isEmpty())
            {
                changesListen = juce::jlimit (0.0f, 1.0f, changesListen + 0.1f * (float) action->encoderDelta);
                if (changesListen > 0.95f)
                    changesListen = 1.0f;
                service.surfaceChangesListen (changesBack, changesListen);
                changesStale = true;
            }
            else if (action->encoderMoved && action->encoderSlot == 1)
                changesSelected = juce::jlimit (0, juce::jmax (0, rows.size() - 1), changesSelected + action->encoderDelta);
            else if (action->encoderMoved && action->encoderSlot == 2 && options.now() - changesPutBackMs >= 400.0)
            {
                const auto setParameter = [this] (const juce::String& id, float value)
                {
                    auto* payload = new juce::DynamicObject();
                    payload->setProperty ("cmd", "setParameter");
                    payload->setProperty ("partId", changesRead.partId);
                    payload->setProperty ("id", id);
                    payload->setProperty ("value", value);
                    service.handleCommand (juce::var (payload));
                };
                changesPutBackMs = options.now();
                changesListen = 1.0f;   // setParameter puts back what listening changed first
                if (action->encoderDelta > 0 && juce::isPositiveAndBelow (changesSelected, rows.size()))
                {
                    const auto& row = rows.getReference (changesSelected);
                    changesPutBack.emplace_back (row.id, row.now);
                    setParameter (row.id, row.saved);
                }
                else if (action->encoderDelta < 0 && ! changesPutBack.empty())
                {
                    const auto [id, value] = changesPutBack.back();
                    changesPutBack.pop_back();
                    setParameter (id, value);
                }
                changesStale = true;
            }
            else if (action->encoderMoved && action->encoderSlot == 3)
            {
                const auto back = juce::jlimit (0, juce::jmax (0, changesRead.saves - 1), changesBack + action->encoderDelta);
                if (back != changesBack)
                {
                    service.surfaceChangesListen (changesBack, 1.0f);
                    changesListen = 1.0f;
                    changesBack = back;
                    changesSelected = 0;
                    changesStale = true;
                }
            }
        }
        else if (reducer.page() == layout.cue)
        {
            // E1 picks a song to go to; pad 1 goes there, through setlistGo as the app's Go does,
            // so the edition sees it. Shift + Page still steps the set from any page.
            const auto& setlist = performance.setlist;
            if (action->encoderMoved && action->encoderSlot == 0 && ! setlist.items.isEmpty())
            {
                // From the song on stage, or from before the first when the set has not started,
                // so the first detent picks song 1.
                const auto from = cuePicked >= 0 ? cuePicked : setlist.currentIndex;
                cuePicked = juce::jlimit (0, setlist.items.size() - 1, from + action->encoderDelta);
                if (cuePicked == setlist.currentIndex)
                    cuePicked = -1;
            }
            else if (action->padChanged && action->pad == 1 && action->velocity > 0 && cuePicked >= 0)
            {
                auto* payload = new juce::DynamicObject();
                payload->setProperty ("cmd", "setlistGo");
                payload->setProperty ("index", cuePicked);
                cuePicked = -1;
                service.handleCommand (juce::var (payload));
            }
        }
        else if (reducer.page() == layout.discover)
        {
            // E1 picks, E2 reaches further down the list (eight at a time: further from what you
            // load), E3 keeps it to one kind, E4 keeps the sound as a favourite (clockwise) or
            // lets it go. A pad auditions the row under it. Through the command surface, as the
            // Sounds page sends them.
            const auto& sounds = discoverRead.sounds;
            const auto last = juce::jmax (0, sounds.size() - 1);
            if (action->encoderMoved && action->encoderSlot == 0)
                discoverSelected = juce::jlimit (0, last, discoverSelected + action->encoderDelta);
            else if (action->encoderMoved && action->encoderSlot == 1)
                discoverSelected = juce::jlimit (0, last, discoverSelected + kDiscoverRows * action->encoderDelta);
            else if (action->encoderMoved && action->encoderSlot == 2)
            {
                const auto& kinds = discoverRead.kinds;
                const auto at = juce::jlimit (0, kinds.size(), kinds.indexOf (discoverKind) + 1 + action->encoderDelta);
                const auto kind = at == 0 ? juce::String() : kinds[at - 1];
                if (kind != discoverKind)
                {
                    discoverKind = kind;
                    discoverSelected = 0;
                    discoverStale = true;
                }
            }
            else if (action->encoderMoved && action->encoderSlot == 3 && discoverSelected < sounds.size())
            {
                const auto keep = action->encoderDelta > 0;
                if (sounds.getReference (discoverSelected).kept != keep)
                {
                    auto* payload = new juce::DynamicObject();
                    payload->setProperty ("cmd", "setLibraryUserMetadata");
                    payload->setProperty ("recordId", sounds.getReference (discoverSelected).recordId);
                    payload->setProperty ("favourite", keep);
                    service.handleCommand (juce::var (payload));
                    discoverRead.sounds.getReference (discoverSelected).kept = keep;   // until the next read
                    discoverStale = true;
                }
            }
            else if (action->padChanged && action->pad >= 1 && action->velocity > 0)
            {
                const auto row = discoverFirstRow (sounds.size(), discoverSelected) + action->pad - 1;
                if (row < sounds.size())
                {
                    auto* payload = new juce::DynamicObject();
                    payload->setProperty ("cmd", "auditionRecord");
                    payload->setProperty ("recordId", sounds.getReference (row).recordId);
                    service.handleCommand (juce::var (payload));
                }
            }
        }
        else if (reducer.page() == layout.live)
        {
            // E1 picks the step, E2-E5 turn its velocity, octave, ratchets and chance, E6-E8 the
            // arp's gate, rate and mode; pad N turns step N of the half the cursor is in on or off.
            if (action->encoderMoved && action->encoderSlot == 0)
                liveCursor = juce::jlimit (0, kLiveSteps - 1, liveCursor + action->encoderDelta);
            else if (action->encoderMoved && action->encoderSlot >= 1 && action->encoderSlot <= 7)
                liveTurns[(std::size_t) action->encoderSlot] += action->encoderDelta;
            else if (action->padChanged && action->pad >= 1 && action->pad <= 8 && action->velocity > 0)
                livePad = (liveCursor < 8 ? 0 : 8) + action->pad - 1;
        }
        else if (reducer.page() == layout.meters)
        {
            // E1-E5 the faders of the five parts on the strips, E6 the master, E7 which parts are
            // on the strips (when the rack has more than five).
            if (action->encoderMoved && action->encoderSlot >= 0 && action->encoderSlot <= 5)
            {
                meterTurns[(std::size_t) action->encoderSlot] += action->encoderDelta;
                metersTouched = action->encoderSlot;
            }
            else if (action->encoderMoved && action->encoderSlot == 6)
                metersFirst = metersFirstPart (performance.parts.size(), metersFirst + action->encoderDelta);
        }
        else if (reducer.page() == layout.layers)
        {
            // E1 picks the part; E2-E6 turn its lowest key, highest key, transpose, lowest and
            // highest velocity (summed, then sent once below).
            if (action->encoderMoved && action->encoderSlot == 0)
                layersPart = juce::jlimit (0, juce::jmax (0, performance.parts.size() - 1),
                                           layersPart + action->encoderDelta);
            else if (action->encoderMoved && action->encoderSlot >= 1 && action->encoderSlot <= 5)
                zoneTurns[(std::size_t) action->encoderSlot] += action->encoderDelta;
        }
        else if (controlPages > 0 && reducer.page() < controlPages && action->encoderMoved)
        {
            const auto& page = performance.pages.getReference (reducer.page());
            service.nudgeControlSlot (page.pageId,
                                      "s" + juce::String (action->encoderSlot + 1),
                                      action->encoderDelta);
        }
        else if (controlPages > 0 && reducer.page() < controlPages
                 && action->padChanged && action->pad >= 1)
        {
            // Pad N drives whatever pad N is playing on its active layer — by number, the way
            // the encoders drive their slots, so a pad needs no learning to work.
            // A pad with nothing on it plays the Chords pads, in the keyboard's own bank.
            service.pressSurfacePad (performance.pages.getReference (reducer.page()).pageId,
                                     action->pad, action->velocity > 0, action->velocity,
                                     reducer.padBank());
        }
    };

    for (const auto& message : service.consumeVirtualSurfaceInput())
        handle (message.data(), message.size());

    if (fromHardware)
        for (auto message = endpoints->dequeueInput(); message; message = endpoints->dequeueInput())
            handle (message->data(), message->size());

    if (reducer.page() == layout.layers && layersPart >= 0 && layersPart < performance.parts.size()
        && std::any_of (zoneTurns.begin(), zoneTurns.end(), [] (int turn) { return turn != 0; }))
    {
        // Through the command surface, as the app's zone editor sends it: the stage lock refuses
        // it there, and the rack is saved there.
        const auto& part = performance.parts.getReference (layersPart);
        auto rules = part.midi;
        rules.keyLow = juce::jlimit (0, rules.keyHigh, rules.keyLow + zoneTurns[1]);
        rules.keyHigh = juce::jlimit (rules.keyLow, 127, rules.keyHigh + zoneTurns[2]);
        rules.transpose = juce::jlimit (-48, 48, rules.transpose + zoneTurns[3]);
        rules.velocityLow = juce::jlimit (1, rules.velocityHigh, rules.velocityLow + zoneTurns[4]);
        rules.velocityHigh = juce::jlimit (rules.velocityLow, 127, rules.velocityHigh + zoneTurns[5]);
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("cmd", "setPartMidiRules");
        payload->setProperty ("partId", part.partId);
        payload->setProperty ("keyLow", rules.keyLow);
        payload->setProperty ("keyHigh", rules.keyHigh);
        payload->setProperty ("transpose", rules.transpose);
        payload->setProperty ("velocityLow", rules.velocityLow);
        payload->setProperty ("velocityHigh", rules.velocityHigh);
        service.handleCommand (juce::var (payload));
    }

    if (reducer.page() == layout.live
        && (livePad >= 0 || std::any_of (liveTurns.begin(), liveTurns.end(), [] (int turn) { return turn != 0; })))
        applyLiveTurns (liveTurns, livePad);

    if (reducer.page() == layout.meters)
    {
        // Through the command surface, as the app's mixer sends them: the stage lock refuses
        // them there, gestures are recorded there and the rack is saved there.
        const auto& parts = performance.parts;
        const auto first = metersFirstPart (parts.size(), metersFirst);
        for (int strip = 0; strip < kMetersStrips; ++strip)
        {
            const auto turn = meterTurns[(std::size_t) strip];
            if (turn == 0 || first + strip >= parts.size())
                continue;
            const auto& part = parts.getReference (first + strip);
            auto* payload = new juce::DynamicObject();
            payload->setProperty ("cmd", "setPartMixer");
            payload->setProperty ("partId", part.partId);
            payload->setProperty ("volume", metersNudgeVolume (part.volume, turn));
            service.handleCommand (juce::var (payload));
        }
        if (meterTurns[5] != 0)
        {
            auto* payload = new juce::DynamicObject();
            payload->setProperty ("cmd", "setMasterLevel");
            payload->setProperty ("level", metersNudgeVolume (performance.masterLevel, meterTurns[5]));
            service.handleCommand (juce::var (payload));
        }
    }

    // A held button steps its pad to the next layer once it has been held long enough. The
    // buttons sit one above each pad and are numbered as the pads are, 1..8.
    if (controlPages > 0 && reducer.page() < controlPages)
    {
        const auto pageId = performance.pages.getReference (reducer.page()).pageId;
        const auto now = options.now();
        for (std::size_t slot = 0; slot < switchDownAt.size(); ++slot)
            if (switchDownAt[slot] >= 0.0 && ! switchFired[slot]
                && now - switchDownAt[slot] >= longPressMs)
            {
                switchFired[slot] = true;
                service.cyclePadLayer (pageId, (int) slot + 1);
            }
    }
}

int Ctrl49SurfaceBroker::livePart() const
{
    const auto& performance = service.getRackHost().getPerformance();
    for (int i = 0; i < performance.parts.size(); ++i)
        if (performance.parts.getReference (i).partId == performance.focusedPartId)
            return i;
    return performance.parts.isEmpty() ? -1 : 0;
}

namespace
{
    // The arp's step lane as LIVE edits it: every row the length of the longest (the engine
    // cycles each on its own length, so a shorter row is read cyclically), or sixteen plain
    // steps when nothing is drawn yet.
    std::vector<LiveStep> liveLaneOf (const perf::ArpSettings& arp)
    {
        const auto length = juce::jmax (arp.velocityPattern.size(), arp.octavePattern.size(), arp.ratchetPattern.size(),
                                        juce::jmax (arp.chancePattern.size(), arp.tiePattern.size()));
        const auto at = [] (const juce::Array<int>& row, int i, int fallback)
        {
            return row.isEmpty() ? fallback : row[i % row.size()];
        };
        std::vector<LiveStep> steps;
        for (int i = 0; i < (length > 0 ? length : kLiveSteps); ++i)
            steps.push_back ({ at (arp.velocityPattern, i, 100), at (arp.octavePattern, i, 0),
                               at (arp.ratchetPattern, i, 1), at (arp.chancePattern, i, 100),
                               at (arp.tiePattern, i, 0) != 0 });
        return steps;
    }
} // namespace

void Ctrl49SurfaceBroker::applyLiveTurns (const std::array<int, 8>& turns, int padToggled)
{
    const auto index = livePart();
    if (index < 0)
        return;
    const auto& part = service.getRackHost().getPerformance().parts.getReference (index);
    const auto& arp = part.arp;
    auto* payload = new juce::DynamicObject();
    payload->setProperty ("cmd", "setPartArp");
    payload->setProperty ("partId", part.partId);

    // The step edits: the whole lane, so a lane drawn here is one the app's editor shows as it is.
    const bool stepEdit = padToggled >= 0 || turns[1] != 0 || turns[2] != 0 || turns[3] != 0 || turns[4] != 0;
    if (stepEdit)
    {
        auto steps = liveLaneOf (arp);
        if (padToggled >= 0 && padToggled < (int) steps.size())
        {
            auto& step = steps[(std::size_t) padToggled];
            step.velocity = step.velocity > 0 ? 0 : 100;
        }
        if (juce::isPositiveAndBelow (liveCursor, (int) steps.size()))
        {
            auto& step = steps[(std::size_t) liveCursor];
            step.velocity = juce::jlimit (0, 127, step.velocity + 4 * turns[1]);
            step.octave = juce::jlimit (-2, 2, step.octave + turns[2]);
            step.ratchet = juce::jlimit (1, 4, step.ratchet + turns[3]);
            step.chance = juce::jlimit (0, 100, step.chance + 5 * turns[4]);
        }
        juce::Array<juce::var> velocity, octave, ratchet, chance, tie;
        for (const auto& step : steps)
        {
            velocity.add (step.velocity);
            octave.add (step.octave);
            ratchet.add (step.ratchet);
            chance.add (step.chance);
            tie.add (step.tie ? 1 : 0);
        }
        payload->setProperty ("velocityPattern", velocity);
        payload->setProperty ("octavePattern", octave);
        payload->setProperty ("ratchetPattern", ratchet);
        payload->setProperty ("chancePattern", chance);
        payload->setProperty ("tiePattern", tie);
    }
    if (turns[5] != 0)
        payload->setProperty ("gate", juce::jlimit (0.05, 1.0, (double) arp.gate + 0.05 * turns[5]));
    if (turns[6] != 0)
        payload->setProperty ("stepsPerBeat", liveNextRate (arp.stepsPerBeat, turns[6]));
    if (turns[7] != 0)
    {
        const auto mode = liveNextMode (arp.enabled ? (int) arp.mode : -1, turns[7]);
        payload->setProperty ("enabled", mode >= 0);
        if (mode >= 0)
            payload->setProperty ("mode", juce::String (perf::ArpSettings::modeName ((perf::ArpSettings::Mode) mode)));
    }
    service.handleCommand (juce::var (payload));
}

void Ctrl49SurfaceBroker::forgetPadState()
{
    switchDownAt.fill (-1.0);
    switchFired.fill (false);
    paintedPads.fill (-1);
}

void Ctrl49SurfaceBroker::paintPads()
{
    if (session == nullptr)
        return;

    // On a control page each pad shows its active layer and its state (padLight). The performance
    // and browse pages keep the stock orange they have always had here, because they give the
    // pads meanings of their own. On LAYERS and SOUNDCHECK the pads do nothing, so they are dark;
    // on DISCOVER a pad is lit while there is a row beside it to audition, and on CUE pad 1 is lit
    // while E1 has picked a song for it to go to.
    const auto& performance = service.getRackHost().getPerformance();
    const auto page = reducer.page();
    const auto layout = pages();
    const auto onControlPage = page < layout.control;
    const auto discoverRows = juce::jmin (kDiscoverRows, discoverRead.sounds.size()
                                                         - discoverFirstRow (discoverRead.sounds.size(), discoverSelected));
    // LIVE: each pad is a step of the half of the lane the cursor is in, lit when it plays.
    std::vector<LiveStep> liveSteps;
    if (page == layout.live && livePart() >= 0)
        liveSteps = liveLaneOf (performance.parts.getReference (livePart()).arp);
    for (int pad = 1; pad <= 8; ++pad)
    {
        const auto liveStep = (liveCursor < 8 ? 0 : 8) + pad - 1;
        const auto rgb = page == layout.live ? (liveStep < (int) liveSteps.size()
                                                  && liveSteps[(std::size_t) liveStep].velocity > 0 ? 0xFFA500 : 0)
                       : onControlPage ? service.padLight (performance.pages.getReference (page).pageId, pad,
                                                           reducer.padBank())
                       : page == layout.layers || page == layout.meters || page == layout.soundcheck
                         || page == layout.changes ? 0
                       : page == layout.cue ? (pad == 1 && cuePicked >= 0 ? 0xFFA500 : 0)
                       : page == layout.discover ? (pad <= discoverRows ? 0xFFA500 : 0)
                                                 : 0xFFA500;
        auto& painted = paintedPads[(std::size_t) (pad - 1)];
        if (painted == rgb)
            continue;
        try
        {
            session->setPadRgb (pad, (rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);
            painted = rgb;
        }
        catch (const std::exception&)
        {
            return;   // not ready yet: the next tick tries again, the cache still says unknown
        }
    }
}

void Ctrl49SurfaceBroker::emitScreen (const Bytes& labels, const Bytes& state,
                                      const std::string& stageCall, const Bytes& stage) const
{
    if (options.emit == nullptr)
        return;

    const auto toArray = [] (const Bytes& bytes)
    {
        juce::Array<juce::var> out;
        for (const auto b : bytes)
            out.add ((int) b);
        return juce::var (out);
    };

    const auto layout = pages();
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("labels", toArray (labels));
    obj->setProperty ("values", toArray (state));
    // A stage page is one call with one payload (set_layers, set_check) instead of the two.
    obj->setProperty ("call", juce::String (stageCall));
    obj->setProperty ("payload", toArray (stage));
    obj->setProperty ("pageIndex", reducer.page());
    obj->setProperty ("pageCount", layout.count);
    obj->setProperty ("pageKind", reducer.page() == layout.browse        ? "browse"
                                : reducer.page() == layout.performance   ? "performance"
                                : reducer.page() == layout.layers        ? "layers"
                                : reducer.page() == layout.meters        ? "meters"
                                : reducer.page() == layout.live          ? "live"
                                : reducer.page() == layout.soundcheck    ? "soundcheck"
                                : reducer.page() == layout.discover      ? "discover"
                                : reducer.page() == layout.cue           ? "cue"
                                : reducer.page() == layout.changes       ? "changes"
                                                                         : "control");
    // Which control page it is, so the app can set a slot by typing its value.
    const auto& performance = service.getRackHost().getPerformance();
    obj->setProperty ("pageId", reducer.page() < layout.control
                                  ? performance.pages.getReference (reducer.page()).pageId
                                  : juce::String());
    // Whether the keyboard is showing this too, or only the app is.
    obj->setProperty ("onKeyboard", currentState == State::connected);
    options.emit ("instrumentHostSurfaceScreen", juce::var (obj));
}

void Ctrl49SurfaceBroker::refreshDisplay (bool toHardware)
{
    const auto& performance = service.getRackHost().getPerformance();
    const auto layout = pages();
    const auto controlPages = layout.control;
    const auto performancePage = layout.performance;

    Bytes labels, state, stage;
    std::string stageCall;

    if (reducer.page() == layout.live)
    {
        // The keys as they are played, and the focused part's arp lane with its playhead.
        const auto& parts = performance.parts;
        const auto index = livePart();
        LiveView view;
        for (int i = 0; i < parts.size(); ++i)
        {
            const auto& part = parts.getReference (i);
            const auto name = part.lastPresetName.isNotEmpty() ? part.lastPresetName
                            : part.pluginName.isNotEmpty()     ? part.pluginName
                            : part.midiOutputName.isNotEmpty() ? part.midiOutputName
                                                               : "Part " + juce::String (i + 1);
            view.zones.push_back ({ name.toStdString(), part.midi.keyLow, part.midi.keyHigh,
                                    part.enabled && ! part.mute && part.midiSourcePartId.isEmpty() });
            if (i == index)
                view.part = name.toStdString();
        }
        view.focused = index;
        for (const auto& [note, velocity] : service.surfaceHeldNotes())
            view.held.push_back (note);
        if (index >= 0)
        {
            const auto& part = parts.getReference (index);
            const auto& arp = part.arp;
            view.arpOn = arp.enabled;
            view.mode = (int) arp.mode;
            view.stepsPerBeat = arp.stepsPerBeat;
            view.gate = juce::roundToInt (arp.gate * 100.0f);
            view.steps = liveLaneOf (arp);
            view.lane = ! arp.velocityPattern.isEmpty() || ! arp.octavePattern.isEmpty() || ! arp.ratchetPattern.isEmpty()
                     || ! arp.chancePattern.isEmpty() || ! arp.tiePattern.isEmpty();
            if ((int) view.steps.size() > kLiveSteps)
                view.steps.resize ((std::size_t) kLiveSteps);
            view.playing = service.getRackHost().arpLiveStep (part.partId);
            const auto notes = service.getRackHost().arpLiveNotes (part.partId);
            for (int n = 0; n < 128; ++n)
                if (((notes[(std::size_t) (n >> 6)] >> (n & 63)) & 1) != 0)
                    view.arpNotes.push_back (n);
        }
        liveCursor = juce::jlimit (0, juce::jmax (0, (int) view.steps.size() - 1), liveCursor);
        view.cursor = liveCursor;
        view.tempo = service.surfaceTransport().tempo;
        stage = buildLivePayload (view);
        stageCall = "set_live";
    }
    else if (reducer.page() == layout.meters)
    {
        // The rack's own meters, the loudest peak since the last redraw, and the faders.
        const auto meters = service.takeSurfaceMeters();
        MetersView view;
        for (const auto& part : meters.parts)
            view.parts.push_back ({ part.name.toStdString(), part.left, part.right, part.volume,
                                    part.muted, part.enabled });
        metersFirst = metersFirstPart ((int) view.parts.size(), metersFirst);
        view.first = metersFirst;
        view.touched = metersTouched;
        view.masterLeft = meters.masterLeft;
        view.masterRight = meters.masterRight;
        view.masterVolume = meters.masterVolume;
        stage = buildMetersPayload (view);
        stageCall = "set_meters";
    }
    else if (reducer.page() == layout.soundcheck)
    {
        // What the app's soundcheck holds, song by song: checked or not, what the check found,
        // the measured level. E1 moves through the set; it starts on the song on stage.
        const auto songs = service.surfaceSoundcheck();
        const auto current = performance.setlist.currentIndex;
        if (soundcheckSong < 0)
            soundcheckSong = juce::jmax (0, current);
        soundcheckSong = juce::jlimit (0, juce::jmax (0, songs.size() - 1), soundcheckSong);

        SoundcheckView view;
        for (const auto& song : songs)
            view.songs.push_back ({ song.name.toStdString(), song.checked, song.problems.size(),
                                    song.measured, song.rmsDb, song.peakDb,
                                    song.loadSeconds, song.loadTimedOut, song.loadPreloaded });
        view.preloadOff = ! service.setlistPreloadsAhead();
        view.selected = soundcheckSong;
        view.current = current;
        if (! songs.isEmpty())
        {
            const auto& song = songs.getReference (soundcheckSong);
            view.basis = song.basis.toStdString();
            for (const auto& problem : song.problems)
                view.problems.push_back (problem.toStdString());
            view.seconds = song.seconds;
        }
        stage = buildSoundcheckPayload (view);
        stageCall = "set_check";
    }
    else if (reducer.page() == layout.changes)
    {
        // Read twice a second, or when a turn changed it: reading now walks every parameter.
        if (changesStale || options.now() - changesReadMs >= 500.0)
        {
            changesRead = service.surfaceChanges (changesBack);
            changesReadMs = options.now();
            changesStale = false;
            changesBack = changesRead.back;
        }
        const auto& read = changesRead;
        changesSelected = juce::jlimit (0, juce::jmax (0, read.changed.size() - 1), changesSelected);
        const auto percent = [] (float v) { return juce::roundToInt (juce::jlimit (0.0f, 1.0f, v) * 100.0f); };
        ChangesView view;
        view.state = read.problem.isNotEmpty() ? ChangesView::problem
                   : read.changed.isEmpty() ? ChangesView::unchanged : ChangesView::changed;
        for (const auto& row : read.changed)
            view.rows.push_back ({ row.name.toStdString(), row.savedText.toStdString(), row.nowText.toStdString(),
                                   percent (row.saved), percent (row.now) });
        view.selected = changesSelected;
        view.total = read.total;
        view.listen = percent (read.listen);
        view.back = read.back;
        view.saves = read.saves;
        view.putBack = (int) changesPutBack.size();
        view.sound = read.sound.toStdString();
        view.against = read.against.toStdString();
        view.when = read.savedAtMs > 0 ? juce::Time (read.savedAtMs).formatted ("%d %b %H:%M").toStdString() : std::string();
        view.problemText = read.problem.toStdString();
        stage = buildChangesPayload (view);
        stageCall = "set_changes";
    }
    else if (reducer.page() == layout.cue)
    {
        const auto read = service.surfaceCue();
        if (cuePicked >= read.songs)
            cuePicked = -1;
        CueView view;
        view.songs = read.songs;
        view.current = read.current;
        view.picked = cuePicked >= 0 ? cuePicked : read.current;
        view.loading = read.loading;
        view.song = read.song.toStdString();
        view.tempo = read.tempo;
        view.songSeconds = read.songSeconds;
        view.setSeconds = read.setSeconds;
        view.plannedSeconds = read.plannedSeconds;
        for (const auto& line : read.notes)
            view.notes.push_back (line.toStdString());
        view.section = read.section.toStdString();
        view.sectionBar = read.sectionBar;
        view.sectionBars = read.sectionBars;
        view.nextSection = read.nextSection.toStdString();
        view.nextSong = read.nextSong.toStdString();
        view.nextReady = read.nextReady;
        if (cuePicked >= 0)
            view.pickedSong = read.names[cuePicked].toStdString();
        stage = buildCuePayload (view);
        stageCall = "set_cue";
    }
    else if (reducer.page() == layout.discover)
    {
        // Read again when a turn changed what it should hold, else every two seconds: loads and
        // measurements elsewhere change it, but not from one redraw to the next.
        if (discoverStale || options.now() - discoverReadMs >= 2000.0)
        {
            discoverRead = service.surfaceDiscover (discoverKind, 48);
            discoverReadMs = options.now();
            discoverStale = false;
            if (discoverKind.isNotEmpty() && ! discoverRead.kinds.contains (discoverKind))
            {
                discoverKind = {};                 // that kind has nothing left: back to all
                discoverRead = service.surfaceDiscover (discoverKind, 48);
            }
        }
        const auto& read = discoverRead;
        discoverSelected = juce::jlimit (0, juce::jmax (0, read.sounds.size() - 1), discoverSelected);

        const auto at = [] (float brightness, float attack)
        {
            return DiscoverPoint { juce::roundToInt (brightness * 100.0f), juce::roundToInt (attack * 100.0f) };
        };
        DiscoverView view;
        view.state = ! read.enough ? DiscoverView::notEnough
                   : read.sounds.isEmpty() ? DiscoverView::nothingNew : DiscoverView::suggestions;
        for (const auto& sound : read.sounds)
            view.sounds.push_back ({ sound.name.toStdString(), sound.instrument.toStdString(),
                                     at (sound.brightness, sound.attack), sound.percent, sound.kept });
        view.selected = discoverSelected;
        view.neverOpened = read.neverOpened;
        view.regularsCounted = read.regularsCounted;
        view.kind = discoverKind.toUpperCase().toStdString();
        view.centre = at (read.centreBrightness, read.centreAttack);
        for (const auto& [brightness, attack] : read.regulars)
            view.regulars.push_back (at (brightness, attack));
        if (! read.sounds.isEmpty())
        {
            const auto& sound = read.sounds.getReference (discoverSelected);
            view.likeName = sound.likeName.toStdString();
            view.likeLoads = sound.likeLoads;
        }
        stage = buildDiscoverPayload (view);
        stageCall = "set_discover";
    }
    else if (reducer.page() == layout.layers)
    {
        // Every part's zone over the keys, and the notes held now. E1 moves through the parts;
        // it starts on the rack's focused part.
        const auto& parts = performance.parts;
        if (layersPart < 0)
        {
            layersPart = 0;
            for (int i = 0; i < parts.size(); ++i)
                if (parts.getReference (i).partId == performance.focusedPartId)
                    layersPart = i;
        }
        layersPart = juce::jlimit (0, juce::jmax (0, parts.size() - 1), layersPart);

        LayersView view;
        for (int i = 0; i < parts.size(); ++i)
        {
            const auto& part = parts.getReference (i);
            // A part has no name of its own: its sound, else its plug-in, else its port.
            const auto name = part.lastPresetName.isNotEmpty() ? part.lastPresetName
                            : part.pluginName.isNotEmpty()     ? part.pluginName
                            : part.midiOutputName.isNotEmpty() ? part.midiOutputName
                                                               : "Part " + juce::String (i + 1);
            LayersPartView row { name.toStdString(), part.midi.keyLow, part.midi.keyHigh,
                                 part.midi.velocityLow, part.midi.velocityHigh, part.midi.transpose,
                                 part.enabled, part.mute, part.midiSourcePartId.isEmpty() };
            // Its layer group, if an enabled one holds it: what it reads and its share of it.
            for (int g = 0; g < performance.layerGroups.size() && row.group == 0; ++g)
            {
                const auto& group = performance.layerGroups.getReference (g);
                if (! group.enabled)
                    continue;
                for (const auto& member : group.members)
                    if (member.partId == part.partId)
                    {
                        static const juce::StringArray sources { "velocity", "key", "cc", "expression", "macro" };
                        static const juce::StringArray allocations { "all", "roundRobin", "leastBusy" };
                        row.group = g + 1;
                        row.source = juce::jmax (0, sources.indexOf (group.source));
                        row.allocation = juce::jmax (0, allocations.indexOf (group.allocation));
                        row.layerLow = juce::roundToInt (member.minimum * 127.0f);
                        row.layerHigh = juce::roundToInt (member.maximum * 127.0f);
                        row.layerFade = juce::roundToInt (member.crossfade * 127.0f);
                    }
            }
            view.parts.push_back (row);
        }
        view.focused = layersPart;
        for (const auto& [note, velocity] : service.surfaceHeldNotes())
            view.held.push_back ({ note, velocity });
        stage = buildLayersPayload (view);
        stageCall = "set_layers";
    }
    else if (reducer.page() == layout.browse)
    {
        // No new page on the device: a row of results is eight labels and eight knob positions,
        // which is what this page already draws (see browseSlotViews), and set_values says it is
        // the browser so the rings carry no numbers (buildBrowseStatePayload).
        const auto hardware = service.browseSurface();
        const auto cursor = service.browsePosition();
        const auto results = service.browseResults();
        const auto rows = surface::browseWindow (results, cursor,
                                                 juce::jmax (1, hardware.displayRows));
        const auto views = browseSlotViews (rows, cursor.index - cursor.firstVisible,
                                            hardware.displayColumns);

        labels = buildRackLabelPayload (browseTitleForDisplay (surface::browseTitle (
                                            service.browseFacets(), cursor.index, (int) results.size())),
                                        views);
        const auto row = cursor.index - cursor.firstVisible;
        state = buildBrowseStatePayload (juce::jlimit (0, 7, row), views,
                                         row >= 0 && row < (int) rows.size() ? browseLineForDisplay (rows[(std::size_t) row])
                                                                             : std::string());
    }
    else if (reducer.page() == performancePage)
    {
        const auto t = service.surfaceTransport();
        PerformanceTransportView transport { t.playing, t.tempo, t.bar, t.beat, t.beatsPerBar,
                                             t.externalClock, t.clockLost,
                                             t.song.toStdString(), t.scene.toStdString() };

        PerformanceClipViews clipViews {};
        if (reducer.padBank() == 1)
        {
            const auto scenes = service.surfaceSceneNames();
            for (int i = 0; i < juce::jmin (8, scenes.size()); ++i)
                clipViews[(std::size_t) i] = { scenes[i].toStdString(), false, false, 0.0f };
        }
        else
        {
            const auto clips = service.surfaceClips();
            for (int i = 0; i < juce::jmin (8, clips.size()); ++i)
            {
                const auto& c = clips.getReference (i);
                clipViews[(std::size_t) i] = { c.name.toStdString(), c.active, c.pending, c.phase };
            }
        }

        labels = buildPerformanceLabelPayload (transport, clipViews);
        state = buildPerformanceStatePayload (reducer.activeSlot(), clipViews, transport);
    }
    else if (controlPages > 0 && reducer.page() < controlPages)
    {
        const auto& page = performance.pages.getReference (reducer.page());
        const auto slots = service.surfaceSlots (page.pageId);
        RackSlotViews views {};
        for (int i = 0; i < juce::jmin (8, slots.size()); ++i)
        {
            const auto& s = slots.getReference (i);
            views[(std::size_t) i] = { s.displayName.toStdString(),
                                       (int) std::lround (s.position * 127.0f),
                                       s.assigned, s.resolved, s.valueText.toStdString() };
        }

        labels = buildRackLabelPayload ((page.name + service.surfaceChordTitle (reducer.padBank()))
                                            .toStdString(), views);
        // With each knob's value as the plug-in writes it, and which page of how many: the page
        // shows "2.40 kHz" rather than 88, and the page number in its bottom strip.
        state = buildRackStatePayload (reducer.activeSlot(), views, reducer.page() + 1, controlPages);
    }

    // Only bytes that changed travel — the display link is slow and redraws flicker.
    if (toHardware && session != nullptr)
    {
        if (! stage.empty())
        {
            if (stage != lastStage || stageCall != lastStageCall)
            {
                session->callLua (stageCall, stage, true);
                lastStage = stage;
                lastStageCall = stageCall;
                lastLabels.clear();      // the knob page is sent whole when it comes back
                lastState.clear();
            }
        }
        else
        {
            if (! labels.empty() && labels != lastLabels)
            {
                session->callLua ("set_labels", labels, false);
                lastLabels = labels;
                lastStage.clear();
            }
            if (! state.empty() && state != lastState)
            {
                session->callLua ("set_values", state, true);
                lastState = state;
                lastStage.clear();
            }
        }
    }

    // The app's screen gets the same bytes on the same rule. Emitting after the keyboard
    // was sent to keeps the device first in line; the order a person sees them in is the
    // order they happened.
    // A keyboard arriving or leaving changes nothing on the page, but it changes what the app
    // says about it — so that alone is a reason to send.
    const auto onKeyboard = currentState == State::connected;
    const auto knobPage = ! labels.empty() && ! state.empty();
    if ((knobPage && (labels != shownLabels || state != shownState || onKeyboard != shownOnKeyboard
                      || ! shownStage.empty()))
        || (! stage.empty() && (stage != shownStage || onKeyboard != shownOnKeyboard)))
    {
        shownOnKeyboard = onKeyboard;
        emitScreen (labels, state, stageCall, stage);
        shownLabels = std::move (labels);
        shownState = std::move (state);
        shownStage = std::move (stage);
    }
}

} // namespace ceditor::ctrl49
