// CEditorLicenceTool — the vendor's side of §19's Trust block.
//
// A licensing system with no way to issue a licence is not a licensing system, so this is the
// other half: generate a key pair, sign a licence, sign the sunset unlock, and verify what came
// out. Three subcommands and no state.
//
//   keypair   --bits 2048 --out keys/
//   issue     --key keys/private.key --product <appId> --name "..." --email ... --order ...
//             --edition core --activations 3 --updates-until 2027-08-27 --out customer.celicence
//   sunset    --key keys/private.key --out sunset.celicence
//   verify    --key keys/public.key --product <appId> --licence customer.celicence
//
// THE PRIVATE KEY NEVER ENTERS THIS REPOSITORY. `keypair` writes it to a path the operator
// chooses and prints a warning; there is no default location inside the tree, no environment
// variable read, and nothing here writes it anywhere else. The PUBLIC half goes into the Host
// Project manifest as `licencePublicKey`, which is how a generated instrument ends up able to
// verify licences issued for itself and not for some other product built from the same editor.
//
// KEY SIZE is the operator's decision and the default is 2048. JUCE's RSA is a textbook
// implementation and generation is slow at that size — a minute or two is normal and it happens
// once. The tests use 512 because they generate a pair per run and are testing the plumbing,
// not the modulus.

#include "Licensing/Licence.h"
#include <juce_cryptography/juce_cryptography.h>
#include <iostream>

namespace
{
using namespace ceditor::licensing;

juce::String argValue (const juce::StringArray& args, const juce::String& name,
                       const juce::String& fallback = {})
{
    const auto index = args.indexOf ("--" + name);
    return index >= 0 && index + 1 < args.size() ? args[index + 1] : fallback;
}

bool hasArg (const juce::StringArray& args, const juce::String& name)
{
    return args.contains ("--" + name);
}

int usage()
{
    std::cout <<
R"(CEditorLicenceTool — issue and verify offline licences.

  keypair  --out <directory> [--bits 2048]
             Writes public.key and private.key. Keep the private key OUT of the repository
             and off any machine that does not need to sign.

  issue    --key <private.key> --product <appId> --edition free|founder|core|pro
           --name "<licensee>" [--email <address>] [--order <reference>]
           [--activations 3] [--updates-until YYYY-MM-DD] --out <file.celicence>
             The appId is the Host Project's, which is also what the built product checks
             against. --updates-until is an ENTITLEMENT, never an expiry: after it the
             application still runs, it just stops counting newer builds as included.

  sunset   --key <private.key> --out <file.celicence>
             The published unlock. Licenses every product on every machine, for good. This is
             the thing the sunset policy promises to publish if the vendor ever stops.

  verify   --key <public.key> --product <appId> --licence <file.celicence>
             What the product would conclude, printed.
)" << std::endl;
    return 64;
}

int doKeypair (const juce::StringArray& args)
{
    const juce::File out (juce::File::getCurrentWorkingDirectory()
                              .getChildFile (argValue (args, "out")).getFullPathName());
    if (argValue (args, "out").isEmpty())
        return usage();

    const auto bits = juce::jlimit (512, 4096, argValue (args, "bits", "2048").getIntValue());

    std::cout << "Generating a " << bits << "-bit key pair. This is slow and only happens once."
              << std::endl;

    // Seeded from sources that differ between runs; JUCE mixes these into its own entropy.
    const auto now = juce::Time::getCurrentTime();
    const int seeds[] = { (int) now.toMilliseconds(), (int) (now.toMilliseconds() >> 32),
                          (int) juce::Random::getSystemRandom().nextInt(),
                          (int) juce::Random::getSystemRandom().nextInt(),
                          (int) juce::Random::getSystemRandom().nextInt() };

    juce::RSAKey publicKey, privateKey;
    juce::RSAKey::createKeyPair (publicKey, privateKey, bits, seeds, 5);

    out.createDirectory();
    const auto publicFile = out.getChildFile ("public.key");
    const auto privateFile = out.getChildFile ("private.key");

    if (! publicFile.replaceWithText (publicKey.toString())
        || ! privateFile.replaceWithText (privateKey.toString()))
    {
        std::cout << "Could not write the keys to " << out.getFullPathName() << std::endl;
        return 1;
    }

    std::cout << "\nPublic key  → " << publicFile.getFullPathName()
              << "\n            Put this in the Host Project as \"licencePublicKey\"."
              << "\nPrivate key → " << privateFile.getFullPathName()
              << "\n\n  KEEP THE PRIVATE KEY OUT OF THE REPOSITORY AND OFF SHARED MACHINES."
                 "\n  Anyone who has it can issue licences. Losing it means every licence"
                 "\n  already issued still works and no new one can be made — back it up.\n"
              << std::endl;
    return 0;
}

