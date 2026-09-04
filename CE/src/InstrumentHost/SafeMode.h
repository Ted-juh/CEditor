#pragma once

#include <juce_core/juce_core.h>

// SafeMode — starting up after the last run did not survive (§17.1, §18.3.3).
//
// Two of the baseline's reliability requirements meet here:
//
//   §17.1  "Safe mode that starts without third-party plug-ins."
//   §18.3.3 "Offer safe startup without automatically reloading a suspected plug-in."
//
// Scanning already had its half of this from Stage 1: a dead-man marker names the module that
// was on the scanner's plate when the process died, and startup quarantines it before anything
// else happens. Active hosting got its marker in Stage 7 — but the marker was only ever read
// as evidence. A plug-in that crashed the host while playing was counted and then loaded again
// on the very next start, which is a crash loop with a log file attached.
//
// This closes it. A module that was live at an abnormal termination becomes a SUSPECT, and a
// suspect does not load on the next run. The rack still restores: the part keeps its identity,
// its saved state and its place, and reports itself degraded through the same machinery a
// missing plug-in already uses (§18.9.4). Nothing is deleted and nothing is decided for good —
// clearing a suspect is one click and the next start loads it normally.
//
// THREE LEVELS, and the middle one is the interesting one:
//
//   normal          Load everything. What a healthy install does.
//   skipSuspects    Load everything except the named suspects. Entered automatically after an
//                   incident, because the alternative is walking into the same wall.
//   noThirdParty    Load nothing third-party at all. Entered only by the user, for the case
//                   where the suspect list is wrong or the damage is not attributable — the
//                   product comes up empty but working, which is what makes it fixable.
//
// Sticky by design. A safe mode that quietly reset itself on the next start would turn a crash
// loop into a crash loop that also lies about it. The state is visible in the workspace and the
// way out is explicit.
//
// juce_core only: this is a small persisted decision, and the tests drive it on any machine.

namespace ceditor::host
{

class SafeMode
{
public:
    enum class Level
    {
        normal,
        skipSuspects,
        noThirdParty
    };

    /** `dataDirectory` is the product's per-user directory — the same one the catalogue, the
        scanner's marker and the active-hosting log live in. Reads any stored state now. */
    explicit SafeMode (juce::File dataDirectoryToUse)
        : dataDirectory (std::move (dataDirectoryToUse))
    {
        load();
    }

    struct Suspect
    {
        juce::String modulePath;
        juce::String name;      // display name, for a sentence a person can read
        juce::String reason;
        int incidents = 0;      // how many times this module has been live at a death
    };

    Level level() const noexcept   { return currentLevel; }

    void setLevel (Level newLevel)
    {
        if (newLevel == currentLevel)
            return;

        currentLevel = newLevel;
        save();
    }

    const juce::Array<Suspect>& suspects() const noexcept   { return suspectList; }

    /** True when this module must not be instantiated on this run. An empty path is never
        blocked — a part with no module recorded has nothing to be suspicious of. */
    bool blocks (const juce::String& modulePath) const
    {
        if (modulePath.isEmpty())
            return false;

        if (currentLevel == Level::noThirdParty)
            return true;

        if (currentLevel == Level::normal)
            return false;

        return findSuspect (modulePath) != nullptr;
    }

    /** The one sentence explaining a refusal, or empty when the module is not blocked. */
    juce::String reasonFor (const juce::String& modulePath) const
    {
        if (! blocks (modulePath))
            return {};

        if (currentLevel == Level::noThirdParty)
            return "safe mode is on: no third-party plug-ins are being loaded";

        const auto* suspect = findSuspect (modulePath);
        const auto times = suspect != nullptr && suspect->incidents > 1
                             ? " (" + juce::String (suspect->incidents) + " times)"
                             : juce::String();

        return "not loaded after it was live when the last run ended abnormally" + times;
    }

