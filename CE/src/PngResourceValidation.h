#pragma once

#include <cstddef>
#include <cstdint>

namespace ceditor
{

/** Cheap validation for bytes that will be exposed to the WebView as plug-in artwork.
    Fixing the MIME type is the script boundary; checking PNG's signature and IHDR also keeps
    HTML renamed to .png and pathological dimensions out without decoding in the main process. */
inline bool isSafePngResource (const void* bytes, std::size_t size) noexcept
{
    constexpr std::size_t maximumFileBytes = 8u * 1024u * 1024u;
    if (bytes == nullptr || size < 24 || size > maximumFileBytes)
        return false;

    const auto* p = static_cast<const std::uint8_t*> (bytes);
    constexpr std::uint8_t signature[] { 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a };
    for (std::size_t i = 0; i < sizeof (signature); ++i)
        if (p[i] != signature[i])
            return false;

    const auto readBigEndian = [p] (std::size_t offset)
    {
        return (std::uint32_t (p[offset]) << 24u) | (std::uint32_t (p[offset + 1]) << 16u)
             | (std::uint32_t (p[offset + 2]) << 8u) | std::uint32_t (p[offset + 3]);
    };

    if (readBigEndian (8) != 13 || p[12] != 'I' || p[13] != 'H'
        || p[14] != 'D' || p[15] != 'R')
        return false;

    const auto width = readBigEndian (16);
    const auto height = readBigEndian (20);
    constexpr std::uint32_t maximumDimension = 8192;
    constexpr std::uint64_t maximumPixels = 16ull * 1024ull * 1024ull;
    return width > 0 && height > 0 && width <= maximumDimension && height <= maximumDimension
        && std::uint64_t (width) * std::uint64_t (height) <= maximumPixels;
}

} // namespace ceditor
