// NativeHandlerEngine — host-side loader for COMPILE-AT-EXPORT native handler modules (C++/C#/Java).
//
// At export, each panel's C++/C#/Java handlers are AOT-compiled into one native shared library per
// language (see native-handlers-design.md + NativeHandlerAbi.h). This engine plugs into ScriptRuntime
// exactly like the Lua/JS/Python engines: it loads the bundled module(s) with juce::DynamicLibrary,
// hands them a CeHostVtable that trampolines into ScriptHostApi, and routes dispatch() by (scriptId,
// event) through the flat C ABI. NO language runtime is embedded — these are plain native modules.
//
// THREADING: message thread only (same as the other engines). Modules are loaded lazily on the first
// script of their language and init'd once. C# NativeAOT modules cannot be unloaded, so we keep them
// loaded for the process lifetime; Java modules tear down their isolate on reset().
//
// Status: UNVERIFIED until built with CEDITOR_NATIVE_HANDLERS + a real exported module to load. Build
// is gated so the default player build is unaffected.

#include "ScriptRuntime.h"
#include "NativeHandlerAbi.h"

#include <juce_core/juce_core.h>
#include <map>
#include <cstdlib>
#include <cstring>

#if defined(__APPLE__) || defined(__linux__)
 #include <dlfcn.h>   // dladdr — locate this module's own folder (where the handler modules are bundled)
#elif defined(_WIN32)
 #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
 #endif
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #include <windows.h>
#endif

