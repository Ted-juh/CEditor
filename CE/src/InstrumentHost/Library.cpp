#include "Library.h"

#include <cstring>

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

void Library::mergeVendorScan (const juce::String& sourceType, juce::Array<LibraryRecord> scanned)
{
    // Two-pass identity match: content first (a renamed file keeps its fingerprint), then
    // location (an edited file keeps its path). Anything unmatched is genuinely new.
    juce::Array<LibraryRecord*> existing;
    for (auto& record : records)
        if (record.sourceType == sourceType)
            existing.add (&record);

    juce::Array<bool> matched;
    matched.insertMultiple (0, false, existing.size());

    const auto claim = [&] (LibraryRecord& incoming, auto predicate) -> bool
    {
        for (int i = 0; i < existing.size(); ++i)
        {
            if (matched[i] || ! predicate (*existing[i]))
                continue;

            auto& record = *existing[i];
            const auto keepId = record.recordId;
            const auto keepUser = record.user;
            record = incoming;
            record.recordId = keepId;
            record.user = keepUser;
            record.missing = false;
            matched.set (i, true);
            return true;
        }
        return false;
    };

    juce::Array<LibraryRecord> fresh;
    for (auto& incoming : scanned)
    {
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
        recordVars.add (juce::var (r));
    }

    auto* root = new juce::DynamicObject();
    root->setProperty ("records", recordVars);
    return juce::var (root);
}

Library Library::fromVar (const juce::var& stored)
{
    Library library;
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
