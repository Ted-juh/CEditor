// MIDI that never leaves the process: the internal cables and the simulated device.
//
// Both are outputs in the same lists as the computer's ports, and both deliver through the one
// door hardware input uses (ingestIncomingMidiBytes), so everything downstream — SysEx assembly,
// identity, dump parsing, the requests waiting for a reply, the MIDI monitor, a panel following
// the synth — runs unchanged and cannot tell the difference.
//
//   Internal cable 1-4  What a role sends to a cable arrives on every role whose input is that
//                       cable. No driver, every platform; but only inside this process, so it
//                       connects the editor's own device roles, not the editor to another program.
//                       (A port other programs can see needs an OS-level virtual port, which
//                       Windows does not let an application create without a driver.)
//   Simulated device    What a role sends is answered by a SimulatedDevice built from that role's
//                       profile, and the answers arrive on the same role — no input to choose.
//
// Nothing is delivered during the send. A request is registered as waiting only after the send
// returns (startDeviceSync), so a reply delivered inside it would find nothing waiting for it and
// a requestDump callback would never fire. Deliveries are queued and handed over from the timer,
// the simulated device's at the pace a Roland synth answers at.

#include "DeviceProfileService.h"
#include "DeviceProfileServiceInternal.h"

namespace ceditor::device
{
bool DeviceProfileService::isWithinProcess (const juce::String& endpointType)
{
    return endpointType == "internalCable" || endpointType == "simulatedDevice";
}

void DeviceProfileService::addWithinProcessDestinations (juce::Array<juce::var>& destinations)
{
    auto* simulated = new juce::DynamicObject();
    simulated->setProperty ("id", "simulatedDevice");
    simulated->setProperty ("type", "simulatedDevice");
    simulated->setProperty ("name", "Simulated device");
    simulated->setProperty ("canSend", true);
    destinations.add (juce::var (simulated));

    for (int cable = 1; cable <= internalCableCount; ++cable)
    {
        auto* output = new juce::DynamicObject();
        output->setProperty ("id", "cable" + juce::String (cable));
        output->setProperty ("type", "internalCable");
        output->setProperty ("name", "Internal cable " + juce::String (cable));
        output->setProperty ("canSend", true);
        destinations.add (juce::var (output));
    }
}

void DeviceProfileService::addWithinProcessInputs (juce::Array<juce::var>& inputs)
{
    for (int cable = 1; cable <= internalCableCount; ++cable)
    {
        auto* input = new juce::DynamicObject();
        input->setProperty ("id", "cable" + juce::String (cable));
        input->setProperty ("type", "internalCable");
        input->setProperty ("name", "Internal cable " + juce::String (cable));
        input->setProperty ("canReceive", true);
        inputs.add (juce::var (input));
    }
}

SimulatedDevice* DeviceProfileService::simulatorForRole (const juce::String& deviceRole)
{
    auto mapping = roleMappings.find (deviceRole);
    if (mapping == roleMappings.end())
        return nullptr;

    // One per role, built from the role's profile and kept while the role keeps it: what was written
    // to it is still there when the panel asks for it back. A different profile is a different synth.
    auto& simulator = simulatorsByRole[deviceRole];
    if (simulator.device == nullptr || simulator.profileId != mapping->second.profileId)
    {
        auto* engine = resolveEngine (mapping->second.profileId, deviceRole);
        if (engine == nullptr)
            return nullptr;
        simulator.profileId = mapping->second.profileId;
        simulator.device = std::make_unique<SimulatedDevice> (*engine);
    }

    return simulator.device.get();
}

void DeviceProfileService::sendWithinProcess (const juce::String& deviceRole,
                                              const MidiDestination& destination,
                                              const juce::Array<int>& bytes)
{
    if (bytes.isEmpty())
        return;

    const auto now = nowMs();
    if (destination.type == "internalCable")
    {
        for (const auto& [role, mapping] : roleMappings)
            if (mapping.input.type == "internalCable" && mapping.input.id == destination.id)
                loopbackDeliveries.push_back ({ role, bytes, now, "internalCable" });
    }
    else if (destination.type == "simulatedDevice")
    {
        auto* device = simulatorForRole (deviceRole);
        if (device == nullptr)
            return;

        // After whatever this role is already owed, one interval apart: a second request sent while
        // the first is being answered is answered after it, as a synth works through its input.
        auto due = now;
        for (const auto& queued : loopbackDeliveries)
            if (queued.deviceRole == deviceRole && queued.origin == "simulatedDevice")
                due = juce::jmax (due, queued.dueTimeMs);

        for (auto& reply : device->receive (bytes))
        {
            due += simulatedReplyIntervalMs;
            loopbackDeliveries.push_back ({ deviceRole, std::move (reply), due, "simulatedDevice" });
        }
    }

    if (! loopbackDeliveries.empty())
        startTimerHz (60);
}

void DeviceProfileService::processLoopbackDeliveries (bool deliverAll)
{
    if (loopbackDeliveries.empty())
        return;

    // Taken off the queue before any is delivered: delivering one can send — a startup request
    // chained to the reply, a script answering what it heard — and that queues more.
    const auto now = nowMs();
    std::vector<LoopbackDelivery> due;
    for (auto it = loopbackDeliveries.begin(); it != loopbackDeliveries.end();)
    {
        if (deliverAll || it->dueTimeMs <= now)
        {
            due.push_back (std::move (*it));
            it = loopbackDeliveries.erase (it);
        }
        else
        {
            ++it;
        }
    }

    for (const auto& delivery : due)
    {
        const auto first = delivery.bytes.isEmpty() ? 0 : delivery.bytes[0];
        const auto type = first == 0xf0 ? juce::String ("sysex")
                        : ((first & 0xf0) == 0xb0 ? juce::String ("cc") : juce::String ("midi"));
        ingestIncomingMidiBytes (delivery.deviceRole, delivery.bytes, type,
                                 juce::Time::getMillisecondCounterHiRes() / 1000.0, delivery.origin);
    }
}
}
