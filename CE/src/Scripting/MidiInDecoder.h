#pragma once

// The MIDI a device sends, decoded once for every script in an exported plug-in with its window shut:
// the C++ twin of the panel view's midiInDecoder.js (docs/design/midi-input-and-mpe.md). Bends,
// pressure, program changes with their bank select, NRPNs and RPNs put together, transport from a
// device, and MPE read back into notes. Both are held to CE/tests/fixtures/midiInCases.json.
//
// feed (role, bytes, now) gives the events one message raises; flush (now) the thinned ones whose
// time has come; nextDue() when the next one will. A bend, a pressure or an MPE expression is raised
// at most once every 10 ms per channel (per note for poly pressure and expression), with the latest
// value; anything else on that channel first lets what waits go, so nothing is reordered. An NRPN's
// coarse half waits 5 ms for its fine half. Message thread only.

#include <juce_core/juce_core.h>
#include <map>
#include <optional>
#include <vector>

namespace ceditor::scripting
{
class MidiInDecoder
{
public:
    static constexpr double thinMs = 10.0;
    static constexpr double nrpnWaitMs = 5.0;

    struct Event { juce::String name; juce::var payload; };
    struct Result { std::vector<Event> events; bool ccTaken = false; };

    Result feed (const juce::String& roleIn, const std::vector<int>& bytes, double now)
    {
        Result r;
        const auto role = roleIn.isNotEmpty() ? roleIn : juce::String ("mainSynth");
        const int status = bytes.empty() ? 0 : bytes[0];
        if (status == 0xFA || status == 0xFB || status == 0xFC)
        {
            r.events.push_back ({ "onTransportIn", obj ({ { "action", status == 0xFA ? "start" : status == 0xFB ? "continue" : "stop" }, { "from", role } }) });
            return r;
        }
        if (status == 0xF2 && bytes.size() >= 3)
        {
            r.events.push_back ({ "onTransportIn", obj ({ { "action", "position" }, { "beat", ((bytes[2] & 0x7F) * 128 + (bytes[1] & 0x7F)) / 4.0 }, { "from", role } }) });
            return r;
        }
        if (status < 0x80 || status >= 0xF0) return r;
        const int kind = status & 0xF0;
        const int channel = (status & 0x0F) + 1;
        const auto base = role + ":" + juce::String (channel);
        auto* listen = listenFor (role);
        const bool member = isMember (listen, channel);
        const int x = bytes.size() > 1 ? bytes[1] : 0;
        const int y = bytes.size() > 2 ? bytes[2] : 0;
        auto& out = r.events;

        if (kind == 0x90 || kind == 0x80)
        {
            release (base, out);
            const bool off = kind == 0x80 || y == 0;
            auto payload = obj ({ { "channel", channel }, { "note", x }, { "velocity", y }, { "from", role } });
            if (member)
            {
                const auto playing = sounding.find (base);
                if (! off)
                {
                    const int id = nextId++;
                    sounding[base] = { id, x, y };
                    if (expression.find (base) == expression.end()) expression[base] = {};
                    payload.getDynamicObject()->setProperty ("id", id);
                }
                else if (playing != sounding.end() && playing->second.note == x)
                {
                    payload.getDynamicObject()->setProperty ("id", playing->second.id);
                    sounding.erase (playing);
                }
            }
            out.push_back ({ off ? "onNoteOffIn" : "onNoteIn", payload });
            return r;
        }
        if (kind == 0xE0)
        {
            const int raw = (y & 0x7F) * 128 + (x & 0x7F);
            const int value = raw - 8192;
            const double amount = value >= 0 ? value / 8191.0 : value / 8192.0;
            if (member)
            {
                expression[base].bend = amount * listen->bendRange;
                if (const auto n = sounding.find (base); n != sounding.end()) expressionEvent (role, channel, n->second, "bend", now, out);
                return r;
            }
            thinned (base + ":bend", base, now, "onBendIn", obj ({ { "channel", channel }, { "value", value }, { "amount", amount }, { "raw", raw }, { "from", role } }), out);
            return r;
        }
        if (kind == 0xD0)
        {
            if (member)
            {
                expression[base].pressure = x / 127.0;
                if (const auto n = sounding.find (base); n != sounding.end()) expressionEvent (role, channel, n->second, "pressure", now, out);
                return r;
            }
            thinned (base + ":pressure", base, now, "onPressureIn", obj ({ { "channel", channel }, { "value", x }, { "amount", x / 127.0 }, { "from", role } }), out);
            return r;
        }
        if (kind == 0xA0)
        {
            thinned (base + ":poly:" + juce::String (x), base, now, "onPolyPressureIn",
                     obj ({ { "channel", channel }, { "note", x }, { "value", y }, { "amount", y / 127.0 }, { "from", role } }), out);
            return r;
        }
        if (kind == 0xC0)
        {
            release (base, out);
            auto& s = state (base);
            auto payload = obj ({ { "channel", channel }, { "program", x }, { "number", x + 1 }, { "from", role } });
            if (s.bankMsb) payload.getDynamicObject()->setProperty ("bankMsb", *s.bankMsb);
            if (s.bankLsb) payload.getDynamicObject()->setProperty ("bankLsb", *s.bankLsb);
            s.bankMsb.reset();
            s.bankLsb.reset();
            out.push_back ({ "onProgramIn", payload });
            return r;
        }
        if (kind == 0xB0)
            r.ccTaken = controller (role, channel, x, y, now, out, listen);
        return r;
    }

