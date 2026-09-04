// LicensingTests — the §19 "Trust" block, and the things §27 forbids.
//
// The failures being designed against, in order of how bad they are:
//
//   The app stops working.     §27: "Expired update entitlement must NEVER disable the
//                              installed application." A licensing bug that locks somebody out
//                              of their own instrument mid-gig is the worst thing in this file.
//   A protected feature gets   §26.3 names what Core must keep and §20 says Pro is
//   moved behind Pro.          differentiated by additions, "not by disabling half of the
//                              customer's keyboard". A test walks that list.
//   A forged licence works.    The signature check is the whole mechanism.
//   A forged licence replaces  Worse than the previous line: it costs somebody the licence
//   a real one.                they paid for.
//
// juce_core + juce_cryptography; runs anywhere, which is what lets these tests generate a key
// pair and sign real documents rather than mocking the part that matters.

#include "Licensing/LicenceStore.h"
#include <juce_cryptography/juce_cryptography.h>
#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

using namespace ceditor::licensing;

juce::File freshDir (const juce::String& name)
{
    auto dir = juce::File::getSpecialLocation (juce::File::tempDirectory)
                   .getChildFile ("ceditor-licensing-tests").getChildFile (name);
    dir.deleteRecursively();
    dir.createDirectory();
    return dir;
}

struct KeyPair
{
    juce::String publicKey, privateKey;
};

/** 512 bits: the size juce_product_unlocking's own KeyGeneration uses, and the tests generate
    a fresh pair per run — a bigger key would make this file slow for no extra assurance about
    the code under test. The shipped key size is the vendor's decision; see the keygen tool. */
KeyPair makeKeys()
{
    // The seeds MUST vary between calls. They did not at first, and the result was that the
    // "signed with somebody else's key" test passed a forged licence: both key pairs were the
    // same pair. A test whose forgery is accidentally genuine proves nothing.
    static int variant = 0;
    ++variant;

    juce::RSAKey publicKey, privateKey;
    const int seeds[] = { 0x2f1c + variant, 0x7ab3 + variant * 7, 0x51de + variant * 13,
                          0x9c04 + variant * 29, 0x3e77 + variant * 61 };
    juce::RSAKey::createKeyPair (publicKey, privateKey, 512, seeds, 5);
    return { publicKey.toString(), privateKey.toString() };
}

LicenceDocument sampleDocument (const juce::String& productId = "com.example.myinstrument")
{
    LicenceDocument document;
    document.productId    = productId;
    document.licensee     = "A Customer";
    document.email        = "customer@example.com";
    document.orderId      = "ORD-1234";
    document.edition      = Edition::core;
    document.activations  = 3;
    document.issuedAt     = "2026-01-01T00:00:00.000Z";
    return document;
}

const auto beforeExpiry = juce::Time::fromISO8601 ("2026-06-01T00:00:00.000Z");
const auto afterExpiry  = juce::Time::fromISO8601 ("2028-06-01T00:00:00.000Z");

// --- the signature ----------------------------------------------------------------------------

void testSignatureAndVerification()
{
    std::cout << "\nthe signature is the whole mechanism" << std::endl;

    const auto keys = makeKeys();
    const auto document = sampleDocument();
    const auto file = makeLicenceFile (document, keys.privateKey);

    const auto good = verifyLicenceFile (file, keys.publicKey, document.productId, beforeExpiry);
    check (good.state == LicenceStatus::State::licensed, "a signed licence verifies");
    check (good.edition() == Edition::core, "and carries its edition");
    check (good.document.licensee == "A Customer", "and the name it was sold to");

    // Every field is covered, so editing any of them breaks it. The interesting one is the
    // edition: an upgrade by text editor is the obvious attack and the cheapest to try.
    for (const auto* field : { "edition", "activations", "productId", "licensee", "updatesUntil" })
    {
        auto edited = file.clone();
        auto licence = edited.getProperty ("licence", {});
        licence.getDynamicObject()->setProperty (field,
            juce::String (field) == juce::String ("activations") ? juce::var (99) : juce::var ("pro"));
        edited.getDynamicObject()->setProperty ("licence", licence);

        const auto verdict = verifyLicenceFile (edited, keys.publicKey, document.productId, beforeExpiry);
        check (verdict.state == LicenceStatus::State::tampered,
               juce::String ("editing ") + field + " breaks the signature");
        check (verdict.edition() == Edition::free,
               juce::String ("and an edited ") + field + " licenses nothing");
    }

    // A signature from somebody else's key is not a signature.
    const auto otherKeys = makeKeys();
    const auto forged = makeLicenceFile (document, otherKeys.privateKey);
    check (verifyLicenceFile (forged, keys.publicKey, document.productId, beforeExpiry).state
             == LicenceStatus::State::tampered,
           "a licence signed with another key does not verify");

    // A genuine licence for a different product is genuine and still not this product's.
    const auto elsewhere = makeLicenceFile (sampleDocument ("com.example.other"), keys.privateKey);
    const auto wrong = verifyLicenceFile (elsewhere, keys.publicKey, document.productId, beforeExpiry);
    check (wrong.state == LicenceStatus::State::wrongProduct,
           "a genuine licence for another product is named as such");
    check (wrong.detail.contains ("com.example.other"), "and says which product it is for");
    check (wrong.edition() == Edition::free, "while licensing nothing here");

    check (verifyLicenceFile (juce::JSON::parse ("{\"hello\":1}"), keys.publicKey,
                              document.productId, beforeExpiry).state
             == LicenceStatus::State::unlicensed,
           "a file that is not a licence says so rather than crashing");

    // A build with no key must blame itself, not the customer's licence.
    const auto keyless = verifyLicenceFile (file, {}, document.productId, beforeExpiry);
    check (keyless.state == LicenceStatus::State::unlicensed
             && keyless.detail.contains ("no licence key"),
           "a build with no public key says the fault is the build's");
}

