#pragma once

#include <juce_core/juce_core.h>
#include <cmath>
#include <cstring>

namespace ceditor::host
{
inline bool isVendorPresetSource (const juce::String& source)
{
    return source == "vstpreset" || source == "nksf" || source == "fxp" || source == "spire" || source == "h2p";
}

// Zebra3's MIDI program selector reports numbered slots, not its disk preset library.
// Keep this vendor-specific: another synth may have an actual sound called "Program 1".
inline bool isZebra3ProgramSlot (const juce::String& instrument, const juce::String& vendor,
                                const juce::String& name)
{
    if (! instrument.equalsIgnoreCase ("Zebra3") || ! vendor.equalsIgnoreCase ("u-he")) return false;
    const auto lower = name.trim().toLowerCase();
    for (const auto* prefix : { "program", "preset", "slot" })
        if (lower.startsWith (prefix))
        {
            const auto suffix = lower.substring (juce::String (prefix).length()).trimCharactersAtStart (" _-#");
            if (suffix.isNotEmpty() && suffix.containsOnly ("0123456789")) return true;
        }
    return false;
}

struct VendorPreset
{
    juce::String sourceType, instrument, manufacturer, name, category, error;
    juce::MemoryBlock componentState;
    juce::var parameters;
    explicit operator bool() const { return error.isEmpty() && sourceType.isNotEmpty(); }
};

namespace vendor_preset_detail
{
// NKS metadata is MessagePack, preceded by a four-byte version. Bound every count before
// allocating or descending: presets are external files, and a bad one must only skip itself.
class MessagePack
{
public:
    MessagePack (const void* bytes, size_t length) : data (static_cast<const juce::uint8*> (bytes)), size (length) {}
    bool valid = true;
    juce::var read (int depth = 0)
    {
        if (depth > 24 || pos >= size) { valid = false; return {}; }
        const auto tag = number (1);
        if (tag <= 0x7f) return static_cast<int> (tag);
        if (tag >= 0xe0) return static_cast<int> (static_cast<juce::int8> (tag));
        if ((tag & 0xe0) == 0xa0) return string (tag & 31);
        if ((tag & 0xf0) == 0x90) return array (tag & 15, depth);
        if ((tag & 0xf0) == 0x80) return map (tag & 15, depth);
        switch (tag)
        {
            case 0xc0: return {};
            case 0xc2: return false;
            case 0xc3: return true;
            case 0xcc: return static_cast<juce::int64> (number (1));
            case 0xcd: return static_cast<juce::int64> (number (2));
            case 0xce: return static_cast<juce::int64> (number (4));
            case 0xcf: return static_cast<juce::int64> (number (8));
            case 0xd0: return static_cast<int> (static_cast<juce::int8> (number (1)));
            case 0xd1: return static_cast<int> (static_cast<juce::int16> (number (2)));
            case 0xd2: return static_cast<int> (static_cast<juce::int32> (number (4)));
            case 0xd3: return static_cast<juce::int64> (number (8));
            case 0xd9: return string (number (1));
            case 0xda: return string (number (2));
            case 0xdb: return string (number (4));
            case 0xdc: return array (number (2), depth);
            case 0xdd: return array (number (4), depth);
            case 0xde: return map (number (2), depth);
            case 0xdf: return map (number (4), depth);
            case 0xca: { auto bits = static_cast<juce::uint32> (number (4)); float f; std::memcpy (&f, &bits, 4); return f; }
            case 0xcb: { auto bits = number (8); double d; std::memcpy (&d, &bits, 8); return d; }
            default: valid = false; return {};
        }
    }
private:
    const juce::uint8* data;
    size_t size, pos = 0;
    juce::uint64 number (size_t count)
    {
        if (count > size - pos) { valid = false; return 0; }
        juce::uint64 result = 0;
        while (count-- != 0) result = (result << 8) | data[pos++];
        return result;
    }
    juce::var string (juce::uint64 count)
    {
        if (count > size - pos || count > 1024 * 1024) { valid = false; return {}; }
        auto result = juce::String::fromUTF8 (reinterpret_cast<const char*> (data + pos), static_cast<int> (count));
        pos += static_cast<size_t> (count);
        return result;
    }
    juce::var array (juce::uint64 count, int depth)
    {
        if (count > size - pos || count > 65536) { valid = false; return {}; }
        juce::Array<juce::var> result;
        while (count-- != 0 && valid) result.add (read (depth + 1));
        return result;
    }
    juce::var map (juce::uint64 count, int depth)
    {
        if (count > (size - pos) / 2 || count > 65536) { valid = false; return {}; }
        auto* object = new juce::DynamicObject();
        juce::var result (object);
        while (count-- != 0 && valid)
        {
            const auto key = read (depth + 1);
            if (! key.isString() || key.toString().isEmpty()) { valid = false; break; }
            auto value = read (depth + 1);
            object->setProperty (juce::Identifier (key.toString()), value);
        }
        return result;
    }
};
}

inline VendorPreset readVendorPreset (const juce::File& file)
{
    VendorPreset result;
    result.name = file.getFileNameWithoutExtension();
    const auto fail = [&] (const juce::String& reason) { result.error = reason; return result; };
    juce::MemoryBlock bytes;
    if (file.getSize() <= 0 || file.getSize() > 64 * 1024 * 1024 || ! file.loadFileAsData (bytes))
        return fail ("Preset is unreadable or too large.");
    const auto* data = static_cast<const juce::uint8*> (bytes.getData());
    const auto size = bytes.getSize();

    if (file.hasFileExtension ("nksf"))
    {
        if (size < 12 || std::memcmp (data, "RIFF", 4) != 0 || std::memcmp (data + 8, "NIKS", 4) != 0
            || static_cast<size_t> (juce::ByteOrder::littleEndianInt (data + 4)) + 8 != size)
            return fail ("Invalid NKS container.");
        juce::var identity, metadata;
        for (size_t offset = 12; offset < size;)
        {
            if (size - offset < 8) return fail ("Truncated NKS chunk.");
            const auto length = static_cast<size_t> (juce::ByteOrder::littleEndianInt (data + offset + 4));
            const auto* chunk = data + offset + 8;
            if (length > size - offset - 8) return fail ("Truncated NKS chunk.");
            const bool plid = std::memcmp (data + offset, "PLID", 4) == 0;
            const bool nisi = std::memcmp (data + offset, "NISI", 4) == 0;
            const bool pchk = std::memcmp (data + offset, "PCHK", 4) == 0;
            if (plid || nisi || pchk)
            {
                if (length <= 4 || juce::ByteOrder::littleEndianInt (chunk) != 1)
                    return fail ("Unsupported NKS chunk version.");
                if (pchk) result.componentState = juce::MemoryBlock (chunk + 4, length - 4);
                else
                {
                    vendor_preset_detail::MessagePack reader (chunk + 4, length - 4);
                    auto value = reader.read();
                    if (! reader.valid || ! value.isObject()) return fail ("Invalid NKS metadata.");
                    if (plid) identity = value; else metadata = value;
                }
            }
            offset += 8 + length + (length & 1);
            if (offset > size) return fail ("Missing NKS padding.");
        }
        // NKS can wrap many incompatible VST2 states. Only advertise the verified adapter.
        const auto pluginName = identity.getProperty ("pluginName", {}).toString();
        const auto pluginVendor = identity.getProperty ("pluginVendor", {}).toString();
        const auto uid = identity.getProperty ("VST3.uid", {});
        const auto* words = uid.getArray();
        const bool massiveVst3 = words != nullptr && words->size() == 4
            && static_cast<juce::int64> ((*words)[0]) == 0x5653544e
            && static_cast<juce::int64> ((*words)[1]) == 0x6924486d
            && static_cast<juce::int64> ((*words)[2]) == 0x61737369
            && static_cast<juce::int64> ((*words)[3]) == 0x76652078;
        // Older NI expansions carry only the VST magic. It is the instrument identity;
        // pluginName and pluginVendor were optional additions to PLID, not requirements.
        if ((pluginName.isNotEmpty() && pluginName != "Massive X")
            || (pluginVendor.isNotEmpty() && pluginVendor != "Native Instruments")
            || (words != nullptr && ! massiveVst3)
            || (! massiveVst3 && static_cast<juce::int64> (identity.getProperty ("VST.magic", 0)) != 0x4e692448)
            || result.componentState.getSize() < 16)
            return fail ("This NKS instrument is not supported yet.");
        result.sourceType = "nksf";
        result.instrument = "Massive X";
        result.manufacturer = "Native Instruments";
        const auto name = metadata.getProperty ("name", {}).toString().trim();
        if (name.isNotEmpty()) result.name = name;
        const auto types = metadata.getProperty ("types", {});
        if (const auto* list = types.getArray(); list != nullptr && ! list->isEmpty())
        {
            const auto& first = list->getReference (0);
            if (const auto* path = first.getArray(); path != nullptr && ! path->isEmpty())
                result.category = path->getReference (0).toString();
        }
    }
    else if (file.hasFileExtension ("fxp"))
    {
        if (size < 76 || std::memcmp (data, "CcnK", 4) != 0 || std::memcmp (data + 8, "FPCh", 4) != 0
            || std::memcmp (data + 16, "VGRD", 4) != 0
            || static_cast<size_t> (juce::ByteOrder::bigEndianInt (data + 4)) + 8 != size
            || static_cast<size_t> (juce::ByteOrder::bigEndianInt (data + 56)) != size - 60
            || std::memcmp (data + 60, "VGRD2 Preset", 12) != 0)
            return fail ("Unsupported or damaged Vanguard FXP preset.");
        result.sourceType = "fxp";
        result.instrument = "Vanguard";
        result.manufacturer = "reFX";
        result.componentState = juce::MemoryBlock (data + 60, size - 60);
    }
    else if (file.hasFileExtension ("h2p"))
    {
        const auto text = juce::String::fromUTF8 (reinterpret_cast<const char*> (data), static_cast<int> (size));
        auto lines = juce::StringArray::fromLines (text);
        // Module presets also say #AM=Zebra3. Only complete patches contain MainMix and
        // MPreset; feeding an oscillator/effect module to the host would leave half a sound.
        if (! lines.contains ("#AM=Zebra3") || ! lines.contains ("#Vers=1")
            || ! lines.contains ("#cm=MainMix") || ! lines.contains ("#cm=MPreset"))
            return fail ("Unsupported or incomplete Zebra3 H2P preset.");
        result.sourceType = "h2p";
        result.instrument = "Zebra3";
        result.manufacturer = "u-he";
        result.category = file.getParentDirectory().getFileName();
        // Native Zebra3 component state is H2P text with a #pgm filename header. Supply the
        // actual filename so the plug-in's own display agrees with Hostage after recall.
        for (int i = lines.size(); --i >= 0;)
            if (lines[i].startsWith ("#pgm=")) lines.remove (i);
        const auto state = "#pgm=" + file.getFileName().removeCharacters ("\r\n") + "\n" + lines.joinIntoString ("\n");
        result.componentState = juce::MemoryBlock (state.toRawUTF8(), state.getNumBytesAsUTF8() + 1);
    }
    else if (file.hasFileExtension ("spf2"))
    {
        const auto json = juce::JSON::parse (juce::String::fromUTF8 (static_cast<const char*> (bytes.getData()), static_cast<int> (size)));
        result.parameters = json.getProperty ("parameters", {});
        const auto* parameters = result.parameters.getDynamicObject();
        if (parameters == nullptr || ! parameters->hasProperty ("volume") || ! parameters->hasProperty ("osc1_type"))
            return fail ("Spire preset has no parameter map.");
        for (const auto& property : parameters->getProperties())
        {
            const auto& value = property.value;
            const auto number = static_cast<double> (value);
            if ((! value.isInt() && ! value.isInt64() && ! value.isDouble())
                || ! std::isfinite (number) || number < 0 || number > 1)
                return fail ("Spire preset contains an invalid parameter.");
        }
        result.sourceType = "spire";
        result.instrument = "Spire";
        result.manufacturer = "Reveal Sound";
        result.category = file.getParentDirectory().getFileName();
    }
    else return fail ("Unsupported vendor preset format.");
    return result;
}
}
