#pragma once

#include "PluginWorkerProtocol.h"
#include <array>
#include <cmath>
#include <cstddef>
#include <functional>
#include <limits>

// Framed, duplex, message-thread control channel. Audio/MIDI never travels here. A single
// request/reply lock is deliberate: state and editor lifecycle are rare, ordered operations,
// while parameter automation uses the shared block data plane.

namespace ceditor::host::plugin_worker
{

class PluginWorkerControlChannel
{
public:
    /** Called repeatedly while a receive() is waiting, at most every waitSliceMs, when set.

        This exists for one reason. The worker's editor window is a CHILD of a Hostage window,
        and Windows delivers some messages about a child to its ancestors synchronously —
        WM_PARENTNOTIFY when the child is created or destroyed, WM_MOUSEACTIVATE and
        WM_SETCURSOR as the user reaches it — by blocking the sending thread until the
        receiving thread answers. The receiving thread is Hostage's message thread, and
        during a control request that thread is here, blocked on the pipe, waiting for a
        reply that the worker's message thread will not produce until its SendMessage
        returns. Each side waits for the other until the request times out, and a timed-out
        request is treated as a dead worker. Hostage sets this hook to service pending SENT
        messages only (PeekMessage with PM_QS_SENDMESSAGE | PM_NOREMOVE), which answers the
        worker without dispatching anything queued: no timers, no paint, no re-entry into
        another request. The worker leaves it unset; its control thread is not a UI thread. */
    std::function<void()> serviceWhileWaiting;
    bool createHost (const juce::String& pipeName, juce::String& error)
    {
        close();
        error.clear();
        if (pipeName.isEmpty() || ! pipe.createNewPipe (pipeName, true))
        {
            error = "could not create the plug-in worker control pipe";
            return false;
        }
        return true;
    }

    bool openWorker (const juce::String& pipeName, juce::String& error)
    {
        close();
        error.clear();
        if (pipeName.isEmpty() || ! pipe.openExisting (pipeName))
        {
            error = "could not connect to the plug-in worker control pipe";
            return false;
        }
        return true;
    }

    void close()
    {
        pipe.close();
        const juce::ScopedLock lock (readLock);
        resetReceiveState();
    }
    bool isOpen() const { return pipe.isOpen(); }

    bool send (const Message& message, int timeoutMs, juce::String& error)
    {
        const juce::ScopedLock lock (writeLock);
        error.clear();
        const auto body = encode (message);
        if (body.isEmpty())
        {
            error = "plug-in worker control message is too large";
            return false;
        }

        juce::MemoryOutputStream prefix (sizeof (juce::uint32));
        prefix.writeInt (static_cast<int> (body.getSize()));
        const auto deadline = makeDeadline (timeoutMs);
        if (! writeFully (prefix.getData(), static_cast<int> (prefix.getDataSize()),
                          timeoutMs, deadline)
            || ! writeFully (body.getData(), static_cast<int> (body.getSize()),
                             timeoutMs, deadline))
        {
            error = "plug-in worker control write failed";
            return false;
        }
        return true;
    }

    DecodeResult receive (int timeoutMs)
    {
        const juce::ScopedLock lock (readLock);
        DecodeResult result;
        const auto deadline = makeDeadline (timeoutMs);
        if (pendingFrameBytes == 0
            && ! readFully (pendingPrefix.data(), static_cast<int> (pendingPrefix.size()),
                            pendingPrefixBytes, timeoutMs, deadline))
        {
            result.error = "plug-in worker control read timed out or disconnected";
            return result;
        }

        if (pendingFrameBytes == 0)
        {
            pendingFrameBytes = juce::ByteOrder::littleEndianInt (pendingPrefix.data());
            if (pendingFrameBytes < static_cast<juce::uint32> (headerBytes)
                || pendingFrameBytes > static_cast<juce::uint32> (headerBytes + maxPayloadBytes))
            {
                resetReceiveState();
                result.error = "plug-in worker control frame length is invalid";
                return result;
            }
            pendingBody.setSize (pendingFrameBytes, false);
            pendingBodyBytes = 0;
        }

        if (! readFully (pendingBody.getData(), static_cast<int> (pendingFrameBytes),
                         pendingBodyBytes, timeoutMs, deadline))
        {
            // A polling deadline is not a framing boundary. Keep both prefix and body progress so
            // the next receive() resumes this exact frame instead of interpreting its remaining
            // state bytes as a fresh length prefix.
            result.error = "plug-in worker control frame is incomplete";
            return result;
        }

        result = decode (pendingBody);
        resetReceiveState();
        return result;
    }

private:
    static double makeDeadline (int timeoutMs) noexcept
    {
        return timeoutMs < 0 ? 0.0
                             : juce::Time::getMillisecondCounterHiRes() + timeoutMs;
    }

