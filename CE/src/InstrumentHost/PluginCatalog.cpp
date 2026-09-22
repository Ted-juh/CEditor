#include "PluginCatalog.h"
#include "AtomicFileWrite.h"

#include <mutex>

namespace ceditor::host
{

namespace
{
    juce::var classToVar (const PluginClassRecord& c)
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("ceId",           c.ceId);
        obj->setProperty ("name",           c.name);
        obj->setProperty ("vendor",         c.vendor);
        obj->setProperty ("version",        c.version);
        obj->setProperty ("category",       c.category);
        obj->setProperty ("isInstrument",   c.isInstrument);
        obj->setProperty ("formatName",     c.formatName);
        obj->setProperty ("descriptionXml", c.descriptionXml);
        obj->setProperty ("snapshotPath", c.snapshotPath);
        return juce::var (obj);
    }

    PluginClassRecord classFromVar (const juce::var& v)
    {
        PluginClassRecord c;
        c.ceId           = v.getProperty ("ceId", {}).toString();
        c.name           = v.getProperty ("name", {}).toString();
        c.vendor         = v.getProperty ("vendor", {}).toString();
        c.version        = v.getProperty ("version", {}).toString();
        c.category       = v.getProperty ("category", {}).toString();
        c.isInstrument   = (bool) v.getProperty ("isInstrument", false);
        // Absent = a catalogue written before formats were named, and everything in one is VST3.
        c.formatName     = v.getProperty ("formatName", "VST3").toString();
        c.descriptionXml = v.getProperty ("descriptionXml", {}).toString();
        c.snapshotPath   = v.getProperty ("snapshotPath", {}).toString();
        return c;
    }

    /** The first `numBytes` of a file, or fewer if that is all there is. Binary headers are
        tiny and we never want the whole plug-in in memory. */
    juce::MemoryBlock readHead (const juce::File& file, int numBytes)
    {
        juce::MemoryBlock block;
        juce::FileInputStream in (file);
        if (in.openedOk())
            in.readIntoMemoryBlock (block, numBytes);
        return block;
    }

    juce::uint32 leWord (const juce::MemoryBlock& b, size_t offset, size_t width)
    {
        if (offset + width > b.getSize())
            return 0;

        const auto* bytes = static_cast<const juce::uint8*> (b.getData());
        juce::uint32 value = 0;
        for (size_t i = 0; i < width; ++i)
            value |= (juce::uint32) bytes[offset + i] << (8 * i);
        return value;
    }

    /** A bare module names its architecture in its own header. Three formats, because the
        product is Windows and the tests run on Linux and the platform matrix contemplates a
        macOS port — and reading three magic numbers is cheaper than pretending the other two
        do not exist. An unrecognised header returns empty: "could not tell". */
    juce::String architectureFromBinaryHeader (const juce::File& file)
    {
        const auto head = readHead (file, 4096);
        if (head.getSize() < 8)
            return {};

        const auto* bytes = static_cast<const juce::uint8*> (head.getData());

        // PE (Windows). The DOS stub points at the PE header; IMAGE_FILE_HEADER.Machine is the
        // two bytes after the four-byte signature.
        if (bytes[0] == 'M' && bytes[1] == 'Z')
        {
            const auto peOffset = (size_t) leWord (head, 0x3C, 4);
            if (peOffset + 6 <= head.getSize() && leWord (head, peOffset, 4) == 0x00004550) // "PE\0\0"
            {
                switch (leWord (head, peOffset + 4, 2))
                {
                    case 0x014c: return "x86";
                    case 0x8664: return "x86_64";
                    case 0xaa64: return "arm64";
                    default:     return {};
                }
            }
            return {};
        }

        // ELF (Linux). e_machine is a halfword at 0x12; the file's own endianness is at 0x05,
        // and a cross-endian plug-in is not a case this host can run anyway.
        if (bytes[0] == 0x7f && bytes[1] == 'E' && bytes[2] == 'L' && bytes[3] == 'F')
        {
            if (bytes[5] != 1)  // not little-endian
                return {};

            switch (leWord (head, 0x12, 2))
            {
                case 0x03: return "x86";
                case 0x3e: return "x86_64";
                case 0xb7: return "arm64";
                default:   return {};
            }
        }

        // Mach-O (macOS), thin only — a fat binary is a wrapper around several of these and a
        // bundle is how VST3 carries one, so the directory walk below covers that case.
        const auto machMagic = leWord (head, 0, 4);
        if (machMagic == 0xfeedface || machMagic == 0xfeedfacf)
        {
            switch (leWord (head, 4, 4))
            {
                case 0x00000007: return "x86";
                case 0x01000007: return "x86_64";
                case 0x0100000c: return "arm64";
                default:         return {};
            }
        }

        return {};
    }

