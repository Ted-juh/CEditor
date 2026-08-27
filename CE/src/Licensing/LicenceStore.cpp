#include "LicenceStore.h"
#include <juce_cryptography/juce_cryptography.h>

namespace ceditor::licensing
{

LicenceStore::LicenceStore (juce::File dataDirectoryToUse, juce::String publicKeyToUse,
                            juce::String productIdToUse)
    : dataDirectory (std::move (dataDirectoryToUse)),
      publicKey (std::move (publicKeyToUse)),
      productId (std::move (productIdToUse))
{
    loadActivations();
    refresh();
}

juce::String LicenceStore::machineFingerprint()
{
    // Hashed, not stored raw. The identifiers below are exactly the sort of thing §17.7 says
    // must not travel in a support bundle, and the surest way to keep them out of one is for
    // the product never to hold them in the first place.
    juce::String material = juce::SystemStats::getComputerName();
    for (const auto& id : juce::SystemStats::getMachineIdentifiers (juce::SystemStats::MachineIdFlags::macAddresses
                                                                     | juce::SystemStats::MachineIdFlags::uniqueId))
        material << '|' << id;

    return juce::SHA256 (material.toRawUTF8(), (size_t) material.getNumBytesAsUTF8())
             .toHexString().substring (0, 32);
}

juce::String LicenceStore::machineDisplayName()
{
    const auto name = juce::SystemStats::getComputerName();
    return name.isNotEmpty() ? name : juce::String ("this machine");
}

void LicenceStore::refresh (juce::Time now)
{
    currentStatus = {};

    if (! licenceFile().existsAsFile())
    {
        currentStatus.detail = "No licence installed. Everything the keyboard does works; one "
                               "plug-in can be loaded at a time.";
        return;
    }

    currentStatus = verifyLicenceFile (juce::JSON::parse (licenceFile().loadFileAsString()),
                                       publicKey, productId, now);
}

int LicenceStore::seatsAllowed() const
{
    // The sunset unlock is not a seat count. It licenses every machine, which is the point of
    // it, so reporting "1 of 3" against it would be misleading in the worst possible moment.
    if (currentStatus.state == LicenceStatus::State::sunsetUnlocked)
        return 0;

    return currentStatus.verified() ? currentStatus.document.activations : 0;
}

bool LicenceStore::activatedHere() const
{
    const auto fingerprint = machineFingerprint();
    for (const auto& activation : activationList)
        if (activation.fingerprint == fingerprint)
            return true;
    return false;
}

juce::String LicenceStore::install (const juce::String& licenceFileText, juce::Time now)
{
    const auto parsed = juce::JSON::parse (licenceFileText);
    const auto candidate = verifyLicenceFile (parsed, publicKey, productId, now);

    // A file that does not verify never reaches disk. Installing it and reporting the failure
    // afterwards would let a forged or wrong-product file displace a good licence.
    if (! candidate.verified())
        return candidate.detail.isNotEmpty() ? candidate.detail
                                             : juce::String ("This licence could not be verified.");

    dataDirectory.createDirectory();
    if (! licenceFile().replaceWithText (juce::JSON::toString (parsed)))
        return "The licence could not be written to " + licenceFile().getFullPathName();

    // A new licence is a new entitlement, so the seat record starts again: the machines that
    // used the old one are not the machines that bought this one.
    activationList.clear();
    saveActivations();

    refresh (now);
    activateHere (now);
    return {};
}

void LicenceStore::remove()
{
    licenceFile().deleteFile();
    activationList.clear();
    saveActivations();
    refresh();
}

juce::String LicenceStore::activateHere (juce::Time now)
{
    if (! currentStatus.verified())
        return "There is no licence to activate.";

    // The unlock covers every machine by definition; recording seats against it would invent
    // a limit the published policy says does not exist.
    if (currentStatus.state == LicenceStatus::State::sunsetUnlocked)
        return {};

    const auto fingerprint = machineFingerprint();
    const auto stamp = now.toISO8601 (true);

    for (auto& activation : activationList)
        if (activation.fingerprint == fingerprint)
        {
            activation.lastSeen = stamp;
            saveActivations();
            return {};
        }

    if (activationList.size() >= seatsAllowed())
        return "This licence covers " + juce::String (seatsAllowed())
                 + " machines and this install has already recorded that many. Release one "
                   "below, or write to support with your order number.";

    activationList.add ({ fingerprint, machineDisplayName(), stamp, stamp, true });
    saveActivations();
    return {};
}

juce::String LicenceStore::deactivateHere (juce::Time now)
{
    const auto fingerprint = machineFingerprint();

    for (int i = activationList.size(); --i >= 0;)
        if (activationList.getReference (i).fingerprint == fingerprint)
        {
            activationList.remove (i);
            saveActivations();

            // Not proof to anybody — see the header. Something to paste into an email.
            return "Released " + machineDisplayName() + " (" + fingerprint.substring (0, 8)
                     + ") on " + now.formatted ("%d %B %Y at %H:%M")
                     + (currentStatus.document.orderId.isNotEmpty()
                          ? ", order " + currentStatus.document.orderId
                          : juce::String());
        }

    return {};
}

void LicenceStore::loadActivations()
{
    activationList.clear();

    const auto stored = juce::JSON::parse (activationsFile().loadFileAsString());
    const auto* entries = stored.getProperty ("activations", {}).getArray();
    if (entries == nullptr)
        return;

    const auto here = machineFingerprint();
    for (const auto& entry : *entries)
    {
        Activation activation;
        activation.fingerprint  = entry.getProperty ("fingerprint", {}).toString();
        activation.machineName  = entry.getProperty ("machineName", {}).toString();
        activation.firstSeen    = entry.getProperty ("firstSeen", {}).toString();
        activation.lastSeen     = entry.getProperty ("lastSeen", {}).toString();
        activation.isThisMachine = activation.fingerprint == here;

        if (activation.fingerprint.isNotEmpty())
            activationList.add (std::move (activation));
    }
}

void LicenceStore::saveActivations() const
{
    juce::Array<juce::var> entries;
    for (const auto& activation : activationList)
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("fingerprint", activation.fingerprint);
        obj->setProperty ("machineName", activation.machineName);
        obj->setProperty ("firstSeen",   activation.firstSeen);
        obj->setProperty ("lastSeen",    activation.lastSeen);
        entries.add (juce::var (obj));
    }

    auto* root = new juce::DynamicObject();
    root->setProperty ("activations", entries);

    dataDirectory.createDirectory();
    activationsFile().replaceWithText (juce::JSON::toString (juce::var (root)));
}

} // namespace ceditor::licensing
