#include "InstrumentHost/PluginWorkerControlChannel.h"
#include <cstring>
#include <iostream>
#include <thread>
#include <utility>

namespace
{
int failures = 0;

void check (bool condition, const char* label)
{
    std::cout << (condition ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! condition)
        ++failures;
}

using namespace ceditor::host::plugin_worker;

void testRoundTrip()
{
    std::cout << "\ncontrol message round-trip" << std::endl;

    const unsigned char bytes[] { 0x00, 0x7f, 0xff, 0x42, 0x00 };
    Message source;
    source.type = MessageType::setState;
    source.generation = 27;
    source.requestId = 9'007'199'254'740'991LL;
    source.payload.append (bytes, sizeof (bytes));

    const auto encoded = encode (source);
    const auto decoded = decode (encoded);
    check (static_cast<bool> (decoded), "a complete version-one message decodes");
    check (decoded.message.type == source.type
             && decoded.message.generation == source.generation
             && decoded.message.requestId == source.requestId,
           "type, generation and 64-bit request identity survive");
    check (decoded.message.payload.getSize() == sizeof (bytes)
             && std::memcmp (decoded.message.payload.getData(), bytes, sizeof (bytes)) == 0,
           "opaque state payload preserves every byte, including zeros");
}

void testMalformedMessages()
{
    std::cout << "\nmalformed message refusal" << std::endl;

    Message source;
    source.type = MessageType::ping;
    source.generation = 1;
    source.requestId = 3;
    source.payload.append ("abc", 3);
    const auto valid = encode (source);

    juce::MemoryBlock shortHeader (valid.getData(), static_cast<size_t> (headerBytes - 1));
    check (! decode (shortHeader), "a truncated header is refused");

    auto badMagic = valid;
    static_cast<unsigned char*> (badMagic.getData())[0] ^= 0xff;
    check (! decode (badMagic), "wrong protocol magic is refused");

    auto badVersion = valid;
    static_cast<unsigned char*> (badVersion.getData())[4] = 99;
    check (! decode (badVersion), "an unsupported protocol version is refused");

    auto badType = valid;
    static_cast<unsigned char*> (badType.getData())[6] = 0;
    static_cast<unsigned char*> (badType.getData())[7] = 0;
    check (! decode (badType), "an unknown message type is refused");

    auto truncatedPayload = valid;
    truncatedPayload.setSize (truncatedPayload.getSize() - 1);
    check (! decode (truncatedPayload), "a truncated payload is refused");

    auto trailingBytes = valid;
    trailingBytes.append ("x", 1);
    check (! decode (trailingBytes), "unframed trailing data is refused");
}

void testPayloadLimit()
{
    std::cout << "\nbounded control payload" << std::endl;
    Message largest;
    largest.type = MessageType::setState;
    largest.generation = 1;
    largest.requestId = 4;
    largest.payload.setSize (maxPayloadBytes, true);
    check (! encode (largest).isEmpty(), "a state at the documented 64 MiB limit is accepted");
    largest.payload.setSize (maxPayloadBytes + 1, true);
    check (encode (largest).isEmpty(), "a state beyond the bounded control limit is refused");
}

void testGenerationFence()
{
    std::cout << "\nworker generation fence" << std::endl;

    Message message;
    message.generation = 12;
    check (belongsToGeneration (message, 12), "the active worker generation is accepted");
    check (! belongsToGeneration (message, 13), "a reply from the dead generation is ignored");
    message.generation = 0;
    check (! belongsToGeneration (message, 0), "generation zero is never an active worker");
}

void testJsonPayload()
{
    std::cout << "\nJSON control payload" << std::endl;
    auto* object = new juce::DynamicObject();
    object->setProperty ("name", "Remote Synth");
    object->setProperty ("inputs", 0);
    object->setProperty ("outputs", 2);
    const auto source = makeJsonMessage (MessageType::createReply, 4, 19, juce::var (object));
    const auto wire = encode (source);
    const auto decoded = decode (wire);
    juce::String error;
    const auto json = decodeJsonPayload (decoded.message, error);
    check (error.isEmpty() && json.getProperty ("name", {}).toString() == "Remote Synth"
             && (int) json.getProperty ("outputs", 0) == 2,
           "structured worker metadata survives the binary envelope");

    Message malformed;
    malformed.payload.append ("{broken", 7);
    decodeJsonPayload (malformed, error);
    check (error.isNotEmpty(), "malformed JSON is refused aloud");
}

void testLargePipeFrame()
{
    std::cout << "\nlarge named-pipe frame" << std::endl;
    PluginWorkerControlChannel host;
    PluginWorkerControlChannel worker;
    juce::String error;
    const auto pipeName = "HostageProtocolTest-" + juce::Uuid().toString();
    check (host.createHost (pipeName, error) && worker.openWorker (pipeName, error),
           "both ends of a unique control pipe open");

    Message source;
    source.type = MessageType::setState;
    source.generation = 42;
    source.requestId = 101;
    constexpr size_t payloadBytes = 256 * 1024;
    source.payload.setSize (payloadBytes, false);
    auto* payload = static_cast<juce::uint8*> (source.payload.getData());
    for (size_t index = 0; index < payloadBytes; ++index)
        payload[index] = static_cast<juce::uint8> ((index * 37u) & 0xffu);

    bool sent = false;
    std::thread sender ([&] { sent = worker.send (source, 5000, error); });
    const auto received = host.receive (5000);
    sender.join();
    check (sent && static_cast<bool> (received),
           "a frame larger than the operating-system pipe buffer is transferred completely");
    check (received.message.payload == source.payload,
           "partial pipe reads preserve every opaque state byte");

    Message response = source;
    response.type = MessageType::stateReply;
    response.requestId = 102;
    DecodeResult workerReply;
    std::thread receiver ([&] { workerReply = worker.receive (5000); });
    const auto replied = host.send (response, 5000, error);
    receiver.join();
    check (replied && static_cast<bool> (workerReply)
             && workerReply.message.payload == response.payload,
           "large framed replies work in the opposite direction too");
}

void testReceiveResumesAfterPollingDeadline()
{
    std::cout << "\nlarge frame across polling deadlines" << std::endl;
    PluginWorkerControlChannel host;
    PluginWorkerControlChannel worker;
    juce::String error;
    const auto pipeName = "HostageProtocolPollingTest-" + juce::Uuid().toString();
    check (host.createHost (pipeName, error) && worker.openWorker (pipeName, error),
           "polling test opens both ends of a unique control pipe");

    Message source;
    source.type = MessageType::setState;
    source.generation = 73;
    source.requestId = 202;
    constexpr size_t payloadBytes = 4 * 1024 * 1024;
    source.payload.setSize (payloadBytes, false);
    auto* payload = static_cast<juce::uint8*> (source.payload.getData());
    for (size_t index = 0; index < payloadBytes; ++index)
        payload[index] = static_cast<juce::uint8> ((index * 19u + 7u) & 0xffu);

    bool sent = false;
    std::thread sender ([&] { sent = worker.send (source, 8000, error); });

    DecodeResult received;
    bool receivedFrame = false;
    int incompletePolls = 0;
    const auto deadline = juce::Time::getMillisecondCounterHiRes() + 8000.0;
    while (! receivedFrame && juce::Time::getMillisecondCounterHiRes() < deadline)
    {
        // A short, real deadline makes a multi-megabyte frame span several calls while each
        // completed pipe quantum is retained by the channel.
        auto attempt = host.receive (1);
        if (attempt)
        {
            received = std::move (attempt);
            receivedFrame = true;
            break;
        }
        if (attempt.error.contains ("incomplete"))
            ++incompletePolls;
        else if (! attempt.error.contains ("timed out"))
        {
            received = std::move (attempt);
            break;
        }
        std::this_thread::yield();
    }
    sender.join();

    check (incompletePolls > 0,
           "the test actually crosses at least one receive polling deadline");
    check (sent && receivedFrame && static_cast<bool> (received),
           "a partially received frame resumes rather than losing stream alignment");
    check (received.message.generation == source.generation
             && received.message.requestId == source.requestId
             && received.message.payload == source.payload,
           "resumed receive preserves the complete frame and its identity");
}
} // namespace

int main()
{
    testRoundTrip();
    testMalformedMessages();
    testPayloadLimit();
    testGenerationFence();
    testJsonPayload();
    testLargePipeFrame();
    testReceiveResumesAfterPollingDeadline();
    std::cout << "\n" << failures << " failure(s)" << std::endl;
    return failures == 0 ? 0 : 1;
}
