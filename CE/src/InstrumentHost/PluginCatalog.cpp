#include "PluginCatalog.h"

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
        obj->setProperty ("descriptionXml", c.descriptionXml);
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
        c.descriptionXml = v.getProperty ("descriptionXml", {}).toString();
        return c;
    }
}

bool PluginCatalog::loadFrom (const juce::File& file)
{
    modules.clear();

    if (! file.existsAsFile())
        return true;

    const auto parsed = juce::JSON::parse (file.loadFileAsString());
    if (! parsed.isObject())
        return false;

    const auto storedModules = parsed.getProperty ("modules", {});
    const auto* arr = storedModules.getArray();
    if (arr == nullptr)
        return false;

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

        if (const auto* classes = m.getProperty ("classes", {}).getArray())
            for (const auto& c : *classes)
                rec.classes.add (classFromVar (c));

        if (rec.path.isNotEmpty())
            modules.add (std::move (rec));
    }

    return true;
}

bool PluginCatalog::saveTo (const juce::File& file) const
{
    juce::Array<juce::var> moduleVars;

    for (const auto& rec : modules)
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("path",              rec.path);
        obj->setProperty ("fingerprint",       rec.fingerprint);
        obj->setProperty ("lastScanned",       rec.lastScanned);
        obj->setProperty ("missing",           rec.missing);
        obj->setProperty ("quarantined",       rec.quarantined);
        obj->setProperty ("failureCount",      rec.failureCount);
        obj->setProperty ("lastFailureReason", rec.lastFailureReason);

        juce::Array<juce::var> classVars;
        for (const auto& c : rec.classes)
            classVars.add (classToVar (c));
        obj->setProperty ("classes", classVars);

        moduleVars.add (juce::var (obj));
    }

    auto* root = new juce::DynamicObject();
    root->setProperty ("version", 1);
    root->setProperty ("modules", moduleVars);

    if (! file.getParentDirectory().createDirectory())
        return false;

    return file.replaceWithText (juce::JSON::toString (juce::var (root)));
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
    for (const auto& rec : modules)
        if (rec.path == modulePath)
            return &rec;
    return nullptr;
}

ModuleRecord* PluginCatalog::find (const juce::String& modulePath)
{
    for (auto& rec : modules)
        if (rec.path == modulePath)
            return &rec;
    return nullptr;
}

juce::Array<PluginClassRecord> PluginCatalog::instrumentClasses() const
{
    juce::Array<PluginClassRecord> out;

    for (const auto& rec : modules)
    {
        if (rec.missing || rec.quarantined)
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
        if (rec.missing || rec.quarantined)
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

} // namespace ceditor::host