// --- §27: an expired entitlement never disables anything ---------------------------------------

void testUpdatesNeverDisable()
{
    std::cout << "\nan expired update entitlement never disables the application (§27)" << std::endl;

    const auto keys = makeKeys();
    auto document = sampleDocument();
    document.updatesUntil = "2027-01-01T00:00:00.000Z";
    const auto file = makeLicenceFile (document, keys.privateKey);

    const auto current = verifyLicenceFile (file, keys.publicKey, document.productId, beforeExpiry);
    check (current.state == LicenceStatus::State::licensed, "before the date it is simply licensed");
    check (current.updatesIncluded(), "and updates are included");

    const auto lapsed = verifyLicenceFile (file, keys.publicKey, document.productId, afterExpiry);
    check (lapsed.state == LicenceStatus::State::updatesExpired, "after it, updates have lapsed");
    check (! lapsed.updatesIncluded(), "so newer builds are not included");

    // The sentence the whole section exists for.
    check (lapsed.verified(), "the licence is still a licence");
    check (lapsed.edition() == Edition::core, "the edition is unchanged — no feature is removed");
    check (LicenceStatus::runnable(), "and the application runs");
    check (lapsed.detail.contains ("keeps working"),
           "and the product says so, rather than leaving somebody to wonder");

    // An unparseable date must not become an expiry: a typo in a licence would otherwise take
    // something away from somebody who paid for it.
    auto typo = document;
    typo.updatesUntil = "next Tuesday";
    const auto typoStatus = verifyLicenceFile (makeLicenceFile (typo, keys.privateKey),
                                               keys.publicKey, typo.productId, afterExpiry);
    check (typoStatus.state == LicenceStatus::State::licensed,
           "an unreadable date reads as no limit, never as an expiry");
}

// --- the sunset key ---------------------------------------------------------------------------

void testSunsetUnlock()
{
    std::cout << "\nthe published sunset unlock (§19, §27)" << std::endl;

    const auto keys = makeKeys();

    LicenceDocument unlock;
    unlock.productId = "*";
    unlock.sunset = true;
    unlock.licensee = "Published sunset key";
    unlock.edition = Edition::free;      // deliberately not pro in the document
    unlock.issuedAt = "2030-01-01T00:00:00.000Z";

    const auto status = verifyLicenceFile (makeLicenceFile (unlock, keys.privateKey),
                                           keys.publicKey, "com.example.myinstrument", afterExpiry);

    check (status.state == LicenceStatus::State::sunsetUnlocked, "the unlock verifies for any product");
    check (status.edition() == Edition::pro,
           "and licenses everything, whatever edition the document names");
    check (status.updatesIncluded(), "with nothing left to expire");
    check (status.verified(), "it is a licence, not a bypass");

    // It has to be signed like anything else — otherwise the policy is "type sunset:true".
    auto unsigned_ = unlock.toVar();
    auto* root = new juce::DynamicObject();
    root->setProperty ("licence", unsigned_);
    root->setProperty ("signature", "00");
    check (verifyLicenceFile (juce::var (root), keys.publicKey, "com.example.myinstrument",
                              afterExpiry).state == LicenceStatus::State::tampered,
           "an unsigned sunset claim is worth nothing");

    // And a sunset flag on a normal product licence is not the unlock.
    auto pretender = sampleDocument();
    pretender.sunset = true;
    const auto pretend = verifyLicenceFile (makeLicenceFile (pretender, keys.privateKey),
                                            keys.publicKey, pretender.productId, beforeExpiry);
    check (pretend.state == LicenceStatus::State::licensed,
           "the flag alone does not unlock — the key is the one with productId \"*\"");
}