    static int remainingTimeout (int timeoutMs, double deadline) noexcept
    {
        if (timeoutMs < 0)
            return -1;
        return static_cast<int> (juce::jlimit (
            0.0, static_cast<double> (std::numeric_limits<int>::max()),
            std::ceil (deadline - juce::Time::getMillisecondCounterHiRes())));
    }

    bool readFully (void* destination, int bytes, int& received,
                    int timeoutMs, double deadline)
    {
        auto* write = static_cast<std::byte*> (destination);
        while (received < bytes)
        {
            const auto remaining = remainingTimeout (timeoutMs, deadline);
            if (timeoutMs >= 0 && remaining <= 0)
                return false;

            // JUCE's Windows pipe uses a 4 KiB kernel buffer. Asking an overlapped ReadFile
            // for an entire multi-megabyte state blob makes a short deadline all-or-nothing:
            // cancellation reports no partial progress. Matching the pipe quantum lets each
            // completed piece become resumable state before the polling deadline expires.
            const auto wanted = juce::jmin (pipeTransferChunkBytes, bytes - received);
            // With a hook set, wait in slices so it runs between them. A slice that produces
            // nothing is not a failure until the deadline is: JUCE's pipe read returns 0 on its
            // own timeout as well as on disconnect, and the deadline is what tells them apart.
            const auto sliceLimited = serviceWhileWaiting != nullptr;
            const auto slice = sliceLimited && (remaining < 0 || remaining > waitSliceMs)
                                   ? waitSliceMs : remaining;
            const auto chunk = pipe.read (write + received, wanted, slice);
            if (chunk < 0)
                return false;
            if (chunk == 0)
            {
                if (! sliceLimited)
                    return false;
                serviceWhileWaiting();
                continue;
            }
            received += chunk;
        }
        return true;
    }

    static constexpr int waitSliceMs = 20;

    void resetReceiveState()
    {
        pendingPrefix.fill (std::byte {});
        pendingPrefixBytes = 0;
        pendingFrameBytes = 0;
        pendingBody.setSize (0);
        pendingBodyBytes = 0;
    }

    bool writeFully (const void* source, int bytes, int timeoutMs, double deadline)
    {
        const auto* read = static_cast<const std::byte*> (source);
        int written = 0;
        while (written < bytes)
        {
            const auto remaining = remainingTimeout (timeoutMs, deadline);
            if (timeoutMs >= 0 && remaining <= 0)
                return false;

            const auto wanted = juce::jmin (pipeTransferChunkBytes, bytes - written);
            const auto chunk = pipe.write (read + written, wanted,
                                           remaining);
            if (chunk <= 0)
                return false;
            written += chunk;
        }
        return true;
    }

    juce::NamedPipe pipe;
    static constexpr int pipeTransferChunkBytes = 4096;
    juce::CriticalSection readLock;
    juce::CriticalSection writeLock;
    std::array<std::byte, sizeof (juce::uint32)> pendingPrefix {};
    int pendingPrefixBytes = 0;
    juce::uint32 pendingFrameBytes = 0;
    juce::MemoryBlock pendingBody;
    int pendingBodyBytes = 0;
};

} // namespace ceditor::host::plugin_worker
