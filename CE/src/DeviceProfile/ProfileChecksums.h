#pragma once

/*
    ProfileChecksums.h — the checksum algorithms, mirroring checksums.js (design doc §48).

    There were two implementations of this arithmetic in the codebase and they already disagreed:
    ce.midi.checksum understood roland / yamaha / sum / xor, while the device profile engine
    understood roland-7bit / sum-7bit (plus xor on the verify path only, and not on the build path)
    and hard-rejected the rest. A script could therefore compute a checksum that no profile could
    express, and the same bytes could get different answers depending on which side asked.

    The JavaScript table at CE/web/src/CE_Application/utils/checksums.js is the reference. This is
    the same table for the player, and checksumFixture.json pins the two together: every algorithm is
    listed there with the answer it must give for a fixed byte string, generated from the JS side and
    asserted from both. If these ever diverge, that fixture fails rather than a synth quietly
    rejecting a dump.

    ON WIDTH. A SysEx data byte is seven bits, so the classic MIDI checksums return 0..127 and drop
    into one byte. A CRC does not, so `width` says how many 7-bit bytes the answer needs and
    checksumBytes() splits it MSB-first. A checksum field in a profile may therefore be longer than
    one byte, which is what byteCount is for.
*/

#include <juce_core/juce_core.h>

