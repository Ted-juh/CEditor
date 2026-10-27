#pragma once

// ScriptFiles — ce.file's native side (docs/design/ce-file-module.md): the files and folders a
// panel's scripts may reach, and only those.
//
// The one rule is that a script never names a path. Every file comes from a dialog the person
// answered (open, save, folder), and the page is given an id for it, never the path: this table is
// id -> file for the session, and a request naming an id it does not hold is refused. An id is 32
// random hex digits, so one a script makes up is one this table has never seen.
//
// The page talks to it through one event each way, the same in the editor (ValueTreeBridge) and an
// exported plug-in with its window open (PlayerHost):
//   page -> native  "scriptFile"        { requestId, op, ... }
//   native -> page  "scriptFileResult"  { requestId, ok, error, cancelled, file, files, data }
// Contents cross as base64. The dialog itself is handed in, so tests can answer it without a window
// (ScriptFileDialog.h is the real one).

#include <juce_core/juce_core.h>
#include "AtomicFileWrite.h"
#include <functional>
#include <map>
#include <memory>

namespace ceditor
{
class ScriptFiles
{
public:
    enum class Mode { open, save, folder };
    struct DialogRequest
    {
        Mode mode = Mode::open;
        juce::String title;
        juce::String patterns;     // "*.syx;*.mid"
        juce::File startIn;        // for save: the suggested file
        bool multiple = false;
    };
    using DialogDone = std::function<void (const juce::Array<juce::File>&)>;
    using Dialog = std::function<void (const DialogRequest&, DialogDone)>;
    using Reply = std::function<void (const juce::var&)>;

    static constexpr juce::int64 maxBytes = 8 * 1024 * 1024;

    explicit ScriptFiles (Dialog dialogToUse) : dialog (std::move (dialogToUse)) {}

    /** The types a dialog may offer, and only these: never a program or a script file. */
    static const juce::StringArray& types()
    {
        static const juce::StringArray list { "syx", "mid", "json", "txt", "csv" };
        return list;
    }

    /** A file's type: its extension, lower case, without the dot. ".midi" is a MIDI file too. */
    static juce::String typeOf (const juce::File& file)
    {
        auto ext = file.getFileExtension().trimCharactersAtStart (".").toLowerCase();
        return ext == "midi" ? juce::String ("mid") : ext;
    }

    /** The type a name gives: the text after its last dot, as typeOf reads a file. */
    static juce::String typeOfName (const juce::String& name)
    {
        if (! name.containsChar ('.')) return {};
        auto ext = name.fromLastOccurrenceOf (".", false, false).toLowerCase();
        return ext == "midi" ? juce::String ("mid") : ext;
    }

    /** A name with no folder in it: no slash, no backslash, no "..", and not empty. */
    static bool isPlainName (const juce::String& name)
    {
        return name.trim().isNotEmpty() && ! name.containsChar ('/') && ! name.containsChar ('\\')
            && ! name.contains ("..") && ! name.containsChar (':') && name != ".";
    }

    void handle (const juce::var& request, Reply reply)
    {
        const auto requestId = request.getProperty ("requestId", juce::var());
        const auto op = request.getProperty ("op", "").toString();
        auto answer = [requestId, reply] (juce::DynamicObject::Ptr out)
        {
            out->setProperty ("requestId", requestId);
            reply (juce::var (out.get()));
        };
        auto fail = [answer] (const juce::String& error)
        {
            juce::DynamicObject::Ptr out (new juce::DynamicObject());
            out->setProperty ("ok", false);
            out->setProperty ("error", error);
            answer (out);
        };

        if (op == "open")        open (request, answer, fail);
        else if (op == "save")   save (request, answer, fail);
        else if (op == "read")   read (request, answer, fail);
        else if (op == "write")  write (request, answer, fail);
        else if (op == "folder") folder (request, answer, fail);
        else if (op == "list")   list (request, answer, fail);
        else if (op == "saveIn") saveIn (request, answer, fail);
        else if (op == "forget")
        {
            forgetAll();
            juce::DynamicObject::Ptr out (new juce::DynamicObject());
            out->setProperty ("ok", true);
            answer (out);
        }
        else fail ("\"" + op + "\" is not something ce.file does");
    }

    /** Forget every file and folder: the panel closed, and next time the person is asked again. */
    void forgetAll() { entries.clear(); idsByPath.clear(); }