    /** VST3 bundles name their slices: Contents/x86_64-win, Contents/x86-win,
        Contents/aarch64-linux, Contents/MacOS. Everything before the first '-' is the
        architecture, spelled the way the VST3 SDK spells it. */
    juce::String architectureFromSliceDirectory (const juce::String& directoryName)
    {
        const auto arch = directoryName.upToFirstOccurrenceOf ("-", false, false).toLowerCase();

        if (arch == "x86_64" || arch == "x86-64")      return "x86_64";
        if (arch == "x86" || arch == "i386")           return "x86";
        if (arch == "arm64" || arch == "aarch64")      return "arm64";

        return {};
    }
}

PluginSnapshotRegistry& PluginSnapshotRegistry::instance()
{
    static PluginSnapshotRegistry registry;
    return registry;
}

juce::String PluginSnapshotRegistry::publish (const juce::String& ceId, const juce::File& snapshot)
{
    if (ceId.isEmpty() || ! snapshot.existsAsFile())
        return {};

    // Derived from the class identity, so the same plug-in keeps the same URL across restarts
    // and the frontend can cache it. Opaque on purpose: it names nothing about the filesystem.
    const auto token = juce::String::toHexString (ceId.hashCode64());
    const juce::ScopedLock guard (lock);
    pathsByToken.set (token, snapshot.getFullPathName());
    return token;
}

juce::File PluginSnapshotRegistry::resolve (const juce::String& token) const
{
    const juce::ScopedLock guard (lock);
    return pathsByToken.contains (token) ? juce::File (pathsByToken[token]) : juce::File();
}

bool ModuleRecord::architectureSupported() const
{
    // Nothing read means nothing to object to. A module we could not identify is offered and
    // allowed to fail honestly at load time, which is better than hiding a working plug-in.
    // The same reading applies from the other side: a host build whose own architecture this
    // code does not recognise must not conclude that every plug-in is wrong.
    const auto host = PluginCatalog::hostArchitecture();
    if (architectures.isEmpty() || host.isEmpty())
        return true;

    return architectures.contains (host);
}

juce::String ModuleRecord::unavailableReason() const
{
    if (missing)
        return "not where it was last seen";

    if (quarantined)
        return lastFailureReason.isNotEmpty() ? "quarantined (" + lastFailureReason + ")"
                                              : juce::String ("quarantined");

    if (! architectureSupported())
        return "built for " + architectures.joinIntoString (", ") + ", this host is "
                 + PluginCatalog::hostArchitecture();

    return {};
}

