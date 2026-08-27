#pragma once

#include <juce_core/juce_core.h>

// UpdateCheck.h — "is there a newer CEditor than this one?", decided without a network.
//
// THE GAP: there is no in-app update check at all, so the release notes have had to say "watch the
// repository" — which nobody does. The whole feature is one HTTP GET and a version comparison, and
// the comparison is the part that can be wrong in a way nobody notices: a build that quietly
// believes it is up to date, or one that nags about a release older than itself.
//
// SO THE RULES ARE HERE, pure, with their own test. What is left in the app is the GET and a
// dialog, which is the part that needs Windows and a network and is untestable on this machine
// either way. Same split as RestorePolicy.h and ProgramBank.h, for the same reason.
//
// A NOTE ON CONSENT, because it is a design constraint and not a footnote. Checking for updates
// sends this machine's IP address to GitHub. That is unremarkable and it is still not something a
// program should do on its own the first time it starts, so the setting defaults to OFF and the
// menu item is the always-available path: a person choosing "Check for Updates" has consented by
// choosing it. `updateCheckIsAllowed` below is where that rule lives so it cannot be forgotten at
// one of the two call sites.

namespace ce
{

/** A semantic version, tolerant of the shapes a release tag actually arrives in. */
struct Version
{
    int major = 0, minor = 0, patch = 0;
    bool valid = false;
};

/**
 * Parse "1.2.3", "v1.2.3", "1.2", "1.2.3-beta.1".
 *
 * Pre-release suffixes are DROPPED rather than ordered. Ordering them properly means implementing
 * semver's precedence rules, and this project has never tagged one — inventing a comparison for a
 * case that does not exist is how you get a wrong answer the first time it does. A build that says
 * 1.2.3-beta.1 compares equal to 1.2.3, which errs toward not nagging.
 */
inline Version parseVersion (const juce::String& text)
{
    Version version;
    auto trimmed = text.trim();
    if (trimmed.startsWithIgnoreCase ("v")) trimmed = trimmed.substring (1);
    trimmed = trimmed.upToFirstOccurrenceOf ("-", false, false)
                     .upToFirstOccurrenceOf ("+", false, false)
                     .trim();
    if (trimmed.isEmpty()) return version;

    const auto parts = juce::StringArray::fromTokens (trimmed, ".", "");
    if (parts.isEmpty()) return version;

    for (const auto& part : parts)
        if (part.isEmpty() || ! part.containsOnly ("0123456789"))
            return version;

    version.major = parts[0].getIntValue();
    version.minor = parts.size() > 1 ? parts[1].getIntValue() : 0;
    version.patch = parts.size() > 2 ? parts[2].getIntValue() : 0;
    version.valid = true;
    return version;
}

/** -1, 0 or 1. An unparseable version compares as "not newer", which errs toward not nagging. */
inline int compareVersions (const Version& a, const Version& b)
{
    if (! a.valid || ! b.valid) return 0;
    if (a.major != b.major) return a.major < b.major ? -1 : 1;
    if (a.minor != b.minor) return a.minor < b.minor ? -1 : 1;
    if (a.patch != b.patch) return a.patch < b.patch ? -1 : 1;
    return 0;
}

inline bool isNewerVersion (const juce::String& candidate, const juce::String& current)
{
    return compareVersions (parseVersion (candidate), parseVersion (current)) > 0;
}

/** What a check found, or why it found nothing. */
struct UpdateCheckResult
{
    bool ok = false;              ///< The reply was understood. Says nothing about whether an update exists.
    bool updateAvailable = false;
    juce::String latestVersion;   ///< As published, tag prefix stripped.
    juce::String releaseUrl;
    juce::String publishedAt;
    juce::String error;           ///< Set when ok is false, and always readable by a person.
};

/**
 * Read GitHub's `releases/latest` reply.
 *
 * Deliberately forgiving about everything except the version. A missing URL or date costs a link
 * and a line of text; a version that cannot be read must NOT become "you are up to date", because
 * that is the failure that hides itself — so it comes back as an error the user can see.
 *
 * Draft and pre-release entries are refused. `releases/latest` is documented not to return them,
 * but that is GitHub's promise rather than ours, and shipping a draft's version number to every
 * user because the endpoint changed would be a bad way to find out.
 */
inline UpdateCheckResult readLatestRelease (const juce::var& reply, const juce::String& currentVersion)
{
    UpdateCheckResult result;

    auto* object = reply.getDynamicObject();
    if (object == nullptr)
    {
        result.error = "The update service replied with something that is not a release.";
        return result;
    }

    if (object->getProperty ("draft").equalsWithSameType (juce::var (true))
        || object->getProperty ("prerelease").equalsWithSameType (juce::var (true)))
    {
        result.error = "The newest release is a draft or pre-release, so it is not being offered.";
        return result;
    }

    const auto tag = object->getProperty ("tag_name").toString().trim();
    const auto name = object->getProperty ("name").toString().trim();
    const auto version = parseVersion (tag).valid ? tag : name;

    if (! parseVersion (version).valid)
    {
        result.error = "The newest release is not named with a version number"
                       + (tag.isEmpty() ? juce::String() : " (\"" + tag + "\")") + ".";
        return result;
    }

    result.ok = true;
    result.latestVersion = parseVersion (version).valid && version.startsWithIgnoreCase ("v")
        ? version.substring (1) : version;
    result.releaseUrl = object->getProperty ("html_url").toString();
    result.publishedAt = object->getProperty ("published_at").toString();
    result.updateAvailable = isNewerVersion (result.latestVersion, currentVersion);
    return result;
}

/**
 * Whether a release that has been found is included in what somebody bought (§27).
 *
 * The model is "perpetual licence, all 1.x updates included, optional paid major upgrade", and
 * the sentence that governs the implementation is: *"Expired update entitlement must never
 * disable the installed application."* So this is ADVISORY and nothing more. It decides one
 * word in one line of text — "included" or "a paid upgrade" — and there is no path from here
 * to disabling anything, refusing to run, or removing a feature.
 *
 * A release published on or before `updatesUntil` is included. An empty or unreadable
 * `updatesUntil` means no limit, deliberately in that direction: a typo in a licence must not
 * take something away from somebody who paid for it. An unreadable publication date is also
 * included, for the same reason — the failure is ours, not theirs.
 */
inline bool updateIsIncluded (const juce::String& releasePublishedAt,
                              const juce::String& updatesUntil)
{
    if (updatesUntil.isEmpty())
        return true;

    const auto until = juce::Time::fromISO8601 (updatesUntil);
    if (until.toMilliseconds() <= 0)
        return true;

    const auto published = juce::Time::fromISO8601 (releasePublishedAt);
    if (published.toMilliseconds() <= 0)
        return true;

    return published <= until;
}

/** When the setting is off, only an explicit request may check. The rule, in one place. */
inline bool updateCheckIsAllowed (bool settingEnabled, bool userAsked)
{
    return userAsked || settingEnabled;
}

/** The endpoint. Named here so the test and the fetch cannot disagree about which repo. */
inline juce::String latestReleaseEndpoint()
{
    return "https://api.github.com/repos/Ted-juh/CEditor/releases/latest";
}

} // namespace ce
