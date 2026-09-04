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

// The CTRL49's face, traced by eye from a straight-on product photo. Positions are normalised
// against the unit's bounding box and they are APPROXIMATE — close enough that you recognise
// your own keyboard and can point at the right knob, not a mechanical drawing. Nobody should
// measure anything with them.
//
// The picture is authored as numbers rather than shipped as an image on purpose: a product
// photograph belongs to its maker, and this repository is AGPLv3. Coordinates are ours.
//
// Note what is drawn but NOT addressable (index -1): nine faders, every button outside the
// pads, the wheels, the keybed. That is not an oversight — see `faders = 0` below.
SurfaceLayout buildCtrl49Layout()
{
    SurfaceLayout layout;
    layout.aspect = 2.31f;      // ~1040 x 450 on the reference photo

    const auto add = [&layout] (const char* id, const char* kind, const char* label,
                                float x, float y, float w, float h, int index = -1)
    {
        layout.controls.add ({ id, kind, label, x, y, w, h, index });
    };

    // --- the Mackie device-control section: one master and eight channel faders, the bank
    //     buttons beside them, and the eight assignable buttons underneath.
    add ("fader-master", "fader", "Vol", 0.122f, 0.085f, 0.024f, 0.175f);
    for (int i = 0; i < 8; ++i)
    {
        const auto x = 0.186f + (float) i * 0.0345f - 0.012f;
        layout.controls.add ({ "fader-" + juce::String (i + 1), "fader",
                               "F" + juce::String (i + 1), x, 0.085f, 0.024f, 0.175f, -1 });
        layout.controls.add ({ "button-b" + juce::String (i + 1), "button",
                               "B" + juce::String (i + 1), x, 0.384f, 0.024f, 0.040f, -1 });
    }
    add ("button-bank-left",  "button", "◀", 0.122f, 0.370f, 0.016f, 0.045f);
    add ("button-bank-right", "button", "▶", 0.142f, 0.370f, 0.016f, 0.045f);
    add ("button-button-mode", "button", "Mode", 0.442f, 0.384f, 0.021f, 0.040f);

    // --- the screen, and the navigation cluster under it.
    add ("display", "display", "Screen", 0.463f, 0.058f, 0.128f, 0.204f);
    add ("button-page-left",  "button", "Page ◀", 0.466f, 0.291f, 0.037f, 0.033f);
    add ("button-page-right", "button", "Page ▶", 0.553f, 0.291f, 0.037f, 0.033f);
    add ("button-main",    "button", "Main",    0.466f, 0.342f, 0.032f, 0.033f);
    add ("button-browse",  "button", "Browse",  0.466f, 0.400f, 0.035f, 0.033f);
    add ("button-preset",  "button", "Preset",  0.562f, 0.330f, 0.037f, 0.030f);
    add ("button-control", "button", "Control", 0.562f, 0.371f, 0.037f, 0.030f);
    add ("button-multi",   "button", "Multi",   0.562f, 0.412f, 0.037f, 0.030f);
    add ("button-nav-up",     "button", "▲", 0.520f, 0.296f, 0.020f, 0.050f);
    add ("button-nav-left",   "button", "◀", 0.500f, 0.348f, 0.020f, 0.050f);
    add ("button-nav-enter",  "button", "•", 0.520f, 0.348f, 0.020f, 0.050f);
    add ("button-nav-right",  "button", "▶", 0.540f, 0.348f, 0.020f, 0.050f);
    add ("button-nav-down",   "button", "▼", 0.520f, 0.400f, 0.020f, 0.050f);

    // --- the mode, arpeggiator, pad-bank, favourite and transport buttons.
    const char* modeRow[]  = { "Setup", "Global", "MIDI", "Split" };
    const char* modeIds[]  = { "setup", "global", "midi", "split" };
    const char* arpRow[]   = { "Arp", "Latch", "Full level", "Roll" };
    const char* arpIds[]   = { "arp", "latch", "full-level", "roll" };
    for (int i = 0; i < 4; ++i)
    {
        const auto x = 0.629f + (float) i * 0.0355f;
        layout.controls.add ({ juce::String ("button-") + modeIds[i], "button", modeRow[i],
                               x, 0.080f, 0.030f, 0.036f, -1 });
        layout.controls.add ({ juce::String ("button-") + arpIds[i], "button", arpRow[i],
                               x, 0.147f, 0.030f, 0.036f, -1 });
    }
    add ("button-tap-tempo",     "button", "Tap",   0.629f, 0.213f, 0.030f, 0.036f);
    add ("button-time-division", "button", "Div",   0.664f, 0.213f, 0.030f, 0.036f);
    add ("button-shift",         "button", "Shift",         0.700f, 0.213f, 0.030f, 0.036f);
    for (int i = 0; i < 4; ++i)
        layout.controls.add ({ "button-pad-bank-" + juce::String ((char) ('a' + i)), "button",
                               juce::String::charToString ((juce::juce_wchar) ('A' + i)),
                               0.632f + (float) i * 0.0337f, 0.298f, 0.019f, 0.035f, -1 });
    for (int i = 0; i < 5; ++i)
        layout.controls.add ({ "button-favourite-" + juce::String (i), "button",
                               juce::String (i), 0.632f + (float) i * 0.030f, 0.356f,
                               0.024f, 0.031f, -1 });
    const char* transport[] = { "◀◀", "▶▶", "■", "▶", "●" };
    const char* transportIds[] = { "rewind", "forward", "stop", "play", "record" };
    for (int i = 0; i < 5; ++i)
        layout.controls.add ({ juce::String ("button-") + transportIds[i], "button", transport[i],
                               0.633f + (float) i * 0.029f, 0.409f, 0.021f, 0.040f, -1 });

    // --- the eight encoders and the eight pads: the two groups the runtime can actually
    //     address, which is why these are the only controls carrying an index.
    for (int i = 0; i < 8; ++i)
        layout.controls.add ({ "encoder-" + juce::String (i + 1), "encoder",
                               juce::String (i + 1),
                               0.788f + (float) (i % 4) * 0.044f,
                               0.062f + (float) (i / 4) * 0.089f,
                               0.035f, 0.080f, i });              // Ctrl49Reducer: encoderSlot 0..7

    // The row of small buttons under the encoders. They are unlabelled here because the
    // reference photo cannot be read with confidence at that size, and inventing four labels
    // would be worse than four blanks.
    for (int i = 0; i < 4; ++i)
        layout.controls.add ({ "button-encoder-bank-" + juce::String (i + 1), "button", "",
                               0.794f + (float) i * 0.044f, 0.238f, 0.022f, 0.030f, -1 });

    for (int i = 0; i < 8; ++i)
    {
        // Pads 1-4 sit on the bottom row and 5-8 above them, the way every MPC-descended
        // surface is laid out and the way the numerals read on the unit.
        const auto column = i % 4;
        const auto onTopRow = i >= 4;
        layout.controls.add ({ "pad-" + juce::String (i + 1), "pad", juce::String (i + 1),
                               0.787f + (float) column * 0.044f,
                               onTopRow ? 0.289f : 0.380f,
                               0.037f, 0.080f, i + 1 });           // buildPadRgb: pad ID 1..8
    }

    // --- what your left hand does, and the keys.
    add ("button-octave-down", "button", "Oct −", 0.034f, 0.502f, 0.026f, 0.040f);
    add ("button-octave-up",   "button", "Oct +", 0.063f, 0.502f, 0.031f, 0.040f);
    add ("wheel-pitch", "wheel", "Pitch", 0.024f, 0.629f, 0.031f, 0.184f);
    add ("wheel-mod",   "wheel", "Mod",   0.063f, 0.629f, 0.030f, 0.184f);
    add ("keys", "keys", "49 keys", 0.109f, 0.511f, 0.879f, 0.462f);

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
    // Nine faders are on the box and the layout draws all nine. None is addressable here: they
    // sit in the unit's Mackie device-control section, and CEditor speaks nothing that maps
    // them. Capabilities say what we can DRIVE; the layout says what is THERE. Conformance
    // below ties the two together, so this zero is a statement rather than an omission.
    profile.capabilities.faders = 0;
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
