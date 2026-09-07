#include "Library.h"

#include <algorithm>
#include <cstring>
#include <limits>
#include <map>
#include <utility>

namespace ceditor::host
{

LibraryRecord* Library::find (const juce::String& recordId)
{
    for (auto& record : records)
        if (record.recordId == recordId)
            return &record;
    return nullptr;
}

const LibraryRecord* Library::find (const juce::String& recordId) const
{
    return const_cast<Library*> (this)->find (recordId);
}

juce::String Library::addCapturedRecord (LibraryRecord record)
{
    record.recordId = juce::Uuid().toDashedString();
    record.factory = false;
    record.missing = false;
    const auto id = record.recordId;
    records.add (std::move (record));
    return id;
}

bool Library::removeRecord (const juce::String& recordId)
{
    for (int i = 0; i < records.size(); ++i)
        if (records.getReference (i).recordId == recordId)
        {
            records.remove (i);
            return true;
        }
    return false;
}

juce::String Library::putSmartCollection (SmartCollection collection)
{
    if (collection.collectionId.isEmpty())
        collection.collectionId = juce::Uuid().toDashedString();

    for (auto& existing : smartCollections)
        if (existing.collectionId == collection.collectionId)
        {
            const auto id = collection.collectionId;
            existing = std::move (collection);
            return id;
        }

    const auto id = collection.collectionId;
    smartCollections.add (std::move (collection));
    return id;
}

bool Library::removeSmartCollection (const juce::String& collectionId)
{
    for (int i = 0; i < smartCollections.size(); ++i)
        if (smartCollections.getReference (i).collectionId == collectionId)
        {
            smartCollections.remove (i);
            return true;
        }
    return false;
}

void Library::mergeVendorScan (const juce::String& sourceType, juce::Array<LibraryRecord> scanned,
                               const juce::String& locatorScope)
{
    // Three-pass identity match, and the first pass is what keeps twins honest. Two files
    // with identical bytes have identical fingerprints — not a corner case: a user who copies
    // a preset into a second folder has made one — and a fingerprint-first claim then hands
    // whichever record the filesystem happens to list first to whichever file arrives first.
    // That is how a rescan on NTFS stole a missing record's identity while the same code
    // passed on ext4: the outcome depended on directory enumeration order (§18.6.6 — identity
    // is fingerprint AND source, never either alone).
    //
    //   1. Same content at its own path — a file that has not moved claims itself.
    //   2. Same content elsewhere      — a renamed or moved file keeps its record, preferring
    //                                    a record that was PRESENT until now: after pass 1,
    //                                    an unclaimed present record is one whose file
    //                                    vanished in this very scan, which is exactly what a
    //                                    rename looks like. A long-missing twin is the rename
    //                                    candidate of last resort, not the first.
    //   3. Same path, changed content  — an edited file keeps its record.
    //
    // Anything unmatched is genuinely new.
    juce::Array<LibraryRecord*> existing;
    for (auto& record : records)
        if (record.sourceType == sourceType
            && (locatorScope.isEmpty() || record.sourceLocator.startsWith (locatorScope)))
            existing.add (&record);

    juce::Array<bool> matched;
    matched.insertMultiple (0, false, existing.size());

    const auto claim = [&] (LibraryRecord& incoming, auto predicate) -> bool
    {
        for (int i = 0; i < existing.size(); ++i)
        {
            if (matched[i] || ! predicate (*existing[i]))
                continue;

            // A rescan refreshes what the VENDOR says and nothing else. Everything CEditor or
            // the user put on the record outlives it — the same rule §18.6.5 states for
            // favourites, and for the same reason: a rescan is not an event that should be able
            // to destroy work. The measurements cost an hour of listening, the saves are
            // somebody's history, and the captured parts are what a substitution is computed
            // from; all three used to go silently when a plug-in was simply loaded again.
            auto& record = *existing[i];
            const auto keepId = record.recordId;
            const auto keepUser = record.user;
            const auto keepSonic = record.sonic;
            const auto keepSonicFingerprint = record.sonicFingerprint;
            const auto keepSonicRefusal = record.sonicRefusal;
            const auto keepVersions = record.versions;
            const auto keepBranchedFrom = record.branchedFromRecordId;
            const auto keepParts = record.parts;
            record = incoming;
            record.recordId = keepId;
            record.user = keepUser;
            record.sonic = keepSonic;
            record.sonicFingerprint = keepSonicFingerprint;
            record.sonicRefusal = keepSonicRefusal;
            record.versions = keepVersions;
            record.branchedFromRecordId = keepBranchedFrom;
            record.parts = keepParts;
            record.missing = false;
            matched.set (i, true);
            return true;
        }
        return false;
    };

    // Pass 1 runs over EVERY incoming file before pass 2 sees any of them, deliberately:
    // per-file cascading would let an early arrival take a later file's record by fingerprint
    // before that file had the chance to claim itself by path.
    juce::Array<LibraryRecord*> pending;
    for (auto& incoming : scanned)
        if (! claim (incoming, [&] (const LibraryRecord& r) { return r.fingerprint == incoming.fingerprint
                                                                  && r.sourceLocator.isNotEmpty()
                                                                  && r.sourceLocator == incoming.sourceLocator; }))
            pending.add (&incoming);

    juce::Array<LibraryRecord> fresh;
    for (auto* incomingPtr : pending)
    {
        auto& incoming = *incomingPtr;
        if (claim (incoming, [&] (const LibraryRecord& r) { return r.fingerprint == incoming.fingerprint
                                                                 && ! r.missing; }))
            continue;
        if (claim (incoming, [&] (const LibraryRecord& r) { return r.fingerprint == incoming.fingerprint; }))
            continue;
        if (claim (incoming, [&] (const LibraryRecord& r) { return r.sourceLocator.isNotEmpty()
                                                                && r.sourceLocator == incoming.sourceLocator; }))
            continue;

        incoming.recordId = juce::Uuid().toDashedString();
        incoming.missing = false;
        fresh.add (std::move (incoming));
    }

    // Unclaimed vendor records lost their source: marked, kept, repairable — favourites and
    // notes are the user's, not the rescan's (baseline §18.6.5).
    for (int i = 0; i < existing.size(); ++i)
        if (! matched[i])
            existing[i]->missing = true;

    for (auto& record : fresh)
        records.add (std::move (record));
}

bool Library::setUserMetadata (const juce::String& recordId, const LibraryRecord::UserMetadata& user)
{
    if (auto* record = find (recordId))
    {
        record->user = user;
        return true;
    }
    return false;
}

juce::var Library::toVar() const
{
    juce::Array<juce::var> recordVars;
    for (const auto& record : records)
    {
        auto* u = new juce::DynamicObject();
        u->setProperty ("favourite",   record.user.favourite);
        u->setProperty ("rating",      record.user.rating);
        u->setProperty ("notes",       record.user.notes);
        u->setProperty ("tags",        [&] { juce::Array<juce::var> a;
                                             for (const auto& t : record.user.tags) a.add (t);
                                             return a; }());
        u->setProperty ("collections", [&] { juce::Array<juce::var> a;
                                             for (const auto& c : record.user.collections) a.add (c);
                                             return a; }());

        auto* r = new juce::DynamicObject();
        r->setProperty ("recordId",        record.recordId);
        r->setProperty ("type",            record.type);
        r->setProperty ("sourceType",      record.sourceType);
        r->setProperty ("sourceLocator",   record.sourceLocator);
        r->setProperty ("name",            record.name);
        r->setProperty ("manufacturer",    record.manufacturer);
        r->setProperty ("instrument",      record.instrument);
        r->setProperty ("targetCeId",      record.targetCeId);
        r->setProperty ("category",        record.category);
        r->setProperty ("stateBlob",       record.stateBlobBase64);
        r->setProperty ("rackManifest",    record.rackManifestJson);
        r->setProperty ("classIdHex",      record.classIdHex);
        r->setProperty ("fingerprint",     record.fingerprint);
        r->setProperty ("factory",         record.factory);
        r->setProperty ("missing",         record.missing);
        r->setProperty ("user",            juce::var (u));

        if (record.sonic.measured)
        {
            auto* m = new juce::DynamicObject();
            m->setProperty ("silent",     record.sonic.silent);
            m->setProperty ("brightness", record.sonic.brightness);
            m->setProperty ("centroidHz", record.sonic.centroidHz);
            m->setProperty ("attack",     record.sonic.attack);
            m->setProperty ("attackSeconds", record.sonic.attackSeconds);
            m->setProperty ("tail",       record.sonic.tail);
            m->setProperty ("tailSeconds", record.sonic.tailSeconds);
            m->setProperty ("width",      record.sonic.width);
            m->setProperty ("noisiness",  record.sonic.noisiness);
            m->setProperty ("dynamics",   record.sonic.dynamics);
            m->setProperty ("peak",       record.sonic.peak);
            m->setProperty ("cost",       record.sonic.cost);
            m->setProperty ("costPercent", record.sonic.costPercent);
            m->setProperty ("latencySamples", record.sonic.latencySamples);
            m->setProperty ("envelope", [&record] { juce::Array<juce::var> a;
                                                    for (auto v : record.sonic.envelope) a.add (v);
                                                    return a; }());
            r->setProperty ("sonic", juce::var (m));
        }

        // Outside the block above on purpose: this is the fingerprint of the last ATTEMPT, and
        // an attempt that produced no measurement is exactly the case that has to be
        // remembered — otherwise the auditioner walks into the same crashing preset every run.
        if (record.sonicFingerprint.isNotEmpty())
            r->setProperty ("sonicFingerprint", record.sonicFingerprint);
        if (record.sonicRefusal.isNotEmpty())
            r->setProperty ("sonicRefusal", record.sonicRefusal);

        if (! record.versions.isEmpty())
        {
            juce::Array<juce::var> versionVars;
            for (const auto& version : record.versions)
            {
                auto* v = new juce::DynamicObject();
                v->setProperty ("versionId", version.versionId);
                v->setProperty ("label",     version.label);
                v->setProperty ("savedAtMs", version.savedAtMs);
                v->setProperty ("stateBlob", version.stateBlobBase64);
                v->setProperty ("origin",    version.origin);
                versionVars.add (juce::var (v));
            }
            r->setProperty ("versions", versionVars);
        }
        if (record.branchedFromRecordId.isNotEmpty())
            r->setProperty ("branchedFrom", record.branchedFromRecordId);

        if (! record.parts.isEmpty())
        {
            juce::Array<juce::var> partVars;
            for (const auto& part : record.parts)
            {
                auto* pv = new juce::DynamicObject();
                pv->setProperty ("partId",     part.partId);
                pv->setProperty ("pluginCeId", part.pluginCeId);
                pv->setProperty ("pluginName", part.pluginName);
                pv->setProperty ("presetName", part.presetName);
                if (part.sonic.measured)
                {
                    auto* m = new juce::DynamicObject();
                    m->setProperty ("brightness", part.sonic.brightness);
                    m->setProperty ("attack",     part.sonic.attack);
                    m->setProperty ("tail",       part.sonic.tail);
                    m->setProperty ("width",      part.sonic.width);
                    m->setProperty ("noisiness",  part.sonic.noisiness);
                    m->setProperty ("dynamics",   part.sonic.dynamics);
                    pv->setProperty ("sonic", juce::var (m));
                }
                partVars.add (juce::var (pv));
            }
            r->setProperty ("parts", partVars);
        }
        recordVars.add (juce::var (r));
    }

    juce::Array<juce::var> collectionVars;
    for (const auto& collection : smartCollections)
    {
        auto* c = new juce::DynamicObject();
        c->setProperty ("collectionId", collection.collectionId);
        c->setProperty ("name",         collection.name);
        c->setProperty ("query",        libraryQueryToVar (collection.query));
        collectionVars.add (juce::var (c));
    }

    auto* root = new juce::DynamicObject();
    root->setProperty ("records", recordVars);
    root->setProperty ("smartCollections", collectionVars);
    return juce::var (root);
}

Library Library::fromVar (const juce::var& stored)
{
    Library library;

    if (const auto* collections = stored.getProperty ("smartCollections", {}).getArray())
        for (const auto& c : *collections)
        {
            SmartCollection collection;
            collection.collectionId = c.getProperty ("collectionId", {}).toString();
            collection.name         = c.getProperty ("name", {}).toString();
            collection.query        = libraryQueryFromVar (c.getProperty ("query", {}));
            if (collection.collectionId.isNotEmpty())
                library.smartCollections.add (std::move (collection));
        }

    const auto* array = stored.getProperty ("records", {}).getArray();
    if (array == nullptr)
        return library;

    for (const auto& r : *array)
    {
        LibraryRecord record;
        record.recordId = r.getProperty ("recordId", {}).toString();
        if (record.recordId.isEmpty())
            continue;   // damaged row; keep loading the rest

        record.type            = r.getProperty ("type", {}).toString();
        record.sourceType      = r.getProperty ("sourceType", {}).toString();
        record.sourceLocator   = r.getProperty ("sourceLocator", {}).toString();
        record.name            = r.getProperty ("name", {}).toString();
        record.manufacturer    = r.getProperty ("manufacturer", {}).toString();
        record.instrument      = r.getProperty ("instrument", {}).toString();
        record.targetCeId      = r.getProperty ("targetCeId", {}).toString();
        record.category        = r.getProperty ("category", {}).toString();
        record.stateBlobBase64 = r.getProperty ("stateBlob", {}).toString();
        record.rackManifestJson= r.getProperty ("rackManifest", {}).toString();
        record.classIdHex      = r.getProperty ("classIdHex", {}).toString();
        record.fingerprint     = r.getProperty ("fingerprint", {}).toString();
        record.factory         = (bool) r.getProperty ("factory", false);
        record.missing         = (bool) r.getProperty ("missing", false);

        if (const auto m = r.getProperty ("sonic", {}); m.isObject())
        {
            auto& sonic = record.sonic;
            sonic.measured   = true;
            sonic.silent     = (bool) m.getProperty ("silent", false);
            sonic.brightness = (float) (double) m.getProperty ("brightness", 0.0);
            sonic.centroidHz = (float) (double) m.getProperty ("centroidHz", 0.0);
            sonic.attack     = (float) (double) m.getProperty ("attack", 0.0);
            sonic.attackSeconds = (float) (double) m.getProperty ("attackSeconds", 0.0);
            sonic.tail       = (float) (double) m.getProperty ("tail", 0.0);
            sonic.tailSeconds = (float) (double) m.getProperty ("tailSeconds", 0.0);
            sonic.width      = (float) (double) m.getProperty ("width", 0.0);
            sonic.noisiness  = (float) (double) m.getProperty ("noisiness", 0.0);
            sonic.dynamics   = (float) (double) m.getProperty ("dynamics", 0.0);
            sonic.peak       = (float) (double) m.getProperty ("peak", 0.0);
            sonic.cost       = (float) (double) m.getProperty ("cost", 0.0);
            sonic.costPercent = (float) (double) m.getProperty ("costPercent", 0.0);
            sonic.latencySamples = (int) m.getProperty ("latencySamples", 0);
            if (const auto* envelope = m.getProperty ("envelope", {}).getArray())
                for (const auto& v : *envelope)
                    sonic.envelope.add (juce::jlimit (0.0f, 1.0f, (float) (double) v));
        }

        record.sonicFingerprint = r.getProperty ("sonicFingerprint", {}).toString();
        record.sonicRefusal     = r.getProperty ("sonicRefusal", {}).toString();

        if (const auto* stored = r.getProperty ("versions", {}).getArray())
            for (const auto& v : *stored)
            {
                LibraryVersion version;
                version.versionId = v.getProperty ("versionId", {}).toString();
                version.label = v.getProperty ("label", {}).toString();
                version.savedAtMs = (juce::int64) (double) v.getProperty ("savedAtMs", 0.0);
                version.stateBlobBase64 = v.getProperty ("stateBlob", {}).toString();
                version.origin = (bool) v.getProperty ("origin", false);
                if (version.versionId.isNotEmpty())
                    record.versions.add (std::move (version));
            }
        record.branchedFromRecordId = r.getProperty ("branchedFrom", {}).toString();

        if (const auto* storedParts = r.getProperty ("parts", {}).getArray())
            for (const auto& pv : *storedParts)
            {
                CapturedPart part;
                part.partId     = pv.getProperty ("partId", {}).toString();
                part.pluginCeId = pv.getProperty ("pluginCeId", {}).toString();
                part.pluginName = pv.getProperty ("pluginName", {}).toString();
                part.presetName = pv.getProperty ("presetName", {}).toString();
                if (const auto m = pv.getProperty ("sonic", {}); m.isObject())
                {
                    part.sonic.measured   = true;
                    part.sonic.brightness = (float) (double) m.getProperty ("brightness", 0.0);
                    part.sonic.attack     = (float) (double) m.getProperty ("attack", 0.0);
                    part.sonic.tail       = (float) (double) m.getProperty ("tail", 0.0);
                    part.sonic.width      = (float) (double) m.getProperty ("width", 0.0);
                    part.sonic.noisiness  = (float) (double) m.getProperty ("noisiness", 0.0);
                    part.sonic.dynamics   = (float) (double) m.getProperty ("dynamics", 0.0);
                }
                record.parts.add (std::move (part));
            }

        const auto u = r.getProperty ("user", {});
        record.user.favourite = (bool) u.getProperty ("favourite", false);
        record.user.rating    = juce::jlimit (0, 5, (int) u.getProperty ("rating", 0));
        record.user.notes     = u.getProperty ("notes", {}).toString();
        if (const auto* tags = u.getProperty ("tags", {}).getArray())
            for (const auto& t : *tags)
                record.user.tags.add (t.toString());
        if (const auto* collections = u.getProperty ("collections", {}).getArray())
            for (const auto& c : *collections)
                record.user.collections.add (c.toString());

        library.records.add (std::move (record));
    }

    return library;
}

void Library::loadFrom (const juce::File& file)
{
    *this = fromVar (juce::JSON::parse (file.loadFileAsString()));
}

void Library::saveTo (const juce::File& file) const
{
    file.getParentDirectory().createDirectory();
    file.replaceWithText (juce::JSON::toString (toVar()));
}

juce::Array<const LibraryRecord*> searchLibrary (const Library& library,
                                                 const juce::String& query,
                                                 const juce::String& type)
{
    const auto q = query.trim().toLowerCase();
    juce::Array<const LibraryRecord*> out;

    for (const auto& record : library.allRecords())
    {
        if (type.isNotEmpty() && record.type != type)
            continue;

        if (q.isNotEmpty())
        {
            const auto matches = record.name.toLowerCase().contains (q)
                              || record.instrument.toLowerCase().contains (q)
                              || record.manufacturer.toLowerCase().contains (q)
                              || record.category.toLowerCase().contains (q)
                              || [&] { for (const auto& tag : record.user.tags)
                                           if (tag.toLowerCase().contains (q)) return true;
                                       return false; }();
            if (! matches)
                continue;
        }

        out.add (&record);
    }

    return out;
}

juce::Array<LibraryVersion> pruneLibraryVersions (juce::Array<LibraryVersion> versions,
                                                  juce::int64 nowMs)
{
    if (versions.size() < 2)
        return versions;

    // Oldest first, so "the newest" is the last and one-a-day keeps the last of each day.
    std::stable_sort (versions.begin(), versions.end(),
                      [] (const LibraryVersion& a, const LibraryVersion& b)
                      { return a.savedAtMs < b.savedAtMs; });

    constexpr juce::int64 day = 24ll * 60 * 60 * 1000;
    const auto recent = nowMs - 30 * day;
    const auto ancient = nowMs - 365 * day;

    juce::Array<LibraryVersion> kept;
    juce::int64 lastKeptDay = std::numeric_limits<juce::int64>::min();

    for (int i = 0; i < versions.size(); ++i)
    {
        const auto& version = versions.getReference (i);
        const auto isNewest = (i == versions.size() - 1);

        // Never dropped, whatever their age: named, newest, and the origin the diff measures
        // everything against.
        if (isNewest || version.origin || version.label.isNotEmpty())
        {
            kept.add (version);
            lastKeptDay = version.savedAtMs / day;
            continue;
        }

        if (version.savedAtMs >= recent)
        {
            kept.add (version);
            lastKeptDay = version.savedAtMs / day;
            continue;
        }

        if (version.savedAtMs < ancient)
            continue;   // older than a year and unnamed

        // One a day. Sorted oldest first, so this keeps the LAST save of each day — the one you
        // finished on rather than the one you started with.
        const auto thisDay = version.savedAtMs / day;
        const auto nextIsSameDay = i + 1 < versions.size()
                                     && versions.getReference (i + 1).savedAtMs / day == thisDay;
        if (nextIsSameDay)
            continue;

        if (thisDay != lastKeptDay)
        {
            kept.add (version);
            lastKeptDay = thisDay;
        }
    }

    return kept;
}

float sonicDistance (const SonicProfile& a, const SonicProfile& b)
{
    // Nothing to compare is not "identical", and saying so is what keeps a half-probed library
    // from claiming matches it cannot support.
    if (! a.measured || ! b.measured)
        return 1.0f;

    // Weighted, because the axes are not equally telling. Brightness and attack are most of what
    // somebody means by "like this one"; how loud it happened to be is not.
    const std::pair<float, float> axes[] {
        { a.brightness - b.brightness, 1.00f },
        { a.attack     - b.attack,     0.85f },
        { a.tail       - b.tail,       0.55f },
        { a.width      - b.width,      0.40f },
        { a.noisiness  - b.noisiness,  0.45f },
        { a.dynamics   - b.dynamics,   0.25f },
    };

    float sum = 0.0f, weights = 0.0f;
    for (const auto& [delta, weight] : axes)
    {
        sum += weight * delta * delta;
        weights += weight;
    }

    return juce::jlimit (0.0f, 1.0f, std::sqrt (sum / weights));
}

juce::Array<SonicAxisDelta> sonicDifferences (const SonicProfile& a, const SonicProfile& b)
{
    juce::Array<SonicAxisDelta> out;
    out.add ({ "brightness", b.brightness - a.brightness });
    out.add ({ "attack",     b.attack     - a.attack });
    out.add ({ "tail",       b.tail       - a.tail });
    out.add ({ "width",      b.width      - a.width });
    out.add ({ "noisiness",  b.noisiness  - a.noisiness });
    out.add ({ "dynamics",   b.dynamics   - a.dynamics });

    std::stable_sort (out.begin(), out.end(),
                      [] (const SonicAxisDelta& x, const SonicAxisDelta& y)
                      { return std::abs (x.delta) < std::abs (y.delta); });
    return out;
}

juce::Array<SoundMatch> nearestSounds (const Library& library, const SonicProfile& to, int count,
                                       const LibraryAvailability& isAvailable,
                                       const juce::String& excludeRecordId)
{
    juce::Array<SoundMatch> matches;
    if (! to.measured || count <= 0)
        return matches;

    for (const auto& record : library.allRecords())
    {
        if (record.recordId == excludeRecordId || ! record.sonic.measured || record.sonic.silent)
            continue;

        // Offering something that cannot be loaded is worse than offering nothing: the whole
        // point of a substitute is that you can play it now.
        const auto available = isAvailable ? isAvailable (record) : ! record.missing;
        if (! available)
            continue;

        matches.add ({ &record, sonicDistance (to, record.sonic) });
    }

    std::stable_sort (matches.begin(), matches.end(),
                      [] (const SoundMatch& x, const SoundMatch& y)
                      { return x.distance < y.distance; });

    if (matches.size() > count)
        matches.removeRange (count, matches.size() - count);
    return matches;
}

bool LibraryFacetSelection::admits (const juce::StringArray& values) const
{
    for (const auto& value : values)
        if (exclude.contains (value, true))
            return false;

    if (include.isEmpty())
        return true;

    for (const auto& value : values)
        if (include.contains (value, true))
            return true;

    return false;
}

namespace
{

/** The record's values for one facet. A record has exactly one category, instrument,
    manufacturer, source type and record type, and any number of tags — so the facet test is
    written once against an array and the single-valued facets pass an array of one. */
juce::StringArray facetValues (const LibraryRecord& record, const juce::String& facet)
{
    juce::StringArray values;
    if (facet == "tags")               values = record.user.tags;
    else if (facet == "categories")    values.add (record.category);
    else if (facet == "instruments")   values.add (record.instrument);
    else if (facet == "manufacturers") values.add (record.manufacturer);
    else if (facet == "sources")       values.add (record.sourceType);
    else if (facet == "types")         values.add (record.type);

    values.removeEmptyStrings();
    values.removeDuplicates (true);
    return values;
}

bool matchesText (const LibraryRecord& record, const juce::String& lowered)
{
    if (lowered.isEmpty())
        return true;

    if (record.name.toLowerCase().contains (lowered)
        || record.instrument.toLowerCase().contains (lowered)
        || record.manufacturer.toLowerCase().contains (lowered)
        || record.category.toLowerCase().contains (lowered))
        return true;

    for (const auto& tag : record.user.tags)
        if (tag.toLowerCase().contains (lowered))
            return true;

    return false;
}

/** One record against one query. */
bool matchesQuery (const LibraryRecord& record, const LibraryQuery& query,
                   const juce::String& lowered, const LibraryAvailability& isAvailable)
{
    if (query.type.isNotEmpty() && record.type != query.type)
        return false;

    if (query.favouritesOnly && ! record.user.favourite)
        return false;

    if (query.minRating > 0 && record.user.rating < query.minRating)
        return false;

    if (query.collection.isNotEmpty() && ! record.user.collections.contains (query.collection, true))
        return false;

    if (query.availableOnly)
    {
        const auto available = isAvailable ? isAvailable (record) : ! record.missing;
        if (! available)
            return false;
    }

    // The measured half. An active range refuses anything the auditioner has not reached, because
    // an unknown brightness is not a dark one.
    if (query.measuredOnly && ! record.sonic.measured)
        return false;

    const std::pair<const LibraryRange*, float> ranges[] {
        { &query.brightness, record.sonic.brightness },
        { &query.attack,     record.sonic.attack },
        { &query.tail,       record.sonic.tail },
        { &query.width,      record.sonic.width },
        { &query.cost,       record.sonic.cost },
    };

    for (const auto& [range, value] : ranges)
        if (range->active && ! (record.sonic.measured && range->admits (value)))
            return false;

    const std::pair<const char*, const LibraryFacetSelection*> facets[] {
        { "categories",    &query.categories },
        { "tags",          &query.tags },
        { "instruments",   &query.instruments },
        { "manufacturers", &query.manufacturers },
        { "sources",       &query.sources },
    };

    for (const auto& [name, selection] : facets)
        if (! selection->admits (facetValues (record, name)))
            return false;

    return matchesText (record, lowered);
}

/** The facet's own selection inside a query, so a pass can lift it. The type facet is the odd
    one out — its selection is the query's own `type` field rather than a facet — and returns
    null, which the caller reads as "clear the type instead". */
LibraryFacetSelection* selectionFor (LibraryQuery& query, const juce::String& facet)
{
    if (facet == "categories")    return &query.categories;
    if (facet == "tags")          return &query.tags;
    if (facet == "instruments")   return &query.instruments;
    if (facet == "manufacturers") return &query.manufacturers;
    if (facet == "sources")       return &query.sources;
    return nullptr;
}

void tally (juce::Array<LibraryFacetValue>& into, const Library& library,
            const LibraryQuery& query, const juce::String& lowered,
            const LibraryAvailability& isAvailable, const juce::String& facet,
            const LibraryFacetSelection& selection)
{
    // The base pass lifts this facet's KEEP list and leaves its refusals in force, because
    // clicking an unchosen chip adds it to the OR group and changes nothing else. A count
    // taken this way is exactly what that click would give you.
    auto base = query;
    if (auto* own = selectionFor (base, facet))
        own->include.clear();
    else
        base.type = {};

    std::map<juce::String, int> counts;
    for (const auto& value : selection.include)
        counts[value];

    for (const auto& record : library.allRecords())
        if (matchesQuery (record, base, lowered, isAvailable))
            for (const auto& value : facetValues (record, facet))
                ++counts[value];

    // A refused value counts nothing in that pass, by construction — and zero is not what its
    // chip offers. The click a refused chip offers is "take the refusal off", so its number is
    // what THAT would give you, and it gets a pass of its own. There are only ever a handful.
    for (const auto& refused : selection.exclude)
    {
        auto lifted = base;
        if (auto* own = selectionFor (lifted, facet))
            own->exclude.removeString (refused);

        int count = 0;
        for (const auto& record : library.allRecords())
            if (matchesQuery (record, lifted, lowered, isAvailable)
                && facetValues (record, facet).contains (refused, true))
                ++count;

        counts[refused] = count;
    }

    for (const auto& [value, count] : counts)
        into.add ({ value, count, selection.include.contains (value, true),
                    selection.exclude.contains (value, true) });

    // Most first, then alphabetically, so the list is stable while you type.
    std::stable_sort (into.begin(), into.end(),
                      [] (const LibraryFacetValue& a, const LibraryFacetValue& b)
                      {
                          if (a.count != b.count) return a.count > b.count;
                          return a.value.compareIgnoreCase (b.value) < 0;
                      });
}

juce::var selectionToVar (const LibraryFacetSelection& selection)
{
    auto toArray = [] (const juce::StringArray& values)
    {
        juce::Array<juce::var> out;
        for (const auto& value : values) out.add (value);
        return out;
    };

    auto* o = new juce::DynamicObject();
    o->setProperty ("include", toArray (selection.include));
    o->setProperty ("exclude", toArray (selection.exclude));
    return juce::var (o);
}

LibraryFacetSelection selectionFromVar (const juce::var& stored)
{
    LibraryFacetSelection selection;
    auto read = [&stored] (const char* key, juce::StringArray& into)
    {
        if (const auto* array = stored.getProperty (key, {}).getArray())
            for (const auto& value : *array)
            {
                const auto text = value.toString();
                if (text.isNotEmpty())
                    into.addIfNotAlreadyThere (text);
            }
    };
    read ("include", selection.include);
    read ("exclude", selection.exclude);
    return selection;
}

} // namespace

juce::Array<const LibraryRecord*> searchLibrary (const Library& library, const LibraryQuery& query,
                                                 const LibraryAvailability& isAvailable)
{
    const auto lowered = query.text.trim().toLowerCase();
    juce::Array<const LibraryRecord*> out;

    for (const auto& record : library.allRecords())
        if (matchesQuery (record, query, lowered, isAvailable))
            out.add (&record);

    return out;
}

LibraryFacets libraryFacets (const Library& library, const LibraryQuery& query,
                             const LibraryAvailability& isAvailable)
{
    const auto lowered = query.text.trim().toLowerCase();
    LibraryFacets facets;

    // The type facet's selection is the query's own `type` field; tally() knows to lift that
    // one rather than a facet, so it only needs telling what is currently chosen.
    LibraryFacetSelection typeSelection;
    if (query.type.isNotEmpty())
        typeSelection.include.add (query.type);
    tally (facets.types, library, query, lowered, isAvailable, "types", typeSelection);

    tally (facets.categories,    library, query, lowered, isAvailable, "categories",    query.categories);
    tally (facets.tags,          library, query, lowered, isAvailable, "tags",          query.tags);
    tally (facets.instruments,   library, query, lowered, isAvailable, "instruments",   query.instruments);
    tally (facets.manufacturers, library, query, lowered, isAvailable, "manufacturers", query.manufacturers);
    tally (facets.sources,       library, query, lowered, isAvailable, "sources",       query.sources);
    return facets;
}

juce::var libraryQueryToVar (const LibraryQuery& query)
{
    auto* facets = new juce::DynamicObject();
    facets->setProperty ("categories",    selectionToVar (query.categories));
    facets->setProperty ("tags",          selectionToVar (query.tags));
    facets->setProperty ("instruments",   selectionToVar (query.instruments));
    facets->setProperty ("manufacturers", selectionToVar (query.manufacturers));
    facets->setProperty ("sources",       selectionToVar (query.sources));

    auto* o = new juce::DynamicObject();
    o->setProperty ("text",           query.text);
    o->setProperty ("type",           query.type);
    o->setProperty ("collection",     query.collection);
    o->setProperty ("favouritesOnly", query.favouritesOnly);
    o->setProperty ("minRating",      query.minRating);
    o->setProperty ("availableOnly",  query.availableOnly);
    o->setProperty ("measuredOnly",   query.measuredOnly);
    o->setProperty ("facets",         juce::var (facets));

    auto* ranges = new juce::DynamicObject();
    const std::pair<const char*, const LibraryRange*> named[] {
        { "brightness", &query.brightness }, { "attack", &query.attack },
        { "tail", &query.tail }, { "width", &query.width }, { "cost", &query.cost },
    };
    for (const auto& [name, range] : named)
    {
        auto* r = new juce::DynamicObject();
        r->setProperty ("min",    range->min);
        r->setProperty ("max",    range->max);
        r->setProperty ("active", range->active);
        ranges->setProperty (name, juce::var (r));
    }
    o->setProperty ("ranges", juce::var (ranges));
    return juce::var (o);
}

LibraryQuery libraryQueryFromVar (const juce::var& stored)
{
    LibraryQuery query;

    // `query` is what the command surface has always called the text box, and the WebView still
    // sends it; `text` is what this structure calls it. Reading both means the older payload and
    // a saved collection are the same shape to everything downstream.
    query.text = stored.getProperty ("text", stored.getProperty ("query", {})).toString();
    query.type = stored.getProperty ("type", {}).toString();
    query.collection = stored.getProperty ("collection", {}).toString();
    query.favouritesOnly = (bool) stored.getProperty ("favouritesOnly", false);
    query.minRating = juce::jlimit (0, 5, (int) stored.getProperty ("minRating", 0));
    query.availableOnly = (bool) stored.getProperty ("availableOnly", false);
    query.measuredOnly = (bool) stored.getProperty ("measuredOnly", false);

    const auto ranges = stored.getProperty ("ranges", {});
    const std::pair<const char*, LibraryRange*> named[] {
        { "brightness", &query.brightness }, { "attack", &query.attack },
        { "tail", &query.tail }, { "width", &query.width }, { "cost", &query.cost },
    };
    for (const auto& [name, range] : named)
    {
        const auto stored2 = ranges.getProperty (name, {});
        range->min = juce::jlimit (0.0f, 1.0f, (float) (double) stored2.getProperty ("min", 0.0));
        range->max = juce::jlimit (0.0f, 1.0f, (float) (double) stored2.getProperty ("max", 1.0));
        range->active = (bool) stored2.getProperty ("active", false);
        if (range->min > range->max)
            std::swap (range->min, range->max);
    }

    const auto facets = stored.getProperty ("facets", {});
    query.categories    = selectionFromVar (facets.getProperty ("categories", {}));
    query.tags          = selectionFromVar (facets.getProperty ("tags", {}));
    query.instruments   = selectionFromVar (facets.getProperty ("instruments", {}));
    query.manufacturers = selectionFromVar (facets.getProperty ("manufacturers", {}));
    query.sources       = selectionFromVar (facets.getProperty ("sources", {}));
    return query;
}

juce::Array<LibraryDuplicateSet> libraryDuplicates (const Library& library, float tolerance)
{
    const auto& records = library.allRecords();
    juce::Array<LibraryDuplicateSet> sets;
    juce::StringArray claimed;

    // Whichever member carries user metadata is the one to keep, because folding must never be
    // the thing that loses somebody's rating. A tie goes to the first, which is library order.
    const auto weight = [] (const LibraryRecord& r)
    {
        return (r.user.favourite ? 4 : 0) + (r.user.rating > 0 ? 3 : 0)
             + (r.user.notes.isNotEmpty() ? 2 : 0) + (r.user.tags.isEmpty() ? 0 : 2)
             + (r.user.collections.isEmpty() ? 0 : 1) + (r.factory ? 0 : 1);
    };

    for (int i = 0; i < records.size(); ++i)
    {
        const auto& a = records.getReference (i);
        if (claimed.contains (a.recordId))
            continue;

        LibraryDuplicateSet set;
        set.recordIds.add (a.recordId);
        bool anyByFingerprint = false;

        for (int j = i + 1; j < records.size(); ++j)
        {
            const auto& b = records.getReference (j);
            if (claimed.contains (b.recordId))
                continue;

            const auto sameBytes = a.fingerprint.isNotEmpty() && a.fingerprint == b.fingerprint;

            // Forty plug-ins each shipping an "Init" is forty different sounds with one name, so
            // a measured match has to agree about the plug-in as well as about the sound.
            const auto sameSound = ! sameBytes
                                    && a.name.equalsIgnoreCase (b.name)
                                    && a.targetCeId.isNotEmpty() && a.targetCeId == b.targetCeId
                                    && a.sonic.measured && b.sonic.measured
                                    && sonicDistance (a.sonic, b.sonic) <= tolerance;

            if (! sameBytes && ! sameSound)
                continue;

            anyByFingerprint = anyByFingerprint || sameBytes;
            set.recordIds.add (b.recordId);
            claimed.add (b.recordId);
        }

        if (set.recordIds.size() < 2)
            continue;

        claimed.add (a.recordId);
        set.identical = anyByFingerprint;

        int best = -1;
        for (const auto& id : set.recordIds)
            if (const auto* record = library.find (id); record != nullptr)
                if (const auto w = weight (*record); w > best)
                {
                    best = w;
                    set.keyRecordId = id;
                }

        sets.add (std::move (set));
    }

    return sets;
}

VstPresetHeader parseVstPresetHeader (const void* data, size_t size)
{
    VstPresetHeader header;
    if (data == nullptr || size < 48)
        return header;

    const auto* bytes = static_cast<const char*> (data);
    if (std::memcmp (bytes, "VST3", 4) != 0)
        return header;

    juce::String classId;
    for (int i = 0; i < 32; ++i)
    {
        const auto c = bytes[8 + i];
        const auto isHex = (c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');
        if (! isHex)
            return header;
        classId << juce::String::charToString ((juce::juce_wchar) (c >= 'a' ? c - 32 : c));
    }

    header.classIdHex = classId;
    header.valid = true;
    return header;
}

} // namespace ceditor::host
