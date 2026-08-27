#pragma once

#include <juce_core/juce_core.h>

// Licence — the offline-verifiable entitlement document (§19 "Trust", §26.2, §27).
//
// The baseline is unusually specific about what this must NOT be, and the prohibitions shape
// the design more than the requirements do (§27, "Avoid"):
//
//   No mandatory subscription.          No online check-in required for every launch.
//   No one-computer-only activation.    No feature removal when payments stop.
//   No cloud-only preset storage.       No authorization server without a shutdown plan.
//
// and one sentence that governs everything below:
//
//   "Expired update entitlement must NEVER disable the installed application."
//
// So `updatesUntil` is an ENTITLEMENT, not an expiry. It decides whether a newer build is
// included in what was bought. It does not decide whether today's build runs, and there is no
// code path anywhere that lets it — see LicenceStatus::runnable(), which is a constant.
//
// OFFLINE-CAPABLE means the product verifies the licence itself: an RSA signature over the
// SHA-256 of the canonical document, checked against a public key baked into the build. No
// network, no server, no first-run handshake. A person can be handed a file on a USB stick in
// a room with no internet and be licensed.
//
// ON THE STRENGTH OF THIS. JUCE's RSAKey is a textbook RSA with no padding scheme, and this
// signs a hash with it — the same construction juce_product_unlocking's KeyGeneration uses.
// It is not, and is not claimed to be, resistant to a determined attacker: anyone willing to
// patch the binary does not need to forge a licence at all. What it IS good for is exactly
// what an honest licence check is for — telling a paying customer what they bought, and making
// casual copying take deliberate effort. Pretending otherwise would be the dishonest part.
//
// juce_core for the document, juce_cryptography for the two primitives. Runs anywhere, which
// is why the tests can sign and verify on the build machine.

namespace ceditor::licensing
{

/** The ladder from §26.2, in the order it climbs. Values are stable strings on disk — an
    unrecognised one reads as `free`, because a licence from a future build must leave the
    product usable rather than locked out by a word it does not know. */
enum class Edition
{
    free,       // §26.2's compatibility and bridge edition: the keyboard, one plug-in
    founder,    // €39 early access — the same entitlements as core, a different name on it
    core,       // €59
    pro         // €89
};

juce::String editionName (Edition edition);
Edition editionFromName (const juce::String& name);
/** For "you need X for this" sentences, and for deciding whether one edition covers another. */
int editionRank (Edition edition);

/** The signed document. Every field here is covered by the signature; nothing outside it is. */
struct LicenceDocument
{
    /** Which product this licence is for — the Host Project's appId. A licence for one
        generated instrument does not license another. `*` is reserved for the sunset key. */
    juce::String productId;

    juce::String licensee;     // the name it was sold to, shown in the product
    juce::String email;
    juce::String orderId;      // the merchant's reference, for support

    Edition edition = Edition::free;

    /** How many machines the purchase covers. §19 asks for "two or three personal
        activations"; the number lives in the licence so a bundle or a site deal is a
        different number rather than a different code path. */
    int activations = 3;

    juce::String issuedAt;     // ISO 8601
    /** Updates released up to this date are included. AFTER IT THE APPLICATION STILL RUNS —
        see the note at the top of this file. Empty means "no limit". */
    juce::String updatesUntil;

    /** The vendor's published unlock (§19's "documented sunset/unlock policy"). A document
        with this set and `productId == "*"` licenses every product, on every machine, for
        good. It exists so the policy is executable rather than only promised. */
    bool sunset = false;

    /** The exact bytes the signature covers. Deterministic: sorted keys, no whitespace, so a
        document that round-trips through JSON still verifies. */
    juce::String canonicalForm() const;

    juce::var toVar() const;
    static LicenceDocument fromVar (const juce::var& value);
};

/** What the product knows about its own licensing right now. */
struct LicenceStatus
{
    enum class State
    {
        unlicensed,        // nothing installed, or nothing that verified
        licensed,          // verified, and updates are current
        updatesExpired,    // verified; `updatesUntil` has passed. STILL FULLY RUNNING.
        sunsetUnlocked,    // the vendor's published unlock is installed
        wrongProduct,      // a genuine licence, for something else
        tampered           // a document whose signature does not match its contents
    };

    State state = State::unlicensed;
    LicenceDocument document;
    juce::String detail;       // one sentence a person can act on

    /** The edition actually in force. Anything that did not verify is `free`, which is a full
        edition rather than a lockout — §26.2's free tier is a real product. */
    Edition edition() const;

    /** Whether newer builds are included in what was bought. The ONLY thing updatesUntil
        governs. */
    bool updatesIncluded() const;

    /** Whether the application runs. This is a constant, and it is a constant on purpose:
        §27 forbids an expired entitlement from disabling an installed application, and the
        way to guarantee that is to leave no branch where it could. */
    static constexpr bool runnable() { return true; }

    bool verified() const
    {
        return state == State::licensed || state == State::updatesExpired
            || state == State::sunsetUnlocked;
    }
};

/** Signs a document with the vendor's private key. Only the keygen tool and the tests call
    this; the product ships the public half. */
juce::String signDocument (const LicenceDocument& document, const juce::String& privateKey);

/** The licence file as it travels: the document plus its signature. */
juce::var makeLicenceFile (const LicenceDocument& document, const juce::String& privateKey);

/** Verifies a licence file against the product's public key, at a given moment (passed in
    rather than read from the clock, so the tests can stand at any date and so the caller
    decides what "now" means). */
LicenceStatus verifyLicenceFile (const juce::var& licenceFile,
                                 const juce::String& publicKey,
                                 const juce::String& expectedProductId,
                                 juce::Time now);

} // namespace ceditor::licensing
