#include "SimulatedDevice.h"
#include "ProfileChecksums.h"

#include <algorithm>

namespace ceditor::device
{
SimulatedDevice::SimulatedDevice (const DeviceProfileEngine& engine)
    : protocol (engine.addressedProtocol())
{
    const auto configuredId = engine.variableValue ("deviceId");
    if (! configuredId.isVoid() && (int) configuredId >= 0 && (int) configuredId <= 0x7f)
        ownDeviceId = (int) configuredId;

    identityReplyBytes = engine.buildIdentityReply (ownDeviceId);

    if (! protocol.ok)
        return;

    // Every parameter at its default, offered to every dump: buildDumpMessage takes the ones a dump
    // maps and reports the rest, so one set of values serves them all.
    auto* defaults = new juce::DynamicObject();
    juce::var defaultValues (defaults);
    const auto descriptorList = engine.listParameterDescriptors();   // held: getArray() points into it
    if (auto* descriptors = descriptorList.getArray())
        for (const auto& descriptor : *descriptors)
        {
            const auto id = descriptor.getProperty ("id", {}).toString();
            const auto value = descriptor.getProperty ("default", {});
            if (id.isNotEmpty() && ! value.isVoid())
                defaults->setProperty (id, value);
        }

    for (const auto& dumpId : engine.dumpDefinitionIds())
    {
        auto built = engine.buildDumpMessage (dumpId, defaultValues);
        // A default the profile cannot encode is the profile's problem, not a reason to leave the
        // block out: the definition's own default bytes stand in for every value.
        if (! built.ok)
            built = engine.buildDumpMessage (dumpId, juce::var (new juce::DynamicObject()));
        if (! built.ok)
            continue;

        int address = 0;
        juce::Array<int> data;
        if (! readWrite (built.bytes, address, data))
            continue;   // a dump that is not a write message of this protocol holds no memory

        store (address, data);
        blocks.push_back ({ address, data.size() });
    }

    std::sort (blocks.begin(), blocks.end(), [] (const Block& a, const Block& b) { return a.start < b.start; });
}

int SimulatedDevice::byteAt (int address) const
{
    const auto found = memory.find (address);
    return found != memory.end() ? found->second : -1;
}

int SimulatedDevice::addressFromBytes (const juce::Array<int>& bytes, int start, int count)
{
    auto value = 0;
    for (int index = start; index < start + count; ++index)
        value = (value << 7) | (bytes[index] & 0x7f);
    return value;
}

juce::Array<int> SimulatedDevice::addressToBytes (int address, int count)
{
    juce::Array<int> bytes;
    for (int index = count - 1; index >= 0; --index)
        bytes.add ((address >> (7 * index)) & 0x7f);
    return bytes;
}

bool SimulatedDevice::matchesHeader (const juce::Array<int>& message,
                                     const juce::Array<int>& header,
                                     const juce::Array<int>& variablePositions) const
{
    if (message.size() < header.size())
        return false;

    for (int index = 0; index < header.size(); ++index)
    {
        // A byte the template takes from a variable is the device id in every protocol of this
        // shape. The device answers its own, and the broadcast id.
        if (variablePositions.contains (index))
        {
            if (message[index] != header[index] && message[index] != 0x7f)
                return false;
        }
        else if (message[index] != header[index])
        {
            return false;
        }
    }

    return true;
}

bool SimulatedDevice::checksumMatches (const juce::Array<int>& message, int from, int to) const
{
    juce::Array<int> covered;
    for (int index = from; index < to; ++index)
        covered.add (message[index]);

    const auto expected = ce::checksums::toBytes (protocol.checksumType, covered, protocol.checksumOffset);
    if (expected.size() != protocol.checksumBytes)
        return false;

    for (int index = 0; index < expected.size(); ++index)
        if (message[to + index] != expected[index])
            return false;

    return true;
}

bool SimulatedDevice::readWrite (const juce::Array<int>& message, int& address, juce::Array<int>& data) const
{
    const auto headerSize = protocol.writeHeader.size();
    const auto dataStart = headerSize + protocol.addressBytes;
    const auto checksumAt = message.size() - 1 - protocol.checksumBytes;
    if (checksumAt <= dataStart || message.getLast() != 0xf7
        || ! matchesHeader (message, protocol.writeHeader, protocol.writeVariablePositions)
        || ! checksumMatches (message, headerSize, checksumAt))
        return false;

    address = addressFromBytes (message, headerSize, protocol.addressBytes);
    data.clearQuick();
    for (int index = dataStart; index < checksumAt; ++index)
        data.add (message[index]);
    return true;
}

juce::Array<int> SimulatedDevice::writeMessage (int address, const juce::Array<int>& data) const
{
    juce::Array<int> bytes (protocol.writeHeader);
    for (auto position : protocol.writeVariablePositions)
        bytes.set (position, ownDeviceId);

    juce::Array<int> covered = addressToBytes (address, protocol.addressBytes);
    covered.addArray (data);
    bytes.addArray (covered);
    bytes.addArray (ce::checksums::toBytes (protocol.checksumType, covered, protocol.checksumOffset));
    bytes.add (0xf7);
    return bytes;
}

void SimulatedDevice::store (int address, const juce::Array<int>& data)
{
    for (int index = 0; index < data.size(); ++index)
        memory[address + index] = data[index] & 0x7f;
}

std::vector<juce::Array<int>> SimulatedDevice::answerRequest (int start, int size) const
{
    std::vector<juce::Array<int>> replies;
    const auto end = start + size;

    for (const auto& block : blocks)
    {
        const auto from = juce::jmax (start, block.start);
        const auto to = juce::jmin (end, block.start + block.size);
        for (auto chunk = from; chunk < to; chunk += maxReplyDataBytes)
        {
            juce::Array<int> data;
            for (auto address = chunk; address < juce::jmin (to, chunk + maxReplyDataBytes); ++address)
                data.add (juce::jmax (0, byteAt (address)));
            replies.push_back (writeMessage (chunk, data));
        }
    }

    return replies;
}

std::vector<juce::Array<int>> SimulatedDevice::receive (const juce::Array<int>& message)
{
    if (message.size() < 2 || message[0] != 0xf0 || message.getLast() != 0xf7)
        return {};

    // Universal Identity Request: F0 7E <device id> 06 01 F7.
    if (message.size() == 6 && message[1] == 0x7e && message[3] == 0x06 && message[4] == 0x01)
    {
        if (answersIdentity() && (message[2] == ownDeviceId || message[2] == 0x7f))
            return { identityReplyBytes };
        return {};
    }

    if (! protocol.ok)
        return {};

    int address = 0;
    juce::Array<int> data;
    if (readWrite (message, address, data))
    {
        store (address, data);
        return {};
    }

    const auto headerSize = protocol.requestHeader.size();
    const auto expectedSize = headerSize + protocol.addressBytes + protocol.sizeBytes + protocol.checksumBytes + 1;
    if (message.size() == expectedSize
        && matchesHeader (message, protocol.requestHeader, protocol.requestVariablePositions)
        && checksumMatches (message, headerSize, expectedSize - 1 - protocol.checksumBytes))
    {
        const auto start = addressFromBytes (message, headerSize, protocol.addressBytes);
        const auto size = addressFromBytes (message, headerSize + protocol.addressBytes, protocol.sizeBytes);
        return answerRequest (start, size);
    }

    return {};
}
}
