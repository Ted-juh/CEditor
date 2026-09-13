#pragma once

#include <juce_core/juce_core.h>

#include <functional>

// Library — Hostage's unified preset, instrument and rack library.
//
// One index with explicit record types, never a second host: a record ORCHESTRATES Stage 1
// identities and state (a preset targets a plug-in class and carries or references processor
// state; a rack entry embeds the existing Performance manifest) and loading always goes
// through the rack host's own transaction. The library never instantiates anything itself.
//
// PROVENANCE IS KEPT, not inferred later: every record says whether it came from a vendor
// .vstpreset on disk, a CEditor-captured processor state, or a captured rack — and vendor
// rescans only ever touch vendor-derived fields. User metadata (favourite, rating, notes,
// tags, collections) lives in its own block on the record and survives rescans, renames the
// identity can follow, and even the source disappearing: a missing source marks the record
// unavailable with its reason instead of deleting anybody's favourites (baseline §18.6.5).
//
// juce_core only, JSON through juce::var — the same tier and conventions as PluginCatalog,
// for the same reason: everything here must be provable by a plain test executable.

namespace ceditor::host
{

// -- what a sound measured like ----------------------------------------------------------------
//
// The library's answer to the question a name cannot answer. Every field here was measured from
// one render of the sound itself (SonicProbe.h) rather than read off a vendor's tin, which is the
// whole difference between this browser and the one it succeeds: tags disagree between companies
// because different people typed them, and a spectral centroid does not.
//
// Every measurement is kept twice: normalised 0..1 for the browser's range sliders, and in its own
// unit beside it so the inspector can say what the number means. A slider over "0.34" that cannot
// tell you it means 1.9 kHz is a number nobody can argue with, which is not a virtue.
//
// This is data only — no FFT, no AudioBuffer, no juce_dsp — so Library.h stays in the juce_core
// tier a plain test executable can prove. The measuring lives in SonicProbe.h, which needs the
// audio modules; the two meet at this struct.

/** Points in a record's drawn envelope. Enough for a 190px tile to read as a shape, and small
    enough (48 floats) that carrying one on every record of a 12,000-preset library is nothing. */
inline constexpr int sonicEnvelopePoints = 48;

struct SonicProfile
{
    bool measured = false;
    bool silent = false;          // the probe played the note and nothing came out

    float brightness = 0;         // 0..1 over 120 Hz .. 9 kHz, logarithmic
    float centroidHz = 0;
    float attack = 0;             // 0..1 over 1 ms .. 2 s, logarithmic
    float attackSeconds = 0;
    float tail = 0;               // 0..1 over 50 ms .. 10 s, logarithmic
    float tailSeconds = 0;
    float width = 0;              // 0 mono .. 1 fully decorrelated
    float noisiness = 0;          // 0 tonal .. 1 noise-like
    float dynamics = 0;           // 0..1: how much harder velocity 100 hit than velocity 40
    float peak = 0;               // linear, 0..1
    float cost = 0;               // 0..1 over 0 .. 25% of one core
    float costPercent = 0;
    int   latencySamples = 0;