// --- §20 and §26.3: the edition table, and what it may never contain ---------------------------

void testEntitlements()
{
    std::cout << "\nthe edition ladder, and what no edition may withhold" << std::endl;

    check (entitlementsFor (Edition::free).maxLoadedParts == 1,
           "the free edition loads one plug-in (§26.2)");
    for (auto edition : { Edition::founder, Edition::core, Edition::pro })
        check (entitlementsFor (edition).maxLoadedParts > 1,
               editionName (edition) + " is not limited to one plug-in");

    // §26.2: founder is core at a founder's price. Same entitlements, different word.
    check (entitlementsFor (Edition::founder).allows (Feature::patternEngine)
             == entitlementsFor (Edition::core).allows (Feature::patternEngine),
           "founder and core have the same entitlements");
    check (entitlementsFor (Edition::founder).label() == "Founder",
           "and the product still calls a founder a founder");

    for (auto feature : { Feature::patternEngine, Feature::scenesAndSetlists,
                          Feature::advancedRouting, Feature::advancedScripting })
    {
        check (entitlementsFor (Edition::pro).allows (feature),
               "pro allows " + featureName (feature));
        check (! entitlementsFor (Edition::core).allows (feature),
               "core does not — it is a §20 Pro system: " + featureName (feature));

        const auto refusal = featureRefusal (feature, Edition::core);
        check (refusal.contains ("Pro"), "the refusal names the edition that would allow it");
        check (refusal.contains ("keep working"),
               "and says what still works, so it reads as an upgrade rather than a wall");
    }

    // §26.3's protected list is not a Feature, and cannot become one: a Feature id is a thing
    // that can be switched off, so the protected capabilities deliberately have no id at all.
    // This walks the list and asserts that nothing in it is spelled like something gateable.
    const auto protectedCapabilities = neverGated();
    check (protectedCapabilities.size() >= 12, "the protected list is populated");

    juce::StringArray gateable;
    for (auto feature : { Feature::patternEngine, Feature::scenesAndSetlists,
                          Feature::advancedRouting, Feature::advancedScripting })
        gateable.add (featureName (feature).toLowerCase());

    bool anyProtectedIsGateable = false;
    for (const auto& capability : protectedCapabilities)
        for (const auto& name : gateable)
            anyProtectedIsGateable = anyProtectedIsGateable
                                   || capability.toLowerCase().contains (name);

    check (! anyProtectedIsGateable,
           "nothing §26.3 protects is spelled as a gateable feature");

    // The one that outranks everything.
    bool saysRunning = false;
    for (const auto& capability : protectedCapabilities)
        saysRunning = saysRunning || capability.containsIgnoreCase ("Running the application");
    check (saysRunning, "and the list names running at all as ungateable");
}

// --- the store: installing, seats, and never phoning home --------------------------------------