bool PluginCatalog::loadFrom (const juce::File& file)
{
    modules.clear();
    baselineModules.clear();
    baselinePath = file.getFullPathName();
    baselineText.clear();
    hasFileBaseline = true;
    baselineFileExisted = file.existsAsFile();
    saveBlocked = false;
    saveFailure = SaveFailure::none;

    if (! baselineFileExisted)
        return true;

    const auto text = file.loadFileAsString();
    juce::var parsed;
    if (text.isEmpty() || juce::JSON::parse (text, parsed).failed() || ! parsed.isObject())
    {
        saveBlocked = true;
        return false;
    }

    const auto version = (int) parsed.getProperty ("version", 1);
    if (version > 1)
    {
        saveBlocked = true;
        saveFailure = SaveFailure::newerSchema;
        return false;
    }

    const auto storedModules = parsed.getProperty ("modules", {});
    const auto* arr = storedModules.getArray();
    if (arr == nullptr)
    {
        saveBlocked = true;
        return false;
    }

    for (const auto& m : *arr)
    {
        ModuleRecord rec;
        rec.path              = m.getProperty ("path", {}).toString();
        rec.fingerprint       = m.getProperty ("fingerprint", {}).toString();
        rec.lastScanned       = m.getProperty ("lastScanned", {}).toString();
        rec.missing           = (bool) m.getProperty ("missing", false);
        rec.quarantined       = (bool) m.getProperty ("quarantined", false);
        rec.failureCount      = (int)  m.getProperty ("failureCount", 0);
        rec.lastFailureReason = m.getProperty ("lastFailureReason", {}).toString();

        if (const auto* archs = m.getProperty ("architectures", {}).getArray())
            for (const auto& a : *archs)
                rec.architectures.addIfNotAlreadyThere (a.toString());

        if (const auto* classes = m.getProperty ("classes", {}).getArray())
            for (const auto& c : *classes)
                rec.classes.add (classFromVar (c));

        if (rec.path.isNotEmpty())
            modules.add (std::move (rec));
    }

    baselineModules = modules;
    baselineText = text;
    return true;
}

namespace
{
juce::var moduleToVar (const ModuleRecord& rec)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("path",              rec.path);
    obj->setProperty ("fingerprint",       rec.fingerprint);
    obj->setProperty ("lastScanned",       rec.lastScanned);
    obj->setProperty ("missing",           rec.missing);
    obj->setProperty ("quarantined",       rec.quarantined);
    obj->setProperty ("failureCount",      rec.failureCount);
    obj->setProperty ("lastFailureReason", rec.lastFailureReason);

    juce::Array<juce::var> archVars;
    for (const auto& a : rec.architectures)
        archVars.add (a);
    obj->setProperty ("architectures", archVars);

    juce::Array<juce::var> classVars;
    for (const auto& c : rec.classes)
        classVars.add (classToVar (c));
    obj->setProperty ("classes", classVars);
    return juce::var (obj);
}

juce::String catalogText (const juce::Array<ModuleRecord>& records)
{
    juce::Array<juce::var> moduleVars;
    for (const auto& rec : records)
        moduleVars.add (moduleToVar (rec));
    auto* root = new juce::DynamicObject();
    root->setProperty ("version", 1);
    root->setProperty ("modules", moduleVars);
    return juce::JSON::toString (juce::var (root));
}

juce::String moduleKey (juce::String path)
{
    path = path.replaceCharacter ('\\', '/');
    while (path.endsWithChar ('/')) path = path.dropLastCharacters (1);
   #if JUCE_WINDOWS || JUCE_MAC
    path = path.toLowerCase();
   #endif
    return path;
}

const ModuleRecord* findRecord (const juce::Array<ModuleRecord>& records, const juce::String& path)
{
    const auto key = moduleKey (path);
    for (const auto& record : records)
        if (moduleKey (record.path) == key)
            return &record;
    return nullptr;
}

ModuleRecord* findRecord (juce::Array<ModuleRecord>& records, const juce::String& path)
{
    const auto key = moduleKey (path);
    for (auto& record : records)
        if (moduleKey (record.path) == key)
            return &record;
    return nullptr;
}

bool sameModule (const ModuleRecord& a, const ModuleRecord& b)
{
    return juce::JSON::toString (moduleToVar (a)) == juce::JSON::toString (moduleToVar (b));
}