    std::vector<Event> flush (double now)
    {
        std::vector<Event> out;
        for (size_t i = 0; i < waiting.size();)
        {
            if (waiting[i].due > now) { ++i; continue; }
            auto w = waiting[i];
            waiting.erase (waiting.begin() + (std::ptrdiff_t) i);
            settle (w, out);
        }
        return out;
    }

    std::optional<double> nextDue() const
    {
        std::optional<double> due;
        for (const auto& w : waiting) if (! due || w.due < *due) due = w.due;
        return due;
    }

    /** ce.mpe.listen: read MPE from a role ("" for every input); opts void stops. */
    void listen (const juce::String& role, const juce::var& opts)
    {
        if (! opts.isObject())
        {
            listens.erase (role);
            for (auto it = sounding.begin(); it != sounding.end();)
                it = (role.isEmpty() || it->first.startsWith (role + ":")) ? sounding.erase (it) : std::next (it);
            return;
        }
        Listen l;
        l.upper = opts.getProperty ("zone", "").toString() == "upper";
        const auto members = (double) opts.getProperty ("members", 15);
        l.members = juce::jlimit (1, 15, (int) std::floor (members > 0 ? members : 15));
        const auto bend = (double) opts.getProperty ("bendRange", 48);
        l.bendRange = bend > 0 ? bend : 48.0;
        listens[role] = l;
    }

    void reset() { *this = MidiInDecoder(); }

private:
    struct Channel { std::optional<int> bankMsb, bankLsb; juce::String kind; std::optional<int> msb, lsb, coarse; };
    struct Waiting { juce::String key, base, role; int channel = 0; double due = 0; bool nrpn = false; juce::String event; juce::var payload; };
    struct Listen { bool upper = false; int members = 15; double bendRange = 48.0; };
    struct Note { int id = 0, note = 0, velocity = 0; };
    struct Expression { double bend = 0, pressure = 0, timbre = 0; };

    std::map<juce::String, Channel> channels;
    std::map<juce::String, double> lastRaised;
    std::vector<Waiting> waiting;
    std::map<juce::String, Listen> listens;
    std::map<juce::String, Note> sounding;
    std::map<juce::String, Expression> expression;
    int nextId = 1;

    static juce::var obj (std::initializer_list<std::pair<const char*, juce::var>> fields)
    {
        auto* o = new juce::DynamicObject();
        for (const auto& [k, v] : fields) o->setProperty (k, v);
        return juce::var (o);
    }

    Channel& state (const juce::String& base) { return channels[base]; }

    Listen* listenFor (const juce::String& role)
    {
        if (auto it = listens.find (role); it != listens.end()) return &it->second;
        if (auto it = listens.find (juce::String()); it != listens.end()) return &it->second;
        return nullptr;
    }

    static bool isMember (const Listen* l, int channel)
    {
        if (l == nullptr) return false;
        if (l->upper) return channel <= 15 && channel >= 16 - l->members;
        return channel >= 2 && channel <= 1 + l->members;
    }

    void release (const juce::String& base, std::vector<Event>& out)
    {
        for (size_t i = 0; i < waiting.size();)
        {
            if (waiting[i].base != base) { ++i; continue; }
            auto w = waiting[i];
            waiting.erase (waiting.begin() + (std::ptrdiff_t) i);
            settle (w, out);
        }
    }

    void settle (const Waiting& w, std::vector<Event>& out)
    {
        if (w.nrpn)
        {
            auto& s = state (w.base);
            if (! s.coarse) return;
            const auto value = *s.coarse;
            s.coarse.reset();
            if (auto e = numberEvent (w.role, w.channel, s, value, false)) out.push_back (*e);
            return;
        }
        lastRaised[w.key] = w.due;
        out.push_back ({ w.event, w.payload });
    }

