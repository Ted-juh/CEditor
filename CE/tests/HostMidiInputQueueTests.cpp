#include "Player/HostMidiInputQueue.h"
#include <iostream>
#include <thread>

int main()
{
    int failures = 0;
    const auto check = [&] (bool ok, const char* message)
    {
        std::cout << (ok ? "PASS " : "FAIL ") << message << '\n';
        if (! ok) ++failures;
    };
    auto queue = std::make_unique<ce::HostMidiInputQueue>();
    juce::MemoryBlock received;
    const juce::uint8 note[] { 0x90, 60, 96 };
    const juce::uint8 cc[] { 0xb0, 74, 100 };
    check (! queue->pop (received), "empty input does not deliver a message");
    check (queue->push (note, 3) && queue->push (cc, 3), "accept note and CC");
    check (queue->pop (received) && received == juce::MemoryBlock (note, 3), "note bytes are retained");
    check (queue->pop (received) && received == juce::MemoryBlock (cc, 3), "CC follows note exactly once");
    check (! queue->pop (received), "drained input is not replayed");

    // Move both record headers and payloads over the ring boundary, including a large SysEx.
    std::vector<juce::uint8> sysex (65530, 0x37);
    sysex.front() = 0xf0;
    sysex.back() = 0xf7;
    bool wrapped = true;
    for (int i = 0; i < 15; ++i)
    {
        wrapped &= queue->push (sysex.data(), static_cast<int> (sysex.size()));
        wrapped &= queue->pop (received) && received == juce::MemoryBlock (sysex.data(), sysex.size());
        wrapped &= queue->push (cc, 3) && queue->pop (received) && received == juce::MemoryBlock (cc, 3);
    }
    check (wrapped, "wrapped records preserve large SysEx and subsequent short messages");

    int accepted = 0;
    while (queue->push (note, 3)) ++accepted;
    check (queue->takeDroppedCount() == 1, "full queue reports the dropped whole message");
    int delivered = 0;
    bool intact = true;
    while (queue->pop (received))
    {
        intact &= received == juce::MemoryBlock (note, 3);
        ++delivered;
    }
    check (intact && delivered == accepted, "overflow does not corrupt already queued events");
    check (queue->push (cc, 3) && queue->pop (received) && received == juce::MemoryBlock (cc, 3),
           "queue recovers after overflow");
    check (! queue->push (note, ce::HostMidiInputQueue::capacity) && queue->takeDroppedCount() == 1,
           "oversized record is refused before reading its bytes");

    // Actual audio/message-thread concurrency. Retrying a full queue is for this test only;
    // production deliberately drops rather than waiting in the audio callback.
    constexpr int total = 100000;
    std::thread producer ([&]
    {
        for (int i = 0; i < total; ++i)
            while (! queue->push (&i, sizeof (i))) std::this_thread::yield();
    });
    bool ordered = true;
    for (int i = 0; i < total; ++i)
    {
        while (! queue->pop (received)) std::this_thread::yield();
        int actual = -1;
        if (received.getSize() == sizeof (actual)) std::memcpy (&actual, received.getData(), sizeof (actual));
        ordered &= actual == i;
    }
    producer.join();
    check (ordered && ! queue->pop (received), "concurrent producer and consumer retain exact order");
    return failures == 0 ? 0 : 1;
}
