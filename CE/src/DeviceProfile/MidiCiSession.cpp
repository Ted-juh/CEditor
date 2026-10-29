#include "MidiCiSession.h"

#include <juce_midi_ci/juce_midi_ci.h>

#include <map>
#include <optional>

namespace ceditor::device
{

namespace ci = juce::midi_ci;

// Impl is both the Device's output sink (DeviceMessageHandler) and its event listener
// (DeviceListener), so the whole MIDI-CI session lives in one object the Device can reference.
struct MidiCiSession::Impl : public ci::DeviceMessageHandler,
                             public ci::DeviceListener
{
    SendSysex send;
    OnDeviceInfo onDeviceInfo;
    std::optional<ci::Device> device;
    std::map<uint32_t, std::map<juce::String, juce::var>> fetched; // muid -> resource -> decoded JSON

    // ---- ce.ci: requests, subscriptions and profile inquiries a script is waiting on ----
    struct Request
    {
        int id = 0;
        uint32_t muid = 0;
        bool isSet = false;
        ci::PropertyRequestHeader header;
        std::vector<std::byte> body;
        Answer done;
        double deadline = 0.0;
        std::optional<ci::RequestKey> key;
    };
    struct Subscription
    {
        uint32_t muid = 0;
        ci::SubscriptionKey key;
        Answer update;
        bool accepted = false;
    };
    Events events;
    std::vector<std::shared_ptr<Request>> requests;            // in the order asked
    std::map<int, Subscription> subscriptions;
    std::map<uint32_t, std::vector<Answer>> profileWaiters;
    int nextId = 1;
    std::function<double()> clock = [] { return juce::Time::getMillisecondCounterHiRes(); };

    Impl (SendSysex sendIn, OnDeviceInfo onInfoIn)
        : send (std::move (sendIn)), onDeviceInfo (std::move (onInfoIn))
    {
        juce::Random random;
        random.setSeedRandomly();

        // We act as an initiator that can run Property Exchange against responders.
        const auto features = ci::DeviceFeatures().withPropertyExchangeSupported (true);

        // Our own identity. 0x7D is the SysEx "educational / non-commercial" manufacturer id — correct
        // for a tool that isn't a registered MIDI manufacturer.
        const juce::ump::DeviceInfo info {
            { std::byte { 0x7D }, std::byte { 0x00 }, std::byte { 0x00 } }, // manufacturer (LSB first)
            { std::byte { 0x00 }, std::byte { 0x00 } },                     // family
            { std::byte { 0x00 }, std::byte { 0x00 } },                     // model
            { std::byte { 0x00 }, std::byte { 0x00 }, std::byte { 0x00 }, std::byte { 0x00 } } // revision
        };

        const auto options = ci::DeviceOptions()
                                  .withOutputs ({ this })
                                  .withDeviceInfo (info)
                                  .withFeatures (features)
                                  .withProductInstanceId (ci::DeviceOptions::makeProductInstanceId (random));

        device.emplace (options);
        device->addListener (*this);
    }

    ~Impl() override
    {
        if (device.has_value())
            device->removeListener (*this);
    }

    // ---- DeviceMessageHandler: the Device wishes to SEND a MIDI-CI message ----
    void processMessage (juce::ump::BytesOnGroup msg) override
    {
        if (send)
            send (juce::MidiMessage::createSysExMessage (msg.bytes));
    }

    // ---- DeviceListener: a device replied to our Discovery ----
    void deviceAdded (ci::MUID m) override
    {
        if (device.has_value())
        {
            // Only a device that says it has property exchange is asked about it.
            const auto info = device->getDiscoveryInfoForMuid (m);
            if (! info.has_value() || ci::DeviceFeatures (info->capabilities).isPropertyExchangeSupported())
                device->sendPropertyCapabilitiesInquiry (m); // auto-fetches ResourceList -> DeviceInfo + ChannelList
        }
        if (events.added) events.added (m.get());
    }

    void deviceRemoved (ci::MUID m) override
    {
        endDevice (m.get(), "the device is gone");
        if (events.removed) events.removed (m.get());
    }

    void profileEnablementChanged (ci::MUID m, ci::ChannelInGroup destination, ci::Profile profile, int numChannels) override
    {
        if (events.profileChanged) events.profileChanged (m.get(), hexOf (profile), channelNumber (destination), numChannels > 0);
    }

    void profileStateReceived (ci::MUID m, ci::ChannelInGroup destination) override
    {
        if (destination != ci::ChannelInGroup::wholeBlock) return;
        const auto it = profileWaiters.find (m.get());
        if (it == profileWaiters.end()) return;
        const auto waiting = std::move (it->second);
        profileWaiters.erase (it);
        const auto list = profilesOf (m.get());
        for (const auto& done : waiting) if (done) done (list);
    }

    void propertySubscriptionChanged (ci::SubscriptionKey key, const std::optional<juce::String>& subscribeId) override
    {
        for (auto it = subscriptions.begin(); it != subscriptions.end(); ++it)
        {
            if (it->second.key != key) continue;
            if (subscribeId.has_value()) { it->second.accepted = true; return; }
            // Ended: by the device, or never begun (the device refused).
            auto sub = std::move (it->second);
            subscriptions.erase (it);
            auto* o = new juce::DynamicObject();
            o->setProperty ("command", "end");
            o->setProperty ("ok", sub.accepted);
            if (! sub.accepted) o->setProperty ("message", "the device did not take the subscription");
            if (sub.update) sub.update (juce::var (o));
            return;
        }
    }

    void propertySubscriptionDataReceived (ci::MUID m, const ci::PropertySubscriptionData& data) override
    {
        if (! device.has_value()) return;
        for (auto it = subscriptions.begin(); it != subscriptions.end(); ++it)
        {
            if (it->second.muid != m.get()) continue;
            const auto id = device->getSubscribeIdForKey (it->second.key);
            if (! id.has_value() || *id != data.header.subscribeId) continue;
            const auto command = juce::String (ci::PropertySubscriptionCommandUtils::toString (data.header.command));
            auto* o = new juce::DynamicObject();
            o->setProperty ("command", command);
            o->setProperty ("ok", true);
            const auto bytes = ci::Encodings::decode (data.body, data.header.mutualEncoding);
            if (! bytes.empty()) o->setProperty ("body", bodyFor (bytes, data.header.mediaType));
            const auto update = it->second.update;
            if (command == "end") subscriptions.erase (it);
            if (update) update (juce::var (o));
            return;
        }
    }

    // ---- helpers ----
    static juce::String hexOf (juce::Span<const std::byte> bytes)
    {
        juce::StringArray parts;
        for (const auto b : bytes) parts.add (juce::String::toHexString ((int) (uint8_t) b).paddedLeft ('0', 2).toUpperCase());
        return parts.joinIntoString (" ");
    }
    static juce::String hexOf (const ci::Profile& p) { return hexOf (juce::Span<const std::byte> (p.data(), p.size())); }

    static int channelNumber (ci::ChannelInGroup c)
    {
        const auto n = (int) c;
        return n < 16 ? n + 1 : 0;
    }

    /** A body as a script works with it: JSON as a value, text as text, anything else as bytes. */
    static juce::var bodyFor (const std::vector<std::byte>& bytes, const juce::String& mediaType)
    {
        const juce::Span<const std::byte> span (bytes.data(), bytes.size());
        if (mediaType.isEmpty() || mediaType.containsIgnoreCase ("json"))
        {
            const auto text = ci::Encodings::stringFrom7BitText (span);
            juce::var parsed;
            if (juce::JSON::parse (text, parsed).wasOk()) return parsed;
            return text;
        }
        if (mediaType.startsWithIgnoreCase ("text/"))
            return juce::String::fromUTF8 ((const char*) bytes.data(), (int) bytes.size());
        juce::Array<juce::var> out;
        for (const auto b : bytes) out.add ((int) (uint8_t) b);
        return out;
    }

    static juce::var answer (bool ok, int status, const juce::String& message)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("ok", ok);
        o->setProperty ("status", status);
        o->setProperty ("message", message);
        return juce::var (o);
    }

