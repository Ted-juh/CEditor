#pragma once

#include "HostShow.h"
#include "PlayerCreator.h"

#include <juce_core/juce_core.h>

// ProductBuilder — Build product in the creator, with nothing but CEditor installed
// (docs/design/hostage-creator-editor-player.md, step 5).
//
// A product is what a player is (PlayerCreator.h) with the editor's manifest and the Host
// Project's identity: the same HoSTage programs copied out and renamed after the product, with
// the show the creator is running. What a player does not have is an installer, and that is the
// one step here that needs anything else installed — Inno Setup 6. Without it the product is
// the folder, which runs where it is, and the build says the installer is what it skipped.
//
//   <destination>/<Product> <version>/
//       Standalone/<Product>[.exe]       CEditorPluginScanner, CEditorPluginWorker,
//                                        hostage.json, shows/<Product>.hostageshow
//       VST3/<bundle>.vst3/…             as a player's
//       Read me.txt
//       <Product>-Setup-<version>.exe    when Inno Setup was there
//
// The installer is tools/installer/HostProductTemplate.iss compiled with the switches
// tools/scripts/build-host-product.mjs passes (its isccArgs) — the developer's route to the same
// installer, which a source checkout keeps. CE/web/test/hostProductBuild.test.js holds the two
// lists of switches together, and both to the template's #ifndef defaults.
//
// juce_core only, so a plain test plans and builds a product from a fake installation.

namespace ceditor::host::product
{

/** What a Creator licence is issued for: CEditor as the creator, not any product it builds.
    `CEditorLicenceTool issue --product 6DA0CC3A-E1E5-465F-9013-91FC7E3CCC27 …` makes one. Fixed
    for good: a changed id is every Creator licence already sold no longer verifying. */
inline constexpr const char* creatorProductId = "6DA0CC3A-E1E5-465F-9013-91FC7E3CCC27";

/** The Host Project's fields that a build reads. */
struct Project
{
    juce::String name, version, publisher, appId;
    bool standalone = true;
    bool vst3 = true;

