#pragma once

#include "HostageManifest.h"

#include <juce_core/juce_core.h>

#include <utility>

// PlayerCreator — making a player out of the HoSTage that is running
// (docs/design/hostage-creator-editor-player.md, step 4).
//
// A player is the same programs as the HoSTage that makes it, with a manifest that says "player"
// and a few shows beside them. So making one is copying: this program's standalone and its two
// helpers, its VST3 bundle, a hostage.json with the player's own identity, the shows, and a
// note on what to do with the folder. No compiler, no Node.js, no installer: the result is a
// folder, which is also what a USB stick wants.
//
//   <destination>/<Player name>/
//       Standalone/<Player name>[.exe]   CEditorPluginScanner, CEditorPluginWorker
//                  hostage.json          shows/*.hostageshow
//       VST3/<bundle>.vst3/…             helpers beside the module; hostage.json and shows/
//                                        in Contents/Resources
//       Read me.txt
//
// The plan is a list of operations worked out before anything is touched, so everything that
// would stop it is said at once and nothing is half-made; carrying it out undoes itself on the
// first failure. juce_core only, so a plain test proves it.

namespace ceditor::host::player
{

/** What a player is made of: the HoSTage that is running, found by its shell. */
struct Template
{
    juce::File standalone;                  // the standalone program
    juce::Array<juce::File> companions;     // the plug-in scanner and the live worker
    juce::File vst3Bundle;                  // a whole .vst3 folder

