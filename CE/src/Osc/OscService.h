#pragma once

#include <juce_events/juce_events.h>
#include "Osc/OscCodec.h"

#include <deque>
#include <functional>
#include <map>
#include <memory>
#include <mutex>

/**
 * ce.osc's transport (docs/design/ce-osc-module.md): one UDP port to receive on, and sending, for
 * one panel. Owned by the device layer (DeviceProfileService), so the editor, the player and an
 * exported plug-in, with its window open or shut, all reach the same one: the panel view through the
 * bridge ("oscCommand"), the window-shut engines through the "osc" device query.
 *
 * Packets are read on a thread of their own and queued; the message thread takes them off at least
 * every 10 ms, in the order they came, and hands each message on as "oscMessage". A queue that is
 * full drops the newest and counts them, as the host's MIDI input does (HostMidiInputQueue.h).
 * Sending goes out from another thread, in the order sent, so a script never waits on the network.
 *
 * Nothing opens until asked. This computer is free; the network, to listen on or to send to another
 * computer, needs the user's yes, asked once per panel and kept on this computer (grantsFile), never
 * in the panel file.
 */
namespace ceditor::osc
{

class OscService final : private juce::Timer
{
public:
    OscService();
    ~OscService() override;

    /** Where a received message goes ("oscMessage" { address, args, types, time?, from }). */
    std::function<void (const juce::String& name, const juce::var& payload)> emit;

    /** Asks the user a question that is answered yes or no, later, on the message thread; false when
        there is nobody to ask. Unset, or false: the answer is no for now, and not remembered. */
    std::function<bool (const juce::String& question, std::function<void (bool yes)> answer)> ask;

    /** Where the answers are kept. Unset: for as long as this service lives. */
    juce::File grantsFile;

    /** One ce.osc command, on the message thread: { op, ... }. The ops: listen { port, network,
        nextFree }, stop, status, target { name, host, port } (no host: forget it), send { to, address,
        args, types }, bundle { to, messages, time }, reset. `panel` names the panel a yes is for. */
    juce::var command (const juce::var& q);

    /** The panel went: stop listening, forget the targets and what was counted. */
    void reset();

    /** Tests: take what has arrived now, rather than on the next tick. */
    void deliverNowForTesting() { timerCallback(); }
    /** Tests: wait until everything queued to send has gone. */
    void waitUntilSentForTesting (int timeoutMs = 2000);

private:
    struct Receiver;
    struct Sender;
    struct Pending { juce::String grantKey; juce::MemoryBlock packet; juce::String host; int port = 0; };

    void timerCallback() override;
    juce::var status() const;
    juce::var refused (const juce::String& error, const juce::String& why);
    juce::var listen (int port, bool network, bool nextFree);
    bool openPort (int port, bool network);
    void stopListening();
    juce::var queueSend (const juce::String& host, int port, juce::MemoryBlock packet);
    bool resolve (const juce::var& to, juce::String& host, int& port, juce::String& why) const;
    static bool isThisComputer (const juce::String& host);

    // The yes: -1 not asked, 0 no, 1 yes.
    int granted (const juce::String& key) const;
    void remember (const juce::String& key, bool yes);
    void askOnce (const juce::String& key, const juce::String& question);
    void answered (const juce::String& key, bool yes);

    std::unique_ptr<Receiver> receiver;
    std::unique_ptr<Sender> sender;
    std::map<juce::String, std::pair<juce::String, int>> targets;   // name -> host, port
    std::map<juce::String, bool> grants;                             // what this service was told
    std::map<juce::String, bool> asking;                             // questions waiting for an answer
    std::deque<Pending> waitingForYes;
    juce::String panelKey { "panel" };
    struct WantedListen { int port = 0; bool network = false; bool nextFree = false; } wantedListen;
    bool waitingToListen = false;
    bool network = false;
    int port = 0;
    int received = 0, sent = 0, dropped = 0;
    juce::String lastError;
    std::shared_ptr<bool> alive = std::make_shared<bool> (true);
};

} // namespace ceditor::osc
