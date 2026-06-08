#include "../src/DeviceProfile/DeviceProfileEngine.h"
#include "../src/DeviceProfile/DeviceProfileService.h"
#include "../src/DeviceProfile/MidiCiSession.h"

#include <algorithm>
#include <deque>
#include <iostream>
#include <memory>

namespace
{
juce::File profileRoot()
{
   #if defined (CEDITOR_SOURCE_ROOT)
    return juce::File (CEDITOR_SOURCE_ROOT)
        .getChildFile ("CE")
        .getChildFile ("profiles")
        .getChildFile ("test");
   #else
    return juce::File::getCurrentWorkingDirectory()
        .getChildFile ("CE")
        .getChildFile ("profiles")
        .getChildFile ("test");
   #endif
}

int runProfileTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;

    if (! engine.loadFromFile (file, error))
    {
        std::cerr << "[FAIL] " << file.getFileName() << ": " << error << "\n";
        for (const auto& message : engine.getValidationMessages())
            std::cerr << "  " << message.path << ": " << message.message << "\n";
        return 1;
    }

    auto results = engine.runTests();
    if (results.isEmpty())
    {
        std::cerr << "[FAIL] " << file.getFileName() << ": no tests found\n";
        return 1;
    }

    auto failures = 0;
    for (const auto& result : results)
    {
        if (result.passed)
        {
            std::cout << "[PASS] " << engine.getProfileId() << " :: " << result.name << "\n";
            continue;
        }

        ++failures;
        std::cerr << "[FAIL] " << engine.getProfileId() << " :: " << result.name << "\n"
                  << "  " << result.error << "\n"
                  << "  expected: " << result.expectedHex << "\n"
                  << "  actual:   " << result.actualHex << "\n";
    }

    return failures;
}

int runPolicyTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromFile (file, error))
        return 1;

    auto result = engine.compileSetParameter ("mainSynth", "filter.cutoff", 64, true);
    if (! result.ok)
    {
        std::cerr << "[FAIL] policy test compile: " << result.error << "\n";
        return 1;
    }

    if (result.transaction.sendPolicyMode != "continuous"
        || ! result.transaction.coalesce
        || result.transaction.minIntervalMs != 20
        || ! result.transaction.realtimeSafe)
    {
        std::cerr << "[FAIL] policy metadata was not preserved on compiled transaction\n";
        return 1;
    }

    std::cout << "[PASS] test-cc-synth :: Send policy metadata\n";
    return 0;
}

int runNrpnTimingTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromFile (file, error))
        return 1;

    auto result = engine.compileSetParameter ("mainSynth", "filter.cutoff", 64, true);
    if (! result.ok)
    {
        std::cerr << "[FAIL] NRPN timing test compile: " << result.error << "\n";
        return 1;
    }

    const auto& messages = result.transaction.messages;
    if (messages.size() != 3
        || messages[0].delayAfterMs != 5
        || messages[1].delayAfterMs != 5
        || messages[2].delayAfterMs != 0)
    {
        std::cerr << "[FAIL] NRPN timing metadata expected delays 5, 5, 0\n";
        return 1;
    }

    std::cout << "[PASS] test-nrpn-synth :: Message delay metadata\n";
    return 0;
}

int runDumpShapeAndCodecTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromFile (file, error))
    {
        std::cerr << "[FAIL] dump shape test profile load: " << error << "\n";
        return 1;
    }

    auto partial = engine.parseDumpMessage ("F0 7D 10 03 03 50 61 F7");
    if (partial.ok
        || partial.matchStatus != "partial"
        || partial.expectedBytes != 13
        || partial.receivedBytes != 8
        || partial.partialFailures.isVoid())
    {
        std::cerr << "[FAIL] dump shape partial metadata was not reported\n";
        return 1;
    }

    auto checksum = engine.parseDumpMessage ("F0 7D 10 01 40 02 44 F7");
    if (checksum.ok || checksum.matchStatus != "checksumFailed" || checksum.checksumStatus != "error")
    {
        std::cerr << "[FAIL] dump shape checksum failure was not classified\n";
        return 1;
    }

    auto packedName = engine.parseDumpMessage ("F0 7D 10 04 05 00 06 01 06 04 F7");
    auto* packedValues = packedName.values.getDynamicObject();
    if (! packedName.ok
        || packedName.matchStatus != "ok"
        || ! packedName.complete
        || packedValues == nullptr
        || packedValues->getProperty ("preset.packedName").toString() != "Pad")
    {
        std::cerr << "[FAIL] dump shape packed name codec did not decode Pad\n";
        return 1;
    }

    auto unsupported = engine.parseDumpMessage ("F0 7D 10 05 41 42 F7");
    if (unsupported.ok || unsupported.matchStatus != "unsupportedCodec")
    {
        std::cerr << "[FAIL] dump shape unsupported codec was not classified\n";
        return 1;
    }

    // Whole-payload 8->7 block unpack (universal Korg case): wire 20 64 48 -> unpacked [100, 200].
    // depth=200 (>127) proves the high bit rode in the packing MSB byte and survived the round trip.
    auto packed = engine.parseDumpMessage ("F0 7D 10 08 20 64 48 F7");
    auto* packedPayloadValues = packed.values.getDynamicObject();
    if (! packed.ok
        || packed.matchStatus != "ok"
        || ! packed.complete
        || packedPayloadValues == nullptr
        || (int) packedPayloadValues->getProperty ("filter.cutoff") != 100
        || (int) packedPayloadValues->getProperty ("mod.depth") != 200)
    {
        std::cerr << "[FAIL] dump shape packed payload (8->7) did not unpack to cutoff=100 depth=200\n";
        return 1;
    }

    // XOR dump checksum verifies + decodes (0x6F = 09 ^ 64 ^ 02).
    auto xorDump = engine.parseDumpMessage ("F0 7D 10 09 64 02 6F F7");
    auto* xorValues = xorDump.values.getDynamicObject();
    if (! xorDump.ok
        || xorDump.matchStatus != "ok"
        || xorDump.checksumStatus != "ok"
        || xorValues == nullptr
        || (int) xorValues->getProperty ("filter.cutoff") != 100
        || xorValues->getProperty ("osc.waveform").toString() != "triangle")
    {
        std::cerr << "[FAIL] dump shape XOR checksum dump did not verify + decode\n";
        return 1;
    }

    // A wrong XOR checksum byte (0x6E) must be rejected, not silently accepted.
    auto xorBad = engine.parseDumpMessage ("F0 7D 10 09 64 02 6E F7");
    if (xorBad.ok || xorBad.matchStatus != "checksumFailed" || xorBad.checksumStatus != "error")
    {
        std::cerr << "[FAIL] dump shape XOR checksum did not reject a bad checksum\n";
        return 1;
    }

    // Signed 7-bit (s7) dump field: wire byte 0x36 (54) with bias 64 -> -10 (a real negative value).
    auto signedDump = engine.parseDumpMessage ("F0 7D 10 0A 36 F7");
    auto* signedValues = signedDump.values.getDynamicObject();
    if (! signedDump.ok
        || signedDump.matchStatus != "ok"
        || signedValues == nullptr
        || (int) signedValues->getProperty ("lfo.pan") != -10)
    {
        std::cerr << "[FAIL] dump shape s7 dump field did not decode to the signed value -10\n";
        return 1;
    }

    juce::StringArray onePart;
    onePart.add ("F0 7D 10 06 00 40 F7");
    auto partialCollection = engine.collectDumpMessages (onePart);
    auto* missingRanges = partialCollection.missingRanges.getArray();
    if (! partialCollection.ok
        || partialCollection.complete
        || partialCollection.status != "partial"
        || partialCollection.expectedMessageCount != 2
        || partialCollection.receivedBytes != 1
        || missingRanges == nullptr
        || missingRanges->isEmpty())
    {
        std::cerr << "[FAIL] dump collection did not report a missing split range\n";
        return 1;
    }

    juce::StringArray bothParts;
    bothParts.add ("F0 7D 10 06 00 40 F7");
    bothParts.add ("F0 7D 10 06 01 02 F7");
    auto completeCollection = engine.collectDumpMessages (bothParts);
    auto* collectionValues = completeCollection.values.getDynamicObject();
    if (! completeCollection.ok
        || ! completeCollection.complete
        || completeCollection.status != "complete"
        || completeCollection.expectedBytes != 2
        || collectionValues == nullptr
        || (int) collectionValues->getProperty ("filter.cutoff") != 64
        || collectionValues->getProperty ("osc.waveform").toString() != "triangle")
    {
        std::cerr << "[FAIL] dump collection did not merge split values\n";
        return 1;
    }

    std::cout << "[PASS] test-sysex-synth :: Dump shape metadata, name codecs, 8->7 packing, XOR checksum + s7 signed\n";
    return 0;
}