namespace ce::checksums
{

struct Algorithm
{
    const char* id;
    const char* label;
    int width;              // 7-bit bytes the result occupies
};

/** Sum of the bytes, masked to seven bits. */
inline int sum7 (const juce::Array<int>& bytes)
{
    auto value = 0;
    for (auto byte : bytes)
        value = (value + (byte & 0xff)) & 0x7f;
    return value;
}

/** Sum of the bytes, masked to eight. */
inline int sum8 (const juce::Array<int>& bytes)
{
    auto value = 0;
    for (auto byte : bytes)
        value = (value + (byte & 0xff)) & 0xff;
    return value;
}

/** Byte-at-a-time CRC, MSB first, no reflection. */
inline juce::uint32 crcMsbFirst (const juce::Array<int>& bytes,
                                 juce::uint32 poly, juce::uint32 init, juce::uint32 xorOut, int bits)
{
    const auto top = (juce::uint32) 1u << (bits - 1);
    const auto mask = bits == 32 ? 0xffffffffu : (((juce::uint32) 1u << bits) - 1u);
    auto crc = init;

    for (auto byte : bytes)
    {
        crc ^= ((juce::uint32) (byte & 0xff)) << (bits - 8);
        for (int i = 0; i < 8; ++i)
            crc = ((crc & top) != 0 ? ((crc << 1) ^ poly) : (crc << 1)) & mask;
        crc &= mask;
    }

    return (crc ^ xorOut) & mask;
}

/** Byte-at-a-time CRC with input and output reflected. */
inline juce::uint32 crcReflected (const juce::Array<int>& bytes,
                                  juce::uint32 poly, juce::uint32 init, juce::uint32 xorOut, int bits)
{
    const auto mask = bits == 32 ? 0xffffffffu : (((juce::uint32) 1u << bits) - 1u);
    auto crc = init;

    for (auto byte : bytes)
    {
        crc ^= (juce::uint32) (byte & 0xff);
        for (int i = 0; i < 8; ++i)
            crc = ((crc & 1u) != 0 ? ((crc >> 1) ^ poly) : (crc >> 1)) & mask;
    }

    return (crc ^ xorOut) & mask;
}

/** Canonical id for a name, resolving the spellings already in the wild. Empty for an unknown name:
    the caller reports rather than this guessing a default, which is what the old scripting side did. */
inline juce::String canonicalName (const juce::String& name)
{
    const auto n = name.trim().toLowerCase();

    if (n == "sum" || n == "sum-7bit")                                   return "sum-7bit";
    if (n == "roland" || n == "yamaha" || n == "roland-7bit"
        || n == "twos-complement-7bit")                                  return "roland-7bit";
    if (n == "ones" || n == "ones-complement" || n == "ones-complement-7bit")
                                                                         return "ones-complement-7bit";
    if (n == "xor" || n == "xor-7bit")                                   return "xor-7bit";
    if (n == "offset" || n == "kawai" || n == "offset-7bit")              return "offset-7bit";
    if (n == "sum-8bit")                                                 return "sum-8bit";
    if (n == "twos-complement" || n == "twos-complement-8bit")            return "twos-complement-8bit";
    if (n == "crc8")                                                     return "crc8";
    if (n == "crc16" || n == "crc16-ccitt")                              return "crc16-ccitt";
    if (n == "crc16-modbus")                                             return "crc16-modbus";
    if (n == "crc32")                                                    return "crc32";

    return {};
}

/** How many 7-bit bytes one algorithm's answer needs. Zero for an unknown name. */
inline int widthOf (const juce::String& canonical)
{
    if (canonical == "sum-7bit" || canonical == "roland-7bit"
        || canonical == "ones-complement-7bit" || canonical == "xor-7bit"
        || canonical == "offset-7bit")                       return 1;
    if (canonical == "sum-8bit" || canonical == "twos-complement-8bit"
        || canonical == "crc8")                              return 2;
    if (canonical == "crc16-ccitt" || canonical == "crc16-modbus") return 3;
    if (canonical == "crc32")                                return 5;
    return 0;
}

/** Compute one. `ok` is false for a name the table does not have. `offset` is only read by
    offset-7bit, where the constant belongs to the device rather than to us. */
inline bool compute (const juce::String& name, const juce::Array<int>& bytes,
                     juce::uint32& result, int offset = 0xa5)
{
    const auto id = canonicalName (name);
    if (id.isEmpty())
        return false;

    if (id == "sum-7bit")               result = (juce::uint32) sum7 (bytes);
    else if (id == "roland-7bit")       result = (juce::uint32) ((128 - sum7 (bytes)) & 0x7f);
    else if (id == "ones-complement-7bit") result = (juce::uint32) ((127 - sum7 (bytes)) & 0x7f);
    else if (id == "xor-7bit")
    {
        auto value = 0;
        for (auto byte : bytes)
            value = (value ^ (byte & 0xff)) & 0x7f;
        result = (juce::uint32) value;
    }
    else if (id == "offset-7bit")       result = (juce::uint32) ((sum7 (bytes) + offset) & 0x7f);
    else if (id == "sum-8bit")          result = (juce::uint32) sum8 (bytes);
    else if (id == "twos-complement-8bit") result = (juce::uint32) ((256 - sum8 (bytes)) & 0xff);
    else if (id == "crc8")              result = crcMsbFirst (bytes, 0x07u, 0x00u, 0x00u, 8);
    else if (id == "crc16-ccitt")       result = crcMsbFirst (bytes, 0x1021u, 0xffffu, 0x0000u, 16);
    else if (id == "crc16-modbus")      result = crcReflected (bytes, 0xa001u, 0xffffu, 0x0000u, 16);
    else if (id == "crc32")             result = crcReflected (bytes, 0xedb88320u, 0xffffffffu, 0xffffffffu, 32);
    else return false;

    return true;
}

/** The bytes a checksum occupies, MSB first and 7-bit safe. Empty for an unknown name. */
inline juce::Array<int> toBytes (const juce::String& name, const juce::Array<int>& bytes,
                                 int offset = 0xa5)
{
    juce::Array<int> out;
    juce::uint32 value = 0;
    if (! compute (name, bytes, value, offset))
        return out;

    const auto width = widthOf (canonicalName (name));
    if (width <= 1)
    {
        out.add ((int) (value & 0x7fu));
        return out;
    }

    for (int i = 0; i < width; ++i)
    {
        out.insert (0, (int) (value & 0x7fu));
        value /= 128u;
    }
    return out;
}

} // namespace ce::checksums
