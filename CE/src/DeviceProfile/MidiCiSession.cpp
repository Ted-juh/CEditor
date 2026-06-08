#include "MidiCiSession.h"

#include <juce_midi_ci/juce_midi_ci.h>

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

} // namespace ceditor::device
