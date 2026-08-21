#ifdef _WIN32

#include "Ctrl49PrivateInput.h"

#include <windows.h>

#include <chrono>
#include <condition_variable>
#include <cstring>
#include <stdexcept>
#include <vector>

namespace ceditor::ctrl49
{

namespace
{
    constexpr DWORD kIoctlKsProperty = 0x002F0003;
    constexpr DWORD kKsPropertyGet   = 0x00000001;
    constexpr DWORD kKsPropertySet   = 0x00000002;

    constexpr DWORD kPropOpenCapture  = 5;
    constexpr DWORD kPropCloseCapture = 7;
    constexpr DWORD kPropReadyInputs  = 11;
    constexpr DWORD kPropReceive      = 12;

    constexpr int kReceiveCapacity = 1024;

    // Vendor private property set {A0634132-2F7F-4FDA-93BA-EA6D7D1BDD0D}.
    const GUID kPropertySet = { 0xA0634132, 0x2F7F, 0x4FDA,
        { 0x93, 0xBA, 0xEA, 0x6D, 0x7D, 0x1B, 0xDD, 0x0D } };

    // A KSPROPERTY request: 16-byte GUID, uint32 property id, uint32 flags, then extra.
    std::vector<std::uint8_t> makeProperty (DWORD propertyId, DWORD flags, int length)
    {
        std::vector<std::uint8_t> request (static_cast<std::size_t> (length), 0);
        std::memcpy (request.data(), &kPropertySet, 16);
        std::memcpy (request.data() + 16, &propertyId, 4);
        std::memcpy (request.data() + 20, &flags, 4);
        return request;
    }

    void setUInt32 (HANDLE device, DWORD propertyId, std::uint32_t value)
    {
        auto request = makeProperty (propertyId, kKsPropertySet, 24);
        DWORD returned = 0;
        if (! DeviceIoControl (device, kIoctlKsProperty,
                               request.data(), static_cast<DWORD> (request.size()),
                               &value, sizeof (value), &returned, nullptr))
            throw std::runtime_error ("KSPROPERTY SET " + std::to_string (propertyId)
                                      + " failed, GetLastError=" + std::to_string (GetLastError()));
    }

    std::uint32_t getUInt32 (HANDLE device, DWORD propertyId)
    {
        auto request = makeProperty (propertyId, kKsPropertyGet, 24);
        std::uint32_t value = 0;
        DWORD returned = 0;
        if (! DeviceIoControl (device, kIoctlKsProperty,
                               request.data(), static_cast<DWORD> (request.size()),
                               &value, sizeof (value), &returned, nullptr))
            throw std::runtime_error ("KSPROPERTY GET " + std::to_string (propertyId)
                                      + " failed, GetLastError=" + std::to_string (GetLastError()));
        if (returned < 4)
            throw std::runtime_error ("KSPROPERTY GET " + std::to_string (propertyId)
                                      + " returned fewer than four bytes");
        return value;
    }

    // One receive: 48-byte request (24-byte header + port index + reserved + user buffer
    // pointer + capacity), 16-byte result (timestamp + bytes copied + completion flag).
    struct ReceiveChunk
    {
        Bytes data;
        std::uint32_t completeFlag = 0;
    };

    ReceiveChunk receive (HANDLE device, std::uint8_t* buffer)
    {
        auto request = makeProperty (kPropReceive, kKsPropertyGet, 48);
        const std::uint32_t portIndex = 0;
        const auto bufferPtr = reinterpret_cast<std::uint64_t> (buffer);
        const std::uint32_t capacity = kReceiveCapacity;
        std::memcpy (request.data() + 24, &portIndex, 4);
        std::memcpy (request.data() + 32, &bufferPtr, 8);
        std::memcpy (request.data() + 40, &capacity, 4);

        std::uint8_t result[16] {};
        DWORD returned = 0;
        if (! DeviceIoControl (device, kIoctlKsProperty,
                               request.data(), static_cast<DWORD> (request.size()),
                               result, sizeof (result), &returned, nullptr))
            throw std::runtime_error ("KSPROPERTY receive failed, GetLastError="
                                      + std::to_string (GetLastError()));
        if (returned < 16)
            throw std::runtime_error ("KSPROPERTY receive returned fewer than 16 result bytes");

        std::uint32_t byteCount = 0;
        std::memcpy (&byteCount, result + 8, 4);
        if (byteCount > kReceiveCapacity)
            throw std::runtime_error ("KSPROPERTY receive reported more data than the buffer holds");

        ReceiveChunk chunk;
        chunk.data.assign (buffer, buffer + byteCount);
        std::memcpy (&chunk.completeFlag, result + 12, 4);
        return chunk;
    }

