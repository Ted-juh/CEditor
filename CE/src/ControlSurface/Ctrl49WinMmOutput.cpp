#ifdef _WIN32

#include "Ctrl49WinMmOutput.h"

#include <windows.h>
#include <mmsystem.h>

#include <stdexcept>
#include <thread>

namespace ceditor::ctrl49
{

namespace
{
    [[noreturn]] void throwMm (MMRESULT code, const char* what)
    {
        wchar_t text[MAXERRORLENGTH] {};
        std::string message = what;
        if (midiOutGetErrorTextW (code, text, MAXERRORLENGTH) == MMSYSERR_NOERROR)
        {
            message += ": ";
            for (const wchar_t* p = text; *p != 0; ++p)
                message += static_cast<char> (*p < 128 ? *p : '?');
        }
        throw std::runtime_error (message);
    }

    void check (MMRESULT code, const char* what)
    {
        if (code != MMSYSERR_NOERROR)
            throwMm (code, what);
    }
} // namespace

std::optional<unsigned int> Ctrl49WinMmOutput::findPort (const std::wstring& name,
                                                         std::wstring* actualName)
{
    const UINT count = midiOutGetNumDevs();
    for (UINT index = 0; index < count; ++index)
    {
        MIDIOUTCAPSW caps {};
        if (midiOutGetDevCapsW (index, &caps, sizeof (caps)) != MMSYSERR_NOERROR)
            continue;
        const std::wstring portName (caps.szPname);
        if (portName.rfind (name, 0) == 0)
        {
            if (actualName != nullptr)
                *actualName = portName;
            return index;
        }
    }
    return std::nullopt;
}

Ctrl49WinMmOutput::Ctrl49WinMmOutput (unsigned int deviceId)
{
    HMIDIOUT handle = nullptr;
    check (midiOutOpen (&handle, deviceId, 0, 0, CALLBACK_NULL), "midiOutOpen");
    handle_ = handle;
}

Ctrl49WinMmOutput::~Ctrl49WinMmOutput()
{
    if (handle_ != nullptr)
    {
        midiOutReset (static_cast<HMIDIOUT> (handle_));
        midiOutClose (static_cast<HMIDIOUT> (handle_));
    }
}

void Ctrl49WinMmOutput::sendSysEx (const Bytes& frame)
{
    if (frame.empty())
        return;

    auto* handle = static_cast<HMIDIOUT> (handle_);

    MIDIHDR header {};
    header.lpData         = reinterpret_cast<LPSTR> (const_cast<std::uint8_t*> (frame.data()));
    header.dwBufferLength = static_cast<DWORD> (frame.size());
    header.dwBytesRecorded = header.dwBufferLength;

    check (midiOutPrepareHeader (handle, &header, sizeof (header)), "midiOutPrepareHeader");
    try
    {
        check (midiOutLongMsg (handle, &header, sizeof (header)), "midiOutLongMsg");

        // Wait for the driver to release the buffer. Long messages to this port complete
        // in well under a second; treat anything longer as a wedged driver.
        for (int waited = 0; (header.dwFlags & MHDR_DONE) == 0; ++waited)
        {
            if (waited > 2000)
                throw std::runtime_error ("timed out waiting for a SysEx long message to complete");
            std::this_thread::sleep_for (std::chrono::milliseconds (1));
        }

        check (midiOutUnprepareHeader (handle, &header, sizeof (header)), "midiOutUnprepareHeader");
    }
    catch (...)
    {
        midiOutUnprepareHeader (handle, &header, sizeof (header));
        throw;
    }
}

} // namespace ceditor::ctrl49

#endif // _WIN32
