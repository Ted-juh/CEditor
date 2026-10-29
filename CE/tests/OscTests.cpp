// ce.osc's reading and writing of OSC (Osc/OscCodec.h) and its transport (Osc/OscService.cpp).
//
// The first packets are the OSC 1.0 specification's own examples, byte for byte. The rest are the
// types JUCE's reader drops a whole packet for (doubles, true, false, nothing, times), which Max, Pure
// Data and DAWs send, and a bundle with one unreadable message in it. The transport is tried over
// this computer's own loopback: a message sent arrives, a second listener on a port in use is refused
// rather than deaf, and the network waits for a yes.

#include "Osc/OscService.h"
#include <iostream>

using namespace ceditor::osc;

namespace
{
int failures = 0;
void check (bool ok, const juce::String& name)
{
    std::cout << (ok ? "  PASS  " : "  FAIL  ") << name << "\n";
    if (! ok) ++failures;
}

juce::MemoryBlock hex (const char* text)
{
    juce::MemoryBlock out;
    out.loadFromHexString (juce::String (text).removeCharacters (" "));
    return out;
}

juce::String hexOf (const juce::MemoryBlock& m) { return juce::String::toHexString (m.getData(), (int) m.getSize(), 0); }

juce::Array<juce::var> decode (const juce::MemoryBlock& m, int& bad, juce::String& why)
{
    bad = 0; why.clear();
    return decodePacket (m.getData(), m.getSize(), bad, why);
}

juce::String argsText (const juce::var& message)
{
    return juce::JSON::toString (message.getProperty ("args", juce::var()), true);
}

int freePortNear (int start)
{
    for (int p = start; p < start + 200; ++p)
    {
        juce::DatagramSocket probe (false);
        if (probe.bindToPort (p, "127.0.0.1")) return p;
    }
    return start;
}
}

