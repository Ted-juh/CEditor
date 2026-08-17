// Preset selection for the synth side: the universal Bank Select + Program Change sequence
// that loads a patch on (almost) any MIDI synth, plus a tiny browser state the data dial
// drives. This is the profile-independent core of preset browsing; reading patch *names*
// (to show a list) is a separate, profile-gated concern (SysEx dump request + parse).
//
// Pure functions, no I/O — the same std-only style as Ctrl49Protocol.

#pragma once

#include "Ctrl49Protocol.h"

namespace ceditor::ctrl49
{

// A patch address: MIDI bank (MSB/LSB) + program number, all 0-based 0..127.
struct PresetAddress
{
    int bankMsb = 0;   // CC 0
    int bankLsb = 0;   // CC 32
    int program = 0;   // Program Change value
};

// Builds the standard load sequence for `channel` (0..15): Bank Select MSB, Bank Select LSB,
// then Program Change — as short MIDI messages (each 2-3 bytes). Send via a MIDI output
// (Ctrl49WinMmOutput::send handles short messages). Bank Select is emitted only when the
// bank is non-zero-relevant callers may skip it, but many synths expect it, so it is always
// sent here for determinism.
inline std::vector<Bytes> buildPresetSelect (int channel, PresetAddress addr)
{
    const auto ch = static_cast<std::uint8_t> (channel & 0x0F);
    const auto clamp7 = [] (int v) { return static_cast<std::uint8_t> (v < 0 ? 0 : (v > 127 ? 127 : v)); };
    return {
        Bytes { static_cast<std::uint8_t> (0xB0 | ch), 0x00, clamp7 (addr.bankMsb) },   // Bank Select MSB
        Bytes { static_cast<std::uint8_t> (0xB0 | ch), 0x20, clamp7 (addr.bankLsb) },   // Bank Select LSB
        Bytes { static_cast<std::uint8_t> (0xC0 | ch), clamp7 (addr.program) },          // Program Change
    };
}

// A minimal preset browser: a selected index into a patch list, moved by the data dial and
// cursor keys, committed on data-dial press. The host owns the list length and maps the
// index to a PresetAddress (bank/program) for buildPresetSelect.
class PresetBrowser
{
public:
    explicit PresetBrowser (int count = 128) { setCount (count); }

    void setCount (int count) { count_ = count < 1 ? 1 : count; if (index_ >= count_) index_ = count_ - 1; }
    int  count() const        { return count_; }
    int  index() const        { return index_; }

    // Relative move (data dial delta: +1 / -1), wrapping within the list.
    void move (int delta)
    {
        index_ = ((index_ + delta) % count_ + count_) % count_;
    }

    void setIndex (int i) { index_ = i < 0 ? 0 : (i >= count_ ? count_ - 1 : i); }

    // Default index -> address: program = index within a 128-patch bank, banks stacked.
    PresetAddress addressForIndex() const
    {
        PresetAddress a;
        a.program = index_ % 128;
        a.bankLsb = index_ / 128;
        return a;
    }

private:
    int count_ = 128;
    int index_ = 0;
};

} // namespace ceditor::ctrl49