    void thinned (const juce::String& key, const juce::String& base, double now, const juce::String& event, const juce::var& payload, std::vector<Event>& out)
    {
        const auto last = lastRaised.find (key);
        if (last == lastRaised.end() || now - last->second >= thinMs)
        {
            waiting.erase (std::remove_if (waiting.begin(), waiting.end(), [&] (const Waiting& w) { return w.key == key; }), waiting.end());
            lastRaised[key] = now;
            out.push_back ({ event, payload });
            return;
        }
        for (auto& w : waiting) if (w.key == key) { w.payload = payload; return; }
        Waiting w;
        w.key = key; w.base = base; w.due = last->second + thinMs; w.event = event; w.payload = payload;
        waiting.push_back (w);
    }

    std::optional<Event> numberEvent (const juce::String& role, int channel, Channel& s, std::optional<int> value, bool fine)
    {
        if (! s.msb || ! s.lsb) return std::nullopt;
        const int parameter = *s.msb * 128 + *s.lsb;
        auto payload = obj ({ { "channel", channel }, { "from", role }, { "msb", *s.msb }, { "lsb", *s.lsb }, { "parameter", parameter } });
        auto* o = payload.getDynamicObject();
        if (value)
        {
            o->setProperty ("value", *value);
            o->setProperty ("fine", fine);
        }
        if (s.kind == "rpn")
        {
            static const std::map<int, const char*> names { { 0, "bendRange" }, { 1, "fineTuning" }, { 2, "coarseTuning" }, { 6, "mpeConfiguration" } };
            if (auto n = names.find (parameter); n != names.end()) o->setProperty ("name", n->second);
            if (parameter == 6 && ! fine && value)
                if (auto* l = listenFor (role); l != nullptr && (channel == 1 || channel == 16) && *value >= 0 && *value <= 15)
                {
                    l->upper = channel == 16;
                    l->members = *value;
                }
        }
        return Event { s.kind == "rpn" ? "onRpnIn" : "onNrpnIn", payload };
    }

    void expressionEvent (const juce::String& role, int channel, const Note& note, const char* changed, double now, std::vector<Event>& out)
    {
        const auto base = role + ":" + juce::String (channel);
        const auto& e = expression[base];
        thinned (base + ":expression", base, now, "onExpressionIn",
                 obj ({ { "id", note.id }, { "note", note.note }, { "channel", channel }, { "bend", e.bend }, { "pressure", e.pressure },
                        { "timbre", e.timbre }, { "changed", changed }, { "from", role } }), out);
    }

    bool controller (const juce::String& role, int channel, int cc, int value, double now, std::vector<Event>& out, Listen* listen)
    {
        const auto base = role + ":" + juce::String (channel);
        auto& s = state (base);
        if (listen != nullptr && isMember (listen, channel) && cc == 74)
        {
            expression[base].timbre = value / 127.0;
            if (const auto n = sounding.find (base); n != sounding.end()) expressionEvent (role, channel, n->second, "timbre", now, out);
            return true;
        }
        if (cc == 0) { s.bankMsb = value; return false; }
        if (cc == 32) { s.bankLsb = value; return false; }
        if (cc == 99 || cc == 98)
        {
            if (s.kind != "nrpn") { s.msb.reset(); s.lsb.reset(); }
            s.kind = "nrpn";
            (cc == 99 ? s.msb : s.lsb) = value;
            return false;
        }
        if (cc == 101 || cc == 100)
        {
            if (s.kind != "rpn") { s.msb.reset(); s.lsb.reset(); }
            s.kind = "rpn";
            (cc == 101 ? s.msb : s.lsb) = value;
            if (s.msb == 127 && s.lsb == 127) { s.kind = {}; s.msb.reset(); s.lsb.reset(); }
            return false;
        }
        if (s.kind.isEmpty() || ! s.msb || ! s.lsb) return false;
        if (cc == 6)
        {
            release (base, out);
            s.coarse = value;
            Waiting w;
            w.nrpn = true; w.role = role; w.channel = channel; w.key = base + ":nrpn"; w.base = base; w.due = now + nrpnWaitMs;
            waiting.push_back (w);
            return false;
        }
        if (cc == 38)
        {
            waiting.erase (std::remove_if (waiting.begin(), waiting.end(), [&] (const Waiting& w) { return w.key == base + ":nrpn"; }), waiting.end());
            const auto coarse = s.coarse;
            s.coarse.reset();
            if (! coarse) return false;
            if (auto e = numberEvent (role, channel, s, *coarse * 128 + value, true)) out.push_back (*e);
            return false;
        }
        if (cc == 96 || cc == 97)
        {
            if (auto e = numberEvent (role, channel, s, std::nullopt, false))
            {
                e->payload.getDynamicObject()->setProperty ("step", cc == 96 ? 1 : -1);
                release (base, out);
                out.push_back (*e);
            }
        }
        return false;
    }
};
}
