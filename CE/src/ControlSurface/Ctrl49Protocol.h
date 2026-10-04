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
// is >= 0x80 or the payload exceeds kMaxPayloadBytes.
Bytes buildFrame (std::uint8_t type, std::uint8_t command, const Bytes& payload);

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

// 05/00: [key 4] [total raw size: 4 base-128 digits] [flags 1].
// Flags 0x04 is the replay-proven Lua value; its independent meaning is unknown.
Bytes buildObjectBegin (ObjectKey key, std::uint32_t totalRawSize, std::uint8_t flags = 0x04);

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

// "OK", "bad argument", "out of memory", "not found", "Lua script error", "error", or
// "status 0xNN" for a value the firmware was not seen to use.
std::string ackStatusName (std::uint8_t status);

// "create target", "bind Lua", "draw", "Lua call", ... for the type-02 commands CEditor sends,
// "02/NN" otherwise.
std::string displayCommandName (std::uint8_t command);

} // namespace ceditor::ctrl49
