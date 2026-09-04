#pragma once

#include "Entitlements.h"

// LicenceStore — installing a licence, recording a seat, and never contacting anything.
//
// §27's prohibitions are load-bearing here and each one shows up as an absence:
//
//   "No online check-in required for every launch."   There is no network code in this file,
//                                                     or reachable from it. Verification is a
//                                                     signature check against a baked-in key.
//   "No one-computer-only activation."                The seat count comes from the licence
//                                                     and §19 asks for two or three.
//   "No authorization server with no documented       There is no authorization server. The
//    shutdown plan."                                  shutdown plan is the sunset key, and it
//                                                     works without one.
//
// WHAT AN OFFLINE SEAT COUNT CAN AND CANNOT DO, said plainly because the alternative is a
// feature that quietly does not work. This install records the machines IT has seen. Two
// separate installs on two machines cannot see each other's records without a server, and
// there is no server. So the count is enforced where it is visible — you cannot quietly
// accumulate machines through one install — and beyond that it is an honest statement of what
// was bought, which the product shows the customer and the merchant can audit against orders.
//
// A licensing scheme that claimed to enforce a global seat count offline would be lying, and
// the customers this product is for are described by the baseline as "unusually sensitive to
// abandonment" (§29.5). Lying to them about the mechanism is exactly the wrong trade.
//
// DEACTIVATION produces a receipt: a small signed-by-nobody record naming the machine and the
// moment. It is not proof to anybody else, and it does not pretend to be — it exists so a
// customer writing to support can say "I released the studio machine on the 3rd" and have
// something to paste.

namespace ceditor::licensing
{

class LicenceStore
{
public:
    /** `dataDirectory` is the product's per-user directory. `publicKey` and `productId` come
        from the build — see InstrumentHostService, which passes the Host Project's. */
    LicenceStore (juce::File dataDirectoryToUse, juce::String publicKeyToUse,
                  juce::String productIdToUse);

    /** One machine that has used this licence. */
    struct Activation
    {
        juce::String fingerprint;
        juce::String machineName;
        juce::String firstSeen;    // ISO 8601
        juce::String lastSeen;
        bool isThisMachine = false;
    };

    /** Re-reads the stored licence and re-checks it. Called at startup and after any change;
        `now` is passed in so the caller owns what "now" means. */
    void refresh (juce::Time now = juce::Time::getCurrentTime());

    LicenceStatus status() const                     { return currentStatus; }
    Entitlements entitlements() const                { return entitlementsFor (currentStatus.edition()); }
    juce::Array<Activation> activations() const      { return activationList; }

    /** True when this machine holds one of the licence's seats. */
    bool activatedHere() const;
    /** Seats used, as this install can see them — see the note above about what that means. */
    int seatsUsed() const                            { return activationList.size(); }
    int seatsAllowed() const;

    /** Installs a licence from the text of a licence file. Returns an empty string on success
        or the reason it was refused; the licence is stored either way ONLY on success, so a
        forged file cannot displace a good one. */
    juce::String install (const juce::String& licenceFileText,
                          juce::Time now = juce::Time::getCurrentTime());

    /** Removes the licence from this install. The file the customer was sent is untouched —
        this is not a revocation, it is a "not on this machine". */
    void remove();

    /** Records this machine against the licence, if there is a seat. Returns the reason it
        could not, or empty on success (including when it was already activated). */
    juce::String activateHere (juce::Time now = juce::Time::getCurrentTime());

    /** Releases this machine's seat and returns a receipt line for the customer to keep. */
    juce::String deactivateHere (juce::Time now = juce::Time::getCurrentTime());

    juce::File licenceFile() const     { return dataDirectory.getChildFile ("licence.celicence"); }
    juce::File activationsFile() const { return dataDirectory.getChildFile ("activations.json"); }

    /** A stable, non-identifying id for this machine: a hash of the host name and the OS's own
        machine identifiers. Deliberately a hash — the product has no business storing a MAC
        address, and the support bundle would carry it. */
    static juce::String machineFingerprint();
    static juce::String machineDisplayName();

private:
    void loadActivations();
    void saveActivations() const;

    juce::File dataDirectory;
    juce::String publicKey;
    juce::String productId;
    LicenceStatus currentStatus;
    juce::Array<Activation> activationList;
};

} // namespace ceditor::licensing
