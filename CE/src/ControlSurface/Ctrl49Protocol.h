// CTRL49 vendor SysEx protocol — pure byte-level builders and codecs, no I/O.
//
// Byte-level ground truth is the external reverse-engineering handoff
// (CTRL49_CEditor_Complete_Engineering_Handoff.md); design record is
// docs/design/screen-builder-design.md. Every builder here has a golden-byte test in
// CE/tests/Ctrl49ProtocolTests.cpp reproducing frames proven live on hardware.
//
// Frame shape:  F0 00 01 05 31 08  TT CC  L0 L1  [payload]  F7
//   - 00 01 05        M-Audio manufacturer ID
//   - 31 08           CTRL49 product ID
//   - TT/CC           message type / command
//   - L0 L1           payload length, two big-endian base-128 digits
// Every byte between F0 and F7 must stay below 0x80. Multi-byte numbers are big-endian
// base-128 digits; bulk data (Lua source, PNG bytes, call arguments) uses an LSB-first
// 8-bit -> 7-bit bitstream, NOT the common one-header-per-seven-bytes packing.

#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <stdexcept>
#include <string_view>
#include <vector>

namespace ceditor::ctrl49
{

using Bytes = std::vector<std::uint8_t>;

//==================================================================================================
// Numeric encodings

// Big-endian base-128: value = (value << 7) | digit, per digit. Two digits cover 0..0x3FFF.
// Throws std::invalid_argument if the value does not fit the digit count.
Bytes encodeBase128 (std::uint32_t value, int digits);
std::uint32_t decodeBase128 (const std::uint8_t* data, int digits);

// Consecutive-8-bit -> MIDI-7 bitstream, least-significant-bit first. 512 raw bytes
// encode to 586 (ceil (512*8 / 7)).
Bytes encodeMidi7 (const Bytes& raw);
Bytes decodeMidi7 (const Bytes& encoded, std::size_t rawSize);

//==================================================================================================
// Framing

// The firmware refuses a frame whose payload is over 1000 bytes: every command handler checks
// `cmp #0x3E8; bhi <reject>` first (read statically from the Akai ADVANCE 1.0.10 firmware, which
// runs the same VIP runtime; see "What the firmware says" in tools/ctrl49/README.md). The
// length field itself would allow 0x3FFF, so
// an oversized frame used to be built without complaint and dropped by the keyboard in silence.
inline constexpr std::size_t kMaxPayloadBytes = 1000;

// Wraps a payload in the vendor frame. Throws std::invalid_argument if any payload byte
// is >= 0x80, the payload exceeds kMaxPayloadBytes, or the frame is one refusalReason()
// refuses: those are never built, so they cannot be sent by accident.
Bytes buildFrame (std::uint8_t type, std::uint8_t command, const Bytes& payload);

//==================================================================================================
// Refusals
//
// Frames that must never reach the keyboard: they restart it, write its flash, switch it toward
// update mode, act on its panel or its stored presets, or read past the end of its settings table.
// Read statically from the Akai ADVANCE firmware, whose display runtime the CTRL49 shares (the
// second, ninth and eleventh readings in tools/ctrl49/README.md). Nothing CEditor uses is in it:
// the session's own frames, VIP mode on (14 = 2) included, all pass. buildFrame refuses to build
// these and Ctrl49Session refuses to send them.

// The last id in the firmware's settings table (37, "Send Program"). 04/01 and 04/02 do not
// check the id, so a larger one reads or writes past the table.
inline constexpr std::uint8_t kLastSettingId = 37;

// 05/00's last byte is the object's storage state, not a flag: 4 keeps the object in RAM,
// 0-3 put it in a persistent flash area that 05/02 then writes. Only 4 may be sent.
inline constexpr std::uint8_t kObjectStateRam = 0x04;

// Why this type/command/payload must not be sent, or nullopt if it may be.
std::optional<std::string> refusalReason (std::uint8_t type, std::uint8_t command, const Bytes& payload);

// The same for a complete frame. Also refuses anything that is not one well-formed CTRL49 frame
// (another device's SysEx, the Akai updater's F0 47 ..., a truncated or mislabelled frame).
std::optional<std::string> refusalReason (const Bytes& frame);

//==================================================================================================
// Object upload (type 0x05): Lua source and PNG assets into device RAM.
//
// An object key is four MIDI-safe bytes: base-128 pairs for type and ID.
// Objects are temporary runtime data — re-upload after reconnect/power cycle.

inline constexpr std::uint16_t kObjectTypeLua = 0x0010;  // UTF-8 source + one NUL terminator
inline constexpr std::uint16_t kObjectTypePng = 0x000E;  // PNG file bytes + one NUL terminator

struct ObjectKey
{
    std::uint16_t type = 0;  // kObjectTypeLua / kObjectTypePng
    std::uint16_t id   = 0;  // allocate Lua and PNG IDs from separate host-side ranges
};

Bytes objectKeyBytes (ObjectKey key);

// 05/00: [key 4] [total raw size: 4 base-128 digits] [storage state 1].
// The last byte, once read as unexplained flags, is the object's storage state (the eleventh
// reading in tools/ctrl49/README.md): kObjectStateRam, the replay-proven value, keeps the object
// in RAM. Any other state would land it in the keyboard's flash, so buildFrame refuses it.
Bytes buildObjectBegin (ObjectKey key, std::uint32_t totalRawSize, std::uint8_t flags = kObjectStateRam);

// 05/01: [key 4] [raw chunk size 4] [raw destination offset 4] [encoded size 2] [MIDI-7 data].
Bytes buildObjectChunk (ObjectKey key, const Bytes& rawChunk, std::uint32_t rawOffset);

// 05/0B: [key 4] [status 1]. Status 1 accompanied every complete object in the replay.
Bytes buildObjectEnd (ObjectKey key, std::uint8_t status = 0x01);

// Complete upload sequence: one begin, raw split into <= chunkSize chunks, one end.
// 512 is the proven-safe chunk size. NUL termination of Lua/PNG raw bytes is the
// caller's responsibility (append one 0x00 to the raw object first).
std::vector<Bytes> buildObjectUpload (ObjectKey key, const Bytes& raw, std::size_t chunkSize = 512);

//==================================================================================================
// Display runtime (type 0x02): scenes, targets, binding, calls, draws.
//
// Targets are composited layers; create them explicitly inside a scene setup and keep a
// host-side registry — arbitrary target numbers are NOT automatically usable.

Bytes buildSceneBegin (std::uint8_t sceneGroup);      // 02/0D [group, 0x01] (vendor name unknown)
Bytes buildSceneActivate (std::uint8_t sceneGroup);   // 02/10 [group]      (vendor name unknown)
Bytes buildCreateTarget (std::uint8_t target);        // 02/39 [0x02, target]

// 02/3A: bind an uploaded Lua object to a target.
Bytes buildBindLua (std::uint8_t target, std::uint16_t luaObjectId);

// 02/0E: position a target/layer. x/y are two-digit base-128 (0..0x3FFF).
Bytes buildSetLayerPosition (std::uint8_t sceneGroup, std::uint8_t target,
                             std::uint16_t x, std::uint16_t y);

// 02/3C: call a global function in the bound script. Function name is ASCII; args are the
// raw byte payload the script reads with get_byte(). Either may be empty.
Bytes buildLuaCall (std::uint8_t target, std::string_view function, const Bytes& args);

// 02/3B: invoke the bound script's global draw(args).
Bytes buildDraw (std::uint8_t target, const Bytes& args);

//==================================================================================================
// Session (type 0x03)

Bytes buildIdentityQuery();  // 03/08, empty payload; reply arrives on the private input
Bytes buildKeepalive();      // 03/00, empty payload; send every ~900 ms or the watchdog
                             // restores the stock screen

//==================================================================================================
// Controls and LEDs (type 0x04)

// 04/05: one LED/control level. Proven controls: bank buttons below; level 0x7F on, 0x00 off.
inline constexpr std::uint8_t kLedPadBankA = 0x2A;
inline constexpr std::uint8_t kLedPadBankB = 0x2B;
inline constexpr std::uint8_t kLedPadBankC = 0x2C;
inline constexpr std::uint8_t kLedPadBankD = 0x2D;
inline constexpr std::uint8_t kLedOn  = 0x7F;
inline constexpr std::uint8_t kLedOff = 0x00;

Bytes buildLedLevel (std::uint8_t control, std::uint8_t level);

// 04/06: per-pad RGB light: [pad ID 1..8] [unknown field, kept 0] [R] [G] [B], each value a
// two-digit base-128 integer, RGB 0..255. Visible steps are coarser than the numeric range —
// use well-separated functional colors. VIP's captured profile is orange 255,165,0.
Bytes buildPadRgb (std::uint8_t padId, std::uint8_t red, std::uint8_t green, std::uint8_t blue);

//==================================================================================================
// Device settings (04/01 sets, 04/02 reads)
//
// The firmware keeps a table of settings, each with an id, a range and a default (the second
// reading in tools/ctrl49/README.md, its names confirmed in the eleventh). 04/01 is [id][value],
// 04/02 is [id] and is answered 04/02 [id][value]. A value travels as four base-128 digits offset
// by 2^27, so negatives work; the firmware clamps it to the setting's range and acts only on a
// change. Ids and names are the Advance's: 18, 22 and 23 are proven on the CTRL49 (VIP shows them
// as "MIDI Ch", "Oct" and "Trans"), the rest are very likely the same.
namespace setting
{
    inline constexpr std::uint8_t kCurrentPage          = 0;
    inline constexpr std::uint8_t kBank                 = 1;   // 0-3
    inline constexpr std::uint8_t kCursorPreset         = 2;   // 0-31
    inline constexpr std::uint8_t kActivePreset         = 3;   // 0-31
    inline constexpr std::uint8_t kStopOrPlay           = 4;
    inline constexpr std::uint8_t kArpState             = 5;
    inline constexpr std::uint8_t kArpLatch             = 6;
    inline constexpr std::uint8_t kNoteRepeat           = 7;
    inline constexpr std::uint8_t kPadFullLevel         = 8;
    inline constexpr std::uint8_t kTimeDivState         = 10;
    inline constexpr std::uint8_t kShiftButtonState     = 11;
    inline constexpr std::uint8_t kTimeDivValue         = 12;  // 0-7
    inline constexpr std::uint8_t kFirmwareMode         = 13;  // read only here: refused as a write
    inline constexpr std::uint8_t kRequestedMode        = 14;  // 1 normal, 2 VIP; nothing else may be sent
    inline constexpr std::uint8_t kRequestedMode2       = 15;  // VIP writes 0 at every start
    inline constexpr std::uint8_t kDisableVipTimeout    = 16;  // 1: a host stall no longer drops the screen
    inline constexpr std::uint8_t kLuaHooks             = 17;
    inline constexpr std::uint8_t kCommonChannel        = 18;  // 1-32
    inline constexpr std::uint8_t kNoteDisplayType      = 19;
    inline constexpr std::uint8_t kScreenBrightness     = 20;  // 1-10
    inline constexpr std::uint8_t kTransportFormat      = 21;  // 0-4
    inline constexpr std::uint8_t kOctave               = 22;  // -4..4
    inline constexpr std::uint8_t kTranspose            = 23;  // -36..36
    inline constexpr std::uint8_t kKeybedCurve          = 24;  // 0-4
    inline constexpr std::uint8_t kKeybedSensitivity    = 25;  // 1-10
    inline constexpr std::uint8_t kPadThreshold         = 26;  // 0-15
    inline constexpr std::uint8_t kPadCurve             = 27;  // 0-4
    inline constexpr std::uint8_t kPadSensitivity       = 28;  // 1-10
    inline constexpr std::uint8_t kInternalTempo        = 29;  // 16.16 fixed point, 30-300 BPM
    inline constexpr std::uint8_t kTapAverage           = 30;  // 2-4
    inline constexpr std::uint8_t kTempoLed             = 31;
    inline constexpr std::uint8_t kClockSource          = 32;
    inline constexpr std::uint8_t kFirmwareVersion      = 34;  // read only
    inline constexpr std::uint8_t kBootRomVersion       = 35;  // read only
} // namespace setting

// 04/01: sets a device setting. Throws std::invalid_argument for a value that does not fit the
// wire's 28 bits (-2^27 .. 2^27-1) and, through buildFrame, for any write the refuse list refuses
// (setting 13, 14 other than 1 or 2, 15 other than 0, 33-37, ids past the table).
Bytes buildSetSetting (std::uint8_t id, std::int32_t value);

// 04/02: asks for a device setting; the keyboard answers 04/02 with the id and the value
// (parseSettingReply). Throws for an id past the table, which the firmware would read wild.
Bytes buildReadSetting (std::uint8_t id);

// The internal tempo is 16.16 fixed point: 120 BPM is 120 << 16.
inline constexpr std::int32_t tempoToSettingValue (double bpm) noexcept
{
    return static_cast<std::int32_t> (bpm * 65536.0 + (bpm >= 0 ? 0.5 : -0.5));
}
inline constexpr double settingValueToTempo (std::int32_t value) noexcept
{
    return static_cast<double> (value) / 65536.0;
}

//==================================================================================================
// Liveness (type 0x06)

// 06/02: a ping. The keyboard answers 06/03 with one zero byte (isPingReply). A keepalive (03/00)
// is answered too, by 03/01 with the current mode, so either tells a keyboard that has stopped
// answering from one that is merely quiet. Beside it, 06/00 and 06/01 renew the firmware and are
// refused.
Bytes buildPing();

//==================================================================================================
// Device facts

inline constexpr int kScreenWidth  = 480;
inline constexpr int kScreenHeight = 272;
inline constexpr int kKeepaliveIntervalMs = 900;

// Target, widget and canvas ids index a 1024-entry table on the device (`cmp #0x400; bhs`).
inline constexpr int kMaxObjectTableId = 1023;

// A text object keeps at most ~100 characters (the firmware's copy truncates to its capacity).
inline constexpr std::size_t kMaxTextCharacters = 100;

// The longest title or label a set_labels payload carries. Nine strings of 90 plus their length
// bytes is 819 raw bytes, 936 MIDI-7 encoded, 958 in the frame: under the device's 1000-byte
// frame limit (kMaxPayloadBytes) and its ~100-character text objects (kMaxTextCharacters). The
// old cap was the length byte's reach, 255, which could build a frame the keyboard drops.
inline constexpr std::size_t kMaxLabelCharacters = 90;

//==================================================================================================
// Replies

// 02/3D: the device acknowledges every type-02 command (except 02/11 and 02/23) with
// [routing][routing][original command][status]. The status byte, from the firmware's reply
// builder: 0x40 OK, 0x41 bad argument, 0x42 out of memory, 0x4C not found, 0x4D Lua script
// error, 0x4E other error. Until those were known only 0x40 had a name, and a refusal looked
// like nothing at all.
struct Ctrl49Ack
{
    std::uint8_t command = 0;
    std::uint8_t status = 0;
    bool ok() const noexcept { return status == 0x40; }
};

inline constexpr std::uint8_t kAckOk          = 0x40;
inline constexpr std::uint8_t kAckBadArgument = 0x41;
inline constexpr std::uint8_t kAckOutOfMemory = 0x42;
inline constexpr std::uint8_t kAckNotFound    = 0x4C;
inline constexpr std::uint8_t kAckScriptError = 0x4D;
inline constexpr std::uint8_t kAckError       = 0x4E;

// The acknowledgement in a complete frame, or nullopt for anything that is not a 02/3D.
std::optional<Ctrl49Ack> parseAck (const Bytes& frame);

// 04/02's answer: [id][value: four base-128 digits offset by 2^27].
struct Ctrl49SettingValue
{
    std::uint8_t id = 0;
    std::int32_t value = 0;
};

// The setting in a complete 04/02 answer, or nullopt for anything else. (A 04/02 the host sends
// carries only the id, so it is not mistaken for an answer.)
std::optional<Ctrl49SettingValue> parseSettingReply (const Bytes& frame);

// True for the keyboard's answer to a ping: 06/03 with one zero byte.
bool isPingReply (const Bytes& frame);

// "OK", "bad argument", "out of memory", "not found", "Lua script error", "error", or
// "status 0xNN" for a value the firmware was not seen to use.
std::string ackStatusName (std::uint8_t status);

// "create target", "bind Lua", "draw", "Lua call", ... for the type-02 commands CEditor sends,
// "02/NN" otherwise.
std::string displayCommandName (std::uint8_t command);

} // namespace ceditor::ctrl49
