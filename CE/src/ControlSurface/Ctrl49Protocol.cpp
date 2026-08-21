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
    if (payload.size() > 0x3FFF)
        throw std::invalid_argument ("payload exceeds two base-128 length digits");
    if (type >= 0x80 || command >= 0x80)
        throw std::invalid_argument ("frame type/command has high bit set");
    for (const std::uint8_t b : payload)
        if (b >= 0x80)
            throw std::invalid_argument ("payload byte has high bit set");

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

} // namespace ceditor::ctrl49
