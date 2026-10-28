#pragma once

#include <juce_core/juce_core.h>
#include <cmath>
#include <cstring>

/**
 * ce.osc's reading and writing of Open Sound Control 1.0 (docs/design/ce-osc-module.md).
 *
 * Its own code rather than juce_osc's: JUCE's reader knows five argument types, and a packet with any
 * other (a double, true, false, nothing, a time) is dropped whole, so a message from Max, Pure Data
 * or a DAW that carries one never arrives. This reads and writes every type the design lists:
 *
 *   i h  whole numbers (32 and 64 bit)   -> a number
 *   f d  decimal numbers (32 and 64 bit) -> a number
 *   s S  text, symbol                    -> text
 *   T F  true, false                     -> true, false
 *   N I  nothing, impulse                -> nothing; true
 *   b    bytes                           -> a list of numbers
 *   r    colour                          -> "#RRGGBBAA"
 *   m    MIDI message                    -> a list of four bytes
 *   t    time                            -> a number of seconds since 1900 (1 / 2^32 is "at once")
 *   c    character                       -> text
 *   [ ]  an array                        -> a list
 *
 * A message is a var { address, args, types[, time] }; `types` keeps the tags as sent, so a script can
 * tell 1 from 1.0. Pure: no socket, no thread, so the tests drive it with captured packets.
 */
namespace ceditor::osc
{

/** Bytes are big-endian on the wire. */
struct Reader
{
    const juce::uint8* data = nullptr;
    size_t size = 0, at = 0;
    juce::String error;

