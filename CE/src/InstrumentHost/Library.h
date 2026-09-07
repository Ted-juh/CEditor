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

struct LibraryRecord
{
    juce::String recordId;        // stable, minted once
    juce::String type;            // "preset" | "rack" | "chain"
    juce::String sourceType;      // "vstpreset" | "userState" | "rackCapture" | "chainCapture"
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

struct LibraryQuery
{
    juce::String text;          // the free-text box; same fields searchLibrary() reads
    juce::String type;          // "preset" | "rack" | "chain" | "" for every type
    juce::String collection;    // a user collection the record must name; "" for any

    LibraryFacetSelection categories, tags, instruments, manufacturers, sources;

    bool favouritesOnly = false;
    int  minRating = 0;         // 0 = unrated included
    bool availableOnly = false; // see the availability hook below
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
    void saveTo (const juce::File& file) const;

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