    juce::var resultFor (const ci::PropertyExchangeResult& result) const
    {
        if (const auto error = result.getError())
        {
            const auto why = *error == ci::PropertyExchangeResult::Error::partial ? "the device ended the reply before it was whole"
                           : *error == ci::PropertyExchangeResult::Error::notify ? "the device cancelled the request"
                           : "too many requests at once";
            return answer (false, 0, why);
        }
        const auto header = result.getHeaderAsReplyHeader();
        auto out = answer (header.status >= 200 && header.status < 300, header.status, header.message);
        const auto bytes = ci::Encodings::decode (result.getBody(), header.mutualEncoding);
        out.getDynamicObject()->setProperty ("mediaType", header.mediaType);
        if (! bytes.empty()) out.getDynamicObject()->setProperty ("body", bodyFor (bytes, header.mediaType));
        return out;
    }

    juce::var profilesOf (uint32_t muid) const
    {
        juce::Array<juce::var> out;
        if (! device.has_value()) return out;
        std::vector<ci::ChannelInGroup> addresses { ci::ChannelInGroup::wholeBlock };
        for (int c = 0; c < 16; ++c) addresses.push_back ((ci::ChannelInGroup) c);
        for (const auto address : addresses)
        {
            const auto* states = device->getProfileStateForMuid (ci::MUID::makeUnchecked (muid), ci::ChannelAddress {}.withChannel (address));
            if (states == nullptr) continue;
            const auto add = [&] (const ci::Profile& p, bool enabled)
            {
                auto* o = new juce::DynamicObject();
                o->setProperty ("id", hexOf (p));
                const auto channel = channelNumber (address);
                o->setProperty ("address", channel == 0 ? juce::var ("device") : juce::var (channel));
                o->setProperty ("enabled", enabled);
                out.add (juce::var (o));
            };
            for (const auto& p : states->getActive()) add (p, true);
            for (const auto& p : states->getInactive()) add (p, false);
        }
        return out;
    }