namespace ceditor::scripting
{
namespace
{

// Host context handed to the module via the vtable's host_ctx, so the static C callbacks can reach
// the live ScriptHostApi.
struct HostCtx { ScriptHostApi* host = nullptr; };

// --- CeStr helpers ------------------------------------------------------------------------------
CeStr toCeStr (const juce::String& s, std::vector<std::string>& pool)
{
    pool.emplace_back (s.toStdString());
    auto& back = pool.back();
    return CeStr { back.data(), (int64_t) back.size() };
}
juce::String fromCeStr (const CeStr& s)
{
    return s.ptr == nullptr ? juce::String() : juce::String::fromUTF8 (s.ptr, (int) s.len);
}

// --- juce::var -> CeValue (host-owned tree; freed with freeCeValueDeep). Uses malloc/free uniformly
// so the same allocator handles host-built payloads, vtable get() results, and handler-returned
// results (the generated glue allocates those via host->alloc == malloc). -----------------------
char* dupUtf8 (const juce::String& s, int64_t& outLen)
{
    auto utf = s.toStdString();
    outLen = (int64_t) utf.size();
    char* p = (char*) std::malloc (utf.size() + 1);
    if (p != nullptr) { std::memcpy (p, utf.data(), utf.size()); p[utf.size()] = 0; }
    return p;
}

CeValue buildCeValue (const juce::var& v)
{
    CeValue out {}; out.tag = CE_NULL;
    if (v.isVoid() || v.isUndefined())          { out.tag = CE_NULL; }
    else if (v.isBool())                         { out.tag = CE_BOOL;   out.u.b = (bool) v ? 1 : 0; }
    else if (v.isInt() || v.isInt64())           { out.tag = CE_INT64;  out.u.i = (int64_t) (juce::int64) v; }
    else if (v.isDouble())                       { out.tag = CE_DOUBLE; out.u.d = (double) v; }
    else if (v.isString())                       { out.tag = CE_STRING; int64_t n = 0; char* p = dupUtf8 (v.toString(), n); out.u.s = CeStr { p, n }; }
    else if (auto* arr = v.getArray())
    {
        out.tag = CE_LIST;
        const int n = arr->size();
        out.u.list.len = n;
        out.u.list.items = (CeValue*) std::malloc (sizeof (CeValue) * (size_t) (n > 0 ? n : 1));
        for (int i = 0; i < n; ++i) out.u.list.items[i] = buildCeValue ((*arr)[i]);
    }
    else if (auto* obj = v.getDynamicObject())
    {
        out.tag = CE_MAP;
        const auto& props = obj->getProperties();
        const int n = props.size();
        out.u.map.len  = n;
        out.u.map.keys = (CeStr*)   std::malloc (sizeof (CeStr)   * (size_t) (n > 0 ? n : 1));
        out.u.map.vals = (CeValue*) std::malloc (sizeof (CeValue) * (size_t) (n > 0 ? n : 1));
        for (int i = 0; i < n; ++i)
        {
            int64_t kn = 0; char* kp = dupUtf8 (props.getName (i).toString(), kn);
            out.u.map.keys[i] = CeStr { kp, kn };
            out.u.map.vals[i] = buildCeValue (props.getValueAt (i));
        }
    }
    return out;
}

void freeCeValueDeep (CeValue* v)
{
    if (v == nullptr) return;
    switch (v->tag)
    {
        case CE_STRING: std::free ((void*) v->u.s.ptr); break;
        case CE_BYTES:  std::free ((void*) v->u.by.ptr); break;
        case CE_LIST:
            for (int64_t i = 0; i < v->u.list.len; ++i) freeCeValueDeep (&v->u.list.items[i]);
            std::free (v->u.list.items);
            break;
        case CE_MAP:
            for (int64_t i = 0; i < v->u.map.len; ++i)
            { std::free ((void*) v->u.map.keys[i].ptr); freeCeValueDeep (&v->u.map.vals[i]); }
            std::free (v->u.map.keys); std::free (v->u.map.vals);
            break;
        default: break;
    }
    v->tag = CE_NULL;
}

juce::var ceToVar (const CeValue* v)
{
    if (v == nullptr) return {};
    switch (v->tag)
    {
        case CE_BOOL:   return juce::var (v->u.b != 0);
        case CE_INT64:  return juce::var ((juce::int64) v->u.i);
        case CE_DOUBLE: return juce::var (v->u.d);
        case CE_STRING: return juce::var (fromCeStr (v->u.s));
        case CE_BYTES:
        {
            juce::Array<juce::var> a;
            for (int64_t i = 0; i < v->u.by.len; ++i) a.add ((int) v->u.by.ptr[i]);
            return juce::var (a);
        }
        case CE_LIST:
        {
            juce::Array<juce::var> a;
            for (int64_t i = 0; i < v->u.list.len; ++i) a.add (ceToVar (&v->u.list.items[i]));
            return juce::var (a);
        }
        case CE_MAP:
        {
            auto* o = new juce::DynamicObject();
            for (int64_t i = 0; i < v->u.map.len; ++i)
                o->setProperty (juce::Identifier (fromCeStr (v->u.map.keys[i])), ceToVar (&v->u.map.vals[i]));
            return juce::var (o);
        }
        default: return {};
    }
}

// --- vtable trampolines (host services the module calls) ----------------------------------------
int  CE_CALL host_set (void* ctx, CeStr key, const CeValue* v, const CeValue* opts)
{
    auto* h = static_cast<HostCtx*> (ctx)->host;
    h->setValue (fromCeStr (key), ceToVar (v), opts ? ceToVar (opts) : juce::var());
    return 0;
}
int  CE_CALL host_get (void* ctx, CeStr key, CeStr form, CeValue* out)
{
    auto* h = static_cast<HostCtx*> (ctx)->host;
    if (out != nullptr) *out = buildCeValue (h->getValue (fromCeStr (key), fromCeStr (form)));
    return 0;
}
void CE_CALL host_send_cc   (void* ctx, int32_t ch, int32_t cc, const CeValue* v)            { static_cast<HostCtx*> (ctx)->host->sendCC (ch, cc, ceToVar (v)); }
void CE_CALL host_send_nrpn (void* ctx, int32_t ch, int32_t msb, int32_t lsb, const CeValue* v){ static_cast<HostCtx*> (ctx)->host->sendNRPN (ch, msb, lsb, ceToVar (v)); }
void CE_CALL host_send_sysex(void* ctx, CeBytes bytes)
{
    juce::Array<juce::var> a; for (int64_t i = 0; i < bytes.len; ++i) a.add ((int) bytes.ptr[i]);
    static_cast<HostCtx*> (ctx)->host->sendSysex (juce::var (a));
}
void CE_CALL host_log  (void* ctx, int32_t /*level*/, CeStr msg) { static_cast<HostCtx*> (ctx)->host->log (fromCeStr (msg), juce::var()); }
void CE_CALL host_emit (void* ctx, CeStr name, const CeValue* data) { static_cast<HostCtx*> (ctx)->host->emitEvent (fromCeStr (name), data ? ceToVar (data) : juce::var()); }
void CE_CALL host_free_value (void* /*ctx*/, CeValue* v) { freeCeValueDeep (v); }
void* CE_CALL host_alloc   (void* /*ctx*/, size_t n) { return std::malloc (n); }
void  CE_CALL host_dealloc (void* /*ctx*/, void* p, size_t /*n*/) { std::free (p); }

// Directory holding THIS module (= the plugin binary), where the export bundles the handler modules.
juce::File hostModuleDir()
{
    juce::File dir;
   #if defined(__APPLE__) || defined(__linux__)
    Dl_info di {};
    if (dladdr (reinterpret_cast<void*> (&host_set), &di) && di.dli_fname != nullptr)
        dir = juce::File (juce::String::fromUTF8 (di.dli_fname)).getParentDirectory();
   #elif defined(_WIN32)
    HMODULE hmod = nullptr;
    if (GetModuleHandleExW (GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                            reinterpret_cast<LPCWSTR> (&host_set), &hmod) && hmod != nullptr)
    {
        wchar_t path[MAX_PATH] = {};
        if (GetModuleFileNameW (hmod, path, MAX_PATH) > 0)
            dir = juce::File (juce::String (path)).getParentDirectory();
    }
   #endif
    if (dir == juce::File())
        dir = juce::File::getSpecialLocation (juce::File::currentExecutableFile).getParentDirectory();
    return dir;
}

juce::String moduleFileName (const juce::String& language)
{
   #if defined(_WIN32)
    const char* ext = ".dll";
   #elif defined(__APPLE__)
    const char* ext = ".dylib";
   #else
    const char* ext = ".so";
   #endif
    return "ce_handlers_" + language + ext;
}

} // namespace

// ------------------------------------------------------------------------------------------------
class NativeHandlerEngine final : public ScriptEngine
{
public:
    juce::String language() const override { return "native"; } // serves cpp/csharp/java

