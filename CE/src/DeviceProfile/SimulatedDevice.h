#pragma once

#include "DeviceProfileEngine.h"

#include <map>
#include <vector>

namespace ceditor::device
{
/**
 * A synth that is not there: what a device a profile describes would answer, so a panel can be
 * built, tried and taught without the hardware. It is the "Simulated device" output in the port
 * lists (DeviceProfileServiceLoopback.cpp).
 *
 * What it does, all of it read from the profile and nothing else:
 *
 *   - It holds the memory of a Roland-style address map: one block per dump definition, seeded by
 *     building each dump from the parameters' defaults (buildDumpMessage), so a block holds exactly
 *     the bytes a dump of it would carry and a dump of it parses back.
 *   - A write message (DT1) stores its data at its address. A request (RQ1) is answered with the
 *     write messages a synth sends back: one for each block the requested range covers, no more
 *     than 256 data bytes each, in address order. A message whose checksum is wrong is ignored, as
 *     hardware ignores one.
 *   - The Universal Identity Request (F0 7E <id> 06 01 F7) is answered with the reply the profile's
 *     identity block describes.
 *
 * It answers on its own device id or the broadcast id 7F, and stays silent otherwise — a panel set
 * to the wrong device id hears nothing from it, as it would from the synth.
 *
 * What it is not: a test of the profile against the instrument. A profile with a wrong address
 * talks to its own simulator perfectly, because both read the same wrong number. It makes no sound
 * and sends nothing unprompted. A profile that speaks no addressed protocol (CC, NRPN, Yamaha bulk)
 * gets a simulator that only answers the identity request, if the profile declares one.
 *
 * Pure: bytes in, bytes out. When the replies arrive is the service's business.
 */
class SimulatedDevice
{
public:
    explicit SimulatedDevice (const DeviceProfileEngine& engine);

    /** What the device sends back for one complete message: nothing, or its replies in order. */
    std::vector<juce::Array<int>> receive (const juce::Array<int>& message);

    /** Whether it holds an address map, and whether it answers the identity request. */
    [[nodiscard]] bool holdsMemory() const noexcept { return ! blocks.empty(); }
    [[nodiscard]] bool answersIdentity() const noexcept { return ! identityReplyBytes.isEmpty(); }
    [[nodiscard]] int deviceId() const noexcept { return ownDeviceId; }
    [[nodiscard]] int blockCount() const noexcept { return static_cast<int> (blocks.size()); }

    /** The byte it holds at an address, or -1 where it holds none. */
    [[nodiscard]] int byteAt (int address) const;

    /** An address or size as a number: `count` bytes from `start`, seven bits each, MSB first. */
    static int addressFromBytes (const juce::Array<int>& bytes, int start, int count);
    /** The inverse: a number as `count` seven-bit bytes, MSB first. */
    static juce::Array<int> addressToBytes (int address, int count);

    /** The most data bytes one reply carries. */
    static constexpr int maxReplyDataBytes = 256;

private:
    struct Block
    {
        int start = 0;
        int size = 0;
    };

    DeviceProfileEngine::AddressedProtocol protocol;
    juce::Array<int> identityReplyBytes;
    int ownDeviceId = 0x10;
    std::vector<Block> blocks;      // in address order
    std::map<int, int> memory;      // address -> byte

    bool matchesHeader (const juce::Array<int>& message,
                        const juce::Array<int>& header,
                        const juce::Array<int>& variablePositions) const;
    bool checksumMatches (const juce::Array<int>& message, int from, int to) const;
    juce::Array<int> writeMessage (int address, const juce::Array<int>& data) const;
    bool readWrite (const juce::Array<int>& message, int& address, juce::Array<int>& data) const;
    std::vector<juce::Array<int>> answerRequest (int start, int size) const;
    void store (int address, const juce::Array<int>& data);
};
}
