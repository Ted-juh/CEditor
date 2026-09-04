#include "Ctrl49SurfaceBroker.h"
#include "Ctrl49RackDisplay.h"
#include "Ctrl49PerformanceDisplay.h"

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
    options.emit ("instrumentHostSurface", juce::var (obj));
}

void Ctrl49SurfaceBroker::joinWorker()
{
    if (worker.joinable())
        worker.join();
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
        juce::String failure;
        try
        {
            if (options.discover != nullptr)
                found = options.discover();
        }
        catch (const std::exception& e)
        {
            failure = e.what();
        }

        const std::scoped_lock lock (handoffLock);
        discovered = std::move (found);
        workerFailure = failure;
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
            sessionOptions.sleep = options.sessionSleep;
            session = std::make_unique<Ctrl49Session> (*endpoints->output, options.pageLua,
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
    lastState.clear();
    triedPageGeneration = false;
    lastAttemptMs = options.now();
    enter (next, why);
}

void Ctrl49SurfaceBroker::tick()
{
    const auto now = options.now();

    switch (currentState)
    {
        case State::searching:
        case State::heldElsewhere:
        case State::failed:
        {
            // Collect a finished discovery, or start one when the poll is due and no worker
            // is out. §17.4: this never blocks — absence costs one cheap check per interval.
            bool done = false;
            std::unique_ptr<Ctrl49SurfaceEndpoints> found;
            juce::String failure;
            {
                const std::scoped_lock lock (handoffLock);
                if (workerDone)
                {
                    done = true;
                    workerDone = false;
                    found = std::move (discovered);
                    failure = workerFailure;
                }
            }

            if (done)
            {
                joinWorker();

                if (found == nullptr)
                {
                    enter (currentState == State::heldElsewhere ? State::heldElsewhere
                                                                : State::searching,
                           failure.isNotEmpty() ? failure : statusDetail);
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

            if (! ready)
            {
                disconnect (failure.isNotEmpty() ? failure : "the startup sequence failed",
                            State::failed);
                return;
            }

            reducer = Ctrl49Reducer();
            enter (State::connected, endpoints->description);
            lastDisplayMs = 0.0;   // paint immediately
            return;
        }

        case State::connected:
        {
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
            if (! triedPageGeneration && ! service.isStageLocked() && performance.pages.isEmpty()
                && performance.focusedPartId.isNotEmpty()
                && service.getRackHost().partHasInstrument (performance.focusedPartId))
            {
                triedPageGeneration = true;
                auto* payload = new juce::DynamicObject();
                payload->setProperty ("cmd", "generateControlPages");
                payload->setProperty ("partId", performance.focusedPartId);
                service.handleCommand (juce::var (payload));
            }

            pumpInput();

            if (now - lastDisplayMs >= options.displayIntervalMs)
            {
                lastDisplayMs = now;
                refreshDisplay();
            }
            return;
        }
    }
}

void Ctrl49SurfaceBroker::pumpInput()
{
    const auto& performance = service.getRackHost().getPerformance();
    const auto controlPages = juce::jmin (Ctrl49Reducer::kPageCount - 1, performance.pages.size());
    const auto performancePage = controlPages;
    const auto pageBeforeCountChange = reducer.page();
    reducer.setPageCount (controlPages + 1);
    if (pageBeforeCountChange != reducer.page())
        emitStatus();

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
                    emitStatus();
                }
                break;
            }

    service.noteSurfacePage (reducer.page() < controlPages
        ? performance.pages.getReference (reducer.page()).pageId : juce::String());

    for (auto message = endpoints->dequeueInput(); message; message = endpoints->dequeueInput())
    {
        const auto previousPage = reducer.page();
        const auto previousSlot = reducer.activeSlot();
        const auto previousBank = reducer.padBank();
        const auto action = reducer.process (message->data(), message->size());
        if (! action)
            continue;

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
            service.noteSurfacePage (reducer.page() < controlPages
                ? performance.pages.getReference (reducer.page()).pageId : juce::String());

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
                    SurfaceEncoder::probability, SurfaceEncoder::tempo,
                };
                service.nudgePerformanceEncoder (
                    encoders[(std::size_t) juce::jlimit (0, 7, action->encoderSlot)],
                    action->encoderDelta);
            }
        }
        else if (controlPages > 0 && action->encoderMoved)
        {
            const auto& page = performance.pages.getReference (reducer.page());
            service.nudgeControlSlot (page.pageId,
                                      "s" + juce::String (action->encoderSlot + 1),
                                      action->encoderDelta);
        }
    }
}

void Ctrl49SurfaceBroker::refreshDisplay()
{
    const auto& performance = service.getRackHost().getPerformance();
    const auto controlPages = juce::jmin (Ctrl49Reducer::kPageCount - 1, performance.pages.size());
    const auto performancePage = controlPages;

    Bytes labels, state;

    if (reducer.page() == performancePage)
    {
        const auto t = service.surfaceTransport();
        PerformanceTransportView transport { t.playing, t.tempo, t.bar, t.beat,
                                             t.externalClock, t.clockLost };

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
        state = buildPerformanceStatePayload (reducer.activeSlot(), clipViews);
    }
    else if (controlPages > 0)
    {
        const auto& page = performance.pages.getReference (reducer.page());
        const auto slots = service.surfaceSlots (page.pageId);
        RackSlotViews views {};
        for (int i = 0; i < juce::jmin (8, slots.size()); ++i)
        {
            const auto& s = slots.getReference (i);
            views[(std::size_t) i] = { s.displayName.toStdString(),
                                       (int) std::lround (s.position * 127.0f),
                                       s.assigned, s.resolved };
        }

        labels = buildRackLabelPayload (page.name.toStdString(), views);
        state = buildRackStatePayload (reducer.activeSlot(), views);
    }

    // Only bytes that changed travel — the display link is slow and redraws flicker.
    if (! labels.empty() && labels != lastLabels)
    {
        session->callLua ("set_labels", labels, false);
        lastLabels = std::move (labels);
    }
    if (! state.empty() && state != lastState)
    {
        session->callLua ("set_values", state, true);
        lastState = std::move (state);
    }
}

} // namespace ceditor::ctrl49