    bool installApi (ScriptHostApi& h) override { host = &h; return true; }

    bool loadScript (const ScriptDefinition& def, const ScriptErrorSink& onError) override
    {
        scriptLang[def.id] = def.language;
        auto* mod = ensureModule (def.language, onError);
        // Module present + correct ABI = this script can run (its handler presence is checked lazily
        // via hasHandler/ce_handler_has). Absent module (language not compiled into this export) = skip.
        return mod != nullptr && mod->ok;
    }

    bool hasHandler (const juce::String& scriptId, const juce::String& fn) const override
    {
        auto langIt = scriptLang.find (scriptId);
        if (langIt == scriptLang.end()) return false;
        auto modIt = modules.find (langIt->second);
        if (modIt == modules.end() || ! modIt->second.ok) return false;
        const auto& m = modIt->second;
        std::vector<std::string> pool;
        return m.has (m.state, toCeStr (scriptId, pool), toCeStr (fn, pool)) != 0;
    }

    juce::var dispatch (const juce::String& scriptId, const juce::String& fn,
                        const juce::var& payload, const ScriptErrorSink& onError) override
    {
        auto langIt = scriptLang.find (scriptId);
        if (langIt == scriptLang.end()) return {};
        auto modIt = modules.find (langIt->second);
        if (modIt == modules.end() || ! modIt->second.ok) return {};
        auto& m = modIt->second;

        std::vector<std::string> pool;
        CeValue arg = buildCeValue (payload);
        CeValue result {}; result.tag = CE_NULL;
        int rc = -1;
        // Best-effort crash guard: catches a C++/managed exception escaping the module. It does NOT
        // catch hardware faults (segfault) — see native-handlers-design.md §5. Windows SEH hardening
        // is a TODO (needs a C shim with no C++ objects in scope).
        try {
            rc = m.dispatch (m.state, toCeStr (scriptId, pool), toCeStr (fn, pool), &arg, &result);
        } catch (...) {
            onError (scriptId, "native handler threw across the ABI boundary");
            freeCeValueDeep (&arg);
            return {};
        }
        freeCeValueDeep (&arg);
        if (rc != 0) { onError (scriptId, "native handler returned error " + juce::String (rc)); freeCeValueDeep (&result); return {}; }
        juce::var v = ceToVar (&result);
        freeCeValueDeep (&result); // handler allocated nested buffers via host->alloc (== malloc)
        return v;
    }