    int inFlight (uint32_t muid) const
    {
        int n = 0;
        for (const auto& r : requests) if (r->muid == muid && r->key.has_value()) ++n;
        return n;
    }

    /** Take a request out of the list and answer it. Out first, so an answer that asks again is safe. */
    void finish (const std::shared_ptr<Request>& r, const juce::var& result)
    {
        const auto it = std::find (requests.begin(), requests.end(), r);
        if (it == requests.end()) return;
        requests.erase (it);
        if (r->done) r->done (result);
    }

    /** Send what waits, keeping each device's limit on requests at once. */
    void startWaiting()
    {
        if (! device.has_value()) return;
        for (const auto& r : std::vector<std::shared_ptr<Request>> (requests))
        {
            if (r->key.has_value()) continue;
            const auto m = ci::MUID::makeUnchecked (r->muid);
            const auto limit = juce::jmax (1, device->getNumPropertyExchangeRequestsSupportedForMuid (m).value_or (1));
            if (inFlight (r->muid) >= limit) continue;
            std::weak_ptr<Request> weak = r;
            auto onResult = [this, weak] (const ci::PropertyExchangeResult& result)
            {
                auto request = weak.lock();
                if (request == nullptr) return;
                if (result.getError() == ci::PropertyExchangeResult::Error::tooManyTransactions)
                {
                    request->key.reset();          // waits its turn again
                    return;
                }
                finish (request, resultFor (result));
            };
            r->key = r->isSet ? device->sendPropertySetInquiry (m, r->header, juce::Span<const std::byte> (r->body.data(), r->body.size()), onResult)
                              : device->sendPropertyGetInquiry (m, r->header, onResult);
        }
    }

    void endDevice (uint32_t muid, const juce::String& why)
    {
        for (const auto& r : std::vector<std::shared_ptr<Request>> (requests))
            if (r->muid == muid) finish (r, answer (false, 0, why));
        for (auto it = subscriptions.begin(); it != subscriptions.end();)
        {
            if (it->second.muid != muid) { ++it; continue; }
            const auto update = it->second.update;
            it = subscriptions.erase (it);
            auto* o = new juce::DynamicObject();
            o->setProperty ("command", "end");
            o->setProperty ("ok", true);
            o->setProperty ("message", why);
            if (update) update (juce::var (o));
        }
        profileWaiters.erase (muid);
    }

    // ---- DeviceListener: Property Exchange capabilities (and the standard properties) are ready ----
    void propertyExchangeCapabilitiesReceived (ci::MUID m) override
    {
        if (device.has_value() && onDeviceInfo)
            onDeviceInfo (m.get(), device->getDeviceInfoForMuid (m), device->getChannelListForMuid (m));
    }
};

MidiCiSession::MidiCiSession (SendSysex send, OnDeviceInfo onDeviceInfo)
    : impl (std::make_unique<Impl> (std::move (send), std::move (onDeviceInfo)))
{
}

MidiCiSession::~MidiCiSession() = default;

void MidiCiSession::startDiscovery()
{
    if (impl->device.has_value())
        impl->device->sendDiscovery();
}