void mergeChangedModule (juce::Array<ModuleRecord>& disk, const ModuleRecord& current,
                         const ModuleRecord* baseline)
{
    auto* target = findRecord (disk, current.path);
    if (target == nullptr)
    {
        disk.add (current);
        return;
    }

    const bool scanChanged = baseline == nullptr || current.lastScanned != baseline->lastScanned;
    const bool diskFailureChanged = baseline == nullptr
                                      ? target->failureCount > 0 || target->quarantined
                                      : target->failureCount != baseline->failureCount
                                          || target->quarantined != baseline->quarantined;
    if (scanChanged && (target->lastScanned.isEmpty()
                         || current.lastScanned.compare (target->lastScanned) >= 0))
    {
        target->path = current.path;
        target->fingerprint = current.fingerprint;
        target->lastScanned = current.lastScanned;
        target->missing = current.missing;
        target->classes = current.classes;
        if (! diskFailureChanged)
        {
            target->quarantined = current.quarantined;
            target->failureCount = current.failureCount;
            target->lastFailureReason = current.lastFailureReason;
        }
    }

    if (baseline == nullptr || current.architectures != baseline->architectures)
        target->architectures = current.architectures;
    if (baseline == nullptr || current.missing != baseline->missing)
        target->missing = current.missing;

    const int baselineFailures = baseline != nullptr ? baseline->failureCount : 0;
    if (current.failureCount > baselineFailures)
    {
        target->failureCount += current.failureCount - baselineFailures;
        target->fingerprint = current.fingerprint;
        target->missing = false;
        target->lastFailureReason = current.lastFailureReason;
        target->quarantined = target->quarantined || current.quarantined;
    }

    // A falling failure count without a new scan is the explicit clear-quarantine command.
    // It is the only stale operation allowed to clear a quarantine written by another instance.
    const bool explicitClear = baseline != nullptr && baseline->quarantined
                                && ! current.quarantined && ! scanChanged;
    if (explicitClear)
    {
        target->quarantined = false;
        target->failureCount = 0;
        target->lastFailureReason.clear();
        target->fingerprint.clear();
    }
}
}

bool PluginCatalog::saveTo (const juce::File& file)
{
    if (saveBlocked)
    {
        if (saveFailure != SaveFailure::newerSchema)
            saveFailure = SaveFailure::unreadableSource;
        return false;
    }

    static std::mutex inProcessSaveMutex;
    const std::scoped_lock inProcessLock (inProcessSaveMutex);

    auto lockPath = file.getFullPathName();
   #if JUCE_WINDOWS
    lockPath = lockPath.toLowerCase();
   #endif
    juce::InterProcessLock processLock (
        "CEditorPluginCatalog-" + juce::String::toHexString (lockPath.hashCode64()));
    if (! processLock.enter (1000))
    {
        saveFailure = SaveFailure::lockUnavailable;
        return false;
    }
    struct Unlock { juce::InterProcessLock& lock; ~Unlock() { lock.exit(); } } unlock { processLock };

    juce::Array<ModuleRecord> merged;
    const bool existsNow = file.existsAsFile();
    const auto textNow = existsNow ? file.loadFileAsString() : juce::String();
    const bool sameBaseline = hasFileBaseline && baselinePath == file.getFullPathName()
                              && existsNow == baselineFileExisted
                              && (! existsNow || textNow == baselineText);

    if (sameBaseline)
    {
        merged = modules;
    }
    else if (existsNow)
    {
        PluginCatalog disk;
        if (! disk.loadFrom (file))
        {
            saveFailure = disk.lastSaveFailure() == SaveFailure::newerSchema
                            ? SaveFailure::newerSchema : SaveFailure::unreadableSource;
            return false;
        }
        merged = disk.modules;
        for (const auto& current : modules)
        {
            const auto* baseline = findRecord (baselineModules, current.path);
            if (baseline == nullptr || ! sameModule (current, *baseline))
                mergeChangedModule (merged, current, baseline);
        }
    }
    else
    {
        merged = modules;
    }

    if (! file.getParentDirectory().createDirectory())
    {
        saveFailure = SaveFailure::writeFailed;
        return false;
    }

    const auto text = catalogText (merged);
    if (! ceditor::writeTextAtomically (file, text))
    {
        saveFailure = SaveFailure::writeFailed;
        return false;
    }

    modules = merged;
    baselineModules = modules;
    baselinePath = file.getFullPathName();
    baselineText = text;
    hasFileBaseline = true;
    baselineFileExisted = true;
    saveFailure = SaveFailure::none;
    return true;
}