    juce::Array<float> envelope;  // sonicEnvelopePoints peaks, 0..1 — the tile's waveform
};

/** One part of a captured rack, as it sounded when the rack was saved. Harvested from the
    library record the part was playing, so a rack whose plug-in has since gone can be offered
    the nearest thing you actually own. A part played from nowhere has no profile, and the
    substitution says so rather than guessing at one. */
struct CapturedPart
{
    juce::String partId, pluginCeId, pluginName, presetName;
    SonicProfile sonic;
};

/** How far apart two sounds are, 0 (indistinguishable on these axes) to 1. Weighted, because the
    axes are not equally telling: brightness and attack are what somebody means by "like this
    one", and a peak level is not. Unmeasured profiles are maximally far from everything, so a
    library half-probed never claims a match it cannot support. */
float sonicDistance (const SonicProfile& a, const SonicProfile& b);

/** Per-axis, b minus a on the normalised scale, ordered by how much they disagree — closest
    first. This is what turns a match percentage from a number into a reason: the axes at the
    top agreed, the one at the bottom is what you are giving up. */
struct SonicAxisDelta
{
    juce::String axis;   // "brightness" | "attack" | "tail" | "width" | "noisiness" | "dynamics"
    float delta = 0.0f;
};

juce::Array<SonicAxisDelta> sonicDifferences (const SonicProfile& a, const SonicProfile& b);

// -- keeping more than one of a sound -----------------------------------------------------------
//
// Saving a sound should not be a decision about whether to destroy the old one. Every save is a
// version; the record's current state is the newest of them. That costs a state blob per save —
// eighteen kilobytes for a big synth — which is why the retention rule below exists rather than
// keeping everything forever and hoping.
//
// THE RULE, and it is the real design work in this stage rather than the rail that draws it:
//
//   under 30 days   every save, because that is the window in which you are still working on it
//   under a year    one a day, because after a month what you want is "the one from Tuesday"
//   older           only the ones you named
//
// and on top of that, three are never dropped whatever their age: anything you gave a name to
// (naming it is the whole signal that it matters), the newest (it is the sound), and the one
// marked `origin` (what this was branched from — throwing that away loses the comparison the
// diff exists for).

struct LibraryVersion
{
    juce::String versionId;         // minted once
    juce::String label;             // what you called it; empty for an unnamed save
    juce::int64 savedAtMs = 0;      // juce::Time::currentTimeMillis()
    juce::String stateBlobBase64;   // the state itself
    bool origin = false;            // the state this record was branched from
};

/** Applies the rule above, newest last. Pure and total: the same list in, the same list out. */
juce::Array<LibraryVersion> pruneLibraryVersions (juce::Array<LibraryVersion> versions,
                                                  juce::int64 nowMs);

struct LibraryRecord
{
    juce::String recordId;        // stable, minted once
    juce::String type;            // "preset" | "rack" | "chain"
    juce::String sourceType;      // vendor: "vstpreset" | "nksf" | "fxp" | "spire" | "h2p"; captures/programs below
    juce::String sourceLocator;   // file path for vendor sources; empty for captured state
    juce::String name;
    juce::String manufacturer;
    juce::String instrument;      // display name of the target plug-in (presets)
    juce::String targetCeId;      // the catalogue's stable class identity (presets)
    juce::String category;
    juce::String stateBlobBase64; // captured processor state (userState) — the payload itself
    juce::String rackManifestJson;// captured Performance manifest (rackCapture, chainCapture:
                                  // a chain is a one-part Performance, so it reuses this)
    juce::String classIdHex;      // the .vstpreset's own 32-hex VST3 class id, when known
    juce::String fingerprint;     // content identity for change detection and matching
    bool factory = false;         // vendor-derived (true) vs CEditor-captured (false)
    bool missing = false;         // the source vanished; the record and its metadata stay

    // What it sounded like when the auditioner last played it. Keyed to `fingerprint` by
    // `sonicFingerprint` so a rescan that finds the same bytes never re-renders them.
    SonicProfile sonic;
    juce::String sonicFingerprint;

    // Why the last attempt produced no measurement, when it produced none. "Tried and it did
    // not work" is a different fact from "never tried", and only the first of them should stop
    // the auditioner walking into the same crashing preset on every future run. Cleared by a
    // successful measurement and by asking for everything to be measured again.
    juce::String sonicRefusal;

    // What each part of a captured rack sounded like. Rack records only, and only for parts
    // that were playing something the library knows.
    juce::Array<CapturedPart> parts;

    // Every save of this sound, oldest first. `stateBlobBase64` above is the newest of them —
    // one current state, so nothing that already reads a record has to learn about versions.
    juce::Array<LibraryVersion> versions;
    // The vendor record this was branched from, when it was. A factory preset's versions are
    // yours, not the vendor's, so the first save of one makes a record of your own that
    // remembers where it came from — which is what "41 of 186 parameters differ from factory"
    // is measured against.
    juce::String branchedFromRecordId;