    bool dialogOpen() const { return busy; }

private:
    struct Entry { juce::File file; bool canWrite = false; bool isFolder = false; };
    using Answer = std::function<void (juce::DynamicObject::Ptr)>;
    using Fail = std::function<void (const juce::String&)>;

    Dialog dialog;
    std::map<juce::String, Entry> entries;
    std::map<juce::String, juce::String> idsByPath;
    bool busy = false;
    std::shared_ptr<bool> alive = std::make_shared<bool> (true);
    juce::Random random;

public:
    ~ScriptFiles() { *alive = false; }

private:
    static juce::StringArray typesFrom (const juce::var& v)
    {
        juce::StringArray out;
        if (auto* arr = v.getArray())
            for (const auto& t : *arr)
                out.addIfNotAlreadyThere (t.toString().toLowerCase());
        else if (v.isString() && v.toString().isNotEmpty())
            out.add (v.toString().toLowerCase());
        return out;
    }

    static juce::String patternsFor (const juce::StringArray& wanted)
    {
        juce::StringArray patterns;
        for (const auto& t : wanted)
        {
            patterns.add ("*." + t);
            if (t == "mid") patterns.add ("*.midi");
        }
        return patterns.joinIntoString (";");
    }

    juce::String newId()
    {
        juce::String id;
        for (int i = 0; i < 4; ++i)
            id << juce::String::toHexString ((juce::int64) (juce::uint32) random.nextInt()).paddedLeft ('0', 8);
        return id;
    }

    /** The id for a file, the same one each time it is met, with its rights widened as granted. */
    juce::String add (const juce::File& file, bool canWrite, bool isFolder)
    {
        const auto key = file.getFullPathName();
        if (const auto it = idsByPath.find (key); it != idsByPath.end())
        {
            auto& entry = entries[it->second];
            entry.canWrite = entry.canWrite || canWrite;
            return it->second;
        }
        const auto id = newId();
        entries[id] = { file, canWrite, isFolder };
        idsByPath[key] = id;
        return id;
    }

    juce::var describe (const juce::String& id) const
    {
        const auto& e = entries.at (id);
        auto* o = new juce::DynamicObject();
        o->setProperty ("id", id);
        o->setProperty ("name", e.file.getFileName());
        o->setProperty ("type", e.isFolder ? juce::String() : typeOf (e.file));
        o->setProperty ("size", e.isFolder ? (juce::int64) 0 : e.file.getSize());
        o->setProperty ("canWrite", e.canWrite);
        o->setProperty ("isFolder", e.isFolder);
        return juce::var (o);
    }

    const Entry* find (const juce::var& request, bool folder, const Fail& fail) const
    {
        const auto id = request.getProperty ("id", "").toString();
        const auto it = entries.find (id);
        if (it == entries.end())
        {
            fail (folder ? "that is not a folder the person chose with ce.file.folder"
                         : "that is not a file the person chose with ce.file.open, save or folder");
            return nullptr;
        }
        if (it->second.isFolder != folder)
        {
            fail (folder ? "that is a file, not a folder" : "that is a folder, not a file");
            return nullptr;
        }
        return &it->second;
    }

    /** Bytes from base64; false (and a reason) when they are not, or are too many. */
    static bool decode (const juce::var& request, juce::MemoryBlock& out, const Fail& fail)
    {
        juce::MemoryOutputStream stream (out, false);
        if (! juce::Base64::convertFromBase64 (stream, request.getProperty ("data", "").toString()))
        {
            fail ("the data could not be read");
            return false;
        }
        stream.flush();
        if ((juce::int64) out.getSize() > maxBytes)
        {
            fail ("it is " + juce::String ((juce::int64) out.getSize()) + " bytes, and a file can be up to 8 MB");
            return false;
        }
        return true;
    }

    /** A file's contents as base64; false (and a reason) when it has gone or is too large. */
    static bool contents (const juce::File& file, juce::String& base64, const Fail& fail)
    {
        if (! file.existsAsFile())
        {
            fail ("\"" + file.getFileName() + "\" is no longer there");
            return false;
        }
        if (file.getSize() > maxBytes)
        {
            fail ("\"" + file.getFileName() + "\" is " + juce::String (file.getSize()) + " bytes, and a file can be up to 8 MB");
            return false;
        }
        juce::MemoryBlock block;
        if (! file.loadFileAsData (block))
        {
            fail ("\"" + file.getFileName() + "\" could not be read");
            return false;
        }
        base64 = juce::Base64::toBase64 (block.getData(), block.getSize());
        return true;
    }

