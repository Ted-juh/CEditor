// Reducer and session-sequence tests for the CTRL49 control surface. The reducer cases
// are the C# self-test (Ctrl49UnifiedStateV1.RunSelfTest) ported one-for-one, so the C++
// port is verified to behave identically to the reducer proven live in the PowerShell
// unified demonstrator. The session case checks the startup frame sequence shape.

#include "ControlSurface/Ctrl49Reducer.h"
#include "ControlSurface/Ctrl49Session.h"

#include <iostream>
#include <string>

namespace
{
using ceditor::ctrl49::Bytes;
using ceditor::ctrl49::Ctrl49Reducer;

int failures = 0;

void check (bool cond, const std::string& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

// Feeds one 3-byte CC message; returns whether the reducer acted.
bool feed (Ctrl49Reducer& r, std::uint8_t status, std::uint8_t d1, std::uint8_t d2)
{
    const std::uint8_t msg[3] { status, d1, d2 };
    return r.process (msg, 3).has_value();
}
} // namespace

int main()
{
    using namespace ceditor::ctrl49;

    std::cout << "Ctrl49 reducer test\n-------------------\n";

    {   // --- ported C# self-test ------------------------------------------------------------------
        Ctrl49Reducer r;

        const std::uint8_t enc1up[3] { 0xB0, 0x0B, 0x01 };
        auto action = r.process (enc1up, 3);
        check (action.has_value() && action->render && r.activeSlot() == 0
                   && r.displayArguments()[6] == 65,
               "Encoder 1 increments page-1 slot 1 to 65");

        feed (r, 0xB0, 0x0B, 0x7F);
        check (r.displayArguments()[6] == 64, "Relative encoder decrement interpreted as -1");

        feed (r, 0xB0, 0x14, 0x7F);
        check (r.activeSlot() == 1 && r.displayArguments()[15] == 1,
               "Switch 2 selects and toggles slot 2 on");

        feed (r, 0xB0, 0x28, 0x7F);
        check (r.page() == 1, "Page Right selects page 2");
        feed (r, 0xB0, 0x23, 0x7F);
        check (r.page() == 0, "Main mode button selects page 1");

        feed (r, 0xB0, 0x3A, 0x7F);           // Shift down
        auto bank = [&] { const std::uint8_t m[3] { 0xB0, 0x2B, 0x7F };
                          return r.process (m, 3); }();
        check (bank.has_value() && bank->bankChanged && r.padBank() == 1,
               "Shift + Pad Bank B selects Bank B");

        const std::uint8_t padStrike[3] { 0xB0, 0x01, 0x63 };
        auto pad = r.process (padStrike, 3);
        check (pad.has_value() && pad->padChanged && pad->velocity == 99,
               "Pad strike produces a pad-feedback action (velocity 99)");

        feed (r, 0xB0, 0x39, 0x7F);           // Time Division down
        feed (r, 0xB0, 0x15, 0x7F);           // Encoder switch 3 -> division 3
        check (r.division() == 3, "Time Division + Switch 3 retained as division 3");

        check (r.displayArguments().size() == 22, "Display-state payload is exactly 22 bytes");
    }

    {   // --- messages that must change nothing -----------------------------------------------------
        Ctrl49Reducer r;
        const std::uint8_t poly[3] { 0xA0, 0x01, 0x40 };
        check (! r.process (poly, 3).has_value(), "Poly pressure produces no action");
        const std::uint8_t shortMsg[2] { 0xB0, 0x0B };
        check (! r.process (shortMsg, 2).has_value(), "Sub-3-byte message produces no action");
        check (! r.process (nullptr, 0).has_value(), "Null message produces no action");
        const std::uint8_t switchUp[3] { 0xB0, 0x13, 0x00 };
        check (! r.process (switchUp, 3).has_value(), "Encoder-switch release produces no action");
    }

    {   // --- per-page value isolation --------------------------------------------------------------
        Ctrl49Reducer r;
        feed (r, 0xB0, 0x0B, 0x01);           // page 1 slot 1 -> 65
        feed (r, 0xB0, 0x28, 0x7F);           // Page Right to page 2
        check (r.displayArguments()[6] == 64, "Page 2 slot 1 still default 64 (pages isolated)");
        feed (r, 0xB0, 0x27, 0x7F);           // Page Left back to page 1
        check (r.displayArguments()[6] == 65, "Page 1 slot 1 retained 65 across page switch");
    }

    std::cout << "\nCtrl49 session sequence test\n----------------------------\n";

    {   // --- startup sequence shape ----------------------------------------------------------------
        // A 3,405-byte source uploads as 3,406 bytes (the session appends the NUL) in
        // 9 object frames. The startup sequence interleaves setup around them; verify the
        // object frames and key milestones land.
        Bytes rawLua (3405, static_cast<std::uint8_t> ('-'));
        const auto seq = Ctrl49Session::buildStartupSequence (rawLua);

        // The terminator is the session's job now — the hardware found the one caller that
        // trusted the old comment: an unterminated page reads on into device RAM and dies
        // as "Lua Main Body Error". Identical sequences with and without a caller NUL is
        // the proof nobody can get this wrong from either side any more.
        Bytes preTerminated = rawLua;
        preTerminated.push_back (0x00);
        {
            const auto again = Ctrl49Session::buildStartupSequence (preTerminated);
            bool identical = again.size() == seq.size();
            for (std::size_t i = 0; identical && i < seq.size(); ++i)
                identical = again[i].frame == seq[i].frame;
            check (identical, "caller-terminated and plain source upload identically");
        }

        auto isFrame = [] (const Bytes& f, std::uint8_t type, std::uint8_t cmd)
        { return f.size() >= 8 && f[6] == type && f[7] == cmd; };

        int beginCount = 0, chunkCount = 0, endCount = 0, bindCount = 0;
        for (const auto& step : seq)
        {
            if (isFrame (step.frame, 0x05, 0x00)) ++beginCount;
            if (isFrame (step.frame, 0x05, 0x01)) ++chunkCount;
            if (isFrame (step.frame, 0x05, 0x0B)) ++endCount;
            if (isFrame (step.frame, 0x02, 0x3A)) ++bindCount;
        }
        check (beginCount == 1 && endCount == 1 && chunkCount == 7,
               "Startup uploads the Lua object as 1 begin + 7 chunks + 1 end");
        check (bindCount == 1, "Startup binds the Lua object exactly once");

        check (isFrame (seq.front().frame, 0x03, 0x08), "Startup opens with an identity query");
        const auto& last = seq.back().frame;
        check (isFrame (last, 0x02, 0x3B), "Startup ends with a draw call");

        // The begin frame must precede every chunk, which must precede the end.
        int firstChunk = -1, begin = -1, end = -1;
        for (int i = 0; i < static_cast<int> (seq.size()); ++i)
        {
            if (begin < 0 && isFrame (seq[i].frame, 0x05, 0x00)) begin = i;
            if (firstChunk < 0 && isFrame (seq[i].frame, 0x05, 0x01)) firstChunk = i;
            if (isFrame (seq[i].frame, 0x05, 0x0B)) end = i;
        }
        check (begin < firstChunk && firstChunk < end, "Object frames are ordered begin < chunk < end");
    }

    {   // --- PNG asset upload lands before the bind ------------------------------------------------
        // Two object keys must appear: the Lua (type 0x0010, id 0x0101) and the PNG asset
        // (type 0x000E). Object-begin frames carry the 4-byte key at payload offset 0.
        Bytes rawLua (600, static_cast<std::uint8_t> ('-'));
        Bytes png (200, static_cast<std::uint8_t> (0x7E));
        const std::vector<Ctrl49Session::PngAsset> assets { { 0x0200, png } };
        const auto seq = Ctrl49Session::buildStartupSequence (rawLua, assets);

        auto isFrame = [] (const Bytes& f, std::uint8_t type, std::uint8_t cmd)
        { return f.size() >= 8 && f[6] == type && f[7] == cmd; };

        int lastBeginBeforeBind = -1, bindIndex = -1;
        bool sawPngObject = false;
        for (int i = 0; i < static_cast<int> (seq.size()); ++i)
        {
            const Bytes& f = seq[i].frame;
            if (isFrame (f, 0x05, 0x00))
            {
                lastBeginBeforeBind = bindIndex < 0 ? i : lastBeginBeforeBind;
                // object key at payload start (offset 10): type high/low then id high/low
                if (f.size() >= 12 && f[10] == 0x00 && f[11] == 0x0E)  // PNG type 0x000E
                    sawPngObject = true;
            }
            if (isFrame (f, 0x02, 0x3A)) bindIndex = i;
        }
        check (sawPngObject, "PNG asset uploaded as an object of type 0x000E");
        check (lastBeginBeforeBind >= 0 && bindIndex > lastBeginBeforeBind,
               "All object uploads (Lua + PNG) precede the bind");
    }

    std::cout << "-------------------\n"
              << (failures == 0 ? "ALL PASS" : std::to_string (failures) + " FAILED") << std::endl;
    return failures == 0 ? 0 : 1;
}
