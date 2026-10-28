#include "Osc/OscService.h"
#include "SharedJsonFile.h"

#if JUCE_WINDOWS
 #include <winsock2.h>
#else
 #include <sys/socket.h>
#endif

namespace ceditor::osc
{

namespace
{
constexpr int queueLimit = 4096;          // messages waiting for the message thread
constexpr size_t largestPacket = 65507;   // what one UDP datagram over IPv4 can carry

/** JUCE makes every datagram socket reusable, and two sockets bound to one port with that on both
    split what arrives between them: a second plug-in instance on a port in use was silently deaf.
    Off, the second bind fails, and ce.osc says why. */
void notReusable (juce::DatagramSocket& socket)
{
    const auto handle = socket.getRawSocketHandle();
    if (handle < 0) return;
   #if JUCE_WINDOWS
    BOOL off = FALSE;
    setsockopt ((SOCKET) handle, SOL_SOCKET, SO_REUSEADDR, (const char*) &off, sizeof (off));
    BOOL exclusive = TRUE;
    setsockopt ((SOCKET) handle, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, (const char*) &exclusive, sizeof (exclusive));
   #else
    int off = 0;
    setsockopt (handle, SOL_SOCKET, SO_REUSEADDR, &off, sizeof (off));
   #endif
}

juce::var endpoint (const juce::String& host, int port)
{
    auto* o = new juce::DynamicObject();
    o->setProperty ("host", host);
    o->setProperty ("port", port);
    return juce::var (o);
}
}

// --- receiving, on a thread of its own ------------------------------------------------------------

struct OscService::Receiver final : juce::Thread
{
    explicit Receiver (std::unique_ptr<juce::DatagramSocket> s) : juce::Thread ("ce.osc receive"), socket (std::move (s)) {}
    ~Receiver() override
    {
        signalThreadShouldExit();
        if (socket != nullptr) socket->shutdown();
        stopThread (2000);
    }

    void run() override
    {
        juce::HeapBlock<char> buffer (largestPacket + 1);
        while (! threadShouldExit())
        {
            if (socket->waitUntilReady (true, 50) != 1) continue;
            juce::String host;
            int fromPort = 0;
            const auto n = socket->read (buffer.get(), (int) largestPacket, false, host, fromPort);
            if (n <= 0) continue;
            int bad = 0;
            juce::String why;
            auto messages = decodePacket (buffer.get(), (size_t) n, bad, why);
            const std::scoped_lock lock (queueLock);
            if (bad > 0) { badPackets += bad; if (firstError.isEmpty()) firstError = why; }
            for (auto& m : messages)
            {
                if ((int) queue.size() >= queueLimit) { ++overflow; continue; }
                if (auto* o = m.getDynamicObject()) o->setProperty ("from", endpoint (host, fromPort));
                queue.push_back (m);
            }
        }
    }

    std::unique_ptr<juce::DatagramSocket> socket;
    std::mutex queueLock;
    std::deque<juce::var> queue;
    int overflow = 0, badPackets = 0;
    juce::String firstError;
};

// --- sending, on another ----------------------------------------------------------------------------

struct OscService::Sender final : juce::Thread
{
    Sender() : juce::Thread ("ce.osc send") { startThread(); }
    ~Sender() override
    {
        signalThreadShouldExit();
        wake.signal();
        stopThread (2000);
    }

    void push (const juce::String& host, int port, juce::MemoryBlock packet)
    {
        {
            const std::scoped_lock lock (queueLock);
            queue.push_back ({ host, port, std::move (packet) });
        }
        wake.signal();
    }

    bool idle()
    {
        const std::scoped_lock lock (queueLock);
        return queue.empty() && ! busy;
    }

    void run() override
    {
        juce::DatagramSocket socket (false);
        while (! threadShouldExit())
        {
            Item item;
            {
                const std::scoped_lock lock (queueLock);
                if (! queue.empty()) { item = std::move (queue.front()); queue.pop_front(); busy = true; }
            }
            if (item.port == 0) { wake.wait (100); continue; }
            if (socket.write (item.host, item.port, item.packet.getData(), (int) item.packet.getSize()) > 0) ++sentCount;
            else ++failedCount;
            const std::scoped_lock lock (queueLock);
            busy = false;
        }
    }

