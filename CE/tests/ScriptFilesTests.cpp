// ScriptFiles: what a panel's scripts may reach through ce.file, answered by a dialog that is a
// function here, so the rules run without a window: a file only after a dialog, an id never made
// up, only the listed types, writing only where the person agreed, a folder and nothing above it.
#include "ScriptFiles.h"
#include <iostream>

namespace
{
int failures = 0;
void check (bool ok, const char* label)
{
    std::cout << (ok ? "PASS " : "FAIL ") << label << '\n';
    if (! ok) ++failures;
}

juce::var request (std::initializer_list<std::pair<const char*, juce::var>> fields)
{
    auto* o = new juce::DynamicObject();
    for (const auto& [k, v] : fields) o->setProperty (k, v);
    return juce::var (o);
}

juce::var list (std::initializer_list<juce::var> items)
{
    juce::Array<juce::var> a;
    for (const auto& v : items) a.add (v);
    return juce::var (a);
}

juce::String base64 (const juce::String& text) { return juce::Base64::toBase64 (text.toRawUTF8(), text.getNumBytesAsUTF8()); }
}

int main()
{
    const auto root = juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getNonexistentChildFile ("ceditor-script-files", {}, false);
    if (! root.createDirectory()) return 1;
    const auto bank = root.getChildFile ("Bank A.syx");
    bank.replaceWithText ("ABC");
    const auto program = root.getChildFile ("tool.exe");
    program.replaceWithText ("MZ");

    // The person's answer to the next dialog, and what the dialog was asked.
    juce::Array<juce::File> nextAnswer;
    ceditor::ScriptFiles::DialogRequest asked;
    ceditor::ScriptFiles::DialogDone held;
    bool hold = false;
    ceditor::ScriptFiles files ([&] (const ceditor::ScriptFiles::DialogRequest& r, ceditor::ScriptFiles::DialogDone done)
    {
        asked = r;
        if (hold) { held = done; return; }
        done (nextAnswer);
    });
    juce::var last;
    const auto reply = [&last] (const juce::var& v) { last = v; };
    const auto ok = [&last] { return (bool) last.getProperty ("ok", false); };
    const auto error = [&last] { return last.getProperty ("error", "").toString(); };

    files.handle (request ({ { "requestId", 1 }, { "op", "open" } }), reply);
    check (! ok() && error().contains ("types"), "open without types is refused");
    check ((int) last.getProperty ("requestId", 0) == 1, "the answer carries its request id");
    files.handle (request ({ { "op", "open" }, { "types", list ({ "exe" }) } }), reply);
    check (! ok() && error().contains ("\"exe\""), "a type not on the list is refused");

    nextAnswer = { bank };
    files.handle (request ({ { "op", "open" }, { "types", list ({ "syx", "mid" }) }, { "title", "Import a bank" } }), reply);
    check (asked.patterns == "*.syx;*.mid;*.midi" && asked.title == "Import a bank", "the dialog offers only the types asked for");
    const auto opened = last.getProperty ("files", juce::var())[0];
    const auto id = opened.getProperty ("id", "").toString();
    check (ok() && id.length() == 32 && id.containsOnly ("0123456789abcdef"), "a chosen file gets an id of 32 hex digits");
    check (opened.getProperty ("name", "").toString() == "Bank A.syx" && opened.getProperty ("type", "").toString() == "syx"
           && (int) opened.getProperty ("size", 0) == 3 && ! (bool) opened.getProperty ("canWrite", true), "the file value: name, type, size, not writable");
    check (opened.getProperty ("data", "").toString() == base64 ("ABC"), "its contents come with it, as base64");
    check (! opened.toString().contains (root.getFullPathName()) && ! juce::JSON::toString (last).contains (root.getFullPathName()), "no path reaches the page");

    nextAnswer = { program };
    files.handle (request ({ { "op", "open" }, { "types", list ({ "syx" }) } }), reply);
    check (! ok() && error().contains ("not one of the types"), "a file of another type, chosen anyway, is refused");

    nextAnswer = {};
    files.handle (request ({ { "op", "open" }, { "types", list ({ "syx" }) } }), reply);
    check (! ok() && (bool) last.getProperty ("cancelled", false), "a cancelled dialog says so");

    hold = true;
    files.handle (request ({ { "op", "open" }, { "types", list ({ "syx" }) } }), reply);
    files.handle (request ({ { "op", "open" }, { "types", list ({ "syx" }) } }), reply);
    check (! ok() && error().contains ("another ce.file dialog"), "one dialog at a time");
    hold = false;
    held ({});

    files.handle (request ({ { "op", "read" }, { "id", "0123456789abcdef0123456789abcdef" } }), reply);
    check (! ok() && error().contains ("not a file the person chose"), "an id made up is refused");
    bank.replaceWithText ("ABCD");
    files.handle (request ({ { "op", "read" }, { "id", id } }), reply);
    check (ok() && last.getProperty ("data", "").toString() == base64 ("ABCD"), "read gives the file as it is now");
    files.handle (request ({ { "op", "write" }, { "id", id }, { "data", base64 ("X") } }), reply);
    check (! ok() && error().contains ("save to it first") && bank.loadFileAsString() == "ABCD", "a file opened without writable is not written");

    nextAnswer = { bank };
    files.handle (request ({ { "op", "open" }, { "types", list ({ "syx" }) }, { "writable", true }, { "read", false } }), reply);
    const auto writableFile = last.getProperty ("files", juce::var())[0];
    check (ok() && ! writableFile.hasProperty ("data") && writableFile.getProperty ("id", "").toString() == id
           && (bool) writableFile.getProperty ("canWrite", false), "opened writable: the same id, now writable, and not read");
    files.handle (request ({ { "op", "write" }, { "id", id }, { "data", base64 ("NEW") } }), reply);
    check (ok() && bank.loadFileAsString() == "NEW", "write writes it again");

    files.handle (request ({ { "op", "save" }, { "name", "no extension" }, { "data", base64 ("x") } }), reply);
    check (! ok(), "save refuses a name without a listed extension");
    files.handle (request ({ { "op", "save" }, { "name", "../up.syx" }, { "data", base64 ("x") } }), reply);
    check (! ok(), "save refuses a name with a folder in it");
    nextAnswer = { root.getChildFile ("Chosen.exe") };
    files.handle (request ({ { "op", "save" }, { "name", "Bank B.syx" }, { "data", base64 ("SYX") } }), reply);
    const auto saved = last.getProperty ("file", juce::var());
    check (ok() && saved.getProperty ("name", "").toString() == "Chosen.syx" && root.getChildFile ("Chosen.syx").loadFileAsString() == "SYX"
           && ! root.getChildFile ("Chosen.exe").exists(), "save writes the type asked for, whatever extension was typed");
    check ((bool) saved.getProperty ("canWrite", false), "a saved file may be written again");

    juce::MemoryBlock big ((size_t) ceditor::ScriptFiles::maxBytes + 1, true);
    files.handle (request ({ { "op", "write" }, { "id", saved.getProperty ("id", "") }, { "data", juce::Base64::toBase64 (big.getData(), big.getSize()) } }), reply);
    check (! ok() && error().contains ("8 MB"), "more than 8 MB is refused");

    const auto dir = root.getChildFile ("bank");
    dir.createDirectory();
    dir.getChildFile ("10.syx").replaceWithText ("ten");
    dir.getChildFile ("2.syx").replaceWithText ("two");
    dir.getChildFile ("notes.txt").replaceWithText ("t");
    dir.getChildFile ("run.exe").replaceWithText ("x");
    dir.getChildFile ("inner").createDirectory();
    nextAnswer = { dir };
    files.handle (request ({ { "op", "folder" }, { "title", "Export to" } }), reply);
    const auto folderId = last.getProperty ("file", juce::var()).getProperty ("id", "").toString();
    juce::StringArray names;
    for (const auto& f : *last.getProperty ("files", juce::var()).getArray()) names.add (f.getProperty ("name", "").toString());
    check (ok() && (bool) last.getProperty ("file", juce::var()).getProperty ("isFolder", false), "a chosen folder is a folder value");
    check (names.joinIntoString (",") == "2.syx,10.syx,notes.txt", "its files, as a person sorts them, only the listed types");
    files.handle (request ({ { "op", "saveIn" }, { "id", folderId }, { "name", "new.syx" }, { "data", base64 ("n") } }), reply);
    check (! ok() && error().contains ("not chosen writable"), "a folder not chosen writable is not written in");
    files.handle (request ({ { "op", "list" }, { "id", folderId }, { "types", list ({ "txt" }) } }), reply);
    check (ok() && last.getProperty ("files", juce::var()).size() == 1, "list takes types");

    nextAnswer = { dir };
    files.handle (request ({ { "op", "folder" }, { "writable", true } }), reply);
    files.handle (request ({ { "op", "saveIn" }, { "id", folderId }, { "name", "inner/x.syx" }, { "data", base64 ("n") } }), reply);
    check (! ok() && ! dir.getChildFile ("inner/x.syx").exists(), "a name with a folder in it is refused");
    files.handle (request ({ { "op", "saveIn" }, { "id", folderId }, { "name", "..\\x.syx" }, { "data", base64 ("n") } }), reply);
    check (! ok(), "a name that climbs out is refused");
    files.handle (request ({ { "op", "saveIn" }, { "id", folderId }, { "name", "001 Brass.syx" }, { "data", base64 ("brass") } }), reply);
    check (ok() && dir.getChildFile ("001 Brass.syx").loadFileAsString() == "brass" && last.getProperty ("files", juce::var()).size() == 4,
           "saveIn writes into the folder, and lists it again");
    files.handle (request ({ { "op", "saveIn" }, { "id", folderId }, { "name", "001 Brass.syx" }, { "data", base64 ("other") } }), reply);
    check (! ok() && dir.getChildFile ("001 Brass.syx").loadFileAsString() == "brass", "a file already there is not written over");
    files.handle (request ({ { "op", "saveIn" }, { "id", folderId }, { "name", "001 Brass.syx" }, { "data", base64 ("other") }, { "replace", true } }), reply);
    check (ok() && dir.getChildFile ("001 Brass.syx").loadFileAsString() == "other", "unless replace is asked for");
    files.handle (request ({ { "op", "read" }, { "id", folderId } }), reply);
    check (! ok() && error().contains ("folder, not a file"), "a folder is not read as a file");

    files.forgetAll();
    files.handle (request ({ { "op", "read" }, { "id", id } }), reply);
    check (! ok(), "after the panel closes, no id is known");

    root.deleteRecursively();
    return failures == 0 ? 0 : 1;
}