int main()
{
    juce::MessageManager::getInstance();

    std::cout << "OSC reading and writing\n";
    {
        // OSC 1.0 specification: "/oscillator/4/frequency" ,f 440.0
        const auto packet = hex ("2f6f7363 696c6c61 746f722f 342f6672 65717565 6e637900 2c660000 43dc0000");
        int bad; juce::String why;
        const auto messages = decode (packet, bad, why);
        check (messages.size() == 1 && bad == 0, "the specification's first example is one message");
        check (messages[0].getProperty ("address", "").toString() == "/oscillator/4/frequency", "  its address");
        check (messages[0].getProperty ("types", "").toString() == "f" && (double) messages[0]["args"][0] == 440.0, "  440 as a decimal");
        juce::String error;
        check (hexOf (encodeMessage ("/oscillator/4/frequency", { 440.0 }, "f", error)) == hexOf (packet), "  and written back byte for byte");
    }
    {
        // OSC 1.0 specification: "/foo" ,iisff 1000 -1 "hello" 1.234 5.678
        const auto packet = hex ("2f666f6f 00000000 2c696973 66660000 000003e8 ffffffff 68656c6c 6f000000 3f9df3b6 40b5b22d");
        int bad; juce::String why;
        const auto m = decode (packet, bad, why);
        check (m.size() == 1 && m[0]["types"].toString() == "iisff", "the second example's types");
        check ((int) m[0]["args"][0] == 1000 && (int) m[0]["args"][1] == -1 && m[0]["args"][2].toString() == "hello",
               "  1000, -1 and \"hello\"");
        check (std::abs ((double) m[0]["args"][3] - 1.234) < 1e-6 && std::abs ((double) m[0]["args"][4] - 5.678) < 1e-6, "  1.234 and 5.678");
        juce::String error;
        check (hexOf (encodeMessage ("/foo", { 1000, -1, "hello", 1.234, 5.678 }, "iisff", error)) == hexOf (packet),
               "  written back byte for byte");
    }
    {
        // Every type, written and read back.
        juce::Array<juce::var> bytes { 1, 2, 3 };
        juce::Array<juce::var> midi { 0, 0x90, 60, 100 };
        const juce::Array<juce::var> args { 7, (juce::int64) 1 << 40, 0.5, 0.1, "text", "sym", true, false, juce::var(), true,
                                            juce::var (bytes), "#FF8000CC", juce::var (midi), 3913056000.5, "x" };
        juce::String error;
        const auto packet = encodeMessage ("/all", args, "ihfdsSTFNIbrmtc", error);
        check (error.isEmpty() && packet.getSize() % 4 == 0, "every type is written, padded to four (" + error + ")");
        int bad; juce::String why;
        const auto m = decode (packet, bad, why);
        check (m.size() == 1 && bad == 0 && m[0]["types"].toString() == "ihfdsSTFNIbrmtc", "  and read back with its types");
        check (argsText (m[0]) == R"([7, 1099511627776, 0.5, 0.1, "text", "sym", true, false, null, true, [1, 2, 3], "#FF8000CC", [0, 144, 60, 100], 3.9130560005e9, "x"])",
               "  each as a script gets it: " + argsText (m[0]));
    }
    {
        // What JUCE's reader drops a whole packet for: a double, true, false, nothing.
        juce::String error;
        int bad; juce::String why;
        const auto m = decode (encodeMessage ("/max", { 0.25, true, false, juce::var() }, "dTFN", error), bad, why);
        check (m.size() == 1 && argsText (m[0]) == "[0.25, true, false, null]", "a double, true, false and nothing arrive");
    }
    {
        // An array, as some senders group values.
        auto packet = hex ("2f617272 00000000 2c695b69 695d0000 00000001 00000002 00000003");
        int bad; juce::String why;
        const auto m = decode (packet, bad, why);
        check (m.size() == 1 && argsText (m[0]) == "[1, [2, 3]]", "an array is a list: " + (m.isEmpty() ? why : argsText (m[0])));
    }
    {
        // A bundle with three messages, the middle one unreadable: the other two still arrive, in order,
        // each with the bundle's time.
        juce::String error;
        auto good1 = encodeMessage ("/a", { 1 }, "i", error);
        auto good2 = encodeMessage ("/b", { "x" }, "s", error);
        auto bad = hex ("2f630000 2c7a0000");   // type 'z' is not OSC
        const auto bundle = encodeBundle ({ good1, bad, good2 }, 3913056000.0);
        int badCount; juce::String why;
        const auto m = decode (bundle, badCount, why);
        check (m.size() == 2 && badCount == 1, "a bundle's readable messages arrive, the bad one is counted");
        check (m.size() == 2 && m[0]["address"].toString() == "/a" && m[1]["address"].toString() == "/b", "  in order");
        check (m.size() == 2 && (double) m[0]["time"] == 3913056000.0, "  with the bundle's time");
        check (why.contains ("'z'"), "  and the reason says which type: " + why);
    }
    {
        juce::String error;
        encodeMessage ("noslash", {}, "", error);
        check (error.contains ("/"), "an address must start with /");
        encodeMessage ("/x", { 1.5 }, "i", error);
        check (error.contains ("'i'"), "1.5 is not a whole number: " + error);
        encodeMessage ("/x", { 1, 2 }, "i", error);
        check (error.contains ("one type"), "one type for each value");
        int bad; juce::String why;
        decode (hex ("2f6100"), bad, why);
        check (bad == 1, "a packet that is not a multiple of four is bad");
    }

    {
        check (addressMatches ("/fader/*", "/fader/12") && ! addressMatches ("/fader/*", "/fader/1/x"), "* stays inside one part");
        check (addressMatches ("/fader/[1-4]", "/fader/3") && ! addressMatches ("/fader/[1-4]", "/fader/5"), "[1-4] is a range");
        check (addressMatches ("/xy/[!0-9]", "/xy/a") && ! addressMatches ("/xy/[!0-9]", "/xy/1"), "[!0-9] is anything but");
        check (addressMatches ("/{knob,fader}/?", "/knob/5") && ! addressMatches ("/{knob,fader}/?", "/slider/5"), "{knob,fader} is one of a list");
        check (addressMatches ("/a*c/x", "/abbc/x") && addressMatches ("/a", "/a") && ! addressMatches ("/a", "/b"), "as oscCore.js matches");
    }

    std::cout << "OSC over this computer's loopback\n";
    const auto grants = juce::File::createTempFile (".json");
    {
        OscService service;
        service.grantsFile = grants;
        juce::Array<juce::var> got;
        service.emit = [&] (const juce::String& name, const juce::var& m) { if (name == "oscMessage") got.add (m); };
        const auto port = freePortNear (47110);
        auto listening = service.command (juce::JSON::parse ("{\"op\":\"listen\",\"port\":" + juce::String (port) + "}"));
        check ((bool) listening["ok"] && (int) listening["port"] == port, "listening on this computer needs no yes");

        OscService second;
        auto refused = second.command (juce::JSON::parse ("{\"op\":\"listen\",\"port\":" + juce::String (port) + "}"));
        check (! (bool) refused["ok"] && refused["error"].toString() == "portInUse",
               "a second listener on a port in use is refused, not deaf: " + juce::JSON::toString (refused, true));
        auto next = second.command (juce::JSON::parse ("{\"op\":\"listen\",\"port\":" + juce::String (port) + ",\"nextFree\":true}"));
        check ((bool) next["ok"] && (int) next["port"] > port, "with nextFree it takes the next free port");

        auto sent = service.command (juce::JSON::parse ("{\"op\":\"send\",\"to\":\"127.0.0.1:" + juce::String (port)
                                                        + "\",\"address\":\"/fader/1\",\"args\":[0.5,\"x\"],\"types\":\"fs\"}"));
        check ((bool) sent["ok"] && ! sent.hasProperty ("waiting"), "sending to this computer needs no yes");
        service.waitUntilSentForTesting();
        for (int i = 0; i < 100 && got.isEmpty(); ++i) { juce::Thread::sleep (5); service.deliverNowForTesting(); }
        check (got.size() == 1 && got[0]["address"].toString() == "/fader/1" && argsText (got[0]) == "[0.5, \"x\"]",
               "what was sent arrives, as a script gets it");
        check (got.size() == 1 && got[0]["from"]["host"].toString() == "127.0.0.1" && (int) got[0]["from"]["port"] > 0,
               "  with who sent it");
        check ((int) service.command (juce::JSON::parse ("{\"op\":\"status\"}"))["received"] == 1, "  and status counts it");

        service.command (juce::JSON::parse ("{\"op\":\"target\",\"name\":\"self\",\"host\":\"localhost\",\"port\":" + juce::String (port) + "}"));
        auto bundled = service.command (juce::JSON::parse ("{\"op\":\"bundle\",\"to\":\"self\",\"messages\":["
                                                           "{\"address\":\"/a\",\"args\":[1],\"types\":\"i\"},{\"address\":\"/b\",\"args\":[],\"types\":\"\"}]}"));
        service.waitUntilSentForTesting();
        got.clear();
        for (int i = 0; i < 100 && got.size() < 2; ++i) { juce::Thread::sleep (5); service.deliverNowForTesting(); }
        check ((bool) bundled["ok"] && got.size() == 2 && got[0]["address"].toString() == "/a" && got[1]["address"].toString() == "/b",
               "a bundle to a named target arrives as its messages, in order");

        // The network: nobody to ask is a no, and not remembered.
        auto net = service.command (juce::JSON::parse ("{\"op\":\"listen\",\"port\":" + juce::String (port) + ",\"network\":true,\"panel\":\"p1\"}"));
        check (! (bool) net["ok"] && ! (bool) service.command (juce::JSON::parse ("{\"op\":\"status\"}"))["listening"],
               "the network with nobody to ask: not listening");
        auto remote = service.command (juce::JSON::parse ("{\"op\":\"send\",\"to\":\"192.0.2.7:9000\",\"address\":\"/x\",\"args\":[],\"types\":\"\"}"));
        check (remote["error"].toString() == "refusedByUser" || (bool) remote["waiting"], "another computer with nobody to ask is not sent to");
    }
    {
        // The user says yes once; it is kept for the panel, on this computer.
        OscService service;
        service.grantsFile = grants;
        int asked = 0;
        service.ask = [&] (const juce::String& question, std::function<void (bool)> answer)
        {
            ++asked;
            check (question.contains ("receive OSC from your network"), "the question says what and where: " + question);
            answer (true);
            return true;
        };
        const auto port = freePortNear (47310);
        auto net = service.command (juce::JSON::parse ("{\"op\":\"listen\",\"port\":" + juce::String (port) + ",\"network\":true,\"panel\":\"p2\"}"));
        check (asked == 1 && (bool) service.command (juce::JSON::parse ("{\"op\":\"status\"}"))["listening"],
               "a yes starts listening on the network");
        check ((bool) service.command (juce::JSON::parse ("{\"op\":\"status\"}"))["network"], "  from the network");
        service.command (juce::JSON::parse ("{\"op\":\"stop\"}"));
        OscService again;
        again.grantsFile = grants;
        again.ask = [&] (const juce::String&, std::function<void (bool)> answer) { ++asked; answer (false); return true; };
        again.command (juce::JSON::parse ("{\"op\":\"listen\",\"port\":" + juce::String (port) + ",\"network\":true,\"panel\":\"p2\"}"));
        check (asked == 1 && (bool) again.command (juce::JSON::parse ("{\"op\":\"status\"}"))["listening"],
               "the yes is kept: the panel is not asked again");
        again.command (juce::JSON::parse ("{\"op\":\"listen\",\"port\":" + juce::String (port) + ",\"network\":true,\"panel\":\"p3\"}"));
        check (asked == 2 && again.command (juce::JSON::parse ("{\"op\":\"status\"}"))["error"].toString() == "refusedByUser",
               "another panel is asked; its no is a no");
        check (! grants.loadFileAsString().contains ("\"p1|"), "nobody to ask was not taken for an answer");
    }
    grants.deleteFile();

    juce::MessageManager::deleteInstance();
    if (failures == 0) { std::cout << "--------------------\nALL PASS" << std::endl; return 0; }
    std::cout << "--------------------\n" << failures << " FAILED" << std::endl;
    return 1;
}
