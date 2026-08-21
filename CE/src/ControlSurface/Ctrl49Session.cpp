#include "Ctrl49Session.h"

#include <chrono>

namespace ceditor::ctrl49
{

namespace
{
    constexpr int kKeepaliveTickMs = 10;

    void defaultSleep (int milliseconds)
    {
        std::this_thread::sleep_for (std::chrono::milliseconds (milliseconds));
    }

    Bytes padOrangeFrame (std::uint8_t pad)
    {
        return buildPadRgb (pad, 255, 165, 0);  // captured VIP profile
    }
} // namespace

std::vector<Ctrl49Session::TimedFrame>
Ctrl49Session::buildStartupSequence (const Bytes& rawLua, const std::vector<PngAsset>& assets)
{
    const ObjectKey key { kObjectTypeLua, kLuaObjectId };
    const std::vector<Bytes> objectFrames = buildObjectUpload (key, rawLua);

    // PNG assets: raw file bytes + one NUL terminator, per the object convention.
    std::vector<std::vector<Bytes>> assetFrames;
    assetFrames.reserve (assets.size());
    std::size_t assetFrameCount = 0;
    for (const auto& asset : assets)
    {
        Bytes raw = asset.png;
        raw.push_back (0x00);
        assetFrames.push_back (buildObjectUpload (ObjectKey { kObjectTypePng, asset.id }, raw));
        assetFrameCount += assetFrames.back().size();
    }

    std::vector<TimedFrame> sequence;
    sequence.reserve (objectFrames.size() + assetFrameCount + 24);

    sequence.push_back ({ buildIdentityQuery(), 2 });
    sequence.push_back ({ buildKeepalive(), 2 });

    // Replay-preserved setup frames; vendor names unknown, bytes proven.
    sequence.push_back ({ buildFrame (0x04, 0x01, { 0x0E, 0x40, 0x00, 0x00, 0x02 }), 2 });

    sequence.push_back ({ buildSceneBegin (0x20), 2 });
    sequence.push_back ({ buildCreateTarget (kTarget), 2 });

    // The replay begins the splash object at this point.
    sequence.push_back ({ objectFrames.front(), 2 });

    sequence.push_back ({ buildSetLayerPosition (0x20, kTarget, 0, 0), 2 });
    sequence.push_back ({ buildFrame (0x01, 0x00, { 0x01, 0x7F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 }), 2 });
    sequence.push_back ({ buildSceneActivate (0x20), 2 });

    // Proven controller/LED setup: bank A selected, pads to the captured orange profile.
    sequence.push_back ({ buildLedLevel (kLedPadBankA, kLedOn), 1 });
    sequence.push_back ({ buildLedLevel (kLedPadBankB, kLedOff), 1 });
    sequence.push_back ({ buildLedLevel (kLedPadBankC, kLedOff), 1 });
    sequence.push_back ({ buildLedLevel (kLedPadBankD, kLedOff), 1 });
    for (std::uint8_t pad = 1; pad <= 8; ++pad)
        sequence.push_back ({ padOrangeFrame (pad), 1 });
    sequence.push_back ({ buildFrame (0x04, 0x02, { 0x0A }), 2 });

    sequence.push_back ({ buildIdentityQuery(), 2 });

    for (std::size_t index = 1; index < objectFrames.size(); ++index)
        sequence.push_back ({ objectFrames[index], 2 });

    // Upload PNG assets before bind/init so the page's decode_image calls succeed.
    for (const auto& frames : assetFrames)
        for (const auto& frame : frames)
            sequence.push_back ({ frame, 2 });

    sequence.push_back ({ buildBindLua (kTarget, kLuaObjectId), 8 });
    sequence.push_back ({ buildLuaCall (kTarget, "init", {}), 3 });
    sequence.push_back ({ buildDraw (kTarget, {}), 3 });

    return sequence;
}

Ctrl49Session::Ctrl49Session (IControllerOutput& output, Bytes rawLua, Ctrl49SessionOptions options)
    : Ctrl49Session (output, std::move (rawLua), {}, std::move (options))
{
}

Ctrl49Session::Ctrl49Session (IControllerOutput& output, Bytes rawLua,
                              std::vector<PngAsset> assets, Ctrl49SessionOptions options)
    : output_ (output), rawLua_ (std::move (rawLua)),
      assets_ (std::move (assets)), options_ (std::move (options))
{
    if (! options_.sleep)
        options_.sleep = defaultSleep;
    if (! options_.log)
        options_.log = [] (const std::string&) {};
}

Ctrl49Session::~Ctrl49Session()
{
    stop();
}

std::string Ctrl49Session::failure() const
{
    std::lock_guard<std::mutex> lock (failureMutex_);
    return failure_;
}

void Ctrl49Session::sendLocked (const Bytes& frame)
{
    output_.sendSysEx (frame);
}

void Ctrl49Session::start()
{
    if (ready_.load() || keepaliveThread_.joinable())
        throw std::logic_error ("CTRL49 session already started");

    stopRequested_.store (false);

    options_.log ("Starting CTRL49 display session: uploading one original Lua page.");
    {
        std::lock_guard<std::mutex> lock (midiMutex_);
        for (const auto& step : buildStartupSequence (rawLua_, assets_))
        {
            sendLocked (step.frame);
            if (step.pauseMs > 0)
                options_.sleep (step.pauseMs);
        }
    }

    options_.log ("Loading page displayed.");
    if (options_.loadingMilliseconds > 0)
        options_.sleep (options_.loadingMilliseconds);

    {
        std::lock_guard<std::mutex> lock (midiMutex_);
        sendLocked (buildKeepalive());
        options_.sleep (2);
        sendLocked (buildLuaCall (kTarget, "set_mode", { 0x01 }));
        options_.sleep (3);
        sendLocked (buildDraw (kTarget, { 0x01 }));
        options_.sleep (3);
    }

    ready_.store (true);
    options_.log ("Landing page displayed; session ready.");

    keepaliveThread_ = std::thread (&Ctrl49Session::keepaliveLoop, this);
}

void Ctrl49Session::keepaliveLoop()
{
    using clock = std::chrono::steady_clock;
    auto next = clock::now() + std::chrono::milliseconds (kKeepaliveIntervalMs);

    while (! stopRequested_.load())
    {
        if (clock::now() < next)
        {
            defaultSleep (kKeepaliveTickMs);
            continue;
        }
        try
        {
            std::lock_guard<std::mutex> lock (midiMutex_);
            sendLocked (buildKeepalive());
        }
        catch (const std::exception& error)
        {
            std::lock_guard<std::mutex> lock (failureMutex_);
            failure_ = std::string ("keepalive failed: ") + error.what();
            ready_.store (false);
            return;
        }
        next += std::chrono::milliseconds (kKeepaliveIntervalMs);
    }
}

void Ctrl49Session::stop()
{
    if (stopRequested_.exchange (true))
    {
        if (keepaliveThread_.joinable())
            keepaliveThread_.join();
        return;
    }

    if (keepaliveThread_.joinable())
        keepaliveThread_.join();

    if (ready_.load())
    {
        // Restore the captured VIP pad profile so the keyboard looks stock when the
        // watchdog returns it to its normal screen.
        try
        {
            std::lock_guard<std::mutex> lock (midiMutex_);
            for (std::uint8_t pad = 1; pad <= 8; ++pad)
                sendLocked (padOrangeFrame (pad));
        }
        catch (const std::exception&)
        {
            // Teardown is best-effort; the device watchdog recovers regardless.
        }
    }

    ready_.store (false);
    options_.log ("CTRL49 session stopped; keyboard watchdog may restore the normal screen.");
}

void Ctrl49Session::callLua (const std::string& function, const Bytes& args, bool redraw)
{
    if (! ready_.load())
        throw std::logic_error ("CTRL49 session is not ready");

    std::lock_guard<std::mutex> lock (midiMutex_);
    sendLocked (buildLuaCall (kTarget, function, args));
    if (redraw)
        sendLocked (buildDraw (kTarget, {}));
}

void Ctrl49Session::setPadRgb (int pad, int red, int green, int blue)
{
    if (! ready_.load())
        throw std::logic_error ("CTRL49 session is not ready");

    std::lock_guard<std::mutex> lock (midiMutex_);
    sendLocked (buildPadRgb (static_cast<std::uint8_t> (pad),
                             static_cast<std::uint8_t> (red),
                             static_cast<std::uint8_t> (green),
                             static_cast<std::uint8_t> (blue)));
}

void Ctrl49Session::setAllPadsRgb (int red, int green, int blue)
{
    if (! ready_.load())
        throw std::logic_error ("CTRL49 session is not ready");

    std::lock_guard<std::mutex> lock (midiMutex_);
    for (std::uint8_t pad = 1; pad <= 8; ++pad)
        sendLocked (buildPadRgb (pad,
                                 static_cast<std::uint8_t> (red),
                                 static_cast<std::uint8_t> (green),
                                 static_cast<std::uint8_t> (blue)));
}

void Ctrl49Session::setActivePadBank (int bank)
{
    if (bank < 0 || bank > 3)
        throw std::invalid_argument ("pad bank out of range 0..3");
    if (! ready_.load())
        throw std::logic_error ("CTRL49 session is not ready");

    std::lock_guard<std::mutex> lock (midiMutex_);
    for (int index = 0; index < 4; ++index)
        sendLocked (buildLedLevel (static_cast<std::uint8_t> (kLedPadBankA + index),
                                   index == bank ? kLedOn : kLedOff));
}

} // namespace ceditor::ctrl49
