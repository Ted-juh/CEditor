// ScriptMidiOutQueueTests.cpp — the player's output direction: what a panel sends, drained into the
// host's MIDI buffer by processBlock without a lock and without growing the buffer.
//
// The queue replaced juce::MidiMessageCollector (docs/design/checkers-run-2026-10-02.md), and the
// FIFO under it is choc's with three local patches (CE/thirdparty/choc/VENDORED.md). Two of those
// patches fix ways upstream lost or overran data at the end of its buffer. "Four messages that fill
// the queue to the byte" fails against the unpatched header in any build: upstream accepted all four
// and then read the full queue as empty. The overrun is three bytes into the allocator's slack, so
// only the AddressSanitizer build sees it, in the fill-to-full rounds.
#include "Player/ScriptMidiOutQueue.h"
#include <iostream>
#include <thread>
#include <vector>

namespace
{
std::vector<std::vector<juce::uint8>> eventsOf (const juce::MidiBuffer& midi)
{
    std::vector<std::vector<juce::uint8>> out;
    for (const auto m : midi)
        out.emplace_back (m.data, m.data + m.numBytes);
    return out;
}

std::vector<juce::uint8> sysex (int size, juce::uint8 fill)
{
    std::vector<juce::uint8> s ((size_t) size, fill);
    s.front() = 0xF0;
    s.back() = 0xF7;
    return s;
}
}