    void reset() override
    {
        for (auto& kv : modules)
        {
            auto& m = kv.second;
            if (m.ok && m.shutdown != nullptr && m.state != nullptr) m.shutdown (m.state);
            m.lib.close();
        }
        modules.clear();
        scriptLang.clear();
    }

private:
    using FnAbiVersion = uint32_t (CE_CALL*)();
    using FnInit       = int      (CE_CALL*)(const CeHostVtable*, void**);
    using FnDispatch   = int      (CE_CALL*)(void*, CeStr, CeStr, const CeValue*, CeValue*);
    using FnHas        = int      (CE_CALL*)(void*, CeStr, CeStr);
    using FnShutdown   = void     (CE_CALL*)(void*);

    struct Module
    {
        juce::DynamicLibrary lib;
        FnDispatch dispatch = nullptr;
        FnHas      has      = nullptr;
        FnShutdown shutdown = nullptr;
        void*      state    = nullptr;
        CeHostVtable vtable {};
        HostCtx    ctx {};
        bool       ok = false;
    };

    Module* ensureModule (const juce::String& language, const ScriptErrorSink& onError)
    {
        if (auto it = modules.find (language); it != modules.end())
            return it->second.ok ? &it->second : nullptr;

        Module m;
        const auto file = hostModuleDir().getChildFile (moduleFileName (language));
        if (! file.existsAsFile() || ! m.lib.open (file.getFullPathName()))
        {
            onError ("native:" + language, "handler module not found: " + file.getFullPathName());
            modules[language] = std::move (m);
            return nullptr;
        }

        auto ver = (FnAbiVersion) m.lib.getFunction ("ce_handler_abi_version");
        auto ini = (FnInit)       m.lib.getFunction ("ce_handler_init");
        m.dispatch = (FnDispatch) m.lib.getFunction ("ce_handler_dispatch");
        m.has      = (FnHas)      m.lib.getFunction ("ce_handler_has");
        m.shutdown = (FnShutdown) m.lib.getFunction ("ce_handler_shutdown");
        if (ver == nullptr || ini == nullptr || m.dispatch == nullptr || m.has == nullptr)
        {
            onError ("native:" + language, "handler module missing required entry points");
            modules[language] = std::move (m);
            return nullptr;
        }
        if (ver() != CE_ABI_VERSION)
        {
            onError ("native:" + language, "handler module ABI mismatch (got " + juce::String (ver()) + ", expected " + juce::String (CE_ABI_VERSION) + ")");
            modules[language] = std::move (m);
            return nullptr;
        }

        m.ctx.host = host;
        m.vtable = CeHostVtable {};
        m.vtable.abi_version = CE_ABI_VERSION;
        m.vtable.struct_size = (uint32_t) sizeof (CeHostVtable);
        m.vtable.host_ctx    = &modules; // placeholder; fixed up after the map insert below
        m.vtable.set = host_set; m.vtable.get = host_get;
        m.vtable.send_cc = host_send_cc; m.vtable.send_nrpn = host_send_nrpn; m.vtable.send_sysex = host_send_sysex;
        m.vtable.log = host_log; m.vtable.emit = host_emit;
        m.vtable.free_value = host_free_value; m.vtable.alloc = host_alloc; m.vtable.dealloc = host_dealloc;

        auto& stored = (modules[language] = std::move (m));
        stored.vtable.host_ctx = &stored.ctx; // stable address now that it lives in the map
        if (ini (&stored.vtable, &stored.state) != 0 || stored.state == nullptr)
        {
            onError ("native:" + language, "handler module init failed");
            stored.ok = false;
            return nullptr;
        }
        stored.ok = true;
        return &stored;
    }

    ScriptHostApi* host = nullptr;
    std::map<juce::String, Module> modules;       // language -> loaded module
    std::map<juce::String, juce::String> scriptLang; // scriptId -> language
};

std::unique_ptr<ScriptEngine> createNativeHandlerEngine() { return std::make_unique<NativeHandlerEngine>(); }

} // namespace ceditor::scripting