    bool need (size_t n)
    {
        if (at + n <= size) return true;
        if (error.isEmpty()) error = "the packet ends inside a value";
        return false;
    }
    juce::uint32 u32()
    {
        if (! need (4)) return 0;
        const auto v = ((juce::uint32) data[at] << 24) | ((juce::uint32) data[at + 1] << 16)
                     | ((juce::uint32) data[at + 2] << 8) | (juce::uint32) data[at + 3];
        at += 4;
        return v;
    }
    juce::uint64 u64() { const juce::uint64 hi = u32(); return (hi << 32) | u32(); }
    juce::String text()
    {
        const auto start = at;
        while (at < size && data[at] != 0) ++at;
        if (at >= size) { if (error.isEmpty()) error = "a text has no end"; return {}; }
        const auto s = juce::String::fromUTF8 ((const char*) data + start, (int) (at - start));
        at = (at + 4) & ~(size_t) 3;   // past the zero, to the next multiple of four
        if (at > size) { if (error.isEmpty()) error = "a text is not padded"; at = size; }
        return s;
    }
};

inline double timeTagToNumber (juce::uint64 tag)
{
    return (double) (tag >> 32) + (double) (tag & 0xffffffffu) / 4294967296.0;
}

inline juce::uint64 numberToTimeTag (double seconds)
{
    if (! (seconds > 0)) return 1;   // "at once"
    const auto whole = std::floor (seconds);
    return ((juce::uint64) whole << 32) | (juce::uint64) std::llround ((seconds - whole) * 4294967296.0) ;
}

/** One message from `r` (positioned at its address); appended to `out`. False and r.error on a bad one. */
inline bool readMessage (Reader& r, juce::Array<juce::var>& out, const juce::var& time)
{
    const auto address = r.text();
    if (r.error.isNotEmpty()) return false;
    if (! address.startsWithChar ('/')) { r.error = "an address must start with /"; return false; }
    juce::String tags;
    if (r.at < r.size) tags = r.text();
    if (r.error.isNotEmpty()) return false;
    if (tags.isEmpty()) tags = ",";   // OSC 1.0 allows a message with no tag string
    if (! tags.startsWithChar (',')) { r.error = "the type tags must start with ,"; return false; }

    juce::Array<juce::var> args;
    juce::Array<juce::Array<juce::var>> arrays;   // open [ ... ]
    auto add = [&] (const juce::var& v) { (arrays.isEmpty() ? args : arrays.getReference (arrays.size() - 1)).add (v); };
    for (int i = 1; i < tags.length(); ++i)
    {
        const auto tag = tags[i];
        switch (tag)
        {
            case 'i': add ((int) (juce::int32) r.u32()); break;
            case 'h': add ((juce::int64) r.u64()); break;
            case 'f': { const auto bits = r.u32(); float f; std::memcpy (&f, &bits, 4); add ((double) f); break; }
            case 'd': { const auto bits = r.u64(); double d; std::memcpy (&d, &bits, 8); add (d); break; }
            case 's': case 'S': add (r.text()); break;
            case 'T': add (true); break;
            case 'F': add (false); break;
            case 'N': add (juce::var()); break;
            case 'I': add (true); break;
            case 'b':
            {
                const auto n = (size_t) r.u32();
                if (! r.need (n)) return false;
                juce::Array<juce::var> bytes;
                for (size_t k = 0; k < n; ++k) bytes.add ((int) r.data[r.at + k]);
                r.at += (n + 3) & ~(size_t) 3;
                if (r.at > r.size) r.at = r.size;
                add (bytes);
                break;
            }
            case 'r':
            {
                const auto rgba = r.u32();
                add ("#" + juce::String::toHexString ((int) rgba).paddedLeft ('0', 8).toUpperCase());
                break;
            }
            case 'm':
            {
                if (! r.need (4)) return false;
                juce::Array<juce::var> midi;
                for (int k = 0; k < 4; ++k) midi.add ((int) r.data[r.at + (size_t) k]);
                r.at += 4;
                add (midi);
                break;
            }
            case 't': add (timeTagToNumber (r.u64())); break;
            case 'c': add (juce::String::charToString ((juce::juce_wchar) r.u32())); break;
            case '[': arrays.add ({}); break;
            case ']':
            {
                if (arrays.isEmpty()) { r.error = "an array ends that never began"; return false; }
                const juce::var list (arrays.removeAndReturn (arrays.size() - 1));
                add (list);
                break;
            }
            default:
                r.error = "type '" + juce::String::charToString (tag) + "' is not OSC";
                return false;
        }
        if (r.error.isNotEmpty()) return false;
    }
    if (! arrays.isEmpty()) { r.error = "an array never ends"; return false; }

    auto* o = new juce::DynamicObject();
    o->setProperty ("address", address);
    o->setProperty ("args", args);
    o->setProperty ("types", tags.substring (1));
    if (! time.isVoid()) o->setProperty ("time", time);
    out.add (juce::var (o));
    return true;
}

/** The messages in one packet, a bundle's in order, each with the bundle's time. A message that
    cannot be read is left out and counted in `bad`; the rest of a bundle still arrives. */
inline juce::Array<juce::var> decodePacket (const void* data, size_t size, int& bad, juce::String& firstError, int depth = 0)
{
    juce::Array<juce::var> out;
    Reader r { static_cast<const juce::uint8*> (data), size, 0, {} };
    if (size >= 8 && std::memcmp (data, "#bundle\0", 8) == 0)
    {
        if (depth > 8) { ++bad; if (firstError.isEmpty()) firstError = "bundles nest too deep"; return out; }
        r.at = 8;
        const auto time = timeTagToNumber (r.u64());
        while (r.error.isEmpty() && r.at + 4 <= size)
        {
            const auto n = (size_t) r.u32();
            if (n % 4 != 0 || r.at + n > size) { ++bad; if (firstError.isEmpty()) firstError = "a bundle element has a bad size"; break; }
            const auto* element = r.data + r.at;
            if (n >= 8 && std::memcmp (element, "#bundle\0", 8) == 0)
                out.addArray (decodePacket (element, n, bad, firstError, depth + 1));
            else
            {
                Reader m { element, n, 0, {} };
                if (! readMessage (m, out, time)) { ++bad; if (firstError.isEmpty()) firstError = m.error; }
            }
            r.at += n;
        }
        if (r.error.isNotEmpty()) { ++bad; if (firstError.isEmpty()) firstError = r.error; }
        return out;
    }
    if (size % 4 != 0) { ++bad; if (firstError.isEmpty()) firstError = "a packet's size must be a multiple of four"; return out; }
    if (! readMessage (r, out, {})) { ++bad; if (firstError.isEmpty()) firstError = r.error; }
    return out;
}

/** Writing: big-endian, padded to four. */
struct Writer
{
    juce::MemoryOutputStream out;
    void u32 (juce::uint32 v) { out.writeIntBigEndian ((int) v); }
    void u64 (juce::uint64 v) { out.writeInt64BigEndian ((juce::int64) v); }
    void pad() { while (out.getDataSize() % 4 != 0) out.writeByte (0); }
    void text (const juce::String& s) { out.write (s.toRawUTF8(), s.getNumBytesAsUTF8()); out.writeByte (0); pad(); }
};

/** Whether `tag` can carry `v`, as ce.osc's checks read it (oscCore.js says the same in words). */
inline bool fits (juce::juce_wchar tag, const juce::var& v)
{
    const auto isBytes = [] (const juce::var& x, int count)
    {
        auto* a = x.getArray();
        if (a == nullptr || (count >= 0 && a->size() != count)) return false;
        for (const auto& b : *a)
            if (! (b.isInt() || b.isInt64() || b.isDouble()) || (double) b < 0 || (double) b > 255 || (double) b != std::floor ((double) b)) return false;
        return true;
    };
    const bool number = (v.isInt() || v.isInt64() || v.isDouble()) && std::isfinite ((double) v);
    switch (tag)
    {
        case 'i': return number && (double) v == std::floor ((double) v) && (double) v >= -2147483648.0 && (double) v <= 2147483647.0;
        case 'h': return number && (double) v == std::floor ((double) v);
        case 'f': case 'd': case 't': return number;
        case 's': case 'S': return v.isString();
        case 'c': return v.isString() && v.toString().isNotEmpty();
        case 'b': return isBytes (v, -1);
        case 'm': return isBytes (v, 4);
        case 'r':
        {
            const auto s = v.toString();
            return v.isString() && s.startsWithChar ('#') && (s.length() == 7 || s.length() == 9)
                && s.substring (1).containsOnly ("0123456789abcdefABCDEF");
        }
        case 'T': case 'F': case 'N': case 'I': return true;
        default: return false;
    }
}

/** One message as bytes. Empty, with `error`, when `types` does not fit `args`. */
inline juce::MemoryBlock encodeMessage (const juce::String& address, const juce::Array<juce::var>& args,
                                        const juce::String& types, juce::String& error)
{
    if (! address.startsWithChar ('/')) { error = "an address must start with /"; return {}; }
    if (types.length() != args.size()) { error = "there must be one type for each value"; return {}; }
    for (int i = 0; i < args.size(); ++i)
        if (! fits (types[i], args.getReference (i)))
        {
            error = "value " + juce::String (i + 1) + " is not a '" + juce::String::charToString (types[i]) + "'";
            return {};
        }
    Writer w;
    w.text (address);
    w.text ("," + types);
    for (int i = 0; i < args.size(); ++i)
    {
        const auto& v = args.getReference (i);
        switch (types[i])
        {
            case 'i': w.u32 ((juce::uint32) (juce::int32) (juce::int64) (double) v); break;
            case 'h': w.u64 ((juce::uint64) (juce::int64) (double) v); break;
            case 'f': { const float f = (float) (double) v; juce::uint32 bits; std::memcpy (&bits, &f, 4); w.u32 (bits); break; }
            case 'd': { const double d = (double) v; juce::uint64 bits; std::memcpy (&bits, &d, 8); w.u64 (bits); break; }
            case 's': case 'S': w.text (v.toString()); break;
            case 'c': w.u32 ((juce::uint32) v.toString()[0]); break;
            case 'b':
            {
                auto* a = v.getArray();
                w.u32 ((juce::uint32) a->size());
                for (const auto& b : *a) w.out.writeByte ((char) (int) b);
                w.pad();
                break;
            }
            case 'm': for (const auto& b : *v.getArray()) w.out.writeByte ((char) (int) b); break;
            case 'r':
            {
                auto hex = v.toString().substring (1);
                if (hex.length() == 6) hex << "FF";
                w.u32 ((juce::uint32) hex.getHexValue64());
                break;
            }
            case 't': w.u64 (numberToTimeTag ((double) v)); break;
            default: break;   // T F N I carry no bytes
        }
    }
    return w.out.getMemoryBlock();
}

/** Several messages as one bundle, to be acted on at `time` (0: at once). */
inline juce::MemoryBlock encodeBundle (const juce::Array<juce::MemoryBlock>& messages, double time)
{
    Writer w;
    w.out.write ("#bundle", 8);
    w.u64 (numberToTimeTag (time));
    for (const auto& m : messages)
    {
        w.u32 ((juce::uint32) m.getSize());
        w.out.write (m.getData(), m.getSize());
    }
    return w.out.getMemoryBlock();
}

/** One part of an address against one part of a pattern: * ? [a-z] [!a] {one,two}. oscCore.js's
    partMatches, for the window-shut OSC bindings. */
inline bool partMatches (const juce::String& p, int pi, const juce::String& s, int si)
{
    while (pi < p.length())
    {
        const auto c = p[pi];
        if (c == '*')
        {
            for (int k = s.length(); k >= si; --k) if (partMatches (p, pi + 1, s, k)) return true;
            return false;
        }
        if (c == '?')
        {
            if (si >= s.length()) return false;
            ++pi; ++si;
            continue;
        }
        if (c == '[')
        {
            const auto close = p.indexOfChar (pi + 1, ']');
            if (close < 0 || si >= s.length()) return false;
            auto set = p.substring (pi + 1, close);
            const bool negate = set.startsWithChar ('!');
            if (negate) set = set.substring (1);
            bool found = false;
            for (int k = 0; k < set.length(); ++k)
            {
                if (k + 2 < set.length() && set[k + 1] == '-')
                {
                    if (s[si] >= set[k] && s[si] <= set[k + 2]) found = true;
                    k += 2;
                }
                else if (s[si] == set[k]) found = true;
            }
            if (found == negate) return false;
            pi = close + 1; ++si;
            continue;
        }
        if (c == '{')
        {
            const auto close = p.indexOfChar (pi + 1, '}');
            if (close < 0) return false;
            for (const auto& alt : juce::StringArray::fromTokens (p.substring (pi + 1, close), ",", ""))
                if (s.substring (si).startsWith (alt) && partMatches (p, close + 1, s, si + alt.length())) return true;
            return false;
        }
        if (si >= s.length() || s[si] != c) return false;
        ++pi; ++si;
    }
    return si == s.length();
}

/** Whether an OSC address matches a pattern, part by part between the slashes. */
inline bool addressMatches (const juce::String& pattern, const juce::String& address)
{
    const auto p = juce::StringArray::fromTokens (pattern, "/", "");
    const auto a = juce::StringArray::fromTokens (address, "/", "");
    if (p.size() != a.size()) return false;
    for (int i = 0; i < p.size(); ++i) if (! partMatches (p[i], 0, a[i], 0)) return false;
    return true;
}

} // namespace ceditor::osc
