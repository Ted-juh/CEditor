// playerScriptMidi.cpp — RealtimeSanitizer over the player plug-in's audio callback.
//
// PluginProcessor::processBlock (CE/src/Player/PluginProcessor.h) is three calls: push every incoming
// host message into HostMidiInputQueue, drain scriptMidiCollector into the host's buffer, and copy the
// playhead into atomics. This reproduces the first two with the REAL classes inside a function marked
// [[clang::nonblocking]], while a second thread enqueues script MIDI the way the panel does
// (PluginProcessor.h, MidiMessageCollector::addMessageToQueue on the message thread). RealtimeSanitizer
// reports every lock, allocation or blocking call made inside that function.
//
// On 2026-10-02 it reported a lock and an unlock on every one of 2,000 blocks (MidiMessageCollector's
// CriticalSection, which the message thread also holds while it allocates), and six reallocations of the
// host buffer under SysEx bursts. docs/design/checkers-run-2026-10-02.md has the numbers and the fix
// proposed for it; when that lands, this should report nothing. Linux, clang 20 or later:
//
//   tools/rtsan/run.sh            CC traffic from the panel
//   tools/rtsan/run.sh sysex      140-byte SysEx bursts
#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include "Player/HostMidiInputQueue.h"
#include <sanitizer/rtsan_interface.h>
#include <atomic>
#include <thread>
#include <cstdio>

// The audio callback, marked as the host would require it to behave: RTSan reports any
// allocation, lock or blocking call made while this function is on the stack.
static void audioCallback (ce::HostMidiInputQueue& hostMidiInput,
                           juce::MidiMessageCollector& scriptMidiCollector,
                           juce::MidiBuffer& midi) [[clang::nonblocking]]
{
    for (const auto message : midi)
        hostMidiInput.push (message.data, message.numBytes);
    scriptMidiCollector.removeNextBlockOfMessages (midi, 512);
}

int main (int argc, char** argv)
{
    const bool withSysex = argc > 1 && juce::String (argv[1]) == "sysex";
    ce::HostMidiInputQueue hostMidiInput;
    juce::MidiMessageCollector scriptMidiCollector;
    scriptMidiCollector.reset (48000.0);

    std::atomic<bool> running { true };
    std::thread messageThread ([&]
    {
        int n = 0;
        while (running.load())
        {
            if (withSysex)
            {
                // A GAIA-sized parameter dump: Roland DT1, 128 data bytes.
                juce::uint8 sx[140] { 0xF0, 0x41, 0x10, 0x00, 0x00, 0x41, 0x12 };
                for (int i = 7; i < 139; ++i) sx[i] = (juce::uint8) (i & 0x7f);
                sx[139] = 0xF7;
                scriptMidiCollector.addMessageToQueue (juce::MidiMessage (sx, 140, 0.0));
            }
            else
            {
                scriptMidiCollector.addMessageToQueue (juce::MidiMessage::controllerEvent (1, 74, n & 127)
                                                         .withTimeStamp (juce::Time::getMillisecondCounterHiRes() * 0.001));
            }
            ++n;
            std::this_thread::sleep_for (std::chrono::microseconds (200));
        }
    });

    juce::MidiBuffer midi;
    midi.ensureSize (4096);   // a host's buffer arrives pre-sized; give ours the same chance
    for (int block = 0; block < 2000; ++block)
    {
        midi.clear();
        midi.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);   // host input

        audioCallback (hostMidiInput, scriptMidiCollector, midi);
        std::this_thread::sleep_for (std::chrono::microseconds (500));
        juce::MemoryBlock drained;
        while (hostMidiInput.pop (drained)) {}
    }
    running = false;
    messageThread.join();
    std::puts ("player harness: 2000 blocks done");
    return 0;
}
