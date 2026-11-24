#include "Ctrl49Protocol.h"

namespace ceditor::ctrl49
{

namespace
{
    constexpr std::uint8_t kSysExStart = 0xF0;
    constexpr std::uint8_t kSysExEnd   = 0xF7;

    // F0 + M-Audio manufacturer ID + CTRL49 product ID
    constexpr std::uint8_t kHeader[] = { 0xF0, 0x00, 0x01, 0x05, 0x31, 0x08 };

    void appendBase128 (Bytes& out, std::uint32_t value, int digits)
    {
        const Bytes encoded = encodeBase128 (value, digits);
        out.insert (out.end(), encoded.begin(), encoded.end());
    }

    // A setting value on the wire: four base-128 digits, offset by 2^27 so negatives travel.
    constexpr std::int64_t kSettingValueOffset = 0x08000000;

    // The payload of a complete CTRL49 frame of this type and command, or nullopt.
    std::optional<Bytes> framePayload (const Bytes& f, std::uint8_t type, std::uint8_t command)
    {
        constexpr std::size_t kOverhead = sizeof (kHeader) + 4 + 1;
        if (f.size() < kOverhead || f.back() != kSysExEnd)
            return std::nullopt;
        for (std::size_t i = 0; i < sizeof (kHeader); ++i)
            if (f[i] != kHeader[i])
                return std::nullopt;
        if (f[sizeof (kHeader)] != type || f[sizeof (kHeader) + 1] != command)
            return std::nullopt;
        for (std::size_t i = 1; i + 1 < f.size(); ++i)
            if (f[i] >= 0x80)
                return std::nullopt;
        if (decodeBase128 (f.data() + sizeof (kHeader) + 2, 2) != f.size() - kOverhead)
            return std::nullopt;
        return Bytes (f.begin() + static_cast<std::ptrdiff_t> (sizeof (kHeader) + 4), f.end() - 1);
    }

    std::string commandLabel (std::uint8_t type, std::uint8_t command)
    {
        static const char* hex = "0123456789ABCDEF";
        return std::string { hex[type >> 4], hex[type & 0x0F], '/', hex[command >> 4], hex[command & 0x0F] };
    }