    bool hasStandalone() const { return standalone.existsAsFile(); }
    bool hasVst3() const       { return vst3Bundle.isDirectory() && vst3Bundle.hasFileExtension (".vst3"); }
};

struct Request
{
    juce::String name;
    juce::String appId;                     // the player's own identity, minted by the caller
    juce::Array<juce::File> shows;          // the first is the one it opens on its first start
    bool standalone = true;
    bool vst3 = true;
    bool portable = false;                  // the standalone keeps its data beside it (step 6)
    juce::File destination;                 // the folder the player's folder is made in
};

struct Operation
{
    enum class Kind { copyFile, copyProgram, copyFolder, writeText, remove };
    Kind kind;
    juce::File from, to;
    juce::String text;
};

struct Plan
{
    juce::File folder;                      // <destination>/<name>, or a numbered one beside it
    juce::Array<Operation> operations;
    juce::StringArray problems;             // why it cannot be made, in words; empty when it can
    juce::StringArray notes;                // what the player will lack, in words
};

/** The player's name as a file name: what a file system refuses taken out, and no leading dots. */
inline juce::String legalName (const juce::String& name)
{
    return juce::File::createLegalFileName (name.trim()).trim().trimCharactersAtStart (".").trim();
}

inline juce::String manifestJson (const Request& request)
{
    auto* product = new juce::DynamicObject();
    product->setProperty ("name", request.name.trim());
    product->setProperty ("appId", request.appId);
    auto* root = new juce::DynamicObject();
    root->setProperty ("role", "player");
    root->setProperty ("product", juce::var (product));
    if (! request.shows.isEmpty())
        root->setProperty ("show", request.shows.getFirst().getFileName());
    if (request.portable)
        root->setProperty ("portable", true);
    return juce::JSON::toString (juce::var (root));
}

inline juce::String readMe (const Request& request, const juce::String& programName,
                            const juce::String& bundleName, bool standalone, bool vst3)
{
    juce::StringArray lines;
    lines.add (request.name.trim() + " - a HoSTage player");
    lines.add ("");
    lines.add ("It plays the shows it came with, and any show you import into it. It does not make");
    lines.add ("screens or control pages; that is done in the HoSTage editor.");
    if (standalone)
    {
        lines.add ("");
        lines.add ("On its own: the Standalone folder can go anywhere, a USB stick included. Start");
        lines.add (programName + " in it. Keep the files beside it together.");
        if (request.portable)
        {
            lines.add ("It keeps its rig, shows and settings in a Data folder beside it, so they go");
            lines.add ("wherever the folder goes. On a computer it has not been on, scan for plug-ins");
            lines.add ("once in its Library utility. Where it cannot write beside itself, it keeps them");
            lines.add ("on that computer instead.");
        }
    }
    if (vst3)
    {
        lines.add ("");
        lines.add ("In a DAW: copy " + bundleName + " from the VST3 folder into your VST3 folder");
        lines.add ("(on Windows, C:\\Program Files\\Common Files\\VST3) and rescan in the DAW.");
        lines.add ("Every HoSTage player is the same plug-in to a DAW, so install one player's VST3 at a time.");
    }
    lines.add ("");
    lines.add ("The plug-ins the shows use are not in this folder. Install them on the computer that");
    lines.add ("plays, and scan for them in the player's Library utility.");
    return lines.joinIntoString ("\n") + "\n";
}

/** Where a bundle keeps its binary: the folder under Contents named for the platform. */
inline juce::File bundleBinaryFolder (const juce::File& bundle)
{
    for (const auto& child : bundle.getChildFile ("Contents").findChildFiles (juce::File::findDirectories, false))
        if (child.getFileName() != "Resources" && ! child.findChildFiles (juce::File::findFiles, false).isEmpty())
            return child;
    return {};
}

/** Everything that would stop a player being made, in words. Without the destination it can be
    asked before the folder chooser opens, so nobody picks a folder for a player that cannot be. */
inline juce::StringArray problemsWith (const Template& from, const Request& request, bool withDestination)
{
    juce::StringArray problems;
    if (legalName (request.name).isEmpty())
        problems.add ("Give the player a name.");
    if (normaliseProductId (request.appId).isEmpty())
        problems.add ("The player has no identity of its own.");
    if (request.shows.isEmpty())
        problems.add ("Choose at least one show for the player.");
    for (const auto& show : request.shows)
        if (! show.existsAsFile())
            problems.add ("The show \"" + show.getFileNameWithoutExtension() + "\" is not there any more.");
    if (! request.standalone && ! request.vst3)
        problems.add ("Choose the standalone, the VST3, or both.");
    if (request.standalone && ! from.hasStandalone())
        problems.add ("This HoSTage has no standalone program to copy.");
    if (request.vst3 && ! from.hasVst3())
        problems.add ("This HoSTage has no VST3 to copy.");
    if (withDestination && ! request.destination.isDirectory())
        problems.add ("Choose a folder to put the player in.");
    return problems;
}

/** What goes into a copy of the programs: the standalone's new name, the manifest, and the shows
    with the names they go in under. Players and products (ProductBuilder.h) differ only here. */
struct Contents
{
    juce::String programName;                               // the standalone's file name in the copy
    juce::String manifest;                                  // hostage.json
    juce::Array<std::pair<juce::File, juce::String>> shows; // a show, and the file name it goes in as
    bool standalone = true;
    bool vst3 = true;
};

/** The operations that put the programs into `folder`: Standalone/ and VST3/, each with its
    helpers, its hostage.json and its shows. */
inline void addPrograms (Plan& result, const Template& from, const juce::File& folder, const Contents& contents)
{
    const auto addShows = [&result, &contents] (const juce::File& into)
    {
        for (const auto& [show, name] : contents.shows)
            result.operations.add ({ Operation::Kind::copyFile, show, into.getChildFile (name), {} });
    };
    const auto addCompanions = [&result, &from] (const juce::File& into)
    {
        for (const auto& helper : from.companions)
            if (helper.existsAsFile())
                result.operations.add ({ Operation::Kind::copyProgram, helper, into.getChildFile (helper.getFileName()), {} });
    };

    if (contents.standalone)
    {
        const auto standalone = folder.getChildFile ("Standalone");
        result.operations.add ({ Operation::Kind::copyProgram, from.standalone, standalone.getChildFile (contents.programName), {} });
        addCompanions (standalone);
        result.operations.add ({ Operation::Kind::writeText, {}, standalone.getChildFile ("hostage.json"), contents.manifest });
        addShows (standalone.getChildFile ("shows"));
    }

    if (contents.vst3)
    {
        const auto bundle = folder.getChildFile ("VST3").getChildFile (from.vst3Bundle.getFileName());
        const auto resources = bundle.getChildFile ("Contents").getChildFile ("Resources");
        result.operations.add ({ Operation::Kind::copyFolder, from.vst3Bundle, bundle, {} });
        // What the HoSTage being copied shipped with is its own, not the copy's: its manifest
        // is replaced, and its shows and factory rack go (a factory rack would open before the
        // copy's show on the first start).
        result.operations.add ({ Operation::Kind::remove, {}, resources.getChildFile ("shows"), {} });
        result.operations.add ({ Operation::Kind::remove, {}, resources.getChildFile ("factory-performance.json"), {} });
        if (const auto binaries = bundleBinaryFolder (from.vst3Bundle); binaries != juce::File())
            addCompanions (bundle.getChildFile ("Contents").getChildFile (binaries.getFileName()));
        result.operations.add ({ Operation::Kind::writeText, {}, resources.getChildFile ("hostage.json"), contents.manifest });
        addShows (resources.getChildFile ("shows"));
    }
}

/** A folder named `name` in `destination`, never over another one: a second of the same name is
    numbered. */
inline juce::File freshFolder (const juce::File& destination, const juce::String& name)
{
    auto folder = destination.getChildFile (name);
    for (int n = 2; folder.exists(); ++n)
        folder = destination.getChildFile (name + " " + juce::String (n));
    return folder;
}

/** The helpers the template has, by name without the extension. */
inline juce::StringArray helperNames (const Template& from)
{
    juce::StringArray names;
    for (const auto& helper : from.companions)
        if (helper.existsAsFile())
            names.add (helper.getFileNameWithoutExtension());
    return names;
}

inline Plan plan (const Template& from, const Request& request)
{
    Plan result;
    const auto name = legalName (request.name);
    result.problems = problemsWith (from, request, true);
    if (! result.problems.isEmpty())
        return result;

    result.folder = freshFolder (request.destination, name);

    Contents contents;
    contents.programName = request.standalone ? name + from.standalone.getFileExtension() : juce::String();
    contents.manifest = manifestJson (request);
    contents.standalone = request.standalone;
    contents.vst3 = request.vst3;
    for (const auto& show : request.shows)
        contents.shows.add ({ show, show.getFileName() });
    addPrograms (result, from, result.folder, contents);

    result.operations.add ({ Operation::Kind::writeText, {}, result.folder.getChildFile ("Read me.txt"),
                             readMe (request, contents.programName, from.vst3Bundle.getFileName(),
                                     request.standalone, request.vst3) });

    // What it will lack, said before it is made.
    const auto helpers = helperNames (from);
    if (! helpers.contains ("CEditorPluginScanner"))
        result.notes.add ("The plug-in scanner was not found, so the player will not be able to scan for plug-ins.");
    if (! helpers.contains ("CEditorPluginWorker"))
        result.notes.add ("The live plug-in worker was not found, so the player will not load plug-ins.");
    return result;
}

/** Carries a plan out. On the first failure everything made so far is removed again. */
inline juce::Result execute (const Plan& plan)
{
    if (! plan.problems.isEmpty())
        return juce::Result::fail (plan.problems.joinIntoString (" "));

    const auto fail = [&plan] (const juce::String& what)
    {
        plan.folder.deleteRecursively();
        return juce::Result::fail (what);
    };

    for (const auto& op : plan.operations)
    {
        if (op.kind != Operation::Kind::remove && ! op.to.getParentDirectory().createDirectory().wasOk())
            return fail ("Could not make the folder " + op.to.getParentDirectory().getFullPathName() + ".");

        switch (op.kind)
        {
            case Operation::Kind::copyFile:
            case Operation::Kind::copyProgram:
                if (! op.from.copyFileTo (op.to))
                    return fail ("Could not copy " + op.from.getFileName() + " to " + op.to.getFullPathName() + ".");
                // A copy is a new file; on Linux and macOS a program has to be told it may run.
                if (op.kind == Operation::Kind::copyProgram)
                    op.to.setExecutePermission (true);
                break;
            case Operation::Kind::copyFolder:
                if (! op.from.copyDirectoryTo (op.to))
                    return fail ("Could not copy " + op.from.getFileName() + " to " + op.to.getFullPathName() + ".");
                break;
            case Operation::Kind::writeText:
                if (! op.to.replaceWithText (op.text))
                    return fail ("Could not write " + op.to.getFullPathName() + ".");
                break;
            case Operation::Kind::remove:
                if (! op.to.deleteRecursively())
                    return fail ("Could not remove " + op.to.getFullPathName() + ".");
                break;
        }
    }
    return juce::Result::ok();
}

// -- finding the template ----------------------------------------------------------------------

/** The VST3 that belongs with a standalone: in a build tree, the bundle CMake made beside it;
    installed, the bundle in the system's VST3 folder whose manifest names the same product. An
    unbranded program finds none installed rather than guess at another product's bundle. */
inline juce::File findSiblingVst3 (const juce::File& standalone, const juce::String& appId)
{
    const auto programDir = standalone.getParentDirectory();
    juce::Array<juce::File> buildTree {
        programDir.getParentDirectory().getParentDirectory().getChildFile ("CEHostVST3_artefacts")
                  .getChildFile (programDir.getFileName()).getChildFile ("VST3"),
        programDir.getParentDirectory().getParentDirectory().getChildFile ("CEHostVST3_artefacts").getChildFile ("VST3"),
    };
    for (const auto& folder : buildTree)
        for (const auto& bundle : folder.findChildFiles (juce::File::findDirectories, false, "*.vst3"))
            return bundle;

    if (appId.isEmpty())
        return {};

    juce::Array<juce::File> installed;
   #if JUCE_WINDOWS
    installed.add (juce::File (juce::SystemStats::getEnvironmentVariable ("CommonProgramFiles",
                                                                         "C:\\Program Files\\Common Files"))
                       .getChildFile ("VST3"));
   #elif JUCE_MAC
    installed.add (juce::File ("/Library/Audio/Plug-Ins/VST3"));
    installed.add (juce::File::getSpecialLocation (juce::File::userHomeDirectory).getChildFile ("Library/Audio/Plug-Ins/VST3"));
   #else
    installed.add (juce::File::getSpecialLocation (juce::File::userHomeDirectory).getChildFile (".vst3"));
    installed.add (juce::File ("/usr/lib/vst3"));
    installed.add (juce::File ("/usr/local/lib/vst3"));
   #endif
    for (const auto& folder : installed)
        for (const auto& bundle : folder.findChildFiles (juce::File::findDirectories, false, "*.vst3"))
            if (readHostageManifestBeside (bundleBinaryFolder (bundle)).appId == appId)
                return bundle;
    return {};
}

#if JUCE_WINDOWS
inline const juce::StringArray& helperFileNames()
{
    static const juce::StringArray names { "CEditorPluginScanner.exe", "CEditorPluginWorker.exe" };
    return names;
}
#else
inline const juce::StringArray& helperFileNames()
{
    static const juce::StringArray names { "CEditorPluginScanner", "CEditorPluginWorker" };
    return names;
}
#endif

/** The program in a folder: an .exe on Windows, a file with no extension elsewhere, and not one
    of the helpers. Empty where there is none. */
inline juce::File findProgramIn (const juce::File& folder)
{
    for (const auto& file : folder.findChildFiles (juce::File::findFiles, false))
    {
        if (helperFileNames().contains (file.getFileName()))
            continue;
       #if JUCE_WINDOWS
        if (file.hasFileExtension (".exe"))
       #else
        if (file.getFileExtension().isEmpty())
       #endif
            return file;
    }
    return {};
}

/** The helpers, from the first of `folders` that has each. */
inline void addHelpersFrom (Template& found, std::initializer_list<juce::File> folders)
{
    for (const auto& helper : helperFileNames())
        for (const auto& folder : folders)
            if (const auto file = folder.getChildFile (helper); file.existsAsFile())
            {
                found.companions.add (file);
                break;
            }
}

/** The template in a CMake build tree, for CEditor's own Hostage tab in a source checkout: the
    standalone, the bundle and the helpers where the build put them. Empty where nothing was
    built. */
inline Template findTemplateInBuildTree (const juce::File& buildDir, const juce::String& config = "Release")
{
    Template found;
    for (const auto& folder : { buildDir.getChildFile ("CEHostStandalone_artefacts").getChildFile (config),
                                buildDir.getChildFile ("CEHostStandalone_artefacts") })
        if (const auto file = findProgramIn (folder); file != juce::File() && found.standalone == juce::File())
            found.standalone = file;
    if (found.hasStandalone())
        found.vst3Bundle = findSiblingVst3 (found.standalone, {});
    addHelpersFrom (found, { buildDir.getChildFile (config), buildDir });
    return found;
}

/** The template an installed CEditor ships, for its Hostage tab: templates/hostage beside it
    (tools/scripts/package-installer.ps1), with the standalone in Standalone/ and the bundle in
    VST3/. The helpers are the ones the template brings, or else CEditor's own, which are the
    same programs and are installed beside it. Empty where there is no such folder. */
inline Template findInstalledTemplate (const juce::File& folder, const juce::File& helpersDir)
{
    Template found;
    found.standalone = findProgramIn (folder.getChildFile ("Standalone"));
    for (const auto& bundle : folder.getChildFile ("VST3").findChildFiles (juce::File::findDirectories, false, "*.vst3"))
    {
        found.vst3Bundle = bundle;
        break;
    }
    if (found.hasStandalone() || found.hasVst3())
        addHelpersFrom (found, { folder.getChildFile ("Standalone"), helpersDir });
    return found;
}

} // namespace ceditor::host::player
