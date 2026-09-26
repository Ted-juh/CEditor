#include "Ctrl49WindowsEndpoints.h"

#ifdef _WIN32

#include "Ctrl49PrivateInput.h"
#include "Ctrl49WinMmOutput.h"

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <mutex>
#include <sstream>

namespace ceditor::ctrl49
{

namespace
{
    // The first minute of every connection, frame by frame, both ways, with times:
    // %APPDATA%\CEditor\ctrl49-trace.log, rewritten per connection. The display link is a
    // one-way paint as far as the app can tell, and a keyboard that shows black instead of
    // what was sent says nothing about why. The device acknowledges every type-02 command
    // (02/3D, byte 3 = the command, byte 4 = 0x40 on success), so the trace shows what it
    // accepted, what it did not, and how long it took over it.
    class Ctrl49Trace
    {
    public:
        Ctrl49Trace()
        {
            if (const char* appData = std::getenv ("APPDATA"))
                file.open (std::string (appData) + "\\CEditor\\ctrl49-trace.log", std::ios::trunc);
            start = std::chrono::steady_clock::now();
            write ("--", "connection: frames out (->) and replies in (<-), ms since discovery");
        }

        void frame (const char* direction, const Bytes& bytes)
        {
            if (! file.is_open() || elapsedMs() > 60000.0)
                return;
            write (direction, describe (bytes));
        }

    private:
        double elapsedMs() const
        {
            return std::chrono::duration<double, std::milli> (std::chrono::steady_clock::now() - start).count();
        }

        void write (const char* direction, const std::string& text)
        {
            const std::scoped_lock lock (mutex);
            char stamp[32];
            std::snprintf (stamp, sizeof (stamp), "%9.1f ", elapsedMs());
            file << stamp << direction << ' ' << text << '\n';
            file.flush();
        }

        static std::string hex (const Bytes& bytes, std::size_t limit)
        {
            std::ostringstream out;
            for (std::size_t i = 0; i < bytes.size() && i < limit; ++i)
            {
                char b[4];
                std::snprintf (b, sizeof (b), "%02X ", bytes[i]);
                out << b;
            }
            if (bytes.size() > limit)
                out << "... (" << bytes.size() << " bytes)";
            return out.str();
        }

        static std::string describe (const Bytes& f)
        {
            const bool framed = f.size() > 10 && f[0] == 0xF0 && f[1] == 0x00 && f[2] == 0x01
                                && f[3] == 0x05 && f[4] == 0x31 && f[5] == 0x08;
            if (! framed)
                return (f.size() == 3 ? "midi " : "raw ") + hex (f, 24);

            char head[16];
            std::snprintf (head, sizeof (head), "%02X/%02X ", f[6], f[7]);
            std::string name;
            if (f[6] == 0x03 && f[7] == 0x00) name = "keepalive ";
            else if (f[6] == 0x02 && f[7] == 0x3B) name = "draw ";
            else if (const auto ack = parseAck (f))
                name = "ack " + displayCommandName (ack->command) + ": " + ackStatusName (ack->status) + " ";
            else if (f[6] == 0x05) name = "upload ";
            else if (f[6] == 0x02 && f[7] == 0x3C && f.size() > 16)
            {
                // Lua call: [02][target][fnLen x2][fnEncLen x2][fn MIDI-7 ...]
                const auto fnLen = (std::size_t) decodeBase128 (f.data() + 12, 2);
                const auto encLen = (std::size_t) decodeBase128 (f.data() + 14, 2);
                if (16 + encLen <= f.size())
                {
                    const auto raw = decodeMidi7 (Bytes (f.begin() + 16, f.begin() + 16 + (long) encLen), fnLen);
                    name = "call " + std::string (raw.begin(), raw.end()) + " ";
                }
            }
            return std::string (head) + name + hex (f, name.rfind ("upload", 0) == 0 ? 12 : 40);
        }

        std::ofstream file;
        std::mutex mutex;
        std::chrono::steady_clock::time_point start;
    };

    struct TracingOutput final : IControllerOutput
    {
        TracingOutput (std::unique_ptr<IControllerOutput> innerToUse, std::shared_ptr<Ctrl49Trace> traceToUse)
            : inner (std::move (innerToUse)), trace (std::move (traceToUse)) {}

        void sendSysEx (const Bytes& frame) override
        {
            trace->frame ("->", frame);
            inner->sendSysEx (frame);
        }

        std::unique_ptr<IControllerOutput> inner;
        std::shared_ptr<Ctrl49Trace> trace;
    };
} // namespace

std::unique_ptr<Ctrl49SurfaceEndpoints> discoverCtrl49WindowsEndpoints()
{
    const auto portId = Ctrl49WinMmOutput::findPort (Ctrl49WinMmOutput::kDefaultPortName);
    if (! portId)
        return nullptr;

    // Both transports or neither: a talk-only session would paint a display no knob can
    // drive, and the private capture refusing is also how a second process learns the
    // keyboard is taken at the driver level (the broker's own arbitration guards instances
    // of THIS product; the capture guards against everything else).
    auto trace = std::make_shared<Ctrl49Trace>();
    auto output = std::make_unique<TracingOutput> (std::make_unique<Ctrl49WinMmOutput> (*portId), trace);
    auto input = std::make_shared<Ctrl49PrivateInput>();
    input->setObserver ([trace] (const Bytes& message) { trace->frame ("<-", message); });

    try
    {
        input->start (Ctrl49PrivateInput::discoverDevicePath());
    }
    catch (const std::exception&)
    {
        return nullptr;
    }

    auto endpoints = std::make_unique<Ctrl49SurfaceEndpoints>();
    endpoints->output = std::move (output);
    endpoints->dequeueInput = [input] { return input->dequeue(); };
    endpoints->inputRunning = [input] { return input->running(); };
    endpoints->inputFailure = [input] { return input->failure(); };
    endpoints->closeInput = [input]
    {
        try { input->stop(); } catch (const std::exception&) {}
    };
    endpoints->description = "CTRL49 USB";
    return endpoints;
}

} // namespace ceditor::ctrl49

#else

namespace ceditor::ctrl49
{
std::unique_ptr<Ctrl49SurfaceEndpoints> discoverCtrl49WindowsEndpoints() { return nullptr; }
} // namespace ceditor::ctrl49

#endif // _WIN32