    juce::Array<juce::var> listing (const juce::File& folder, bool canWrite, const juce::StringArray& wanted)
    {
        auto files = folder.findChildFiles (juce::File::findFiles, false, "*", juce::File::FollowSymlinks::no);
        // As a person sorts them: "2" before "10".
        std::sort (files.begin(), files.end(), [] (const juce::File& a, const juce::File& b)
                   { return a.getFileName().compareNatural (b.getFileName()) < 0; });
        juce::Array<juce::var> out;
        for (const auto& f : files)
        {
            const auto t = typeOf (f);
            if (! types().contains (t) || (! wanted.isEmpty() && ! wanted.contains (t))) continue;
            out.add (describe (add (f, canWrite, false)));
        }
        return out;
    }

    bool takeDialog (const Fail& fail)
    {
        if (busy) { fail ("another ce.file dialog is open"); return false; }
        busy = true;
        return true;
    }

    void open (const juce::var& request, const Answer& answer, const Fail& fail)
    {
        const auto wanted = typesFrom (request.getProperty ("types", juce::var()));
        if (wanted.isEmpty()) { fail ("types must name what to open, from syx, mid, json, txt and csv"); return; }
        for (const auto& t : wanted)
            if (! types().contains (t)) { fail ("\"" + t + "\" is not a type ce.file opens: syx, mid, json, txt or csv"); return; }
        if (! takeDialog (fail)) return;

        DialogRequest d;
        d.mode = Mode::open;
        d.title = request.getProperty ("title", "Open").toString();
        d.patterns = patternsFor (wanted);
        d.multiple = (bool) request.getProperty ("multiple", false);
        const bool writable = (bool) request.getProperty ("writable", false);
        const bool readNow = (bool) request.getProperty ("read", true);
        dialog (d, [this, alive = alive, wanted, writable, readNow, answer, fail] (const juce::Array<juce::File>& chosen)
        {
            if (! *alive) return;
            busy = false;
            juce::DynamicObject::Ptr out (new juce::DynamicObject());
            if (chosen.isEmpty())
            {
                out->setProperty ("ok", false);
                out->setProperty ("cancelled", true);
                answer (out);
                return;
            }
            juce::Array<juce::var> files;
            juce::StringArray errors;
            for (const auto& f : chosen)
            {
                if (! wanted.contains (typeOf (f))) { errors.add ("\"" + f.getFileName() + "\" is not one of the types asked for"); continue; }
                juce::String base64;
                const Fail note = [&errors] (const juce::String& e) { errors.add (e); };
                if (readNow && ! contents (f, base64, note)) continue;
                if (! readNow && f.getSize() > maxBytes) { note ("\"" + f.getFileName() + "\" is larger than 8 MB"); continue; }
                auto entry = describe (add (f, writable, false));
                if (readNow) entry.getDynamicObject()->setProperty ("data", base64);
                files.add (entry);
            }
            out->setProperty ("ok", ! files.isEmpty());
            out->setProperty ("files", files);
            if (! errors.isEmpty()) out->setProperty ("error", errors.joinIntoString ("; "));
            answer (out);
        });
    }

    void save (const juce::var& request, const Answer& answer, const Fail& fail)
    {
        const auto name = request.getProperty ("name", "").toString();
        const auto type = typeOfName (name);
        if (! isPlainName (name) || ! types().contains (type))
        {
            fail ("the name must end in .syx, .mid, .json, .txt or .csv, and hold no folder");
            return;
        }
        juce::MemoryBlock data;
        if (! decode (request, data, fail)) return;
        if (! takeDialog (fail)) return;

        DialogRequest d;
        d.mode = Mode::save;
        d.title = request.getProperty ("title", "Save").toString();
        d.patterns = patternsFor ({ type });
        d.startIn = juce::File::getSpecialLocation (juce::File::userDocumentsDirectory).getChildFile (name);
        dialog (d, [this, alive = alive, type, data, answer, fail] (const juce::Array<juce::File>& chosen)
        {
            if (! *alive) return;
            busy = false;
            if (chosen.isEmpty())
            {
                juce::DynamicObject::Ptr out (new juce::DynamicObject());
                out->setProperty ("ok", false);
                out->setProperty ("cancelled", true);
                answer (out);
                return;
            }
            // The type the script asked for, whatever the person typed after the name.
            auto file = chosen.getFirst();
            if (typeOf (file) != type) file = file.withFileExtension (type);
            if (! writeBytesAtomically (file, data.getData(), data.getSize()))
            {
                fail ("\"" + file.getFileName() + "\" could not be written");
                return;
            }
            juce::DynamicObject::Ptr out (new juce::DynamicObject());
            out->setProperty ("ok", true);
            out->setProperty ("file", describe (add (file, true, false)));
            answer (out);
        });
    }

