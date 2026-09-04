#pragma once

#include <juce_core/juce_core.h>

// PluginWorkerProtocol — versioned control-plane envelope for live plug-in workers.
//
// This is deliberately only the small, allocation-tolerant MESSAGE-THREAD protocol. Audio and
// MIDI blocks belong in the preallocated shared-memory data plane described in
// docs/design/plugin-process-isolation.md; putting them in these messages would make the audio
// callback allocate and inherit arbitrary pipe latency.

namespace ceditor::host::plugin_worker
{

inline constexpr juce::uint32 magic = 0x48535447; // "HSTG"
inline constexpr juce::uint16 protocolVersion = 1;
inline constexpr int headerBytes = 24;
// Large samplers and convolution effects can legitimately serialize multi-megabyte chunks.
// Keep framing bounded, but leave enough room that process isolation is not an arbitrary preset
// compatibility limit compared with ordinary in-process hosting.
inline constexpr size_t maxPayloadBytes = 64 * 1024 * 1024;

enum class MessageType : juce::uint16
{
    hello = 1,
    helloReply,
    create,
    createReply,
    prepare,
    release,
    reset,
    setParameter,
    parameterGesture,
    parameterChanged,
    parameterText,
    parameterValueFromText,
    getState,
    stateReply,
    setState,
    setNonRealtime,
    setProgram,
    changeProgramName,
    editorOpen,
    editorClose,
    editorResize,
    applyVstPreset,
    ping,
    pong,
    shutdown,
    error
};

inline bool isKnownType (juce::uint16 raw) noexcept
{
    return raw >= static_cast<juce::uint16> (MessageType::hello)
        && raw <= static_cast<juce::uint16> (MessageType::error);
}

struct Message
{
    MessageType type = MessageType::error;
    juce::uint32 generation = 0;
    juce::int64 requestId = 0;
    juce::MemoryBlock payload;
};

struct DecodeResult
{
    Message message;
    juce::String error;

    explicit operator bool() const noexcept { return error.isEmpty(); }
};

/** Encodes one complete message. Named-pipe framing still has to preserve this block as one
    unit; the payload length lets the receiver reject truncation and trailing ambiguity. */
inline juce::MemoryBlock encode (const Message& message)
{
    if (message.payload.getSize() > maxPayloadBytes)
        return {};

    juce::MemoryOutputStream out (static_cast<size_t> (headerBytes)
                                  + message.payload.getSize());
    out.writeInt (static_cast<int> (magic));
    out.writeShort (static_cast<short> (protocolVersion));
    out.writeShort (static_cast<short> (message.type));
    out.writeInt (static_cast<int> (message.generation));
    out.writeInt64 (message.requestId);
    out.writeInt (static_cast<int> (message.payload.getSize()));
    if (! message.payload.isEmpty())
        out.write (message.payload.getData(), message.payload.getSize());
    return out.getMemoryBlock();
}

inline DecodeResult decode (const juce::MemoryBlock& encoded)
{
    DecodeResult result;
    if (encoded.getSize() < static_cast<size_t> (headerBytes))
    {
        result.error = "worker message is shorter than its header";
        return result;
    }

    juce::MemoryInputStream in (encoded, false);
    const auto receivedMagic = static_cast<juce::uint32> (in.readInt());
    const auto receivedVersion = static_cast<juce::uint16> (in.readShort());
    const auto rawType = static_cast<juce::uint16> (in.readShort());
    const auto generation = static_cast<juce::uint32> (in.readInt());
    const auto requestId = in.readInt64();
    const auto payloadBytes = in.readInt();

    if (receivedMagic != magic)
        result.error = "worker message has the wrong magic";
    else if (receivedVersion != protocolVersion)
        result.error = "unsupported worker protocol version " + juce::String (receivedVersion);
    else if (! isKnownType (rawType))
        result.error = "unknown worker message type " + juce::String (rawType);
    else if (payloadBytes < 0 || static_cast<size_t> (payloadBytes) > maxPayloadBytes)
        result.error = "worker payload length is outside the supported range";
    else if (in.getNumBytesRemaining() != payloadBytes)
        result.error = "worker payload length does not match the message";

    if (result.error.isNotEmpty())
        return result;

    result.message.type = static_cast<MessageType> (rawType);
    result.message.generation = generation;
    result.message.requestId = requestId;
    if (payloadBytes > 0)
        in.readIntoMemoryBlock (result.message.payload, static_cast<size_t> (payloadBytes));
    return result;
}

/** Replies from an abandoned worker generation are never allowed to affect its replacement. */
inline bool belongsToGeneration (const Message& message, juce::uint32 activeGeneration) noexcept
{
    return message.generation != 0 && message.generation == activeGeneration;
}

inline Message makeJsonMessage (MessageType type, juce::uint32 generation,
                                juce::int64 requestId, const juce::var& value)
{
    Message result;
    result.type = type;
    result.generation = generation;
    result.requestId = requestId;
    const auto json = juce::JSON::toString (value, true);
    const auto utf8 = json.toRawUTF8();
    result.payload.append (utf8, static_cast<size_t> (json.getNumBytesAsUTF8()));
    return result;
}

inline juce::var decodeJsonPayload (const Message& message, juce::String& error)
{
    error.clear();
    if (message.payload.isEmpty())
        return {};
    const auto text = juce::String::fromUTF8 (
        static_cast<const char*> (message.payload.getData()),
        static_cast<int> (message.payload.getSize()));
    auto parsed = juce::JSON::parse (text);
    if (parsed.isVoid())
        error = "plug-in worker message contains invalid JSON";
    return parsed;
}

} // namespace ceditor::host::plugin_worker
