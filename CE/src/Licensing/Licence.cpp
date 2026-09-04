#include "Licence.h"
#include <juce_cryptography/juce_cryptography.h>

namespace ceditor::licensing
{

namespace
{
    /** The message the signature actually covers: the SHA-256 of the canonical form, as a
        BigInteger. Hashing first is what makes the signature independent of document length,
        which matters because RSAKey works on one integer. */
    juce::BigInteger digestOf (const juce::String& canonical)
    {
        const juce::SHA256 hash (canonical.toRawUTF8(), (size_t) canonical.getNumBytesAsUTF8());
        const auto raw = hash.getRawData();

        juce::BigInteger value;
        value.loadFromMemoryBlock (raw);
        return value;
    }

    void appendField (juce::String& out, const char* key, const juce::String& value)
    {
        // The canonical form is deliberately NOT JSON. A JSON serializer is free to reorder
        // keys, change number formatting or escape differently between versions, and any of
        // those would break every licence ever issued. This is a fixed field order with a
        // separator that cannot appear unescaped in a value.
        out << key << '\x1f' << value.replace ("\x1f", " ") << '\x1e';
    }
}

juce::String editionName (Edition edition)
{
    switch (edition)
    {
        case Edition::founder: return "founder";
        case Edition::core:    return "core";
        case Edition::pro:     return "pro";
        case Edition::free:    break;
    }
    return "free";
}

Edition editionFromName (const juce::String& name)
{
    if (name == "founder") return Edition::founder;
    if (name == "core")    return Edition::core;
    if (name == "pro")     return Edition::pro;

    // Deliberately permissive in the safe direction: an edition this build does not know
    // reads as free, which is a working product, rather than as a lockout.
    return Edition::free;
}

int editionRank (Edition edition)
{
    switch (edition)
    {
        case Edition::free:    return 0;
        // Founder is Core at a founder's price (§26.2) — the same entitlements, so the same
        // rank. Keeping it a separate name matters only for what the product calls the person.
        case Edition::founder: return 1;
        case Edition::core:    return 1;
        case Edition::pro:     return 2;
    }
    return 0;
}

juce::String LicenceDocument::canonicalForm() const
{
    juce::String out;
    appendField (out, "productId",    productId);
    appendField (out, "licensee",     licensee);
    appendField (out, "email",        email);
    appendField (out, "orderId",      orderId);
    appendField (out, "edition",      editionName (edition));
    appendField (out, "activations",  juce::String (activations));
    appendField (out, "issuedAt",     issuedAt);
    appendField (out, "updatesUntil", updatesUntil);
    appendField (out, "sunset",       sunset ? "1" : "0");
    return out;
}

juce::var LicenceDocument::toVar() const
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("productId",    productId);
    obj->setProperty ("licensee",     licensee);
    obj->setProperty ("email",        email);
    obj->setProperty ("orderId",      orderId);
    obj->setProperty ("edition",      editionName (edition));
    obj->setProperty ("activations",  activations);
    obj->setProperty ("issuedAt",     issuedAt);
    obj->setProperty ("updatesUntil", updatesUntil);
    obj->setProperty ("sunset",       sunset);
    return juce::var (obj);
}

LicenceDocument LicenceDocument::fromVar (const juce::var& value)
{
    LicenceDocument document;
    document.productId    = value.getProperty ("productId", {}).toString();
    document.licensee     = value.getProperty ("licensee", {}).toString();
    document.email        = value.getProperty ("email", {}).toString();
    document.orderId      = value.getProperty ("orderId", {}).toString();
    document.edition      = editionFromName (value.getProperty ("edition", {}).toString());
    document.activations  = juce::jlimit (1, 100, (int) value.getProperty ("activations", 3));
    document.issuedAt     = value.getProperty ("issuedAt", {}).toString();
    document.updatesUntil = value.getProperty ("updatesUntil", {}).toString();
    document.sunset       = (bool) value.getProperty ("sunset", false);
    return document;
}

juce::String signDocument (const LicenceDocument& document, const juce::String& privateKey)
{
    const juce::RSAKey key (privateKey);
    if (! key.isValid())
        return {};

    auto value = digestOf (document.canonicalForm());
    key.applyToValue (value);
    return value.toString (16);
}

juce::var makeLicenceFile (const LicenceDocument& document, const juce::String& privateKey)
{
    auto* root = new juce::DynamicObject();
    root->setProperty ("licence",   document.toVar());
    root->setProperty ("signature", signDocument (document, privateKey));
    return juce::var (root);
}

LicenceStatus verifyLicenceFile (const juce::var& licenceFile,
                                 const juce::String& publicKey,
                                 const juce::String& expectedProductId,
                                 juce::Time now)
{
    LicenceStatus status;

    const auto document = LicenceDocument::fromVar (licenceFile.getProperty ("licence", {}));
    const auto signature = licenceFile.getProperty ("signature", {}).toString();

    if (document.productId.isEmpty() || signature.isEmpty())
    {
        status.detail = "This file is not a licence.";
        return status;
    }

    status.document = document;

    const juce::RSAKey key (publicKey);
    if (! key.isValid())
    {
        // A build with no public key cannot verify anything. It says so rather than treating
        // every licence as forged, because the fault is the build's.
        status.detail = "This build carries no licence key, so nothing can be verified.";
        return status;
    }

    juce::BigInteger recovered;
    recovered.parseString (signature, 16);
    key.applyToValue (recovered);

    if (recovered != digestOf (document.canonicalForm()))
    {
        status.state = LicenceStatus::State::tampered;
        status.detail = "This licence does not match its signature — it has been edited, or it "
                        "was not issued for this product.";
        return status;
    }

    // The sunset key licenses everything, on purpose (§19's documented unlock policy, made
    // executable). It is checked before the product match because it is not for a product.
    if (document.sunset && document.productId == "*")
    {
        status.state = LicenceStatus::State::sunsetUnlocked;
        status.detail = "Unlocked by the published sunset key. This install is licensed "
                        "permanently and needs nothing further.";
        return status;
    }

    if (expectedProductId.isNotEmpty() && document.productId != expectedProductId)
    {
        status.state = LicenceStatus::State::wrongProduct;
        status.detail = "This is a genuine licence for " + document.productId
                          + ", which is not this product.";
        return status;
    }

    if (document.updatesUntil.isNotEmpty())
    {
        const auto until = juce::Time::fromISO8601 (document.updatesUntil);

        // An unparseable date is treated as no limit rather than as an expiry. Getting this
        // backwards would turn a typo in a licence into a customer who thinks they lost
        // something they paid for.
        if (until.toMilliseconds() > 0 && now > until)
        {
            status.state = LicenceStatus::State::updatesExpired;
            status.detail = "Licensed. Updates released after "
                              + until.formatted ("%d %B %Y")
                              + " are not included — this version keeps working for good.";
            return status;
        }
    }

    status.state = LicenceStatus::State::licensed;
    status.detail = "Licensed to " + (document.licensee.isNotEmpty() ? document.licensee
                                                                     : document.email) + ".";
    return status;
}

Edition LicenceStatus::edition() const
{
    if (state == State::sunsetUnlocked)
        return Edition::pro;   // the unlock is unconditional, so it is the top of the ladder

    return verified() ? document.edition : Edition::free;
}

bool LicenceStatus::updatesIncluded() const
{
    if (state == State::sunsetUnlocked)
        return true;

    return state == State::licensed;
}

} // namespace ceditor::licensing