void MidiCiSession::handleIncomingSysex (const juce::MidiMessage& message)
{
    if (impl->device.has_value() && message.isSysEx())
        impl->device->processMessage ({ 0, message.getSysExDataSpan() });
}

void MidiCiSession::pump()
{
    if (impl->device.has_value())
        impl->device->sendPendingMessages();
}

uint32_t MidiCiSession::getMuid() const
{
    return impl->device.has_value() ? impl->device->getMuid().get() : 0;
}

std::vector<uint32_t> MidiCiSession::getDiscoveredMuids() const
{
    std::vector<uint32_t> out;
    if (impl->device.has_value())
        for (const auto m : impl->device->getDiscoveredMuids())
            out.push_back (m.get());
    return out;
}

juce::var MidiCiSession::getDeviceInfo (uint32_t muid) const
{
    return impl->device.has_value() ? impl->device->getDeviceInfoForMuid (ci::MUID::makeUnchecked (muid)) : juce::var {};
}

juce::var MidiCiSession::getChannelList (uint32_t muid) const
{
    return impl->device.has_value() ? impl->device->getChannelListForMuid (ci::MUID::makeUnchecked (muid)) : juce::var {};
}

juce::var MidiCiSession::getResourceList (uint32_t muid) const
{
    return impl->device.has_value() ? impl->device->getResourceListForMuid (ci::MUID::makeUnchecked (muid)) : juce::var {};
}

void MidiCiSession::fetchProperty (uint32_t muid, const juce::String& resource)
{
    if (! impl->device.has_value())
        return;

    ci::PropertyRequestHeader header;
    header.resource = resource;

    auto* impl = this->impl.get();
    impl->device->sendPropertyGetInquiry (ci::MUID::makeUnchecked (muid), header,
        [impl, muid, resource] (const ci::PropertyExchangeResult& result)
        {
            if (result.getError().has_value())
                return;
            // Decode the 7-bit-text JSON body (same idiom JUCE's CapabilityInquiry demo uses for
            // property values) and cache it for getFetchedProperty().
            impl->fetched[muid][resource] = ci::Encodings::jsonFrom7BitText (result.getBody());
        });
}

juce::var MidiCiSession::getFetchedProperty (uint32_t muid, const juce::String& resource) const
{
    const auto byMuid = impl->fetched.find (muid);
    if (byMuid == impl->fetched.end())
        return {};
    const auto byResource = byMuid->second.find (resource);
    return byResource == byMuid->second.end() ? juce::var {} : byResource->second;
}

// ---- MIDI-CI Profile Configuration (M2) ----
namespace
{
juce::String profileToHex (const ci::Profile& p)
{
    juce::String s;
    for (const auto b : p)
        s << juce::String::toHexString (static_cast<int> (static_cast<uint8_t> (b))).paddedLeft ('0', 2).toUpperCase() << ' ';
    return s.trim();
}

ci::Profile hexToProfile (const juce::String& hex)
{
    ci::Profile p {};
    const auto toks = juce::StringArray::fromTokens (hex, " ", "");
    for (int i = 0; i < (int) p.size() && i < toks.size(); ++i)
        p[(size_t) i] = static_cast<std::byte> (toks[i].getHexValue32() & 0xff);
    return p;
}

ci::ChannelAddress blockAddress() { return ci::ChannelAddress {}.withChannel (ci::ChannelInGroup::wholeBlock); }
}

void MidiCiSession::inquireProfiles (uint32_t muid)
{
    if (impl->device.has_value())
        impl->device->sendProfileInquiry (ci::MUID::makeUnchecked (muid), ci::ChannelInGroup::wholeBlock);
}

juce::var MidiCiSession::getProfiles (uint32_t muid) const
{
    juce::Array<juce::var> out;
    if (impl->device.has_value())
    {
        if (auto* states = impl->device->getProfileStateForMuid (ci::MUID::makeUnchecked (muid), blockAddress()))
        {
            const auto add = [&out] (const ci::Profile& p, bool active)
            {
                auto* o = new juce::DynamicObject();
                o->setProperty ("id", profileToHex (p));
                o->setProperty ("active", active);
                out.add (juce::var (o));
            };
            for (const auto& p : states->getActive())   add (p, true);
            for (const auto& p : states->getInactive()) add (p, false);
        }
    }
    return out;
}

