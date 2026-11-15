#include "Ctrl49Endpoints.h"

#if JUCE_LINUX
#include <alsa/asoundlib.h>
#include <fstream>

namespace ceditor::ctrl49
{
namespace
{
    struct LinuxSurface final : IControllerOutput
    {
        std::unique_ptr<snd_seq_t, decltype (&snd_seq_close)> seq { nullptr, snd_seq_close };
        std::unique_ptr<snd_rawmidi_t, decltype (&snd_rawmidi_close)> output { nullptr, snd_rawmidi_close };
        int keyboard = -1;
        int localPort = -1;
        std::string failure;
        Bytes partialSysEx;

        void sendSysEx (const Bytes& frame) override
        {
            // A sequencer send may report success even when the USB MIDI output FIFO
            // overruns. Write to the raw cable and pace bulk uploads a USB packet at a time.
            const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds (2);
            for (size_t offset = 0; offset < frame.size();)
            {
                const auto count = std::min<size_t> (48, frame.size() - offset);
                const auto written = snd_rawmidi_write (output.get(), frame.data() + offset, count);
                if (written > 0) offset += static_cast<size_t> (written);
                else if (written < 0 && written != -EAGAIN && written != -EINTR)
                    throw std::runtime_error (snd_strerror (static_cast<int> (written)));
                if (offset == frame.size()) break;
                if (std::chrono::steady_clock::now() >= deadline)
                    throw std::runtime_error ("Timed out writing to the CTRL49 display cable");
                std::this_thread::sleep_for (std::chrono::milliseconds (1));
            }
        }

        std::optional<Bytes> dequeue()
        {
            snd_seq_event_t* event = nullptr;
            for (;;)
            {
                const auto result = snd_seq_event_input (seq.get(), &event);
                if (result < 0)
                {
                    if (result != -EAGAIN) failure = snd_strerror (result);
                    return {};
                }
                if (event->type == SND_SEQ_EVENT_PORT_UNSUBSCRIBED)
                {
                    failure = "CTRL49 display input disconnected";
                    return {};
                }
                if (event->source.client != keyboard || event->source.port != 2)
                    continue;

                const auto& control = event->data.control;
                const auto& note = event->data.note;
                switch (event->type)
                {
                    case SND_SEQ_EVENT_CONTROLLER:
                        return Bytes { static_cast<uint8_t> (0xb0 | control.channel),
                                       static_cast<uint8_t> (control.param), static_cast<uint8_t> (control.value) };
                    case SND_SEQ_EVENT_KEYPRESS:
                    case SND_SEQ_EVENT_NOTEON:
                    case SND_SEQ_EVENT_NOTEOFF:
                    {
                        const int status = event->type == SND_SEQ_EVENT_KEYPRESS ? 0xa0
                                         : event->type == SND_SEQ_EVENT_NOTEON ? 0x90 : 0x80;
                        return Bytes { static_cast<uint8_t> (status | note.channel), note.note, note.velocity };
                    }
                    case SND_SEQ_EVENT_SYSEX:
                    {
                        const auto* bytes = static_cast<const uint8_t*> (event->data.ext.ptr);
                        const auto length = event->data.ext.len;
                        if (length == 0) break;
                        if (*bytes == 0xf0) partialSysEx.clear();
                        if (partialSysEx.empty() && *bytes != 0xf0) break;
                        if (partialSysEx.size() + length > 65536) { partialSysEx.clear(); break; }
                        partialSysEx.insert (partialSysEx.end(), bytes, bytes + length);
                        if (partialSysEx.back() == 0xf7) return std::exchange (partialSysEx, {});
                        break;
                    }
                    default: break;
                }
            }
        }
    };
}

std::unique_ptr<Ctrl49SurfaceEndpoints> discoverCtrl49Endpoints()
{
    snd_seq_t* handle = nullptr;
    if (snd_seq_open (&handle, "default", SND_SEQ_OPEN_DUPLEX, SND_SEQ_NONBLOCK) < 0)
        return nullptr;
    auto link = std::make_unique<LinuxSurface>();
    link->seq.reset (handle);

    snd_seq_client_info_t* info;
    snd_seq_client_info_alloca (&info);
    snd_seq_client_info_set_client (info, -1);
    int cardNumber = -1;
    while (snd_seq_query_next_client (handle, info) == 0)
    {
        const auto card = snd_seq_client_info_get_card (info);
        if (card < 0) continue;
        std::ifstream device ("/proc/asound/card" + std::to_string (card) + "/usbid");
        std::string id;
        if (device >> id && id == "0763:3108")
        {
            cardNumber = card;
            link->keyboard = snd_seq_client_info_get_client (info);
            break;
        }
    }
    if (link->keyboard < 0) return nullptr;

    snd_seq_set_client_name (handle, "HoSTage CTRL49 display");
    snd_seq_set_client_pool_input (handle, 1024);
    link->localPort = snd_seq_create_simple_port (handle, "Display and controls",
        SND_SEQ_PORT_CAP_READ | SND_SEQ_PORT_CAP_WRITE | SND_SEQ_PORT_CAP_NO_EXPORT,
        SND_SEQ_PORT_TYPE_APPLICATION);
    if (link->localPort < 0)
        throw Ctrl49DiscoveryProblem ("captureFailed", snd_strerror (link->localPort));
    const int subscription = snd_seq_connect_from (handle, link->localPort, link->keyboard, 2);
    if (subscription < 0)
        throw Ctrl49DiscoveryProblem ("captureFailed", snd_strerror (subscription));

    snd_rawmidi_t* raw = nullptr;
    const auto portName = "hw:" + std::to_string (cardNumber) + ",0,0";
    const int output = snd_rawmidi_open (nullptr, &raw, portName.c_str(), SND_RAWMIDI_NONBLOCK);
    if (output < 0)
        throw Ctrl49DiscoveryProblem ("portBusy", snd_strerror (output));

    link->output.reset (raw);

    auto ends = std::make_unique<Ctrl49SurfaceEndpoints>();
    auto* surface = link.get();
    ends->dequeueInput = [surface] { return surface->dequeue(); };
    ends->inputRunning = [surface] { return surface->failure.empty(); };
    ends->inputFailure = [surface] { return surface->failure; };
    ends->output = std::move (link);
    ends->description = "CTRL49 MIDI 1 (display out), MIDI 3 (controls in)";
    return ends;
}
}
#endif
