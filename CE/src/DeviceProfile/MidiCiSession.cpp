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
            device->sendPropertyCapabilitiesInquiry (m); // auto-fetches ResourceList -> DeviceInfo + ChannelList
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

} // namespace ceditor::device