void PluginCatalog::commitScanResult (const ModuleScanResult& result, juce::Time when)
{
    auto* rec = find (result.modulePath);
    if (rec == nullptr)
    {
        modules.add (ModuleRecord());
        rec = &modules.getReference (modules.size() - 1);
        rec->path = result.modulePath;
    }

    rec->fingerprint       = result.fingerprint;
    rec->lastScanned       = when.toISO8601 (true);
    rec->missing           = false;
    rec->quarantined       = false;
    rec->failureCount      = 0;
    rec->lastFailureReason = {};
    rec->classes           = result.classes;
}

void PluginCatalog::recordFailure (const juce::String& modulePath,
                                   const juce::String& fingerprint,
                                   const juce::String& reason,
                                   bool quarantineNow)
{
    auto* rec = find (modulePath);
    if (rec == nullptr)
    {
        modules.add (ModuleRecord());
        rec = &modules.getReference (modules.size() - 1);
        rec->path = modulePath;
    }

    rec->fingerprint = fingerprint;
    rec->missing     = false;
    rec->failureCount += 1;
    rec->lastFailureReason = reason;
    if (quarantineNow)
        rec->quarantined = true;
}

void PluginCatalog::recordArchitectures (const juce::String& modulePath,
                                         const juce::StringArray& architectures)
{
    auto* rec = find (modulePath);
    if (rec == nullptr)
    {
        // First sighting. A module the browser will refuse still belongs in the catalogue —
        // "it is not in the list" with no record anywhere is the unanswerable support question.
        modules.add (ModuleRecord());
        rec = &modules.getReference (modules.size() - 1);
        rec->path = modulePath;
    }

    rec->architectures = architectures;
}

void PluginCatalog::clearQuarantine (const juce::String& modulePath)
{
    if (auto* rec = find (modulePath))
    {
        rec->quarantined = false;
        rec->failureCount = 0;
        rec->lastFailureReason = {};
        // The stored fingerprint is from the failed pass; keeping it would let needsRescan
        // call the module "unchanged" and the manual retry would never actually run.
        rec->fingerprint = {};
    }
}

bool PluginCatalog::needsRescan (const juce::String& modulePath,
                                 const juce::String& currentFingerprint) const
{
    const auto* rec = findModule (modulePath);

    if (rec == nullptr)
        return true;

    if (rec->quarantined)
        return false;

    // The worker cannot load what this host cannot load. Scanning anyway costs a process
    // launch and comes back as a failure that reads like a broken plug-in.
    if (! rec->architectureSupported())
        return false;

    if (rec->missing)
        return true;

    // A module whose last pass failed is retried on every pass until it succeeds or the
    // failures reach quarantine — an unchanged fingerprint must not freeze a transient
    // failure (a licence dialog, a busy file) into a permanent one.
    if (rec->failureCount > 0)
        return true;

    return rec->fingerprint != currentFingerprint;
}

void PluginCatalog::markMissingExcept (const juce::StringArray& presentPaths)
{
    for (auto& rec : modules)
        rec.missing = ! presentPaths.contains (rec.path);
}

const ModuleRecord* PluginCatalog::findModule (const juce::String& modulePath) const
{
    return findRecord (modules, modulePath);
}

ModuleRecord* PluginCatalog::find (const juce::String& modulePath)
{
    return findRecord (modules, modulePath);
}

