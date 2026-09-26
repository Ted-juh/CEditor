#include "SurfaceProfile.h"

#include <map>
#include <set>
#include "Ctrl49RackDisplay.h"
#include "Ctrl49PerformanceDisplay.h"

namespace ceditor::ctrl49
{

SurfaceProfileRegistry& SurfaceProfileRegistry::instance()
{
    static SurfaceProfileRegistry registry;
    return registry;
}

void SurfaceProfileRegistry::registerProfile (SurfaceProfile profile)
{
    if (profile.profileId.isEmpty())
        return;

    for (auto& existing : profiles)
        if (existing.profileId == profile.profileId)
        {
            existing = std::move (profile);   // re-registering replaces rather than duplicates
            return;
        }

    profiles.push_back (std::move (profile));
}

const SurfaceProfile* SurfaceProfileRegistry::find (const juce::String& profileId) const
{
    for (const auto& profile : profiles)
        if (profile.profileId == profileId)
            return &profile;
    return nullptr;
}

juce::StringArray SurfaceProfileRegistry::profileIds() const
{
    juce::StringArray ids;
    for (const auto& profile : profiles)
        ids.add (profile.profileId);
    return ids;
}

juce::StringArray SurfaceProfileRegistry::runConformance() const
{
    juce::StringArray failures;

    for (const auto& profile : profiles)
    {
        if (profile.conformance == nullptr)
        {
            failures.add (profile.profileId + ": unverified — no conformance checks registered");
            continue;
        }

        for (const auto& failure : profile.conformance())
            failures.add (profile.profileId + ": " + failure);

        for (const auto& failure : checkLayout (profile))
            failures.add (profile.profileId + ": " + failure);
    }

    return failures;
}

juce::StringArray SurfaceProfileRegistry::checkLayout (const SurfaceProfile& profile)
{
    juce::StringArray failures;
    if (profile.layout.isEmpty())
        return failures;      // no layout is legal; the UI draws generically from the counts

    if (! (profile.layout.aspect > 0.0f))
        failures.add ("layout has no aspect ratio, so it cannot keep its proportions");

    juce::StringArray seenIds;
    std::map<juce::String, std::set<int>> indicesByKind;

    for (const auto& control : profile.layout.controls)
    {
        const auto where = control.controlId.isNotEmpty() ? control.controlId
                                                          : juce::String ("(unnamed control)");
        if (control.controlId.isEmpty())
            failures.add ("a control has no id, so nothing can address or test it");
        else if (seenIds.contains (control.controlId))
            failures.add ("duplicate control id: " + control.controlId);
        else
            seenIds.add (control.controlId);

        // Positions are normalised, so anything outside the unit box is a typo rather than a
        // control hanging off the edge of a real keyboard.
        if (control.x < 0.0f || control.y < 0.0f || control.w <= 0.0f || control.h <= 0.0f
            || control.x + control.w > 1.0f || control.y + control.h > 1.0f)
            failures.add (where + " is not inside the unit: it would draw off the box");

        if (control.index >= 0 && ! indicesByKind[control.kind].insert (control.index).second)
            failures.add (where + " reuses index " + juce::String (control.index)
                          + " for another " + control.kind + " — two controls cannot be the same one");
    }

    // Two controls cannot occupy the same place on a keyboard, so two boxes overlapping is a
    // typo in the tracing. This is the check that a list of coordinates cannot be eyeballed:
    // every number was inside the unit and every count agreed, and the drawing still had a
    // Page button sitting on top of Preset.
    const auto& controls = profile.layout.controls;
    for (int a = 0; a < controls.size(); ++a)
        for (int b = a + 1; b < controls.size(); ++b)
        {
            const auto& first = controls.getReference (a);
            const auto& second = controls.getReference (b);
            const auto overlapX = juce::jmin (first.x + first.w, second.x + second.w)
                                - juce::jmax (first.x, second.x);
            const auto overlapY = juce::jmin (first.y + first.h, second.y + second.h)
                                - juce::jmax (first.y, second.y);
            // A shared edge is not an overlap: controls sit flush against each other all the
            // time, and floats traced by eye land a hair either side of touching.
            if (overlapX > 0.001f && overlapY > 0.001f)
                failures.add (first.controlId + " overlaps " + second.controlId
                              + " — two controls cannot be in the same place");
        }

    // The capability counts and the drawing have to agree about what is DRIVEABLE, never about
    // what exists. A surface may carry nine faders and let us map none of them; what must not
    // happen is a layout claiming to address eight encoders while the profile promises six,
    // because then clicking the picture reaches a control the runtime does not have.
    const auto agree = [&failures, &profile] (const char* kind, int promised)
    {
        const auto drawn = profile.layout.addressableCount (kind);
        if (drawn != promised)
            failures.add (juce::String ("layout addresses ") + juce::String (drawn) + " "
                          + kind + (drawn == 1 ? "" : "s") + " but the profile promises "
                          + juce::String (promised));
    };
    agree ("encoder", profile.capabilities.encoders);
    agree ("pad", profile.capabilities.pads);
    agree ("fader", profile.capabilities.faders);

    return failures;
}

int SurfaceLayout::addressableCount (const juce::String& kind) const
{
    int count = 0;
    for (const auto& control : controls)
        if (control.kind == kind && control.index >= 0)
            ++count;
    return count;
}

SurfaceLayout buildGenericLayout (const SurfaceCapabilities& capabilities)
{
    SurfaceLayout layout;
    layout.aspect = 2.3f;      // a 49-key box, near enough for a schematic

    // Each family gets its own band, and every item is sized from the count so a row always
    // fits inside it. That is what makes this safe for any number the owner claims: nothing is
    // positioned by hand, so nothing can overlap or run off the edge, and the conformance
    // check that refuses both is the same one an authored layout has to pass.
    const auto place = [&layout] (const juce::String& kind, const juce::String& prefix, int count,
                                  int perRow, float left, float right, float top, float bottom,
                                  bool addressable)
    {
        if (count <= 0)
            return;

        const auto columns = juce::jmax (1, juce::jmin (perRow, count));
        const auto rows = (count + columns - 1) / columns;
        const auto cellW = (right - left) / (float) columns;
        const auto cellH = (bottom - top) / (float) rows;

        // Seven tenths of the cell, centred: the gap is what stops two neighbours touching,
        // and touching is what the overlap check refuses.
        const auto w = cellW * 0.7f;
        const auto h = cellH * 0.7f;

        for (int i = 0; i < count; ++i)
        {
            const auto column = i % columns;
            const auto row = i / columns;
            layout.controls.add ({ prefix + juce::String (i + 1), kind,
                                   juce::String (i + 1),
                                   left + column * cellW + (cellW - w) / 2.0f,
                                   top + row * cellH + (cellH - h) / 2.0f,
                                   w, h,
                                   addressable ? i : -1 });
        }
    };

    // Faders on the left, encoders on the right, pads under the encoders — the arrangement
    // nearly every controller of this shape actually has, so the map reads like the desk even
    // though none of it was measured.
    place ("fader",   "fader-",   capabilities.faders,   9, 0.03f, 0.34f, 0.07f, 0.31f, true);
    place ("encoder", "encoder-", capabilities.encoders, 8, 0.40f, 0.97f, 0.07f, 0.31f, true);
    place ("pad",     "pad-",     capabilities.pads,     8, 0.40f, 0.97f, 0.35f, 0.53f, true);

    // The keys, drawn and honestly inert: they are why the box is on the desk, and leaving
    // them out would make the map read as a control panel rather than as an instrument.
    layout.controls.add ({ "keys", "keys", "Keys", 0.02f, 0.57f, 0.96f, 0.40f, -1 });

    return layout;
}

namespace
{

// The CTRL49's face, traced from a straight-on photograph of an owner's own unit (1200 x 483,
// the unit's bounding box) and written down here in that photo's pixels. It replaced a first
// tracing, made by eye from a smaller product shot, that had the pads' rows upside down,
// four division buttons where there are eight, and no data dial. The pixels are divided out
// below, so the numbers read as what they are: measurements off a picture of the real thing.
// They are APPROXIMATE all the same — close enough that you recognise your own keyboard and
// can point at the right knob, not a mechanical drawing.
//
// The picture is authored as numbers rather than shipped as an image on purpose: a product
// photograph belongs to its maker, and this repository is AGPLv3. Coordinates are ours.
//
// Note what is drawn but NOT addressable (index -1): the buttons outside the pads and the
// Mackie strip, the dial, the wheels, the keybed. The faders and B1-B8 are addressable through
// the unit's Mackie section, which HoSTage reads as controls (MackieControl.h): fader N is
// pitch bend on channel N, master on 9; B-button N is strip note N in whichever row the unit's
// Button Mode sends.
SurfaceLayout buildCtrl49Layout()
{
    constexpr float photoW = 1200.0f, photoH = 483.0f;

    SurfaceLayout layout;
    layout.aspect = photoW / photoH;

    const auto add = [&layout] (const juce::String& id, const char* kind, const juce::String& label,
                                float x, float y, float w, float h, int index = -1)
    {
        layout.controls.add ({ id, kind, label, x / photoW, y / photoH, w / photoW, h / photoH, index });
    };

    // --- the Mackie device-control section: one master and eight channel faders, and the
    //     eight assignable buttons under the channel faders, each centred on its fader.
    //     Indices are Mackie's: faders 0..7 are channels 1-8, the master is channel 9.
    add ("fader-master", "fader", "Vol", 168.0f, 47.0f, 30.0f, 112.0f, 8);
    for (int i = 0; i < 8; ++i)
    {
        const auto centre = 237.0f + (float) i * 35.8f;
        add ("fader-" + juce::String (i + 1), "fader", "F" + juce::String (i + 1),
             centre - 15.0f, 47.0f, 30.0f, 112.0f, i);
        add ("button-b" + juce::String (i + 1), "button", "B" + juce::String (i + 1),
             centre - 7.0f, 186.0f, 14.0f, 14.0f, i);
    }
    add ("button-bank-left",   "button", "◀",    166.0f, 186.0f, 14.0f, 14.0f);
    add ("button-bank-right",  "button", "▶",    190.0f, 186.0f, 14.0f, 14.0f);
    add ("button-button-mode", "button", "Mode", 515.0f, 186.0f, 14.0f, 14.0f);

    // --- the screen, the navigation cluster under it, and the data dial at its centre (the
    //     reducer's CC 34, which nudges whichever slot is active).
    add ("display", "display", "Screen", 552.0f, 28.0f, 162.0f, 90.0f);
    add ("button-page-left",  "button", "Page ◀", 560.0f, 139.0f, 29.0f, 12.0f);
    add ("button-main",       "button", "Main",   560.0f, 166.0f, 29.0f, 12.0f);
    add ("button-browse",     "button", "Browse", 560.0f, 194.0f, 29.0f, 12.0f);
    add ("button-page-right", "button", "Page ▶", 679.0f, 139.0f, 29.0f, 12.0f);
    add ("button-control",    "button", "Control", 679.0f, 166.0f, 29.0f, 12.0f);
    add ("button-multi",      "button", "Multi",  679.0f, 194.0f, 29.0f, 12.0f);
    add ("button-nav-up",    "button", "▲", 624.0f, 138.0f, 19.0f, 14.0f);
    add ("button-nav-down",  "button", "▼", 624.0f, 191.0f, 19.0f, 14.0f);
    add ("button-nav-left",  "button", "◀", 600.0f, 162.0f, 13.0f, 19.0f);
    add ("button-nav-right", "button", "▶", 654.0f, 162.0f, 13.0f, 19.0f);
    add ("dial-data", "dial", "Data", 620.0f, 157.0f, 27.0f, 28.0f);

    // --- the mode, arpeggiator, pad, tap/division/shift, pad-bank, favourite and transport
    //     buttons: four columns, with Shift spanning the last two.
    const float column[] = { 750.0f, 793.0f, 836.0f, 880.0f };
    const char* modeRow[] = { "Setup", "Global", "MIDI", "Split" };
    const char* modeIds[] = { "setup", "global", "midi", "split" };
    const char* arpRow[]  = { "Arp", "Latch", "Full level", "Roll" };
    const char* arpIds[]  = { "arp", "latch", "full-level", "roll" };
    for (int i = 0; i < 4; ++i)
    {
        add (juce::String ("button-") + modeIds[i], "button", modeRow[i], column[i], 34.0f, 29.0f, 13.0f);
        add (juce::String ("button-") + arpIds[i],  "button", arpRow[i],  column[i], 64.0f, 29.0f, 13.0f);
        add ("button-pad-bank-" + juce::String::charToString ((juce::juce_wchar) ('a' + i)), "button",
             juce::String::charToString ((juce::juce_wchar) ('A' + i)), column[i], 137.0f, 29.0f, 13.0f);
    }
    add ("button-tap-tempo",     "button", "Tap",   750.0f, 94.0f, 29.0f, 13.0f);
    add ("button-time-division", "button", "Div",   793.0f, 94.0f, 29.0f, 13.0f);
    add ("button-shift",         "button", "Shift", 836.0f, 94.0f, 73.0f, 13.0f);

    const char* transport[]    = { "◀◀", "▶▶", "■", "▶", "●" };
    const char* transportIds[] = { "rewind", "forward", "stop", "play", "record" };
    for (int i = 0; i < 5; ++i)
    {
        const auto x = 750.0f + (float) i * 34.8f;
        add ("button-favourite-" + juce::String (i), "button", juce::String (i), x, 165.0f, 20.0f, 13.0f);
        add (juce::String ("button-") + transportIds[i], "button", transport[i], x, 194.0f, 20.0f, 16.0f);
    }

    // --- the eight encoders, the eight division buttons and the eight pads: three grids of
    //     four columns, numbered 1-4 on the top row and 5-8 below, as the unit prints them.
    //     Encoders and pads are the two groups the runtime can address, which is why they are
    //     the only controls carrying an index.
    for (int i = 0; i < 8; ++i)
    {
        const auto col = (float) (i % 4);
        const auto lowerRow = i >= 4;
        add ("encoder-" + juce::String (i + 1), "encoder", juce::String (i + 1),
             945.0f + col * 47.0f, lowerRow ? 56.0f : 19.0f, 30.0f, 30.0f,
             i);                                                   // Ctrl49Reducer: encoderSlot 0..7

        // One per pad, directly above the pad it belongs to — printed with the note values the
        // unit uses them for when Time Division is held.
        const char* division[] = { "1/4", "1/8", "1/16", "1/32", "1/4T", "1/8T", "1/16T", "1/32T" };
        add ("button-division-" + juce::String (i + 1), "button", division[i],
             952.0f + col * 47.0f, lowerRow ? 113.0f : 91.0f, 15.0f, 15.0f);

        add ("pad-" + juce::String (i + 1), "pad", juce::String (i + 1),
             939.0f + col * 47.0f, lowerRow ? 178.0f : 138.0f, 41.0f, 34.0f,
             i + 1);                                               // buildPadRgb: pad ID 1..8
    }

    // --- what your left hand does, and the keys.
    add ("button-octave-down", "button", "Oct −", 40.0f, 245.0f, 30.0f, 17.0f);
    add ("button-octave-up",   "button", "Oct +", 85.0f, 245.0f, 31.0f, 17.0f);
    add ("wheel-pitch", "wheel", "Pitch", 39.0f, 307.0f, 30.0f, 89.0f);
    add ("wheel-mod",   "wheel", "Mod",   90.0f, 307.0f, 29.0f, 89.0f);
    add ("keys", "keys", "49 keys", 146.0f, 254.0f, 998.0f, 206.0f);

    return layout;
}

}  // namespace

void registerCtrl49Profile()
{
    SurfaceProfile profile;
    // The id is IDENTITY and does not move: a saved Performance names the surface it was
    // authored on, so renaming it to correct a label would orphan every session that already
    // says "akai-ctrl49". The label was simply wrong — this is an M-Audio CTRL49, not an Akai
    // Advance. They are sibling inMusic keyboards that both drive VIP, which is presumably how
    // they got merged here, and the display name is display only.
    profile.profileId = "akai-ctrl49";
    profile.displayName = "M-Audio CTRL49";
    profile.vendor = "M-Audio";

    profile.capabilities.encoders = 8;
    // Nine faders are on the box and all nine are driveable: they sit in the unit's Mackie
    // device-control section, which HoSTage reads as controls when the Mackie section setting
    // is on (the default). Capabilities say what we can DRIVE; the layout says what is THERE;
    // conformance ties the two together.
    profile.capabilities.faders = 9;
    profile.capabilities.pads = 8;
    profile.capabilities.padBanks = 4;
    profile.capabilities.hasDisplay = true;
    profile.capabilities.displayColumns = 16;
    profile.capabilities.hasTransportButtons = true;
    profile.capabilities.relativeEncoders = true;
    profile.layout = buildCtrl49Layout();

    profile.renderers.renderLabels = [] (const juce::String& title, const juce::StringArray& labels)
    {
        RackSlotViews views {};
        for (int i = 0; i < juce::jmin (8, labels.size()); ++i)
            views[(std::size_t) i] = { labels[i].toStdString(), 0, labels[i].isNotEmpty(), true };
        return buildRackLabelPayload (title.toStdString(), views);
    };

    profile.renderers.renderState = [] (const juce::String& title, const juce::StringArray& labels,
                                        const juce::Array<float>& values, const juce::Array<bool>& lit)
    {
        juce::ignoreUnused (title);
        PerformanceClipViews clips {};
        for (int i = 0; i < 8; ++i)
            clips[(std::size_t) i] = { i < labels.size() ? labels[i].toStdString() : std::string(),
                                       i < lit.size() && lit[i], false,
                                       i < values.size() ? values[i] : 0.0f };
        return buildPerformanceStatePayload (0, clips);
    };

    // Conformance is about the payloads this profile promises to build, which is exactly what
    // can be verified without the device on the desk. Anything that needs the hardware itself
    // stays a hardware test, and support is claimed only after that passes too.
    profile.conformance = []
    {
        juce::StringArray failures;

        RackSlotViews views {};
        views[0] = { "Cutoff", 64, true, true };
        const auto labels = buildRackLabelPayload ("Page", views);
        if (labels.empty() || labels[0] != 4)
            failures.add ("label payload does not start with the title length");

        // The knob page's contract: nine bytes, [activeSlot][v0..v7] — what
        // CEditor_MultiKnob.lua's set_values actually reads on the device.
        const auto state = buildRackStatePayload (0, views);
        if (state.size() != 9)
            failures.add ("state payload is not the knob page's nine bytes");
        if (state.size() == 9 && state[1] != 64)
            failures.add ("knob position did not reach its value byte");

        PerformanceClipViews clips {};
        clips[0] = { "Verse", true, false, 1.0f };
        const auto performance = buildPerformanceStatePayload (0, clips);
        if (performance.size() != 9 || performance[1] != 127)
            failures.add ("performance payload does not carry the running clip's phase");
        PerformanceTransportView transportView {};
        const auto performanceLabels = buildPerformanceLabelPayload (transportView, clips);
        // Past the title: the first clip label must carry the running mark the state
        // bytes no longer have room for.
        if (performanceLabels.size() < 3
            || performanceLabels[(std::size_t) performanceLabels[0] + 2] != (std::uint8_t) '*')
            failures.add ("a running clip is not marked in its label");

        return failures;
    };

    SurfaceProfileRegistry::instance().registerProfile (std::move (profile));
}

} // namespace ceditor::ctrl49