void MidiCiSession::setProfileEnabled (uint32_t muid, const juce::String& profileHex, bool enabled)
{
    if (impl->device.has_value())
        impl->device->sendProfileEnablement (ci::MUID::makeUnchecked (muid), ci::ChannelInGroup::wholeBlock,
                                             hexToProfile (profileHex), enabled ? 1 : 0);
}

// ---- ce.ci ----
void MidiCiSession::setEvents (Events events) { impl->events = std::move (events); }

juce::var MidiCiSession::describe (uint32_t muid) const
{
    if (! impl->device.has_value()) return {};
    const auto m = ci::MUID::makeUnchecked (muid);
    const auto info = impl->device->getDiscoveryInfoForMuid (m);
    if (! info.has_value()) return {};
    const auto& d = info->device;
    auto* o = new juce::DynamicObject();
    o->setProperty ("muid", (juce::int64) muid);
    // A one-byte manufacturer id is { id, 0, 0 }; a three-byte one, 00 H L, is { 0, H, L }.
    o->setProperty ("manufacturer", d.manufacturer[0] != std::byte {} ? Impl::hexOf (juce::Span<const std::byte> (d.manufacturer.data(), 1))
                                                                       : Impl::hexOf (juce::Span<const std::byte> (d.manufacturer.data(), 3)));
    o->setProperty ("family", Impl::hexOf (juce::Span<const std::byte> (d.family.data(), d.family.size())));
    o->setProperty ("model", Impl::hexOf (juce::Span<const std::byte> (d.modelNumber.data(), d.modelNumber.size())));
    o->setProperty ("version", Impl::hexOf (juce::Span<const std::byte> (d.revision.data(), d.revision.size())));
    const ci::DeviceFeatures features (info->capabilities);
    o->setProperty ("propertyExchange", features.isPropertyExchangeSupported());
    o->setProperty ("profiles", features.isProfileConfigurationSupported());
    const auto names = impl->device->getDeviceInfoForMuid (m);
    if (auto* n = names.getDynamicObject())
    {
        auto* words = new juce::DynamicObject();
        for (const auto* key : { "manufacturer", "family", "model", "version" })
            if (n->hasProperty (key)) words->setProperty (key, n->getProperty (key));
        o->setProperty ("names", juce::var (words));
    }
    return juce::var (o);
}

namespace
{
ci::PropertyRequestHeader requestHeader (const juce::String& resource, const juce::var& opts)
{
    ci::PropertyRequestHeader header;
    header.resource = resource;
    if (opts.hasProperty ("resId")) header.resId = opts.getProperty ("resId", "").toString();
    if (opts.hasProperty ("offset") || opts.hasProperty ("limit"))
    {
        ci::Pagination page;
        page.offset = (int) opts.getProperty ("offset", 0);
        page.limit = (int) opts.getProperty ("limit", -1);
        header.pagination = page;
    }
    return header;
}

double timeoutOf (const juce::var& opts)
{
    const auto t = (double) opts.getProperty ("timeoutMs", 3000.0);
    return t > 0.0 ? t : 3000.0;
}

bool hasPropertyExchange (const std::optional<ci::Device>& device, uint32_t muid)
{
    if (! device.has_value()) return false;
    const auto info = device->getDiscoveryInfoForMuid (ci::MUID::makeUnchecked (muid));
    return info.has_value() && ci::DeviceFeatures (info->capabilities).isPropertyExchangeSupported();
}
}

bool MidiCiSession::get (uint32_t muid, const juce::String& resource, const juce::var& opts, Answer done)
{
    if (! hasPropertyExchange (impl->device, muid)) return false;
    auto r = std::make_shared<Impl::Request>();
    r->id = impl->nextId++;
    r->muid = muid;
    r->header = requestHeader (resource, opts);
    r->done = std::move (done);
    r->deadline = impl->clock() + timeoutOf (opts);
    impl->requests.push_back (r);
    impl->startWaiting();
    return true;
}