    struct Item { juce::String host; int port = 0; juce::MemoryBlock packet; };
    std::mutex queueLock;
    std::deque<Item> queue;
    bool busy = false;
    juce::WaitableEvent wake;
    std::atomic<int> sentCount { 0 }, failedCount { 0 };
};

// --- the service -----------------------------------------------------------------------------------

OscService::OscService() = default;

OscService::~OscService()
{
    *alive = false;
    stopTimer();
    receiver.reset();
    sender.reset();
}

void OscService::reset()
{
    stopListening();
    waitingToListen = false;
    targets.clear();
    waitingForYes.clear();
    asking.clear();
    received = sent = dropped = 0;
    if (sender != nullptr) sender->sentCount = 0;
    lastError.clear();
}

void OscService::waitUntilSentForTesting (int timeoutMs)
{
    const auto until = juce::Time::getMillisecondCounter() + (juce::uint32) timeoutMs;
    while (sender != nullptr && ! sender->idle() && juce::Time::getMillisecondCounter() < until)
        juce::Thread::sleep (2);
}

bool OscService::isThisComputer (const juce::String& host)
{
    const auto h = host.trim().toLowerCase();
    return h == "localhost" || h == "::1" || h.startsWith ("127.");
}

juce::var OscService::refused (const juce::String& error, const juce::String& why)
{
    lastError = error;
    auto* o = new juce::DynamicObject();
    o->setProperty ("ok", false);
    o->setProperty ("error", error);
    o->setProperty ("why", why);
    return juce::var (o);
}

juce::var OscService::status() const
{
    auto* o = new juce::DynamicObject();
    o->setProperty ("listening", receiver != nullptr);
    o->setProperty ("waiting", waitingToListen || ! waitingForYes.empty());
    o->setProperty ("port", receiver != nullptr ? juce::var (port) : juce::var());
    o->setProperty ("network", receiver != nullptr && network);
    o->setProperty ("received", received);
    o->setProperty ("sent", sender != nullptr ? (int) sender->sentCount : 0);
    o->setProperty ("dropped", dropped);
    o->setProperty ("error", lastError.isEmpty() ? juce::var() : juce::var (lastError));
    return juce::var (o);
}

bool OscService::openPort (int wanted, bool onNetwork)
{
    auto socket = std::make_unique<juce::DatagramSocket> (false);
    notReusable (*socket);
    if (! socket->bindToPort (wanted, onNetwork ? juce::String() : juce::String ("127.0.0.1"))) return false;
    receiver = std::make_unique<Receiver> (std::move (socket));
    receiver->startThread();
    port = wanted;
    network = onNetwork;
    startTimer (10);
    return true;
}

void OscService::stopListening()
{
    receiver.reset();
    port = 0;
    network = false;
    stopTimer();
}

juce::var OscService::listen (int wanted, bool onNetwork, bool nextFree)
{
    stopListening();
    const auto last = nextFree ? juce::jmin (65535, wanted + 99) : wanted;
    for (int p = wanted; p <= last; ++p)
        if (openPort (p, onNetwork))
        {
            lastError.clear();
            auto* o = new juce::DynamicObject();
            o->setProperty ("ok", true);
            o->setProperty ("port", p);
            return juce::var (o);
        }
    return refused ("portInUse", "port " + juce::String (wanted) + (nextFree ? " and the 99 after it are" : " is")
                                 + " in use by another program, or another copy of this panel");
}

int OscService::granted (const juce::String& key) const
{
    const auto full = panelKey + "|" + key;
    if (const auto it = grants.find (full); it != grants.end()) return it->second ? 1 : 0;
    if (grantsFile.existsAsFile())
    {
        const auto v = juce::JSON::parse (grantsFile.loadFileAsString()).getProperty (full, juce::var());
        if (v.isBool()) return (bool) v ? 1 : 0;
    }
    return -1;
}

void OscService::remember (const juce::String& key, bool yes)
{
    const auto full = panelKey + "|" + key;
    grants[full] = yes;
    if (grantsFile != juce::File())
    {
        grantsFile.getParentDirectory().createDirectory();
        updateSharedJsonObject (grantsFile, [&] (juce::DynamicObject& root) { root.setProperty (full, yes); });
    }
}

void OscService::askOnce (const juce::String& key, const juce::String& question)
{
    if (asking.count (key) > 0) return;
    asking[key] = true;
    if (ask == nullptr)
    {
        // Nobody to ask: a no for now, and not remembered, so a window opened later can ask.
        asking.erase (key);
        answered (key, false);
        return;
    }
    std::weak_ptr<bool> stillHere = alive;
    const bool asked = ask (question, [this, stillHere, key] (bool yes)
    {
        if (const auto here = stillHere.lock(); here != nullptr && *here)
        {
            remember (key, yes);
            asking.erase (key);
            answered (key, yes);
        }
    });
    if (! asked && asking.count (key) > 0)
    {
        asking.erase (key);
        answered (key, false);
    }
}

void OscService::answered (const juce::String& key, bool yes)
{
    if (key == "listen" && waitingToListen)
    {
        waitingToListen = false;
        if (yes) listen (wantedListen.port, true, wantedListen.nextFree);
        else lastError = "refusedByUser";
    }
    for (auto it = waitingForYes.begin(); it != waitingForYes.end();)
    {
        if (it->grantKey != key) { ++it; continue; }
        if (yes)
        {
            if (sender == nullptr) sender = std::make_unique<Sender>();
            sender->push (it->host, it->port, std::move (it->packet));
        }
        else lastError = "refusedByUser";
        it = waitingForYes.erase (it);
    }
}

bool OscService::resolve (const juce::var& to, juce::String& host, int& toPort, juce::String& why) const
{
    if (to.isString())
    {
        const auto text = to.toString().trim();
        if (const auto it = targets.find (text); it != targets.end())
        {
            host = it->second.first;
            toPort = it->second.second;
            return true;
        }
        const auto colon = text.lastIndexOfChar (':');
        if (colon <= 0) { why = "\"" + text + "\" is not a target's name, nor \"host:port\""; return false; }
        host = text.substring (0, colon).trim();
        toPort = text.substring (colon + 1).getIntValue();
    }
    else if (to.isObject())
    {
        host = to.getProperty ("host", "").toString().trim();
        toPort = (int) to.getProperty ("port", 0);
    }
    else { why = "there is nowhere to send it"; return false; }
    if (host.isEmpty() || toPort < 1 || toPort > 65535) { why = "a destination needs a host and a port from 1 to 65535"; return false; }
    return true;
}

juce::var OscService::queueSend (const juce::String& host, int toPort, juce::MemoryBlock packet)
{
    if (packet.getSize() > largestPacket)
        return refused ("tooLarge", "it is larger than one UDP packet carries (64 KB); split it");
    auto* o = new juce::DynamicObject();
    o->setProperty ("ok", true);
    if (! isThisComputer (host))
    {
        const auto key = "send|" + host.toLowerCase();
        const auto g = granted (key);
        if (g == 0) return refused ("refusedByUser", "the user said no to sending OSC to " + host);
        if (g < 0)
        {
            waitingForYes.push_back ({ key, std::move (packet), host, toPort });
            o->setProperty ("waiting", true);
            askOnce (key, "This panel wants to send OSC to " + host + ".");
            return juce::var (o);
        }
    }
    if (sender == nullptr) sender = std::make_unique<Sender>();
    sender->push (host, toPort, std::move (packet));
    return juce::var (o);
}

juce::var OscService::command (const juce::var& q)
{
    const auto op = q.getProperty ("op", "").toString();
    if (const auto panel = q.getProperty ("panel", "").toString(); panel.isNotEmpty()) panelKey = panel;

    if (op == "status") return status();
    if (op == "reset") { reset(); return true; }
    if (op == "stop")
    {
        const bool was = receiver != nullptr || waitingToListen;
        waitingToListen = false;
        stopListening();
        return was;
    }
    if (op == "listen")
    {
        const auto wanted = (int) q.getProperty ("port", 8000);
        const bool onNetwork = (bool) q.getProperty ("network", false);
        const bool nextFree = (bool) q.getProperty ("nextFree", false);
        if (wanted < 1024 || wanted > 65535) return refused ("badPort", "a port is from 1024 to 65535");
        if (! onNetwork) { waitingToListen = false; return listen (wanted, false, nextFree); }
        const auto g = granted ("listen");
        if (g == 0) return refused ("refusedByUser", "the user said no to receiving OSC from the network");
        if (g > 0) return listen (wanted, true, nextFree);
        stopListening();
        waitingToListen = true;
        wantedListen = { wanted, true, nextFree };
        askOnce ("listen", "This panel wants to receive OSC from your network on port " + juce::String (wanted) + ".");
        auto* o = new juce::DynamicObject();
        o->setProperty ("ok", waitingToListen || receiver != nullptr);
        o->setProperty ("waiting", waitingToListen);
        if (receiver != nullptr) o->setProperty ("port", port);
        if (! waitingToListen && receiver == nullptr) o->setProperty ("error", lastError);
        return juce::var (o);
    }
    if (op == "target")
    {
        const auto name = q.getProperty ("name", "").toString();
        const auto host = q.getProperty ("host", "").toString().trim();
        if (name.isEmpty()) return refused ("badTarget", "a target needs a name");
        if (host.isEmpty()) { targets.erase (name); auto* o = new juce::DynamicObject(); o->setProperty ("ok", true); return juce::var (o); }
        const auto toPort = (int) q.getProperty ("port", 0);
        if (toPort < 1 || toPort > 65535) return refused ("badAddress", "a destination needs a port from 1 to 65535");
        auto* o = new juce::DynamicObject();
        o->setProperty ("ok", true);
        if (! isThisComputer (host))
        {
            const auto key = "send|" + host.toLowerCase();
            const auto g = granted (key);
            if (g == 0) return refused ("refusedByUser", "the user said no to sending OSC to " + host);
            if (g < 0) { o->setProperty ("waiting", true); askOnce (key, "This panel wants to send OSC to " + host + "."); }
        }
        targets[name] = { host, toPort };
        return juce::var (o);
    }
    if (op == "send" || op == "bundle")
    {
        juce::String host, why;
        int toPort = 0;
        if (! resolve (q.getProperty ("to", juce::var()), host, toPort, why)) return refused ("badAddress", why);
        if (op == "send")
        {
            juce::String error;
            const auto* args = q.getProperty ("args", juce::var()).getArray();
            auto packet = encodeMessage (q.getProperty ("address", "").toString(), args != nullptr ? *args : juce::Array<juce::var>(),
                                         q.getProperty ("types", "").toString(), error);
            if (error.isNotEmpty()) return refused ("badMessage", error);
            return queueSend (host, toPort, std::move (packet));
        }
        juce::Array<juce::MemoryBlock> packets;
        if (auto* list = q.getProperty ("messages", juce::var()).getArray())
            for (const auto& m : *list)
            {
                juce::String error;
                const auto* args = m.getProperty ("args", juce::var()).getArray();
                auto packet = encodeMessage (m.getProperty ("address", "").toString(), args != nullptr ? *args : juce::Array<juce::var>(),
                                             m.getProperty ("types", "").toString(), error);
                if (error.isNotEmpty()) return refused ("badMessage", "message " + juce::String (packets.size() + 1) + ": " + error);
                packets.add (std::move (packet));
            }
        return queueSend (host, toPort, encodeBundle (packets, (double) q.getProperty ("time", 0.0)));
    }
    return {};
}

void OscService::timerCallback()
{
    if (receiver == nullptr) return;
    std::deque<juce::var> arrived;
    {
        const std::scoped_lock lock (receiver->queueLock);
        arrived.swap (receiver->queue);
        dropped += receiver->overflow + receiver->badPackets;
        if (receiver->badPackets > 0) lastError = "badPacket";
        receiver->overflow = 0;
        receiver->badPackets = 0;
    }
    for (const auto& m : arrived)
    {
        ++received;
        if (emit != nullptr) emit ("oscMessage", m);
        if (receiver == nullptr) break;   // a script stopped listening on the way
    }
}

} // namespace ceditor::osc