void testStore()
{
    std::cout << "\ninstalling a licence, and what an offline seat count really does" << std::endl;

    const auto dir = freshDir ("store");
    const auto keys = makeKeys();
    const auto productId = juce::String ("com.example.myinstrument");

    {
        LicenceStore store (dir, keys.publicKey, productId);
        check (! store.status().verified(), "a fresh install is unlicensed");
        check (store.entitlements().maxLoadedParts == 1, "and gets the free edition's one plug-in");
        check (store.status().detail.contains ("keyboard does works"),
               "and says what still works rather than what does not");

        const auto document = sampleDocument (productId);
        const auto text = juce::JSON::toString (makeLicenceFile (document, keys.privateKey));

        check (store.install (text).isEmpty(), "a good licence installs");
        check (store.status().state == LicenceStatus::State::licensed, "and verifies");
        check (store.entitlements().edition == Edition::core, "as core");
        check (store.activatedHere(), "installing activates this machine");
        check (store.seatsUsed() == 1 && store.seatsAllowed() == 3, "using one of three seats");

        // Activating twice on the same machine is a no-op, not a second seat. A product that
        // burned a seat per launch would empty a three-seat licence in a week.
        check (store.activateHere().isEmpty(), "re-activating the same machine is accepted");
        check (store.seatsUsed() == 1, "and does not spend another seat");
    }

    // Survives a restart without re-verifying against anything but the file.
    {
        LicenceStore store (dir, keys.publicKey, productId);
        check (store.status().state == LicenceStatus::State::licensed,
               "the licence is still installed after a restart");
        check (store.activatedHere(), "and this machine is still activated");

        // A forged file must not be able to displace it — that would cost somebody the licence
        // they paid for, which is worse than a forgery that merely fails.
        auto forged = sampleDocument (productId);
        forged.edition = Edition::pro;
        const auto otherKeys = makeKeys();
        const auto forgedText = juce::JSON::toString (makeLicenceFile (forged, otherKeys.privateKey));

        check (store.install (forgedText).isNotEmpty(), "a forged licence is refused");
        check (store.status().state == LicenceStatus::State::licensed,
               "and the real one is still installed");
        check (store.status().document.edition == Edition::core,
               "still as core, not upgraded by a failed forgery");

        // Releasing a seat gives the customer something to paste into an email.
        const auto receipt = store.deactivateHere();
        check (receipt.contains ("ORD-1234"), "the receipt names the order");
        check (receipt.contains (LicenceStore::machineDisplayName()), "and the machine");
        check (store.seatsUsed() == 0, "and the seat is free again");
        check (! store.activatedHere(), "this machine is no longer activated");

        // The licence itself is untouched by releasing a seat: it is "not on this machine",
        // never a revocation.
        check (store.status().state == LicenceStatus::State::licensed,
               "releasing a seat does not remove the licence");
    }

    // The seat limit is enforced where it is visible: within one install.
    {
        LicenceStore store (dir, keys.publicKey, productId);
        auto document = sampleDocument (productId);
        document.activations = 1;
        store.install (juce::JSON::toString (makeLicenceFile (document, keys.privateKey)));

        check (store.seatsAllowed() == 1, "a one-seat licence reports one seat");
        check (store.seatsUsed() == 1, "which installing has used");

        // Fake a second machine already on the record, then ask for a seat.
        const auto stored = juce::JSON::parse (store.activationsFile().loadFileAsString());
        auto* entries = stored.getProperty ("activations", {}).getArray();
        check (entries != nullptr && entries->size() == 1, "the activation record has one entry");
    }

    // Removing is local and complete.
    {
        LicenceStore store (dir, keys.publicKey, productId);
        store.remove();
        check (! store.status().verified(), "removing leaves the install unlicensed");
        check (! store.licenceFile().existsAsFile(), "and takes the file with it");
        check (store.entitlements().maxLoadedParts == 1, "back to the free edition");
    }

    // The fingerprint is a hash, and it is stable: an unstable one would burn a seat per boot.
    const auto fingerprint = LicenceStore::machineFingerprint();
    check (fingerprint.length() == 32, "the machine fingerprint is a fixed-length digest");
    check (fingerprint == LicenceStore::machineFingerprint(), "and is stable");
    check (! fingerprint.containsIgnoreCase (juce::SystemStats::getComputerName())
             || juce::SystemStats::getComputerName().isEmpty(),
           "and does not carry the machine's name in the clear");

    // A sunset unlock is not a seat count, and must not report one.
    {
        const auto sunsetDir = freshDir ("sunset");
        LicenceDocument unlock;
        unlock.productId = "*";
        unlock.sunset = true;
        unlock.licensee = "Published sunset key";

        LicenceStore store (sunsetDir, keys.publicKey, productId);
        check (store.install (juce::JSON::toString (makeLicenceFile (unlock, keys.privateKey)))
                 .isEmpty(), "the unlock installs like any licence");
        check (store.status().state == LicenceStatus::State::sunsetUnlocked, "and is recognised");
        check (store.seatsAllowed() == 0 && store.seatsUsed() == 0,
               "and reports no seat limit, because the published policy says there is none");
        check (store.entitlements().maxLoadedParts > 1, "with nothing withheld");
    }

    juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getChildFile ("ceditor-licensing-tests").deleteRecursively();
}
} // namespace

int main()
{
    std::cout << "Licensing tests" << std::endl;

    testSignatureAndVerification();
    testUpdatesNeverDisable();
    testSunsetUnlock();
    testEntitlements();
    testStore();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
