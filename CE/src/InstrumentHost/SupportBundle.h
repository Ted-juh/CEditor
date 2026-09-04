#pragma once

#include <juce_core/juce_core.h>

// SupportBundle — the exportable diagnostic package of §17.7.
//
// The baseline gives a list of what one "can contain, with user review", and then one sentence
// that matters more than the list:
//
//   "Never silently include licence files, unrelated documents, account tokens or complete
//    user directories."
//
// A denylist cannot honour that. Whatever is named as forbidden, the next thing somebody drops
// in the data directory is not on the list, and "we zipped the folder" is how a support bundle
// ends up carrying somebody's licence file. So this gathers by ALLOWLIST: every entry below is
// named in code, and a file nobody named does not travel. Adding one is a deliberate edit, and
// the preview shows the user exactly what an edit did.
//
// THE STATE BLOBS ARE THE OTHER HALF. A session manifest is the single most useful thing in a
// bundle and it carries every loaded plug-in's opaque state — somebody's sound, and in some
// cases their licensed content. §17.7 says "without proprietary state blobs unless explicitly
// included", so the manifest is redacted by default: the blob goes, the DIGEST and the byte
// count stay. That keeps the bundle diagnostic ("part 2's state is 84 KB, hash abc") without
// shipping the bytes, and the digest is the same one §17.3 checks, so a corruption question is
// still answerable from the bundle alone.
//
// preview() exists so "with user review" is a real step rather than a claim: it returns the
// exact entry list, sizes included, before anything is written.
//
// juce_core only — the zip builder lives there, and so do the tests.

namespace ceditor::host
{

struct SupportBundleContents
{
    juce::String productName;
    juce::String productVersion;
    juce::String buildStamp;

    juce::String osDescription;      // e.g. "Windows 11 (10.0.22631)"
    juce::String architecture;       // the same vocabulary the catalogue's check uses

    juce::StringArray audioDevices;  // what the device manager can see, and which is open
    juce::StringArray midiInputs;
    juce::StringArray midiOutputs;
    juce::StringArray hardwareSurfaces;   // model, and firmware where the device reports it

    /** Log files the caller wants carried. Named individually — never a directory sweep. */
    juce::Array<juce::File> logFiles;
    /** Fixed-slot worker minidumps. Binary and potentially memory-bearing, so separately gated. */
    juce::Array<juce::File> crashDumpFiles;
    /** Safe JSON identities paired to fixed-slot dumps; kept behind the same explicit choice. */
    juce::Array<juce::File> crashDumpMetadataFiles;
};

struct SupportBundleOptions
{
    /** §17.7's "unless explicitly included". Off by default and it stays that way unless the
        person exporting turns it on, having seen what it means in the preview. */
    bool includeStateBlobs = false;
    bool includeCrashStates = true;
    bool includeLogs = true;
    bool includeWorkerDumps = false;
};

class SupportBundle
{
public:
    SupportBundle (juce::File dataDirectoryToUse, SupportBundleContents contentsToUse)
        : dataDirectory (std::move (dataDirectoryToUse)),
          contents (std::move (contentsToUse))
    {
    }

    /** One row per thing that would be written. `included` is false for an entry that does not
        apply on this machine (no crash states, no logs), which is worth showing rather than
        hiding: "no crash dumps" is itself an answer. */
    struct Entry
    {
        juce::String name;          // the path inside the zip
        juce::String description;   // what it is, in a sentence
        juce::int64 sizeBytes = 0;
        bool included = false;
        juce::String note;          // e.g. "state blobs removed"
    };

    juce::Array<Entry> preview (const SupportBundleOptions& options) const;

    /** Writes the zip. Returns an empty string on success, or the reason it failed. */
    juce::String writeTo (const juce::File& destination, const SupportBundleOptions& options) const;

    /** Strips every `stateBlob` in a session manifest, keeping the digest and recording the
        size that was removed. Recursive: parts, insert chains, the master chain and returns
        all carry blobs, and a redactor that only knew about parts would leak the rest. */
    static juce::var redactStateBlobs (const juce::var& manifest);

    /** The machine-readable summary that heads the bundle. */
    juce::var manifestVar (const SupportBundleOptions& options) const;

private:
    juce::File dataDirectory;
    SupportBundleContents contents;
};

} // namespace ceditor::host