    struct UserMetadata
    {
        bool favourite = false;
        int rating = 0;           // 0 = unrated, else 1..5
        juce::String notes;
        juce::StringArray tags;
        juce::StringArray collections;
    };
    UserMetadata user;
};

// -- browsing: facets, exclusion, and the queries a collection is made of -----------------------
//
// The browser this feeds is a faceted one, and two rules decide everything below.
//
// A CHIP CAN BE REFUSED, not only chosen. The product this succeeds could say "pads" and never
// "pads, but nothing distorted", which is the search a person actually runs when they know what
// they do not want. So every facet carries two lists: `include` is an opinion about what to keep
// (empty means no opinion, and several values are OR'd, because picking Bass and Lead means
// either), `exclude` refuses a record outright whatever else about it matched.
//
// A COUNT MUST PREDICT THE CLICK. The number beside a chip is what you would have if you clicked
// it — which takes two passes rather than one, because the two kinds of chip offer different
// clicks. For an unchosen or chosen value the click adds it to this facet's OR group, so the
// count lifts the facet's KEEP list and leaves its refusals in force. For a refused value the
// click takes the refusal off, so that value alone is counted again with its own refusal lifted.
// Counting inside the current result instead makes every unselected chip in the facet you just
// used read zero, which is true and useless: it says only "you have already filtered by this".

struct LibraryFacetSelection
{
    juce::StringArray include, exclude;

    bool isEmpty() const           { return include.isEmpty() && exclude.isEmpty(); }
    bool admits (const juce::StringArray& values) const;
    bool admits (const juce::String& value) const { juce::StringArray one; one.add (value);
                                                    return admits (one); }
};

/** A measured axis, narrowed. Inactive until somebody moves a handle, because a range that
    defaults to "all of it" would still refuse every record the auditioner has not reached yet. */
struct LibraryRange
{
    float min = 0.0f, max = 1.0f;
    bool active = false;

    bool admits (float value) const { return ! active || (value >= min && value <= max); }
};

struct LibraryQuery
{
    juce::String text;          // the free-text box; same fields searchLibrary() reads
    juce::String type;          // "preset" | "rack" | "chain" | "" for every type
    juce::String collection;    // a user collection the record must name; "" for any

    LibraryFacetSelection categories, tags, instruments, manufacturers, sources;

    bool favouritesOnly = false;
    int  minRating = 0;         // 0 = unrated included
    bool availableOnly = false; // see the availability hook below

    // The measured half. A range that is active refuses anything unmeasured, because an unknown
    // brightness is not a dark one — the browser says how many records that is rather than
    // quietly dropping them.
    LibraryRange brightness, attack, tail, width, cost;
    bool measuredOnly = false;

    /** True when any measured axis is narrowed — what the browser gates its "unmeasured" notice
        on, and what tells the service the analysis is worth offering. */
    bool usesMeasurements() const
    {
        return measuredOnly || brightness.active || attack.active || tail.active
                 || width.active || cost.active;
    }
};

/** Whether a record can be loaded right now. The library itself only knows whether the SOURCE
    vanished (`missing`); whether the plug-in a preset targets is installed is the catalogue's
    business and the service's to answer, so `availableOnly` asks through this rather than
    guessing. Defaults to "the source is still there", which is all a pure test can know. */
using LibraryAvailability = std::function<bool (const LibraryRecord&)>;

/** A saved query — the browser's "smart collection". The rail runs it fresh every time, so a
    record joins one by matching rather than by being filed, and nothing has to be re-filed when
    a sound is retagged. Static collections are the other kind and already exist: they are the
    `collections` list on a record's user block. */
struct SmartCollection
{
    juce::String collectionId;   // stable, minted once
    juce::String name;
    LibraryQuery query;
};

class Library
{
public:
    const juce::Array<LibraryRecord>& allRecords() const      { return records; }

    LibraryRecord* find (const juce::String& recordId);
    const LibraryRecord* find (const juce::String& recordId) const;

    /** Adds a CEditor-captured record (user preset or rack capture): minted id, never
        touched by vendor rescans. Returns the new record id. */
    juce::String addCapturedRecord (LibraryRecord record);

    bool removeRecord (const juce::String& recordId);

    /** Merges one vendor source's freshly scanned records (all of one sourceType). Identity
        matches — same fingerprint, or same sourceLocator when the content changed — keep the
        existing record's id and user block and refresh the vendor-derived fields. Vendor
        records of this sourceType that the scan no longer found are marked missing, never
        deleted; a record that reappears clears the flag. Captured records are untouched.
        A non-empty locatorScope confines the whole merge — matching and missing-marking —
        to records whose sourceLocator starts with it, so one plug-in's program list can be
        refreshed without another plug-in's list being declared missing. */
    void mergeVendorScan (const juce::String& sourceType, juce::Array<LibraryRecord> scanned,
                          const juce::String& locatorScope = {});