    struct RegistryKey
    {
        HKEY handle = nullptr;
        ~RegistryKey() { if (handle != nullptr) RegCloseKey (handle); }
    };

    // Depth-first search under a driver key for the first LastPath value.
    bool findLastPath (HKEY parent, std::wstring& out)
    {
        {
            wchar_t value[1024];
            DWORD size = sizeof (value);
            DWORD type = 0;
            if (RegQueryValueExW (parent, L"LastPath", nullptr, &type,
                                  reinterpret_cast<LPBYTE> (value), &size) == ERROR_SUCCESS
                && type == REG_SZ)
            {
                out.assign (value);
                if (! out.empty())
                    return true;
            }
        }

        DWORD subKeyCount = 0;
        if (RegQueryInfoKeyW (parent, nullptr, nullptr, nullptr, &subKeyCount,
                              nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr)
            != ERROR_SUCCESS)
            return false;

        for (DWORD i = 0; i < subKeyCount; ++i)
        {
            wchar_t name[256];
            DWORD nameSize = 256;
            if (RegEnumKeyExW (parent, i, name, &nameSize, nullptr, nullptr, nullptr, nullptr)
                != ERROR_SUCCESS)
                continue;
            RegistryKey child;
            if (RegOpenKeyExW (parent, name, 0, KEY_READ, &child.handle) != ERROR_SUCCESS)
                continue;
            if (findLastPath (child.handle, out))
                return true;
        }
        return false;
    }
} // namespace

std::wstring Ctrl49PrivateInput::discoverDevicePath()
{
    RegistryKey root;
    if (RegOpenKeyExW (HKEY_LOCAL_MACHINE,
                       L"SOFTWARE\\WOW6432Node\\inMusic\\Audio\\Drivers",
                       0, KEY_READ, &root.handle) != ERROR_SUCCESS)
        throw std::runtime_error ("inMusic audio-driver registry key not found");

    DWORD subKeyCount = 0;
    if (RegQueryInfoKeyW (root.handle, nullptr, nullptr, nullptr, &subKeyCount,
                          nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr)
        != ERROR_SUCCESS)
        throw std::runtime_error ("could not enumerate inMusic driver subkeys");

    for (DWORD i = 0; i < subKeyCount; ++i)
    {
        wchar_t name[256];
        DWORD nameSize = 256;
        if (RegEnumKeyExW (root.handle, i, name, &nameSize, nullptr, nullptr, nullptr, nullptr)
            != ERROR_SUCCESS)
            continue;

        RegistryKey driver;
        if (RegOpenKeyExW (root.handle, name, 0, KEY_READ, &driver.handle) != ERROR_SUCCESS)
            continue;

        wchar_t driverName[256];
        DWORD size = sizeof (driverName);
        DWORD type = 0;
        if (RegQueryValueExW (driver.handle, L"DriverName", nullptr, &type,
                              reinterpret_cast<LPBYTE> (driverName), &size) != ERROR_SUCCESS
            || type != REG_SZ
            || std::wstring (driverName) != L"CTRL49")
            continue;

        std::wstring path;
        if (findLastPath (driver.handle, path))
            return path;
    }

    throw std::runtime_error ("CTRL49 private topology-device path not found");
}

Ctrl49PrivateInput::~Ctrl49PrivateInput()
{
    try { stop(); } catch (...) {}
}

std::string Ctrl49PrivateInput::failure() const
{
    std::lock_guard<std::mutex> lock (failureMutex_);
    return failure_;
}

void Ctrl49PrivateInput::setFailure (const std::string& text)
{
    std::lock_guard<std::mutex> lock (failureMutex_);
    failure_ = text;
}

namespace
{
    // Signals when the worker has either opened capture (running) or failed.
    std::mutex g_startMutex;
    std::condition_variable g_startSignal;
    bool g_startResolved = false;
}

void Ctrl49PrivateInput::start (const std::wstring& devicePath)
{
    if (worker_.joinable())
        throw std::logic_error ("private cable-2 capture is already running");
    if (devicePath.empty())
        throw std::invalid_argument ("a private topology-device path is required");

    {
        std::lock_guard<std::mutex> lock (queueMutex_);
        messages_.clear();
    }
    setFailure ({});
    stopRequested_.store (false);
    running_.store (false);

    {
        std::lock_guard<std::mutex> lock (g_startMutex);
        g_startResolved = false;
    }

    worker_ = std::thread (&Ctrl49PrivateInput::captureLoop, this, devicePath);

    std::unique_lock<std::mutex> lock (g_startMutex);
    if (! g_startSignal.wait_for (lock, std::chrono::seconds (5),
                                  [] { return g_startResolved; }))
    {
        lock.unlock();
        stopRequested_.store (true);
        if (worker_.joinable())
            worker_.join();
        throw std::runtime_error ("timed out opening private cable-2 capture");
    }
    lock.unlock();

    if (! running_.load())
    {
        if (worker_.joinable())
            worker_.join();
        const std::string why = failure();
        throw std::runtime_error ("private cable-2 capture could not start"
                                  + (why.empty() ? std::string() : ": " + why));
    }
}

void Ctrl49PrivateInput::captureLoop (std::wstring devicePath)
{
    auto resolveStart = [] { std::lock_guard<std::mutex> lock (g_startMutex);
                             g_startResolved = true; g_startSignal.notify_all(); };

    HANDLE device = CreateFileW (devicePath.c_str(),
                                 GENERIC_READ | GENERIC_WRITE,
                                 FILE_SHARE_READ | FILE_SHARE_WRITE,
                                 nullptr, OPEN_EXISTING, 0, nullptr);
    if (device == INVALID_HANDLE_VALUE)
    {
        setFailure ("opening the CTRL49 topology interface failed, GetLastError="
                    + std::to_string (GetLastError()));
        resolveStart();
        return;
    }

    bool captureOpen = false;
    std::vector<std::uint8_t> receiveBuffer (kReceiveCapacity);
    Bytes message;

    try
    {
        setUInt32 (device, kPropOpenCapture, 0);
        captureOpen = true;
        running_.store (true);
        resolveStart();

        while (! stopRequested_.load())
        {
            const std::uint32_t ready = getUInt32 (device, kPropReadyInputs);
            if ((ready & 1) == 0)
            {
                std::this_thread::sleep_for (std::chrono::milliseconds (2));
                continue;
            }

            const ReceiveChunk chunk = receive (device, receiveBuffer.data());
            if (! chunk.data.empty())
                message.insert (message.end(), chunk.data.begin(), chunk.data.end());

            const bool complete = chunk.completeFlag != 0
                                  || chunk.data.empty()
                                  || chunk.data.back() == 0xF7;
            if (! complete)
                continue;

            if (! message.empty())
            {
                std::lock_guard<std::mutex> lock (queueMutex_);
                messages_.push_back (message);
            }
            message.clear();
        }
    }
    catch (const std::exception& error)
    {
        setFailure (error.what());
        resolveStart();  // no-op if already resolved
    }

    if (captureOpen)
    {
        try { setUInt32 (device, kPropCloseCapture, 0); }
        catch (...) {}
    }
    CloseHandle (device);
    running_.store (false);
}

void Ctrl49PrivateInput::stop (int timeoutMilliseconds)
{
    stopRequested_.store (true);
    if (worker_.joinable())
    {
        // std::thread has no timed join; the loop exits within one 2 ms poll of the flag.
        // The timeout argument documents intent and bounds pathological driver hangs by
        // detaching rather than blocking forever.
        const auto deadline = std::chrono::steady_clock::now()
                              + std::chrono::milliseconds (timeoutMilliseconds);
        while (running_.load() && std::chrono::steady_clock::now() < deadline)
            std::this_thread::sleep_for (std::chrono::milliseconds (2));

        if (running_.load())
        {
            worker_.detach();
            throw std::runtime_error ("timed out closing private cable-2 capture");
        }
        worker_.join();
    }
}

std::optional<Bytes> Ctrl49PrivateInput::dequeue()
{
    std::lock_guard<std::mutex> lock (queueMutex_);
    if (messages_.empty())
        return std::nullopt;
    Bytes front = std::move (messages_.front());
    messages_.pop_front();
    return front;
}

} // namespace ceditor::ctrl49

#endif // _WIN32