    void read (const juce::var& request, const Answer& answer, const Fail& fail)
    {
        const auto* e = find (request, false, fail);
        if (e == nullptr) return;
        juce::String base64;
        if (! contents (e->file, base64, fail)) return;
        juce::DynamicObject::Ptr out (new juce::DynamicObject());
        out->setProperty ("ok", true);
        out->setProperty ("data", base64);
        answer (out);
    }

    void write (const juce::var& request, const Answer& answer, const Fail& fail)
    {
        const auto* e = find (request, false, fail);
        if (e == nullptr) return;
        if (! e->canWrite)
        {
            fail ("\"" + e->file.getFileName() + "\" may not be written: the person must save to it first, or open it with writable");
            return;
        }
        juce::MemoryBlock data;
        if (! decode (request, data, fail)) return;
        if (! writeBytesAtomically (e->file, data.getData(), data.getSize()))
        {
            fail ("\"" + e->file.getFileName() + "\" could not be written");
            return;
        }
        juce::DynamicObject::Ptr out (new juce::DynamicObject());
        out->setProperty ("ok", true);
        answer (out);
    }

    void folder (const juce::var& request, const Answer& answer, const Fail& fail)
    {
        if (! takeDialog (fail)) return;
        DialogRequest d;
        d.mode = Mode::folder;
        d.title = request.getProperty ("title", "Choose a folder").toString();
        const bool writable = (bool) request.getProperty ("writable", false);
        dialog (d, [this, alive = alive, writable, answer] (const juce::Array<juce::File>& chosen)
        {
            if (! *alive) return;
            busy = false;
            juce::DynamicObject::Ptr out (new juce::DynamicObject());
            if (chosen.isEmpty() || ! chosen.getFirst().isDirectory())
            {
                out->setProperty ("ok", false);
                out->setProperty ("cancelled", true);
                answer (out);
                return;
            }
            const auto dir = chosen.getFirst();
            out->setProperty ("ok", true);
            out->setProperty ("file", describe (add (dir, writable, true)));
            out->setProperty ("files", listing (dir, writable, {}));
            answer (out);
        });
    }

    void list (const juce::var& request, const Answer& answer, const Fail& fail)
    {
        const auto* e = find (request, true, fail);
        if (e == nullptr) return;
        juce::DynamicObject::Ptr out (new juce::DynamicObject());
        out->setProperty ("ok", true);
        out->setProperty ("files", listing (e->file, e->canWrite, typesFrom (request.getProperty ("types", juce::var()))));
        answer (out);
    }

    void saveIn (const juce::var& request, const Answer& answer, const Fail& fail)
    {
        const auto* e = find (request, true, fail);
        if (e == nullptr) return;
        if (! e->canWrite) { fail ("the folder was not chosen writable, so nothing may be written in it"); return; }
        const auto name = request.getProperty ("name", "").toString();
        if (! isPlainName (name)) { fail ("\"" + name + "\" is not a plain file name: no /, \\ or .. in it"); return; }
        const auto target = e->file.getChildFile (name);
        if (target.getParentDirectory() != e->file) { fail ("\"" + name + "\" is not a plain file name"); return; }
        if (! types().contains (typeOf (target))) { fail ("the name must end in .syx, .mid, .json, .txt or .csv"); return; }
        if (target.exists() && ! (bool) request.getProperty ("replace", false))
        {
            fail ("\"" + name + "\" is there already, and replace was not asked for");
            return;
        }
        juce::MemoryBlock data;
        if (! decode (request, data, fail)) return;
        const auto folderFile = e->file;
        if (! writeBytesAtomically (target, data.getData(), data.getSize()))
        {
            fail ("\"" + name + "\" could not be written");
            return;
        }
        juce::DynamicObject::Ptr out (new juce::DynamicObject());
        out->setProperty ("ok", true);
        out->setProperty ("file", describe (add (target, true, false)));
        out->setProperty ("files", listing (folderFile, true, {}));
        answer (out);
    }
};
}