bool MidiCiSession::set (uint32_t muid, const juce::String& resource, const juce::var& body, const juce::var& opts, Answer done)
{
    if (! hasPropertyExchange (impl->device, muid)) return false;
    auto r = std::make_shared<Impl::Request>();
    r->id = impl->nextId++;
    r->muid = muid;
    r->isSet = true;
    r->header = requestHeader (resource, opts);
    r->header.setPartial = (bool) opts.getProperty ("partial", false);
    const auto mediaType = opts.getProperty ("mediaType", "").toString();
    if (body.isString() && (mediaType.isEmpty() || mediaType.startsWithIgnoreCase ("text/")))
    {
        r->header.mediaType = mediaType.isEmpty() ? juce::String ("text/plain") : mediaType;
        const auto text = body.toString();
        const auto* utf8 = text.toRawUTF8();
        for (size_t i = 0; i < text.getNumBytesAsUTF8(); ++i) r->body.push_back ((std::byte) (uint8_t) utf8[i]);
        r->header.mutualEncoding = ci::Encoding::mcoded7;
        r->body = ci::Encodings::toMcoded7 (juce::Span<const std::byte> (r->body.data(), r->body.size()));
    }
    else if (auto* list = body.getArray(); list != nullptr && mediaType.isNotEmpty() && ! mediaType.containsIgnoreCase ("json"))
    {
        r->header.mediaType = mediaType;
        for (const auto& b : *list) r->body.push_back ((std::byte) (uint8_t) (int) b);
        r->header.mutualEncoding = ci::Encoding::mcoded7;
        r->body = ci::Encodings::toMcoded7 (juce::Span<const std::byte> (r->body.data(), r->body.size()));
    }
    else
    {
        r->header.mediaType = "application/json";
        r->body = ci::Encodings::jsonTo7BitText (body);
    }
    r->done = std::move (done);
    r->deadline = impl->clock() + timeoutOf (opts);
    impl->requests.push_back (r);
    impl->startWaiting();
    return true;
}

int MidiCiSession::subscribe (uint32_t muid, const juce::String& resource, const juce::var& opts, Answer update)
{
    if (! hasPropertyExchange (impl->device, muid)) return 0;
    ci::PropertySubscriptionHeader header;
    header.resource = resource;
    if (opts.hasProperty ("resId")) header.resId = opts.getProperty ("resId", "").toString();
    header.command = ci::PropertySubscriptionCommand::start;
    const auto id = impl->nextId++;
    Impl::Subscription sub;
    sub.muid = muid;
    sub.update = std::move (update);
    // Stored before it begins: the device can answer before beginSubscription returns.
    impl->subscriptions[id] = sub;
    const auto key = impl->device->beginSubscription (ci::MUID::makeUnchecked (muid), header);
    if (const auto it = impl->subscriptions.find (id); it != impl->subscriptions.end()) it->second.key = key;
    return id;
}

bool MidiCiSession::unsubscribe (int id)
{
    const auto it = impl->subscriptions.find (id);
    if (it == impl->subscriptions.end()) return false;
    const auto key = it->second.key;
    impl->subscriptions.erase (it);
    if (impl->device.has_value()) impl->device->endSubscription (key);
    return true;
}

juce::var MidiCiSession::profiles (uint32_t muid) const { return impl->profilesOf (muid); }

void MidiCiSession::inquireProfiles (uint32_t muid, Answer done)
{
    if (! impl->device.has_value()) return;
    if (done) impl->profileWaiters[muid].push_back (std::move (done));
    impl->device->sendProfileInquiry (ci::MUID::makeUnchecked (muid), ci::ChannelInGroup::wholeBlock);
}

void MidiCiSession::setProfile (uint32_t muid, const juce::String& profileHex, bool on, int channel)
{
    if (! impl->device.has_value()) return;
    const auto address = channel >= 1 && channel <= 16 ? (ci::ChannelInGroup) (channel - 1) : ci::ChannelInGroup::wholeBlock;
    impl->device->sendProfileEnablement (ci::MUID::makeUnchecked (muid), address, hexToProfile (profileHex), on ? 1 : 0);
}

void MidiCiSession::forget (uint32_t muid) { impl->endDevice (muid, "the device is gone"); }

bool MidiCiSession::tick (double)
{
    const auto now = impl->clock();
    for (const auto& r : std::vector<std::shared_ptr<Impl::Request>> (impl->requests))
    {
        if (r->deadline > now) continue;
        if (r->key.has_value() && impl->device.has_value()) impl->device->abortPropertyRequest (*r->key);
        impl->finish (r, Impl::answer (false, 0, "no reply in time"));
    }
    impl->startWaiting();
    if (impl->device.has_value()) impl->device->sendPendingMessages();
    return busy();
}

bool MidiCiSession::busy() const
{
    return ! impl->requests.empty() || ! impl->subscriptions.empty() || ! impl->profileWaiters.empty();
}

void MidiCiSession::setClockForTesting (std::function<double()> clock) { impl->clock = std::move (clock); }

} // namespace ceditor::device
