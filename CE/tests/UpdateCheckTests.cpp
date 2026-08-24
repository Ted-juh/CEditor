// UpdateCheckTests — "is there a newer CEditor than this one?"
//
// The feature is one HTTP GET and a version comparison. The GET needs Windows and a network and is
// untestable here; the comparison is the part that can be wrong in a way nobody notices, so it is a
// pure function and this drives it.
//
// The two failures worth designing against, and they are not symmetric:
//
//   A BUILD THAT BELIEVES IT IS UP TO DATE when it is not. Silent, and the whole feature exists to
//   prevent exactly that, so every case that cannot be understood errs toward an error the user can
//   see rather than toward "no update".
//
//   A BUILD THAT NAGS about a release older than itself, or about a draft. Loud, annoying, and it
//   teaches people to ignore the notice — which costs the real one later.

#include "UpdateCheck.h"
#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

juce::var release (const juce::String& json) { return juce::JSON::parse (json); }

void testVersionParsing()
{
    std::cout << "\nReading a version" << std::endl;

    check (ce::parseVersion ("1.2.3").major == 1, "major");
    check (ce::parseVersion ("1.2.3").minor == 2, "minor");
    check (ce::parseVersion ("1.2.3").patch == 3, "patch");
    check (ce::parseVersion ("v0.2.0").valid, "a leading v is a tag convention, not part of the number");
    check (ce::parseVersion ("1.2").patch == 0, "a missing patch is zero");
    check (ce::parseVersion ("3").major == 3, "so is a missing minor");

    // Dropped rather than ordered. Ordering pre-releases properly means semver precedence rules,
    // and this project has never tagged one — inventing a comparison for a case that does not exist
    // is how the first real one gets the wrong answer.
    check (ce::parseVersion ("1.2.3-beta.1").valid, "a pre-release suffix is dropped, not refused");
    check (ce::compareVersions (ce::parseVersion ("1.2.3-beta.1"), ce::parseVersion ("1.2.3")) == 0,
           "and compares equal to the release, which errs toward not nagging");

    for (const auto* junk : { "", "   ", "latest", "v", "1.x.3", "one.two" })
        check (! ce::parseVersion (junk).valid, juce::String ("not a version: \"") + junk + "\"");
}

void testComparison()
{
    std::cout << "\nWhich is newer" << std::endl;

    check (ce::isNewerVersion ("0.3.0", "0.2.0"), "a minor bump is newer");
    check (ce::isNewerVersion ("1.0.0", "0.99.99"), "and a major one");
    check (ce::isNewerVersion ("0.2.1", "0.2.0"), "and a patch");

    check (! ce::isNewerVersion ("0.2.0", "0.2.0"), "the same version is not newer");
    check (! ce::isNewerVersion ("0.1.0", "0.2.0"), "an older release must not nag");
    check (! ce::isNewerVersion ("0.2.0", "0.10.0"), "0.10 is newer than 0.2 — not string order");

    // An unreadable version on either side is "not newer". A wrong nag is loud and teaches people
    // to ignore the notice; the silent direction is covered by readLatestRelease, which turns an
    // unreadable version into a visible error rather than into this.
    check (! ce::isNewerVersion ("nonsense", "0.2.0"), "an unreadable candidate does not nag");
    check (! ce::isNewerVersion ("9.9.9", "nonsense"), "nor an unreadable current version");
}

void testReadingTheReply()
{
    std::cout << "\nReading GitHub's reply" << std::endl;

    const auto good = ce::readLatestRelease (release (R"({
      "tag_name": "v0.3.0", "name": "0.3.0",
      "html_url": "https://github.com/Ted-juh/CEditor/releases/tag/v0.3.0",
      "published_at": "2026-09-01T10:00:00Z", "draft": false, "prerelease": false
    })"), "0.2.0");
    check (good.ok, "a normal release is understood");
    check (good.updateAvailable, "and is newer than 0.2.0");
    check (good.latestVersion == "0.3.0", "the tag's v is stripped");
    check (good.releaseUrl.isNotEmpty(), "the link survives");
    check (good.publishedAt.isNotEmpty(), "so does the date");

    const auto same = ce::readLatestRelease (release (R"({"tag_name": "v0.2.0"})"), "0.2.0");
    check (same.ok && ! same.updateAvailable, "the current version is understood and offers nothing");

    // ok is about the REPLY, not about whether an update exists. Conflating them would make "you
    // are up to date" and "the check failed" the same outcome, which is the silent failure.
    const auto older = ce::readLatestRelease (release (R"({"tag_name": "v0.1.0"})"), "0.2.0");
    check (older.ok && ! older.updateAvailable, "an older release is understood and offers nothing");
}

void testTheReplyIsNotTrusted()
{
    std::cout << "\nA reply that cannot be understood" << std::endl;

    // Every one of these must come back as an error a person can read. NOT as "up to date", which
    // is the failure that hides itself.
    const juce::String cases[] = {
        R"("just a string")",
        R"([])",
        R"({})",
        R"({"tag_name": ""})",
        R"({"tag_name": "latest"})",
        R"({"name": "The Big One"})",
    };
    for (const auto& json : cases)
    {
        const auto result = ce::readLatestRelease (release (json), "0.2.0");
        check (! result.ok && result.error.isNotEmpty() && ! result.updateAvailable,
               "refused with a reason: " + json);
    }

    check (! ce::readLatestRelease (juce::var(), "0.2.0").ok, "and no reply at all");

    // `releases/latest` is documented not to return these. That is GitHub's promise rather than
    // ours, and shipping a draft's version number to every user because the endpoint changed would
    // be a bad way to find out.
    for (const auto* json : { R"({"tag_name": "v9.9.9", "draft": true})",
                              R"({"tag_name": "v9.9.9", "prerelease": true})" })
    {
        const auto result = ce::readLatestRelease (release (json), "0.2.0");
        check (! result.ok && ! result.updateAvailable, juce::String ("refused: ") + json);
    }

    // The name is a fallback for the tag, not a second chance to be wrong: it only counts when it
    // parses as a version.
    const auto byName = ce::readLatestRelease (release (R"({"tag_name": "release", "name": "0.4.0"})"), "0.2.0");
    check (byName.ok && byName.latestVersion == "0.4.0", "a version in the name is accepted");
}

void testConsent()
{
    std::cout << "\nWhen a check is allowed to happen" << std::endl;

    // Checking sends this machine's IP to GitHub. Unremarkable, and still not something a program
    // should do on its own the first time it starts.
    check (! ce::updateCheckIsAllowed (false, false), "off, and nobody asked: no check");
    check (ce::updateCheckIsAllowed (false, true), "off, but the user asked: choosing it is consent");
    check (ce::updateCheckIsAllowed (true, false), "on: automatic checks are allowed");
    check (ce::updateCheckIsAllowed (true, true), "on, and asked");

    check (ce::latestReleaseEndpoint().startsWith ("https://"), "the endpoint is https");
    check (ce::latestReleaseEndpoint().contains ("Ted-juh/CEditor"), "and points at this repository");
}
} // namespace

int main()
{
    std::cout << "UpdateCheck tests" << std::endl;

    testVersionParsing();
    testComparison();
    testReadingTheReply();
    testTheReplyIsNotTrusted();
    testConsent();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
