#include "Ctrl49StagePages.h"

#include <algorithm>
#include <cmath>

namespace ceditor::ctrl49
{

namespace
{
    std::uint8_t byte (int value, int low = 0, int high = 255)
    {
        return static_cast<std::uint8_t> (std::clamp (value, low, high));
    }

    // [length][ASCII], cut at `limit` characters; "..." marks a cut when `ellipsis` is set.
    void appendString (Bytes& out, const std::string& s, std::size_t limit, bool ellipsis = false)
    {
        std::string text = s;
        if (text.size() > limit)
            text = ellipsis && limit > 3 ? text.substr (0, limit - 3) + "..." : text.substr (0, limit);
        out.push_back (static_cast<std::uint8_t> (text.size()));
        for (const auto c : text)
        {
            const auto b = static_cast<std::uint8_t> (c);
            out.push_back (b >= 0x20 && b < 0x80 ? b : static_cast<std::uint8_t> ('?'));
        }
    }
} // namespace

// --- SOUNDCHECK -----------------------------------------------------------------------------------

std::uint8_t soundcheckLevelByte (bool measured, double db)
{
    if (! measured || ! std::isfinite (db))
        return 0;
    return byte (1 + (int) std::lround (std::clamp (db, -60.0, 0.0) + 60.0), 1, 61);
}

std::uint8_t soundcheckLoadByte (double seconds, bool timedOut)
{
    if (seconds < 0.0 || ! std::isfinite (seconds))
        return 0;
    if (timedOut)
        return 255;
    return byte (1 + (int) std::lround (seconds * 10.0), 1, 254);
}

int soundcheckFirstRow (int songs, int selected)
{
    if (songs <= kSoundcheckRows)
        return 0;
    return std::clamp (selected - kSoundcheckRows / 2, 0, songs - kSoundcheckRows);
}

Bytes buildSoundcheckPayload (const SoundcheckView& view)
{
    const int count = (int) view.songs.size();
    const int selected = count == 0 ? 0 : std::clamp (view.selected, 0, count - 1);
    const int first = soundcheckFirstRow (count, selected);
    const int rows = std::min (kSoundcheckRows, count - first);

    int ready = 0, problems = 0, unchecked = 0;
    for (const auto& song : view.songs)
    {
        if (! song.checked) ++unchecked;
        else if (song.problems > 0) ++problems;
        else ++ready;
    }

    Bytes out;
    out.push_back (byte (count));
    out.push_back (byte (first));
    out.push_back (byte (rows));
    out.push_back (byte (selected));
    out.push_back (view.current >= 0 && view.current < count ? byte (view.current + 1) : 0);
    out.push_back (byte (ready));
    out.push_back (byte (problems));
    out.push_back (byte (unchecked));

    for (int i = first; i < first + rows; ++i)
    {
        const auto& song = view.songs[(std::size_t) i];
        out.push_back (! song.checked ? 0 : (song.problems > 0 ? 2 : 1));
        out.push_back (soundcheckLevelByte (song.measured, song.rmsDb));
        out.push_back (byte (song.problems));
        out.push_back (soundcheckLoadByte (song.loadSeconds, song.loadTimedOut));
        appendString (out, song.name, kSoundcheckNameChars);
    }

    appendString (out, view.basis, 32, true);
    out.push_back (byte ((int) view.problems.size()));
    const auto lines = std::min ((int) view.problems.size(), kSoundcheckProblemLines);
    out.push_back (byte (lines));
    for (int i = 0; i < lines; ++i)
        appendString (out, view.problems[(std::size_t) i], kSoundcheckLineChars, true);

    const auto* song = count > 0 ? &view.songs[(std::size_t) selected] : nullptr;
    const bool measured = song != nullptr && song->measured;
    out.push_back (soundcheckLevelByte (measured, song != nullptr ? song->peakDb : 0.0));
    out.push_back (soundcheckLevelByte (measured, song != nullptr ? song->rmsDb : 0.0));
    out.push_back (byte (measured ? (int) std::lround (view.seconds) : 0));
    out.push_back ((std::uint8_t) ((song != nullptr && song->preloaded ? 1 : 0) | (view.preloadOff ? 2 : 0)));
    return out;
}

// --- LAYERS ---------------------------------------------------------------------------------------

int layersFirstRow (int parts, int focused)
{
    if (parts <= kLayersRows)
        return 0;
    return std::clamp (focused - kLayersRows / 2 + 1, 0, parts - kLayersRows);
}

Bytes buildLayersPayload (const LayersView& view)
{
    const int count = (int) view.parts.size();
    const int focused = count == 0 ? 0 : std::clamp (view.focused, 0, count - 1);
    const int first = layersFirstRow (count, focused);
    const int rows = std::min (kLayersRows, count - first);

    Bytes out;
    out.push_back (byte (count));
    out.push_back (byte (first));
    out.push_back (byte (rows));
    out.push_back (byte (focused));
    out.push_back (byte (view.firstKey, 0, 127 - 48));

    for (int i = first; i < first + rows; ++i)
    {
        const auto& part = view.parts[(std::size_t) i];
        out.push_back (byte (part.keyLow, 0, 127));
        out.push_back (byte (part.keyHigh, 0, 127));
        out.push_back (byte (part.velocityLow, 0, 127));
        out.push_back (byte (part.velocityHigh, 0, 127));
        out.push_back (byte (part.transpose + 64, 0, 127));
        out.push_back ((std::uint8_t) ((part.enabled ? 1 : 0) | (part.muted ? 2 : 0) | (part.fromKeyboard ? 4 : 0)));
        out.push_back (byte (part.group));
        out.push_back (byte (std::clamp (part.source, 0, 4) + 16 * std::clamp (part.allocation, 0, 2)));
        out.push_back (byte (part.layerLow, 0, 127));
        out.push_back (byte (part.layerHigh, 0, 127));
        out.push_back (byte (part.layerFade, 0, 64));
        appendString (out, part.name, kLayersNameChars);
    }

    const auto held = std::min ((int) view.held.size(), kLayersHeldNotes);
    out.push_back (byte (held));
    for (int i = 0; i < held; ++i)
    {
        out.push_back (byte (view.held[(std::size_t) i].note, 0, 127));
        out.push_back (byte (view.held[(std::size_t) i].velocity, 0, 127));
    }
    return out;
}

// --- CUE ------------------------------------------------------------------------------------------

Bytes buildCuePayload (const CueView& view)
{
    const auto twoBytes = [] (Bytes& out, int value)
    {
        const auto v = std::clamp (value, 0, 65535);
        out.push_back ((std::uint8_t) (v & 0xFF));
        out.push_back ((std::uint8_t) (v >> 8));
    };
    const auto inSet = [&view] (int index) { return index >= 0 && index < view.songs ? index + 1 : 0; };

    Bytes out;
    out.push_back (byte (view.songs));
    out.push_back (byte (inSet (view.current)));
    out.push_back (byte (view.picked == view.current ? 0 : inSet (view.picked)));
    out.push_back (view.loading ? 1 : 0);
    twoBytes (out, view.songSeconds);
    twoBytes (out, view.setSeconds);
    twoBytes (out, view.plannedSeconds);
    twoBytes (out, (int) std::lround (view.tempo * 10.0));
    const auto sectionBars = view.section.empty() ? 0 : std::clamp (view.sectionBars, 0, 255);
    out.push_back (byte (sectionBars == 0 ? 0 : std::clamp (view.sectionBar, 1, sectionBars)));
    out.push_back (byte (sectionBars));
    out.push_back (view.nextReady < 0 ? 255 : byte (view.nextReady, 0, 100));
    appendString (out, view.song, kSoundcheckNameChars);
    appendString (out, view.section, 16);
    appendString (out, view.nextSection, 16);
    appendString (out, view.nextSong, kSoundcheckNameChars);
    appendString (out, view.picked == view.current ? std::string() : view.pickedSong, kSoundcheckNameChars);
    const auto lines = std::min ((int) view.notes.size(), kCueNoteLines);
    out.push_back (byte (lines));
    for (int i = 0; i < lines; ++i)
        appendString (out, view.notes[(std::size_t) i], kCueNoteChars, true);
    return out;
}

// --- CHANGES --------------------------------------------------------------------------------------

// --- LIVE -----------------------------------------------------------------------------------------

int liveNextRate (int stepsPerBeat, int detents)
{
    static constexpr int rates[] { 1, 2, 3, 4, 6, 8, 12, 16 };
    constexpr int count = (int) (sizeof (rates) / sizeof (rates[0]));
    int at = 0;
    while (at < count - 1 && rates[at] < stepsPerBeat)
        ++at;
    if (rates[at] != stepsPerBeat && detents < 0 && at > 0)
        --at, ++detents;                     // between two rates: the first step down lands on the lower
    else if (rates[at] != stepsPerBeat && detents > 0)
        --detents;                           // and the first step up on the higher
    return rates[std::clamp (at + detents, 0, count - 1)];
}

int liveNextMode (int mode, int detents)
{
    return std::clamp (mode + detents, -1, 7);
}

Bytes buildLivePayload (const LiveView& view)
{
    const int steps = std::min (kLiveSteps, (int) view.steps.size());
    const int zones = std::min (kLiveZones, (int) view.zones.size());
    const auto tempo = std::clamp ((int) std::lround (view.tempo * 10.0), 0, 65535);

    Bytes out;
    out.push_back ((std::uint8_t) ((view.arpOn ? 1 : 0) | (view.lane ? 2 : 0)));
    out.push_back (byte (view.mode, 0, 7));
    out.push_back (byte (view.stepsPerBeat, 1, 16));
    out.push_back (byte (view.gate, 0, 100));
    out.push_back (byte (steps));
    out.push_back (byte (view.cursor, 0, std::max (0, steps - 1)));
    out.push_back (view.playing >= 0 && view.playing < steps ? byte (view.playing + 1) : 0);
    out.push_back ((std::uint8_t) (tempo & 0xFF));
    out.push_back ((std::uint8_t) (tempo >> 8));
    out.push_back (byte (view.firstKey, 0, 127 - 48));
    out.push_back (byte (zones));
    out.push_back (view.focused >= 0 && view.focused < zones ? (std::uint8_t) view.focused : 255);
    for (int i = 0; i < steps; ++i)
    {
        const auto& step = view.steps[(std::size_t) i];
        out.push_back (byte (step.velocity, 0, 127));
        out.push_back (byte (step.octave + 2, 0, 4));
        out.push_back (byte (step.ratchet, 1, 4));
        out.push_back (byte (step.chance, 0, 100));
        out.push_back (step.tie ? 1 : 0);
    }
    for (int i = 0; i < zones; ++i)
    {
        const auto& zone = view.zones[(std::size_t) i];
        out.push_back (byte (zone.keyLow, 0, 127));
        out.push_back (byte (zone.keyHigh, 0, 127));
        out.push_back (zone.playable ? 1 : 0);
        appendString (out, zone.name, kLiveNameChars);
    }
    for (const auto* notes : { &view.held, &view.arpNotes })
    {
        const int count = std::min (kLiveNotes, (int) notes->size());
        out.push_back (byte (count));
        for (int i = 0; i < count; ++i)
            out.push_back (byte ((*notes)[(std::size_t) i], 0, 127));
    }
    appendString (out, view.part, kLiveNameChars);
    return out;
}

// --- METERS ---------------------------------------------------------------------------------------

std::uint8_t metersLevelByte (float linear)
{
    if (! (linear > 0.0f))
        return 0;
    const double db = std::isfinite (linear) ? 20.0 * std::log10 ((double) linear) : 6.0;
    if (db < -57.25)
        return 0;
    return byte (1 + (int) std::lround ((std::min (db, 6.0) + 57.0) * 2.0), 1, 127);
}

float metersNudgeVolume (float volume, int detents)
{
    if (detents == 0)
        return volume;
    double db = volume > 0.0f ? 20.0 * std::log10 ((double) volume) : -57.5;
    db = std::min (db + 0.5 * detents, 20.0 * std::log10 (2.0));
    if (db < -57.0)
        return 0.0f;
    return std::clamp ((float) std::pow (10.0, db / 20.0), 0.0f, 2.0f);
}

int metersFirstPart (int parts, int first)
{
    return std::clamp (first, 0, std::max (0, parts - kMetersStrips));
}

Bytes buildMetersPayload (const MetersView& view)
{
    const int count = (int) view.parts.size();
    const int first = metersFirstPart (count, view.first);
    const int strips = std::min (kMetersStrips, count - first);

    Bytes out;
    out.push_back (byte (count));
    out.push_back (byte (first));
    out.push_back (byte (strips));
    out.push_back (view.touched >= 0 && view.touched <= kMetersStrips ? (std::uint8_t) view.touched : 255);
    for (int i = first; i < first + strips; ++i)
    {
        const auto& part = view.parts[(std::size_t) i];
        out.push_back (metersLevelByte (part.left));
        out.push_back (metersLevelByte (part.right));
        out.push_back (metersLevelByte (part.volume));
        out.push_back ((std::uint8_t) ((part.muted ? 1 : 0) | (part.enabled ? 0 : 2)));
        appendString (out, part.name, kMetersNameChars);
    }
    out.push_back (metersLevelByte (view.masterLeft));
    out.push_back (metersLevelByte (view.masterRight));
    out.push_back (metersLevelByte (view.masterVolume));
    return out;
}

Bytes buildChangesPayload (const ChangesView& view)
{
    const int count = (int) view.rows.size();
    const int selected = count == 0 ? 0 : std::clamp (view.selected, 0, count - 1);
    const int first = count <= kChangesRows ? 0 : std::clamp (selected - kChangesRows / 2 + 1, 0, count - kChangesRows);
    const int rows = std::min (kChangesRows, count - first);
    const auto total = std::clamp (view.total, 0, 65535);

    Bytes out;
    out.push_back ((std::uint8_t) view.state);
    out.push_back (byte (count));
    out.push_back (byte (first));
    out.push_back (byte (rows));
    out.push_back (byte (selected));
    out.push_back ((std::uint8_t) (total & 0xFF));
    out.push_back ((std::uint8_t) (total >> 8));
    out.push_back (byte (view.listen, 0, 100));
    out.push_back (byte (view.back));
    out.push_back (byte (view.saves));
    out.push_back (byte (view.putBack));
    appendString (out, view.sound, kSoundcheckNameChars);
    appendString (out, view.against, kSoundcheckNameChars);
    appendString (out, view.when, 16);
    appendString (out, view.problemText, kCueNoteChars, true);
    for (int i = first; i < first + rows; ++i)
    {
        const auto& row = view.rows[(std::size_t) i];
        out.push_back (byte (row.saved, 0, 100));
        out.push_back (byte (row.now, 0, 100));
        appendString (out, row.name, kLayersNameChars);
        appendString (out, row.savedText, 10);
        appendString (out, row.nowText, 10);
    }
    return out;
}

// --- DISCOVER -------------------------------------------------------------------------------------

int discoverFirstRow (int sounds, int selected)
{
    if (sounds <= kDiscoverRows)
        return 0;
    return std::clamp (selected / kDiscoverRows * kDiscoverRows, 0, sounds - 1);
}

Bytes buildDiscoverPayload (const DiscoverView& view)
{
    const int count = (int) view.sounds.size();
    const int selected = count == 0 ? 0 : std::clamp (view.selected, 0, count - 1);
    const int first = discoverFirstRow (count, selected);
    const int rows = std::min (kDiscoverRows, count - first);
    const auto point = [] (Bytes& out, const DiscoverPoint& p)
    {
        out.push_back (byte (p.x, 0, 100));
        out.push_back (byte (p.y, 0, 100));
    };

    Bytes out;
    out.push_back ((std::uint8_t) view.state);
    out.push_back (byte (count));
    out.push_back (byte (first));
    out.push_back (byte (rows));
    out.push_back (byte (selected));
    const auto neverOpened = std::clamp (view.neverOpened, 0, 65535);
    out.push_back ((std::uint8_t) (neverOpened & 0xFF));
    out.push_back ((std::uint8_t) (neverOpened >> 8));
    out.push_back (byte (view.regularsCounted));
    appendString (out, view.kind, kDiscoverKindChars);
    point (out, view.centre);

    for (int i = first; i < first + rows; ++i)
    {
        const auto& sound = view.sounds[(std::size_t) i];
        point (out, sound.at);
        out.push_back (byte (sound.percent, 0, 100));
        out.push_back (sound.kept ? 1 : 0);
        appendString (out, sound.name, kDiscoverNameChars);
        appendString (out, sound.instrument, kDiscoverInstrumentChars);
    }

    appendString (out, view.likeName, kDiscoverNameChars);
    out.push_back (byte (view.likeLoads));

    const auto points = std::min ((int) view.regulars.size(), kDiscoverRegulars);
    out.push_back (byte (points));
    for (int i = 0; i < points; ++i)
        point (out, view.regulars[(std::size_t) i]);
    return out;
}

} // namespace ceditor::ctrl49
