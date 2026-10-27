// The plug-in's MIDI input decoder against the table both runtimes are held to
// (CE/tests/fixtures/midiInCases.json; the panel view's midiInDecoder.js runs the same table).
#include "Scripting/MidiInDecoder.h"
#include <cmath>
#include <iostream>

namespace
{
/** Two values the same: numbers within a hair (one double each side), objects key by key. */
bool same (const juce::var& a, const juce::var& b)
{
    if (a.isObject() || b.isObject())
    {
        auto* x = a.getDynamicObject();
        auto* y = b.getDynamicObject();
        if (x == nullptr || y == nullptr || x->getProperties().size() != y->getProperties().size()) return false;
        for (const auto& p : x->getProperties())
            if (! y->hasProperty (p.name) || ! same (p.value, y->getProperty (p.name))) return false;
        return true;
    }
    if (a.isBool() || b.isBool()) return a.isBool() && b.isBool() && (bool) a == (bool) b;
    if ((a.isInt() || a.isInt64() || a.isDouble()) && (b.isInt() || b.isInt64() || b.isDouble()))
        return std::abs ((double) a - (double) b) <= 1e-12;
    return a.toString() == b.toString() && a.isString() == b.isString();
}
}

int main (int argc, char** argv)
{
    if (argc < 2) { std::cerr << "usage: CEditorMidiInDecoderTests <midiInCases.json>\n"; return 2; }
    const auto table = juce::JSON::parse (juce::File (argv[1]).loadFileAsString());
    int failures = 0;
    for (const auto& c : *table.getProperty ("cases", {}).getArray())
    {
        ceditor::scripting::MidiInDecoder d;
        juce::Array<juce::var> events;
        const auto keep = [&events] (const std::vector<ceditor::scripting::MidiInDecoder::Event>& list)
        {
            for (const auto& e : list)
            {
                auto* o = new juce::DynamicObject();
                o->setProperty ("event", e.name);
                o->setProperty ("payload", e.payload);
                events.add (juce::var (o));
            }
        };
        for (const auto& step : *c.getProperty ("steps", {}).getArray())
        {
            if (step.hasProperty ("listen")) { d.listen (step.getProperty ("listen", "").toString(), step.getProperty ("opts", {})); continue; }
            const auto at = (double) step.getProperty ("at", 0);
            if ((bool) step.getProperty ("flush", false)) { keep (d.flush (at)); continue; }
            std::vector<int> bytes;
            for (const auto& b : *step.getProperty ("bytes", {}).getArray()) bytes.push_back ((int) b);
            keep (d.feed (step.getProperty ("role", "").toString(), bytes, at).events);
        }
        const auto want = c.getProperty ("events", {});
        bool ok = want.size() == events.size();
        for (int i = 0; ok && i < events.size(); ++i) ok = same (events[i], want[i]);
        std::cout << (ok ? "[PASS] " : "[FAIL] ") << "MIDI in :: " << c.getProperty ("name", "").toString() << "\n";
        if (! ok)
        {
            std::cout << "  got  " << juce::JSON::toString (juce::var (events), true) << "\n  want " << juce::JSON::toString (want, true) << "\n";
            ++failures;
        }
    }
    return failures == 0 ? 0 : 1;
}