int runServiceRequestTests()
{
    ceditor::device::DeviceProfileService service;
    juce::var latestDumpCollection;
    juce::var latestBulkSend;
    juce::var latestPresetScan;
    juce::var latestContinuedRequest;
    service.setEventCallback ([&latestDumpCollection, &latestBulkSend, &latestPresetScan, &latestContinuedRequest] (const juce::String& eventName, const juce::var& payload)
    {
        if (eventName == "dumpCollectionUpdated")
            latestDumpCollection = payload;
        if (eventName == "bulkDumpSendUpdated")
            latestBulkSend = payload;
        if (eventName == "presetListScanUpdated")
            latestPresetScan = payload;
        if (eventName == "deviceRequestContinued")
            latestContinuedRequest = payload;
    });

    auto* mapping = new juce::DynamicObject();
    mapping->setProperty ("role", "mainSynth");
    mapping->setProperty ("profileId", "test-sysex-synth");
    auto* destination = new juce::DynamicObject();
    destination->setProperty ("type", "previewOnly");
    destination->setProperty ("id", "previewOnly");
    destination->setProperty ("name", "Preview Only");
    mapping->setProperty ("midiDestination", juce::var (destination));
    mapping->setProperty ("syncDirection", "live");
    service.setDeviceRoleMapping (juce::var (mapping));

    auto initialSession = service.getSessionState();
    auto* initialSessionObject = initialSession.getDynamicObject();
    auto* initialMainSynthSession = initialSessionObject != nullptr ? initialSessionObject->getProperty ("mainSynth").getDynamicObject() : nullptr;
    if (initialMainSynthSession == nullptr || initialMainSynthSession->getProperty ("syncDirection").toString() != "live")
    {
        std::cerr << "[FAIL] DeviceProfileService :: role mapping did not preserve sync direction\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: sync direction mapping\n";

    auto capabilities = service.getTransportCapabilities();
    auto* capabilitiesObject = capabilities.getDynamicObject();
    auto* pluginTransports = capabilitiesObject != nullptr ? capabilitiesObject->getProperty ("pluginTransports").getArray() : nullptr;
    if (capabilitiesObject == nullptr
        || capabilitiesObject->getProperty ("transport").toString() != "standalone"
        || capabilitiesObject->getProperty ("pluginTransportStatus").toString() != "planned"
        || pluginTransports == nullptr
        || pluginTransports->size() < 4)
    {
        std::cerr << "[FAIL] DeviceProfileService :: transport capabilities did not expose plugin transport scaffold\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: transport capability scaffold\n";

    auto* sync = new juce::DynamicObject();
    sync->setProperty ("correlationId", "service_sync_test");
    sync->setProperty ("deviceRole", "mainSynth");
    sync->setProperty ("profileId", "test-sysex-synth");
    sync->setProperty ("request", "requestCurrentPatchDump");
    sync->setProperty ("dryRun", true);

    auto result = service.startDeviceSync (juce::var (sync));
    auto* resultObject = result.getDynamicObject();
    auto* transaction = resultObject != nullptr ? resultObject->getProperty ("transaction").getDynamicObject() : nullptr;
    if (resultObject == nullptr || transaction == nullptr || ! static_cast<bool> (resultObject->getProperty ("ok")))
    {
        std::cerr << "[FAIL] DeviceProfileService :: startDeviceSync did not return an ok transaction\n";
        return 1;
    }

    auto hex = transaction->getProperty ("hex").toString();
    if (hex != "F0 7D 10 00 01 F7")
    {
        std::cerr << "[FAIL] DeviceProfileService :: startDeviceSync expected F0 7D 10 00 01 F7, got " << hex << "\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: startDeviceSync request preview\n";

    auto* identity = new juce::DynamicObject();
    identity->setProperty ("correlationId", "service_identity_test");
    identity->setProperty ("deviceRole", "mainSynth");
    identity->setProperty ("profileId", "test-sysex-synth");
    identity->setProperty ("request", "identityRequest");
    identity->setProperty ("dryRun", true);

    auto identityResult = service.startDeviceSync (juce::var (identity));
    auto* identityObject = identityResult.getDynamicObject();
    auto* identityTransaction = identityObject != nullptr ? identityObject->getProperty ("transaction").getDynamicObject() : nullptr;
    if (identityObject == nullptr
        || identityTransaction == nullptr
        || identityTransaction->getProperty ("hex").toString() != "F0 7E 10 06 01 F7"
        || identityObject->getProperty ("expectedResponseKind").toString() != "identity")
    {
        std::cerr << "[FAIL] DeviceProfileService :: identity request preview did not compile Universal SysEx identity request\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: identity request preview\n";

    auto* identityReply = new juce::DynamicObject();
    identityReply->setProperty ("requestId", "incoming_identity_match");
    identityReply->setProperty ("deviceRole", "mainSynth");
    identityReply->setProperty ("messageType", "sysex");
    identityReply->setProperty ("hex", "F0 7E 10 06 02 7D 00 01 00 02 00 00 00 01 F7");
    service.ingestIncomingMidiMessage (juce::var (identityReply));

    auto sessionState = service.getSessionState();
    auto* sessionObject = sessionState.getDynamicObject();
    auto* mainSynthSession = sessionObject != nullptr ? sessionObject->getProperty ("mainSynth").getDynamicObject() : nullptr;
    if (mainSynthSession == nullptr
        || mainSynthSession->getProperty ("state").toString() != "ready"
        || mainSynthSession->getProperty ("identityStatus").toString() != "matched")
    {
        std::cerr << "[FAIL] DeviceProfileService :: identity reply did not mark session ready/matched\n";
        return 1;
    }

    auto* identityMismatch = new juce::DynamicObject();
    identityMismatch->setProperty ("requestId", "incoming_identity_mismatch");
    identityMismatch->setProperty ("deviceRole", "mainSynth");
    identityMismatch->setProperty ("messageType", "sysex");
    identityMismatch->setProperty ("hex", "F0 7E 10 06 02 7D 00 01 00 03 00 00 00 01 F7");
    service.ingestIncomingMidiMessage (juce::var (identityMismatch));

    sessionState = service.getSessionState();
    sessionObject = sessionState.getDynamicObject();
    mainSynthSession = sessionObject != nullptr ? sessionObject->getProperty ("mainSynth").getDynamicObject() : nullptr;
    if (mainSynthSession == nullptr
        || mainSynthSession->getProperty ("state").toString() != "mismatch"
        || mainSynthSession->getProperty ("identityStatus").toString() != "mismatch")
    {
        std::cerr << "[FAIL] DeviceProfileService :: identity mismatch did not mark session mismatch\n";
        return 1;
    }

    auto* identityOverride = new juce::DynamicObject();
    identityOverride->setProperty ("deviceRole", "mainSynth");
    identityOverride->setProperty ("profileId", "test-sysex-synth");
    identityOverride->setProperty ("reason", "test accepted mismatch");
    auto overrideResult = service.overrideDeviceIdentityMismatch (juce::var (identityOverride));
    auto* overrideObject = overrideResult.getDynamicObject();
    sessionState = service.getSessionState();
    sessionObject = sessionState.getDynamicObject();
    mainSynthSession = sessionObject != nullptr ? sessionObject->getProperty ("mainSynth").getDynamicObject() : nullptr;
    if (overrideObject == nullptr
        || ! static_cast<bool> (overrideObject->getProperty ("ok"))
        || mainSynthSession == nullptr
        || mainSynthSession->getProperty ("state").toString() != "ready"
        || mainSynthSession->getProperty ("identityStatus").toString() != "overridden")
    {
        std::cerr << "[FAIL] DeviceProfileService :: identity override did not mark session ready/overridden\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: identity reply match, mismatch, and override\n";

    auto* seedPushValue = new juce::DynamicObject();
    seedPushValue->setProperty ("requestId", "seed_push_cutoff");
    seedPushValue->setProperty ("deviceRole", "mainSynth");
    seedPushValue->setProperty ("profileId", "test-sysex-synth");
    seedPushValue->setProperty ("parameterId", "filter.cutoff");
    seedPushValue->setProperty ("value", 64);
    seedPushValue->setProperty ("dryRun", true);
    service.compileParameterMessage (juce::var (seedPushValue), true);

    auto* push = new juce::DynamicObject();
    push->setProperty ("correlationId", "service_push_test");
    push->setProperty ("deviceRole", "mainSynth");
    push->setProperty ("profileId", "test-sysex-synth");
    push->setProperty ("syncDirection", "push");
    push->setProperty ("dryRun", true);
    auto pushResult = service.startDeviceSync (juce::var (push));
    auto* pushObject = pushResult.getDynamicObject();
    auto* pushTransactions = pushObject != nullptr ? pushObject->getProperty ("transactions").getArray() : nullptr;
    auto* firstPushTransaction = pushTransactions != nullptr && ! pushTransactions->isEmpty()
        ? (*pushTransactions)[0].getDynamicObject()
        : nullptr;
    if (pushObject == nullptr
        || pushObject->getProperty ("syncDirection").toString() != "push"
        || firstPushTransaction == nullptr
        || firstPushTransaction->getProperty ("hex").toString() != "F0 7D 10 20 40 60 F7")
    {
        std::cerr << "[FAIL] DeviceProfileService :: push sync did not compile runtime state to MIDI transaction\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: push sync previews runtime state\n";

    auto* raw = new juce::DynamicObject();
    raw->setProperty ("requestId", "raw_send_test");
    raw->setProperty ("deviceRole", "mainSynth");
    raw->setProperty ("actionId", "bulkDumpSend");
    raw->setProperty ("message", "F0 7D 10 7F F7");
    raw->setProperty ("dryRun", false);
    auto rawResult = service.compileRawMidiAction (juce::var (raw), true);
    auto* rawObject = rawResult.getDynamicObject();
    auto status = rawObject != nullptr ? rawObject->getProperty ("status").toString() : juce::String {};
    if (! status.startsWith ("Not sent: MIDI destination is preview-only"))
    {
        std::cerr << "[FAIL] DeviceProfileService :: raw MIDI trigger should route through send path, got " << status << "\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: raw MIDI trigger uses send path\n";

    auto* bulkPreview = new juce::DynamicObject();
    bulkPreview->setProperty ("bulkSendId", "service_bulk_preview");
    bulkPreview->setProperty ("deviceRole", "mainSynth");
    bulkPreview->setProperty ("profileId", "test-sysex-synth");
    bulkPreview->setProperty ("hex", "F0 7D 10 01 02 03 04 F7");
    bulkPreview->setProperty ("chunkSizeBytes", 5);
    bulkPreview->setProperty ("chunkDelayMs", 12);
    bulkPreview->setProperty ("dryRun", true);
    auto bulkPreviewResult = service.startBulkDumpSend (juce::var (bulkPreview));
    auto* bulkPreviewObject = bulkPreviewResult.getDynamicObject();
    auto* bulkChunks = bulkPreviewObject != nullptr ? bulkPreviewObject->getProperty ("chunks").getArray() : nullptr;
    auto* secondBulkChunk = bulkChunks != nullptr && bulkChunks->size() >= 2 ? (*bulkChunks)[1].getDynamicObject() : nullptr;
    if (bulkPreviewObject == nullptr
        || bulkPreviewObject->getProperty ("status").toString() != "preview"
        || static_cast<int> (bulkPreviewObject->getProperty ("totalChunks")) != 2
        || static_cast<int> (bulkPreviewObject->getProperty ("chunkDelayMs")) != 12
        || secondBulkChunk == nullptr
        || secondBulkChunk->getProperty ("hex").toString() != "03 04 F7")
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk send preview did not chunk SysEx correctly\n";
        return 1;
    }

    auto* bulkRun = new juce::DynamicObject();
    bulkRun->setProperty ("bulkSendId", "service_bulk_cancel");
    bulkRun->setProperty ("deviceRole", "mainSynth");
    bulkRun->setProperty ("profileId", "test-sysex-synth");
    bulkRun->setProperty ("hex", "F0 7D 10 01 02 03 04 F7");
    bulkRun->setProperty ("chunkSizeBytes", 4);
    bulkRun->setProperty ("dryRun", false);
    auto bulkRunResult = service.startBulkDumpSend (juce::var (bulkRun));
    auto* bulkRunObject = bulkRunResult.getDynamicObject();
    if (bulkRunObject == nullptr || bulkRunObject->getProperty ("status").toString() != "running")
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk send should start as a running job\n";
        return 1;
    }

    auto* bulkCancel = new juce::DynamicObject();
    bulkCancel->setProperty ("bulkSendId", "service_bulk_cancel");
    auto bulkCancelResult = service.cancelBulkDumpSend (juce::var (bulkCancel));
    auto* bulkCancelObject = bulkCancelResult.getDynamicObject();
    if (bulkCancelObject == nullptr
        || bulkCancelObject->getProperty ("status").toString() != "cancelled"
        || ! static_cast<bool> (bulkCancelObject->getProperty ("cancelled")))
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk send cancellation did not cancel queued chunks\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: bulk dump send chunking and cancel\n";

    auto* scan = new juce::DynamicObject();
    scan->setProperty ("scanId", "service_preset_scan_test");
    scan->setProperty ("deviceRole", "mainSynth");
    scan->setProperty ("profileId", "test-sysex-synth");
    scan->setProperty ("dryRun", true);
    auto scanResult = service.startPresetListScan (juce::var (scan));
    auto* scanObject = scanResult.getDynamicObject();
    auto* entries = scanObject != nullptr ? scanObject->getProperty ("entries").getArray() : nullptr;
    auto* thirdEntry = entries != nullptr && entries->size() >= 3 ? (*entries)[2].getDynamicObject() : nullptr;
    if (scanObject == nullptr
        || ! static_cast<bool> (scanObject->getProperty ("ok"))
        || static_cast<int> (scanObject->getProperty ("total")) != 3
        || thirdEntry == nullptr
        || thirdEntry->getProperty ("requestHex").toString() != "F0 7D 10 02 03 F7")
    {
        std::cerr << "[FAIL] DeviceProfileService :: preset scan preview did not compile slot requests\n";
        return 1;
    }

    auto scanList = service.getPresetListScans();
    auto* scanListArray = scanList.getArray();
    if (scanListArray == nullptr || scanListArray->isEmpty())
    {
        std::cerr << "[FAIL] DeviceProfileService :: preset scan registry did not retain scan job\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: preset scan request preview\n";

    auto* firstChunk = new juce::DynamicObject();
    firstChunk->setProperty ("requestId", "incoming_chunk_1");
    firstChunk->setProperty ("deviceRole", "mainSynth");
    firstChunk->setProperty ("messageType", "sysex");
    firstChunk->setProperty ("hex", "F0 7D 10 03 03 50 61");
    auto firstChunkResult = service.ingestIncomingMidiMessage (juce::var (firstChunk));
    auto* firstChunkObject = firstChunkResult.getDynamicObject();
    if (firstChunkObject == nullptr || ! static_cast<bool> (firstChunkObject->getProperty ("waitingForSysexEnd")))
    {
        std::cerr << "[FAIL] DeviceProfileService :: split SysEx first chunk was not buffered\n";
        return 1;
    }

    auto* secondChunk = new juce::DynamicObject();
    secondChunk->setProperty ("requestId", "incoming_chunk_2");
    secondChunk->setProperty ("deviceRole", "mainSynth");
    secondChunk->setProperty ("messageType", "sysex");
    secondChunk->setProperty ("hex", "64 20 30 30 33 F7");
    auto secondChunkResult = service.ingestIncomingMidiMessage (juce::var (secondChunk));
    auto* secondChunkObject = secondChunkResult.getDynamicObject();
    if (secondChunkObject == nullptr || ! static_cast<bool> (secondChunkObject->getProperty ("assembled")))
    {
        std::cerr << "[FAIL] DeviceProfileService :: split SysEx was not assembled\n";
        return 1;
    }

    auto runtimeState = service.getRuntimeState();
    auto* runtimeObject = runtimeState.getDynamicObject();
    auto* mainSynthState = runtimeObject != nullptr ? runtimeObject->getProperty ("mainSynth").getDynamicObject() : nullptr;
    auto presetName = mainSynthState != nullptr ? mainSynthState->getProperty ("preset.name").toString() : juce::String {};
    if (presetName != "Pad 003")
    {
        std::cerr << "[FAIL] DeviceProfileService :: split SysEx expected preset.name Pad 003, got " << presetName << "\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: split SysEx input reassembly\n";

    auto* verifiedBulk = new juce::DynamicObject();
    verifiedBulk->setProperty ("bulkSendId", "service_bulk_verify");
    verifiedBulk->setProperty ("deviceRole", "mainSynth");
    verifiedBulk->setProperty ("profileId", "test-sysex-synth");
    verifiedBulk->setProperty ("hex", "F0 7D 10 01 02 03 F7");
    verifiedBulk->setProperty ("expectedCollectionId", "splitPatchDump");
    verifiedBulk->setProperty ("ackHex", "F0 7D 10 7E 01 F7");
    verifiedBulk->setProperty ("nakHex", "F0 7D 10 7E 00 F7");
    verifiedBulk->setProperty ("retries", 1);
    verifiedBulk->setProperty ("dryRun", true);
    auto verifiedBulkResult = service.startBulkDumpSend (juce::var (verifiedBulk));
    auto* verifiedBulkObject = verifiedBulkResult.getDynamicObject();
    if (verifiedBulkObject == nullptr
        || verifiedBulkObject->getProperty ("verificationStatus").toString() != "waiting"
        || verifiedBulkObject->getProperty ("ackStatus").toString() != "waiting")
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk verification policy was not initialized\n";
        return 1;
    }

    auto* nakReply = new juce::DynamicObject();
    nakReply->setProperty ("requestId", "bulk_nak_test");
    nakReply->setProperty ("deviceRole", "mainSynth");
    nakReply->setProperty ("messageType", "sysex");
    nakReply->setProperty ("hex", "F0 7D 10 7E 00 F7");
    service.ingestIncomingMidiMessage (juce::var (nakReply));
    auto* retryBulk = latestBulkSend.getDynamicObject();
    if (retryBulk == nullptr
        || retryBulk->getProperty ("ackStatus").toString() != "retrying"
        || static_cast<int> (retryBulk->getProperty ("retryCount")) != 1)
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk NAK did not schedule retry metadata\n";
        return 1;
    }

    auto* ackReply = new juce::DynamicObject();
    ackReply->setProperty ("requestId", "bulk_ack_test");
    ackReply->setProperty ("deviceRole", "mainSynth");
    ackReply->setProperty ("messageType", "sysex");
    ackReply->setProperty ("hex", "F0 7D 10 7E 01 F7");
    service.ingestIncomingMidiMessage (juce::var (ackReply));
    auto* ackBulk = latestBulkSend.getDynamicObject();
    if (ackBulk == nullptr || ackBulk->getProperty ("ackStatus").toString() != "ack")
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk ACK did not update job metadata\n";
        return 1;
    }

    auto* splitScan = new juce::DynamicObject();
    splitScan->setProperty ("scanId", "split_scan_test");
    splitScan->setProperty ("deviceRole", "mainSynth");
    splitScan->setProperty ("profileId", "test-sysex-synth");
    splitScan->setProperty ("request", "requestSplitPatchDump");
    splitScan->setProperty ("previewWaitForReplies", true);
    juce::Array<juce::var> splitSlots;
    splitSlots.add (juce::var (1));
    splitScan->setProperty ("slots", juce::var (splitSlots));
    splitScan->setProperty ("dryRun", false);
    auto splitScanResult = service.startPresetListScan (juce::var (splitScan));
    auto* splitScanObject = splitScanResult.getDynamicObject();
    if (splitScanObject == nullptr || splitScanObject->getProperty ("status").toString() != "running")
    {
        std::cerr << "[FAIL] DeviceProfileService :: split collection scan did not start\n";
        return 1;
    }

    auto* splitFirst = new juce::DynamicObject();
    splitFirst->setProperty ("requestId", "incoming_collection_1");
    splitFirst->setProperty ("deviceRole", "mainSynth");
    splitFirst->setProperty ("messageType", "sysex");
    splitFirst->setProperty ("hex", "F0 7D 10 06 00 40 F7");
    service.ingestIncomingMidiMessage (juce::var (splitFirst));
    auto* partialCollection = latestDumpCollection.getDynamicObject();
    if (partialCollection == nullptr
        || partialCollection->getProperty ("status").toString() != "partial"
        || static_cast<bool> (partialCollection->getProperty ("complete")))
    {
        std::cerr << "[FAIL] DeviceProfileService :: runtime dump collection did not report partial status\n";
        return 1;
    }
    auto* partialBulk = latestBulkSend.getDynamicObject();
    if (partialBulk == nullptr
        || partialBulk->getProperty ("verificationStatus").toString() != "partial"
        || partialBulk->getProperty ("dumpCollection").isVoid())
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk job did not surface partial collection summary\n";
        return 1;
    }
    auto* partialScan = latestPresetScan.getDynamicObject();
    auto* partialEntries = partialScan != nullptr ? partialScan->getProperty ("entries").getArray() : nullptr;
    auto* partialEntry = partialEntries != nullptr && ! partialEntries->isEmpty()
        ? (*partialEntries)[0].getDynamicObject()
        : nullptr;
    if (partialEntry == nullptr
        || partialEntry->getProperty ("status").toString() != "partial"
        || partialEntry->getProperty ("dumpCollection").isVoid())
    {
        std::cerr << "[FAIL] DeviceProfileService :: preset scan did not surface partial collection progress\n";
        return 1;
    }
    auto* continuedRequest = latestContinuedRequest.getDynamicObject();
    auto* continueTransaction = continuedRequest != nullptr
        ? continuedRequest->getProperty ("continueTransaction").getDynamicObject()
        : nullptr;
    if (continuedRequest == nullptr
        || continuedRequest->getProperty ("continueRequestId").toString() != "requestSplitPatchContinue"
        || static_cast<int> (continuedRequest->getProperty ("continuationCount")) != 1
        || continueTransaction == nullptr
        || continueTransaction->getProperty ("hex").toString() != "F0 7D 10 08 F7")
    {
        std::cerr << "[FAIL] DeviceProfileService :: partial collection did not trigger declared continue request\n";
        return 1;
    }

    auto* splitSecond = new juce::DynamicObject();
    splitSecond->setProperty ("requestId", "incoming_collection_2");
    splitSecond->setProperty ("deviceRole", "mainSynth");
    splitSecond->setProperty ("messageType", "sysex");
    splitSecond->setProperty ("hex", "F0 7D 10 06 01 02 F7");
    service.ingestIncomingMidiMessage (juce::var (splitSecond));
    auto* completeCollection = latestDumpCollection.getDynamicObject();
    auto* collectionValues = completeCollection != nullptr
        ? completeCollection->getProperty ("values").getDynamicObject()
        : nullptr;
    if (completeCollection == nullptr
        || completeCollection->getProperty ("status").toString() != "complete"
        || ! static_cast<bool> (completeCollection->getProperty ("complete"))
        || collectionValues == nullptr
        || (int) collectionValues->getProperty ("filter.cutoff") != 64
        || collectionValues->getProperty ("osc.waveform").toString() != "triangle")
    {
        std::cerr << "[FAIL] DeviceProfileService :: runtime dump collection did not merge split values\n";
        return 1;
    }
    auto* completeBulk = latestBulkSend.getDynamicObject();
    if (completeBulk == nullptr
        || completeBulk->getProperty ("verificationStatus").toString() != "verified"
        || completeBulk->getProperty ("dumpCollection").isVoid())
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk job did not surface verified collection summary\n";
        return 1;
    }
    auto* completeScan = latestPresetScan.getDynamicObject();
    auto* completeEntries = completeScan != nullptr ? completeScan->getProperty ("entries").getArray() : nullptr;
    auto* completeEntry = completeEntries != nullptr && ! completeEntries->isEmpty()
        ? (*completeEntries)[0].getDynamicObject()
        : nullptr;
    if (completeEntry == nullptr
        || completeEntry->getProperty ("status").toString() != "complete"
        || completeEntry->getProperty ("dumpCollection").isVoid())
    {
        std::cerr << "[FAIL] DeviceProfileService :: preset scan did not surface complete collection summary\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: bulk verification ACK/NAK and collection summaries\n";
    std::cout << "[PASS] DeviceProfileService :: runtime dump collection assembly\n";
    return 0;
}

// MIDI-CI live discovery (MIDI 2.0 plan, phase M1). No hardware: two MidiCiSessions are wired output ->
// input to each other (a software loopback, the JUCE-sanctioned way to exercise juce::midi_ci::Device).
// The send callbacks only enqueue, so delivery is single-threaded and non-reentrant. Proves the whole
// initiator path end-to-end: Device construction, Discovery broadcast, bytestream SysEx framing
// (createSysExMessage / getSysExDataSpan), incoming dispatch, and the discovery listener callback.
int runMidiCiTests()
{
    using ceditor::device::MidiCiSession;

    std::deque<juce::MidiMessage> inboxA, inboxB; // inboxX holds messages destined for session X
    bool peHandshakeForB = false;
    juce::var infoForB;

    std::unique_ptr<MidiCiSession> a, b;
    a = std::make_unique<MidiCiSession> (
        [&inboxB] (const juce::MidiMessage& m) { inboxB.push_back (m); },
        [&] (uint32_t muid, const juce::var& info, const juce::var&)
        {
            if (b != nullptr && muid == b->getMuid()) { peHandshakeForB = true; infoForB = info; }
        });
    b = std::make_unique<MidiCiSession> (
        [&inboxA] (const juce::MidiMessage& m) { inboxA.push_back (m); });

    const auto hasDiscovered = [] (const MidiCiSession& s, uint32_t muid)
    {
        const auto v = s.getDiscoveredMuids();
        return std::find (v.begin(), v.end(), muid) != v.end();
    };

    // Drive the exchange one batch at a time. We only need Discovery for this slice, so we stop the
    // moment both sides know each other — before the auto Property-Exchange traffic (which the
    // delegate-less responder NAKs + re-queues) can amplify across rounds. Each round processes only
    // the messages already queued, so a single round can't explode.
    a->startDiscovery();
    a->pump();
    b->pump();

    bool discoveredBothWays = false;
    for (int round = 0; round < 16 && ! discoveredBothWays; ++round)
    {
        std::deque<juce::MidiMessage> da, db;
        std::swap (da, inboxA);
        std::swap (db, inboxB);
        for (const auto& m : da) a->handleIncomingSysex (m);
        for (const auto& m : db) b->handleIncomingSysex (m);
        a->pump();
        b->pump();
        discoveredBothWays = hasDiscovered (*a, b->getMuid()) && hasDiscovered (*b, a->getMuid());
    }

    if (! hasDiscovered (*a, b->getMuid()))
    {
        std::cerr << "[FAIL] MIDI-CI :: initiator did not discover the responder over the loopback\n";
        return 1;
    }
    if (! hasDiscovered (*b, a->getMuid()))
    {
        std::cerr << "[FAIL] MIDI-CI :: responder did not see the initiator (Discovery is not bidirectional)\n";
        return 1;
    }

    std::cout << "[PASS] MIDI-CI :: loopback discovery (initiator <-> responder MUIDs exchanged)"
              << (peHandshakeForB ? " + PE capabilities handshake" : "")
              << (infoForB != juce::var{} ? " + DeviceInfo JSON" : "") << "\n";
    return 0;
}
}

int main()
{
    const auto root = profileRoot();
    const juce::Array<juce::File> profiles {
        root.getChildFile ("test-cc-synth.ceditor-device.json"),
        root.getChildFile ("test-sysex-synth.ceditor-device.json"),
        root.getChildFile ("test-nrpn-synth.ceditor-device.json"),
        root.getChildFile ("roland-sh-201.ceditor-device.json"),
        root.getChildFile ("roland-gaia.ceditor-device.json")
    };

    auto failures = 0;
    for (const auto& profile : profiles)
        failures += runProfileTests (profile);

    failures += runPolicyTests (root.getChildFile ("test-cc-synth.ceditor-device.json"));
    failures += runNrpnTimingTests (root.getChildFile ("test-nrpn-synth.ceditor-device.json"));
    failures += runDumpShapeAndCodecTests (root.getChildFile ("test-sysex-synth.ceditor-device.json"));
    failures += runServiceRequestTests();
    failures += runMidiCiTests();

    if (failures == 0)
    {
        std::cout << "Device Profile Engine tests passed.\n";
        return 0;
    }

    std::cerr << failures << " Device Profile Engine test(s) failed.\n";
    return 1;
}