    // 04/01 is [id: 1 byte][value: 4 base-128 digits], the value offset by 2^27 so negatives
    // travel. The firmware clamps a value to the setting's range; what it does not do is check
    // the id, or stop a write that switches modes, writes flash or resets the keyboard.
    std::optional<std::string> settingWriteRefusal (const Bytes& payload)
    {
        if (payload.size() != 5)
            return std::string ("a setting write is an id and four value digits");

        const std::uint8_t id = payload[0];
        const auto value = static_cast<std::int64_t> (decodeBase128 (payload.data() + 1, 4)) - kSettingValueOffset;
        const auto name = "setting " + std::to_string (id);

        if (id > kLastSettingId)
            return name + " is past the firmware's settings table";

        switch (id)
        {
            case 9:  return name + " has no name in the firmware and is left alone";
            case setting::kFirmwareMode: return name + " is the firmware mode";
            case setting::kRequestedMode:
                if (value == 1 || value == 2)
                    return std::nullopt;  // leave VIP mode / VIP mode: what VIP and HoSTage send
                return name + " (requested firmware mode) may only be 1 or 2; 3 leads toward update mode";
            case setting::kRequestedMode2:
                if (value == 0)
                    return std::nullopt;  // VIP writes 0 at every start
                return name + " (requested firmware mode) may only be 0";
            case 33: return name + " saves the global settings to flash";
            case setting::kFirmwareVersion: return name + " is the firmware version, read only";
            case setting::kBootRomVersion:  return name + " is the boot ROM version, read only";
            case 36: return name + " is a factory reset";
            case 37: return name + " sends a program";
            default: return std::nullopt;
        }
    }
} // namespace

//==================================================================================================
// Numeric encodings

Bytes encodeBase128 (std::uint32_t value, int digits)
{
    if (digits < 1 || digits > 5)
        throw std::invalid_argument ("base-128 digit count out of range");

    if (digits < 5 && value >= (1u << (7 * digits)))
        throw std::invalid_argument ("value does not fit base-128 digit count");

    Bytes out (static_cast<std::size_t> (digits));
    for (int i = digits - 1; i >= 0; --i)
    {
        out[static_cast<std::size_t> (i)] = static_cast<std::uint8_t> (value & 0x7F);
        value >>= 7;
    }
    return out;
}

std::uint32_t decodeBase128 (const std::uint8_t* data, int digits)
{
    std::uint32_t value = 0;
    for (int i = 0; i < digits; ++i)
    {
        if (data[i] >= 0x80)
            throw std::invalid_argument ("base-128 digit has high bit set");
        value = (value << 7) | data[i];
    }
    return value;
}

Bytes encodeMidi7 (const Bytes& raw)
{
    Bytes out;
    out.reserve ((raw.size() * 8 + 6) / 7);

    std::uint32_t accumulator = 0;
    int bitCount = 0;

    for (const std::uint8_t rawByte : raw)
    {
        accumulator |= static_cast<std::uint32_t> (rawByte) << bitCount;
        bitCount += 8;
        while (bitCount >= 7)
        {
            out.push_back (static_cast<std::uint8_t> (accumulator & 0x7F));
            accumulator >>= 7;
            bitCount -= 7;
        }
    }
    if (bitCount > 0)
        out.push_back (static_cast<std::uint8_t> (accumulator & 0x7F));

    return out;
}

Bytes decodeMidi7 (const Bytes& encoded, std::size_t rawSize)
{
    if (encoded.size() != (rawSize * 8 + 6) / 7)
        throw std::invalid_argument ("MIDI-7 encoded size does not match raw size");

    Bytes out;
    out.reserve (rawSize);

    std::uint32_t accumulator = 0;
    int bitCount = 0;

    for (const std::uint8_t encodedByte : encoded)
    {
        if (encodedByte >= 0x80)
            throw std::invalid_argument ("MIDI-7 byte has high bit set");
        accumulator |= static_cast<std::uint32_t> (encodedByte) << bitCount;
        bitCount += 7;
        if (bitCount >= 8 && out.size() < rawSize)
        {
            out.push_back (static_cast<std::uint8_t> (accumulator & 0xFF));
            accumulator >>= 8;
            bitCount -= 8;
        }
    }
    return out;
}

//==================================================================================================
// Framing

Bytes buildFrame (std::uint8_t type, std::uint8_t command, const Bytes& payload)
{
    if (payload.size() > kMaxPayloadBytes)
        throw std::invalid_argument ("payload exceeds the device's 1000-byte frame limit");
    if (type >= 0x80 || command >= 0x80)
        throw std::invalid_argument ("frame type/command has high bit set");
    for (const std::uint8_t b : payload)
        if (b >= 0x80)
            throw std::invalid_argument ("payload byte has high bit set");
    if (const auto why = refusalReason (type, command, payload))
        throw std::invalid_argument ("refused to build " + *why);

    Bytes out;
    out.reserve (sizeof (kHeader) + 4 + payload.size() + 1);
    out.insert (out.end(), std::begin (kHeader), std::end (kHeader));
    out.push_back (type);
    out.push_back (command);
    appendBase128 (out, static_cast<std::uint32_t> (payload.size()), 2);
    out.insert (out.end(), payload.begin(), payload.end());
    out.push_back (kSysExEnd);
    return out;
}

//==================================================================================================
// Refusals

std::optional<std::string> refusalReason (std::uint8_t type, std::uint8_t command, const Bytes& payload)
{
    const auto refuse = [&] (const std::string& why) -> std::optional<std::string>
    {
        return commandLabel (type, command) + ": " + why;
    };

    switch (type)
    {
        case 0x03:
            if (command == 0x02) return refuse ("restarts the keyboard");
            if (command == 0x06) return refuse ("asks for update mode");
            if (command == 0x07) return refuse ("writes the requested firmware mode back from what 03/06 kept");
            break;

        case 0x04:
            switch (command)
            {
                case 0x00: return refuse ("acts as if a panel control were pressed");
                case 0x01:
                    if (const auto why = settingWriteRefusal (payload))
                        return refuse (*why);
                    break;
                case 0x02:
                    if (payload.size() != 1)
                        return refuse ("a setting read is one id");
                    if (payload[0] > kLastSettingId)
                        return refuse ("setting " + std::to_string (payload[0]) + " is past the firmware's settings table");
                    break;
                case 0x04: return refuse ("copies an uploaded object into the active preset");
                case 0x07: return refuse ("edits the keyboard's stored presets");
                case 0x08: return refuse ("stores the edited preset name");
                default: break;
            }
            break;

        case 0x05:
            switch (command)
            {
                case 0x00:
                    if (payload.size() != 9)
                        return refuse ("an object begin is a key, a size and a storage state");
                    if (payload[8] != kObjectStateRam)
                        return refuse ("storage state " + std::to_string (payload[8])
                                       + " would put the object in flash; only 4 (RAM) may be sent");
                    break;
                case 0x02: return refuse ("writes an object into the keyboard's flash");
                case 0x04: return refuse ("erases a storage area of the keyboard's flash");
                case 0x06: return refuse ("marks the keyboard's asset flash valid");
                default: break;
            }
            break;

        case 0x06:
            if (command == 0x00 || command == 0x01)
                return refuse ("marks the firmware for renewal and restarts the keyboard");
            break;

        default:
            break;
    }
    return std::nullopt;
}

std::optional<std::string> refusalReason (const Bytes& frame)
{
    // F0 [header 5] TT CC L0 L1 [payload] F7
    constexpr std::size_t kOverhead = sizeof (kHeader) + 4 + 1;
    if (frame.size() < kOverhead || frame.back() != kSysExEnd)
        return std::string ("not a complete CTRL49 frame");
    for (std::size_t i = 0; i < sizeof (kHeader); ++i)
        if (frame[i] != kHeader[i])
            return std::string ("not a CTRL49 frame (another device's header)");
    for (std::size_t i = 1; i + 1 < frame.size(); ++i)
        if (frame[i] >= 0x80)
            return std::string ("a CTRL49 frame byte has its high bit set");

    const std::size_t declared = decodeBase128 (frame.data() + sizeof (kHeader) + 2, 2);
    if (declared != frame.size() - kOverhead)
        return std::string ("the frame's length field does not match its payload");

    const auto first = frame.begin() + static_cast<std::ptrdiff_t> (sizeof (kHeader) + 4);
    const Bytes payload (first, frame.end() - 1);
    return refusalReason (frame[sizeof (kHeader)], frame[sizeof (kHeader) + 1], payload);
}

//==================================================================================================
// Object upload

Bytes objectKeyBytes (ObjectKey key)
{
    Bytes out;
    out.reserve (4);
    appendBase128 (out, key.type, 2);
    appendBase128 (out, key.id, 2);
    return out;
}

Bytes buildObjectBegin (ObjectKey key, std::uint32_t totalRawSize, std::uint8_t flags)
{
    Bytes payload = objectKeyBytes (key);
    appendBase128 (payload, totalRawSize, 4);
    payload.push_back (flags);
    return buildFrame (0x05, 0x00, payload);
}

Bytes buildObjectChunk (ObjectKey key, const Bytes& rawChunk, std::uint32_t rawOffset)
{
    if (rawChunk.empty())
        throw std::invalid_argument ("object chunk must not be empty");

    const Bytes encoded = encodeMidi7 (rawChunk);

    Bytes payload = objectKeyBytes (key);
    appendBase128 (payload, static_cast<std::uint32_t> (rawChunk.size()), 4);
    appendBase128 (payload, rawOffset, 4);
    appendBase128 (payload, static_cast<std::uint32_t> (encoded.size()), 2);
    payload.insert (payload.end(), encoded.begin(), encoded.end());
    return buildFrame (0x05, 0x01, payload);
}

Bytes buildObjectEnd (ObjectKey key, std::uint8_t status)
{
    Bytes payload = objectKeyBytes (key);
    payload.push_back (status);
    return buildFrame (0x05, 0x0B, payload);
}

std::vector<Bytes> buildObjectUpload (ObjectKey key, const Bytes& raw, std::size_t chunkSize)
{
    if (chunkSize == 0)
        throw std::invalid_argument ("chunk size must be positive");

    std::vector<Bytes> frames;
    frames.reserve (2 + (raw.size() + chunkSize - 1) / chunkSize);

    frames.push_back (buildObjectBegin (key, static_cast<std::uint32_t> (raw.size())));

    for (std::size_t offset = 0; offset < raw.size(); offset += chunkSize)
    {
        const std::size_t remaining = raw.size() - offset;
        const std::size_t thisChunk = remaining < chunkSize ? remaining : chunkSize;
        const Bytes chunk (raw.begin() + static_cast<std::ptrdiff_t> (offset),
                           raw.begin() + static_cast<std::ptrdiff_t> (offset + thisChunk));
        frames.push_back (buildObjectChunk (key, chunk, static_cast<std::uint32_t> (offset)));
    }

    frames.push_back (buildObjectEnd (key));
    return frames;
}

//==================================================================================================
// Display runtime

Bytes buildSceneBegin (std::uint8_t sceneGroup)
{
    return buildFrame (0x02, 0x0D, { sceneGroup, 0x01 });
}

Bytes buildSceneActivate (std::uint8_t sceneGroup)
{
    return buildFrame (0x02, 0x10, { sceneGroup });
}

Bytes buildCreateTarget (std::uint8_t target)
{
    return buildFrame (0x02, 0x39, { 0x02, target });
}

Bytes buildBindLua (std::uint8_t target, std::uint16_t luaObjectId)
{
    Bytes payload { 0x02, target, 0x10 };
    appendBase128 (payload, luaObjectId, 2);
    return buildFrame (0x02, 0x3A, payload);
}

Bytes buildSetLayerPosition (std::uint8_t sceneGroup, std::uint8_t target,
                             std::uint16_t x, std::uint16_t y)
{
    Bytes payload { sceneGroup, 0x0D, 0x02, target };
    appendBase128 (payload, x, 2);
    appendBase128 (payload, y, 2);
    return buildFrame (0x02, 0x0E, payload);
}

Bytes buildLuaCall (std::uint8_t target, std::string_view function, const Bytes& args)
{
    const Bytes functionRaw (function.begin(), function.end());
    const Bytes functionEncoded = encodeMidi7 (functionRaw);
    const Bytes argsEncoded     = encodeMidi7 (args);

    Bytes payload { 0x02, target };
    appendBase128 (payload, static_cast<std::uint32_t> (functionRaw.size()), 2);
    appendBase128 (payload, static_cast<std::uint32_t> (functionEncoded.size()), 2);
    payload.insert (payload.end(), functionEncoded.begin(), functionEncoded.end());
    appendBase128 (payload, static_cast<std::uint32_t> (args.size()), 2);
    appendBase128 (payload, static_cast<std::uint32_t> (argsEncoded.size()), 2);
    payload.insert (payload.end(), argsEncoded.begin(), argsEncoded.end());
    return buildFrame (0x02, 0x3C, payload);
}

Bytes buildDraw (std::uint8_t target, const Bytes& args)
{
    const Bytes argsEncoded = encodeMidi7 (args);

    Bytes payload { 0x02, target };
    appendBase128 (payload, static_cast<std::uint32_t> (args.size()), 2);
    appendBase128 (payload, static_cast<std::uint32_t> (argsEncoded.size()), 2);
    payload.insert (payload.end(), argsEncoded.begin(), argsEncoded.end());
    return buildFrame (0x02, 0x3B, payload);
}

//==================================================================================================
// Session

Bytes buildIdentityQuery()
{
    return buildFrame (0x03, 0x08, {});
}

Bytes buildKeepalive()
{
    return buildFrame (0x03, 0x00, {});
}

//==================================================================================================
// Controls and LEDs

Bytes buildLedLevel (std::uint8_t control, std::uint8_t level)
{
    return buildFrame (0x04, 0x05, { control, level });
}

Bytes buildPadRgb (std::uint8_t padId, std::uint8_t red, std::uint8_t green, std::uint8_t blue)
{
    if (padId < 1 || padId > 8)
        throw std::invalid_argument ("pad ID out of range 1..8");

    Bytes payload { padId };
    appendBase128 (payload, 0, 2);  // unknown field — keep the captured value 0
    appendBase128 (payload, red, 2);
    appendBase128 (payload, green, 2);
    appendBase128 (payload, blue, 2);
    return buildFrame (0x04, 0x06, payload);
}

//==================================================================================================
// Device settings

Bytes buildSetSetting (std::uint8_t id, std::int32_t value)
{
    const std::int64_t wire = static_cast<std::int64_t> (value) + kSettingValueOffset;
    if (wire < 0 || wire >= (std::int64_t (1) << 28))
        throw std::invalid_argument ("setting value does not fit the wire's 28 bits");

    Bytes payload { id };
    appendBase128 (payload, static_cast<std::uint32_t> (wire), 4);
    return buildFrame (0x04, 0x01, payload);  // refuses what must not be written
}

Bytes buildReadSetting (std::uint8_t id)
{
    return buildFrame (0x04, 0x02, { id });   // refuses an id past the table
}

//==================================================================================================
// Liveness

Bytes buildPing()
{
    return buildFrame (0x06, 0x02, {});
}

//==================================================================================================
// Replies

std::optional<Ctrl49Ack> parseAck (const Bytes& f)
{
    // F0 00 01 05 31 08 02 3D L0 L1 [route][route][command][status] F7
    if (f.size() < 15 || f[0] != 0xF0 || f[6] != 0x02 || f[7] != 0x3D)
        return std::nullopt;
    for (std::size_t i = 0; i < sizeof (kHeader); ++i)
        if (f[i] != kHeader[i])
            return std::nullopt;
    if (decodeBase128 (f.data() + 8, 2) < 4)
        return std::nullopt;
    return Ctrl49Ack { f[12], f[13] };
}

std::optional<Ctrl49SettingValue> parseSettingReply (const Bytes& frame)
{
    const auto payload = framePayload (frame, 0x04, 0x02);
    if (! payload || payload->size() != 5)
        return std::nullopt;
    const auto value = static_cast<std::int64_t> (decodeBase128 (payload->data() + 1, 4)) - kSettingValueOffset;
    return Ctrl49SettingValue { (*payload)[0], static_cast<std::int32_t> (value) };
}

bool isPingReply (const Bytes& frame)
{
    const auto payload = framePayload (frame, 0x06, 0x03);
    return payload && payload->size() == 1 && (*payload)[0] == 0x00;
}

std::string ackStatusName (std::uint8_t status)
{
    switch (status)
    {
        case kAckOk:          return "OK";
        case kAckBadArgument: return "bad argument";
        case kAckOutOfMemory: return "out of memory";
        case kAckNotFound:    return "not found";
        case kAckScriptError: return "Lua script error";
        case kAckError:       return "error";
        default: break;
    }
    static const char* hex = "0123456789ABCDEF";
    return std::string ("status 0x") + hex[status >> 4] + hex[status & 0x0F];
}

std::string displayCommandName (std::uint8_t command)
{
    switch (command)
    {
        case 0x0D: return "scene begin";
        case 0x0E: return "layer position";
        case 0x10: return "scene activate";
        case 0x31: return "create canvas";
        case 0x32: return "select canvas";
        case 0x33: return "decode into canvas";
        case 0x39: return "create target";
        case 0x3A: return "bind Lua";
        case 0x3B: return "draw";
        case 0x3C: return "Lua call";
        default: break;
    }
    static const char* hex = "0123456789ABCDEF";
    return std::string ("02/") + hex[command >> 4] + hex[command & 0x0F];
}

} // namespace ceditor::ctrl49