juce::Array<PluginClassRecord> PluginCatalog::instrumentClasses() const
{
    juce::Array<PluginClassRecord> out;

    for (const auto& rec : modules)
    {
        if (rec.unavailableReason().isNotEmpty())
            continue;

        for (const auto& c : rec.classes)
            if (c.isInstrument)
                out.add (c);
    }

    return out;
}

juce::Array<PluginClassRecord> PluginCatalog::effectClasses() const
{
    juce::Array<PluginClassRecord> out;

    for (const auto& rec : modules)
    {
        if (rec.unavailableReason().isNotEmpty())
            continue;

        for (const auto& c : rec.classes)
            if (! c.isInstrument)
                out.add (c);
    }

    return out;
}

juce::String PluginCatalog::fingerprintFor (const juce::File& moduleFileOrBundle)
{
    juce::String accumulated;

    if (moduleFileOrBundle.existsAsFile())
    {
        accumulated << moduleFileOrBundle.getSize() << '|'
                    << moduleFileOrBundle.getLastModificationTime().toMilliseconds();
    }
    else if (moduleFileOrBundle.isDirectory())
    {
        // Deterministic order: the iterator's order is filesystem-dependent, so collect and
        // sort by relative path before hashing.
        juce::StringArray lines;

        for (const auto& entry : juce::RangedDirectoryIterator (moduleFileOrBundle, true))
        {
            const auto f = entry.getFile();
            if (! f.existsAsFile())
                continue;

            lines.add (f.getRelativePathFrom (moduleFileOrBundle).replaceCharacter ('\\', '/')
                       + "|" + juce::String (f.getSize())
                       + "|" + juce::String (f.getLastModificationTime().toMilliseconds()));
        }

        lines.sort (false);
        accumulated = lines.joinIntoString ("\n");
    }
    else
    {
        return {};
    }

    // hashCode64 rather than a cryptographic digest: this is change detection, not integrity,
    // and juce_core is the whole dependency budget here (SHA256 lives in juce_cryptography).
    return juce::String::toHexString (accumulated.hashCode64());
}

juce::StringArray PluginCatalog::architecturesOf (const juce::File& moduleFileOrBundle)
{
    juce::StringArray found;

    if (moduleFileOrBundle.isDirectory())
    {
        // A bundle. The slice directories under Contents are the declaration; the binaries in
        // them are the confirmation, and a directory with nothing in it declares nothing.
        const auto contents = moduleFileOrBundle.getChildFile ("Contents");
        if (! contents.isDirectory())
            return found;

        for (const auto& entry : juce::RangedDirectoryIterator (contents, false, "*",
                                                                juce::File::findDirectories))
        {
            const auto slice = entry.getFile();
            if (! slice.containsSubDirectories()
                && slice.findChildFiles (juce::File::findFiles, false).isEmpty())
                continue;

            auto arch = architectureFromSliceDirectory (slice.getFileName());

            // macOS spells its slice "MacOS" and puts a fat binary inside, so read the binary.
            if (arch.isEmpty())
                for (const auto& binary : slice.findChildFiles (juce::File::findFiles, false))
                    if (arch = architectureFromBinaryHeader (binary); arch.isNotEmpty())
                        break;

            if (arch.isNotEmpty())
                found.addIfNotAlreadyThere (arch);
        }

        return found;
    }

    if (const auto arch = architectureFromBinaryHeader (moduleFileOrBundle); arch.isNotEmpty())
        found.add (arch);

    return found;
}

juce::String PluginCatalog::hostArchitecture()
{
   #if defined (__aarch64__) || defined (_M_ARM64)
    return "arm64";
   #elif defined (__x86_64__) || defined (_M_X64)
    return "x86_64";
   #elif defined (__i386__) || defined (_M_IX86)
    return "x86";
   #else
    // Unknown host architecture makes architectureSupported() compare against something no
    // module declares, which would hide every plug-in. Returning empty is the safe reading:
    // ModuleRecord treats an unmatched host the same way it treats an unread module.
    return {};
   #endif
}

} // namespace ceditor::host