    /** Updates only the user block of a record. */
    bool setUserMetadata (const juce::String& recordId, const LibraryRecord::UserMetadata& user);

    const juce::Array<SmartCollection>& allSmartCollections() const { return smartCollections; }

    /** Adds a saved query, or replaces one by id when the id is already known. An empty id is
        minted. Returns the id either way. */
    juce::String putSmartCollection (SmartCollection collection);

    bool removeSmartCollection (const juce::String& collectionId);

    void loadFrom (const juce::File& file);
    bool saveTo (const juce::File& file) const;

    juce::var toVar() const;
    static Library fromVar (const juce::var& stored);

private:
    juce::Array<LibraryRecord> records;
    juce::Array<SmartCollection> smartCollections;
};

/** Case-insensitive text search over name, instrument, manufacturer, category and user tags,
    with optional type filter (""=all). Pure; the WebView and the hardware browse the same
    way (baseline §18.6.10). The LibraryQuery overload below is the same search with the
    facets, the exclusions and the availability hook; this one is it with only two of them. */
juce::Array<const LibraryRecord*> searchLibrary (const Library& library,
                                                 const juce::String& query,
                                                 const juce::String& type = {});

/** Everything the query keeps, in library order. */
juce::Array<const LibraryRecord*> searchLibrary (const Library& library,
                                                 const LibraryQuery& query,
                                                 const LibraryAvailability& isAvailable = {});

struct LibraryFacetValue
{
    juce::String value;
    int count = 0;
    bool selected = false;   // in the facet's include list
    bool excluded = false;   // in its exclude list
};

/** One list per facet, ordered by count descending then value, with a selected or excluded
    value always present even when nothing would match it — a chip you cannot see is a filter
    you cannot take off. */
struct LibraryFacets
{
    juce::Array<LibraryFacetValue> types, categories, tags, instruments, manufacturers, sources;
};

LibraryFacets libraryFacets (const Library& library, const LibraryQuery& query,
                             const LibraryAvailability& isAvailable = {});

juce::var libraryQueryToVar (const LibraryQuery& query);
LibraryQuery libraryQueryFromVar (const juce::var& stored);

/** A set of records that are the same sound. Folding these is the single most-asked-for thing
    about a big preset library, and the reason it is worth being careful: forty plug-ins each
    shipping an "Init" is forty DIFFERENT sounds with one name, and folding those would lose
    thirty-nine of them. So a set is only ever

      - the same bytes: identical, non-empty `fingerprint` — certainly one file, copied; or
      - the same name, the same target plug-in, and a measured distance under `tolerance` —
        the same preset saved twice, edited trivially or re-exported.

    Two records from different plug-ins are never folded, however alike they measure. */
struct LibraryDuplicateSet
{
    juce::String keyRecordId;      // the one to keep: whichever carries user metadata
    juce::StringArray recordIds;   // every member, the key included
    bool identical = false;        // matched on fingerprint rather than on measurement
};

juce::Array<LibraryDuplicateSet> libraryDuplicates (const Library& library,
                                                    float tolerance = 0.04f);

/** One candidate, and how close it is. */
struct SoundMatch
{
    const LibraryRecord* record = nullptr;
    float distance = 1.0f;
};

/** The closest measured sounds to a profile, nearest first. Unmeasured records are never
    offered — an unmeasured profile is maximally far from everything, which is the honest answer
    rather than a false match — and `excludeRecordId` keeps a sound off its own list.

    This one function is three features: "sounds like" in the inspector, the nearest dot on the
    map, and the substitute for a plug-in you no longer have. They differ only in what they ask
    about and how the answer is drawn. */
juce::Array<SoundMatch> nearestSounds (const Library& library, const SonicProfile& to, int count,
                                       const LibraryAvailability& isAvailable = {},
                                       const juce::String& excludeRecordId = {});


// -- the .vstpreset container ------------------------------------------------------------------
// Steinberg's preset file: 'VST3' magic, a version word, the 32-character ASCII class id of
// the plug-in the preset belongs to, then chunked data the plug-in itself understands. The
// header is all the library needs for indexing — application goes through the format's own
// loader at load time, which re-validates everything.

struct VstPresetHeader
{
    bool valid = false;
    juce::String classIdHex;   // 32 uppercase hex characters
};

VstPresetHeader parseVstPresetHeader (const void* data, size_t size);

} // namespace ceditor::host