int doIssue (const juce::StringArray& args, bool sunset)
{
    const auto keyPath = argValue (args, "key");
    const auto outPath = argValue (args, "out");
    if (keyPath.isEmpty() || outPath.isEmpty())
        return usage();

    const auto privateKey = juce::File (juce::File::getCurrentWorkingDirectory()
                                            .getChildFile (keyPath).getFullPathName())
                                .loadFileAsString().trim();
    if (privateKey.isEmpty())
    {
        std::cout << "No private key at " << keyPath << std::endl;
        return 1;
    }

    LicenceDocument document;
    document.issuedAt = juce::Time::getCurrentTime().toISO8601 (true);

    if (sunset)
    {
        document.productId = "*";
        document.sunset = true;
        document.licensee = "Published sunset key";
    }
    else
    {
        document.productId   = argValue (args, "product");
        document.licensee    = argValue (args, "name");
        document.email       = argValue (args, "email");
        document.orderId     = argValue (args, "order");
        document.edition     = editionFromName (argValue (args, "edition", "core"));
        document.activations = juce::jlimit (1, 100, argValue (args, "activations", "3").getIntValue());

        if (document.productId.isEmpty() || document.licensee.isEmpty())
        {
            std::cout << "issue needs --product and --name." << std::endl;
            return 64;
        }

        if (! hasArg (args, "edition"))
            std::cout << "No --edition given; issuing core." << std::endl;

        if (const auto until = argValue (args, "updates-until"); until.isNotEmpty())
        {
            // Accepted as a plain date and stored as the end of it, so "--updates-until
            // 2027-08-27" includes everything published on the 27th rather than nothing.
            document.updatesUntil = until.contains ("T") ? until
                                                         : until + "T23:59:59.000Z";

            if (juce::Time::fromISO8601 (document.updatesUntil).toMilliseconds() <= 0)
            {
                std::cout << "--updates-until is not a date this can read: " << until
                          << "\nUse YYYY-MM-DD. An unreadable date would be treated as no limit,"
                             " which is probably not what you meant." << std::endl;
                return 64;
            }
        }
    }

    const auto file = makeLicenceFile (document, privateKey);
    const auto destination = juce::File (juce::File::getCurrentWorkingDirectory()
                                             .getChildFile (outPath).getFullPathName());

    if (! destination.replaceWithText (juce::JSON::toString (file)))
    {
        std::cout << "Could not write " << destination.getFullPathName() << std::endl;
        return 1;
    }

    std::cout << "Wrote " << destination.getFullPathName() << "\n"
              << juce::JSON::toString (file.getProperty ("licence", {})) << std::endl;

    // Verify what was just written, with the matching public half derived from the private
    // key file's sibling if it is there. A tool that cannot check its own output is a tool
    // that discovers a bad batch through customers.
    const auto publicFile = juce::File (juce::File::getCurrentWorkingDirectory()
                                            .getChildFile (keyPath).getFullPathName())
                                .getSiblingFile ("public.key");
    if (publicFile.existsAsFile())
    {
        const auto status = verifyLicenceFile (file, publicFile.loadFileAsString().trim(),
                                               sunset ? juce::String() : document.productId,
                                               juce::Time::getCurrentTime());
        std::cout << (status.verified() ? "Verified against public.key: " : "DID NOT VERIFY: ")
                  << status.detail << std::endl;
        return status.verified() ? 0 : 1;
    }

    std::cout << "No public.key beside the private key, so this was not verified." << std::endl;
    return 0;
}

int doVerify (const juce::StringArray& args)
{
    const auto keyPath = argValue (args, "key");
    const auto licencePath = argValue (args, "licence");
    if (keyPath.isEmpty() || licencePath.isEmpty())
        return usage();

    const auto cwd = juce::File::getCurrentWorkingDirectory();
    const auto publicKey = juce::File (cwd.getChildFile (keyPath).getFullPathName())
                               .loadFileAsString().trim();
    const auto licence = juce::JSON::parse (juce::File (cwd.getChildFile (licencePath)
                                                           .getFullPathName())
                                                .loadFileAsString());

    const auto status = verifyLicenceFile (licence, publicKey, argValue (args, "product"),
                                           juce::Time::getCurrentTime());

    std::cout << "state:    " << [&status]() -> const char*
    {
        switch (status.state)
        {
            case LicenceStatus::State::licensed:       return "licensed";
            case LicenceStatus::State::updatesExpired: return "licensed, updates lapsed";
            case LicenceStatus::State::sunsetUnlocked: return "sunset unlock";
            case LicenceStatus::State::wrongProduct:   return "genuine, for another product";
            case LicenceStatus::State::tampered:       return "does not match its signature";
            case LicenceStatus::State::unlicensed:     break;
        }
        return "not a licence";
    }()
              << "\nedition:  " << editionName (status.edition())
              << "\nupdates:  " << (status.updatesIncluded() ? "included" : "not included")
              << "\nruns:     " << (LicenceStatus::runnable() ? "yes" : "no")
              << "\ndetail:   " << status.detail << std::endl;

    return status.verified() ? 0 : 1;
}
} // namespace

int main (int argc, char* argv[])
{
    juce::StringArray args;
    for (int i = 1; i < argc; ++i)
        args.add (juce::String::fromUTF8 (argv[i]));

    if (args.isEmpty())
        return usage();

    const auto command = args[0];
    if (command == "keypair") return doKeypair (args);
    if (command == "issue")   return doIssue (args, false);
    if (command == "sunset")  return doIssue (args, true);
    if (command == "verify")  return doVerify (args);

    return usage();
}