    static Project fromVar (const juce::var& hostProject)
    {
        Project project;
        project.name       = hostProject.getProperty ("productName", {}).toString().trim();
        project.version    = hostProject.getProperty ("version", {}).toString().trim();
        project.publisher  = hostProject.getProperty ("publisher", {}).toString().trim();
        project.appId      = normaliseProductId (hostProject.getProperty ("appId", {}).toString());
        project.standalone = (bool) hostProject.getProperty ("includeStandalone", true);
        project.vst3       = (bool) hostProject.getProperty ("includeVst3", true);
        return project;
    }
};

struct Request
{
    Project project;
    juce::File show;                // written by the editor just before: the rig, sounds and all
    juce::File destination;         // the folder the product's folder is made in
};

/** "1.0.0", "2", "10.4.1.7": dotted numbers, which is what an installer's version is. */
inline bool isVersion (const juce::String& version)
{
    if (version.isEmpty() || version.startsWithChar ('.') || version.endsWithChar ('.') || version.contains (".."))
        return false;
    return version.containsOnly ("0123456789.");
}

/** The file the product's show ships as: the product's name, as a file name. */
inline juce::String showFileName (const Project& project)
{
    const auto name = show::fileNameFor (project.name);
    return name.isNotEmpty() ? name : juce::String ("Show") + show::extension();
}

/** The installer's file name before "-Setup-<version>": the product's name with everything but
    letters and digits taken out. "Super Rack!" -> "SuperRack". build-host-product.mjs's
    sanitizeBaseName. */
inline juce::String setupBaseName (const Project& project)
{
    juce::String base;
    for (auto c : project.name)
        if ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'))
            base += juce::String::charToString (c);
    return base.isNotEmpty() ? base : juce::String ("HostProduct");
}

inline juce::String setupFileName (const Project& project)
{
    return setupBaseName (project) + "-Setup-" + project.version + ".exe";
}

/** The editor's manifest: a product is the editor, under its own name and identity, opening its
    show the first time it starts. build-host-product.mjs's hostageManifestJson. */
inline juce::String manifestJson (const Project& project)
{
    auto* product = new juce::DynamicObject();
    product->setProperty ("name", project.name);
    product->setProperty ("appId", project.appId);
    auto* root = new juce::DynamicObject();
    root->setProperty ("role", "editor");
    root->setProperty ("product", juce::var (product));
    root->setProperty ("show", showFileName (project));
    return juce::JSON::toString (juce::var (root));
}

inline juce::String readMe (const Project& project, const juce::String& programName,
                            const juce::String& bundleName)
{
    juce::StringArray lines;
    lines.add (project.name + " " + project.version + " - built with HoSTage");
    lines.add ("");
    lines.add ("This folder is the product as its installer installs it.");
    if (project.standalone)
    {
        lines.add ("");
        lines.add ("Standalone: " + programName + " and the files beside it. It runs from this folder");
        lines.add ("as it is; keep the files together.");
    }
    if (project.vst3)
    {
        lines.add ("");
        lines.add ("VST3: " + bundleName + ". The installer puts it in the computer's VST3 folder");
        lines.add ("(on Windows, C:\\Program Files\\Common Files\\VST3). Every HoSTage product is the same");
        lines.add ("plug-in to a DAW, so install one product's VST3 at a time.");
    }
    lines.add ("");
    lines.add ("The installer is " + setupFileName (project) + ", when Inno Setup 6 was installed on the");
    lines.add ("computer that built it. Without it, build again once Inno Setup 6 is installed");
    lines.add ("(it is free, from jrsoftware.org), or hand over this folder as it is.");
    lines.add ("");
    lines.add ("The plug-ins the show uses are not in this folder. Install them on the computer that");
    lines.add ("plays, and scan for them in the product's Library utility.");
    return lines.joinIntoString ("\n") + "\n";
}

/** Everything that would stop the product being built, in words. Without the destination it is
    asked before the folder chooser opens. */
inline juce::StringArray problemsWith (const player::Template& from, const Request& request, bool withDestination)
{
    const auto& project = request.project;
    juce::StringArray problems;
    if (player::legalName (project.name).isEmpty())
        problems.add ("The Host Project needs a product name before it can build.");
    // The installer's script takes these as defines: a quote ends one early, and a brace starts
    // one of Inno Setup's {constants}.
    if (project.name.containsAnyOf ("\"{}"))
        problems.add ("A product name cannot contain \" { or }.");
    if (project.publisher.containsAnyOf ("\"{}"))
        problems.add ("A publisher cannot contain \" { or }.");
    if (! isVersion (project.version))
        problems.add ("The version \"" + project.version + "\" is not dotted numbers, like 1.0.0.");
    if (project.appId.isEmpty())
        problems.add ("The Host Project has no installer identity.");
    if (! project.standalone && ! project.vst3)
        problems.add ("The Host Project has no targets enabled — nothing to build.");
    if (project.standalone && ! from.hasStandalone())
        problems.add ("There is no HoSTage standalone here to build the product from.");
    if (project.vst3 && ! from.hasVst3())
        problems.add ("There is no HoSTage VST3 here to build the product from.");
    // A product finds its instruments with the scanner and plays them in the worker; one without
    // them would install and then do nothing, which is worse than not building.
    const auto helpers = player::helperNames (from);
    if ((project.standalone || project.vst3) && ! helpers.contains ("CEditorPluginScanner"))
        problems.add ("The plug-in scanner (CEditorPluginScanner) is missing, and every product needs it.");
    if ((project.standalone || project.vst3) && ! helpers.contains ("CEditorPluginWorker"))
        problems.add ("The live plug-in worker (CEditorPluginWorker) is missing, and every product needs it.");
    if (withDestination && ! request.show.existsAsFile())
        problems.add ("The show to build into the product was not written.");
    if (withDestination && ! request.destination.isDirectory())
        problems.add ("Choose a folder to build the product in.");
    return problems;
}

inline player::Plan plan (const player::Template& from, const Request& request)
{
    player::Plan result;
    result.problems = problemsWith (from, request, true);
    if (! result.problems.isEmpty())
        return result;

    const auto& project = request.project;
    const auto name = player::legalName (project.name);
    // A folder per version, so the build of 1.1 does not land on top of the 1.0 still being sent.
    result.folder = player::freshFolder (request.destination, name + " " + project.version);

    player::Contents contents;
    contents.programName = project.standalone ? name + from.standalone.getFileExtension() : juce::String();
    contents.manifest = manifestJson (project);
    contents.standalone = project.standalone;
    contents.vst3 = project.vst3;
    contents.shows.add ({ request.show, showFileName (project) });
    player::addPrograms (result, from, result.folder, contents);

    result.operations.add ({ player::Operation::Kind::writeText, {}, result.folder.getChildFile ("Read me.txt"),
                             readMe (project, contents.programName, from.vst3Bundle.getFileName()) });
    return result;
}

/** The ISCC command line after the compiler itself: every switch build-host-product.mjs's
    isccArgs passes, in its order, then the script. No shell, so a value with spaces needs no
    quotes. */
inline juce::StringArray isccArgs (const player::Template& from, const Request& request,
                                   const juce::File& folder, const juce::File& script)
{
    const auto& project = request.project;
    juce::StringArray args {
        "/DMyAppName=" + project.name,
        "/DMyAppVersion=" + project.version,
        "/DMyAppPublisher=" + project.publisher,
        "/DMyAppId=" + project.appId,
        "/DMySetupBase=" + setupBaseName (project),
        "/DMySourceDir=" + folder.getFullPathName(),
        "/DMyOutputDir=" + folder.getFullPathName(),
        juce::String ("/DIncludeStandalone=") + (project.standalone ? "1" : "0"),
        juce::String ("/DIncludeVst3=") + (project.vst3 ? "1" : "0"),
    };
    if (project.standalone)
        args.add ("/DMyAppExeName=" + player::legalName (project.name) + from.standalone.getFileExtension());
    if (project.vst3)
        args.add ("/DMyVst3BundleName=" + from.vst3Bundle.getFileName());
    args.add (script.getFullPathName());
    return args;
}

/** Inno Setup 6's compiler where its installer puts it — for everyone, or for this user — or on
    the PATH. Empty where there is none, which off Windows is always. */
inline juce::File findInnoCompiler()
{
   #if JUCE_WINDOWS
    juce::Array<juce::File> candidates;
    for (const auto* variable : { "ProgramFiles(x86)", "ProgramFiles" })
        if (const auto root = juce::SystemStats::getEnvironmentVariable (variable, {}); root.isNotEmpty())
            candidates.add (juce::File (root).getChildFile ("Inno Setup 6").getChildFile ("ISCC.exe"));
    if (const auto local = juce::SystemStats::getEnvironmentVariable ("LOCALAPPDATA", {}); local.isNotEmpty())
        candidates.add (juce::File (local).getChildFile ("Programs").getChildFile ("Inno Setup 6").getChildFile ("ISCC.exe"));
    for (const auto& folder : juce::StringArray::fromTokens (juce::SystemStats::getEnvironmentVariable ("PATH", {}), ";", "\""))
        if (juce::File::isAbsolutePath (folder.trim()))
            candidates.add (juce::File (folder.trim()).getChildFile ("ISCC.exe"));
    for (const auto& candidate : candidates)
        if (candidate.existsAsFile())
            return candidate;
   #endif
    return {};
}

} // namespace ceditor::host::product
