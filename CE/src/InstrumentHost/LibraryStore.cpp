#include "LibraryStore.h"

#include <sqlite3.h>

#include <algorithm>
#include <bit>
#include <cstring>
#include <map>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace ceditor::host
{
namespace
{

// -- a thin RAII layer over SQLite ----------------------------------------------------------------
//
// Errors are exceptions inside this file and never outside it: every public LibraryStore call
// catches them at its boundary and turns them into a result. A transaction that throws halfway is
// rolled back by its guard's destructor, which is what makes "the journal is written whole or not
// at all" true without an error check after every statement.

struct SqliteError : std::runtime_error
{
    SqliteError (int codeIn, const std::string& what) : std::runtime_error (what), code (codeIn) {}

    int primary() const { return code & 0xff; }

    int code;
};

[[noreturn]] void fail (sqlite3* db, int code, const char* context)
{
    throw SqliteError (code, std::string (context) + ": "
                               + (db != nullptr ? sqlite3_errmsg (db) : sqlite3_errstr (code)));
}

class Statement
{
public:
    Statement (sqlite3* dbIn, const std::string& sql) : db (dbIn)
    {
        if (const auto rc = sqlite3_prepare_v3 (db, sql.c_str(), (int) sql.size(),
                                                SQLITE_PREPARE_PERSISTENT, &stmt, nullptr);
            rc != SQLITE_OK)
            fail (db, rc, "prepare");
    }

    ~Statement() { sqlite3_finalize (stmt); }

    Statement (const Statement&) = delete;
    Statement& operator= (const Statement&) = delete;

    void reset()                                   { sqlite3_reset (stmt); sqlite3_clear_bindings (stmt); }
    int parameterIndex (const char* name) const    { return sqlite3_bind_parameter_index (stmt, name); }

    void bindNull (int i)                          { check (sqlite3_bind_null (stmt, i)); }
    void bind (int i, juce::int64 value)           { check (sqlite3_bind_int64 (stmt, i, value)); }
    void bind (int i, int value)                   { bind (i, (juce::int64) value); }
    void bind (int i, bool value)                  { bind (i, (juce::int64) (value ? 1 : 0)); }
    void bind (int i, double value)                { check (sqlite3_bind_double (stmt, i, value)); }
    void bind (int i, float value)                 { bind (i, (double) value); }

    void bind (int i, const juce::String& text)
    {
        check (sqlite3_bind_text64 (stmt, i, text.toRawUTF8(), (sqlite3_uint64) text.getNumBytesAsUTF8(),
                                    SQLITE_TRANSIENT, SQLITE_UTF8));
    }

    /** Empty text is stored as NULL: most of a record's optional fields are empty, and a NULL costs
        nothing on disk. */
    void bindOptional (int i, const juce::String& text)  { if (text.isEmpty()) bindNull (i); else bind (i, text); }

    void bindBlob (int i, const void* data, size_t size)
    {
        check (sqlite3_bind_blob64 (stmt, i, data, (sqlite3_uint64) size, SQLITE_TRANSIENT));
    }

    /** True with a row to read, false when done. */
    bool step()
    {
        const auto rc = sqlite3_step (stmt);
        if (rc == SQLITE_ROW)  return true;
        if (rc == SQLITE_DONE) return false;
        fail (db, rc, "step");
    }

    void run()                                     { while (step()) {} }
    int changes() const                            { return sqlite3_changes (db); }

    int type (int i) const                         { return sqlite3_column_type (stmt, i); }
    juce::int64 int64 (int i) const                { return sqlite3_column_int64 (stmt, i); }
    int integer (int i) const                      { return sqlite3_column_int (stmt, i); }
    double real (int i) const                      { return sqlite3_column_double (stmt, i); }

    juce::String text (int i) const
    {
        const auto* chars = sqlite3_column_text (stmt, i);   // before _bytes, per SQLite's rules
        return chars == nullptr ? juce::String()
                                : juce::String::fromUTF8 ((const char*) chars, sqlite3_column_bytes (stmt, i));
    }

    const void* blob (int i) const                 { return sqlite3_column_blob (stmt, i); }
    size_t bytes (int i) const                     { return (size_t) sqlite3_column_bytes (stmt, i); }

private:
    void check (int rc) { if (rc != SQLITE_OK) fail (db, rc, "bind"); }

    sqlite3* db;
    sqlite3_stmt* stmt = nullptr;
};

class Connection
{
public:
    ~Connection() { close(); }

    void open (const juce::File& file, int flags, int busyTimeoutMs)
    {
        close();
        sqlite3* handle = nullptr;
        const auto rc = sqlite3_open_v2 (file.getFullPathName().toRawUTF8(), &handle, flags, nullptr);
        if (rc != SQLITE_OK)
        {
            const std::string message = handle != nullptr ? sqlite3_errmsg (handle) : sqlite3_errstr (rc);
            sqlite3_close_v2 (handle);
            throw SqliteError (rc, "open: " + message);
        }
        db = handle;
        sqlite3_extended_result_codes (db, 1);
        sqlite3_busy_timeout (db, busyTimeoutMs);
    }

    void close()
    {
        statements.clear();   // finalized before the connection they belong to
        if (db != nullptr)
            sqlite3_close_v2 (db);
        db = nullptr;
    }

    bool isOpen() const { return db != nullptr; }

    void exec (const char* sql)
    {
        char* error = nullptr;
        if (const auto rc = sqlite3_exec (db, sql, nullptr, nullptr, &error); rc != SQLITE_OK)
        {
            const std::string message = error != nullptr ? error : sqlite3_errstr (rc);
            sqlite3_free (error);
            throw SqliteError (rc, message);
        }
    }

    /** A prepared statement, kept for the life of the connection and reset for this use. */
    Statement& cached (const std::string& sql)
    {
        auto& slot = statements[sql];
        if (slot == nullptr)
            slot = std::make_unique<Statement> (db, sql);
        slot->reset();
        return *slot;
    }

    juce::int64 queryInt (const std::string& sql)
    {
        auto& statement = cached (sql);
        const auto value = statement.step() ? statement.int64 (0) : 0;
        // Reset now, not at the next use: a statement left mid-result holds a read transaction
        // open, and several things (switching to WAL, for one) refuse to happen inside one.
        statement.reset();
        return value;
    }

    sqlite3* handle() const { return db; }

private:
    sqlite3* db = nullptr;
    std::map<std::string, std::unique_ptr<Statement>> statements;
};

class Transaction
{
public:
    /** A write transaction takes the write lock at once (BEGIN IMMEDIATE), so a second writer
        waits at the start, where waiting is harmless, instead of failing at the first write. */
    Transaction (Connection& connectionIn, bool write) : connection (connectionIn)
    {
        connection.exec (write ? "BEGIN IMMEDIATE" : "BEGIN");
    }

    ~Transaction()
    {
        if (! finished)
            sqlite3_exec (connection.handle(), "ROLLBACK", nullptr, nullptr, nullptr);
    }

    void commit()
    {
        connection.exec ("COMMIT");
        finished = true;
    }

private:
    Connection& connection;
    bool finished = false;
};

// -- the layout -------------------------------------------------------------------------------------
//
// Version 1. A change to anything here is a new schemaVersion and a migration in `upgrade`, never
// an edit of this text: a database created by this text is on somebody's disk.
//
// One row per record, a column per field, because the store's whole job is to write ONE field
// when one field changed. Versions have their own table since a sound can have dozens and each is a
// full state. Processor state is binary (a BLOB), a quarter smaller than the base64 the JSON held.
// `rev` on every row and the tombstones are how one process finds what another one wrote.

constexpr int applicationId = 0x43454c42;   // "CELB": a CEditor library. `PRAGMA application_id`.

constexpr const char* schemaV1 = R"sql(
CREATE TABLE meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value
) WITHOUT ROWID;

CREATE TABLE records (
    record_id             TEXT PRIMARY KEY NOT NULL,
    seq                   INTEGER NOT NULL,   -- library order
    rev                   INTEGER NOT NULL,   -- the write that last touched this row

    type                  TEXT,
    source_type           TEXT,
    source_locator        TEXT,
    name                  TEXT,
    manufacturer          TEXT,
    instrument            TEXT,
    target_ce_id          TEXT,
    category              TEXT,
    rack_manifest         TEXT,
    class_id_hex          TEXT,
    fingerprint           TEXT,
    factory               INTEGER NOT NULL DEFAULT 0,
    branched_from         TEXT,
    added_at_ms           INTEGER NOT NULL DEFAULT 0,
    missing               INTEGER NOT NULL DEFAULT 0,
    hidden                INTEGER NOT NULL DEFAULT 0,

    sonic_measured        INTEGER NOT NULL DEFAULT 0,
    sonic_silent          INTEGER NOT NULL DEFAULT 0,
    sonic_brightness      REAL,
    sonic_centroid_hz     REAL,
    sonic_attack          REAL,
    sonic_attack_seconds  REAL,
    sonic_tail            REAL,
    sonic_tail_seconds    REAL,
    sonic_width           REAL,
    sonic_noisiness       REAL,
    sonic_dynamics        REAL,
    sonic_peak            REAL,
    sonic_cost            REAL,
    sonic_cost_percent    REAL,
    sonic_latency_samples INTEGER,
    sonic_envelope        BLOB,               -- little-endian float32, one per point
    sonic_fingerprint     TEXT,
    sonic_refusal         TEXT,

    state                 BLOB,               -- the processor state; TEXT only when it was not
                                              -- standard base64, and then exactly as it was
    parts                 TEXT,               -- JSON, captured racks only

    favourite             INTEGER NOT NULL DEFAULT 0,
    rating                INTEGER NOT NULL DEFAULT 0,
    notes                 TEXT,
    tags                  TEXT,               -- JSON array of strings
    collections           TEXT,               -- JSON array of strings

    load_count            INTEGER NOT NULL DEFAULT 0,
    last_loaded_at_ms     INTEGER NOT NULL DEFAULT 0,
    audition_count        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX records_by_rev ON records (rev);
CREATE INDEX records_by_seq ON records (seq);

CREATE TABLE versions (
    record_id   TEXT NOT NULL REFERENCES records (record_id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,             -- oldest first
    version_id  TEXT NOT NULL,
    label       TEXT,
    saved_at_ms INTEGER NOT NULL DEFAULT 0,
    origin      INTEGER NOT NULL DEFAULT 0,
    state       BLOB,
    UNIQUE (record_id, position)
);

CREATE TABLE smart_collections (
    collection_id TEXT PRIMARY KEY NOT NULL,
    seq           INTEGER NOT NULL,
    rev           INTEGER NOT NULL,
    name          TEXT,
    query         TEXT                        -- JSON, libraryQueryToVar
);
CREATE INDEX smart_collections_by_rev ON smart_collections (rev);

CREATE TABLE tombstones (
    kind          TEXT NOT NULL,              -- 'record' | 'collection'
    id            TEXT NOT NULL,
    rev           INTEGER NOT NULL,
    removed_at_ms INTEGER NOT NULL,
    PRIMARY KEY (kind, id)
) WITHOUT ROWID;
CREATE INDEX tombstones_by_rev ON tombstones (rev);

INSERT INTO meta (key, value) VALUES ('rev', 0);
)sql";

// Tombstones exist so a process that was open during a removal hears of it. One that has not
// synced for three months has been restarted since, and read everything afresh.
constexpr juce::int64 tombstoneLifetimeMs = 90LL * 24 * 60 * 60 * 1000;

// -- one table that is both the write and the read -----------------------------------------------
//
// Every record column, the LibraryChanges group that writes it, and (in bindColumn / readColumn)
// how it maps to the struct. The partial UPDATE for a set of groups, the whole-row UPSERT and the
// SELECT are all generated from this list, so a field cannot be written by one and forgotten by
// another. The round-trip test in LibraryPersistenceTests sets every field and reads it back.

enum class Col
{
    type, sourceType, sourceLocator, name, manufacturer, instrument, targetCeId, category,
    rackManifest, classIdHex, fingerprint, factory, branchedFrom, addedAtMs,
    missing, hidden,
    sonicMeasured, sonicSilent, sonicBrightness, sonicCentroidHz, sonicAttack, sonicAttackSeconds,
    sonicTail, sonicTailSeconds, sonicWidth, sonicNoisiness, sonicDynamics, sonicPeak, sonicCost,
    sonicCostPercent, sonicLatencySamples, sonicEnvelope, sonicFingerprint, sonicRefusal,
    state, parts,
    favourite, rating, notes, tags, collections,
    loadCount, lastLoadedAtMs, auditionCount
};

struct ColumnSpec
{
    Col col;
    const char* name;
    juce::uint32 group;   // 0: written only with the whole row (the usage counts, which otherwise
                          // move as deltas)
};

using F = LibraryChanges;

constexpr ColumnSpec recordColumns[] = {
    { Col::type,                "type",                  F::identity },
    { Col::sourceType,          "source_type",           F::identity },
    { Col::sourceLocator,       "source_locator",        F::identity },
    { Col::name,                "name",                  F::identity },
    { Col::manufacturer,        "manufacturer",          F::identity },
    { Col::instrument,          "instrument",            F::identity },
    { Col::targetCeId,          "target_ce_id",          F::identity },
    { Col::category,            "category",              F::identity },
    { Col::rackManifest,        "rack_manifest",         F::identity },
    { Col::classIdHex,          "class_id_hex",          F::identity },
    { Col::fingerprint,         "fingerprint",           F::identity },
    { Col::factory,             "factory",               F::identity },
    { Col::branchedFrom,        "branched_from",         F::identity },
    { Col::addedAtMs,           "added_at_ms",           F::identity },
    { Col::missing,             "missing",               F::missing },
    { Col::hidden,              "hidden",                F::hidden },
    { Col::sonicMeasured,       "sonic_measured",        F::sonic },
    { Col::sonicSilent,         "sonic_silent",          F::sonic },
    { Col::sonicBrightness,     "sonic_brightness",      F::sonic },
    { Col::sonicCentroidHz,     "sonic_centroid_hz",     F::sonic },
    { Col::sonicAttack,         "sonic_attack",          F::sonic },
    { Col::sonicAttackSeconds,  "sonic_attack_seconds",  F::sonic },
    { Col::sonicTail,           "sonic_tail",            F::sonic },
    { Col::sonicTailSeconds,    "sonic_tail_seconds",    F::sonic },
    { Col::sonicWidth,          "sonic_width",           F::sonic },
    { Col::sonicNoisiness,      "sonic_noisiness",       F::sonic },
    { Col::sonicDynamics,       "sonic_dynamics",        F::sonic },
    { Col::sonicPeak,           "sonic_peak",            F::sonic },
    { Col::sonicCost,           "sonic_cost",            F::sonic },
    { Col::sonicCostPercent,    "sonic_cost_percent",    F::sonic },
    { Col::sonicLatencySamples, "sonic_latency_samples", F::sonic },
    { Col::sonicEnvelope,       "sonic_envelope",        F::sonic },
    { Col::sonicFingerprint,    "sonic_fingerprint",     F::sonic },
    { Col::sonicRefusal,        "sonic_refusal",         F::sonic },
    { Col::state,               "state",                 F::state },
    { Col::parts,               "parts",                 F::parts },
    { Col::favourite,           "favourite",             F::favourite },
    { Col::rating,              "rating",                F::rating },
    { Col::notes,               "notes",                 F::notes },
    { Col::tags,                "tags",                  F::tags },
    { Col::collections,         "collections",           F::collections },
    { Col::loadCount,           "load_count",            0 },
    { Col::lastLoadedAtMs,      "last_loaded_at_ms",     0 },
    { Col::auditionCount,       "audition_count",        0 },
};

// -- encodings ------------------------------------------------------------------------------------

juce::String toCompactJson (const juce::var& value)
{
    return juce::JSON::toString (value, juce::JSON::FormatOptions{}
                                            .withSpacing (juce::JSON::Spacing::none)
                                            .withMaxDecimalPlaces (7));
}

juce::String stringsToJson (const juce::StringArray& strings)
{
    if (strings.isEmpty())
        return {};
    juce::Array<juce::var> values;
    for (const auto& s : strings)
        values.add (s);
    return toCompactJson (values);
}

juce::StringArray stringsFromJson (const juce::String& text)
{
    juce::StringArray strings;
    if (text.isEmpty())
        return strings;
    const auto parsed = juce::JSON::parse (text);   // named: getArray() points into it
    if (const auto* values = parsed.getArray())
        for (const auto& v : *values)
            strings.add (v.toString());
    return strings;
}

/** A state goes in as bytes when it is standard base64 that comes back out identical, which is
    what the service writes (juce::Base64). Anything else is kept as the text it was: JUCE's own
    MemoryBlock encoding, a hand-edited value, damage. Storing that as bytes would change it. */
void bindState (Statement& statement, int index, const juce::String& base64)
{
    if (base64.isEmpty())
    {
        statement.bindNull (index);
        return;
    }

    juce::MemoryOutputStream decoded;
    if (juce::Base64::convertFromBase64 (decoded, base64)
        && juce::Base64::toBase64 (decoded.getData(), decoded.getDataSize()) == base64)
        statement.bindBlob (index, decoded.getData(), decoded.getDataSize());
    else
        statement.bind (index, base64);
}

juce::String readState (const Statement& statement, int index)
{
    switch (statement.type (index))
    {
        case SQLITE_BLOB: return juce::Base64::toBase64 (statement.blob (index), statement.bytes (index));
        case SQLITE_TEXT: return statement.text (index);
        default:          return {};
    }
}

void bindEnvelope (Statement& statement, int index, const juce::Array<float>& envelope)
{
    if (envelope.isEmpty())
    {
        statement.bindNull (index);
        return;
    }

    std::vector<juce::uint32> packed;
    packed.reserve ((size_t) envelope.size());
    for (auto value : envelope)
        packed.push_back (juce::ByteOrder::swapIfBigEndian (std::bit_cast<juce::uint32> (value)));
    statement.bindBlob (index, packed.data(), packed.size() * sizeof (juce::uint32));
}

juce::Array<float> readEnvelope (const Statement& statement, int index)
{
    juce::Array<float> envelope;
    const auto* data = static_cast<const juce::uint8*> (statement.blob (index));
    const auto count = statement.bytes (index) / sizeof (juce::uint32);
    for (size_t i = 0; data != nullptr && i < count; ++i)
        envelope.add (juce::jlimit (0.0f, 1.0f, std::bit_cast<float> (
                                        juce::ByteOrder::littleEndianInt (data + i * sizeof (juce::uint32)))));
    return envelope;
}

void bindColumn (Statement& s, int i, Col col, const LibraryRecord& r)
{
    const auto& m = r.sonic;
    switch (col)
    {
        case Col::type:                s.bindOptional (i, r.type); break;
        case Col::sourceType:          s.bindOptional (i, r.sourceType); break;
        case Col::sourceLocator:       s.bindOptional (i, r.sourceLocator); break;
        case Col::name:                s.bindOptional (i, r.name); break;
        case Col::manufacturer:        s.bindOptional (i, r.manufacturer); break;
        case Col::instrument:          s.bindOptional (i, r.instrument); break;
        case Col::targetCeId:          s.bindOptional (i, r.targetCeId); break;
        case Col::category:            s.bindOptional (i, r.category); break;
        case Col::rackManifest:        s.bindOptional (i, r.rackManifestJson); break;
        case Col::classIdHex:          s.bindOptional (i, r.classIdHex); break;
        case Col::fingerprint:         s.bindOptional (i, r.fingerprint); break;
        case Col::factory:             s.bind (i, r.factory); break;
        case Col::branchedFrom:        s.bindOptional (i, r.branchedFromRecordId); break;
        case Col::addedAtMs:           s.bind (i, r.addedAtMs); break;
        case Col::missing:             s.bind (i, r.missing); break;
        case Col::hidden:              s.bind (i, r.hidden); break;
        case Col::sonicMeasured:       s.bind (i, m.measured); break;
        case Col::sonicSilent:         s.bind (i, m.silent); break;
        case Col::sonicBrightness:     s.bind (i, m.brightness); break;
        case Col::sonicCentroidHz:     s.bind (i, m.centroidHz); break;
        case Col::sonicAttack:         s.bind (i, m.attack); break;
        case Col::sonicAttackSeconds:  s.bind (i, m.attackSeconds); break;
        case Col::sonicTail:           s.bind (i, m.tail); break;
        case Col::sonicTailSeconds:    s.bind (i, m.tailSeconds); break;
        case Col::sonicWidth:          s.bind (i, m.width); break;
        case Col::sonicNoisiness:      s.bind (i, m.noisiness); break;
        case Col::sonicDynamics:       s.bind (i, m.dynamics); break;
        case Col::sonicPeak:           s.bind (i, m.peak); break;
        case Col::sonicCost:           s.bind (i, m.cost); break;
        case Col::sonicCostPercent:    s.bind (i, m.costPercent); break;
        case Col::sonicLatencySamples: s.bind (i, m.latencySamples); break;
        case Col::sonicEnvelope:       bindEnvelope (s, i, m.envelope); break;
        case Col::sonicFingerprint:    s.bindOptional (i, r.sonicFingerprint); break;
        case Col::sonicRefusal:        s.bindOptional (i, r.sonicRefusal); break;
        case Col::state:               bindState (s, i, r.stateBlobBase64); break;
        case Col::parts:               s.bindOptional (i, r.parts.isEmpty() ? juce::String()
                                                              : toCompactJson (capturedPartsToVar (r.parts))); break;
        case Col::favourite:           s.bind (i, r.user.favourite); break;
        case Col::rating:              s.bind (i, r.user.rating); break;
        case Col::notes:               s.bindOptional (i, r.user.notes); break;
        case Col::tags:                s.bindOptional (i, stringsToJson (r.user.tags)); break;
        case Col::collections:         s.bindOptional (i, stringsToJson (r.user.collections)); break;
        case Col::loadCount:           s.bind (i, r.loadCount); break;
        case Col::lastLoadedAtMs:      s.bind (i, r.lastLoadedAtMs); break;
        case Col::auditionCount:       s.bind (i, r.auditionCount); break;
    }
}

void readColumn (const Statement& s, int i, Col col, LibraryRecord& r)
{
    auto& m = r.sonic;
    const auto real = [&] { return (float) s.real (i); };
    switch (col)
    {
        case Col::type:                r.type = s.text (i); break;
        case Col::sourceType:          r.sourceType = s.text (i); break;
        case Col::sourceLocator:       r.sourceLocator = s.text (i); break;
        case Col::name:                r.name = s.text (i); break;
        case Col::manufacturer:        r.manufacturer = s.text (i); break;
        case Col::instrument:          r.instrument = s.text (i); break;
        case Col::targetCeId:          r.targetCeId = s.text (i); break;
        case Col::category:            r.category = s.text (i); break;
        case Col::rackManifest:        r.rackManifestJson = s.text (i); break;
        case Col::classIdHex:          r.classIdHex = s.text (i); break;
        case Col::fingerprint:         r.fingerprint = s.text (i); break;
        case Col::factory:             r.factory = s.integer (i) != 0; break;
        case Col::branchedFrom:        r.branchedFromRecordId = s.text (i); break;
        case Col::addedAtMs:           r.addedAtMs = s.int64 (i); break;
        case Col::missing:             r.missing = s.integer (i) != 0; break;
        case Col::hidden:              r.hidden = s.integer (i) != 0; break;
        case Col::sonicMeasured:       m.measured = s.integer (i) != 0; break;
        case Col::sonicSilent:         m.silent = s.integer (i) != 0; break;
        case Col::sonicBrightness:     m.brightness = real(); break;
        case Col::sonicCentroidHz:     m.centroidHz = real(); break;
        case Col::sonicAttack:         m.attack = real(); break;
        case Col::sonicAttackSeconds:  m.attackSeconds = real(); break;
        case Col::sonicTail:           m.tail = real(); break;
        case Col::sonicTailSeconds:    m.tailSeconds = real(); break;
        case Col::sonicWidth:          m.width = real(); break;
        case Col::sonicNoisiness:      m.noisiness = real(); break;
        case Col::sonicDynamics:       m.dynamics = real(); break;
        case Col::sonicPeak:           m.peak = real(); break;
        case Col::sonicCost:           m.cost = real(); break;
        case Col::sonicCostPercent:    m.costPercent = real(); break;
        case Col::sonicLatencySamples: m.latencySamples = s.integer (i); break;
        case Col::sonicEnvelope:       m.envelope = readEnvelope (s, i); break;
        case Col::sonicFingerprint:    r.sonicFingerprint = s.text (i); break;
        case Col::sonicRefusal:        r.sonicRefusal = s.text (i); break;
        case Col::state:               r.stateBlobBase64 = readState (s, i); break;
        case Col::parts:               r.parts = capturedPartsFromVar (juce::JSON::parse (s.text (i))); break;
        case Col::favourite:           r.user.favourite = s.integer (i) != 0; break;
        case Col::rating:              r.user.rating = juce::jlimit (0, 5, s.integer (i)); break;
        case Col::notes:               r.user.notes = s.text (i); break;
        case Col::tags:                r.user.tags = stringsFromJson (s.text (i)); break;
        case Col::collections:         r.user.collections = stringsFromJson (s.text (i)); break;
        case Col::loadCount:           r.loadCount = juce::jmax (0, s.integer (i)); break;
        case Col::lastLoadedAtMs:      r.lastLoadedAtMs = s.int64 (i); break;
        case Col::auditionCount:       r.auditionCount = juce::jmax (0, s.integer (i)); break;
    }
}

bool hasDatabaseHeader (const juce::File& file)
{
    static constexpr char magic[] = "SQLite format 3";   // 16 bytes with its terminator
    char header[sizeof (magic)] = {};
    juce::FileInputStream in (file);
    return in.openedOk() && in.read (header, (int) sizeof (header)) == (int) sizeof (header)
             && std::memcmp (header, magic, sizeof (magic)) == 0;
}

bool isUnreadable (int primaryCode)
{
    // What SQLite says about a file that is not a database, or is a damaged one. Anything else —
    // busy, locked, permissions, an I/O error — is a reason not to open it NOW, and is never a
    // reason to move somebody's library aside.
    return primaryCode == SQLITE_NOTADB || primaryCode == SQLITE_CORRUPT;
}

/** Moves a damaged database aside with its write-ahead log, which holds committed changes that
    have not reached the main file yet and belongs with it. */
juce::File quarantineDatabase (const juce::File& file)
{
    const auto parked = quarantineUnreadableLibrary (file);
    if (parked == juce::File())
        return {};

    for (const auto* suffix : { "-wal", "-shm" })
    {
        const auto companion = file.getSiblingFile (file.getFileName() + suffix);
        if (companion.existsAsFile())
            companion.moveFileTo (parked.getSiblingFile (parked.getFileName() + suffix));
    }
    return parked;
}

/** Held while a library is created, so two processes starting at once do not both build one and
    have the second replace the first after it was opened. */
struct CreationLock
{
    explicit CreationLock (const juce::File& databaseFile)
        : lock ("CEditorLibraryCreate-" + juce::String::toHexString (lockKey (databaseFile).hashCode64()))
    {
        held = lock.enter (10000);
    }

    ~CreationLock()
    {
        if (held)
            lock.exit();
    }

    static juce::String lockKey (const juce::File& file)
    {
       #if JUCE_WINDOWS
        return file.getFullPathName().toLowerCase();   // one file, however it is spelled
       #else
        return file.getFullPathName();
       #endif
    }

    juce::InterProcessLock lock;
    bool held = false;
};

// -- the database's operations --------------------------------------------------------------------

class Database
{
public:
    explicit Database (Connection& connectionIn) : db (connectionIn) {}

    juce::int64 currentRev()              { return db.queryInt ("SELECT value FROM meta WHERE key = 'rev'"); }

    void setRev (juce::int64 rev)
    {
        auto& statement = db.cached ("UPDATE meta SET value = ?1 WHERE key = 'rev'");
        statement.bind (1, rev);
        statement.run();
    }

    /** The whole row, and its versions: a record that is new here, or back after another process
        removed it. `seq` is kept when the row already exists. */
    void writeWhole (const LibraryRecord& record, juce::int64 rev)
    {
        auto& statement = writeFor (wholeRow);
        bindWrite (statement, record, rev);
        statement.stmt->run();

        auto& unbury = db.cached ("DELETE FROM tombstones WHERE kind = 'record' AND id = ?1");
        unbury.bind (1, record.recordId);
        unbury.run();

        writeVersions (record);
    }

    /** Just the columns of `fields`. False when there is no such row: another process removed it. */
    bool writeFields (const LibraryRecord& record, juce::uint32 fields, juce::int64 rev)
    {
        auto& statement = writeFor (fields);
        bindWrite (statement, record, rev);
        statement.stmt->run();
        const auto updated = statement.stmt->changes() > 0;
        if (updated && (fields & F::state) != 0)
            writeVersions (record);
        return updated;
    }

    bool addUsage (const juce::String& recordId, const LibraryChanges::Usage& delta, juce::int64 rev)
    {
        auto& statement = db.cached (
            "UPDATE records SET load_count = load_count + ?2, audition_count = audition_count + ?3,"
            " last_loaded_at_ms = MAX(last_loaded_at_ms, ?4), rev = ?5 WHERE record_id = ?1");
        statement.bind (1, recordId);
        statement.bind (2, delta.loads);
        statement.bind (3, delta.auditions);
        statement.bind (4, delta.lastLoadedAtMs);
        statement.bind (5, rev);
        statement.run();
        return statement.changes() > 0;
    }

    void removeRecord (const juce::String& recordId, juce::int64 rev)
    {
        auto& statement = db.cached ("DELETE FROM records WHERE record_id = ?1");   // versions cascade
        statement.bind (1, recordId);
        statement.run();
        bury ("record", recordId, rev);
    }

    void writeCollection (const SmartCollection& collection, juce::int64 rev)
    {
        auto& statement = db.cached (
            "INSERT INTO smart_collections (collection_id, seq, rev, name, query)"
            " VALUES (?1, (SELECT COALESCE(MAX(seq), 0) + 1 FROM smart_collections), ?2, ?3, ?4)"
            " ON CONFLICT (collection_id) DO UPDATE SET rev = excluded.rev, name = excluded.name,"
            " query = excluded.query");
        statement.bind (1, collection.collectionId);
        statement.bind (2, rev);
        statement.bind (3, collection.name);
        statement.bind (4, toCompactJson (libraryQueryToVar (collection.query)));
        statement.run();

        auto& unbury = db.cached ("DELETE FROM tombstones WHERE kind = 'collection' AND id = ?1");
        unbury.bind (1, collection.collectionId);
        unbury.run();
    }

    void removeCollection (const juce::String& collectionId, juce::int64 rev)
    {
        auto& statement = db.cached ("DELETE FROM smart_collections WHERE collection_id = ?1");
        statement.bind (1, collectionId);
        statement.run();
        bury ("collection", collectionId, rev);
    }

    void pruneTombstones (juce::int64 nowMs)
    {
        auto& statement = db.cached ("DELETE FROM tombstones WHERE removed_at_ms < ?1");
        statement.bind (1, nowMs - tombstoneLifetimeMs);
        statement.run();
    }

    /** What changed since `sinceRev`, applied to a library's records and collections directly, so
        the journal does not hear of it: it is what is stored, not a change to store. Returns how many
        records and collections this changed in memory — which is what another process wrote,
        since this process's own writes are already there. */
    int pull (juce::Array<LibraryRecord>& records, juce::Array<SmartCollection>& collections,
              juce::int64 sinceRev)
    {
        int changed = 0;

        // Rows, in library order.
        std::vector<LibraryRecord> fresh;
        std::map<juce::String, size_t> freshIndex;
        {
            auto& statement = db.cached (selectRecordsSql());
            statement.bind (1, sinceRev);
            while (statement.step())
            {
                LibraryRecord record;
                record.recordId = statement.text (0);
                int column = 1;
                for (const auto& spec : recordColumns)
                    readColumn (statement, column++, spec.col, record);
                freshIndex[record.recordId] = fresh.size();
                fresh.push_back (std::move (record));
            }
        }

        if (! fresh.empty())
        {
            auto& statement = db.cached (
                "SELECT v.record_id, v.version_id, v.label, v.saved_at_ms, v.origin, v.state"
                " FROM versions v JOIN records r ON r.record_id = v.record_id"
                " WHERE r.rev > ?1 ORDER BY v.record_id, v.position");
            statement.bind (1, sinceRev);
            while (statement.step())
            {
                const auto it = freshIndex.find (statement.text (0));
                if (it == freshIndex.end())
                    continue;
                LibraryVersion version;
                version.versionId = statement.text (1);
                version.label = statement.text (2);
                version.savedAtMs = statement.int64 (3);
                version.origin = statement.integer (4) != 0;
                version.stateBlobBase64 = readState (statement, 5);
                fresh[it->second].versions.add (std::move (version));
            }
        }

        if (records.isEmpty())
        {
            changed += (int) fresh.size();
            for (auto& record : fresh)
                records.add (std::move (record));
        }
        else if (! fresh.empty())
        {
            std::map<juce::String, int> present;
            for (int i = 0; i < records.size(); ++i)
                present[records.getReference (i).recordId] = i;
            for (auto& record : fresh)
            {
                if (const auto it = present.find (record.recordId); it != present.end())
                {
                    auto& existing = records.getReference (it->second);
                    if (! (existing == record))
                    {
                        existing = std::move (record);
                        ++changed;
                    }
                }
                else
                {
                    records.add (std::move (record));
                    ++changed;
                }
            }
        }

        // Removals, of records and of collections.
        std::set<juce::String> goneRecords, goneCollections;
        {
            auto& statement = db.cached ("SELECT kind, id FROM tombstones WHERE rev > ?1");
            statement.bind (1, sinceRev);
            while (statement.step())
                (statement.text (0) == "record" ? goneRecords : goneCollections).insert (statement.text (1));
        }
        if (! goneRecords.empty())
            changed += records.removeIf ([&] (const LibraryRecord& r) { return goneRecords.count (r.recordId) > 0; });

        // Smart collections: few, so simply by id, and compared in their stored form.
        {
            auto& statement = db.cached ("SELECT collection_id, name, query FROM smart_collections"
                                         " WHERE rev > ?1 ORDER BY seq");
            statement.bind (1, sinceRev);
            while (statement.step())
            {
                SmartCollection collection;
                collection.collectionId = statement.text (0);
                collection.name = statement.text (1);
                collection.query = libraryQueryFromVar (juce::JSON::parse (statement.text (2)));

                const auto sameAs = [&] (const SmartCollection& existing)
                {
                    return existing.name == collection.name
                             && toCompactJson (libraryQueryToVar (existing.query))
                                  == toCompactJson (libraryQueryToVar (collection.query));
                };

                bool found = false;
                for (auto& existing : collections)
                    if (existing.collectionId == collection.collectionId)
                    {
                        if (! sameAs (existing))
                        {
                            existing = collection;
                            ++changed;
                        }
                        found = true;
                        break;
                    }
                if (! found)
                {
                    collections.add (std::move (collection));
                    ++changed;
                }
            }
        }
        if (! goneCollections.empty())
            changed += collections.removeIf ([&] (const SmartCollection& c) { return goneCollections.count (c.collectionId) > 0; });

        return changed;
    }

    static constexpr juce::uint32 wholeRow = 0xffffffffu;

private:
    struct PreparedWrite
    {
        Statement* stmt = nullptr;
        std::vector<std::pair<int, Col>> columns;   // parameter index -> column
        int recordId = 0, rev = 0;
    };

    static bool includes (juce::uint32 fields, const ColumnSpec& spec)
    {
        return fields == wholeRow || (spec.group & fields) != 0;
    }

    static const std::string& selectRecordsSql()
    {
        static const std::string sql = []
        {
            std::string s = "SELECT record_id";
            for (const auto& spec : recordColumns)
                s += std::string (", ") + spec.name;
            return s + " FROM records WHERE rev > ?1 ORDER BY seq";
        }();
        return sql;
    }

    PreparedWrite& writeFor (juce::uint32 fields)
    {
        auto& write = writes[fields];
        if (write.stmt == nullptr)
        {
            std::string sql;
            if (fields == wholeRow)
            {
                // A new row goes to the end of the library; an existing one keeps its place.
                std::string names = "record_id, seq, rev",
                            values = ":record_id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM records), :rev",
                            updates = "rev = excluded.rev";
                for (const auto& spec : recordColumns)
                {
                    names += std::string (", ") + spec.name;
                    values += std::string (", :") + spec.name;
                    updates += std::string (", ") + spec.name + " = excluded." + spec.name;
                }
                sql = "INSERT INTO records (" + names + ") VALUES (" + values
                        + ") ON CONFLICT (record_id) DO UPDATE SET " + updates;
            }
            else
            {
                sql = "UPDATE records SET rev = :rev";
                for (const auto& spec : recordColumns)
                    if (includes (fields, spec))
                        sql += std::string (", ") + spec.name + " = :" + spec.name;
                sql += " WHERE record_id = :record_id";
            }

            write.stmt = &db.cached (sql);
            for (const auto& spec : recordColumns)
                if (includes (fields, spec))
                    write.columns.emplace_back (write.stmt->parameterIndex ((std::string (":") + spec.name).c_str()), spec.col);
            write.recordId = write.stmt->parameterIndex (":record_id");
            write.rev = write.stmt->parameterIndex (":rev");
        }
        else
        {
            write.stmt->reset();
        }
        return write;
    }

    static void bindWrite (PreparedWrite& write, const LibraryRecord& record, juce::int64 rev)
    {
        write.stmt->bind (write.recordId, record.recordId);
        write.stmt->bind (write.rev, rev);
        for (const auto& [index, col] : write.columns)
            bindColumn (*write.stmt, index, col, record);
    }

    void writeVersions (const LibraryRecord& record)
    {
        auto& clear = db.cached ("DELETE FROM versions WHERE record_id = ?1");
        clear.bind (1, record.recordId);
        clear.run();

        for (int position = 0; position < record.versions.size(); ++position)
        {
            const auto& version = record.versions.getReference (position);
            auto& insert = db.cached ("INSERT INTO versions (record_id, position, version_id, label,"
                                      " saved_at_ms, origin, state) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)");
            insert.bind (1, record.recordId);
            insert.bind (2, position);
            insert.bind (3, version.versionId);
            insert.bindOptional (4, version.label);
            insert.bind (5, version.savedAtMs);
            insert.bind (6, version.origin);
            bindState (insert, 7, version.stateBlobBase64);
            insert.run();
        }
    }

    void bury (const char* kind, const juce::String& id, juce::int64 rev)
    {
        auto& statement = db.cached (
            "INSERT INTO tombstones (kind, id, rev, removed_at_ms) VALUES (?1, ?2, ?3, ?4)"
            " ON CONFLICT (kind, id) DO UPDATE SET rev = excluded.rev, removed_at_ms = excluded.removed_at_ms");
        statement.bind (1, juce::String (kind));
        statement.bind (2, id);
        statement.bind (3, rev);
        statement.bind (4, juce::Time::currentTimeMillis());
        statement.run();
    }

    Connection& db;
    std::map<juce::uint32, PreparedWrite> writes;
};

} // namespace

// -- LibraryStore -----------------------------------------------------------------------------------

struct LibraryStore::Impl
{
    explicit Impl (int busyTimeoutMsIn) : busyTimeoutMs (busyTimeoutMsIn) {}

    int busyTimeoutMs;
    Connection connection;
    std::unique_ptr<Database> database;
    juce::File file;
    juce::int64 seenRev = 0;       // the newest write this process has read
    juce::int64 dataVersion = 0;   // PRAGMA data_version when it read it

    juce::int64 readDataVersion()  { return connection.queryInt ("PRAGMA data_version"); }

    enum class Opened { ok, unreadable, newer };

    Opened openExisting (const juce::File& databaseFile, Library& into)
    {
        // Looked at before SQLite is. Given a file whose header is not a database's, SQLite
        // reports NOTADB — and on the way deletes a -wal beside it as stale. That log may be the
        // only copy of the last changes, and it belongs with the file when the file is set aside.
        if (! hasDatabaseHeader (databaseFile))
            return Opened::unreadable;

        connection.open (databaseFile, SQLITE_OPEN_READWRITE | SQLITE_OPEN_NOMUTEX, busyTimeoutMs);

        // The first statements read the header, which is where a file that is not a database
        // fails (SQLITE_NOTADB) — the caller treats that as unreadable.
        if (connection.queryInt ("PRAGMA application_id") != applicationId)
            return Opened::unreadable;   // a database, but not a library (or an empty file)
        const auto version = connection.queryInt ("PRAGMA user_version");
        if (version > schemaVersion)
            return Opened::newer;
        upgrade (version);

        connection.exec ("PRAGMA foreign_keys = ON");
        // WAL is what lets another CEditor read while this one writes. It is a property of the
        // file and is set by whoever opens it first; on a file system that cannot do WAL (a network
        // share) SQLite stays in its rollback journal, which is slower and still correct.
        connection.exec ("PRAGMA journal_mode = WAL");

        database = std::make_unique<Database> (connection);

        // Housekeeping is a write, and a write can find the database busy. Not worth failing an
        // open over: the next start will do it.
        try
        {
            Transaction housekeeping (connection, true);
            database->pruneTombstones (juce::Time::currentTimeMillis());
            housekeeping.commit();
        }
        catch (const SqliteError& e)
        {
            if (isUnreadable (e.primary()))
                throw;
        }

        into = Library();
        Transaction read (connection, false);
        seenRev = database->currentRev();
        database->pull (into.records, into.smartCollections, -1);
        read.commit();
        into.changes = {};
        dataVersion = readDataVersion();
        file = databaseFile;
        return Opened::ok;
    }

    /** Migrations, one per schema version, in order. There are none yet: version 1 is the first. */
    void upgrade (juce::int64 fromVersion)
    {
        juce::ignoreUnused (fromVersion);
    }

    /** A new database at `databaseFile`, holding `contents`. Built under a temporary name and moved
        into place whole, so a crash halfway leaves no half-made library where the real one goes. */
    bool create (const juce::File& databaseFile, const Library& contents, const juce::File& importedFrom,
                 juce::String& error)
    {
        const auto building = databaseFile.getSiblingFile (databaseFile.getFileName() + ".creating-"
                                                             + juce::Uuid().toDashedString());
        try
        {
            Connection c;
            c.open (building, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_NOMUTEX, busyTimeoutMs);
            c.exec ("PRAGMA foreign_keys = ON");
            Transaction transaction (c, true);
            c.exec (schemaV1);
            c.exec (("PRAGMA application_id = " + std::to_string (applicationId)).c_str());
            c.exec (("PRAGMA user_version = " + std::to_string (schemaVersion)).c_str());

            auto& meta = c.cached ("INSERT INTO meta (key, value) VALUES (?1, ?2)");
            meta.bind (1, juce::String ("created_at_ms"));
            meta.bind (2, juce::Time::currentTimeMillis());
            meta.run();
            if (importedFrom != juce::File())
            {
                meta.reset();
                meta.bind (1, juce::String ("imported_from"));
                meta.bind (2, importedFrom.getFullPathName());
                meta.run();
                meta.reset();
                meta.bind (1, juce::String ("imported_records"));
                meta.bind (2, contents.allRecords().size());
                meta.run();
            }

            Database target (c);
            constexpr juce::int64 firstRev = 1;
            for (const auto& record : contents.allRecords())
                target.writeWhole (record, firstRev);
            for (const auto& collection : contents.allSmartCollections())
                target.writeCollection (collection, firstRev);
            target.setRev (firstRev);

            transaction.commit();
        }
        catch (const SqliteError& e)
        {
            building.deleteFile();
            error = e.what();
            return false;
        }

        // Under CreationLock nobody else can be making one; this is for a library that appeared
        // anyway (a copy restored by hand). moveFileTo would replace it, and it is not ours to.
        if (databaseFile.existsAsFile())
        {
            building.deleteFile();
            return true;
        }

        if (! building.moveFileTo (databaseFile))
        {
            building.deleteFile();
            error = "could not move the new library into place at " + databaseFile.getFullPathName();
            return false;
        }
        return true;
    }

    void close()
    {
        database.reset();
        connection.close();
        file = juce::File();
        seenRev = 0;
        dataVersion = 0;
    }
};

LibraryStore::LibraryStore (int busyTimeoutMs) : impl (std::make_unique<Impl> (busyTimeoutMs)) {}
LibraryStore::~LibraryStore() = default;

bool LibraryStore::isOpen() const       { return impl->database != nullptr; }
juce::File LibraryStore::file() const   { return impl->file; }
void LibraryStore::close()              { impl->close(); }

LibraryStore::OpenReport LibraryStore::open (const juce::File& databaseFile, const juce::File& legacyJsonFile,
                                             Library& into)
{
    close();
    into = Library();

    OpenReport report;
    databaseFile.getParentDirectory().createDirectory();

    // Two processes starting at once must not both build a library and have one replace the other
    // after it was opened. Whoever takes the lock builds it; the other finds it there.
    if (! databaseFile.existsAsFile())
    {
        const CreationLock creating (databaseFile);
        if (! creating.held)
        {
            report.error = "another CEditor is creating the library and did not finish";
            return report;
        }

        if (! databaseFile.existsAsFile())
        {
            Library contents;
            juce::File importedFrom;
            report.result = OpenResult::created;

            if (legacyJsonFile != juce::File() && legacyJsonFile.existsAsFile())
            {
                if (contents.loadFrom (legacyJsonFile) == Library::LoadResult::unreadable)
                {
                    // Not an empty library, and not to be treated as one: moved aside whole
                    // before anything new is started. If it cannot be moved, nothing is created,
                    // so the next start tries again rather than forgetting it exists.
                    report.result = OpenResult::unreadable;
                    report.quarantined = quarantineUnreadableLibrary (legacyJsonFile);
                    if (report.quarantined == juce::File())
                        return report;
                    contents = Library();
                }
                else
                {
                    report.result = OpenResult::imported;
                    report.importedRecords = contents.allRecords().size();
                    importedFrom = legacyJsonFile;
                }
            }

            if (! impl->create (databaseFile, contents, importedFrom, report.error))
            {
                report.result = OpenResult::failed;
                return report;
            }
        }
    }

    const auto resultAlreadySet = report.result != OpenResult::failed;   // created, imported, unreadable
    const auto attempt = [&] () -> Impl::Opened
    {
        try
        {
            return impl->openExisting (databaseFile, into);
        }
        catch (const SqliteError& e)
        {
            impl->close();
            into = Library();
            report.error = e.what();
            if (isUnreadable (e.primary()))
                return Impl::Opened::unreadable;
            throw;
        }
    };

    try
    {
        switch (attempt())
        {
            case Impl::Opened::ok:
                if (! resultAlreadySet)
                    report.result = OpenResult::opened;
                return report;

            case Impl::Opened::newer:
                impl->close();
                report.result = OpenResult::newerFormat;
                return report;

            case Impl::Opened::unreadable:
                break;
        }

        // Unreadable: moved aside with its log, whole, and a new library started in its place. A
        // library.json from before the database is NOT imported again: it is older than what was
        // just set aside, and quietly bringing back last year's library is its own kind of loss.
        impl->close();
        report.result = OpenResult::unreadable;
        juce::String error;
        {
            const CreationLock creating (databaseFile);
            report.quarantined = creating.held ? quarantineDatabase (databaseFile) : juce::File();
            if (report.quarantined == juce::File())
                return report;
            if (! impl->create (databaseFile, Library(), {}, error))
            {
                report.result = OpenResult::failed;
                report.error = error;
                return report;
            }
        }

        if (attempt() != Impl::Opened::ok)
        {
            impl->close();
            report.error = error.isNotEmpty() ? error : report.error;
            report.result = OpenResult::failed;
        }
        return report;
    }
    catch (const SqliteError& e)
    {
        impl->close();
        into = Library();
        report.result = OpenResult::failed;
        report.error = e.what();
        return report;
    }
}

bool LibraryStore::othersHaveWritten()
{
    if (! isOpen())
        return false;
    try
    {
        return impl->readDataVersion() != impl->dataVersion;
    }
    catch (const SqliteError&)
    {
        return true;   // let a sync find out what is wrong and say so
    }
}

LibraryStore::SyncReport LibraryStore::write (Library& library)
{
    return run (library, false);
}

LibraryStore::SyncReport LibraryStore::sync (Library& library)
{
    return run (library, true);
}

LibraryStore::SyncReport LibraryStore::run (Library& library, bool readOthers)
{
    SyncReport report;
    if (! isOpen())
        return report;   // closed; the journal stays where it is

    if (! library.hasPendingChanges() && (! readOthers || ! othersHaveWritten()))
    {
        report.result = SyncResult::synced;
        return report;
    }

    auto& d = *impl;
    auto pending = library.takePendingChanges();
    try
    {
        const bool writing = ! pending.isEmpty();
        Transaction transaction (d.connection, writing);
        auto rev = d.database->currentRev();
        std::set<juce::String> written;   // records and collections this sync wrote

        if (writing)
        {
            ++rev;
            // In library order, not the journal's (which is sorted by id): a new record's place in
            // the library is the order it is written in, and a UUID is no order at all.
            std::set<juce::String> writtenWhole;
            for (const auto& record : library.allRecords())
            {
                const auto pendingFields = pending.records.find (record.recordId);
                if (pendingFields == pending.records.end())
                    continue;
                const auto fields = pendingFields->second;
                written.insert (record.recordId);

                if ((fields & F::created) != 0)
                {
                    d.database->writeWhole (record, rev);
                    writtenWhole.insert (record.recordId);
                }
                else if (! d.database->writeFields (record, fields, rev)
                         && (fields & ~F::missing) != 0)
                {
                    // The row is gone: another process removed this record after this one last
                    // read. A deliberate edit here brings it back, since it is the newer word on
                    // the sound; a rescan marking it missing is not, and lets the removal stand.
                    d.database->writeWhole (record, rev);
                    writtenWhole.insert (record.recordId);
                }
            }

            // Counts are added, not written: two processes counting one audition each make two.
            // A row written whole already carries this process's counts, and a row that is gone
            // stays gone — a play count is not a reason to bring back a removed sound. (Every id
            // here is in memory: removing a record takes its counts out of the journal.)
            for (const auto& [id, delta] : pending.usage)
                if (writtenWhole.count (id) == 0 && d.database->addUsage (id, delta, rev))
                    written.insert (id);

            for (const auto& id : pending.removedRecords)
            {
                d.database->removeRecord (id, rev);
                written.insert (id);
            }

            for (const auto& collection : library.allSmartCollections())
                if (pending.smartCollections.count (collection.collectionId) > 0)
                {
                    d.database->writeCollection (collection, rev);
                    written.insert (collection.collectionId);
                }

            for (const auto& id : pending.removedSmartCollections)
            {
                d.database->removeCollection (id, rev);
                written.insert (id);
            }

            d.database->setRev (rev);
            report.written = (int) written.size();
        }

        if (readOthers)
            report.changedByOthers = d.database->pull (library.records, library.smartCollections, d.seenRev);
        transaction.commit();

        // Only a read moves the marks. After a write alone, this process has not seen what others
        // wrote before it, and the next sync must still read from where the last read stopped.
        if (readOthers)
        {
            d.seenRev = rev;
            d.dataVersion = d.readDataVersion();
        }
        report.result = SyncResult::synced;
    }
    catch (const SqliteError& e)
    {
        // Nothing was written (the transaction rolled back), so the journal goes back whole. What
        // the pull may already have put in memory is either another process's committed work or
        // this process's own values, so it is true either way, and reading it again is harmless.
        library.restorePendingChanges (std::move (pending));
        report.result = e.primary() == SQLITE_BUSY || e.primary() == SQLITE_LOCKED ? SyncResult::busy
                                                                                   : SyncResult::failed;
        report.error = e.what();
    }
    return report;
}

} // namespace ceditor::host