int main()
{
    int failures = 0;
    const auto check = [&] (bool ok, const char* message)
    {
        std::cout << (ok ? "PASS " : "FAIL ") << message << '\n';
        if (! ok) ++failures;
    };
    using Q = ce::ScriptMidiOutQueue;

    {
        auto q = std::make_unique<Q>();
        juce::MidiBuffer midi;
        midi.ensureSize (Q::hostReservedBytes);
        check (q->drainInto (midi) == 0 && midi.isEmpty(), "an empty queue adds nothing");

        const juce::uint8 cc[] { 0xB0, 74, 100 };
        const juce::uint8 nrpn[] { 0xB0, 99, 1, 0xB0, 98, 2 };  // two messages, already split by the sender
        const auto dump = sysex (40, 0x11);
        q->push (cc, 3);
        q->push (nrpn, 3);
        q->push (nrpn + 3, 3);
        q->push (dump.data(), (int) dump.size());
        midi.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);   // the host's own input
        check (q->drainInto (midi) == 4, "four queued messages drain in one block");
        const auto got = eventsOf (midi);
        check (got.size() == 5 && got[0] == std::vector<juce::uint8> { 0x90, 60, 100 },
               "the host's own event at sample 0 stays first");
        check (got.size() == 5 && got[1] == std::vector<juce::uint8> (cc, cc + 3)
                   && got[2] == std::vector<juce::uint8> (nrpn, nrpn + 3)
                   && got[3] == std::vector<juce::uint8> (nrpn + 3, nrpn + 6) && got[4] == dump,
               "…and the panel's follow in the order they were sent, bytes intact");
        midi.clear();
        check (q->drainInto (midi) == 0, "a drained message is not sent twice");
    }

    {
        // A burst bigger than one block's room: it spreads over blocks, in order, and the host's
        // buffer never needs more than the reservation.
        auto q = std::make_unique<Q>();
        std::vector<std::vector<juce::uint8>> sent;
        for (int i = 0; i < 64; ++i)
        {
            sent.push_back (sysex (140, (juce::uint8) i));
            q->push (sent.back().data(), 140);
        }
        juce::MidiBuffer midi;
        midi.ensureSize (Q::hostReservedBytes);
        std::vector<std::vector<juce::uint8>> received;
        int blocks = 0, largest = 0;
        while (received.size() < sent.size() && blocks < 100)
        {
            midi.clear();
            q->drainInto (midi);
            largest = juce::jmax (largest, midi.data.size());
            for (auto& e : eventsOf (midi)) received.push_back (std::move (e));
            ++blocks;
        }
        check (received == sent, "a 64-message SysEx burst arrives whole and in order");
        check (blocks > 1, "…over several blocks rather than one");
        check (largest <= Q::hostReservedBytes, "…and no block needs more than the 2,048 bytes the VST3 and CLAP wrappers reserve");
    }

    {
        // A single message bigger than the reservation cannot wait for room that never comes.
        auto q = std::make_unique<Q>();
        const auto big = sysex (4000, 0x22);
        const juce::uint8 cc[] { 0xB0, 1, 2 };
        q->push (big.data(), (int) big.size());
        q->push (cc, 3);
        juce::MidiBuffer midi;
        q->drainInto (midi);
        auto got = eventsOf (midi);
        check (got.size() == 1 && got[0] == big, "a 4,000-byte SysEx still goes, alone, in the first block it can");
        midi.clear();
        q->drainInto (midi);
        got = eventsOf (midi);
        check (got.size() == 1 && got[0] == std::vector<juce::uint8> (cc, cc + 3), "…and what was behind it follows in the next");
    }

    {
        // A host whose own input already fills the buffer: one panel message per block still goes.
        auto q = std::make_unique<Q>();
        const juce::uint8 a[] { 0xB0, 7, 1 }, b[] { 0xB0, 7, 2 };
        q->push (a, 3);
        q->push (b, 3);
        juce::MidiBuffer midi;
        const auto hostFlood = sysex (2100, 0x33);
        midi.addEvent (hostFlood.data(), (int) hostFlood.size(), 0);
        check (q->drainInto (midi) == 1, "with the host's buffer already full, one panel message per block still goes");
    }

    {
        // Full: refused and counted, never corrupting what is already queued.
        auto q = std::make_unique<Q>();
        const auto item = sysex (1000, 0x44);
        int accepted = 0;
        while (q->push (item.data(), (int) item.size())) ++accepted;
        check (accepted > 200 && accepted < 300, "a 256 KB queue holds a couple of hundred 1 KB dumps");
        check (q->takeDroppedCount() == 1, "the refused push is counted");
        check (q->takeDroppedCount() == 0, "…once");
        juce::MidiBuffer midi;
        int drained = 0;
        bool intact = true;
        for (int guard = 0; guard < 10000; ++guard)
        {
            midi.clear();
            if (q->drainInto (midi) == 0) break;
            for (const auto& e : eventsOf (midi)) { intact = intact && e == item; ++drained; }
        }
        check (drained == accepted && intact, "every accepted dump comes out intact after the queue was full");
        check (! q->push (nullptr, 3) && ! q->push (item.data(), 0) && q->takeDroppedCount() == 2,
               "empty and null sends are refused and counted, not queued");
    }

    {
        // Exactly full, from empty. Upstream choc let the fourth item end at `capacity`, which wrapped
        // the write position to 0, where the read position also was: the full queue read as empty,
        // and every message in it was lost and then overwritten.
        auto q = std::make_unique<Q>();
        constexpr int itemBytes = (int) (Q::capacityBytes / 4) - 4;   // + choc's 4-byte header = a quarter
        const auto item = sysex (itemBytes, 0x55);
        int accepted = 0;
        for (int i = 0; i < 4; ++i) accepted += q->push (item.data(), itemBytes) ? 1 : 0;
        int drained = 0;
        juce::MidiBuffer midi;
        for (int guard = 0; guard < 10; ++guard)
        {
            midi.clear();
            if (q->drainInto (midi) == 0) break;
            for (const auto& e : eventsOf (midi)) drained += e == item ? 1 : 0;
        }
        check (accepted == 3 && drained == 3 && q->takeDroppedCount() == 1,
               "four messages that fill the queue to the byte: three kept and sent, the fourth refused and counted");
    }

    {
        // The wraparound that upstream choc got wrong: fill to the end, drain, fill again, with sizes
        // that leave the write position everywhere near the end of the buffer.
        auto q = std::make_unique<Q>();
        juce::MidiBuffer midi;
        std::vector<std::vector<juce::uint8>> expected, received;
        juce::Random rng (42);
        for (int round = 0; round < 40; ++round)
        {
            for (;;)
            {
                auto s = sysex (3 + rng.nextInt (3000), (juce::uint8) rng.nextInt (0x7F));
                if (! q->push (s.data(), (int) s.size())) break;
                expected.push_back (std::move (s));
            }
            q->takeDroppedCount();
            for (int i = 0; i < 1 + rng.nextInt (200); ++i)
            {
                midi.clear();
                q->drainInto (midi);
                for (auto& e : eventsOf (midi)) received.push_back (std::move (e));
            }
        }
        for (int guard = 0; guard < 100000; ++guard)
        {
            midi.clear();
            if (q->drainInto (midi) == 0) break;
            for (auto& e : eventsOf (midi)) received.push_back (std::move (e));
        }
        check (received == expected, "forty fill-to-full rounds across the wrap: nothing lost, nothing repeated");
    }

    {
        // Two senders and the audio thread at once. Each sender's messages arrive in its own order.
        auto q = std::make_unique<Q>();
        constexpr int perSender = 16000;   // the value rides in two 7-bit data bytes: 16,383 at most
        std::atomic<bool> go { false };
        auto sender = [&] (juce::uint8 channel)
        {
            while (! go) {}
            for (int i = 0; i < perSender;)
            {
                const juce::uint8 m[] { (juce::uint8) (0xB0 | channel), (juce::uint8) ((i >> 7) & 0x7F), (juce::uint8) (i & 0x7F) };
                if (q->push (m, 3)) ++i; else std::this_thread::yield();
            }
        };
        std::thread a (sender, 0), b (sender, 1);
        int next[2] { 0, 0 }, total = 0;
        bool ordered = true;
        juce::MidiBuffer midi;
        midi.ensureSize (Q::hostReservedBytes);
        go = true;
        while (total < 2 * perSender)
        {
            midi.clear();
            q->drainInto (midi);
            for (const auto m : midi)
            {
                const int ch = m.data[0] & 0x0F;
                const int value = (m.data[1] << 7) | m.data[2];
                ordered = ordered && value == next[ch];
                next[ch] = value + 1;
                ++total;
            }
        }
        a.join(); b.join();
        check (ordered && next[0] == perSender && next[1] == perSender,
               "two senders and a draining audio thread: 32,000 messages, each sender's in order");
        q->takeDroppedCount();
    }

    std::cout << (failures == 0 ? "ALL PASS" : "FAILURES") << '\n';
    return failures == 0 ? 0 : 1;
}