    /** Records a module as a suspect and, if the level was normal, raises it to skipSuspects —
        recording a suspect and then loading it anyway would be a note-to-self, not a safeguard.
        Repeating a suspect updates its count and reason rather than adding a second entry. */
    void addSuspect (const juce::String& modulePath, const juce::String& name,
                     const juce::String& reason, int incidents)
    {
        if (modulePath.isEmpty())
            return;

        bool updated = false;
        for (auto& suspect : suspectList)
            if (suspect.modulePath == modulePath)
            {
                suspect.name      = name.isNotEmpty() ? name : suspect.name;
                suspect.reason    = reason;
                suspect.incidents = juce::jmax (suspect.incidents, incidents);
                updated = true;
                break;
            }

        if (! updated)
            suspectList.add ({ modulePath, name, reason, juce::jmax (1, incidents) });

        if (currentLevel == Level::normal)
            currentLevel = Level::skipSuspects;

        save();
    }

    /** The user vouches for this module: it loads again from now on. When it was the last
        suspect the level drops back to normal, because skipSuspects with nothing to skip is a
        warning light nobody can turn off. `noThirdParty` is left alone — that one is the
        user's own choice and only the user ends it. */
    void clearSuspect (const juce::String& modulePath)
    {
        for (int i = suspectList.size(); --i >= 0;)
            if (suspectList.getReference (i).modulePath == modulePath)
                suspectList.remove (i);

        if (suspectList.isEmpty() && currentLevel == Level::skipSuspects)
            currentLevel = Level::normal;

        save();
    }

    void clearAllSuspects()
    {
        suspectList.clear();

        if (currentLevel == Level::skipSuspects)
            currentLevel = Level::normal;

        save();
    }

    juce::File stateFile() const   { return dataDirectory.getChildFile ("safe-mode.json"); }

    static juce::String levelName (Level level)
    {
        switch (level)
        {
            case Level::skipSuspects:  return "skipSuspects";
            case Level::noThirdParty:  return "noThirdParty";
            case Level::normal:        break;
        }
        return "normal";
    }

    /** Anything unrecognised reads as normal. A state file from a future build must not leave
        the product refusing to load plug-ins for a reason it cannot explain. */
    static Level levelFromName (const juce::String& name)
    {
        if (name == "skipSuspects") return Level::skipSuspects;
        if (name == "noThirdParty") return Level::noThirdParty;
        return Level::normal;
    }

private:
    const Suspect* findSuspect (const juce::String& modulePath) const
    {
        for (const auto& suspect : suspectList)
            if (suspect.modulePath == modulePath)
                return &suspect;
        return nullptr;
    }

    void load()
    {
        suspectList.clear();
        currentLevel = Level::normal;

        const auto stored = juce::JSON::parse (stateFile().loadFileAsString());
        if (! stored.isObject())
            return;

        currentLevel = levelFromName (stored.getProperty ("level", {}).toString());

        if (const auto* entries = stored.getProperty ("suspects", {}).getArray())
            for (const auto& entry : *entries)
            {
                Suspect suspect;
                suspect.modulePath = entry.getProperty ("modulePath", {}).toString();
                suspect.name       = entry.getProperty ("name", {}).toString();
                suspect.reason     = entry.getProperty ("reason", {}).toString();
                suspect.incidents  = juce::jmax (1, (int) entry.getProperty ("incidents", 1));

                if (suspect.modulePath.isNotEmpty())
                    suspectList.add (std::move (suspect));
            }
    }

    void save() const
    {
        juce::Array<juce::var> entries;
        for (const auto& suspect : suspectList)
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("modulePath", suspect.modulePath);
            obj->setProperty ("name",       suspect.name);
            obj->setProperty ("reason",     suspect.reason);
            obj->setProperty ("incidents",  suspect.incidents);
            entries.add (juce::var (obj));
        }

        auto* root = new juce::DynamicObject();
        root->setProperty ("level",    levelName (currentLevel));
        root->setProperty ("suspects", entries);

        dataDirectory.createDirectory();
        stateFile().replaceWithText (juce::JSON::toString (juce::var (root)));
    }

    juce::File dataDirectory;
    Level currentLevel = Level::normal;
    juce::Array<Suspect> suspectList;
};

} // namespace ceditor::host
