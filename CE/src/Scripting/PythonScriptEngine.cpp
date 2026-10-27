// PythonScriptEngine — REAL CPython (3.x) embedded natively via the C API (Python.h).
//
// This is the "full" Python path: the actual CPython interpreter is linked into the host, so the
// complete language AND the complete standard library are available (`import json`, `re`, `struct`,
// `math`, … all work, same as desktop Python). Window-CLOSED Python lives here; the WebView
// (window-open) keeps using Pyodide (also real CPython, in WASM) — both are genuine CPython, so the
// fidelity gap between open/closed is only the patch version, not the language.
//
// Isolation: an interpreter per instance. Two copies of a panel, or two panels, in one DAW or one
// process share nothing through Python: each instance has its own sub-interpreter, so its own
// sys.modules, builtins and everything its scripts import or change, and its own `ceditor` bridge
// module, whose state names the instance — a call from a script reaches its own instance's host and
// no other. Within an instance each script is exec'd into its OWN namespace dict, exactly like Lua's
// sol::environment and the per-script QuickJS scope, so two scripts can both `def onValueChanged(...)`
// and own a distinct `self` without clashing; they share their instance's imports.
//
// Until October 2026 there was ONE interpreter for the process, and the bridge reached the host
// through a global pointer re-aimed at each instance as it was entered. Anything a script changed in
// a module (random.seed, a monkeypatched builtin, a module-level cache) changed it for every other
// instance; and a second exported plug-in in the same process imported the first one's bridge, whose
// pointer was the first one's to aim.
//
// The bridge's functions are plain C, made into a module per instance rather than imported through
// an inittab entry, so that each instance's module is its own object with its own state. The Python
// prelude wraps it as globals + the same pure-math / MIDI helpers as the Lua + JS preludes (kept in
// sync with panelApi.js).
//
// THREADING: one thread at a time per instance, in practice the message thread. CPython is started
// once per process and the GIL let go; each call into an instance takes it with that instance's
// thread state current and lets it go on the way out, so another instance (or another component
// using Python) can run between calls. The audio thread never touches this.
//
// Requires Python3::Python 3.12 or later (CMake, behind CEDITOR_PYTHON) — Py_NewInterpreterFromConfig,
// which is what allows an interpreter without threads, and a per-thread current thread state. Stdlib
// search path: env CEDITOR_PYTHONHOME, else a `PythonRuntime` folder next to the host binary (what the
// exporter bundles, 3.13), else the build-time default.

#define PY_SSIZE_T_CLEAN
// On MSVC, including Python.h while _DEBUG is defined auto-links python3xx_d.lib (the *debug*
// libpython), which a standard CPython install does NOT ship. Temporarily undef _DEBUG across the
// include so the release import lib (python3xx.lib) is linked instead — the accepted way to embed
// CPython in a Debug MSVC build. No effect in Release builds.
#if defined(_MSC_VER) && defined(_DEBUG)
#  define CE_PY_RESTORE_DEBUG
#  undef _DEBUG
#  include <Python.h>
#  define _DEBUG
#  undef CE_PY_RESTORE_DEBUG
#else
#  include <Python.h>
#endif

#if PY_VERSION_HEX < 0x030C0000
 #error "The embedded Python engine needs CPython 3.12 or later: each instance runs in an interpreter of its own (Py_NewInterpreterFromConfig)."
#endif

#include "ScriptRuntime.h"

#include <atomic>
#include <cmath>
#include <map>
#include <vector>

#if defined(_WIN32)
 #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
 #endif
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #include <windows.h>   // GetModuleHandleEx/GetModuleFileName — resolve THIS plugin's own folder
#elif defined(__APPLE__) || defined(__linux__)
 #include <dlfcn.h>     // dladdr — resolve THIS plugin's own folder from a local symbol
#endif

namespace ceditor::scripting
{

class PythonScriptEngine; // defined below; the anon-namespace globals + native fns refer to it.

namespace
{

// --- Which instance a bridge call belongs to -----------------------------------------------------
// Each instance runs its scripts in an interpreter of its own, whose `ceditor` module is its own
// too, and the module's state names the instance. Every bridge call arrives with its module, so it
// reaches the host of the instance whose script made it, whatever else is running. These used to
// be two process-wide pointers, re-aimed at whichever instance had last been entered.
struct BridgeOwner
{
    ScriptHostApi*      host   = nullptr;
    PythonScriptEngine* engine = nullptr;
};

/** The host a call reaches when its instance has none: before installApi, and while the instance's
    interpreter ends, when a finalizer or an atexit handler may still call. It does nothing. */
class GoneHost final : public ScriptHostApi
{
public:
    juce::var getValue (const juce::String&, const juce::String&) override { return {}; }
    void setValue (const juce::String&, const juce::var&, const juce::var&) override {}
    void sendCC (int, int, const juce::var&) override {}
    void sendNRPN (int, int, int, const juce::var&) override {}
    void sendSysex (const juce::var&) override {}
    void requestDump (const juce::String&) override {}
    void applyDump (const juce::var&) override {}
    void sendDump (const juce::String&) override {}
    juce::var buildDump (const juce::String&) override { return {}; }
    juce::var runAction (const juce::String&, const juce::var&) override { return {}; }
    void emitEvent (const juce::String&, const juce::var&) override {}
    void log (const juce::String&, const juce::var&) override {}
};

BridgeOwner* ownerOf (PyObject* module) { return static_cast<BridgeOwner*> (PyModule_GetState (module)); }

ScriptHostApi& hostOf (PyObject* module)
{
    static GoneHost gone;
    auto* owner = ownerOf (module);
    return owner != nullptr && owner->host != nullptr ? *owner->host : gone;
}

/** The thread state current on this thread, or null. Every interpreter here shares the one GIL, so
    a thread holds it exactly when one of them is current. */
PyThreadState* currentThreadState()
{
   #if PY_VERSION_HEX >= 0x030D0000
    return PyThreadState_GetUnchecked();
   #else
    return _PyThreadState_UncheckedGet();
   #endif
}

juce::String pyStr (PyObject* o)
{
    if (o == nullptr) return {};
    if (auto* utf8 = PyUnicode_AsUTF8 (o)) return juce::String::fromUTF8 (utf8);
    return {};
}

/** Pull the current Python exception into a one-line message and clear it (never throws out). */
juce::String fetchPyError()
{
    if (! PyErr_Occurred()) return {};
    PyObject* type = nullptr; PyObject* value = nullptr; PyObject* tb = nullptr;
    PyErr_Fetch (&type, &value, &tb);
    PyErr_NormalizeException (&type, &value, &tb);

    juce::String msg;
    if (value != nullptr)
    {
        if (PyObject* s = PyObject_Str (value)) { msg = pyStr (s); Py_DECREF (s); }
        if (type != nullptr)
        {
            if (PyObject* tn = PyObject_GetAttrString (type, "__name__"))
            { msg = pyStr (tn) + ": " + msg; Py_DECREF (tn); }
        }
    }
    else if (type != nullptr)
    {
        if (PyObject* s = PyObject_Str (type)) { msg = pyStr (s); Py_DECREF (s); }
    }

    Py_XDECREF (type); Py_XDECREF (value); Py_XDECREF (tb);
    return msg.isEmpty() ? juce::String ("unknown Python error") : msg;
}

// --- var <-> PyObject -------------------------------------------------------------------------
// New reference returned (caller owns it).
PyObject* varToPy (const juce::var& v)
{
    if (v.isVoid() || v.isUndefined()) Py_RETURN_NONE;
    if (v.isBool())   { if ((bool) v) Py_RETURN_TRUE; Py_RETURN_FALSE; }
    if (v.isInt() || v.isInt64()) return PyLong_FromLongLong ((long long) (juce::int64) v);
    if (v.isDouble()) return PyFloat_FromDouble ((double) v);
    if (v.isString()) { auto s = v.toString().toStdString(); return PyUnicode_FromStringAndSize (s.data(), (Py_ssize_t) s.size()); }
    if (auto* arr = v.getArray())
    {
        PyObject* list = PyList_New ((Py_ssize_t) arr->size());
        if (list == nullptr) return nullptr;
        for (int i = 0; i < arr->size(); ++i)
        {
            PyObject* item = varToPy ((*arr)[i]);
            if (item == nullptr) { PyErr_Clear(); Py_INCREF (Py_None); item = Py_None; } // never leave a NULL slot
            PyList_SET_ITEM (list, i, item); // steals ref
        }
        return list;
    }
    if (auto* obj = v.getDynamicObject())
    {
        PyObject* dict = PyDict_New();
        if (dict == nullptr) return nullptr;
        for (auto& prop : obj->getProperties())
        {
            PyObject* val = varToPy (prop.value);
            if (val == nullptr) { PyErr_Clear(); Py_INCREF (Py_None); val = Py_None; } // never drop a key on alloc failure
            PyDict_SetItemString (dict, prop.name.toString().toRawUTF8(), val);
            Py_XDECREF (val);
        }
        return dict;
    }
    Py_RETURN_NONE;
}

juce::var pyToVar (PyObject* o)
{
    if (o == nullptr || o == Py_None) return {};
    if (PyBool_Check (o)) return juce::var (o == Py_True);            // before PyLong: bool is a long subtype
    if (PyLong_Check (o))
    {
        // An int beyond int64 sets OverflowError + returns -1; clear it and fall back to double
        // (juce::var has no >64-bit integer) so we never return with a pending exception that would
        // leak into the next call's fetchPyError().
        long long ll = PyLong_AsLongLong (o);
        if (ll == -1 && PyErr_Occurred()) { PyErr_Clear(); double d = PyLong_AsDouble (o); if (PyErr_Occurred()) PyErr_Clear(); return juce::var (d); }
        return juce::var ((juce::int64) ll);
    }
    if (PyFloat_Check (o))
    {
        double d = PyFloat_AsDouble (o);
        if (d == -1.0 && PyErr_Occurred()) { PyErr_Clear(); return {}; }
        return juce::var (d);
    }
    if (PyUnicode_Check (o)) return juce::var (pyStr (o));
    if (PyList_Check (o) || PyTuple_Check (o))
    {
        const bool tuple = PyTuple_Check (o);
        const Py_ssize_t n = tuple ? PyTuple_Size (o) : PyList_Size (o);
        juce::Array<juce::var> arr;
        for (Py_ssize_t i = 0; i < n; ++i)
            arr.add (pyToVar (tuple ? PyTuple_GetItem (o, i) : PyList_GetItem (o, i))); // borrowed
        return juce::var (arr);
    }
    if (PyDict_Check (o))
    {
        auto* obj = new juce::DynamicObject();
        PyObject* key = nullptr; PyObject* val = nullptr; Py_ssize_t pos = 0;
        while (PyDict_Next (o, &pos, &key, &val))                     // borrowed
        {
            if (PyObject* ks = PyObject_Str (key))
            { obj->setProperty (juce::Identifier (pyStr (ks)), pyToVar (val)); Py_DECREF (ks); }
        }
        return juce::var (obj);
    }
    if (PyBytes_Check (o))                                            // bytes -> array of ints (sysex)
    {
        char* buf = nullptr; Py_ssize_t n = 0;
        if (PyBytes_AsStringAndSize (o, &buf, &n) != 0) { PyErr_Clear(); return {}; }
        juce::Array<juce::var> arr;
        for (Py_ssize_t i = 0; i < n; ++i) arr.add ((int) (unsigned char) buf[i]);
        return juce::var (arr);
    }
    // Fallback: str() it.
    if (PyObject* s = PyObject_Str (o)) { auto r = juce::var (pyStr (s)); Py_DECREF (s); return r; }
    return {};
}

// --- native `ceditor` module: the host bridge -------------------------------------------------
PyObject* api_set (PyObject* self, PyObject* args)
{
    const char* path = nullptr; PyObject* value = nullptr; PyObject* opts = nullptr;
    if (! PyArg_ParseTuple (args, "sO|O", &path, &value, &opts)) return nullptr;
    hostOf (self).setValue (juce::String::fromUTF8 (path), pyToVar (value),
                            (opts && opts != Py_None) ? pyToVar (opts) : juce::var());
    Py_RETURN_NONE;
}
PyObject* api_get (PyObject* self, PyObject* args)
{
    const char* path = nullptr; const char* form = "value";
    if (! PyArg_ParseTuple (args, "s|s", &path, &form)) return nullptr;
    return varToPy (hostOf (self).getValue (juce::String::fromUTF8 (path), juce::String::fromUTF8 (form)));
}
// Why a script's get() found nothing, or None (ScriptHostApi::whyNoValue).
PyObject* api_whyNoValue (PyObject* self, PyObject* args)
{
    const char* path = nullptr; const char* form = "value";
    if (! PyArg_ParseTuple (args, "s|s", &path, &form)) return nullptr;
    const auto why = hostOf (self).whyNoValue (juce::String::fromUTF8 (path), juce::String::fromUTF8 (form));
    if (why.isEmpty()) Py_RETURN_NONE;
    return PyUnicode_FromString (why.toRawUTF8());
}
PyObject* api_sendCC (PyObject* self, PyObject* args)
{
    int ch = 0, cc = 0; PyObject* v = nullptr;
    if (! PyArg_ParseTuple (args, "iiO", &ch, &cc, &v)) return nullptr;
    hostOf (self).sendCC (ch, cc, pyToVar (v)); Py_RETURN_NONE;
}
PyObject* api_sendNRPN (PyObject* self, PyObject* args)
{
    int ch = 0, msb = 0, lsb = 0; PyObject* v = nullptr;
    if (! PyArg_ParseTuple (args, "iiiO", &ch, &msb, &lsb, &v)) return nullptr;
    hostOf (self).sendNRPN (ch, msb, lsb, pyToVar (v)); Py_RETURN_NONE;
}
PyObject* api_sendSysex (PyObject* self, PyObject* args)
{
    PyObject* bytes = nullptr;
    if (! PyArg_ParseTuple (args, "O", &bytes)) return nullptr;
    hostOf (self).sendSysex (pyToVar (bytes)); Py_RETURN_NONE;
}
PyObject* api_requestDump (PyObject* self, PyObject* args)
{
    const char* kind = nullptr; if (! PyArg_ParseTuple (args, "s", &kind)) return nullptr;
    hostOf (self).requestDump (juce::String::fromUTF8 (kind)); Py_RETURN_NONE;
}
PyObject* api_applyDump (PyObject* self, PyObject* args)
{
    PyObject* bytes = nullptr; if (! PyArg_ParseTuple (args, "O", &bytes)) return nullptr;
    hostOf (self).applyDump (pyToVar (bytes)); Py_RETURN_NONE;
}
PyObject* api_deviceDefine (PyObject* self, PyObject* args)
{
    const char* what = nullptr; const char* id = nullptr; PyObject* spec = nullptr;
    if (! PyArg_ParseTuple (args, "ssO", &what, &id, &spec)) return nullptr;
    const bool ok = hostOf (self).deviceDefine (juce::String::fromUTF8 (what), juce::String::fromUTF8 (id),
                                                pyToVar (spec));
    return PyBool_FromLong (ok ? 1 : 0);
}
PyObject* api_sendDump (PyObject* self, PyObject* args)
{
    const char* kind = nullptr; if (! PyArg_ParseTuple (args, "s", &kind)) return nullptr;
    hostOf (self).sendDump (juce::String::fromUTF8 (kind)); Py_RETURN_NONE;
}
PyObject* api_buildDump (PyObject* self, PyObject* args)
{
    const char* kind = nullptr; if (! PyArg_ParseTuple (args, "s", &kind)) return nullptr;
    return varToPy (hostOf (self).buildDump (juce::String::fromUTF8 (kind)));
}
PyObject* api_animate (PyObject* self, PyObject* args)
{
    // `path` is a str OR a list of str — one call, one shape, one completion — so it comes through
    // as an object and pyToVar decides which it was.
    const char* kind = nullptr; PyObject* path = nullptr; double target = 0.0; PyObject* opts = nullptr;
    if (! PyArg_ParseTuple (args, "sOd|O", &kind, &path, &target, &opts)) return nullptr;
    const bool started = hostOf (self).startAnimation (juce::String::fromUTF8 (kind), pyToVar (path), target,
                                                       opts != nullptr ? pyToVar (opts) : juce::var());
    return PyBool_FromLong (started ? 1 : 0);
}
PyObject* api_animateStop (PyObject* self, PyObject* args)
{
    const char* path = nullptr; if (! PyArg_ParseTuple (args, "s", &path)) return nullptr;
    hostOf (self).stopAnimation (juce::String::fromUTF8 (path)); Py_RETURN_NONE;
}
PyObject* api_animateRunning (PyObject* self, PyObject* args)
{
    const char* path = nullptr; if (! PyArg_ParseTuple (args, "s", &path)) return nullptr;
    if (hostOf (self).animationRunning (juce::String::fromUTF8 (path))) Py_RETURN_TRUE;
    Py_RETURN_FALSE;
}
PyObject* api_animateValue (PyObject* self, PyObject* args)
{
    const char* path = nullptr; if (! PyArg_ParseTuple (args, "s", &path)) return nullptr;
    return varToPy (hostOf (self).animationValue (juce::String::fromUTF8 (path)));
}
PyObject* api_animateList (PyObject* self, PyObject*)
{
    return varToPy (hostOf (self).animationList());
}
PyObject* api_animatePause (PyObject* self, PyObject* args)
{
    const char* path = nullptr; if (! PyArg_ParseTuple (args, "s", &path)) return nullptr;
    if (hostOf (self).animationPause (juce::String::fromUTF8 (path))) Py_RETURN_TRUE;
    Py_RETURN_FALSE;
}
PyObject* api_animateResume (PyObject* self, PyObject* args)
{
    const char* path = nullptr; if (! PyArg_ParseTuple (args, "s", &path)) return nullptr;
    if (hostOf (self).animationResume (juce::String::fromUTF8 (path))) Py_RETURN_TRUE;
    Py_RETURN_FALSE;
}
PyObject* api_animateReverse (PyObject* self, PyObject* args)
{
    const char* path = nullptr; if (! PyArg_ParseTuple (args, "s", &path)) return nullptr;
    if (hostOf (self).animationReverse (juce::String::fromUTF8 (path))) Py_RETURN_TRUE;
    Py_RETURN_FALSE;
}
PyObject* api_animateFinish (PyObject* self, PyObject* args)
{
    const char* path = nullptr; if (! PyArg_ParseTuple (args, "s", &path)) return nullptr;
    if (hostOf (self).animationFinish (juce::String::fromUTF8 (path))) Py_RETURN_TRUE;
    Py_RETURN_FALSE;
}
PyObject* api_transportState (PyObject* self, PyObject*)
{
    return varToPy (hostOf (self).transportState());
}
PyObject* api_nowMs (PyObject* self, PyObject*)
{
    return PyFloat_FromDouble (hostOf (self).nowMs());
}
PyObject* api_deviceQuery (PyObject* self, PyObject* args)
{
    const char* kind = nullptr; PyObject* payload = nullptr;
    if (! PyArg_ParseTuple (args, "s|O", &kind, &payload)) return nullptr;
    return varToPy (hostOf (self).deviceQuery (juce::String::fromUTF8 (kind),
                                               payload != nullptr ? pyToVar (payload) : juce::var()));
}
PyObject* api_panelQuery (PyObject* self, PyObject* args)
{
    const char* kind = nullptr; PyObject* payload = nullptr;
    if (! PyArg_ParseTuple (args, "s|O", &kind, &payload)) return nullptr;
    return varToPy (hostOf (self).panelQuery (juce::String::fromUTF8 (kind),
                                              payload != nullptr ? pyToVar (payload) : juce::var()));
}
PyObject* api_deviceSet (PyObject* self, PyObject* args)
{
    const char* kind = nullptr; const char* name = nullptr; PyObject* value = nullptr; const char* role = nullptr;
    if (! PyArg_ParseTuple (args, "ssOs", &kind, &name, &value, &role)) return nullptr;
    const bool ok = hostOf (self).deviceSet (juce::String::fromUTF8 (kind), juce::String::fromUTF8 (name),
                                             pyToVar (value), juce::String::fromUTF8 (role));
    if (ok) Py_RETURN_TRUE;
    Py_RETURN_FALSE;
}

PyObject* api_deviceWrite (PyObject* self, PyObject* args)
{
    const char* id = nullptr; PyObject* value = nullptr; const char* role = nullptr;
    if (! PyArg_ParseTuple (args, "sOs", &id, &value, &role)) return nullptr;
    const bool ok = hostOf (self).deviceWrite (juce::String::fromUTF8 (id),
                                               value != nullptr ? pyToVar (value) : juce::var(),
                                               juce::String::fromUTF8 (role));
    return PyBool_FromLong (ok ? 1 : 0);
}
PyObject* api_run (PyObject* self, PyObject* args)
{
    const char* target = nullptr; PyObject* a = nullptr;
    if (! PyArg_ParseTuple (args, "s|O", &target, &a)) return nullptr;
    return varToPy (hostOf (self).runAction (juce::String::fromUTF8 (target),
                                             (a && a != Py_None) ? pyToVar (a) : juce::var()));
}
PyObject* api_emit (PyObject* self, PyObject* args)
{
    const char* name = nullptr; PyObject* d = nullptr;
    if (! PyArg_ParseTuple (args, "s|O", &name, &d)) return nullptr;
    hostOf (self).emitEvent (juce::String::fromUTF8 (name), (d && d != Py_None) ? pyToVar (d) : juce::var());
    Py_RETURN_NONE;
}
PyObject* api_logAt (PyObject* self, PyObject* args)
{
    const char* kind = nullptr; const char* message = nullptr; PyObject* value = nullptr;
    if (! PyArg_ParseTuple (args, "ss|O", &kind, &message, &value)) return nullptr;
    hostOf (self).logAt (juce::String::fromUTF8 (kind), juce::String::fromUTF8 (message),
                         value != nullptr ? pyToVar (value) : juce::var());
    Py_RETURN_NONE;
}
PyObject* api_log (PyObject* self, PyObject* args)
{
    const char* msg = nullptr; PyObject* v = nullptr;
    if (! PyArg_ParseTuple (args, "s|O", &msg, &v)) return nullptr;
    hostOf (self).log (juce::String::fromUTF8 (msg), (v && v != Py_None) ? pyToVar (v) : juce::var());
    Py_RETURN_NONE;
}
PyObject* api_sendMidi (PyObject* self, PyObject* args)
{
    PyObject* bytes = nullptr;
    if (! PyArg_ParseTuple (args, "O", &bytes)) return nullptr;
    hostOf (self).sendMidi (pyToVar (bytes)); Py_RETURN_NONE;
}
// The store argument is "panel" or "local" — the two places a setting can actually live.
// ce.storage's third scope, "script", is a key prefix on the panel store, resolved in the prelude
// so all four runtimes spell a private key the same way.
PyObject* api_saveSetting (PyObject* self, PyObject* args)
{
    const char* key = nullptr; PyObject* v = nullptr; const char* store = "panel";
    if (! PyArg_ParseTuple (args, "sO|s", &key, &v, &store)) return nullptr;
    hostOf (self).saveSetting (juce::String::fromUTF8 (key), pyToVar (v), juce::String::fromUTF8 (store));
    Py_RETURN_NONE;
}
PyObject* api_listSettings (PyObject* self, PyObject* args)
{
    const char* store = "panel";
    if (! PyArg_ParseTuple (args, "|s", &store)) return nullptr;
    return varToPy (hostOf (self).listSettings (juce::String::fromUTF8 (store)));
}
PyObject* api_forgetSetting (PyObject* self, PyObject* args)
{
    const char* key = nullptr; const char* store = "panel";
    if (! PyArg_ParseTuple (args, "s|s", &key, &store)) return nullptr;
    return PyBool_FromLong (hostOf (self).forgetSetting (juce::String::fromUTF8 (key),
                                                         juce::String::fromUTF8 (store)) ? 1 : 0);
}
PyObject* api_loadSetting (PyObject* self, PyObject* args)
{
    const char* key = nullptr; const char* store = "panel";
    if (! PyArg_ParseTuple (args, "s|s", &key, &store)) return nullptr;
    return varToPy (hostOf (self).loadSetting (juce::String::fromUTF8 (key), juce::String::fromUTF8 (store)));
}
PyObject* api_settingsAvailable (PyObject* self, PyObject* args)
{
    const char* store = "panel";
    if (! PyArg_ParseTuple (args, "|s", &store)) return nullptr;
    return PyBool_FromLong (hostOf (self).settingsAvailable (juce::String::fromUTF8 (store)) ? 1 : 0);
}
PyObject* api_startTimer (PyObject* self, PyObject* args)
{
    const char* id = nullptr; int ms = 0;
    if (! PyArg_ParseTuple (args, "s|i", &id, &ms)) return nullptr;
    hostOf (self).startTimer (juce::String::fromUTF8 (id), ms); Py_RETURN_NONE;
}
PyObject* api_stopTimer (PyObject* self, PyObject* args)
{
    const char* id = nullptr; if (! PyArg_ParseTuple (args, "s", &id)) return nullptr;
    hostOf (self).stopTimer (juce::String::fromUTF8 (id)); Py_RETURN_NONE;
}
PyObject* api_beginTransmit (PyObject* self, PyObject* args)
{
    int on = 0; if (! PyArg_ParseTuple (args, "p", &on)) return nullptr;
    hostOf (self).beginTransmitOverride (on != 0); Py_RETURN_NONE;
}
PyObject* api_endTransmit (PyObject* self, PyObject*) { hostOf (self).endTransmitOverride(); Py_RETURN_NONE; }
// routeMidi(role, fn) blocks — the destination for a RUN of sends, the same block shape
// noTransmit() uses rather than a role argument threaded through thirteen signatures.
PyObject* api_beginRoute (PyObject* self, PyObject* args)
{
    const char* role = nullptr; if (! PyArg_ParseTuple (args, "s", &role)) return nullptr;
    hostOf (self).beginRouteOverride (juce::String::fromUTF8 (role)); Py_RETURN_NONE;
}
PyObject* api_endRoute (PyObject* self, PyObject*) { hostOf (self).endRouteOverride(); Py_RETURN_NONE; }
PyObject* api_feedMidi (PyObject* self, PyObject* args)
{
    PyObject* b = nullptr; if (! PyArg_ParseTuple (args, "O", &b)) return nullptr;
    hostOf (self).feedMidi (pyToVar (b)); Py_RETURN_NONE;
}

// on(target, event, fn) — defined after the engine, whose listener registry they write.
PyObject* api_on  (PyObject* self, PyObject* args);
PyObject* api_off (PyObject* self, PyObject* args);

PyMethodDef apiMethods[] = {
    { "set",           api_set,           METH_VARARGS, nullptr },
    { "get",           api_get,           METH_VARARGS, nullptr },
    { "whyNoValue",    api_whyNoValue,    METH_VARARGS, nullptr },
    { "sendCC",        api_sendCC,        METH_VARARGS, nullptr },
    { "sendNRPN",      api_sendNRPN,      METH_VARARGS, nullptr },
    { "sendSysex",     api_sendSysex,     METH_VARARGS, nullptr },
    { "sendMidi",      api_sendMidi,      METH_VARARGS, nullptr },
    { "saveSetting",   api_saveSetting,   METH_VARARGS, nullptr },
    { "loadSetting",   api_loadSetting,   METH_VARARGS, nullptr },
    { "listSettings",  api_listSettings,  METH_VARARGS, nullptr },
    { "forgetSetting", api_forgetSetting, METH_VARARGS, nullptr },
    { "settingsAvailable", api_settingsAvailable, METH_VARARGS, nullptr },
    { "requestDump",   api_requestDump,   METH_VARARGS, nullptr },
    { "applyDump",     api_applyDump,     METH_VARARGS, nullptr },
    { "deviceDefine",  api_deviceDefine,  METH_VARARGS, nullptr },
    { "sendDump",      api_sendDump,      METH_VARARGS, nullptr },
    { "buildDump",     api_buildDump,     METH_VARARGS, nullptr },
    { "deviceQuery",   api_deviceQuery,   METH_VARARGS, nullptr },
    { "panelQuery",    api_panelQuery,    METH_VARARGS, nullptr },
    { "deviceWrite",   api_deviceWrite,   METH_VARARGS, nullptr },
    { "deviceSet",     api_deviceSet,     METH_VARARGS, nullptr },
    { "transportState", api_transportState, METH_NOARGS,  nullptr },
    { "nowMs",         api_nowMs,         METH_NOARGS,  nullptr },
    { "animate",       api_animate,       METH_VARARGS, nullptr },
    { "animateStop",   api_animateStop,   METH_VARARGS, nullptr },
    { "animateRunning", api_animateRunning, METH_VARARGS, nullptr },
    { "animateValue",  api_animateValue,  METH_VARARGS, nullptr },
    { "animateList",   api_animateList,   METH_NOARGS,  nullptr },
    { "animatePause",  api_animatePause,  METH_VARARGS, nullptr },
    { "animateResume", api_animateResume, METH_VARARGS, nullptr },
    { "animateReverse", api_animateReverse, METH_VARARGS, nullptr },
    { "animateFinish", api_animateFinish, METH_VARARGS, nullptr },
    { "startTimer",    api_startTimer,    METH_VARARGS, nullptr },
    { "stopTimer",     api_stopTimer,     METH_VARARGS, nullptr },
    { "run",           api_run,           METH_VARARGS, nullptr },
    { "emit",          api_emit,          METH_VARARGS, nullptr },
    { "log",           api_log,           METH_VARARGS, nullptr },
    { "logAt",         api_logAt,         METH_VARARGS, nullptr },
    { "beginTransmit", api_beginTransmit, METH_VARARGS, nullptr },
    { "beginRoute",    api_beginRoute,    METH_VARARGS, nullptr },
    { "endRoute",      api_endRoute,      METH_NOARGS,  nullptr },
    { "feedMidi",      api_feedMidi,      METH_VARARGS, nullptr },
    { "endTransmit",   api_endTransmit,   METH_NOARGS,  nullptr },
    { "on",            api_on,            METH_VARARGS, nullptr },
    { "off",           api_off,           METH_VARARGS, nullptr },
    { nullptr, nullptr, 0, nullptr }
};

// Not imported: each instance makes its own module from this and puts it in its interpreter's
// sys.modules before any script runs, so the state each one carries is that instance's.
PyModuleDef apiModuleDef = {
    PyModuleDef_HEAD_INIT, "ceditor", "CEditor panel host bridge", (Py_ssize_t) sizeof (BridgeOwner),
    apiMethods, nullptr, nullptr, nullptr, nullptr
};

// --- Python prelude: globals wrapping `ceditor` + helpers (parity with Lua/JS) -----------------
const char* kPrelude = R"PY(
# @module -
import ceditor as __api
# on()/off() first: the prelude's own sections register listeners at load (onTransport, onTimer), and
# with these defined further down every Python script stopped at load with "name 'on' is not
# defined" from 23 September until it was found.
def on(target, event, fn):        return __api.on(target, event, fn)
def off(target, event):           return __api.off(target, event)

# @module ce.core
# --- the reactive core: watch / compute / intercept / defineAction ---------------------------
# The verbs that do what setting a property cannot: a property is a CONSTANT chosen at design
# time, each of these is a RULE the runtime keeps applying. Held per script namespace, the way
# the JS prelude holds them per engine, so no script tagging is needed.
import json as __json
__watchers = []
__computeds = []
__filters = []
__actions = {}
__depth = {"filter": 0, "reactive": 0}
__MAX_SETTLE = 8

def __sig(v):
    if v is None: return " none"
    try: return __json.dumps(v, sort_keys=True)
    except Exception: return str(v)

def __putRule(lst, rule):
    # A rule REPLACES the same path's rule rather than stacking beside it: two filters on one
    # path would make the result depend on the order they happened to register in.
    for i in range(len(lst)):
        if lst[i]["path"] == rule["path"]:
            lst[i] = rule
            return
    lst.append(rule)

def watch(path, fn):     __putRule(__watchers, {"path": path, "fn": fn, "last": __sig(__read(path)), "prev": None})
def compute(path, fn):   __putRule(__computeds, {"path": path, "fn": fn, "failed": False})
def intercept(path, fn): __putRule(__filters, {"path": path, "fn": fn})

def defineAction(name, fn):
    key = str(name or "").strip()
    if not key or not callable(fn): return
    __actions[key.lower()] = {"name": key, "fn": fn}

def __actionNames(): return [a["name"] for a in __actions.values()]

def __callAction(name, args):
    a = __actions.get(str(name).lower())
    if a is None: return {"found": False}
    try: return {"found": True, "value": a["fn"](args)}
    except Exception as err:
        logError("action " + str(name) + ": " + str(err))
        return {"found": True}

def __applyIntercepts(path, value):
    # Returns {"reject": True} or {"value": ...}.
    if not __filters or __depth["filter"] > 0: return {"value": value}   # no re-entry from a filter's own set()
    __depth["filter"] += 1
    try:
        for f in __filters:
            if f["path"] != path: continue
            try: out = f["fn"](value, value)
            except Exception as err:
                logError("intercept " + str(path) + ": " + str(err))
                continue
            if out is False: return {"reject": True}
            if out is None: continue          # no opinion — keep what we had
            value = out
    finally:
        __depth["filter"] -= 1
    return {"value": value}

def __runReactive():
    # Computes settle first, so a watcher never sees an intermediate value the panel did not hold.
    if not __watchers and not __computeds and not __filters: return
    if __depth["reactive"] > 0: return
    __depth["reactive"] += 1
    try:
        for _p in range(__MAX_SETTLE):
            wrote = False
            for c in __computeds:
                if c["failed"]: continue
                try: nxt = c["fn"]()
                except Exception as err:
                    logError("compute " + str(c["path"]) + ": " + str(err))
                    c["failed"] = True
                    continue
                if nxt is None: continue
                if __sig(nxt) == __sig(__read(c["path"])): continue
                set(c["path"], nxt)
                wrote = True
            if not wrote: break
            if _p == __MAX_SETTLE - 1:
                logError("compute(): still changing after " + str(__MAX_SETTLE) + " passes — two formulas "
                         "are feeding each other. They are left at the last value rather than looped on.")
        # Changes that never came through set() — the user moving a control, inbound MIDI, a dump
        # landing — still obey their filter. Needs an idempotent filter to settle, which snapping,
        # clamping and quantising all are.
        for f in __filters:
            cur = __read(f["path"])
            if cur is None: continue
            d = __applyIntercepts(f["path"], cur)
            if d.get("reject"): continue      # a veto has nothing to revert to
            if __sig(d["value"]) != __sig(cur): set(f["path"], d["value"])
        for w in __watchers:
            v = __read(w["path"])
            s = __sig(v)
            if s == w["last"]: continue
            previous = w["prev"]
            w["last"] = s
            w["prev"] = v
            try: w["fn"](v, previous)
            except Exception as err: logError("watch " + str(w["path"]) + ": " + str(err))
    finally:
        __depth["reactive"] -= 1

# @module -
# set() runs this script's intercept() filters before the host sees the value, so the rule holds
# for every write instead of being re-checked at each call site.
def set(path, value, opts=None):
    d = __applyIntercepts(path, value)
    if d.get("reject"): return None
    return __api.set(path, d["value"], opts)
# A script's own get() says why it has no answer when the control or the path is not there, in the
# editor's words (ScriptHostApi::whyNoValue asks the app). __read is the quiet read the prelude's own
# watch, compute and snapshot use, as the editor's do: a watch on a path that is not there yet would
# otherwise say so on every pass.
def __read(path):                 return __api.get(path, "value")
def __scriptGet(path, form="value"):
    v = __api.get(path, form)
    if v is None:
        why = __api.whyNoValue(path, form)
        if why: logError(why)
    return v
def get(path, form="value"):      return __scriptGet(path, form)
# @module ce.midi
# sendCC and sendNRPN are host bindings; what a script passes is checked here first (__midiArg, in
# the ce.midi section), as the editor checks it, and only numbers that are a message reach the host.
def sendCC(ch=None, cc=None, v=None):
    c = __midiArg("sendCC", "channel", ch)
    if c is None: return
    n = __midiArg("sendCC", "controller", cc)
    if n is None: return
    value = __midiArg("sendCC", "value", v)
    if value is None: return
    __api.sendCC(c, n, value)
def sendNRPN(ch=None, msb=None, lsb=None, v=None):
    c = __midiArg("sendNRPN", "channel", ch)
    if c is None: return
    m = __midiArg("sendNRPN", "msb", msb)
    if m is None: return
    l = __midiArg("sendNRPN", "lsb", lsb)
    if l is None: return
    value = __midiArg("sendNRPN", "value14", v)
    if value is None: return
    __api.sendNRPN(c, m, l, value)
def sendSysex(b):                 return __api.sendSysex(b)
# @module ce.time
# Musical time. One host primitive behind tempo() / isPlaying() / transportInfo(), so the three can
# never disagree; the conversions are pure arithmetic on top. Nothing here starts or stops the
# transport — a panel does not own the DAW's playhead.
def __transport():
    t = __api.transportState()
    if t is None:
        return { "playing": False, "bpm": None, "beats": 0, "beatsPerBar": 4, "source": "none", "valid": False }
    return t

def transportInfo():
    t = __transport()
    bpb = t.get("beatsPerBar") or 4
    if bpb < 1:
        bpb = 4
    beats = t.get("beats") or 0
    import math as __ce_math
    return {
        "playing": t.get("playing") is True, "bpm": t.get("bpm"), "beats": beats,
        "bar": int(__ce_math.floor(beats / bpb)) + 1,
        "beat": int(__ce_math.floor(beats % bpb)) + 1,
        "beatsPerBar": bpb, "source": t.get("source") or "none", "valid": t.get("valid") is True,
    }

def tempo():
    b = __transport().get("bpm")
    return b if b and b > 0 else None

def isPlaying():
    return __transport().get("playing") is True

# A bpm that is not above 0, or not a number, is the transport's tempo, and says so (__tread). It
# gave nothing here, where the WebView used the tempo, and "fast" raised a TypeError.
def beatsToMs(beats, bpm=None):
    b = __tread("beatsToMs", "beats", beats)
    if b is None: return None
    rate = __tread("beatsToMs", "bpm", bpm)
    if rate is None: rate = tempo()
    if not rate or rate <= 0:
        return None
    return b * 60000.0 / rate

def msToBeats(ms, bpm=None):
    m = __tread("msToBeats", "ms", ms)
    if m is None: return None
    rate = __tread("msToBeats", "bpm", bpm)
    if rate is None: rate = tempo()
    if not rate or rate <= 0:
        return None
    return m * rate / 60000.0

# syncTimer(id, beats [, opts]) - a timer whose interval is MUSICAL, and which FOLLOWS the tempo.
# The first version computed the interval once and then kept firing at the old rate forever; a verb
# called sync that silently desyncs is the wrong default. { "follow": False } keeps that behaviour.
# Re-arming RESETS THE PHASE, which is a hiccup at the moment of a tempo change and beats a timer
# that is permanently at the wrong rate.
def syncTimer(id, beats, opts=None):
    key = "" if id is None else str(id)
    if not key:
        logError("ce.time.syncTimer: no id was given, so no timer was started.")
        return
    length = __beatsOf('ce.time.syncTimer("' + key + '")', beats, True, "no timer was started")
    if length is None: return
    ms = beatsToMs(length)
    if ms is None:
        logError('ce.time.syncTimer("' + key + '"): no tempo is being reported, so no timer was started. Use startTimer with a millisecond interval, or wait for onTransport.')
        return
    __armTimer(key, ms)                                   # clears any previous follow...
    follow = True
    if isinstance(opts, dict) and opts.get("follow") is False:
        follow = False
    if follow:
        __syncFollow[key] = length                        # ...and this puts it back on purpose
# Re-time every following sync timer. Armed from the prelude's own onTransport listener, so it
# belongs to no script and survives every reload of them.
def __reArmSyncTimers():
    for key, beats in list(__syncFollow.items()):
        ms = beatsToMs(beats)
        # No tempo any more: leave it running at the last one rather than stopping the music.
        if ms is None: continue
        __armTimer(key, ms)
        __syncFollow[key] = beats
__lastSyncBpm = [None]
def __syncOnTransport(t):
    bpm = t.get("bpm") if hasattr(t, "get") else None
    if bpm == __lastSyncBpm[0]: return
    __lastSyncBpm[0] = bpm
    if bpm is not None: __reArmSyncTimers()
on("*", "onTransport", __syncOnTransport)

# after(ms, fn) — run fn ONCE, ms from now. Built on startTimer rather than on anything new: the
# one-shot is a normal timer that removes itself, so stopTimer(id) cancels it like anything else.
#
# The order inside the tick is why this exists instead of every panel hand-rolling it. The entry is
# removed and the timer stopped BEFORE fn runs, so a callback that throws cannot leave a one-shot
# repeating forever — which is precisely what the hand-rolled version does.
__after = {}
__afterN = [0]
def after(ms, fn):
    if not callable(fn):
        logError("ce.time.after: fn is " + __shownValue(fn) + ", not a function, so nothing was scheduled.")
        return None
    if __timeRefused("ce.time.after", ms, "milliseconds", "delay", False, "nothing was scheduled"): return None
    return __oneShot(ms, fn)
# The one-shot itself, unchecked: sendNote's duration works out its own delay.
def __oneShot(ms, fn):
    __afterN[0] += 1
    _id = "__after:" + str(__afterN[0])
    __after[_id] = fn
    __armTimer(_id, ms)
    return _id
# Registered once, from the prelude, so it belongs to no script and outlives every reload of them.
# A one-shot is NOT a timer the panel declared, so it is swallowed here rather than surfacing as
# onTimer — otherwise every script with an onTimer handler would have to filter ids it never made.
def __afterTick(info):
    _id = info.get("id") if hasattr(info, "get") else None
    if _id is None: return
    fn = __after.pop(_id, None)
    if fn is None: return
    stopTimer(_id)
    fn()
on("*", "onTimer", __afterTick)

# afterBeats(beats, fn) - after() with a MUSICAL delay. startTimer had syncTimer and the one-shot
# had nothing, so "play this in half a bar" meant working the milliseconds out by hand. A one-shot
# fires once, so the delay is computed WHEN YOU CALL IT and does not follow a later tempo change.
def afterBeats(beats, fn):
    if not callable(fn):
        logError("ce.time.afterBeats: fn is " + __shownValue(fn) + ", not a function, so nothing was scheduled.")
        return None
    length = __beatsOf("ce.time.afterBeats", beats, False, "nothing was scheduled")
    if length is None: return None
    ms = beatsToMs(length)
    if ms is None:
        logError("ce.time.afterBeats: no tempo is being reported, so nothing was scheduled. Use after() with milliseconds, or wait for onTransport.")
        return None
    return after(ms, fn)

# The grid, the clock and the transport's own arithmetic. Everything above answers "where is the
# transport NOW" or "how long is a beat"; none of it answered where an ARBITRARY position falls,
# what the grid is, or what the panel's own clock decided. Transliterated from
# utils/transportLayout.js, which the WebView calls directly - including its coercions, because a
# fallback that differs by one is a sequencer a step out.
def __tnum(v, fallback):
    import math as __m
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        try: v = float(v)
        except (TypeError, ValueError): return fallback
    if v != v or v in (float("inf"), float("-inf")): return fallback
    return v
def __tclamp(v, lo, hi):
    n = __tnum(v, lo)
    return lo if n < lo else (hi if n > hi else n)

# A helper's number argument as the transport reads it, with one not used as written said once per
# helper and argument, in the words of the WebView runtime's timeWords.js. A position before the
# start is the start, a bar of no beats is a bar of one, and text that is not a number is the
# argument's default; each gave an answer for a number nobody wrote, without a word. For each
# argument: what is used for one that is not a number, the least and the most it is read as, and
# whether it is rounded first; a bpm falls back to the transport's tempo.
__TIME_NUMBERS = {
    "barBeatAt": ("ce.time.position", { "beats": { "fallback": 0, "min": 0 }, "beatsPerBar": { "fallback": 4, "min": 1, "optional": True } }),
    "stepAt": ("ce.time.step", { "beats": { "fallback": 0, "min": 0 } }),
    "stepsBetween": ("ce.time.steps", { "from": { "fallback": 0, "min": 0 }, "to": { "fallback": 0, "min": 0 }, "max": { "fallback": 16, "min": 1, "round": True, "optional": True } }),
    "swingOffset": ("ce.time.swing", { "step": { "fallback": 0 }, "amount": { "fallback": 0, "min": 0, "max": 1 } }),
    "cycleAt": ("ce.time.cycle", { "beats": { "fallback": 0, "min": 0 }, "bars": { "fallback": 0.25, "min": 0.25, "max": 64 }, "beatsPerBar": { "fallback": 4, "min": 1, "optional": True } }),
    "loopedBeats": ("ce.time.looped", { "beats": { "fallback": 0, "min": 0 }, "startBeats": { "fallback": 0, "min": 0 }, "lengthBeats": { "fallback": 0.01, "min": 0.01 } }),
    "beatsToMs": ("ce.time.beatsToMs", { "beats": { "fallback": 0 }, "bpm": { "tempo": True } }),
    "msToBeats": ("ce.time.msToBeats", { "ms": { "fallback": 0 }, "bpm": { "tempo": True } }),
}
# A dict, not a set: the prelude's own set(path, value) is the name `set` here.
__timeWarned = {}
def __tread(fn, name, v):
    import math
    verb, args = __TIME_NUMBERS[fn]
    s = args[name]
    if v is None:
        # An argument the helper cannot do without, left out, is rejected: it was the default
        # without a word (position() was bar 1).
        if s.get("tempo") or s.get("optional"):
            return None if s.get("tempo") else s["fallback"]
        logError(verb + ": " + name + " was not given, so there is no answer.")
        return None
    read = __realNumber(v)
    n = None
    if s.get("tempo"):
        if read is not None and read > 0: return read
        why = "not a number" if read is None else "not above 0"
        used = "the transport's tempo"
    elif read is None:
        why = "not a number"; n = s["fallback"]; used = __shown(n)
    else:
        n = math.floor(read + 0.5) if s.get("round") else read
        if "min" in s and n < s["min"]:
            why = "less than " + __shown(s["min"]); n = s["min"]; used = __shown(n)
        elif "max" in s and n > s["max"]:
            why = "more than " + __shown(s["max"]); n = s["max"]; used = __shown(n)
        else:
            return n
    key = fn + " " + name
    if key not in __timeWarned:
        __timeWarned[key] = True
        logWarn(verb + ": " + name + " is " + __shownValue(v) + ", which is " + why + ", so " + used
                + " was used. This is said only the first time.")
    return n

# A monotonic millisecond reading. NOT a wall clock and NOT a date: the origin is arbitrary and only
# DIFFERENCES mean anything, so a machine syncing its clock cannot corrupt an interval.
def nowMs():
    return __api.nowMs()

# The panel's division vocabulary, in both directions. An unknown name returns None rather than the
# component's 1/16 fallback: a component has to keep running, a script that mistyped should find out.
# It found out only by getting None, so __division says so as well, in the words of the WebView
# runtime's divisionId. Any case is read: "1/8t" is "1/8T", because the names differ only by D and T
# and nothing is ambiguous.
def __division(verb, name):
    if isinstance(name, str):
        wanted = name.lower()
        for i in __CE_DIVISION_NAMES:
            if i.lower() == wanted: return __CE_DIVISIONS[i]
    logError(verb + ": " + ("no division given" if name is None else __shownValue(name) + " is not a division")
             + ", so there is no answer. The divisions are " + ", ".join(__CE_DIVISION_NAMES) + ".")
    return None
def beatsPerDivision(name=None):
    return __division("ce.time.division", name)
def divisionNames():
    return [{ "id": i, "label": __CE_DIVISION_LABELS.get(i), "beats": __CE_DIVISIONS.get(i) }
            for i in __CE_DIVISION_NAMES]

# Where a beat position falls musically - for ANY position, not only the transport's. Bars and beats
# count from 1 as musicians do; `text` is the Transport component's own readout.
def barBeatAt(beats, beatsPerBar=None):
    import math
    b = __tread("barBeatAt", "beats", beats)
    if b is None: return None
    perBar = __tread("barBeatAt", "beatsPerBar", beatsPerBar)
    bar = math.floor(b / perBar) + 1
    beat = math.floor(b % perBar) + 1
    tick = math.floor((b % 1) * __CE_TIME["ppqn"])
    return { "bar": bar, "beat": beat, "tick": tick,
             "text": str(bar) + "." + str(beat) + "." + str(tick).rjust(2, "0") }

def stepAt(beats=None, division=None):
    import math
    per = __division("ce.time.step", division)
    if per is None: return None
    b = __tread("stepAt", "beats", beats)
    return None if b is None else math.floor(b / per)

# The step boundaries crossed between two readings. A stalled frame must FIRE the steps it slept
# through rather than drop them - the difference between a stutter and a hole in the bar. Capped so
# returning from a long stall does not dump hundreds of notes, and what was dropped is REPORTED. On
# an overrun the most RECENT steps are kept: catching up to now beats replaying where you were.
def stepsBetween(fromBeats=None, toBeats=None, division=None, maxSteps=None):
    import math
    per = __division("ce.time.steps", division)
    if per is None: return None
    frm = __tread("stepsBetween", "from", fromBeats)
    if frm is None: return None
    to = __tread("stepsBetween", "to", toBeats)
    if to is None: return None
    cap = __tread("stepsBetween", "max", maxSteps)
    if to <= frm: return { "steps": [], "dropped": 0 }
    first = math.floor(frm / per) + 1
    last = math.floor(to / per)
    if last < first: return { "steps": [], "dropped": 0 }
    total = last - first + 1
    kept = total if total < cap else cap
    return { "steps": list(range(last - kept + 1, last + 1)), "dropped": total - kept }

# The panel's shuffle: every odd step later by up to half a step, in BEATS. Two sequencers at "the
# same" swing are only the same swing if they compute it the same way.
def swingOffset(step=None, amount=None, division=None):
    import math
    per = __division("ce.time.swing", division)
    if per is None: return None
    n = __tread("swingOffset", "step", step)
    if n is None: return None
    s = __tread("swingOffset", "amount", amount)
    if s is None: return None
    idx = math.floor(n + 0.5)
    return s * 0.5 * per if abs(idx) % 2 == 1 else 0

# For anything whose rate is a LOOP LENGTH in bars rather than a step. Derived from the position,
# never accumulated, so a cycle running for an hour is still exactly on the bar line.
def cycleAt(beats, bars, beatsPerBar=None):
    import math
    b = __tread("cycleAt", "beats", beats)
    if b is None: return None
    n = __tread("cycleAt", "bars", bars)
    if n is None: return None
    length = n * __tread("cycleAt", "beatsPerBar", beatsPerBar)
    if length < 0.01: length = 0.01
    return { "phase": ((b / length) % 1 + 1) % 1, "count": math.floor(b / length), "length": length }

# Fold a timeline position into a loop. Before the loop start the position is untouched - you can
# run IN to a loop from earlier in the song. `pass` is which time round, -1 before the loop is
# reached; watching it for CHANGES is how you see a wrap without a handler that can miss one.
def loopedBeats(beats, startBeats, lengthBeats):
    import math
    b = __tread("loopedBeats", "beats", beats)
    if b is None: return None
    st = __tread("loopedBeats", "startBeats", startBeats)
    if st is None: return None
    length = __tread("loopedBeats", "lengthBeats", lengthBeats)
    if length is None: return None
    if b < st: return { "beats": b, "pass": -1 }
    return { "beats": st + ((b - st) % length), "pass": math.floor((b - st) / length) }

# Tempo from tap times, in the milliseconds now() reports. Taps more than resetMs apart start a NEW
# measurement rather than averaging across the pause - the thing every hand-rolled tap gets wrong,
# because the first tap after a break poisons the average.
# The times, and clockTempo's gaps, are the numbers above 0 in a list, with one that is not said
# once; a list that is not one, or left out, is refused. Each was done in silence, and a list that
# was not one gave no result as if the taps were too few.
def __timeList(verb, name, what, value):
    if value is None:
        logError(verb + ": " + name + " was not given, so there is no answer.")
        return None
    if isinstance(value, dict):
        value = list(value.values())
    if isinstance(value, (str, bytes)) or not isinstance(value, (list, tuple)):
        logError(verb + ": " + name + " is " + __shownValue(value) + ", not a list, so there is no answer.")
        return None
    out = []
    for i, item in enumerate(value):
        n = __realNumber(item)
        if n is not None and n > 0:
            out.append(n)
            continue
        key = verb + " " + name
        if key not in __timeWarned:
            __timeWarned[key] = True
            logWarn(verb + ": " + __shownValue(item) + " at position " + str(i + 1) + " of " + name + " is not " + what
                    + " above 0, so it was left out. This is said only the first time.")
    return out
def tapTempo(timestamps=None, resetMs=None):
    lst = __timeList("ce.time.tap", "times", "a tap time in milliseconds", timestamps)
    if lst is None: return None
    # A pause that is not a number above 0 gave nothing (every gap was "after a pause") or 2000, in
    # silence; it is 2000, said once.
    reset = __realNumber(resetMs)
    if resetMs is not None and not (reset is not None and reset > 0) and "tapTempo resetMs" not in __timeWarned:
        __timeWarned["tapTempo resetMs"] = True
        logWarn("ce.time.tap: resetMs is " + __shownValue(resetMs) + ", which is " + ("not a number" if reset is None else "not above 0")
                + ", so 2000 was used. This is said only the first time.")
    if len(lst) < 2: return None
    limit = reset if (reset is not None and reset > 0) else 2000
    total = 0.0
    count = 0
    for i in range(len(lst) - 1, 0, -1):
        gap = lst[i] - lst[i - 1]
        if gap <= 0 or gap > limit: break
        total += gap
        count += 1
    if count == 0: return None
    return __tclamp(60000 / (total / count), __CE_TIME["minBpm"], __CE_TIME["maxBpm"])

# Tempo from the gaps between incoming MIDI clock pulses (24 per quarter note). The MEDIAN, not the
# mean: one late pulse from a USB hiccup drags an average around, and a wobbling readout is worse
# than a slightly stale one.
def clockTempo(intervalsMs=None):
    lst = __timeList("ce.time.clockTempo", "intervalsMs", "a gap in milliseconds", intervalsMs)
    if lst is None or not lst: return None
    lst = sorted(lst)
    mid = len(lst) // 2
    median = lst[mid] if len(lst) % 2 else (lst[mid - 1] + lst[mid]) / 2
    if median <= 0: return None
    return __tclamp(60000 / (median * __CE_TIME["ppqn"]), __CE_TIME["minBpm"], __CE_TIME["maxBpm"])

# @module ce.anim
# Values that move over time. The engine lives in the host so ONE list exists and the position is a
# pure function of elapsed time — an incremental integrator per runtime would drift.
#
# `done` is a FUNCTION the script owns, so the host cannot call it: the engine emits __animDone and
# this routes it to the function stored here. Exactly how after()'s one-shot works, and the reason
# a completion callback can be a plain argument in every language.
#
# Each move with a done gets a token of its own ("py:<script id>:3"), handed to the host as `__done`
# and emitted back with the result, and its function is stored under that. It was stored under the
# path, or for a list under a number the host counted separately, so replacing a move called the new
# move's done for the old one, and two lists from two scripts or engines crossed their dones
# (ScriptRuntime::fireAnimationDone says how). This prelude runs in each script's own namespace, so
# the count is the script's and the token carries the script's id.
__animDone = {}
__animSeq = [0]

# An envelope's shape is SAMPLED here, with mapCurve() - ce.math.map, the Envelope component's
# own envValueAt - and the host interpolates the samples. That is what lets the host engine run
# an envelope at all: mapCurve()'s per-point curves live in this prelude, not in C++. This called
# map(), which no prelude defines, so Lua and JavaScript stopped with an error and Python's own
# map() made every sample 0.
__ANIM_SAMPLES = 1024
def __animSample(points):
    out = []
    for i in range(__ANIM_SAMPLES + 1):
        try: y = float(mapCurve(i / __ANIM_SAMPLES, points))
        except (TypeError, ValueError): y = 0.0
        out.append(y)
    return out

def __animPaths(path):
    if isinstance(path, (list, tuple)):
        return [str(p) for p in path if str(p)]
    return None

def __animStart(kind, path, target, opts):
    opts = opts or {}
    lst = __animPaths(path)
    o = dict(opts)
    o.pop("done", None)
    fn = opts.get("done") if isinstance(opts, dict) else None
    if callable(fn):
        __animSeq[0] += 1
        token = "py:" + str(globals().get("__scriptId", "")) + ":" + str(__animSeq[0])
        __animDone[token] = fn
        o["__done"] = token
    elif fn is not None:
        # Not a function: the host says so, once, and the move goes ahead.
        o["__badDone"] = fn if isinstance(fn, (bool, int, float, str)) else str(fn)
    # The host answers whether the move started: not when a colour property is the path or one of a
    # list's paths, and then nothing in the list starts and its done is never called, so it is let go.
    # A missing path is passed as empty, which the host says is no path, not as the text "None".
    started = __api.animate(kind, lst if lst is not None else ("" if path is None else str(path)), float(target or 0), o) is True
    if not started and "__done" in o: __animDone.pop(o["__done"], None)
    return started

# to and spring move to a number, and only a number. A target that is not one ("full", "100px",
# "#FF0000") used to raise ValueError here, and moved the value to 0 everywhere else; text that is
# a number ("100") is read as one, as it always was. In the words of the WebView runtime's
# animationTarget.
def __animTarget(verb, target):
    n = __realNumber(target)
    if n is not None: return n
    if target is None: why = "no number to move to was given"
    elif isinstance(target, str): why = '"' + target + '" is not a number'
    else: why = "the target given is not a number"
    logError(verb + ": " + why + ", so nothing was started.")
    return None

def animateTo(path, target, opts=None):
    n = __animTarget("ce.anim.to", target)
    return False if n is None else __animStart("to", path, n, opts)

def animateSpring(path, target, opts=None):
    n = __animTarget("ce.anim.spring", target)
    return False if n is None else __animStart("spring", path, n, opts)

# envelope(path, points, opts) - drive a value THROUGH a shape rather than between two numbers.
# `to` has one destination; an envelope goes up before it comes down, which is the single most
# obvious thing a synth panel animates and the one thing `to` cannot express.
#
# A point is { "x": , "y": } or the two as a pair, each a number or text that is one. One that is
# not, or whose x is not from 0 to 1, starts nothing and says why, in the words of the WebView
# runtime's envelopeRefusal (CE/web/src/CE_Application/scripting/animEnvelope.js): the sampler
# dropped a point it could not read, and never reached one whose x is past 0 to 1, both without a
# word. A y past 0 to 1 is a level past `from` or `to`, and is read as it is.
def animateEnvelope(path, points, opts=None):
    if not isinstance(points, (list, tuple)) or len(points) < 2:
        logError("ce.anim.envelope(path, points): needs at least two points, each { x, y } in 0..1 — nothing was started.")
        return False
    def written(v):
        if v is None: return "none was given"
        if isinstance(v, str): return '"' + v + '" is not'
        if isinstance(v, (int, float)) and __realNumber(v) is not None: return __cshown(v) + " is not"
        return "the value given is not"
    count = len(points)
    for i, p in enumerate(points):
        which = "point " + str(i + 1) + " of " + str(count)
        parts = __pointParts(p)
        if parts is not None:
            x, y = parts[0], parts[1]
        else:
            logError("ce.anim.envelope: " + which + " is { x, y } or the two as a pair, and " + written(p) + ", so nothing was started.")
            return False
        nx = __realNumber(x)
        if nx is None or nx < 0 or nx > 1:
            hint = ""
            if nx is not None and 0 <= nx / 100 <= 1:
                hint = " If you meant " + __cshown(nx) + " out of 100, write " + __cfour(nx / 100) + "."
            logError("ce.anim.envelope: the x of " + which + " is a number from 0 to 1, and " + written(x) + ", so nothing was started." + hint)
            return False
        if __realNumber(y) is None:
            logError("ce.anim.envelope: the y of " + which + " is a number, and " + written(y) + ", so nothing was started.")
            return False
    o = dict(opts or {})
    o["samples"] = __animSample(points)
    # from and to: a number, or text that is one, or the default, which the host says (__badFrom,
    # __badTo). float() raised on "abc" and read True as 1.
    raw = o.get("from")
    frm = __realNumber(raw)
    if raw is not None and frm is None: o["__badFrom"] = raw if isinstance(raw, (bool, int, float, str)) else str(raw)
    o["from"] = 0.0 if frm is None else float(frm)
    raw = o.pop("to", None)
    to = __realNumber(raw)
    if raw is not None and to is None: o["__badTo"] = raw if isinstance(raw, (bool, int, float, str)) else str(raw)
    return __animStart("envelope", path, 1.0 if to is None else float(to), o)

def animateStop(path=None):
    __api.animateStop("" if path is None else str(path))

def animateRunning(path=None):
    return __api.animateRunning("" if path is None else str(path))

def animateValue(path=None):
    return __api.animateValue("" if path is None else str(path))

def animateList():
    return __api.animateList()

def animatePause(path=None):
    return __api.animatePause("" if path is None else str(path))

def animateResume(path=None):
    return __api.animateResume("" if path is None else str(path))

def animateReverse(path=None):
    return __api.animateReverse("" if path is None else str(path))

def animateFinish(path=None):
    return __api.animateFinish("" if path is None else str(path))

# Registered once, from the prelude, so it belongs to no script and outlives every reload of them.
# done(completed): one argument, True or False, for one path and for a list alike. It was handed a
# dict, { "path", "completed" } or { "paths", "completed" }, and a dict that is not empty is always
# true, so `if completed:` read a cancelled move as a finished one.
def __animDoneTick(info):
    if not hasattr(info, "get"): return
    fn = __animDone.pop(info.get("token"), None)
    if fn is not None: fn(info.get("completed") is True)
on("*", "__animDone", __animDoneTick)

# @module ce.device
# requestDump is assembled further down, over __api.requestDump: it takes an optional callback,
# which is a language value the host has no per-engine way to call back.
def applyDump(b):                 return __api.applyDump(b)
def sendDump(kind):               return __api.sendDump(kind)
def buildDump(kind):              return __api.buildDump(kind)
# @module ce.time
# The prelude tracks which timers exist (runningTimers) and which follow the tempo (syncTimer), so
# these are more than a pass-through to the host. int(x + 0.5), NOT round(x): the prelude defines a
# global round (ce.math) which shadows the builtin for this whole namespace.
__timerIds = {}
__syncFollow = {}
# An interval or a delay a script got wrong is refused, in the WebView runtime's words (timeRefused
# there). A repeating interval is a number above 0; a one-shot's delay a number from 0, where 0 is
# "as soon as the handler has returned". Text is refused, "250" included, and so are True and
# False, which Python would otherwise count as 1 and 0. Returns True when it refused.
def __timeRefused(call, value, unit, what, positive, outcome):
    import math as __m
    why = None
    if value is None: why = "no " + what + " was given"
    elif isinstance(value, str): why = '"' + value + '" is not a number of ' + unit
    elif isinstance(value, bool) or not isinstance(value, (int, float)): why = "the " + what + " is not a number of " + unit
    elif isinstance(value, float) and (__m.isnan(value) or __m.isinf(value)):
        why = "the " + what + " is not a finite number of " + unit
    elif positive and value <= 0: why = __shown(value) + " is not more than 0 " + unit
    elif not positive and value < 0: why = __shown(value) + " is less than 0 " + unit
    if why is None: return False
    logError(call + ": " + why + ", so " + outcome + ".")
    return True
# A number of beats, or a division's name ("1/16" is a quarter of a beat), any case. None when
# refused. The WebView runtime's beatsOf.
def __beatsOf(call, value, positive, outcome):
    if isinstance(value, str):
        wanted = value.lower()
        for name in __CE_DIVISION_NAMES:
            if name.lower() == wanted: return __CE_DIVISIONS[name]
        logError(call + ': "' + value + '" is neither a number of beats nor a division, so ' + outcome
                 + ". The divisions are " + ", ".join(__CE_DIVISION_NAMES) + ".")
        return None
    return None if __timeRefused(call, value, "beats", "number of beats", positive, outcome) else value
# Start or re-time a timer whose interval the caller checked or worked out itself.
def __armTimer(key, ms):
    # An explicit millisecond interval REPLACES a musical one: this is a script asking for
    # milliseconds, not beats.
    __syncFollow.pop(key, None)
    __timerIds[key] = True
    return __api.startTimer(key, int((ms or 0) + 0.5))
def startTimer(id=None, ms=None):
    key = "" if id is None else str(id)
    if not key:
        logError("ce.time.startTimer: no id was given, so no timer was started.")
        return None
    if __timeRefused('ce.time.startTimer("' + key + '")', ms, "milliseconds", "interval", True, "no timer was started"):
        return None
    return __armTimer(key, ms)
def stopTimer(id=None):
    key = "" if id is None else str(id)
    if not key:
        logError("ce.time.stopTimer: no id was given, so nothing was stopped.")
        return None
    __syncFollow.pop(key, None)
    __timerIds.pop(key, None)
    return __api.stopTimer(key)
# The ids a script started BY NAME. One-shots are left out, all of them: after() hands back its id
# already, and the note-off sendNote schedules is not a script's to cancel.
def runningTimers():
    return sorted([k for k in __timerIds if not k.startswith("__after:")])
# @module -
def run(target, args=None):       return __api.run(target, args)
def emit(name, data=None):        return __api.emit(name, data)
def log(msg, v=None):             return __api.log(str(msg), v)

def noTransmit(fn):
    __api.beginTransmit(False)
    try: fn()
    finally: __api.endTransmit()

def transmit(fn):
    __api.beginTransmit(True)
    try: fn()
    finally: __api.endTransmit()

# `self` — owner-relative set/get (Q7). __owner is injected per-script before this prelude runs.
# The methods call out through _ce-named functions because a name that starts with two underscores
# is MANGLED inside a class body: `__api` written in a method is looked up as `_Self__api`, so
# self.set and self.get raised NameError on every call until this.
def _ceSelfSet(p, value, opts): return __api.set(p, value, opts)
def _ceSelfGet(p, form):         return __scriptGet(p, form)
class _Self:
    def _p(self, p):
        o = globals().get("__owner", "")
        return p if not o else (o + "." + p)
    def set(self, p, value, opts=None): return _ceSelfSet(self._p(p), value, opts)
    def get(self, p, form="value"):     return _ceSelfGet(self._p(p), form)
self = _Self()

# @module ce.math
# Pure-math + MIDI helpers — keep in sync with the Lua/JS preludes + panelApi.js.
def clamp(v, lo, hi): return lo if v < lo else (hi if v > hi else v)
__builtin_round = round  # capture the builtin before shadowing it below
def round(v, ndigits=None):
    # 1-arg form: half-up to an int (matches the Lua/JS prelude `round`). 2-arg form: delegate to
    # Python's builtin so ported code calling round(x, 2) still works instead of raising TypeError.
    if ndigits is not None:
        return __builtin_round(v, ndigits)
    import math
    return math.floor(v + 0.5)
def scale(v, inLo, inHi, outLo, outHi):
    return outLo if inHi == inLo else outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo)
def snap(v=None, step=None):
    n = __mnum("ce.math.snap", "the value", v)
    if n is None: return None
    s = __mnum("ce.math.snap", "the step", step)
    if s is None: return None
    return n if s == 0 else round(n / s) * s
def lerp(a=None, b=None, t=None):
    x = __mnum("ce.math.lerp", "a", a)
    if x is None: return None
    y = __mnum("ce.math.lerp", "b", b)
    if y is None: return None
    f = __mnum("ce.math.lerp", "t", t)
    if f is None: return None
    return x + (y - x) * f
def curve(v, shape="linear"):
    import math
    if shape == "exp": return v * v
    if shape == "log": return math.sqrt(max(0, v))
    if shape == "s":   return v * v * (3 - 2 * v)
    # A shape the list does not have used to return v in SILENCE, which reads as a curve that does
    # nothing rather than as a name that was never applied.
    if shape not in ("linear", "", None):
        log("curve(v, \"" + str(shape) + "\"): unknown shape — using linear. The names are "
            "\"linear\", \"exp\", \"log\" and \"s\"; for any other shape use map(v, points).")
    return v

# wrap(v, lo, hi) — bring a value round into a HALF-OPEN range, so wrap(12, 0, 12) is 0.
#
# This exists because the five runtimes disagree about `%`. (-1) % 12 is 11 here and in Lua, and -1
# in JavaScript, C++, C# and Java — so the ordinary way to write a pitch class already gives two
# different answers depending on which engine the panel is running in. The floored form below is
# written identically in every prelude, which is the only thing that stops that being true.
def wrap(v, lo, hi):
    a, b, n = float(lo or 0), float(hi or 0), float(v or 0)
    span = b - a
    # An empty or inverted range has exactly one answer.
    if not span > 0:
        return a
    return a + (((n - a) % span) + span) % span

# A point's (x, y, curve, tension) as written, or None when it is no point: a pair is a list or a
# tuple of them in that order; a mapping is read by its names, and failing those by its numbered
# entries, counted from 0 when it has an entry 0 and from 1 when it does not. The WebView runtime
# reads a point the same way (animEnvelope.js envelopePointParts), so it is one point in both.
def __pointParts(p):
    if isinstance(p, (list, tuple)):
        return tuple(p[i] if len(p) > i else None for i in range(4))
    if hasattr(p, "get"):
        try:
            start = 0 if 0 in p else 1
        except TypeError:
            start = 1
        def named(key, at):
            v = p.get(key)
            return p.get(start + at) if v is None else v
        return (named("x", 0), named("y", 1), named("curve", 2), named("tension", 3))
    return None

# [[x, y, curve, tension], …] sorted by x. Accepts pairs and { "x": , "y": } mappings, so a panel
# can write either; a point's curve shapes the segment that ends at it (mapCurve).
def __points(points):
    out = []
    for p in (points or []):
        parts = __pointParts(p)
        if parts is None:
            continue
        try:
            x, y = float(parts[0]), float(parts[1])
        except (TypeError, ValueError):
            continue
        out.append((x, y, parts[2], parts[3]))
    out.sort(key=lambda p: p[0])
    return out

# map(v, points) — straight lines through breakpoints: a response curve of the panel's own shape,
# which is what curve()'s closed set of four names cannot express. Outside the outermost points the
# value is HELD rather than extrapolated, because a curve drawn between 0 and 1 that runs away past
# 1 is never what the author drew.
def mapCurve(v, points):
    lst = __points(points)
    if not lst:
        return float(v or 0)
    try:
        n = float(v)
    except (TypeError, ValueError):
        return lst[0][1]
    # An exact hit on a breakpoint takes the LAST point with that x. That is what makes two points
    # sharing an x a STEP rather than a divide by zero, and it settles which side of the step the
    # breakpoint itself belongs to — the value it steps TO.
    for i in range(len(lst) - 1, -1, -1):
        if lst[i][0] == n:
            return lst[i][1]
    if n < lst[0][0]:
        return lst[0][1]
    if n > lst[-1][0]:
        return lst[-1][1]
    for i in range(1, len(lst)):
        x0, y0 = lst[i - 1][0], lst[i - 1][1]
        x1, y1 = lst[i][0], lst[i][1]
        if n < x1 and x1 != x0:
            # The segment's own shape, from the point it ends at, as the WebView runtime's mapCurve
            # and the Envelope component take it. Read for straight lines alone, a point's curve
            # played as a line here and as a curve in the editor.
            if lst[i][2] is not None:
                return y0 + shapeCurve((n - x0) / (x1 - x0), lst[i][2], lst[i][3]) * (y1 - y0)
            return y0 + (n - x0) * (y1 - y0) / (x1 - x0)
    return lst[-1][1]

def __numbers(values):
    out = []
    for x in (values or []):
        try:
            out.append(float(x))
        except (TypeError, ValueError):
            pass
    return out

# quantizeTo(v, values) — nearest entry in a LIST rather than a regular step. A tie goes to the
# LOWER value, so the answer never depends on how the two distances happened to round.
def quantizeTo(v, values):
    lst = __numbers(values)
    if not lst:
        return float(v or 0)
    try:
        n = float(v)
    except (TypeError, ValueError):
        return lst[0]
    best, bestD = lst[0], abs(n - lst[0])
    for c in lst:
        d = abs(n - c)
        if d < bestD or (d == bestD and c < best):
            best, bestD = c, d
    return best

# dbToGain / gainToDb. Neither Lua nor JavaScript has them, and a level control that reads in dB and
# sends a linear value needs them on every move. A gain of zero or less is the 24-bit noise floor
# rather than negative infinity, which is a number nothing here can put on a label.
__MIN_DB = -144
def dbToGain(db):
    return 10.0 ** (float(db or 0) / 20.0)
def gainToDb(gain):
    import math
    g = float(gain or 0)
    if g <= 0:
        return __MIN_DB
    db = 20.0 * math.log10(g)
    return __MIN_DB if db < __MIN_DB else db

# The rest of the arithmetic a synth panel actually does. Nothing here duplicates the language's
# own scalar maths (min/max/abs/floor all exist); what IS here is domain-specific, list-shaped, or
# has to be identical in five runtimes to be worth anything.
def __num(v, fallback=0.0):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return fallback
    return x if x == x and x not in (float('inf'), float('-inf')) else fallback

# norm/denorm CLAMP. scale(v, lo, hi, 0, 1) is the hand-rolled version and does not, so a value
# past the end came out past 1 and stayed wrong all the way down the chain.
def norm(v, lo, hi):
    a, b = __num(lo), __num(hi)
    if a == b:
        return 0.0
    t = (__num(v) - a) / (b - a)
    return 0.0 if t < 0 else (1.0 if t > 1 else t)

def denorm(t, lo, hi):
    a, b, x = __num(lo), __num(hi), __num(t)
    x = 0.0 if x < 0 else (1.0 if x > 1 else x)
    return a + x * (b - a)

def bipolar(t): return __num(t) * 2 - 1
def unipolar(v): return (__num(v) + 1) / 2

# fold comes back OFF the end instead of round it. wrap() jumps top to bottom, which is right for a
# pitch class and wrong for a modulation depth — a fold reflects, so movement stays continuous.
def fold(v, lo, hi):
    a, b = __num(lo), __num(hi)
    span = b - a
    if not span > 0:
        return a
    t = abs(__num(v) - a) % (span * 2)
    return a + (span * 2 - t if t > span else t)

# 0..1 to one of `count`, zero-based. The hand-rolled floor(t * count) returns `count` itself at
# exactly 1.0 — one past the end of the list it addresses, and only when a knob is fully up.
def indexOfRange(t, count):
    import math
    n = math.floor(__num(count))
    if n <= 0:
        return 0
    i = math.floor(norm(t, 0, 1) * n)
    return n - 1 if i >= n else i

# The Crossfader component's three laws, which a script could not compute. equalPower is the one
# that matters: a linear fade between two sounds dips in the middle, audibly.
def crossfade(a, b, t, law=None):
    import math
    x, frm, to = norm(t, 0, 1), __num(a), __num(b)
    law = str(law if law is not None else "linear").lower()
    if law == "equalpower":
        angle = x * math.pi / 2
        return frm * math.cos(angle) + to * math.sin(angle)
    if law == "sharp":
        g = x * x * (3 - 2 * x)
        return frm * (1 - g) + to * g
    return frm + (to - frm) * x

# A rate limit with no state of its own, so it works from any handler without a timer. ce.anim owns
# motion the RUNTIME drives; this is the one a script drives itself, per incoming message.
def approach(current, target, maxStep):
    frm, to, step = __num(current), __num(target), abs(__num(maxStep))
    if not step > 0:
        return to
    delta = to - frm
    if abs(delta) <= step:
        return to
    return frm + (step if delta > 0 else -step)

def roundTo(v, decimals):
    import math
    d = math.floor(__num(decimals))
    f = 10.0 ** (0 if d < 0 else d)
    return round(__num(v) * f) / f

def almost(a, b, epsilon=None):
    tol = abs(__num(epsilon, 1e-9)) or 1e-9
    return abs(__num(a) - __num(b)) <= tol

def __nums(values):
    out = []
    for x in (values or []):
        try:
            out.append(float(x))
        except (TypeError, ValueError):
            pass
    return out

def minOf(values):
    l = __nums(values)
    return min(l) if l else None

def maxOf(values):
    l = __nums(values)
    return max(l) if l else None

def sumOf(values):
    return sum(__nums(values))

def meanOf(values):
    l = __nums(values)
    return sum(l) / len(l) if l else None

# Morph one list into another, which is what a snapshot morph IS. The SHORTER list decides the
# length: padding with zeros would drag the missing entries to nothing, and on a patch that is a
# set of parameters slammed to their minimum.
def blend(a, b, t):
    frm, to, x = __nums(a), __nums(b), __num(t)
    return [frm[i] + (to[i] - frm[i]) * x for i in range(min(len(frm), len(to)))]

# Every random below draws a FIXED number of times, so a seed replays the sequence whichever of
# them a panel used.
def randomFloat(lo=None, hi=None):
    # One number alone is the top of a range from 0, not the bottom of one up to 1.
    if hi is None: a, b = 0.0, __num(lo, 1)
    else: a, b = __num(lo), __num(hi)
    return a + random() * (b - a)

# A bell rather than a slab: humanising velocity with a uniform random is what sounds mechanical.
# Box-Muller, always two draws — it deliberately does NOT cache the second value the way the
# textbook version does, because a varying draw count would break seed replay.
def randomGaussian(mean=0, sd=1):
    import math
    u1 = random()
    if u1 < 1e-12:
        u1 = 1e-12
    u2 = random()
    z = math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
    return __num(mean) + z * __num(sd, 1)

# Folded rather than clamped: a walk that clamps sticks to the end it hit and stops moving.
def randomWalk(current, step, lo=None, hi=None):
    nextValue = __num(current) + (random() * 2 - 1) * abs(__num(step))
    if lo is None or hi is None:
        return nextValue
    return fold(nextValue, __num(lo), __num(hi))

def randomBool(chance=0.5):
    return random() < __num(chance, 0.5)

def shuffle(values):
    import math
    out = list(values or [])
    for i in range(len(out) - 1, 0, -1):
        j = math.floor(random() * (i + 1))
        out[i], out[j] = out[j], out[i]
    return out

# Geometry, in ce.draw's convention: DEGREES, 0 at twelve o'clock, clockwise. Rebuilding that from
# atan2 by hand is where a knob pointer ends up running backwards or a quadrant out.
def toDegrees(radians):
    import math
    return __num(radians) * 180 / math.pi

def toRadians(degrees):
    import math
    return __num(degrees) * math.pi / 180

def distance(x1, y1, x2, y2):
    import math
    dx, dy = __num(x2) - __num(x1), __num(y2) - __num(y1)
    return math.sqrt(dx * dx + dy * dy)

def angleOf(x1, y1, x2, y2):
    import math
    dx, dy = __num(x2) - __num(x1), __num(y2) - __num(y1)
    # The same point twice has no direction: 0, in every runtime.
    if dx == 0 and dy == 0: return 0
    a = toDegrees(math.atan2(dx, -dy))
    return a + 360 if a < 0 else a

def polar(angle, radius):
    import math
    a, r = toRadians(__num(angle)), __num(radius)
    return { "x": math.sin(a) * r, "y": -math.cos(a) * r }
# The transforms the Properties panel itself applies, matched exactly rather than approximated.
# shape() is NOT curve(): curve() is the older family (exp = v*v, log = sqrt v, s-curve spelled
# "s"), while the panel spells it "scurve", has a "hold", and computes exp/log from a tension
# exponent whose default is 1.6 rather than 0. Odd in the app, and matched here on purpose.
def shapeCurve(v, curve, tension=None):
    t = norm(v, 0, 1)
    ten = __num(tension, 0) or 1.6
    k = 1 + max(0, ten)
    name = str(curve)
    if name == "exp": return t ** k
    if name == "log": return 1 - (1 - t) ** k
    if name in ("scurve", "s"): return t * t * (3 - 2 * t)
    if name == "hold": return 1 if t >= 1 else 0
    return t

# The Expression Router's input shaping. Below the threshold the value is zero and the REMAINING
# range rescales to fill 0-1, so response starts at the edge of the dead zone.
def deadzone(v, amount, invert=False):
    x = norm(v, 0, 1)
    if invert is True:
        x = 1 - x
    dz = norm(amount, 0, 1)
    if dz > 0:
        x = 0 if x <= dz else (x - dz) / (1 - dz)
    return norm(x, 0, 1)

# The inverse-distance blend a Timbre Space and a Preset Constellation use, normalised to sum to 1.
def weightsFor(points, x, y, power=2):
    pts = list(points or [])
    if not pts:
        return []
    px, py = norm(x, 0, 1), norm(y, 0, 1)
    p = max(0.5, __num(power, 2))
    raw = []
    for pt in pts:
        gx = pt.get("x") if hasattr(pt, "get") else getattr(pt, "x", 0)
        gy = pt.get("y") if hasattr(pt, "get") else getattr(pt, "y", 0)
        dx, dy = __num(gx) - px, __num(gy) - py
        raw.append(1 / ((dx * dx + dy * dy) ** (p / 2) + 1e-6))
    total = sum(raw)
    return [w / total if total > 0 else 1 / len(raw) for w in raw]

# A weighted average: what weightsFor is for, and what a morph pad IS.
def blendBy(values, weights):
    v, w = __nums(values), __nums(weights)
    n = min(len(v), len(w))
    total = sum(w[:n])
    return sum(v[i] * w[i] for i in range(n)) / total if total > 0 else 0

# The 0-1 stop positions a slider's scale is drawn from.
def tickStops(major, minor=0):
    majorCount = max(2, round(__num(major, 11)))
    minorCount = max(0, round(__num(minor, 0)))
    out = { "major": [], "minor": [] }
    for index in range(majorCount):
        normalized = index / (majorCount - 1)
        out["major"].append(normalized)
        if index >= majorCount - 1 or minorCount <= 0:
            continue
        for m in range(1, minorCount + 1):
            out["minor"].append(normalized + (m / (minorCount + 1)) * (1 / (majorCount - 1)))
    return out

# Where a level sits on a dB meter, which is a different question from how many dB it is.
def dbPosition(fraction, floorDb=-60, ceilDb=6):
    import math
    frac = norm(fraction, 0, 1)
    floor, ceil = __num(floorDb, -60), __num(ceilDb, 6)
    if ceil == floor:
        return 0
    db = 20 * math.log10(max(frac, 1e-4))
    return norm((db - floor) / (ceil - floor), 0, 1)
# Taming what arrives on the wire. smooth is NOT approach: approach moves a FIXED step (a rate
# limit), this moves a PROPORTION of what is left, which settles fast then creeps. It is lerp
# underneath; the reasons it is a member are the coefficient clamp and that it ARRIVES - a one-pole
# is asymptotic, so left alone it sits at 0.9999 and the control transmits forever.
def smooth(current, target, coefficient, epsilon=None):
    frm, to = __num(current), __num(target)
    k = norm(coefficient, 0, 1)
    tol = abs(__num(epsilon, 1e-4)) or 1e-4
    if abs(to - frm) <= tol:
        return to
    return frm + (to - frm) * k

# A Schmitt trigger: on at `high`, off at `low`, HOLDS between. A plain threshold chatters, and on
# a bound control that is dozens of MIDI messages a second.
def hysteresis(value, on, low, high):
    v, lo, hi = __num(value), __num(low), __num(high)
    if lo > hi:
        lo, hi = hi, lo
    return v > lo if on is True else v >= hi

# A mean SMEARS a spike across the result; a median rejects it.
def median(values):
    l = sorted(__nums(values))
    if not l:
        return None
    mid = len(l) // 2
    return l[mid] if len(l) % 2 else (l[mid - 1] + l[mid]) / 2

# The inverse of shape(), for going device -> panel THROUGH a taper. The same k as shape().
# A Euclidean rhythm: `pulses` hits spread as evenly as possible over `steps`. The app's own
# algorithm - the Arpeggiator has used it since it shipped and a script could never compute one.
# Bresenham rather than recursive Bjorklund: same output, no recursion to port five times.
def euclid(steps, pulses, rotation=0):
    n = max(1, min(64, round(__num(steps, 1))))
    k = max(0, min(n, round(__num(pulses, 0))))
    if k <= 0:
        return [False] * n
    if k >= n:
        return [True] * n
    out = []
    bucket = 0
    for _ in range(n):
        bucket += k
        if bucket >= n:
            bucket -= n
            out.append(True)
        else:
            out.append(False)
    rot = ((round(__num(rotation, 0)) % n) + n) % n
    return out[rot:] + out[:rot]
def unshape(y, curve, tension=None):
    import math
    v = norm(y, 0, 1)
    ten = __num(tension, 0) or 1.6
    k = 1 + max(0, ten)
    name = str(curve)
    if name == "exp": return v ** (1 / k)
    if name == "log": return 1 - (1 - v) ** (1 / k)
    # The closed-form inverse of smoothstep; a numeric solve would not agree to the last bit.
    if name in ("scurve", "s"): return 0.5 - math.sin(math.asin(1 - 2 * v) / 3)
    # hold is a step, so this returns the EARLIEST input that produces the output.
    if name == "hold": return 1 if v >= 1 else 0
    return v
# @module ce.math
# A seeded xorshift32, masked to 32 bits at every step and written identically in every prelude.
# Seeded is the whole point: the language's own random cannot promise the same sequence in five
# runtimes, so a "random" patch could not be reproduced and a generative sequence would sound
# different in the editor and in the export.
__RND_DEFAULT = 0x9E3779B9
# ONE GENERATOR PER STREAM. Each script is exec'd into its OWN namespace, so this dict is already
# per script and the key only has to separate streams within one — where a single state meant
# shuffle() advanced what gaussian() read, and seeding one element reset the other.
__rndStates = {}
__streamOverride = [""]
def randomSeed(n):
    import math
    v = math.floor(n or 0) & 0xFFFFFFFF
    # 0 is a DEAD state for xorshift — it would return zero forever — so it means "the default"
    # rather than "a generator that never moves".
    __rndStates[__streamOverride[0]] = __RND_DEFAULT if v == 0 else v
def random(lo=None, hi=None):
    import math
    x = __rndStates.get(__streamOverride[0], __RND_DEFAULT)
    x = (x ^ (x << 13)) & 0xFFFFFFFF
    x = x ^ (x >> 17)
    x = (x ^ (x << 5)) & 0xFFFFFFFF
    __rndStates[__streamOverride[0]] = x
    r = x / 4294967296.0
    if lo is None or hi is None: return r
    a = __mnum("ce.math.random", "lo", lo)
    if a is None: return None
    b = __mnum("ce.math.random", "hi", hi)
    if b is None: return None
    # Whole numbers, INCLUSIVE at both ends — the form a script wants for a note or a step — and
    # only those inside the range: the ends were floored, so random(1.5, 3.5) could give 1.
    low, high = math.ceil(min(a, b)), math.floor(max(a, b))
    if high < low:
        logError("ce.math.random: there is no whole number from " + __shownValue(a) + " to " + __shownValue(b) + ", so there is no answer.")
        return None
    return low + math.floor(r * (high - low + 1))

# Draws inside the block come from a generator of their own. A block rather than a name argument on
# nine verbs, the shape routeMidi already uses: the stream is a decision about a RUN of draws.
# Restored in a finally, so a throw inside cannot leave every later draw on the wrong stream.
def randomStream(name, fn):
    if not callable(fn):
        log("stream(name, fn) needs a block to run — nothing was drawn")
        return
    previous = __streamOverride[0]
    __streamOverride[0] = str(name if name is not None else "")
    try:
        fn()
    finally:
        __streamOverride[0] = previous

# randomChoice(values [, weights]) — a pick from the SEEDED generator, so a randomised patch
# replays. Exactly ONE number is drawn in every branch, weighted or not: a weighted pick consuming a
# different amount of the sequence would change what everything after it picked, and "the same seed
# replays the same sequence" would quietly stop being true.
def randomChoice(values, weights=None):
    import math
    items = list(values or [])
    if not items:
        return None
    r = random()
    w, total = [], 0.0
    for x in (weights or []):
        try:
            n = float(x)
        except (TypeError, ValueError):
            n = 0.0
        if n < 0:
            n = 0.0
        w.append(n)
        total += n
    if not total > 0:
        return items[math.floor(r * len(items))]
    ticket = r * total
    for i in range(len(items)):
        ticket -= w[i] if i < len(w) else 0.0
        if ticket < 0:
            return items[i]
    return items[-1]

# @module ce.math
# Colour arithmetic. The app's own (utils/colorHelpers.js, utils/colorMath.js), ported for the same
# reason every table here is: a script lightening a colour and the border renderer lightening the
# same colour have to agree, or a script-drawn highlight sits a shade off the one beside it.
#
# In takes what a colour property takes, read as if what the property would store had been given:
# "RRGGBB", "AARRGGBB" or "#RRGGBB" as written (6 hex digits are RRGGBB, 8 are AARRGGBB with the
# alpha set aside, one leading "#" either way), and CSS's short forms written out first, as the
# WebView writes them out (scriptColours.js's storedColour): "#RGB", a name from the generated
# table below, rgb(), rgba(), hsl() and hsla(), so "red" is "#FF0000" and rgba(255, 0, 0, 0.5) is
# "80FF0000". Out is "#RRGGBB", which CSS, SVG and a panel property all accept. The ONE exception
# is alpha(), which returns the panel's AARRGGBB: CSS's #RRGGBBAA is the same bytes the other way
# round.
#
# Anything else is refused, where it used to be read from its last six characters ("x5B9BD5" and
# the number 0xFF0000 were colours). So is an amount outside 0..1, which used to be used as it was
# (lighten by 40 was white) or clamped (alpha 128 was solid). In the words of the WebView runtime's
# colourChannels and colourUnit (scripting/scriptColours.js), which scriptPreludeAgreement.test.js
# checks; __realNumber is its realNumber, and ce.anim's targets are read by it too.
# BEGIN GENERATED colour names — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
# @module ce.math
# CSS's named colours (scriptColours.CSS_NAMED_COLOURS), as RRGGBB: what a colour
# property writes "red" out as, and what the ce.math colour helpers read it as.
__CE_CSS_COLOURS = {
    "aliceblue": "F0F8FF", "antiquewhite": "FAEBD7", "aqua": "00FFFF", "aquamarine": "7FFFD4",
    "azure": "F0FFFF", "beige": "F5F5DC", "bisque": "FFE4C4", "black": "000000",
    "blanchedalmond": "FFEBCD", "blue": "0000FF", "blueviolet": "8A2BE2", "brown": "A52A2A",
    "burlywood": "DEB887", "cadetblue": "5F9EA0", "chartreuse": "7FFF00", "chocolate": "D2691E",
    "coral": "FF7F50", "cornflowerblue": "6495ED", "cornsilk": "FFF8DC", "crimson": "DC143C",
    "cyan": "00FFFF", "darkblue": "00008B", "darkcyan": "008B8B", "darkgoldenrod": "B8860B",
    "darkgray": "A9A9A9", "darkgreen": "006400", "darkgrey": "A9A9A9", "darkkhaki": "BDB76B",
    "darkmagenta": "8B008B", "darkolivegreen": "556B2F", "darkorange": "FF8C00",
    "darkorchid": "9932CC", "darkred": "8B0000", "darksalmon": "E9967A", "darkseagreen": "8FBC8F",
    "darkslateblue": "483D8B", "darkslategray": "2F4F4F", "darkslategrey": "2F4F4F",
    "darkturquoise": "00CED1", "darkviolet": "9400D3", "deeppink": "FF1493",
    "deepskyblue": "00BFFF", "dimgray": "696969", "dimgrey": "696969", "dodgerblue": "1E90FF",
    "firebrick": "B22222", "floralwhite": "FFFAF0", "forestgreen": "228B22", "fuchsia": "FF00FF",
    "gainsboro": "DCDCDC", "ghostwhite": "F8F8FF", "gold": "FFD700", "goldenrod": "DAA520",
    "gray": "808080", "green": "008000", "greenyellow": "ADFF2F", "grey": "808080",
    "honeydew": "F0FFF0", "hotpink": "FF69B4", "indianred": "CD5C5C", "indigo": "4B0082",
    "ivory": "FFFFF0", "khaki": "F0E68C", "lavender": "E6E6FA", "lavenderblush": "FFF0F5",
    "lawngreen": "7CFC00", "lemonchiffon": "FFFACD", "lightblue": "ADD8E6", "lightcoral": "F08080",
    "lightcyan": "E0FFFF", "lightgoldenrodyellow": "FAFAD2", "lightgray": "D3D3D3",
    "lightgreen": "90EE90", "lightgrey": "D3D3D3", "lightpink": "FFB6C1", "lightsalmon": "FFA07A",
    "lightseagreen": "20B2AA", "lightskyblue": "87CEFA", "lightslategray": "778899",
    "lightslategrey": "778899", "lightsteelblue": "B0C4DE", "lightyellow": "FFFFE0",
    "lime": "00FF00", "limegreen": "32CD32", "linen": "FAF0E6", "magenta": "FF00FF",
    "maroon": "800000", "mediumaquamarine": "66CDAA", "mediumblue": "0000CD",
    "mediumorchid": "BA55D3", "mediumpurple": "9370DB", "mediumseagreen": "3CB371",
    "mediumslateblue": "7B68EE", "mediumspringgreen": "00FA9A", "mediumturquoise": "48D1CC",
    "mediumvioletred": "C71585", "midnightblue": "191970", "mintcream": "F5FFFA",
    "mistyrose": "FFE4E1", "moccasin": "FFE4B5", "navajowhite": "FFDEAD", "navy": "000080",
    "oldlace": "FDF5E6", "olive": "808000", "olivedrab": "6B8E23", "orange": "FFA500",
    "orangered": "FF4500", "orchid": "DA70D6", "palegoldenrod": "EEE8AA", "palegreen": "98FB98",
    "paleturquoise": "AFEEEE", "palevioletred": "DB7093", "papayawhip": "FFEFD5",
    "peachpuff": "FFDAB9", "peru": "CD853F", "pink": "FFC0CB", "plum": "DDA0DD",
    "powderblue": "B0E0E6", "purple": "800080", "rebeccapurple": "663399", "red": "FF0000",
    "rosybrown": "BC8F8F", "royalblue": "4169E1", "saddlebrown": "8B4513", "salmon": "FA8072",
    "sandybrown": "F4A460", "seagreen": "2E8B57", "seashell": "FFF5EE", "sienna": "A0522D",
    "silver": "C0C0C0", "skyblue": "87CEEB", "slateblue": "6A5ACD", "slategray": "708090",
    "slategrey": "708090", "snow": "FFFAFA", "springgreen": "00FF7F", "steelblue": "4682B4",
    "tan": "D2B48C", "teal": "008080", "thistle": "D8BFD8", "tomato": "FF6347",
    "turquoise": "40E0D0", "violet": "EE82EE", "wheat": "F5DEB3", "white": "FFFFFF",
    "whitesmoke": "F5F5F5", "yellow": "FFFF00", "yellowgreen": "9ACD32",
}
# END GENERATED colour names
__CFORMS = 'A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#", or "#RGB", a CSS colour name, rgb() or hsl()'
def __cshown(n):
    # A number as JavaScript prints it, for the numbers a script writes: whole ones without ".0".
    if isinstance(n, float) and n.is_integer() and abs(n) < 2 ** 53: return str(int(n))
    return str(n)
def __cfour(x):
    # x to four places with the trailing zeros dropped, as Number(x.toFixed(4)) prints it.
    return ("%.4f" % x).rstrip("0").rstrip(".")
def __chint(v):
    import math, re as __re
    if isinstance(v, bool): return ""
    if isinstance(v, (int, float)):
        if isinstance(v, float) and (not math.isfinite(v) or not v.is_integer()): return ""
        n = int(v)
        if n < 0 or n > 0xFFFFFFFF: return ""
        text = ("#%06X" % n) if n <= 0xFFFFFF else ("%08X" % n)
        return " As text, " + __cshown(v) + ' is "' + text + '".'
    if not isinstance(v, str): return ""
    m = __re.fullmatch(r"(#?)([0-9a-fA-F]{3,4})", v)
    if not m: return ""
    d = m.group(2).upper()
    if len(d) == 3: return ' Write "' + m.group(1) + d[0] * 2 + d[1] * 2 + d[2] * 2 + '".'
    return ' Write "' + d[3] * 2 + d[0] * 2 + d[1] * 2 + d[2] * 2 + '".'
def __realNumber(v):
    import math, re as __re
    if isinstance(v, bool): return None
    if isinstance(v, (int, float)):
        try: return v if math.isfinite(v) else None
        except OverflowError: return None
    if not isinstance(v, str): return None
    if not __re.fullmatch(r"\s*[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\s*", v): return None
    n = float(v)
    return n if math.isfinite(n) else None
# A number a ce.math command was given, or None after an error in the console. Left out, it is the
# fallback when there is one. The WebView runtime's mathNumber, word for word.
def __mnum(verb, what, v, fallback=None):
    if v is None and fallback is not None: return fallback
    n = __realNumber(v)
    if n is not None: return n
    if v is None: logError(verb + ": " + what + " is a number, and none was given, so there is no answer.")
    else: logError(verb + ": " + what + " is a number, and " + __shownValue(v) + " is not, so there is no answer.")
    return None
def __cunit(verb, what, v, fallback=None):
    if v is None and fallback is not None: return fallback
    n = __realNumber(v)
    if n is not None and 0 <= n <= 1: return n
    if v is None: shown = "none was given"
    elif isinstance(v, str): shown = '"' + v + '" is not'
    elif isinstance(v, (int, float)) and __realNumber(v) is not None: shown = __cshown(v) + " is not"
    else: shown = "the value given is not"
    hint = ""
    if n is not None and 0 <= n / 100 <= 1:
        hint = " If you meant " + __cshown(n) + " out of 100, write " + __cfour(n / 100) + "."
    logError(verb + ": " + what + " is a number from 0 to 1, and " + shown + ", so there is no answer." + hint)
    return None
# CSS's short forms, read as scriptColours.js reads them: its cssChannels, panelFormOf, longForm and
# cssHint, with its four expressions. Two things in them read differently in Python and are written
# out: JavaScript's white space (\s and strip() here take \x1c to \x1f and \x85 as well, and not
# ﻿), and its case-blind matching, which is ASCII's only (here the long s would match "s"
# without re.ASCII). Every number goes through what JavaScript does to it: Number(), Math.round,
# whose half goes up where round() goes to even, and `%`, which keeps the sign of what it divides,
# as math.fmod does and Python's % does not.
import re as __css_re
import math as __css_math
__CSS_WS = " \t\n\v\f\r                 　﻿"
def __css_pattern(p):
    # One of scriptColours.js's expressions, its NUM written in and its \s made JavaScript's.
    p = p.replace("NUM", r"[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?")
    return __css_re.compile(p.replace(r"\s", "[" + __CSS_WS + "]"), __css_re.IGNORECASE | __css_re.ASCII)
__CSS_RGB_LEGACY = __css_pattern(r"rgba?\(\s*(NUM)(%?)\s*,\s*(NUM)(%?)\s*,\s*(NUM)(%?)\s*(?:,\s*(NUM)(%?)\s*)?\)")
__CSS_RGB_MODERN = __css_pattern(r"rgba?\(\s*(NUM)(%?)\s+(NUM)(%?)\s+(NUM)(%?)\s*(?:/\s*(NUM)(%?)\s*)?\)")
__CSS_HSL_LEGACY = __css_pattern(r"hsla?\(\s*(NUM)(deg|grad|rad|turn)?\s*,\s*(NUM)()%\s*,\s*(NUM)()%\s*(?:,\s*(NUM)(%?)\s*)?\)")
__CSS_HSL_MODERN = __css_pattern(r"hsla?\(\s*(NUM)(deg|grad|rad|turn)?\s+(NUM)(%?)\s+(NUM)(%?)\s*(?:/\s*(NUM)(%?)\s*)?\)")
__CSS_TURN = { "deg": 1, "grad": 0.9, "rad": 180 / __css_math.pi, "turn": 360 }
def __cround(x):
    # JavaScript's Math.round: a half goes up, so 2.5 is 3 and -2.5 is -2.
    if not __css_math.isfinite(x): return x
    r = __css_math.floor(x)
    return r + 1 if x - r >= 0.5 else r
def __cclamp(v, lo, hi):
    return min(hi, max(lo, v))
def __calpha(value, percent):
    return 1 if value is None else __cclamp(float(value) / (100 if percent else 1), 0, 1)
def __ccss(text):
    # A CSS colour as (r, g, b, a), 0-255 and 0-1, or None.
    s = text.strip(__CSS_WS)
    lower = s.lower()
    if lower == "transparent": return (0, 0, 0, 0)
    named = __CE_CSS_COLOURS.get(lower)
    if named is not None: return (int(named[0:2], 16), int(named[2:4], 16), int(named[4:6], 16), 1)
    m = __css_re.fullmatch(r"#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})", s)
    if m:
        d = m.group(1)
        if len(d) <= 4: d = "".join(c + c for c in d)
        return (int(d[0:2], 16), int(d[2:4], 16), int(d[4:6], 16), int(d[6:8], 16) / 255 if len(d) == 8 else 1)
    m = __CSS_RGB_LEGACY.fullmatch(s) or __CSS_RGB_MODERN.fullmatch(s)
    if m:
        def channel(i): return __cclamp(__cround(float(m.group(i)) * (2.55 if m.group(i + 1) else 1)), 0, 255)
        return (channel(1), channel(3), channel(5), __calpha(m.group(7), m.group(8)))
    m = __CSS_HSL_LEGACY.fullmatch(s) or __CSS_HSL_MODERN.fullmatch(s)
    if m:
        # A hue too large to be a number has no angle, and is not a colour.
        turned = float(m.group(1)) * __CSS_TURN[(m.group(2) or "deg").lower()]
        if not __css_math.isfinite(turned): return None
        h = __css_math.fmod(__css_math.fmod(turned, 360) + 360, 360)
        sat = __cclamp(float(m.group(3)), 0, 100) / 100
        light = __cclamp(float(m.group(5)), 0, 100) / 100
        amp = sat * min(light, 1 - light)
        def f(n):
            k = __css_math.fmod(n + h / 30, 12)
            return __cround(255 * (light - amp * max(-1, min(k - 3, 9 - k, 1))))
        return (f(0), f(8), f(4), __calpha(m.group(7), m.group(8)))
    return None
def __cpanelForm(c):
    # The same colour in the panel's form: #RRGGBB when solid, AARRGGBB when it is not.
    rgb = "%02X%02X%02X" % (c[0], c[1], c[2])
    return "#" + rgb if c[3] >= 1 else ("%02X" % __cround(c[3] * 255)) + rgb
def __cpanelHex(v):
    # Does the panel read this as a colour? 6 or 8 hex digits, with or without one "#".
    return isinstance(v, str) and __css_re.fullmatch(r"#?(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})", v) is not None
def __clong(value):
    # CSS's short forms written out, as a property stores them, or None: not text with space around
    # it, "#" only with three digits ("#" with four is RGBA to CSS and ARGB here), and nothing CSS
    # cannot read.
    if not isinstance(value, str) or value.strip(__CSS_WS) != value: return None
    if value.startswith("#") and not __css_re.fullmatch(r"#[0-9a-fA-F]{3}", value): return None
    c = __ccss(value)
    return None if c is None else __cpanelForm(c)
def __ccssHint(value):
    # For a refusal: what CSS text with space around it is in the panel's form, or "". Text that is
    # the panel's own form once the space is gone is that text, read as the panel reads it.
    if not isinstance(value, str) or __cpanelHex(value): return ""
    trimmed = value.strip(__CSS_WS)
    if trimmed != value and __cpanelHex(trimmed): return ' Write "' + trimmed + '".'
    c = __ccss(value)
    return "" if c is None else ' Write "' + __cpanelForm(c) + '".'
def __cchan(verb, hex_):
    stored = None
    if isinstance(hex_, str): stored = hex_ if __cpanelHex(hex_) else __clong(hex_)
    if stored:
        h = stored[-6:]
        return [int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)]
    if hex_ is None: why = "no colour was given"
    elif isinstance(hex_, str): why = '"' + hex_ + '" is not a colour'
    elif isinstance(hex_, (int, float)) and __realNumber(hex_) is not None: why = __cshown(hex_) + " is not a colour"
    else: why = "the colour given is not text"
    logError(verb + ": " + why + ", so there is no answer. " + __CFORMS + "." + (__chint(hex_) or __ccssHint(hex_)))
    return None
def __cbyte(v):
    import math
    n = math.floor((float(v) if isinstance(v, (int, float)) else 0) + 0.5)
    return 0 if n < 0 else (255 if n > 255 else n)
def rgbToHex(r=None, g=None, b=None):
    rr = __mnum("ce.math.hex", "the red part", r, 0)
    if rr is None: return None
    gg = __mnum("ce.math.hex", "the green part", g, 0)
    if gg is None: return None
    bb = __mnum("ce.math.hex", "the blue part", b, 0)
    if bb is None: return None
    return ("#%02x%02x%02x" % (__cbyte(rr), __cbyte(gg), __cbyte(bb))).upper()
def hexToRgb(hex_):
    c = __cchan("ce.math.rgb", hex_)
    return None if c is None else { "r": c[0], "g": c[1], "b": c[2] }
def lighten(hex_, amount=None):
    c = __cchan("ce.math.lighten", hex_)
    if c is None: return None
    f = __cunit("ce.math.lighten", "the amount", amount, 0.4)
    if f is None: return None
    return rgbToHex(c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f)
def darken(hex_, amount=None):
    c = __cchan("ce.math.darken", hex_)
    if c is None: return None
    f = __cunit("ce.math.darken", "the amount", amount, 0.55)
    if f is None: return None
    return rgbToHex(c[0] * f, c[1] * f, c[2] * f)
# NOT an app algorithm, and said so: lerp() per channel in plain RGB.
def mixColour(a=None, b=None, t=None):
    x = __cchan("ce.math.mix", a)
    if x is None: return None
    y = __cchan("ce.math.mix", b)
    if y is None: return None
    f = __mnum("ce.math.mix", "t", t, 0)
    if f is None: return None
    f = 0.0 if f < 0 else (1.0 if f > 1 else f)
    return rgbToHex(x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f)
# The PANEL's form: AARRGGBB, no leading #, which is what a stored colour property holds.
# A colour written with its alpha first (fromARGB) or last (fromRGBA), in the form every reader
# reads one way: "#RRGGBB" when solid, AARRGGBB when not. scriptColours.orderedColour's reading,
# in the WebView runtime's colourFromOrder words.
__CORDER = {
    "argb": 'Write 8 hex digits with the alpha first, such as "80123456" or "#80123456", or 4, such as "#8123". With 6 or 3 there is no alpha.',
    "rgba": 'Write 8 hex digits with the alpha last, such as "12345680" or "#12345680", or 4, such as "#1238". With 6 or 3 there is no alpha.',
}
def __corder(verb, order, value):
    import re
    if isinstance(value, str):
        m = re.fullmatch(r"#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})", value)
        if m:
            d = m.group(1)
            if len(d) <= 4: d = "".join(c + c for c in d)
            d = d.upper()
            aa, rgb = "FF", d
            if len(d) == 8:
                aa, rgb = (d[0:2], d[2:]) if order == "argb" else (d[6:8], d[0:6])
            return "#" + rgb if aa == "FF" else aa + rgb
    if value is None: why = "no colour was given"
    elif isinstance(value, str): why = '"' + value + '" is not a colour written ' + ("AARRGGBB" if order == "argb" else "RRGGBBAA")
    elif isinstance(value, (int, float)) and not isinstance(value, bool) and __realNumber(value) is not None:
        why = __cshown(value) + " is a number, not text"
    else: why = "the colour given is not text"
    logError(verb + ": " + why + ", so there is no answer. " + __CORDER[order])
    return None
def colourFromArgb(colour=None): return __corder("ce.math.fromARGB", "argb", colour)
def colourFromRgba(colour=None): return __corder("ce.math.fromRGBA", "rgba", colour)
def colourAlpha(hex_, a=None):
    import math
    c = __cchan("ce.math.alpha", hex_)
    if c is None: return None
    f = __cunit("ce.math.alpha", "the alpha", a)
    if f is None: return None
    return ("%02x" % math.floor(f * 255 + 0.5) + rgbToHex(c[0], c[1], c[2])[1:]).upper()
def hexToHsl(hex_):
    c = __cchan("ce.math.hsl", hex_)
    if c is None: return None
    r = c[0] / 255.0; g = c[1] / 255.0; b = c[2] / 255.0
    mx = max(r, g, b); mn = min(r, g, b)
    h = 0.0; s = 0.0
    l = (mx + mn) / 2
    if mx != mn:
        d = mx - mn
        s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
        if mx == r: h = ((g - b) / d + (6 if g < b else 0)) * 60
        elif mx == g: h = ((b - r) / d + 2) * 60
        else: h = ((r - g) / d + 4) * 60
    return { "h": h, "s": s * 100, "l": l * 100 }
def hslToHex(hue=None, sat=None, light=None):
    import math
    h = __mnum("ce.math.fromHsl", "the hue", hue, 0)
    if h is None: return None
    s = __mnum("ce.math.fromHsl", "the saturation", sat, 0)
    if s is None: return None
    l = __mnum("ce.math.fromHsl", "the lightness", light, 0)
    if l is None: return None
    # A hue goes round (-120 is 240); the saturation and the lightness are held at 0 and 100.
    h = h - 360 * math.floor(h / 360)
    s = max(0, min(100, s)) / 100
    l = max(0, min(100, l)) / 100
    a = s * min(l, 1 - l)
    def f(n):
        k = (n + h / 30) % 12
        return l - a * max(-1, min(k - 3, 9 - k, 1))
    import math
    return rgbToHex(math.floor(f(0) * 255 + 0.5), math.floor(f(8) * 255 + 0.5), math.floor(f(4) * 255 + 0.5))

# @module ce.format
# ce.format, ported line for line from formatCore.js (the panel view's; the JavaScript prelude runs
# that file itself). The same text in every language is the point, so nothing here uses Python's
# own number formatting or round(): _fmt_fixed rounds half away from zero and writes the digits.
# Held to the panel view's answers by test/formatParity.test.js and test/support/formatCases.mjs.
import math as _fmt_math
import re as _fmt_re

_FMT_PLACEHOLDER = "--"
_FMT_INF = float("inf")
_FMT_DIVISIONS = [
    ("1/1", 4), ("1/2", 2), ("1/4", 1), ("1/8", 0.5), ("1/16", 0.25), ("1/32", 0.125),
    ("1/2D", 3), ("1/4D", 1.5), ("1/8D", 0.75), ("1/16D", 0.375),
    ("1/2T", 4 / 3), ("1/4T", 2 / 3), ("1/8T", 1 / 3), ("1/16T", 1 / 6),
]
_FMT_ABBREVIATIONS = [
    ("Amount", "Amt"), ("Attack", "Atk"), ("Balance", "Bal"), ("Bandwidth", "BW"), ("Channel", "Ch"),
    ("Chorus", "Chor"), ("Coarse", "Crs"), ("Control", "Ctrl"), ("Controller", "Ctrl"), ("Decay", "Dcy"),
    ("Delay", "Dly"), ("Depth", "Dpth"), ("Destination", "Dest"), ("Distortion", "Dist"), ("Effect", "FX"),
    ("Effects", "FX"), ("Envelope", "Env"), ("Feedback", "Fdbk"), ("Frequency", "Freq"), ("Keyboard", "Kbd"),
    ("Length", "Len"), ("Level", "Lvl"), ("Master", "Mstr"), ("Maximum", "Max"), ("Minimum", "Min"),
    ("Modulation", "Mod"), ("Number", "Num"), ("Octave", "Oct"), ("Oscillator", "Osc"), ("Parameter", "Param"),
    ("Pattern", "Pat"), ("Portamento", "Porta"), ("Position", "Pos"), ("Pressure", "Press"), ("Program", "Prog"),
    ("Random", "Rnd"), ("Release", "Rel"), ("Resonance", "Reso"), ("Reverb", "Rvb"), ("Sample", "Smp"),
    ("Semitone", "Semi"), ("Sequence", "Seq"), ("Sequencer", "Seq"), ("Source", "Src"), ("Sustain", "Sus"),
    ("Transpose", "Trans"), ("Tremolo", "Trem"), ("Velocity", "Vel"), ("Vibrato", "Vib"), ("Volume", "Vol"),
    ("Waveform", "Wave"), ("Width", "Wdth"),
]
_FMT_SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_FMT_FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
_FMT_NUMBER_TEXT = _fmt_re.compile(r"[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")
_FMT_PLAIN_NUMBER = _fmt_re.compile(r"[+-]?(\d+\.?\d*|\.\d+)")

def _fmt_say(level, text):
    if level == "warn":
        logWarn(text)
    else:
        logError(text)

def _fmt_finite(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and _fmt_math.isfinite(x)

def _fmt_num(v):
    if isinstance(v, bool):
        return float("nan")
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str) and _FMT_NUMBER_TEXT.fullmatch(v.strip()):
        return float(v.strip())
    return float("nan")

def _fmt_opt(opts, key):
    if isinstance(opts, dict):
        return opts.get(key)
    return None

def _fmt_opt_number(opts, key, fallback):
    v = _fmt_num(_fmt_opt(opts, key))
    return v if _fmt_math.isfinite(v) else fallback

def _fmt_clamp_int(v, lo, hi):
    r = _fmt_math.floor(v + 0.5)
    return lo if r < lo else hi if r > hi else r

def _fmt_fixed(x, d):
    neg = x < 0
    p = 10 ** d
    r = _fmt_math.floor(abs(x) * p + 0.5 + 1e-9)
    s = "%.0f" % r
    while len(s) < d + 1:
        s = "0" + s
    body = s[:len(s) - d] + "." + s[len(s) - d:] if d > 0 else s
    return "-" + body if neg and r != 0 else body

def _fmt_sig_decimals(a, digits):
    if a == 0:
        return 0
    e = _fmt_math.floor(_fmt_math.log10(a))
    if 10 ** (e + 1) <= a:
        e += 1
    if 10 ** e > a:
        e -= 1
    d = digits - 1 - e
    return 0 if d < 0 else 6 if d > 6 else d

def _fmt_strip(s):
    if "." not in s:
        return s
    t = s
    while t.endswith("0"):
        t = t[:-1]
    if t.endswith("."):
        t = t[:-1]
    return t

def _fmt_number_text(v, opts, fallback=None):
    decimals = _fmt_num(_fmt_opt(opts, "decimals"))
    if _fmt_math.isfinite(decimals):
        s = _fmt_fixed(v, _fmt_clamp_int(decimals, 0, 6))
    elif fallback is not None:
        s = _fmt_fixed(v, fallback)
    else:
        s = _fmt_strip(_fmt_fixed(v, _fmt_sig_decimals(abs(v), _fmt_clamp_int(_fmt_opt_number(opts, "digits", 3), 1, 6))))
    if s == "-0":
        s = "0"
    if _fmt_opt(opts, "sign") == "always" and not s.startswith("-") and _fmt_re.search(r"[1-9]", s):
        s = "+" + s
    return s

def _fmt_with_unit(text, unit, opts):
    u = _fmt_opt(opts, "unit")
    if u is False:
        return text
    name = u if isinstance(u, str) else unit
    if not name:
        return text
    space = "" if _fmt_opt(opts, "space") is False or (name == "%" and not isinstance(u, str)) else " "
    return text + space + name

def _fmt_finish(text, opts):
    t = text
    if _fmt_opt(opts, "unicode") is True and t.startswith("-"):
        t = "−" + t[1:]
    width = _fmt_num(_fmt_opt(opts, "width"))
    if _fmt_math.isfinite(width):
        w = _fmt_clamp_int(width, 0, 200)
        while len(t) < w:
            t = " " + t
    return t

def _fmt_placeholder(opts):
    p = _fmt_opt(opts, "placeholder")
    return p if isinstance(p, str) else _FMT_PLACEHOLDER

def _fmt_as_text(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return _fmt_number_text(float(v), {}) if _fmt_math.isfinite(v) else _FMT_PLACEHOLDER
    if v is None:
        return ""
    return str(v)

def formatNumber(v, opts=None):
    n = _fmt_num(v)
    if not _fmt_math.isfinite(n):
        return _fmt_placeholder(opts)
    return _fmt_finish(_fmt_with_unit(_fmt_number_text(n, opts), "", opts), opts)

def _fmt_scaled(v, opts, verb, small, large, factor, what):
    n = _fmt_num(v)
    if not _fmt_math.isfinite(n):
        return _fmt_placeholder(opts)
    if n < 0:
        _fmt_say("error", "ce.format." + verb + ": " + what + " below 0 is not one, so \"" + _fmt_placeholder(opts) + "\" is shown.")
        return _fmt_placeholder(opts)
    scale = str(_fmt_opt(opts, "scale") if _fmt_opt(opts, "scale") is not None else "auto").lower()
    big = scale == large.lower() or (scale != small.lower() and n >= factor)
    return _fmt_finish(_fmt_with_unit(_fmt_number_text(n / factor if big else n, opts), large if big else small, opts), opts)

def formatHz(v, opts=None):
    return _fmt_scaled(v, opts, "hz", "Hz", "kHz", 1000, "a frequency")

def formatTime(ms, opts=None):
    return _fmt_scaled(ms, opts, "time", "ms", "s", 1000, "a duration")

def formatDb(v, opts=None):
    n = _fmt_num(v)
    if _fmt_math.isnan(n):
        return _fmt_placeholder(opts)
    if _fmt_opt(opts, "fromGain") is True:
        n = -144.0 if n <= 0 else 20 * _fmt_math.log10(n)
        if n < -144:
            n = -144.0
    floor = _fmt_opt_number(opts, "floor", -144)
    unicode = _fmt_opt(opts, "unicode") is True
    if n <= floor:
        text = "-∞" if unicode else "-inf"
    elif n == _FMT_INF:
        text = "∞" if unicode else "inf"
    else:
        text = _fmt_number_text(n, opts, 1)
    return _fmt_finish(_fmt_with_unit(text, "dB", opts), opts)

def formatPercent(v, opts=None):
    n = _fmt_num(v)
    if not _fmt_math.isfinite(n):
        return _fmt_placeholder(opts)
    lo = _fmt_opt_number(opts, "min", 0)
    hi = _fmt_opt_number(opts, "max", 1)
    if hi == lo:
        _fmt_say("error", "ce.format.percent: min and max are the same, so \"" + _fmt_placeholder(opts) + "\" is shown.")
        return _fmt_placeholder(opts)
    return _fmt_finish(_fmt_with_unit(_fmt_number_text(((n - lo) / (hi - lo)) * 100, opts, 0), "%", opts), opts)

def formatPan(v, opts=None):
    n = _fmt_num(v)
    if not _fmt_math.isfinite(n):
        return _fmt_placeholder(opts)
    custom = _fmt_opt(opts, "min") is not None or _fmt_opt(opts, "max") is not None
    lo = _fmt_opt_number(opts, "min", -1)
    hi = _fmt_opt_number(opts, "max", 1)
    if hi == lo:
        _fmt_say("error", "ce.format.pan: min and max are the same, so \"" + _fmt_placeholder(opts) + "\" is shown.")
        return _fmt_placeholder(opts)
    center = _fmt_opt_number(opts, "center", (lo + hi) / 2)
    steps = _fmt_opt_number(opts, "steps", 50)
    amount = n - center if custom else ((n - center) / ((hi - lo) / 2)) * steps
    t = _fmt_number_text(abs(amount), {"decimals": _fmt_opt(opts, "decimals")}, 0)
    if not _fmt_re.search(r"[1-9]", t):
        return _fmt_finish("C", opts)
    left = amount < 0
    style = str(_fmt_opt(opts, "style") if _fmt_opt(opts, "style") is not None else "L50")
    if style == "50L":
        text = t + ("L" if left else "R")
    elif style == "<50":
        text = ("<" if left else ">") + t
    elif style == "50>":
        text = t + ("<" if left else ">")
    else:
        text = ("L" if left else "R") + t
    return _fmt_finish(text, opts)

def formatRatio(v, opts=None):
    n = _fmt_num(v)
    if _fmt_math.isnan(n):
        return _fmt_placeholder(opts)
    if n <= 0:
        _fmt_say("error", "ce.format.ratio: a ratio must be above 0, so \"" + _fmt_placeholder(opts) + "\" is shown.")
        return _fmt_placeholder(opts)
    x = _fmt_opt(opts, "style") == "x"
    if n == _FMT_INF:
        text = "∞" if _fmt_opt(opts, "unicode") is True else "inf"
    else:
        text = _fmt_number_text(n, opts, 2 if x else None)
    return _fmt_finish("x" + text if x else text + ":1", opts)

def _fmt_pad2(n):
    s = "%.0f" % n
    return "0" + s if len(s) < 2 else s

def formatClock(ms, opts=None):
    n = _fmt_num(ms)
    if not _fmt_math.isfinite(n):
        return _fmt_placeholder(opts)
    d = _fmt_clamp_int(_fmt_opt_number(opts, "decimals", 1), 0, 3)
    p = 10 ** d
    # Cut, not rounded: a clock shows the tenth that has passed, never one still to come.
    units = _fmt_math.floor(abs(n) * p / 1000 + 1e-9)
    secs = _fmt_math.floor(units / p)
    frac = units - secs * p
    h = _fmt_math.floor(secs / 3600)
    m = _fmt_math.floor((secs % 3600) / 60)
    s = secs % 60
    if h > 0 or _fmt_opt(opts, "hours") is True:
        text = ("%.0f" % h) + ":" + _fmt_pad2(m) + ":" + _fmt_pad2(s)
    else:
        text = ("%.0f" % m) + ":" + _fmt_pad2(s)
    if d > 0:
        f = "%.0f" % frac
        while len(f) < d:
            f = "0" + f
        text += "." + f
    return _fmt_finish(("-" if n < 0 and units > 0 else "") + text, opts)

def formatNote(n, opts=None):
    v = _fmt_num(n)
    if not _fmt_math.isfinite(v):
        return _fmt_placeholder(opts)
    note = -_fmt_math.floor(-v + 0.5) if v < 0 else _fmt_math.floor(v + 0.5)
    if note < 0 or note > 127:
        _fmt_say("error", "ce.format.note: a MIDI note is 0 to 127, so \"" + _fmt_placeholder(opts) + "\" is shown.")
        return _fmt_placeholder(opts)
    middle_c = _fmt_clamp_int(_fmt_opt_number(opts, "middleC", 4), -2, 9)
    name = (_FMT_FLATS if _fmt_opt(opts, "flats") is True else _FMT_SHARPS)[note % 12]
    if _fmt_opt(opts, "unicode") is True:
        name = name[:1] + name[1:].replace("#", "♯", 1).replace("b", "♭", 1)
    if _fmt_opt(opts, "octave") is False:
        return _fmt_finish(name, {"width": _fmt_opt(opts, "width")})
    octave = _fmt_math.floor(note / 12) - 5 + middle_c
    return _fmt_finish(name + ("%.0f" % octave), {"width": _fmt_opt(opts, "width")})

def formatDivision(beats, opts=None):
    n = _fmt_num(beats)
    if not _fmt_math.isfinite(n):
        return _fmt_placeholder(opts)
    if n <= 0:
        _fmt_say("error", "ce.format.division: a length must be above 0 beats, so \"" + _fmt_placeholder(opts) + "\" is shown.")
        return _fmt_placeholder(opts)
    tolerance = min(0.5, max(0, _fmt_opt_number(opts, "tolerance", 0.02)))
    best, best_error = None, _FMT_INF
    for name, b in _FMT_DIVISIONS:
        error = abs(n - b) / b
        if error < best_error:
            best, best_error = name, error
    if best_error <= tolerance + 1e-12:
        return _fmt_finish(best, opts)
    return _fmt_finish(_fmt_number_text(n, opts) + " beats", opts)

def _fmt_entry_field(entry, key):
    if isinstance(entry, dict):
        return entry.get(key)
    return getattr(entry, key, None)

def formatTable(v, table, opts=None):
    n = _fmt_num(v)
    if not _fmt_math.isfinite(n):
        return _fmt_placeholder(opts)
    if not isinstance(table, (list, tuple)) or len(table) == 0:
        _fmt_say("error", "ce.format.table: the table must be a list of texts, or of { upTo, text } ranges, so \"" + _fmt_placeholder(opts) + "\" is shown.")
        return _fmt_placeholder(opts)
    first = table[0]
    if not isinstance(first, (str, int, float)) and _fmt_entry_field(first, "upTo") is not None:
        for entry in table:
            up_to = _fmt_num(_fmt_entry_field(entry, "upTo"))
            if _fmt_math.isfinite(up_to) and n <= up_to:
                return _fmt_finish(_fmt_as_text(_fmt_entry_field(entry, "text")), opts)
        _fmt_say("warn", "ce.format.table: " + _fmt_number_text(n, {}) + " is past the last range, so \"" + _fmt_placeholder(opts) + "\" is shown.")
        return _fmt_placeholder(opts)
    start = _fmt_math.floor(_fmt_opt_number(opts, "start", 0) + 0.5)
    index = (-_fmt_math.floor(-n + 0.5) if n < 0 else _fmt_math.floor(n + 0.5)) - start
    if index < 0 or index >= len(table):
        _fmt_say("warn", "ce.format.table: " + _fmt_number_text(n, {}) + " is past the end of the table, so \"" + _fmt_placeholder(opts) + "\" is shown.")
        return _fmt_placeholder(opts)
    return _fmt_finish(_fmt_as_text(table[index]), opts)

_FMT_VOWELS = "aeiouAEIOU"

def _fmt_abbreviations(extra):
    out = {}
    for word, short in _FMT_ABBREVIATIONS:
        out[word.lower()] = short
    if isinstance(extra, dict):
        for key, value in extra.items():
            out[str(key).lower()] = str(value)
    return out

def _fmt_shorten(text, width, steps, extra):
    if len(text) <= width:
        return text
    words = [w for w in text.split(" ") if w != ""]
    join = lambda: " ".join(words)
    if steps >= 1:
        table = _fmt_abbreviations(extra)
        words = [table.get(w.lower(), w) for w in words]
        if len(join()) <= width:
            return join()
    if steps >= 2:
        while len(join()) > width:
            pick = -1
            for i, w in enumerate(words):
                removable = any(c in _FMT_VOWELS for c in w[1:])
                if removable and (pick < 0 or len(w) > len(words[pick])):
                    pick = i
            if pick < 0:
                break
            w = words[pick]
            k = len(w) - 1
            while k >= 1 and w[k] not in _FMT_VOWELS:
                k -= 1
            words[pick] = w[:k] + w[k + 1:]
        if len(join()) <= width:
            return join()
    if steps >= 3:
        while len(join()) > width and len(words) > 1:
            last = words.pop()
            words[-1] += last
        if len(join()) <= width:
            return join()
    return join()[:width]

def _fmt_pad_to(text, width, align):
    t = text
    if align == "right":
        while len(t) < width:
            t = " " + t
        return t
    if align == "center":
        t = " " * _fmt_math.floor((width - len(t)) / 2) + t
    while len(t) < width:
        t += " "
    return t

def formatFit(text, width, opts=None):
    w = _fmt_num(width)
    if not _fmt_math.isfinite(w) or w < 1:
        _fmt_say("error", "ce.format.fit: the width must be 1 character or more, so nothing is shown.")
        return ""
    width0 = _fmt_math.floor(w)
    steps = _fmt_clamp_int(_fmt_opt_number(opts, "steps", 4), 1, 4)
    short = _fmt_shorten(_fmt_as_text(text), width0, steps, _fmt_opt(opts, "abbreviations"))
    if _fmt_opt(opts, "pad") is False:
        return short
    return _fmt_pad_to(short, width0, str(_fmt_opt(opts, "align") if _fmt_opt(opts, "align") is not None else "left"))

def formatLine(left, right, width, opts=None):
    w = _fmt_num(width)
    if not _fmt_math.isfinite(w) or w < 1:
        _fmt_say("error", "ce.format.line: the width must be 1 character or more, so nothing is shown.")
        return ""
    width0 = _fmt_math.floor(w)
    gap = _fmt_clamp_int(_fmt_opt_number(opts, "gap", 1), 0, width0)
    r = _fmt_as_text(right)
    if len(r) >= width0:
        return r[len(r) - width0:]
    room = width0 - gap - len(r)
    if room <= 0:
        return _fmt_pad_to(r, width0, "right")
    l = _fmt_as_text(left)
    if len(l) > room:
        l = _fmt_shorten(l, room, 4, _fmt_opt(opts, "abbreviations"))
    return l + " " * (width0 - len(l) - len(r)) + r

_FMT_NOTE_BASE = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}
_FMT_UNIT_SUFFIXES = [("khz", "hz", 1000), ("hz", "hz", 1), ("ms", "time", 1), ("db", "db", 1),
                      ("%", "percent", 0.01), ("s", "time", 1000), ("k", "", 1000)]

def _fmt_read_number(s):
    if s in ("inf", "+inf"):
        return _FMT_INF
    if s == "-inf":
        return -_FMT_INF
    return float(s) if _FMT_PLAIN_NUMBER.fullmatch(s) else float("nan")

def _fmt_parse_note(s, opts):
    letter = s[:1]
    if letter not in _FMT_NOTE_BASE:
        return float("nan")
    rest = s[1:]
    pc = _FMT_NOTE_BASE[letter]
    if rest.startswith("#"):
        pc += 1
        rest = rest[1:]
    elif rest.startswith("b") and len(rest) > 1:
        pc -= 1
        rest = rest[1:]
    if not _fmt_re.fullmatch(r"-?\d+", rest):
        return float("nan")
    middle_c = _fmt_clamp_int(_fmt_opt_number(opts, "middleC", 4), -2, 9)
    n = pc + (int(rest) - middle_c + 5) * 12
    return float(n) if 0 <= n <= 127 else float("nan")

def _fmt_parse_pan(s, opts):
    if s == "c":
        return _fmt_opt_number(opts, "center", (_fmt_opt_number(opts, "min", -1) + _fmt_opt_number(opts, "max", 1)) / 2)
    side, digits = "", s
    head, tail = s[:1], s[-1:]
    if head in ("l", "<"):
        side, digits = "l", s[1:]
    elif head in ("r", ">"):
        side, digits = "r", s[1:]
    elif tail in ("l", "<"):
        side, digits = "l", s[:-1]
    elif tail in ("r", ">"):
        side, digits = "r", s[:-1]
    amount = _fmt_read_number(digits)
    if not side or not _fmt_math.isfinite(amount):
        return float("nan")
    custom = _fmt_opt(opts, "min") is not None or _fmt_opt(opts, "max") is not None
    lo = _fmt_opt_number(opts, "min", -1)
    hi = _fmt_opt_number(opts, "max", 1)
    center = _fmt_opt_number(opts, "center", (lo + hi) / 2)
    steps = _fmt_opt_number(opts, "steps", 50)
    signed = -amount if side == "l" else amount
    return center + signed if custom else center + (signed / steps) * ((hi - lo) / 2)

def _fmt_parse_kind(s, kind, opts):
    if kind == "note":
        return _fmt_parse_note(s, opts)
    if kind == "division":
        for name, b in _FMT_DIVISIONS:
            if name.lower() == s:
                return b
        return float("nan")
    if kind == "pan":
        return _fmt_parse_pan(s, opts)
    if kind == "ratio":
        if len(s) > 2 and s.endswith(":1"):
            return _fmt_read_number(s[:-2])
        if s.startswith("x"):
            return _fmt_read_number(s[1:])
    return float("nan")

def formatParse(text, opts=None):
    if isinstance(text, bool) or not isinstance(text, (str, int, float)):
        return None
    s = _fmt_re.sub(r"\s+", "", str(text).lower())
    s = s.replace("−", "-").replace("♯", "#").replace("♭", "b").replace("∞", "inf")
    if s == "":
        return None
    kind = str(_fmt_opt(opts, "kind") if _fmt_opt(opts, "kind") is not None else "auto")
    value = _fmt_parse_kind(s, kind, opts)
    if _fmt_math.isnan(value):
        factor, unit_kind = 1, ""
        for suffix, k, f in _FMT_UNIT_SUFFIXES:
            if len(s) > len(suffix) and s.endswith(suffix):
                s = s[:len(s) - len(suffix)]
                factor, unit_kind = f, k
                break
        if unit_kind and kind != "auto" and unit_kind != kind:
            return None
        value = _fmt_read_number(s)
        if _fmt_math.isnan(value):
            return None
        if not unit_kind and factor == 1 and kind == "percent":
            factor = 0.01
        value = value * factor
    lo = _fmt_num(_fmt_opt(opts, "min"))
    hi = _fmt_num(_fmt_opt(opts, "max"))
    if _fmt_math.isfinite(lo) and value < lo:
        value = lo
    if _fmt_math.isfinite(hi) and value > hi:
        value = hi
    return value

# As the synth shows it: formatCore.js formatDescribed, from the parameter the profile describes.
# The commands as defined above, before the option check wraps the globals: formatDescribed hands
# them options of its own (a note's middleC beside a frequency) that a script's call would not.
_FMT_RAW = {
    "number": formatNumber, "hz": formatHz, "time": formatTime, "db": formatDb, "percent": formatPercent,
    "pan": formatPan, "ratio": formatRatio, "note": formatNote, "division": formatDivision, "table": formatTable,
}

def _fmt_described_options(d, kind, opts):
    o = {}
    precision = _fmt_num(d.get("precision"))
    if _fmt_math.isfinite(precision):
        o["decimals"] = precision
    unit = d.get("unit")
    if isinstance(unit, str) and unit != "" and kind in ("", "number"):
        o["unit"] = unit
    middle_c = _fmt_num(d.get("middleC"))
    if _fmt_math.isfinite(middle_c):
        o["middleC"] = middle_c
    if isinstance(opts, dict):
        for key, value in opts.items():
            if key != "role":
                o[key] = value
    return o

def _fmt_with_options(base, extra):
    o = dict(base)
    for key, value in extra.items():
        if o.get(key) is None:
            o[key] = value
    return o

def _fmt_described(desc, v, opts):
    p = desc if isinstance(desc, dict) else {}
    d = p.get("display") if isinstance(p.get("display"), dict) else {}
    kind = d.get("format") if isinstance(d.get("format"), str) else ""
    o = _fmt_described_options(d, kind, opts)

    if d.get("mode") == "text" or p.get("type") == "text":
        return _fmt_finish(_fmt_as_text(v), o)

    choices = p.get("choices")
    if isinstance(choices, (list, tuple)):
        wanted = _fmt_num(v)
        for c in choices:
            if not isinstance(c, dict):
                continue
            value = _fmt_num(c.get("value"))
            if (_fmt_math.isfinite(wanted) and value == wanted) or (isinstance(v, str) and c.get("id") == v):
                label = c.get("label")
                return _fmt_finish(_fmt_as_text(label if label is not None else c.get("id")), o)

    n = _fmt_num(v)
    if not _fmt_math.isfinite(n):
        return _fmt_placeholder(o)
    rng = p.get("range") if isinstance(p.get("range"), dict) else {}
    lo = _fmt_num(rng.get("min"))
    hi = _fmt_num(rng.get("max"))
    wire_min = lo if _fmt_math.isfinite(lo) else 0
    wire_max = hi if _fmt_math.isfinite(hi) else 127

    table = d.get("table")
    if isinstance(table, (list, tuple)) and len(table) > 0:
        return _FMT_RAW["table"](n, table, _fmt_with_options(o, {"start": wire_min}))

    dmin = _fmt_num(d.get("min"))
    dmax = _fmt_num(d.get("max"))
    scaled = _fmt_math.isfinite(dmin) and _fmt_math.isfinite(dmax) and wire_max != wire_min
    shown = dmin + ((n - wire_min) / (wire_max - wire_min)) * (dmax - dmin) if scaled else n

    if kind == "hz":
        return _FMT_RAW["hz"](shown, o)
    if kind == "time":
        return _FMT_RAW["time"](shown, o)
    if kind == "db":
        return _FMT_RAW["db"](shown, o)
    if kind == "ratio":
        return _FMT_RAW["ratio"](shown, o)
    if kind == "note":
        return _FMT_RAW["note"](shown, o)
    if kind == "division":
        return _FMT_RAW["division"](shown, o)
    if kind == "percent":
        return _FMT_RAW["percent"](n, _fmt_with_options(o, {"min": wire_min, "max": wire_max}))
    if kind == "pan":
        a, b = (dmin, dmax) if scaled else (wire_min, wire_max)
        center = 0 if a < 0 and b > 0 else _fmt_math.floor((a + b) / 2 + 0.5)
        return _FMT_RAW["pan"](shown, _fmt_with_options(o, {"min": a, "max": b, "center": center}))
    return _FMT_RAW["number"](shown, o)

def formatParameter(id, v, opts=None):
    # The host query itself, not deviceParameter: that is ce.device's, and gated when a script
    # does not use ce.device.
    role = opts.get("role") if isinstance(opts, dict) else None
    role = "mainSynth" if role is None or role == "" else str(role)
    d = __deviceQuery("parameter", { "role": role, "id": str(id) })
    if not isinstance(d, dict):
        shown = _fmt_placeholder(opts)
        _fmt_say("error", "ce.format.parameter: the device profile has no parameter \"" + str(id) + "\", so \"" + shown + "\" is shown.")
        return shown
    return _fmt_described(d, v, opts)

# @module ce.patch
# ce.patch, ported line for line from patchCore.js (the panel view's; the JavaScript prelude runs
# that file itself). Held to the panel view's answers by test/patchParity.test.js and the scenario in
# test/support/patchScenario.mjs. ce.patch requires ce.device, ce.panel, ce.math and ce.storage, so
# the globals the host below calls are live whenever a script can reach ce.patch.
import math as _patch_math
import re as _patch_re

_PATCH_LEAVE_OUT_GROUPS = ["system", "global", "utility", "performance"]
_PATCH_DEFAULT_SEED = 0x9E3779B9
_PATCH_SEND_MODES = ["auto", "parameters", "dump", "none"]
_PATCH_LIVE_BUDGET = 32
_PATCH_DEFINE_FIELDS = ["name", "groups", "only", "except", "dumps", "read", "transform"]
_PATCH_STORE_PREFIX = "ce.patch:"
_PATCH_NUMBER_TEXT = _patch_re.compile(r"[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")

def _patch_num(v):
    if isinstance(v, bool):
        return float("nan")
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str) and _PATCH_NUMBER_TEXT.fullmatch(v.strip()):
        t = float(v.strip())
        return int(t) if t.is_integer() and "." not in v and "e" not in v.lower() else t
    return float("nan")

def _patch_finite(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and _patch_math.isfinite(x)

def _patch_opt(opts, key):
    return opts.get(key) if isinstance(opts, dict) else None

def _patch_names(v):
    if isinstance(v, str):
        return [] if v == "" else [v]
    if not isinstance(v, (list, tuple)):
        return []
    return [x for x in v if isinstance(x, str) and x != ""]

def _patch_lower(s):
    return "" if s is None else str(s).lower()

def _patch_str(v):
    return "" if v is None else (v if isinstance(v, str) else _patch_text(v))

def _patch_text(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)

def _patch_has(values, key):
    return isinstance(values, dict) and values.get(key) is not None

def _patch_copy(values):
    return {k: v for k, v in values.items() if v is not None} if isinstance(values, dict) else {}

def _patch_round(x):
    return -_patch_math.floor(-x + 0.5) if x < 0 else _patch_math.floor(x + 0.5)

def _patch_kind(desc):
    t = _patch_str(desc.get("type")) if isinstance(desc, dict) else ""
    if t in ("action", "momentary", "trigger"):
        return "action"
    if t == "text":
        return "text"
    if t in ("choice", "boolean", "enum", "bool"):
        return "choice"
    if isinstance(desc, dict) and isinstance(desc.get("choices"), (list, tuple)) and len(desc.get("choices")) > 0:
        return "choice"
    return "number"

def _patch_writable(desc):
    access = desc.get("access") if isinstance(desc, dict) else None
    if isinstance(access, str):
        return "write" in access.lower()
    if isinstance(access, dict) and access.get("canWrite") is False:
        return False
    return True

def _patch_whole(desc):
    return not (isinstance(desc, dict) and desc.get("type") == "float")

def _patch_range(desc):
    rng = desc.get("range") if isinstance(desc, dict) and isinstance(desc.get("range"), dict) else {}
    lo = _patch_num(rng.get("min"))
    hi = _patch_num(rng.get("max"))
    a = lo if _patch_finite(lo) else 0
    b = hi if _patch_finite(hi) else 127
    return (a, b) if a <= b else (b, a)

def _patch_choices(desc):
    out = []
    if isinstance(desc, dict) and isinstance(desc.get("choices"), (list, tuple)):
        for c in desc["choices"]:
            if isinstance(c, dict):
                if c.get("id") is not None:
                    out.append(c["id"])
                elif c.get("value") is not None:
                    out.append(c["value"])
            elif c is not None:
                out.append(c)
    t = _patch_str(desc.get("type")) if isinstance(desc, dict) else ""
    if len(out) == 0 and t in ("boolean", "bool"):
        out = [False, True]
    return out

def _patch_settle(desc, v):
    x = v
    if _patch_whole(desc):
        x = _patch_round(x)
    lo, hi = _patch_range(desc)
    if x < lo:
        x = lo
    if x > hi:
        x = hi
    return x

def _patch_same(desc, a, b):
    x = _patch_num(a)
    y = _patch_num(b)
    if not isinstance(a, bool) and not isinstance(b, bool) and _patch_finite(x) and _patch_finite(y):
        return abs(x - y) < (0.5 if _patch_whole(desc) else 1e-9)
    if a is b or (type(a) == type(b) and a == b):
        return True
    if a is None or b is None:
        return False
    if isinstance(a, bool) or isinstance(b, bool):
        return _patch_text(a) == _patch_text(b)
    return str(a).rstrip() == str(b).rstrip()

def _patch_left_out(desc):
    return _patch_lower(desc.get("group") if isinstance(desc, dict) else None) in _PATCH_LEAVE_OUT_GROUPS

def _patch_matches(desc, names):
    group = _patch_lower(desc.get("group"))
    for name in names:
        if name == desc.get("id"):
            return True
        if group != "" and name.lower() == group:
            return True
    return False

def _patch_scope_params(params, scope, defs):
    lst = params if isinstance(params, (list, tuple)) else []
    sid = "voice" if scope is None else str(scope)
    d = defs.get(sid) if isinstance(defs, dict) else None
    out = []
    if isinstance(d, dict):
        groups = _patch_names(d.get("groups"))
        only = _patch_names(d.get("only"))
        exc = _patch_names(d.get("except"))
        for desc in lst:
            if _patch_kind(desc) == "action":
                continue
            if (groups or only) and not _patch_matches(desc, groups) and desc.get("id") not in only:
                continue
            if _patch_matches(desc, exc):
                continue
            out.append(desc)
        return out
    if sid == "voice":
        return [desc for desc in lst if _patch_kind(desc) != "action" and not _patch_left_out(desc)]
    if sid == "system":
        return [desc for desc in lst if _patch_kind(desc) != "action" and _patch_left_out(desc)]
    return None

def _patch_name_parameter(scoped):
    found = ""
    for desc in scoped:
        if _patch_kind(desc) != "text":
            continue
        if found != "":
            return ""
        found = str(desc.get("id"))
    return found

def _patch_warn_unknown(scoped, names, what, verb, say, words):
    for name in names:
        if words is not None and name in words:
            continue
        known = False
        for desc in scoped:
            if desc.get("id") == name or (_patch_lower(desc.get("group")) != "" and _patch_lower(desc.get("group")) == name.lower()):
                known = True
                break
        if not known:
            say("warn", "ce.patch." + verb + ": the profile has no parameter or group \"" + name + "\" in this scope, in " + what + "; the rest goes ahead.")

def _patch_choose(scoped, opts, say, verb, for_apply):
    groups = _patch_names(_patch_opt(opts, "groups"))
    only = _patch_names(_patch_opt(opts, "only"))
    exc = _patch_names(_patch_opt(opts, "except"))
    include = _patch_names(_patch_opt(opts, "include"))
    _patch_warn_unknown(scoped, groups, "groups", verb, say, None)
    _patch_warn_unknown(scoped, only, "only", verb, say, None)
    _patch_warn_unknown(scoped, exc, "except", verb, say, None)
    _patch_warn_unknown(scoped, include, "include", verb, say, ["name", "readOnly", "leaveOut"])
    _patch_warn_unknown(scoped, _patch_names(_patch_opt(opts, "lock")), "lock", verb, say, None)
    chosen = []
    for desc in scoped:
        included = _patch_matches(desc, include)
        if not for_apply and not included:
            if _patch_kind(desc) == "text" and "name" not in include:
                continue
            if not _patch_writable(desc) and "readOnly" not in include:
                continue
        if (groups or only) and not _patch_matches(desc, groups) and desc.get("id") not in only:
            continue
        if _patch_matches(desc, exc):
            continue
        chosen.append(str(desc.get("id")))
    if not chosen and (groups or only):
        say("error", "ce.patch." + verb + ": groups and only leave no parameter chosen, so nothing was done.")
        return None
    return chosen

def _patch_locked(scoped, opts):
    lock = _patch_names(_patch_opt(opts, "lock"))
    return [str(desc.get("id")) for desc in scoped if _patch_matches(desc, lock)]

def _patch_by_id(scoped):
    return {str(desc.get("id")): desc for desc in scoped}

def _patch_is(p):
    return isinstance(p, dict) and isinstance(p.get("values"), dict)

def _patch_make(base, values, scoped, source):
    missing = [str(desc.get("id")) for desc in scoped if _patch_kind(desc) != "action" and not _patch_has(values, str(desc.get("id")))]
    name_id = _patch_name_parameter(scoped)
    b = base if isinstance(base, dict) else {}
    patch = {
        "device": _patch_str(b.get("device")),
        "role": _patch_str(b.get("role")) if b.get("role") is not None else "mainSynth",
        "scope": _patch_str(b.get("scope")) if b.get("scope") is not None else "voice",
        "values": values,
        "missing": missing,
        "source": source,
    }
    if name_id != "" and _patch_has(values, name_id):
        patch["name"] = _patch_text(values[name_id])
    elif isinstance(b.get("name"), str):
        patch["name"] = b["name"]
    return patch

def _patch_same_patches(a, b, verb, what, say):
    if not _patch_is(a) or not _patch_is(b):
        say("error", "ce.patch." + verb + ": " + what + " must be patches, as ce.patch.current() gives them, so nothing was done.")
        return False
    if _patch_str(a.get("device")) != _patch_str(b.get("device")) or _patch_str(a.get("scope")) != _patch_str(b.get("scope")):
        say("error", "ce.patch." + verb + ": a patch of " + _patch_str(b.get("device")) + " (" + _patch_str(b.get("scope")) + ") cannot be used with one of " + _patch_str(a.get("device")) + " (" + _patch_str(a.get("scope")) + "), so nothing was done.")
        return False
    return True

def _patch_clamp01(v):
    n = _patch_num(v)
    if not _patch_finite(n):
        return float("nan")
    return 0 if n < 0 else 1 if n > 1 else n

def _patch_morph(a, b, t, scoped, opts, say):
    if not _patch_same_patches(a, b, "morph", "a and b", say):
        return None
    at = _patch_clamp01(t)
    if _patch_math.isnan(at):
        say("error", "ce.patch.morph: t must be a number from 0 to 1, so nothing was done.")
        return None
    switch_at = _patch_clamp01(_patch_opt(opts, "switchAt"))
    if _patch_math.isnan(switch_at):
        switch_at = 0.5
    ids = _patch_choose(scoped, opts, say, "morph", False)
    if ids is None:
        return None
    locked = _patch_locked(scoped, opts)
    descs = _patch_by_id(scoped)
    out = _patch_copy(a["values"])
    for k, v in b["values"].items():
        if not _patch_has(out, k) and v is not None:
            out[k] = v
    for i in ids:
        if i in locked or not _patch_has(a["values"], i) or not _patch_has(b["values"], i):
            continue
        desc = descs.get(i)
        kind = _patch_kind(desc)
        if kind == "number":
            x = _patch_num(a["values"][i])
            y = _patch_num(b["values"][i])
            if _patch_finite(x) and _patch_finite(y):
                out[i] = _patch_settle(desc, x + (y - x) * at)
        elif kind == "choice":
            out[i] = a["values"][i] if at < switch_at else b["values"][i]
    return _patch_make(a, out, scoped, "made")

def _patch_blend(patches, weights, scoped, opts, say):
    if not isinstance(patches, (list, tuple)) or len(patches) < 2:
        say("error", "ce.patch.blend: patches must be a list of two or more patches, so nothing was done.")
        return None
    for i in range(1, len(patches)):
        if not _patch_same_patches(patches[0], patches[i], "blend", "patches", say):
            return None
    w = []
    total = 0
    for i in range(len(patches)):
        n = _patch_num(weights[i]) if isinstance(weights, (list, tuple)) and i < len(weights) else float("nan")
        v = n if _patch_finite(n) and n > 0 else 0
        w.append(v)
        total += v
    if not total > 0:
        say("error", "ce.patch.blend: the weights add up to 0 or less, so nothing was done.")
        return None
    ids = _patch_choose(scoped, opts, say, "blend", False)
    if ids is None:
        return None
    locked = _patch_locked(scoped, opts)
    descs = _patch_by_id(scoped)
    out = _patch_copy(patches[0]["values"])
    for p in patches[1:]:
        for k, v in p["values"].items():
            if not _patch_has(out, k) and v is not None:
                out[k] = v
    for i in ids:
        if i in locked:
            continue
        desc = descs.get(i)
        kind = _patch_kind(desc)
        if kind == "number":
            total_v = 0
            weight = 0
            for j, p in enumerate(patches):
                x = _patch_num(p["values"].get(i))
                if not _patch_finite(x) or w[j] <= 0:
                    continue
                total_v += x * w[j]
                weight += w[j]
            if weight > 0:
                out[i] = _patch_settle(desc, total_v / weight)
        elif kind == "choice":
            best = -1
            for j, p in enumerate(patches):
                if not _patch_has(p["values"], i) or w[j] <= 0:
                    continue
                if best < 0 or w[j] > w[best]:
                    best = j
            if best >= 0:
                out[i] = patches[best]["values"][i]
    return _patch_make(patches[0], out, scoped, "made")

def _patch_random_source(seed):
    n = _patch_num(seed)
    x = int(_patch_math.floor(n)) % 4294967296 if _patch_finite(n) else 0
    if x == 0:
        x = _PATCH_DEFAULT_SEED
    state = [x]
    def nxt():
        s = state[0]
        s = (s ^ ((s << 13) & 0xFFFFFFFF)) & 0xFFFFFFFF
        s = (s ^ (s >> 17)) & 0xFFFFFFFF
        s = (s ^ ((s << 5) & 0xFFFFFFFF)) & 0xFFFFFFFF
        state[0] = s
        return s / 4294967296
    return nxt

def _patch_within(desc, within):
    lo, hi = _patch_range(desc)
    narrow = within.get(str(desc.get("id"))) if isinstance(within, dict) else None
    if isinstance(narrow, (list, tuple)) and len(narrow) >= 2:
        a = _patch_num(narrow[0])
        b = _patch_num(narrow[1])
        if _patch_finite(a) and _patch_finite(b):
            low = max(lo, min(a, b))
            high = min(hi, max(a, b))
            if low <= high:
                lo, hi = low, high
    return lo, hi

def _patch_random(frm, scoped, opts, nxt, say):
    if not _patch_is(frm):
        say("error", "ce.patch.random: from must be a patch, as ce.patch.current() gives them, so nothing was done.")
        return None
    ids = _patch_choose(scoped, opts, say, "random", False)
    if ids is None:
        return None
    locked = _patch_locked(scoped, opts)
    descs = _patch_by_id(scoped)
    within = _patch_opt(opts, "within")
    out = _patch_copy(frm["values"])
    for i in ids:
        if i in locked:
            continue
        desc = descs.get(i)
        kind = _patch_kind(desc)
        if kind == "number":
            lo, hi = _patch_within(desc, within)
            r = nxt()
            if _patch_whole(desc):
                out[i] = min(_patch_math.floor(hi), _patch_math.ceil(lo) + _patch_math.floor(r * (_patch_math.floor(hi) - _patch_math.ceil(lo) + 1)))
            else:
                out[i] = lo + r * (hi - lo)
        elif kind == "choice":
            choices = _patch_choices(desc)
            r = nxt()
            if choices:
                out[i] = choices[min(len(choices) - 1, _patch_math.floor(r * len(choices)))]
    return _patch_make(frm, out, scoped, "made")

def _patch_mutate(patch, amount, scoped, opts, nxt, say):
    if not _patch_is(patch):
        say("error", "ce.patch.mutate: patch must be a patch, as ce.patch.current() gives them, so nothing was done.")
        return None
    by = _patch_clamp01(amount)
    if _patch_math.isnan(by):
        say("error", "ce.patch.mutate: amount must be a number from 0 to 1, so nothing was done.")
        return None
    ids = _patch_choose(scoped, opts, say, "mutate", False)
    if ids is None:
        return None
    locked = _patch_locked(scoped, opts)
    descs = _patch_by_id(scoped)
    out = _patch_copy(patch["values"])
    for i in ids:
        if i in locked or not _patch_has(out, i):
            continue
        desc = descs.get(i)
        kind = _patch_kind(desc)
        if kind == "number":
            x = _patch_num(out[i])
            if not _patch_finite(x):
                continue
            lo, hi = _patch_range(desc)
            r1 = nxt()
            r2 = nxt()
            out[i] = _patch_settle(desc, x + (r1 - r2) * by * (hi - lo))
        elif kind == "choice":
            r1 = nxt()
            r2 = nxt()
            if r1 >= by:
                continue
            others = [c for c in _patch_choices(desc) if not _patch_same(desc, c, out[i])]
            if others:
                out[i] = others[min(len(others) - 1, _patch_math.floor(r2 * len(others)))]
    return _patch_make(patch, out, scoped, "made")

def _patch_merge(base, other, scoped, opts, say):
    if not _patch_same_patches(base, other, "merge", "base and other", say):
        return None
    if not _patch_names(_patch_opt(opts, "groups")) and not _patch_names(_patch_opt(opts, "only")):
        say("error", "ce.patch.merge: name the parameters to take, with groups or only; taking every value is other itself, so nothing was done.")
        return None
    ids = _patch_choose(scoped, opts, say, "merge", False)
    if ids is None:
        return None
    locked = _patch_locked(scoped, opts)
    out = _patch_copy(base["values"])
    for i in ids:
        if i not in locked and _patch_has(other["values"], i):
            out[i] = other["values"][i]
    return _patch_make(base, out, scoped, "made")

def _patch_diff(a, b, scoped, opts, say):
    if not _patch_same_patches(a, b, "diff", "a and b", say):
        return None
    ids = _patch_choose(scoped, opts, say, "diff", False)
    if ids is None:
        return None
    descs = _patch_by_id(scoped)
    out = []
    for i in ids:
        in_a = _patch_has(a["values"], i)
        in_b = _patch_has(b["values"], i)
        if not in_a and not in_b:
            continue
        if in_a and in_b and _patch_same(descs.get(i), a["values"][i], b["values"][i]):
            continue
        desc = descs.get(i) or {}
        entry = {"id": i, "name": _patch_str(desc.get("name")) if desc.get("name") is not None else i, "group": _patch_str(desc.get("group"))}
        if in_a:
            entry["from"] = a["values"][i]
        if in_b:
            entry["to"] = b["values"][i]
        out.append(entry)
    return out

def _patch_apply_plan(patch, known, scoped, opts, say):
    ids = _patch_choose(scoped, opts, say, "apply", True)
    if ids is None:
        return None
    descs = _patch_by_id(scoped)
    changed_only = _patch_opt(opts, "changedOnly") is not False
    send = []
    values = {}
    skipped = []
    for i in ids:
        if not _patch_has(patch["values"], i):
            continue
        value = patch["values"][i]
        values[i] = value
        if not _patch_writable(descs.get(i)):
            skipped.append({"id": i, "why": "the synth cannot be sent it"})
            continue
        if changed_only and _patch_has(known, i) and _patch_same(descs.get(i), known[i], value):
            continue
        send.append([i, value])
    for key in sorted(patch["values"].keys()):
        if key not in descs:
            skipped.append({"id": key, "why": "not a parameter of this scope"})
    return {"send": send, "values": values, "skipped": skipped}

def _patch_live_plan(send, known, scoped, budget):
    descs = _patch_by_id(scoped)
    moved = []
    for i, entry in enumerate(send):
        pid, value = entry[0], entry[1]
        lo, hi = _patch_range(descs.get(pid))
        x = _patch_num(value)
        y = _patch_num(known.get(pid))
        delta = abs(x - y) / ((hi - lo) or 1) if _patch_finite(x) and _patch_finite(y) else 2
        moved.append((delta, i))
    moved.sort(key=lambda m: (-m[0], m[1]))
    now = [send[m[1]] for k, m in enumerate(moved) if k < budget]
    later = [send[m[1]] for k, m in enumerate(moved) if k >= budget]
    return now, later

def _patch_list_of_scopes(section):
    scopes = section.get("scopes") if isinstance(section, dict) else None
    if not isinstance(scopes, (list, tuple)):
        return []
    return [s for s in scopes if isinstance(s, dict) and isinstance(s.get("id"), str) and s.get("id") != ""]

class _PatchCommands:
    """The commands over a host, as patchCore.js's patchCommands."""

    def __init__(self, host):
        self.host = host
        self.say = host["say"]
        self.defined = {}
        self.waiting = {}

    def context(self, role):
        r = role if isinstance(role, str) and role != "" else "mainSynth"
        profile = self.host["profile"](r)
        if not isinstance(profile, dict) or not isinstance(profile.get("id"), str) or profile.get("id") == "":
            return {"role": r, "device": "panel", "params": None, "section": None}
        params = self.host["parameters"](r)
        section = self.host["patchSection"](r)
        return {"role": r, "device": profile["id"], "params": params if isinstance(params, (list, tuple)) else [],
                "section": section if isinstance(section, dict) else None}

    def scope_defs(self, ctx):
        defs = {}
        for s in _patch_list_of_scopes(ctx["section"]):
            defs[s["id"]] = s
        own = self.defined.get(ctx["role"])
        if own:
            for k, v in own.items():
                defs[k] = v
        return defs

    def panel_descriptors(self, values):
        out = []
        for name in sorted((values or {}).keys()):
            v = values[name]
            t = "boolean" if isinstance(v, bool) else "float" if isinstance(v, (int, float)) else "text"
            out.append({"id": name, "name": name, "group": "", "type": t})
        return out

    def scoped(self, ctx, scope, verb):
        if ctx["params"] is None:
            if scope != "voice":
                self.say("error", "ce.patch." + verb + ": a panel without a device profile has one scope, \"voice\", so nothing was done.")
                return None
            return self.panel_descriptors(self.host["snapshot"]())
        lst = _patch_scope_params(ctx["params"], scope, self.scope_defs(ctx))
        if lst is None:
            self.say("error", "ce.patch." + verb + ": \"" + str(scope) + "\" is not a scope of " + ctx["device"] + ", so nothing was done. ce.patch.scopes() lists them.")
        return lst

    def for_patch(self, patch, verb):
        if not _patch_is(patch):
            self.say("error", "ce.patch." + verb + ": that is not a patch, as ce.patch.current() gives them, so nothing was done.")
            return None
        ctx = self.context(patch.get("role") if isinstance(patch.get("role"), str) else "mainSynth")
        if _patch_str(patch.get("device")) != ctx["device"]:
            self.say("error", "ce.patch." + verb + ": the patch is one of " + _patch_str(patch.get("device")) + ", and this panel's synth is " + ctx["device"] + ", so nothing was done.")
            return None
        lst = self.scoped(ctx, _patch_str(patch.get("scope")) if patch.get("scope") is not None else "voice", verb)
        if lst is None:
            return None
        return ctx, lst

    @staticmethod
    def scope_of(scope, opts):
        if isinstance(scope, str) and scope != "":
            return scope
        from_opts = _patch_opt(opts, "scope")
        return from_opts if isinstance(from_opts, str) and from_opts != "" else "voice"

    def current(self, scope=None, opts=None):
        ctx = self.context(_patch_opt(opts, "role"))
        sid = self.scope_of(scope, opts)
        lst = self.scoped(ctx, sid, "current")
        if lst is None:
            return None
        narrowed = bool(_patch_names(_patch_opt(opts, "groups")) or _patch_names(_patch_opt(opts, "only")) or _patch_names(_patch_opt(opts, "except")))
        ids = None
        if narrowed:
            ids = _patch_choose(lst, opts, self.say, "current", True)
            if ids is None:
                return None
        if ctx["params"] is None:
            values = _patch_copy(self.host["snapshot"]())
            if ids is not None:
                values = {k: v for k, v in values.items() if k in ids}
        else:
            values = {}
            for desc in lst:
                pid = str(desc.get("id"))
                if ids is not None and pid not in ids:
                    continue
                v = self.host["read"](pid, ctx["role"])
                if v is not None:
                    values[pid] = v
        return _patch_make({"device": ctx["device"], "role": ctx["role"], "scope": sid}, values, lst, "panel")

    def seeded(self, opts, verb):
        seed = _patch_opt(opts, "seed")
        if seed is not None:
            if not _patch_finite(_patch_num(seed)):
                self.say("error", "ce.patch." + verb + ": seed must be a number, so nothing was done.")
                return None
            return _patch_random_source(seed)
        return _patch_random_source(_patch_math.floor(self.host["random"]() * 4294967296))

    def known_values(self, ctx, lst):
        known = {}
        if ctx["params"] is None:
            return known
        for desc in lst:
            v = self.host["read"](str(desc.get("id")), ctx["role"])
            if v is not None:
                known[str(desc.get("id"))] = v
        return known

    def scope_dumps(self, ctx, scope):
        d = self.scope_defs(ctx).get(scope)
        return _patch_names(d.get("dumps")) if d else []

    def apply(self, patch, opts=None):
        refused = {"ok": False, "via": "none", "applied": 0, "sent": 0, "skipped": []}
        at = self.for_patch(patch, "apply")
        if at is None:
            return refused
        ctx, lst = at
        scope = _patch_str(patch.get("scope")) if patch.get("scope") is not None else "voice"
        send = _patch_opt(opts, "send")
        if send is None:
            send = "auto"
        if send not in _PATCH_SEND_MODES:
            self.say("error", "ce.patch.apply: send \"" + _patch_str(send) + "\" is not one of \"auto\", \"parameters\", \"dump\" or \"none\", so nothing was done.")
            return refused
        known = self.known_values(ctx, lst)
        plan = _patch_apply_plan(patch, known, lst, opts, self.say)
        if plan is None:
            return refused
        applied = len(plan["values"])
        if ctx["params"] is None:
            self.host["restore"](plan["values"])
            return {"ok": True, "via": "none", "applied": applied, "sent": 0, "skipped": plan["skipped"]}
        dumps = self.scope_dumps(ctx, scope)
        section = ctx["section"]
        deliver = section.get("deliver") if isinstance(section, dict) and isinstance(section.get("deliver"), str) else ""
        via = send
        if send == "auto":
            via = "dump" if deliver == "dump" and dumps else "parameters"
        if via == "dump" and not dumps:
            self.say("error", "ce.patch.apply: " + ctx["device"] + " has no dumps for the \"" + scope + "\" scope, so it cannot take a patch as a dump, and nothing was done.")
            return refused
        self.host["fill"](plan["values"])
        if via == "none":
            return {"ok": True, "via": via, "applied": applied, "sent": 0, "skipped": plan["skipped"]}
        if via == "dump":
            for kind in dumps:
                self.host["sendDump"](kind)
            return {"ok": True, "via": via, "applied": applied, "sent": len(dumps), "skipped": plan["skipped"]}
        key = ctx["role"] + "\0" + scope
        to_send = plan["send"]
        if _patch_opt(opts, "live") is True:
            now, later = _patch_live_plan(plan["send"], known, lst, _PATCH_LIVE_BUDGET)
            to_send = now
            self.waiting[key] = later
        else:
            later = self.waiting.pop(key, [])
            planned = {entry[0] for entry in to_send}
            to_send = list(to_send) + [entry for entry in later if entry[0] not in planned]
        sent = 0
        skipped = list(plan["skipped"])
        for pid, value in to_send:
            if self.host["write"](pid, value, ctx["role"]) is True:
                sent += 1
            else:
                skipped.append({"id": pid, "why": "not sent"})
        return {"ok": True, "via": via, "applied": applied, "sent": sent, "skipped": skipped}

    def read(self, scope, fn, opts=None):
        ctx = self.context(_patch_opt(opts, "role"))
        sid = scope if isinstance(scope, str) and scope != "" else "voice"
        if not callable(fn):
            self.say("error", "ce.patch.read: fn must be a function to call with the patch, so nothing was asked.")
            return False
        if self.scoped(ctx, sid, "read") is None:
            return False
        dumps = [] if ctx["params"] is None else self.scope_dumps(ctx, sid)
        if not dumps:
            self.say("error", "ce.patch.read: the \"" + sid + "\" scope has no dumps to ask the synth for, so it cannot be read. ce.patch.define() can name them.")
            return False
        state = {"ok": True, "at": 0}
        timeout = _patch_num(_patch_opt(opts, "timeout"))
        dump_opts = {"timeout": timeout} if _patch_finite(timeout) and timeout > 0 else None

        def nxt():
            if state["at"] >= len(dumps):
                patch = self.current(sid, {"role": ctx["role"]})
                fn(patch, {"ok": state["ok"], "missing": patch["missing"] if patch else []})
                return
            kind = dumps[state["at"]]
            state["at"] += 1

            def answered(values=None, answer=None):
                if not isinstance(answer, dict) or answer.get("ok") is not True:
                    state["ok"] = False
                nxt()
            asked = self.host["requestDump"](kind, answered, dump_opts)
            if asked is False:
                state["ok"] = False
                nxt()
        nxt()
        return True

    def scopes(self, role=None):
        ctx = self.context(role)
        if ctx["params"] is None:
            return [{"id": "voice", "name": "Voice", "parameters": len(self.host["snapshot"]() or {}), "canRead": False, "canSend": True, "via": "none"}]
        defs = self.scope_defs(ctx)
        ids = [] if "voice" in defs else ["voice"]
        for s in _patch_list_of_scopes(ctx["section"]):
            if s["id"] not in ids:
                ids.append(s["id"])
        for sid in sorted((self.defined.get(ctx["role"]) or {}).keys()):
            if sid not in ids:
                ids.append(sid)
        section = ctx["section"]
        deliver = section.get("deliver") if isinstance(section, dict) and isinstance(section.get("deliver"), str) else ""
        out = []
        for sid in ids:
            lst = _patch_scope_params(ctx["params"], sid, defs)
            if lst is None or (len(lst) == 0 and sid not in defs):
                continue
            dumps = _patch_names(defs[sid].get("dumps")) if sid in defs else []
            name = defs[sid]["name"] if sid in defs and isinstance(defs[sid].get("name"), str) else sid[:1].upper() + sid[1:]
            out.append({"id": sid, "name": name, "parameters": len(lst), "canRead": len(dumps) > 0, "canSend": True,
                        "via": "dump" if deliver == "dump" and dumps else "parameters"})
        if "system" not in defs:
            system = _patch_scope_params(ctx["params"], "system", defs)
            if system:
                out.append({"id": "system", "name": "System", "parameters": len(system), "canRead": False, "canSend": True, "via": "parameters"})
        return out

    def define(self, scope, spec, role=None):
        if not isinstance(scope, str) or scope == "":
            self.say("error", "ce.patch.define: scope must be a name, such as \"voice\", so nothing was defined.")
            return False
        if not isinstance(spec, dict):
            self.say("error", "ce.patch.define: spec must be a table of groups, only, except and dumps, so nothing was defined.")
            return False
        for key in sorted(spec.keys()):
            if key not in _PATCH_DEFINE_FIELDS:
                self.say("error", "ce.patch.define: \"" + key + "\" is not one of the fields a scope takes (" + ", ".join(_PATCH_DEFINE_FIELDS) + "), so nothing was defined.")
                return False
        for key in ("groups", "only", "except", "dumps"):
            v = spec.get(key)
            if v is not None and not isinstance(v, (str, list, tuple)):
                self.say("error", "ce.patch.define: " + key + " must be a list of names, so nothing was defined.")
                return False
        r = role if isinstance(role, str) and role != "" else "mainSynth"
        d = {"id": scope}
        d.update(spec)
        self.defined.setdefault(r, {})[scope] = d
        return True

    @staticmethod
    def store_key(device, name):
        return _PATCH_STORE_PREFIX + device + ":" + _patch_lower(name)

    def save(self, name, patch, opts=None):
        if not isinstance(name, str) or name.strip() == "" or len(name) > 64:
            self.say("error", "ce.patch.save: name must be text of 1 to 64 characters, so nothing was kept.")
            return False
        if not _patch_is(patch):
            self.say("error", "ce.patch.save: that is not a patch, as ce.patch.current() gives them, so nothing was kept.")
            return False
        key = self.store_key(_patch_str(patch.get("device")), name)
        if _patch_opt(opts, "replace") is False and self.host["store"]["get"](key) is not None:
            self.say("error", "ce.patch.save: a patch called \"" + name + "\" is already kept, and replace is off, so nothing was kept.")
            return False
        return self.host["store"]["set"](key, {
            "name": name, "device": _patch_str(patch.get("device")),
            "role": _patch_str(patch.get("role")) if patch.get("role") is not None else "mainSynth",
            "scope": _patch_str(patch.get("scope")) if patch.get("scope") is not None else "voice",
            "savedAt": _patch_str(self.host["now"]()), "values": _patch_copy(patch.get("values")),
        }) is not False

    def load(self, name, opts=None):
        ctx = self.context(_patch_opt(opts, "role"))
        record = self.host["store"]["get"](self.store_key(ctx["device"], _patch_str(name)))
        if not isinstance(record, dict):
            for key in sorted(self.host["store"]["keys"]() or []):
                if not key.startswith(_PATCH_STORE_PREFIX) or key[key.rfind(":") + 1:] != _patch_lower(name):
                    continue
                other = self.host["store"]["get"](key)
                if isinstance(other, dict):
                    self.say("error", "ce.patch.load: \"" + _patch_str(name) + "\" was kept for " + _patch_str(other.get("device")) + ", and this panel's synth is " + ctx["device"] + ", so there is no patch.")
                    return None
            self.say("error", "ce.patch.load: no patch called \"" + _patch_str(name) + "\" is kept for " + ctx["device"] + ", so there is no patch.")
            return None
        scope = record["scope"] if isinstance(record.get("scope"), str) else "voice"
        lst = self.scoped(ctx, scope, "load") or []
        patch = _patch_make({"device": ctx["device"], "role": ctx["role"], "scope": scope, "name": record.get("name")}, _patch_copy(record.get("values")), lst, "library")
        patch["name"] = _patch_str(record.get("name")) if record.get("name") is not None else _patch_str(name)
        return patch

    def list(self, opts=None):
        ctx = self.context(_patch_opt(opts, "role"))
        scope = _patch_opt(opts, "scope")
        prefix = _PATCH_STORE_PREFIX + ctx["device"] + ":"
        out = []
        for key in self.host["store"]["keys"]() or []:
            if not key.startswith(prefix):
                continue
            record = self.host["store"]["get"](key)
            if not isinstance(record, dict):
                continue
            if isinstance(scope, str) and scope != "" and record.get("scope") != scope:
                continue
            out.append({"name": _patch_str(record.get("name")), "scope": _patch_str(record.get("scope")) if record.get("scope") is not None else "voice", "savedAt": _patch_str(record.get("savedAt"))})
        out.sort(key=lambda e: e["name"])
        out.sort(key=lambda e: e["savedAt"], reverse=True)
        return out

    def forget(self, name, opts=None):
        ctx = self.context(_patch_opt(opts, "role"))
        key = self.store_key(ctx["device"], _patch_str(name))
        if self.host["store"]["get"](key) is None:
            return False
        self.host["store"]["remove"](key)
        return True

    def write(self, patch, slot, opts=None):
        at = self.for_patch(patch, "write")
        if at is None:
            return {"ok": False, "slot": slot, "error": "not a patch of this synth"}
        ctx = at[0]
        section = ctx["section"]
        how = section.get("write") if isinstance(section, dict) and isinstance(section.get("write"), dict) else None
        n = _patch_num(slot)
        if not _patch_finite(n) or n < 0 or _patch_math.floor(n) != n:
            self.say("error", "ce.patch.write: slot must be a whole number from 0, so nothing was stored.")
            return {"ok": False, "slot": slot, "error": "not a slot"}
        n = int(n)
        if not how or how.get("via") != "dump" or not isinstance(how.get("dump"), str) or how.get("dump") == "":
            why = ("its profile stores a slot with a write command, which ce.patch cannot send yet"
                   if how and how.get("via") == "command" else "its profile does not say how to store a slot (patch.write)")
            self.say("error", "ce.patch.write: " + ctx["device"] + " cannot be written to: " + why + ", so nothing was stored.")
            return {"ok": False, "slot": n, "error": why}
        self.host["setVariable"]("slot", n, ctx["role"])
        self.host["fill"](_patch_copy(patch.get("values")))
        self.host["sendDump"](how["dump"])
        return {"ok": True, "slot": n}

    def morph(self, a, b, t, opts=None):
        at = self.for_patch(a, "morph")
        return None if at is None else _patch_morph(a, b, t, at[1], opts, self.say)

    def blend(self, patches, weights, opts=None):
        first = patches[0] if isinstance(patches, (list, tuple)) and patches else None
        at = self.for_patch(first, "blend")
        return None if at is None else _patch_blend(patches, weights, at[1], opts, self.say)

    def random(self, opts=None):
        frm = _patch_opt(opts, "from")
        base = frm if frm is not None else self.current(_patch_opt(opts, "scope"), {"role": _patch_opt(opts, "role")})
        if base is None:
            return None
        at = self.for_patch(base, "random")
        if at is None:
            return None
        if at[0]["params"] is None:
            self.say("error", "ce.patch.random: a panel without a device profile does not say each control's range, so nothing was drawn.")
            return None
        nxt = self.seeded(opts, "random")
        return None if nxt is None else _patch_random(base, at[1], opts, nxt, self.say)

    def mutate(self, patch, amount, opts=None):
        at = self.for_patch(patch, "mutate")
        if at is None:
            return None
        if at[0]["params"] is None:
            self.say("error", "ce.patch.mutate: a panel without a device profile does not say each control's range, so nothing was changed.")
            return None
        nxt = self.seeded(opts, "mutate")
        return None if nxt is None else _patch_mutate(patch, amount, at[1], opts, nxt, self.say)

    def merge(self, base, other, opts=None):
        at = self.for_patch(base, "merge")
        return None if at is None else _patch_merge(base, other, at[1], opts, self.say)

    def diff(self, a, b, opts=None):
        at = self.for_patch(a, "diff")
        return None if at is None else _patch_diff(a, b, at[1], opts, self.say)

    def equal(self, a, b, opts=None):
        at = self.for_patch(a, "equal")
        if at is None:
            return None
        d = _patch_diff(a, b, at[1], opts, self.say)
        return None if d is None else len(d) == 0

def _patch_now():
    t = __deviceQuery("now", None)
    return t if isinstance(t, str) else ""

# The host looks each global up when it is called, so the real one answers whatever replaced it.
_PATCH = _PatchCommands({
    "say": lambda level, text: logWarn(text) if level == "warn" else logError(text),
    "profile": lambda role: __deviceQuery("profile", {"role": role}),
    "parameters": lambda role: __deviceQuery("parameters", {"role": role}) or [],
    "read": lambda pid, role: __deviceQuery("read", {"role": role, "id": str(pid)}),
    "write": lambda pid, value, role: deviceWrite(pid, value, role) is True,
    "fill": lambda values: applyDump(values),
    "snapshot": lambda: panelSnapshot() or {},
    "restore": lambda values: panelRestore(values),
    "requestDump": lambda kind, fn, opts: requestDump(kind, fn, opts),
    "sendDump": lambda kind: sendDump(kind),
    "setVariable": lambda name, value, role: deviceSetVariable(name, value, role),
    "patchSection": lambda role: __deviceQuery("patch", {"role": role}),
    "random": lambda: random(),
    "now": lambda: _patch_now(),
    "store": {
        "get": lambda key: loadSetting(key),
        "set": lambda key, value: saveSetting(key, value),
        "keys": lambda: listSettings() or [],
        "remove": lambda key: forgetSetting(key),
    },
})

def patchCurrent(scope=None, opts=None):
    return _PATCH.current(scope, opts)
def patchRead(scope, fn, opts=None):
    return _PATCH.read(scope, fn, opts)
def patchLoad(name, opts=None):
    return _PATCH.load(name, opts)
def patchMorph(a, b, t, opts=None):
    return _PATCH.morph(a, b, t, opts)
def patchBlend(patches, weights, opts=None):
    return _PATCH.blend(patches, weights, opts)
def patchRandom(opts=None):
    return _PATCH.random(opts)
def patchMutate(patch, amount, opts=None):
    return _PATCH.mutate(patch, amount, opts)
def patchMerge(base, other, opts=None):
    return _PATCH.merge(base, other, opts)
def patchDiff(a, b, opts=None):
    return _PATCH.diff(a, b, opts)
def patchEqual(a, b, opts=None):
    return _PATCH.equal(a, b, opts)
def patchApply(patch, opts=None):
    return _PATCH.apply(patch, opts)
def patchSave(name, patch, opts=None):
    return _PATCH.save(name, patch, opts)
def patchList(opts=None):
    return _PATCH.list(opts)
def patchForget(name, opts=None):
    return _PATCH.forget(name, opts)
def patchWrite(patch, slot, opts=None):
    return _PATCH.write(patch, slot, opts)
def patchScopes(role=None):
    return _PATCH.scopes(role)
def patchDefine(scope, spec, role=None):
    return _PATCH.define(scope, spec, role)

# @module ce.music
__NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
def __m12(n):
    import math
    return (math.floor(n) % 12 + 12) % 12
# A flat lowers below the LETTER, so Cb is the B under C - one octave down, not up.
__FLAT_LETTER = { "C": 11, "D": 1, "E": 3, "F": 4, "G": 6, "A": 8, "B": 10 }
# Two spellings, chosen by whether the second argument is there at all. Omitted: this module's
# plain-ASCII names (C#4), what noteNumber has always round-tripped. Given: the PANEL's names, from
# the same generated table the Chord Pad and Harmoniser print from - True "E♭4", False "C♯4".
def noteName(n, flats=None):
    import math; n = math.floor(n)
    tbl = __NOTES if flats is None else (__CE_NOTE_FLAT if flats else __CE_NOTE_SHARP)
    return tbl[__m12(n)] + str(math.floor(n / 12) - 1)
# Reads all four spellings: C4, C#4, C♯4, Db4, D♭4. An unreadable name is None, not 0 - 0 is a
# real MIDI note (C-1), so returning it for "Eb4" meant a typo played a wrong note in silence.
def noteNumber(name):
    import re
    m = re.match(r"^([A-G])([#b]?)(-?\d+)$", str(name).replace("\u266f", "#").replace("\u266d", "b"))
    if not m: return None
    letter, acc = m.group(1), m.group(2)
    if acc == "b":
        pc = __FLAT_LETTER[letter]
    else:
        pc = __NOTES.index(letter + acc) if (letter + acc) in __NOTES else -1
    if pc < 0: return None
    return (int(m.group(3)) + (0 if (acc == "b" and letter == "C") else 1)) * 12 + pc

# BEGIN GENERATED music tables — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
# @module ce.music
__CE_SCALES = {}
__CE_SCALES["major"] = [0,2,4,5,7,9,11]
__CE_SCALES["minor"] = [0,2,3,5,7,8,10]
__CE_SCALES["harmonicMinor"] = [0,2,3,5,7,8,11]
__CE_SCALES["melodicMinor"] = [0,2,3,5,7,9,11]
__CE_SCALES["dorian"] = [0,2,3,5,7,9,10]
__CE_SCALES["phrygian"] = [0,1,3,5,7,8,10]
__CE_SCALES["lydian"] = [0,2,4,6,7,9,11]
__CE_SCALES["mixolydian"] = [0,2,4,5,7,9,10]
__CE_SCALES["locrian"] = [0,1,3,5,6,8,10]
__CE_SCALES["pentatonicMaj"] = [0,2,4,7,9]
__CE_SCALES["pentatonicMin"] = [0,3,5,7,10]
__CE_SCALES["blues"] = [0,3,5,6,7,10]
__CE_CHORDS = {}
__CE_CHORDS["major"] = [0,4,7]
__CE_CHORDS["minor"] = [0,3,7]
__CE_CHORDS["dim"] = [0,3,6]
__CE_CHORDS["aug"] = [0,4,8]
__CE_CHORDS["sus2"] = [0,2,7]
__CE_CHORDS["sus4"] = [0,5,7]
__CE_CHORDS["power"] = [0,7]
__CE_CHORDS["maj6"] = [0,4,7,9]
__CE_CHORDS["min6"] = [0,3,7,9]
__CE_CHORDS["dom7"] = [0,4,7,10]
__CE_CHORDS["maj7"] = [0,4,7,11]
__CE_CHORDS["min7"] = [0,3,7,10]
__CE_CHORDS["minMaj7"] = [0,3,7,11]
__CE_CHORDS["dim7"] = [0,3,6,9]
__CE_CHORDS["m7b5"] = [0,3,6,10]
__CE_CHORDS["aug7"] = [0,4,8,10]
__CE_CHORDS["add9"] = [0,4,7,14]
__CE_CHORDS["dom9"] = [0,4,7,10,14]
__CE_CHORDS["maj9"] = [0,4,7,11,14]
__CE_CHORDS["min9"] = [0,3,7,10,14]
__CE_NOTE_SHARP = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"]
__CE_NOTE_FLAT = ["C","D♭","D","E♭","E","F","G♭","G","A♭","A","B♭","B"]
__CE_FLAT_KEYS = {}
__CE_FLAT_KEYS[5] = True
__CE_FLAT_KEYS[10] = True
__CE_FLAT_KEYS[3] = True
__CE_FLAT_KEYS[8] = True
__CE_FLAT_KEYS[1] = True
__CE_FLAT_KEYS[6] = True
__CE_MINOR_SCALES = {}
__CE_MINOR_SCALES["dorian"] = True
__CE_MINOR_SCALES["harmonicMinor"] = True
__CE_MINOR_SCALES["locrian"] = True
__CE_MINOR_SCALES["melodicMinor"] = True
__CE_MINOR_SCALES["minor"] = True
__CE_MINOR_SCALES["pentatonicMin"] = True
__CE_MINOR_SCALES["phrygian"] = True
__CE_QUALITY_SUFFIX = {}
__CE_QUALITY_SUFFIX["maj"] = ""
__CE_QUALITY_SUFFIX["min"] = "m"
__CE_QUALITY_SUFFIX["dim"] = "°"
__CE_QUALITY_SUFFIX["aug"] = "+"
__CE_QUALITY_SUFFIX["sus2"] = "sus2"
__CE_QUALITY_SUFFIX["sus4"] = "sus4"
__CE_QUALITY_SUFFIX["maj7"] = "maj7"
__CE_QUALITY_SUFFIX["dom7"] = "7"
__CE_QUALITY_SUFFIX["min7"] = "m7"
__CE_QUALITY_SUFFIX["m7b5"] = "m7♭5"
__CE_QUALITY_SUFFIX["dim7"] = "°7"
__CE_QUALITY_SUFFIX["minMaj7"] = "mMaj7"
__CE_ROMAN = ["I","II","III","IV","V","VI","VII"]
__CE_MINOR_QUALITIES = {}
__CE_MINOR_QUALITIES["dim"] = True
__CE_MINOR_QUALITIES["dim7"] = True
__CE_MINOR_QUALITIES["m7b5"] = True
__CE_MINOR_QUALITIES["min"] = True
__CE_MINOR_QUALITIES["min7"] = True
__CE_MINOR_QUALITIES["minMaj7"] = True
__CE_SCALE_NAMES = ["major","minor","harmonicMinor","melodicMinor","dorian","phrygian","lydian","mixolydian","locrian","pentatonicMaj","pentatonicMin","blues"]
__CE_CHORD_NAMES = ["major","minor","dim","aug","sus2","sus4","power","maj6","min6","dom7","maj7","min7","minMaj7","dim7","m7b5","aug7","add9","dom9","maj9","min9"]
# @module ce.time
__CE_DIVISIONS = {}
__CE_DIVISIONS["1/1"] = 4
__CE_DIVISIONS["1/2"] = 2
__CE_DIVISIONS["1/4"] = 1
__CE_DIVISIONS["1/8"] = 0.5
__CE_DIVISIONS["1/16"] = 0.25
__CE_DIVISIONS["1/32"] = 0.125
__CE_DIVISIONS["1/2D"] = 3
__CE_DIVISIONS["1/4D"] = 1.5
__CE_DIVISIONS["1/8D"] = 0.75
__CE_DIVISIONS["1/16D"] = 0.375
__CE_DIVISIONS["1/2T"] = 1.3333333333333333
__CE_DIVISIONS["1/4T"] = 0.6666666666666666
__CE_DIVISIONS["1/8T"] = 0.3333333333333333
__CE_DIVISIONS["1/16T"] = 0.16666666666666666
__CE_DIVISION_LABELS = {}
__CE_DIVISION_LABELS["1/1"] = "Whole"
__CE_DIVISION_LABELS["1/2"] = "Half"
__CE_DIVISION_LABELS["1/4"] = "Quarter"
__CE_DIVISION_LABELS["1/8"] = "8th"
__CE_DIVISION_LABELS["1/16"] = "16th"
__CE_DIVISION_LABELS["1/32"] = "32nd"
__CE_DIVISION_LABELS["1/2D"] = "Half ·"
__CE_DIVISION_LABELS["1/4D"] = "Quarter ·"
__CE_DIVISION_LABELS["1/8D"] = "8th ·"
__CE_DIVISION_LABELS["1/16D"] = "16th ·"
__CE_DIVISION_LABELS["1/2T"] = "Half T"
__CE_DIVISION_LABELS["1/4T"] = "Quarter T"
__CE_DIVISION_LABELS["1/8T"] = "8th T"
__CE_DIVISION_LABELS["1/16T"] = "16th T"
__CE_DIVISION_NAMES = ["1/1","1/2","1/4","1/8","1/16","1/32","1/2D","1/4D","1/8D","1/16D","1/2T","1/4T","1/8T","1/16T"]
__CE_TIME = {}
__CE_TIME["ppqn"] = 24
__CE_TIME["minBpm"] = 20
__CE_TIME["maxBpm"] = 300
# @module ce.anim
__CE_EASINGS = {}
__CE_EASINGS["inQuad"] = [0.55,0.085,0.68,0.53]
__CE_EASINGS["outQuad"] = [0.25,0.46,0.45,0.94]
__CE_EASINGS["inOutQuad"] = [0.455,0.03,0.515,0.955]
__CE_EASINGS["inCubic"] = [0.55,0.055,0.675,0.19]
__CE_EASINGS["outCubic"] = [0.215,0.61,0.355,1]
__CE_EASINGS["inOutCubic"] = [0.645,0.045,0.355,1]
__CE_EASINGS["inBack"] = [0.6,-0.28,0.735,0.045]
__CE_EASINGS["outBack"] = [0.175,0.885,0.32,1.275]
__CE_EASINGS["inOutBack"] = [0.68,-0.55,0.265,1.55]
# @module ce.music
# END GENERATED music tables

# Scales, chords and snap-to-key, over the generated tables above. `root`/`note` take a MIDI number
# or a name ("C4"), the way sendNote does. An unknown scale or chord name returns None rather than
# guessing "major" — a script that asked for something this build does not know should find out.
# It found out only by getting None, and an unreadable note NAME was worse: __pitch made it 0, so
# scaleNotes("c4") answered with the scale on C-1. Both now answer None and say why, through __setOf
# and __pitchOf, in the words of the WebView runtime's musicSetOf and musicPitchOf. Each helper
# checks its scale or chord first, then its notes in argument order, and stops at the first.
# A number has to be a finite one: NaN, True or a table rooted the answer at C-1 (or raised) where an
# unreadable name had. The answer itself may pass 127 (a chord on G9 does); a sender refuses that.
def __pitch(v):
    import math
    if isinstance(v, str):
        return noteNumber(v)
    if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v):
        return math.floor(v)
    return None
def __steps(tbl, name, fallback):
    return tbl.get(fallback if name is None else str(name))
def __pitchOf(verb, v):
    # A note left out altogether used to go the numeric way and become 0, the scale on C-1 again.
    if v is None:
        logError(verb + ': no note was given, so there is no answer. A note is a MIDI number or a name, such as 60 or "C4".')
        return None
    n = __pitch(v)
    if n is None:
        if isinstance(v, str):
            logError(verb + ': "' + v + '" is not a note name, so there is no answer. A name is '
                     + 'a capital letter, then # or b if it has one, then the octave: "C4", "Eb3", "F#-1".')
        else:
            logError(verb + ': ' + __shownValue(v) + ' is not a note, so there is no answer. A note is a MIDI '
                     + 'number or a name, such as 60 or "C4".')
    return n
def __setOf(verb, kind, name):
    s = __steps(__CE_CHORDS if kind == "chord" else __CE_SCALES, name, "major")
    if s is None:
        logError(verb + ': "' + str(name) + '" is not a ' + kind + ', so there is no answer. The ' + kind
                 + 's are ' + ", ".join(__CE_CHORD_NAMES if kind == "chord" else __CE_SCALE_NAMES) + '.')
    return s
def scaleNotes(root, scale=None):
    s = __setOf("ce.music.scale", "scale", scale)
    if s is None: return None
    base = __pitchOf("ce.music.scale", root)
    if base is None: return None
    return [base + x for x in s]
def chordNotes(root, chordType=None):
    s = __setOf("ce.music.chord", "chord", chordType)
    if s is None: return None
    base = __pitchOf("ce.music.chord", root)
    if base is None: return None
    return [base + x for x in s]
def quantizeNote(note, root, scale=None):
    s = __setOf("ce.music.quantize", "scale", scale)
    if s is None: return None
    n = __pitchOf("ce.music.quantize", note)
    if n is None: return None
    base = __pitchOf("ce.music.quantize", root)
    if base is None: return None
    # NOT set(): this prelude defines set(path, value) as ce.core's write verb, which shadows the
    # builtin for the whole namespace, so set(<generator>) raises TypeError - which is what
    # quantizeNote did on every call in the Python engine until the prelude was actually executed.
    inKey = {}
    for x in s:
        inKey[(base + x) % 12] = True
    # Search outwards from the note itself. A TIE GOES UP, always: the +d candidate is tested before
    # the -d one, so a note exactly between two scale tones lands on the same one in every runtime.
    for d in range(0, 7):
        if (n + d) % 12 in inKey: return n + d
        if (n - d) % 12 in inKey: return n - d
    return n

# Key, degree and voicing. Everything above answers a question about a note or a shape on its own;
# these answer questions about a note IN A KEY, which is what the Chord Pad, the Harmoniser and the
# Arpeggiator each work out for themselves. Same algorithms, not second opinions: a script naming a
# chord and the panel labelling the same chord have to agree or the panel contradicts itself.
def noteSpelling(root, scale=None):
    nm = "major" if scale is None else str(scale)
    if __setOf("ce.music.spelling", "scale", scale) is None: return None
    pitch = __pitchOf("ce.music.spelling", root)
    if pitch is None: return None
    pc = __m12(pitch)
    # Judged by the RELATIVE MAJOR, so C minor spells E♭/A♭ rather than D♯/G♯.
    if __CE_MINOR_SCALES.get(nm) is True: pc = __m12(pc + 3)
    return __CE_FLAT_KEYS.get(pc) is True
def inScale(note, root, scale=None):
    s = __setOf("ce.music.inScale", "scale", scale)
    if s is None: return None
    n = __pitchOf("ce.music.inScale", note)
    if n is None: return None
    r = __pitchOf("ce.music.inScale", root)
    if r is None: return None
    base = __m12(r); pc = __m12(n)
    return any(__m12(base + x) == pc for x in s)
# 1 for the tonic, 5 for the dominant. A note OUTSIDE the key has NO degree and gets None rather
# than the nearest one - rounding here turns a wrong note into a plausible chord, and quantizeNote
# is the verb that rounds on purpose.
def scaleDegree(note, root, scale=None):
    s = __setOf("ce.music.degree", "scale", scale)
    if s is None: return None
    n = __pitchOf("ce.music.degree", note)
    if n is None: return None
    r = __pitchOf("ce.music.degree", root)
    if r is None: return None
    base = __m12(r); pc = __m12(n)
    for i in range(len(s)):
        if __m12(base + s[i]) == pc: return i + 1
    return None
# ce.music's lists of notes, read as the WebView reads them (noteLists.js): a number, a note name
# or text that is a number, and one that is neither refuses the call, saying where it is. They were
# read with float(), so a chord written by name was an empty one, and "inf" was a note. None for a
# list refused, and the same sentences in all four runtimes.
__NOTE_LISTS = {
    "chordQuality": ("ce.music.quality", "there is no answer"), "voiceLead": ("ce.music.lead", "the answer is an empty list"),
    "expandOctaves": ("ce.music.octaves", "the answer is an empty list"), "arpOrder": ("ce.music.arp", "the answer is an empty list"),
}
def __noteListItem(v):
    import math
    if isinstance(v, bool): return None
    if isinstance(v, (int, float)):
        return v if math.isfinite(v) else None     # ints stay ints, so a note reads 60 and not 60.0
    if not isinstance(v, str): return None
    n = noteNumber(v)
    if n is not None: return n
    r = __realNumber(v)
    return int(r) if r is not None and r == int(r) else r
def __noteList(fn, name, lst, mayBeAbsent=False):
    verb, outcome = __NOTE_LISTS[fn]
    def say(why, more=""):
        logError(verb + ": " + why + ", so " + outcome + "." + more)
        return None
    if lst is None:
        return [] if mayBeAbsent else say("no " + name + " were given")
    if not isinstance(lst, (list, tuple)): return say(__shownValue(lst) + " is not a list of notes")
    out = []
    for i, v in enumerate(lst):
        n = __noteListItem(v)
        if n is None:
            where = __shownValue(v) + " at position " + str(i + 1) + " of " + name
            if isinstance(v, str): return say(where + " is not a note name", ' A name is a capital letter, then # or b if it has one, then the octave: "C4", "Eb3", "F#-1".')
            return say(where + " is not a note", ' A note is a MIDI number or a name, such as 60 or "C4".')
        out.append(n)
    return out
def __sortedNotes(lst):
    return sorted(lst)
# A word or a count used as its default, said once (noteLists.js).
__musicWarned = {}
def __musicSaid(text):
    if not text or text in __musicWarned: return
    __musicWarned[text] = True
    logWarn(text + " This is said only the first time.")
__VOICE_LEAD_MODES = ["closest", "smooth", "off"]
__ARP_ORDER_PATTERNS = ["up", "down", "updown", "downup", "asPlayed", "random", "chord"]
# A count argument that is not a finite number falls back to its default. Written out rather than
# leaning on falsiness, because `0 or 3` is 3 in Python and JavaScript and 0 in Lua.
def __count(v, fallback):
    import math
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        try: v = float(v)
        except (TypeError, ValueError): return fallback
    if v != v or v in (float("inf"), float("-inf")): return fallback
    return math.floor(v)
# Name a chord from the notes in it, reading intervals above the lowest one: the inverse of
# chordNotes, in the vocabulary the Chord Pad labels with.
def chordQuality(notes):
    read = __noteList("chordQuality", "notes", notes)
    if not read: return None
    lst = __sortedNotes(read)
    iv = {}
    for x in lst:
        iv[__m12(x - lst[0])] = True
    third = "min" if 3 in iv else "maj" if 4 in iv else "sus2" if 2 in iv else "sus4" if 5 in iv else ""
    fifth = "p5" if 7 in iv else "d5" if 6 in iv else "a5" if 8 in iv else ""
    seventh = "m7" if 10 in iv else "M7" if 11 in iv else ("d7" if (9 in iv and fifth == "d5") else "")
    if third == "min" and fifth == "d5":
        return "m7b5" if seventh == "m7" else ("dim7" if seventh == "d7" else "dim")
    if third == "maj" and fifth == "a5": return "aug"
    if third == "min":
        return "min7" if seventh == "m7" else ("minMaj7" if seventh == "M7" else "min")
    if third == "maj":
        return "dom7" if seventh == "m7" else ("maj7" if seventh == "M7" else "maj")
    if third == "sus2": return "sus2"
    if third == "sus4": return "sus4"
    return "maj"
# A roman numeral for a chord root, spelled against the MAJOR scale so borrowed degrees read as
# ♭III / ♭VI / ♭VII the way the Chord Pad's wheel labels them.
def __roman(rootSemitone, quality):
    semi = __m12(rootSemitone); best = 0; acc = ""
    for d in range(7):
        diff = __m12(semi - __CE_SCALES["major"][d])
        if diff == 0:
            best = d; acc = ""; break
        if diff == 11:
            best = d; acc = "\u266d"
        elif diff == 1 and acc == "":
            best = d; acc = "\u266f"
    r = __CE_ROMAN[best]
    if __CE_MINOR_QUALITIES.get(quality) is True: r = r.lower()
    if quality in ("dim", "dim7", "m7b5"): r += "\u00b0"
    if quality == "aug": r += "+"
    return acc + r
# The chord the key builds ON a degree, by stacking scale thirds. Degrees are 1-based like
# scaleDegree's. Past the top of the scale the stack keeps going an octave up rather than failing.
def degreeChord(root, scale, degree, size=None):
    import math
    nm = "major" if scale is None else str(scale)
    s = __setOf("ce.music.degreeChord", "scale", scale)
    if not s: return None
    if __pitchOf("ce.music.degreeChord", root) is None: return None
    n = len(s)
    d = __count(degree, 1) - 1
    sz = max(2, __count(size, 3))
    offsets = []
    for k in range(sz):
        idx = d + k * 2
        offsets.append(s[idx % n] + math.floor(idx / n) * 12)
    base = __pitch(root)
    quality = chordQuality(offsets)
    tbl = __CE_NOTE_FLAT if noteSpelling(root, nm) else __CE_NOTE_SHARP
    notes = [base + o for o in offsets]
    names = [tbl[__m12(x)] for x in notes]
    return {
        "degree": d + 1, "rootNote": notes[0], "quality": quality,
        "name": names[0] + __CE_QUALITY_SUFFIX.get(quality, ""),
        "roman": __roman(offsets[0], quality),
        "offsets": offsets, "notes": notes, "names": names,
    }
# Each voice to its NEAREST note in the other chord - voice counts differ (a triad following a
# seventh), so pairing by index would compare nonsense.
def __motion(a, b):
    return sum(min(abs(x - y) for y in b) for x in a)
# Re-voice a chord so it moves as little as possible from the one before it - the Harmoniser's
# voice leading. "closest" minimises total movement, "smooth" the TOP voice only (which holds a
# melody still), "off" returns root position. No previous chord means nothing to lead from.
def voiceLead(notes, previous=None, mode=None):
    read = __noteList("voiceLead", "notes", notes)
    before = __noteList("voiceLead", "previous", previous, True) if read is not None else None
    if read is None or before is None: return []
    chord = __sortedNotes(read); prev = __sortedNotes(before)
    how = "closest" if mode is None else str(mode)
    if how not in __VOICE_LEAD_MODES:
        __musicSaid("ce.music.lead: " + __shownValue(mode) + ' is not a mode, so "closest" was used. One of: closest, smooth, off.')
        how = "closest"
    if not chord or not prev or how == "off": return chord
    cands = [chord]; span = max(1, len(chord) - 1) * 2
    cur = chord
    for _ in range(span):
        nx = sorted(cur[1:] + [cur[0] + 12]); cands.append(nx); cur = nx
    cur = chord
    for _ in range(span):
        nx = sorted([cur[-1] - 12] + cur[:-1]); cands.append(nx); cur = nx
    best = chord; bestScore = float("inf")
    for cand in cands:
        if any(x < 0 or x > 127 for x in cand): continue
        score = abs(cand[-1] - prev[-1]) if how == "smooth" else __motion(cand, prev)
        # Strictly less, so a tie keeps the earlier (lower) candidate in every runtime.
        if score < bestScore:
            bestScore = score; best = cand
    return best
# The Arpeggiator's octave expansion. Anything landing above 127 is DROPPED rather than clamped:
# clamping stacks strays on one pitch, which sounds like a stuck key rather than like nothing.
def expandOctaves(notes, octaves=None):
    import math
    read = __noteList("expandOctaves", "notes", notes)
    if read is None: return []
    base = __sortedNotes(read)
    oc = 1
    if octaves is not None:
        def say(why, used):
            __musicSaid("ce.music.octaves: octaves is " + __shownValue(octaves) + ", which is " + why + ", so " + str(used) + " was used.")
            return used
        r = __realNumber(octaves)
        if r is None: oc = say("not a number", 1)
        elif math.floor(r) < 1: oc = say("less than 1", 1)
        elif math.floor(r) > 4: oc = say("more than 4", 4)
        elif math.floor(r) != r: oc = say("not a whole number", math.floor(r))
        else: oc = math.floor(r)
    out = []
    for o in range(oc):
        for x in base:
            v = math.floor(x)
            v = 0 if v < 0 else (127 if v > 127 else v)
            v += o * 12
            if v <= 127: out.append(v)
    return out
# The walk a pattern describes, as a list of STEPS - each step a list of notes, so "chord" (one
# step, everything at once) has the same shape as the rest. Notes are taken in the order given,
# which is what makes "asPlayed" mean anything. "random" returns the input order, exactly as the
# panel's arpeggiator does; for a shuffled WALK there is shuffle(), which is seeded.
def arpOrder(notes, pattern=None):
    asc = __noteList("arpOrder", "notes", notes)
    if asc is None: return []
    if pattern is None:
        __musicSaid('ce.music.arp: no pattern was given, so "up" was used. One of: up, down, updown, downup, asPlayed, random, chord.')
        p = "up"
    elif str(pattern) not in __ARP_ORDER_PATTERNS:
        __musicSaid("ce.music.arp: " + __shownValue(pattern) + ' is not a pattern, so "up" was used. One of: up, down, updown, downup, asPlayed, random, chord.')
        p = "up"
    else:
        p = str(pattern)
    if not asc: return []
    if p == "chord": return [list(asc)]
    if p == "down":
        seq = list(reversed(asc))
    elif p == "updown":
        seq = asc + list(reversed(asc[1:-1]))          # no repeated endpoints
    elif p == "downup":
        desc = list(reversed(asc)); seq = desc + list(reversed(desc[1:-1]))
    else:
        seq = list(asc)
    return [[x] for x in seq]
# @module ce.midi
def to14bit(v):
    import math; v = math.floor(v); return { "msb": math.floor(v / 128) % 128, "lsb": v % 128 }
def from14bit(msb, lsb): return msb * 128 + lsb
def to7bit(v, count=2, order="msb"):
    import math; v = math.floor(v); out = []
    for _ in range(count): out.append(v % 128); v = math.floor(v / 128)
    return list(reversed(out)) if order == "msb" else out
def from7bit(b, order="msb"):
    v = 0; seq = b if order == "msb" else list(reversed(b))
    for x in seq: v = v * 128 + x
    return v
def toNibbles(b):
    import math; b = math.floor(b); return { "hi": math.floor(b / 16) % 16, "lo": b % 16 }
def fromNibbles(hi, lo): return hi * 16 + lo
def nibblize(b):
    o = []
    for x in b: n = toNibbles(x); o.append(n["hi"]); o.append(n["lo"])
    return o
def denibblize(b):
    o = []
    for i in range(0, len(b), 2): o.append(fromNibbles(b[i], b[i + 1] if i + 1 < len(b) else 0))
    return o
def toAscii(s, length=None):
    o = [ord(c) for c in s]
    if length:
        while len(o) < length: o.append(32)
    return o
def fromAscii(b): return "".join(chr(x) for x in b)
def toOffset(v, center): return v + center
def fromOffset(b, center): return b - center
def toSigned(v, bits):
    m = 2 ** bits; return v + m if v < 0 else v
def fromSigned(b, bits):
    m = 2 ** bits; return b - m if b >= m / 2 else b

# checksum(kind, bytes) — "roland"/"yamaha" are the same two's-complement 7-bit sum; "sum" is the
# plain 7-bit sum; "xor" is the running XOR. The one-argument form checksum(bytes) defaults to
# roland (the spelling panels shipped with before the contract was enforced).
# checksum(type, bytes [, opts]) — eleven algorithms, the same table checksums.js holds and the
# device profile engine reads (design doc §48). This knew three and fell through to Roland for
# anything else, so a typo came back as a plausible number from a different algorithm.
__CE_CKSUM_ALIAS = {
    "sum": "sum-7bit", "sum-7bit": "sum-7bit",
    "roland": "roland-7bit", "yamaha": "roland-7bit", "roland-7bit": "roland-7bit",
    "twos-complement-7bit": "roland-7bit",
    "ones": "ones-complement-7bit", "ones-complement": "ones-complement-7bit",
    "ones-complement-7bit": "ones-complement-7bit",
    "xor": "xor-7bit", "xor-7bit": "xor-7bit",
    "offset": "offset-7bit", "kawai": "offset-7bit", "offset-7bit": "offset-7bit",
    "sum-8bit": "sum-8bit",
    "twos-complement": "twos-complement-8bit", "twos-complement-8bit": "twos-complement-8bit",
    "crc8": "crc8",
    "crc16": "crc16-ccitt", "crc16-ccitt": "crc16-ccitt", "crc16-modbus": "crc16-modbus",
    "crc32": "crc32",
}

# Python integers are arbitrary precision, so every step has to be masked explicitly or the CRC
# register grows without bound instead of wrapping.
def __ce_crc_msb(data, poly, init, xor_out, bits):
    import math
    top = 1 << (bits - 1)
    mask = (1 << bits) - 1
    crc = init
    for v in data:
        crc ^= (math.floor(v) & 0xff) << (bits - 8)
        for _ in range(8):
            crc = ((crc << 1) ^ poly) & mask if (crc & top) else (crc << 1) & mask
        crc &= mask
    return (crc ^ xor_out) & mask

def __ce_crc_ref(data, poly, init, xor_out, bits):
    import math
    mask = (1 << bits) - 1
    crc = init
    for v in data:
        crc ^= math.floor(v) & 0xff
        for _ in range(8):
            crc = ((crc >> 1) ^ poly) & mask if (crc & 1) else (crc >> 1) & mask
    return (crc ^ xor_out) & mask

# How a refusal shows a value the script passed, in the same words in every runtime (the WebView
# runtime's shownValue): "nothing" for None, true and false, NaN and Infinity as JavaScript writes
# them, a whole number without ".0", text in quotes, "a list" for any list, tuple or dict.
def __shownValue(v):
    if v is None: return "nothing"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)):
        if v != v: return "NaN"
        if v in (float("inf"), float("-inf")): return "Infinity" if v > 0 else "-Infinity"
        return __shown(v)
    if isinstance(v, str): return '"' + v + '"'
    if callable(v): return "a function"
    return "a list"
def __hexByte(token):
    import re
    return int(token, 16) if re.fullmatch(r"(0[xX])?[0-9a-fA-F]{1,2}", token) else None
# A script's bytes, read the way every runtime reads them (the WebView runtime's scriptBytes,
# BridgeScriptHost's bytesFromScript). Hex text is split on spaces, tabs, line breaks, form and
# vertical tab and commas (not \s, which would also take a no-break space), and each token is one
# byte. A list's items are bytes: a whole number from 0 to 255, or text that is one hex byte; bytes
# and a bytearray are lists, and a dict is read as its values, as a Lua table is in the editor.
# Anything else is refused, naming what and where, and None comes back; nothing given is an empty
# list, for the caller to judge.
def __scriptBytes(verb, data, outcome):
    import re
    if data is None: return []
    if isinstance(data, str):
        out = []
        for token in [t for t in re.split(r"[ \t\r\n\f\v,]+", data) if t]:
            b = __hexByte(token)
            if b is None:
                if re.fullmatch(r"[0-9a-fA-F]+", token) and len(token) % 2 == 0:
                    tail = 'Put a space between the bytes: "' + " ".join(token[i:i + 2] for i in range(0, len(token), 2)) + '".'
                else:
                    tail = 'Each byte is one or two hex digits, with spaces between the bytes: "F0 41 10 F7".'
                logError(verb + ': "' + token + '" is not one byte, so ' + outcome + '. ' + tail)
                return None
            out.append(b)
        return out
    if isinstance(data, (bytes, bytearray)): return list(data)
    if isinstance(data, dict): data = list(data.values())
    if not isinstance(data, (list, tuple)):
        logError(verb + ": " + __shownValue(data) + " is not a list of bytes, so " + outcome + ".")
        return None
    out = []
    for i, v in enumerate(data):
        b = None
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            if v == v and 0 <= v <= 255 and v == int(v): b = int(v)
        elif isinstance(v, str):
            b = __hexByte(v)
        if b is None:
            logError(verb + ": " + __shownValue(v) + " at position " + str(i) + " is not a byte, so " + outcome
                     + '. A byte is a whole number from 0 to 255, or one or two hex digits such as "F7".')
            return None
        out.append(b)
    return out
def checksum(kind=None, bytes=None, opts=None):
    import math
    verb = "ce.midi.checksum"
    if bytes is None:
        # checksum("roland") with the bytes left out: the name is a name, and what is missing is the bytes.
        if kind is None or (isinstance(kind, str) and kind.lower() in __CE_CKSUM_ALIAS):
            logError(verb + ": no bytes given, so there is no checksum.")
            return None
        bytes = kind; kind = "roland"
    bytes = __scriptBytes(verb, bytes, "there is no checksum")
    if bytes is None: return None
    cid = __CE_CKSUM_ALIAS.get(kind.lower()) if isinstance(kind, str) else None
    if cid is None:
        # The names it does accept, sorted, as the WebView runtime lists them (checksumNames).
        which = ": no algorithm given" if kind is None else "(" + __shownValue(kind) + "): no such algorithm"
        logError("ce.midi.checksum" + which + ". One of: " + ", ".join(sorted(__CE_CKSUM_ALIAS.keys())) + ".")
        return None
    total = 0; total8 = 0; x = 0
    for v in bytes:
        b = math.floor(v) & 0xff
        total = (total + b) % 128
        total8 = (total8 + b) % 256
        x = (x ^ b) & 0x7f
    if cid == "sum-7bit": return total
    if cid == "roland-7bit": return (128 - total) % 128
    if cid == "ones-complement-7bit": return (127 - total) % 128
    if cid == "xor-7bit": return x
    if cid == "offset-7bit":
        k = 0xa5
        if opts is not None:
            got = opts.get("offset") if hasattr(opts, "get") else None
            if got is not None: k = math.floor(got)
        return (total + k) % 128
    if cid == "sum-8bit": return total8
    if cid == "twos-complement-8bit": return (256 - total8) % 256
    if cid == "crc8": return __ce_crc_msb(bytes, 0x07, 0x00, 0x00, 8)
    if cid == "crc16-ccitt": return __ce_crc_msb(bytes, 0x1021, 0xffff, 0x0000, 16)
    if cid == "crc16-modbus": return __ce_crc_ref(bytes, 0xa001, 0xffff, 0x0000, 16)
    return __ce_crc_ref(bytes, 0xedb88320, 0xffffffff, 0xffffffff, 32)

# Byte lists: what JUCE's MemoryBlock does, over the lists scripts already pass bytes in
# (docs/design/script-bytes.md). Ported from the WebView runtime's "byte lists" block rule for rule
# and message for message, which scriptPreludeAgreement.test.js checks. Offsets and bit positions
# count from 0. A list may be hex text, bytes or a bytearray, and its items must be bytes (0 to 255,
# or one hex byte), both read by __scriptBytes; a mistake answers None and says why; every list
# returned is new.
__BIT_RANGE = "start must be a whole number from 0, and count one from 1 to 32"
__WRITE_START = "Writing can run past the end, but not start beyond it."
__B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
def __whole(n):
    import math
    return isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) and n == math.floor(n)
# A whole number prints as one ("9", not Python's "9.0" for a float), as it does in the other runtimes.
def __shown(n):
    if isinstance(n, float) and n.is_integer(): return str(int(n))
    return str(n)
def __plural(n, word): return str(n) + " " + word + ("" if n == 1 else "s")
def __span(word, a, b):
    if a == b: return word + " " + str(a) + " is past"
    return word + "s " + str(a) + " to " + str(b) + " run past"
def __refuse(verb, why, tail=None):
    logError(verb + ": " + why + ", so there is no answer." + ((" " + tail) if tail else ""))
    return None
def __bytesIn(verb, data):
    if data is None: return __refuse(verb, "no bytes given")
    return __scriptBytes(verb, data, "there is no answer")
# Why a value to write cannot be written in `bits` bits, or None when it can.
def __doesNotFit(v, bits):
    if v is None: return "the value to write is missing"
    if not __whole(v): return __shownValue(v) + " is not a whole number"
    if v < 0 or v >= 2 ** bits: return __shown(v) + " does not fit in " + __plural(bits, "bit")
    return None
def __shape(verb, opts):
    bits, order = 7, "msb"
    if isinstance(opts, dict):
        if opts.get("bits") is not None: bits = opts.get("bits")
        if opts.get("order") is not None: order = opts.get("order")
    if isinstance(bits, bool) or bits not in (7, 8): return __refuse(verb, "bits must be 7 or 8")
    if order not in ("msb", "lsb"): return __refuse(verb, 'order must be "msb" or "lsb"')
    return { "bits": int(bits), "order": order }
def getBits(value=None, start=None, count=None):
    verb = "ce.midi.getBits"
    if not __whole(start) or start < 0 or not __whole(count) or count < 1 or count > 32: return __refuse(verb, __BIT_RANGE)
    start = int(start); count = int(count)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if value != value or value in (float("inf"), float("-inf")): return __refuse(verb, __shownValue(value) + " is not a finite number")
        import math
        if start + count > 32:
            return __refuse(verb, __span("bit", start, start + count - 1) + " the 32 bits a number holds here")
        return (int(math.floor(value)) >> start) & ((1 << count) - 1)
    data = __bytesIn(verb, value)
    if data is None: return None
    if start + count > len(data) * 8:
        return __refuse(verb, __span("bit", start, start + count - 1) + " the end of " + __plural(len(data), "byte"))
    out = 0
    for k in range(count):
        at = start + k
        out |= ((data[at // 8] >> (at % 8)) & 1) << k
    return out
def setBits(value=None, start=None, count=None, bits=None):
    verb = "ce.midi.setBits"
    if not __whole(start) or start < 0 or not __whole(count) or count < 1 or count > 32: return __refuse(verb, __BIT_RANGE)
    start = int(start); count = int(count)
    unfit = __doesNotFit(bits, count)
    if unfit: return __refuse(verb, unfit)
    bits = int(bits)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if value != value or value in (float("inf"), float("-inf")): return __refuse(verb, __shownValue(value) + " is not a finite number")
        import math
        if start + count > 32:
            return __refuse(verb, __span("bit", start, start + count - 1) + " the 32 bits a number holds here")
        return (int(math.floor(value)) & ~(((1 << count) - 1) << start)) | (bits << start)
    data = __bytesIn(verb, value)
    if data is None: return None
    if start + count > len(data) * 8:
        return __refuse(verb, __span("bit", start, start + count - 1) + " the end of " + __plural(len(data), "byte"))
    for k in range(count):
        at = start + k
        i, bit = at // 8, 1 << (at % 8)
        if (bits >> k) & 1: data[i] |= bit
        else: data[i] &= ~bit
    return data
def bytesRead(data=None, offset=None, count=None, opts=None):
    verb = "ce.midi.read"
    data = __bytesIn(verb, data)
    if data is None: return None
    if not __whole(offset) or offset < 0: return __refuse(verb, "offset must be a whole number from 0")
    if not __whole(count) or count < 1 or count > 4: return __refuse(verb, "count must be a whole number from 1 to 4")
    offset = int(offset); count = int(count)
    shape = __shape(verb, opts)
    if shape is None: return None
    if offset + count > len(data):
        return __refuse(verb, __span("byte", offset, offset + count - 1) + " the end of " + __plural(len(data), "byte"))
    part = data[offset:offset + count]
    if shape["order"] == "lsb": part.reverse()
    base, v = 1 << shape["bits"], 0
    for b in part: v = v * base + (b % base)
    return v
def bytesWrite(data=None, offset=None, count=None, value=None, opts=None):
    verb = "ce.midi.write"
    data = __bytesIn(verb, data)
    if data is None: return None
    if not __whole(offset) or offset < 0: return __refuse(verb, "offset must be a whole number from 0")
    if not __whole(count) or count < 1 or count > 4: return __refuse(verb, "count must be a whole number from 1 to 4")
    offset = int(offset); count = int(count)
    shape = __shape(verb, opts)
    if shape is None: return None
    unfit = __doesNotFit(value, shape["bits"] * count)
    if unfit: return __refuse(verb, unfit)
    if offset > len(data):
        return __refuse(verb, "offset " + str(offset) + " is past the end of " + __plural(len(data), "byte"), __WRITE_START)
    base, v, digits = 1 << shape["bits"], int(value), []
    for _ in range(count):
        digits.append(v % base); v //= base
    if shape["order"] == "msb": digits.reverse()
    for j, d in enumerate(digits):
        if offset + j < len(data): data[offset + j] = d
        else: data.append(d)
    return data
def bytesSlice(data=None, offset=None, count=None):
    verb = "ce.midi.slice"
    data = __bytesIn(verb, data)
    if data is None: return None
    if not __whole(offset) or offset < 0: return __refuse(verb, "offset must be a whole number from 0")
    offset = int(offset)
    if count is None:
        if offset > len(data): return __refuse(verb, "offset " + str(offset) + " is past the end of " + __plural(len(data), "byte"))
        return data[offset:]
    if not __whole(count) or count < 0: return __refuse(verb, "count must be a whole number from 0")
    count = int(count)
    if offset + count > len(data):
        if count == 0: return __refuse(verb, "offset " + str(offset) + " is past the end of " + __plural(len(data), "byte"))
        return __refuse(verb, __span("byte", offset, offset + count - 1) + " the end of " + __plural(len(data), "byte"))
    return data[offset:offset + count]
def bytesPut(data=None, offset=None, values=None):
    verb = "ce.midi.put"
    data = __bytesIn(verb, data)
    if data is None: return None
    if not __whole(offset) or offset < 0: return __refuse(verb, "offset must be a whole number from 0")
    offset = int(offset)
    part = __bytesIn(verb, values)
    if part is None: return None
    if offset > len(data):
        return __refuse(verb, "offset " + str(offset) + " is past the end of " + __plural(len(data), "byte"), __WRITE_START)
    for j, b in enumerate(part):
        if offset + j < len(data): data[offset + j] = b
        else: data.append(b)
    return data
def bytesFind(data=None, pattern=None, start=None):
    verb = "ce.midi.find"
    data = __bytesIn(verb, data)
    if data is None: return None
    wanted = __bytesIn(verb, pattern)
    if wanted is None: return None
    if not wanted: return __refuse(verb, "the pattern is empty")
    first = 0 if start is None else start
    if not __whole(first) or first < 0: return __refuse(verb, "from must be a whole number from 0")
    # Not found is an answer, not a mistake: None comes back and nothing is said.
    for i in range(int(first), len(data) - len(wanted) + 1):
        if data[i:i + len(wanted)] == wanted: return i
    return None
def bytesToHex(data=None):
    data = __bytesIn("ce.midi.toHex", data)
    if data is None: return None
    return " ".join("%02X" % b for b in data)
def bytesFromHex(text=None):
    verb = "ce.midi.fromHex"
    if text is None: return __refuse(verb, "no hex text given")
    if not isinstance(text, str): return __refuse(verb, __shownValue(text) + " is not hex text")
    return __bytesIn(verb, text)
def bytesToBase64(data=None):
    data = __bytesIn("ce.midi.toBase64", data)
    if data is None: return None
    out = ""
    for i in range(0, len(data), 3):
        chunk = data[i:i + 3]
        n = chunk[0] * 65536 + (chunk[1] if len(chunk) > 1 else 0) * 256 + (chunk[2] if len(chunk) > 2 else 0)
        out += __B64[(n >> 18) & 63] + __B64[(n >> 12) & 63]
        out += (__B64[(n >> 6) & 63] if len(chunk) > 1 else "=") + (__B64[n & 63] if len(chunk) > 2 else "=")
    return out
def bytesFromBase64(text=None):
    import re
    verb = "ce.midi.fromBase64"
    if text is None: return __refuse(verb, "no base64 text given")
    clean = re.sub(r"[ \t\r\n]", "", text) if isinstance(text, str) else None
    if clean is None or len(clean) % 4 != 0 or not re.fullmatch(r"[A-Za-z0-9+/]*={0,2}", clean):
        return __refuse(verb, "that is not base64", "Base64 is groups of four characters from A-Z, a-z, 0-9, + and /, with = only as padding at the end.")
    out = []
    for i in range(0, len(clean), 4):
        group, n, pad = clean[i:i + 4], 0, 0
        for c in group:
            if c == "=":
                pad += 1; n = n * 64
            else:
                n = n * 64 + __B64.index(c)
        out.append((n >> 16) & 255)
        if pad < 2: out.append((n >> 8) & 255)
        if pad < 1: out.append(n & 255)
    return out

# panic([opts]) — All Sound Off (120), All Notes Off (123), Reset All Controllers (121), in that
# order because 120 must land before 123 for a device to cut a stuck note rather than let it ring
# out. Expands to plain sendCC calls, so it needs nothing of the host beyond CC output.
def panic(opts=None):
    import math
    opts = opts or {}
    reset = opts.get("resetControllers", True) is not False
    ch = opts.get("channel")
    channels = range(1, 17)
    # A channel that is not one ("all", 17) is refused; leaving it out is how every channel is named.
    if ch is not None:
        c = __midiArg("panic", "channel", ch)
        if c is None: return
        channels = [c]
    for c in channels:
        sendCC(c, 120, 0)
        sendCC(c, 123, 0)
        if reset: sendCC(c, 121, 0)

# @module -
# Every member declared runtime:'webview' in panelApi.js. The components are modelled and rendered
# in the panel view; there is no C++ counterpart to drive with the window closed. Defining them
# here as explaining stubs means a script that strays across the boundary says so, instead of raising NameError.
# The list below is GENERATED — 248 names maintained by hand in three files is 744 chances to
# mistype one, and a mistyped stub is a missing name in exactly one engine.
# BEGIN GENERATED webview-only stubs — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
__WEBVIEW_ONLY = [
# @module ce.device
  "deviceBind","deviceUnbind",
# @module ce.anim
  "animatePlay",
# @module ce.ui
  "uiNotify","uiStatus","uiDialog","uiPrompt","uiChoose","uiDismiss","uiUpdate","uiState","uiCopy",
# @module ce.draw
  "drawClear","drawFill","drawStroke","drawRect","drawCircle","drawLine","drawPath","drawArc",
  "drawGradient","drawOpacity","drawTransform","drawEllipse","drawPixelText","drawMeasure",
  "drawBatch","drawGrid","drawLines","drawPoints","drawCurve","drawPolygon","drawImage","drawClip",
  "drawBlend","drawSave","drawRestore","drawText","drawRedraw",
# @module ce.panel
  "panelCreate","panelClone","panelDestroy","panelParent","panelFind","panelInfo","panelTypes",
  "panelAlign","panelDistribute","panelMatch","panelGrid","panelCircle","panelFlip","panelRect",
  "panelOrder","panelBatch","panelKeep","panelEntries","panelEntry","panelDefine","panelUndefine",
  "panelPatch",
# @module ce.image
  "imageAssets","imageAsset","imageSet","imageClear","imageRead","imageIcon","imageEmbed",
  "imageLoad",
# @module ce.keys
  "keysShortcut","keysRemove","keysList","keysIsDown","keysHeld","keysPiano","keysPianoInfo",
  "keysFocus","keysFocused",
# @module ce.text
  "textFonts","textFont","textStyle","textAxis","textRead","textMeasure","textFit",
# @module ce.components.split
  "splitPreset","splitMute","splitChannel","splitTranspose","splitPoint","splitRead",
# @module ce.components.phrase
  "phraseSeed","phraseClear","phraseKey","phraseScale","phraseTranspose","phraseDirection",
  "phraseRun","phraseCell","phraseRead",
# @module ce.components.recorder
  "recorderRecord","recorderStop","recorderPlay","recorderClear","recorderUndo","recorderQuantize",
  "recorderTranspose","recorderBars","recorderSource","recorderNudge","recorderShift",
  "recorderStore","recorderLoad","recorderCountIn","recorderRead",
# @module ce.components.harmony
  "harmonyMode","harmonyKey","harmonyScale","harmonySize","harmonyShape","harmonyVoicing",
  "harmonyInversion","harmonyOctave","harmonyOutOfKey","harmonyKeepPlayed","harmonyChannel",
  "harmonyVoiceLeading","harmonyStrum","harmonyDegree","harmonyRead",
# @module ce.components.setlist
  "setlistNext","setlistPrev","setlistGoto","setlistEnable","setlistWrap","setlistCrossfade",
  "setlistRead",
# @module ce.components.arp
  "arpRun","arpPattern","arpRate","arpDivision","arpSync","arpOctaves","arpGate","arpSwing",
  "arpLatch","arpKey","arpScale","arpFollowPanelKey","arpDegree","arpChordType","arpVelocity",
  "arpChannel","arpEuclid","arpEuclidSteps","arpEuclidPulses","arpEuclidRotate","arpPhase",
  "arpMute","arpInputChannel","arpBaseOctave","arpSource","arpLink","arpEditable","arpShowNotes",
  "arpShowHeader","arpRead",
# @module ce.components.chordpad
  "chordPadMode","chordPadKey","chordPadScale","chordPadFollowPanelKey","chordPadChordType",
  "chordPadVoicing","chordPadInversion","chordPadOctave","chordPadVelocity","chordPadChannel",
  "chordPadStrum","chordPadLatch","chordPadLayout","chordPadBaseOctave","chordPadNoteSpan",
  "chordPadGridCols","chordPadEcho","chordPadEchoChannel","chordPadEditable","chordPadShowPiano",
  "chordPadShowRomans","chordPadRead",
# @module ce.components.noteribbon
  "noteRibbonMode","noteRibbonKey","noteRibbonScale","noteRibbonFollowPanelKey",
  "noteRibbonBaseNote","noteRibbonOctaves","noteRibbonBendRange","noteRibbonVelocity",
  "noteRibbonChannel","noteRibbonLatch","noteRibbonOrientation","noteRibbonVelocityFrom",
  "noteRibbonModAxis","noteRibbonModCc","noteRibbonEcho","noteRibbonEchoChannel",
  "noteRibbonEditable","noteRibbonShowNames","noteRibbonShowHeader","noteRibbonRead",
# @module ce.components.drumpads
  "drumPadsMap","drumPadsBaseNote","drumPadsMode","drumPadsGate","drumPadsVelocity",
  "drumPadsChannel","drumPadsRows","drumPadsCols","drumPadsOrigin","drumPadsVelocityFrom",
  "drumPadsEcho","drumPadsEchoChannel","drumPadsNote","drumPadsLabel","drumPadsChoke",
  "drumPadsColour","drumPadsRoll","drumPadsRollRate","drumPadsRollSync","drumPadsRollHz",
  "drumPadsRollDelay","drumPadsRollVelocity","drumPadsZones","drumPadsCornerSize",
  "drumPadsCornerTopLeft","drumPadsCornerTopRight","drumPadsCornerBottomLeft",
  "drumPadsCornerBottomRight","drumPadsFlamMs","drumPadsGhostVelocity","drumPadsEditable",
  "drumPadsShowNotes","drumPadsShowLabels","drumPadsShowHeader","drumPadsRead","drumPadsSize",
  "drumPadsFill",
# @module ce.components.turing
  "turingRun","turingRate","turingDivision","turingSync","turingLength","turingRandomness",
  "turingQuantize","turingGate","turingStep","turingPhase","turingEditable","turingShowGate",
  "turingShowDivisions","turingRead","turingSize","turingFill",
# @module ce.components.looper
  "looperRun","looperSeconds","looperBars","looperSync","looperQuantize","looperLane",
  "looperLaneRest","looperPhase","looperEditable","looperShowPlayhead","looperShowGrid",
  "looperShowDivisions","looperRead","looperSize","looperFill","looperInsert","looperRemove",
# @module ce.components.orbit
  "orbitRun","orbitRate","orbitBars","orbitSync","orbitPhase","orbitNode","orbitNodeRadius",
  "orbitNodeAngle","orbitNodeRatio","orbitNodeDepth","orbitEditable","orbitShowTrails",
  "orbitShowSpokes","orbitShowRings","orbitShowValues","orbitRead","orbitSize","orbitFill",
  "orbitInsert","orbitRemove",
# @module ce.components.kinetic
  "kineticRun","kineticSync","kineticGravity","kineticBounce","kineticFriction","kineticKeepAlive",
  "kineticLaunch","kineticVelocity","kineticEditable","kineticShowTrail","kineticShowWalls",
  "kineticRead",
# @module ce.components.constellation
  "constellationProbe","constellationMode","constellationBlend","constellationRun",
  "constellationRate","constellationSync","constellationBars","constellationLinks",
  "constellationEditable","constellationShowLinks","constellationShowField",
  "constellationShowLabels","constellationRead",
# @module ce.components.timbre
  "timbreMove","timbrePower","timbreAnchorX","timbreAnchorY","timbreAxisX","timbreAxisY",
  "timbreEditable","timbreShowField","timbreShowAnchors","timbreShowReadout","timbreRead",
  "timbreSize","timbreFill","timbreInsert","timbreRemove",
# @module ce.components.router
  "routerSource","routerCc","routerChannel","routerPoly","routerInvert","routerDeadzone",
  "routerInput","routerDest","routerDestDepth","routerCurveX","routerCurveY","routerCurveShape",
  "routerSourceControl","routerEditable","routerShowGrid","routerShowDivisions","routerRead",
  "routerSize","routerFill","routerInsert","routerRemove",
# @module ce.components.macro
  "macroValue","macroSlot","macroSlotDepth","macroSlotCurve","macroSlotMin","macroSlotMax",
  "macroLabel","macroEditable","macroShowLanes","macroShowValues","macroShowDivisions","macroRead",
  "macroSize","macroFill","macroInsert","macroRemove",
# @module ce.components.matrix
  "matrixCell","matrixClear","matrixBipolar","matrixStep","matrixCellStyle","matrixEditable",
  "matrixShowLabels","matrixShowValues","matrixRead","matrixSize","matrixFill",
# @module ce.components.constraint
  "constraintMode","constraintGap","constraintMember","constraintEditable","constraintShowValues",
  "constraintShowBadge","constraintRead","constraintSize","constraintFill","constraintInsert",
  "constraintRemove",
# @module ce.components.envelope
  "envelopePreset","envelopePointX","envelopePointY","envelopePointCurve","envelopeSustain",
  "envelopeLoop","envelopeLoopStart","envelopeLoopEnd","envelopeTimeMax","envelopePhase",
  "envelopeAddOnDoubleClick","envelopeSnapX","envelopeSnapY","envelopeFillUnder",
  "envelopePhaseSource","envelopeEditable","envelopeShowPlayhead","envelopeShowGrid","envelopeRead",
  "envelopeSize","envelopeFill","envelopeInsert","envelopeRemove",
# @module ce.components.ribbon
  "ribbonValue","ribbonBipolar","ribbonReturnMode","ribbonReturnValue","ribbonReturnTime",
  "ribbonReturnCurve","ribbonSnap","ribbonOrientation","ribbonStyle","ribbonLabel",
  "ribbonValuePrecision","ribbonEditable","ribbonShowGlow","ribbonShowValue","ribbonRead",
# @module ce.components.crossfader
  "crossfaderMix","crossfaderLaw","crossfaderBipolar","crossfaderDetent","crossfaderReturnMode",
  "crossfaderReturnValue","crossfaderReturnTime","crossfaderReturnCurve","crossfaderOrientation",
  "crossfaderLabelA","crossfaderLabelB","crossfaderEditable","crossfaderShowLabels",
  "crossfaderShowGains","crossfaderRead",
# @module ce.components.joystick
  "joystickMove","joystickBipolar","joystickReturnMode","joystickReturnValue","joystickReturnAxes",
  "joystickReturnTime","joystickReturnCurve","joystickCornerLabel","joystickEditable",
  "joystickShowGrid","joystickShowCrosshair","joystickShowCorners","joystickShowTrail",
  "joystickRead","joystickSize","joystickFill",
# @module ce.components.meter
  "meterValue","meterScale","meterPeakHold","meterHoldMs","meterDecay","meterValueMin",
  "meterValueMax","meterDbFloor","meterDbCeil","meterOrientation","meterGradient","meterLabel",
  "meterValuePrecision","meterValuePrefix","meterValueSuffix","meterZoneAt","meterSource",
  "meterShowTicks","meterShowScaleLabels","meterShowValue","meterRead","meterSize","meterFill",
  "meterInsert","meterRemove",
# @module ce.components.transport
  "transportBpm","transportSwing","transportSource","transportBeatsPerBar","transportBeatUnit",
  "transportLoop","transportLoopStart","transportLoopBars","transportCountIn","transportClockOut",
  "transportClockDevice","transportRunOnLoad","transportEditable","transportShowPosition",
  "transportShowTap","transportRead",
# @module ce.components.panic
  "panicSetScope","panicSetChannel","panicSetResetControllers","panicSetCentreBend",
  "panicSetClearLocal","panicSetLabel","panicSetEditable","panicSetShowSummary","panicSetRead",
# @module ce.components.lcd
  "lcdText","lcdClear","lcdBacklight","lcdBrightness","lcdContrast","lcdScroll","lcdScrollSpeed",
  "lcdBlink","lcdCursor","lcdCursorAt","lcdValue","lcdAnim","lcdAnimPreset","lcdAnimSpeed",
  "lcdAnimFps","lcdAnimLoop","lcdScrollMode","lcdScrollRepeat","lcdBlinkRate","lcdCursorBlink",
  "lcdValueMin","lcdValueMax","lcdValuePrecision","lcdValuePrefix","lcdValueSuffix",
  "lcdValueSource","lcdBrightnessSource","lcdBacklightSource","lcdGlyph","lcdEditText",
  "lcdShowGlass","lcdShowGhost","lcdShowScanlines","lcdShowGrid","lcdRead","lcdSize","lcdFill",
# @module ce.components.pixel
  "pixelText","pixelLabel","pixelShow","pixelBlink","pixelX","pixelY","pixelW","pixelH",
  "pixelEditText","pixelBacklight","pixelBrightness","pixelContrast","pixelGamma","pixelGlow",
  "pixelAnim","pixelAnimPreset","pixelAnimSpeed","pixelAnimLoop","pixelAnimFps",
  "pixelLayoutTransition","pixelTransitionMs","pixelBrightnessSource","pixelBacklightSource",
  "pixelShowGlass","pixelShowGhost","pixelShowScanlines","pixelShowGrid","pixelRead",
]
# @module -
def __webviewOnly(name):
    def stub(*args, **kwargs):
        log("[panel] " + name + "() needs the panel window open — that component is drawn and modelled in the panel view, so there is nothing to drive while the window is closed.")
        return None
    return stub
for __stubName in __WEBVIEW_ONLY:
    globals()[__stubName] = __webviewOnly(__stubName)
# del, because a module-level loop variable OUTLIVES the loop in Python: this one was called __n
# and shadowed a prelude helper of the same name with the last stub's NAME - a string where a
# function belonged, which fails only when the helper is called, and only in this one engine.
del __stubName
# END GENERATED webview-only stubs

# @module ce.ui
# dialog() is the one webview-only verb that owes its caller something. A script asks a question
# and waits in the callback; if the callback never runs, that script waits forever. So window-
# closed it answers the only honest answer there is — nobody is here — and says so in the return
# value, which is False: no dialog was shown, and your callback has already been called.
def uiDialog(opts=None, onChoice=None):
    log("[panel] dialog() needs the panel window open — there is nobody to ask with the window closed, so it counts as dismissed.")
    if callable(onChoice): onChoice(None)
    return False

# @module ce.midi
# MIDI channel messages — arithmetic over sendMidi, the way panic() is over sendCC, which is what
# makes them work identically in every runtime and every exported language. `note` accepts a MIDI
# number or a name ("C3"), because a script that reads musically should be allowed to say so.
# @module ce.core
# Levels the console already renders differently, which a script could not reach until now.
# Both PRINT — neither raises; a script wanting to stop raises its own exception.
# logWarn / logError, NOT warn / error — a global `error` would shadow Lua's builtin in the
# sibling engine, and the flat names have to be the same in every language.
def logWarn(message, value=None):  return __api.logAt("warn", str(message), value)
def logError(message, value=None): return __api.logAt("error", str(message), value)

# @module ce.midi
def sendMidi(b):                  return __api.sendMidi(b)
# The numbers a channel message carries, checked before anything is sent: the WebView runtime's
# MIDI_ARGS and midiArg, word for word. An address (channel, controller, program, bank, parameter
# number) outside its range is refused, since clamping it picks a different message; a value past
# the end of its range is clamped, as before; anything that is not a number, or is missing where
# there is no default, is refused. A fraction rounds half up (this floored it, the editor rounded).
__MIDI_ARGS = {
    "channel": ("channel", "a channel", 1, 16, True, "A channel is a whole number from 1 to 16."),
    "controller": ("controller number", "a controller number", 0, 127, True, "A controller number is a whole number from 0 to 127."),
    "program": ("program", "a program", 0, 127, True, "A program is a whole number from 0 to 127."),
    "bank": ("bank number", "a bank number", 0, 127, True, "A bank number is a whole number from 0 to 127."),
    "msb": ("MSB", "an MSB", 0, 127, True, "An MSB is a whole number from 0 to 127."),
    "lsb": ("LSB", "an LSB", 0, 127, True, "An LSB is a whole number from 0 to 127."),
    "value": ("value", "a value", 0, 127, False, "A value is a number from 0 to 127."),
    "velocity": ("velocity", "a velocity", 0, 127, False, "A velocity is a number from 0 to 127."),
    "pressure": ("pressure", "a pressure", 0, 127, False, "A pressure is a number from 0 to 127."),
    "value14": ("value", "a value", 0, 16383, False, "A value is a number from 0 to 16383."),
    "bend": ("bend", "a bend", 0, 16383, False, "A bend is a number from 0 to 16383, and 8192 is the centre."),
    "position": ("song position", "a song position", 0, 16383, False, "A song position is a number of MIDI beats from 0 to 16383."),
}
def __finite(v):
    import math
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
__edgeWarned = {}   # a dict: the panel API's own set() shadows the builtin here
def __midiArg(verb, kind, v):
    import math
    noun, a_noun, lo, hi, address, hint = __MIDI_ARGS[kind]
    if v is None:
        logError(verb + ": no " + noun + " given, so nothing was sent.")
        return None
    r = __realNumber(v)   # text that is a number ("64") is read as one, as it always was
    n = int(math.floor(r + 0.5)) if r is not None else None
    if n is None or (address and (n < lo or n > hi)):
        logError(verb + ": " + __shownValue(v) + " is not " + a_noun + ", so nothing was sent. " + hint)
        return None
    if lo <= n <= hi: return n
    # A value past the end of its range is sent as the nearest end, and said once per command.
    sent = lo if n < lo else hi
    if verb not in __edgeWarned:
        __edgeWarned[verb] = True
        logWarn(verb + ": the " + noun + " " + __shownValue(v) + " is outside " + str(lo) + " to " + str(hi)
                + ", so " + str(sent) + " was sent. This is said only the first time.")
    return sent
# A note: a MIDI number from 0 to 127, rounded, or a name such as "C4" whose number is in that
# range. An unreadable name used to become note 0, so "c4" played C-1 with nothing to say why; a
# name past the top, "C10", put 132 in the data byte, which a synth reads as a status byte; NaN or a
# table raised or played C-1. __badNote refuses each in the WebView runtime's words.
def __note(n):
    import math
    v = noteNumber(n) if isinstance(n, str) else (int(math.floor(n + 0.5)) if __finite(n) else None)
    return v if v is not None and 0 <= v <= 127 else None
def __badNote(verb, note):
    rng = "MIDI notes run from 0 to 127, which is C-1 to G9."
    if note is None:
        why = 'no note was given, so nothing was sent. A note is a MIDI number or a name, such as 60 or "C4".'
    elif isinstance(note, str):
        if noteNumber(note) is None:
            why = ('"' + note + '" is not a note name, so nothing was sent. A name is a capital letter, then # or b if it '
                   + 'has one, then the octave: "C4", "Eb3", "F#-1".')
        else:
            why = '"' + note + '" is outside the MIDI notes, so nothing was sent. ' + rng
    elif __finite(note):
        why = __shown(note) + " is outside the MIDI notes, so nothing was sent. " + rng
    else:
        why = __shownValue(note) + ' is not a note, so nothing was sent. A note is a MIDI number or a name, such as 60 or "C4".'
    logError(verb + ": " + why)
# sendNote's `ms`: left out (False here), the script sends the note off itself; given, it must be
# a length. "500ms", NaN or -5 sent the note on and never the note off, a hung voice.
def __noteLength(verb, ms):
    if ms is None: return False
    length = __realNumber(ms)   # "500" is what sendNote has always read
    if length is not None and length > 0: return length
    logError(verb + ": " + __shownValue(ms) + " is not a length in milliseconds, so nothing was sent. "
             + "Give a number above 0, or leave it out to send the note off yourself.")
    return None

def sendNote(channel=None, note=None, velocity=None, ms=None):
    # A duration schedules the note off. Every script that plays a note was otherwise hand-rolling a
    # timer for it, and getting that wrong means a hung voice - the one MIDI mistake you hear rather
    # than read. A panel cannot play a note at all.
    c = __midiArg("sendNote", "channel", channel)
    if c is None: return
    n = __note(note)
    if n is None: return __badNote("sendNote", note)
    v = __midiArg("sendNote", "velocity", velocity)
    if v is None: return
    length = __noteLength("sendNote", ms)
    if length is None: return
    sendMidi([0x90 | (c - 1), n, v])
    if length is not False:
        __oneShot(length, lambda: sendMidi([0x80 | (c - 1), n, 0]))

# routeMidi / feedMidi / the wire filters. interceptMidiIn|Out filter the WIRE, as opposed to
# ce.core.intercept which filters a model path: inbound reaches the panel's bindings, the note
# input and the transport long before any script sees it, so the HOST runs these chains.
def routeMidi(role, fn):
    __api.beginRoute(str(role or ""))
    try: fn()
    finally: __api.endRoute()

def feedMidi(b): return __api.feedMidi(b)

__midiIn = []
__midiOut = []
def interceptMidiIn(fn):
    del __midiIn[:]
    __midiIn.append(fn)
def interceptMidiOut(fn):
    del __midiOut[:]
    __midiOut.append(fn)

def __applyMidiFilter(inbound, b):
    chain = __midiIn if inbound else __midiOut
    for f in chain:
        # A throwing filter passes the message through UNCHANGED: a broken script must not be able
        # to silence a synth.
        try: out = f(b)
        except Exception as err:
            logError("interceptMidi: " + str(err))
            continue
        if out is False: return {"swallow": True}
        if out is None: continue
        if len(out): b = out
    return {"bytes": b}
def sendRPN(channel=None, msb=None, lsb=None, value=None):
    # RPN is NRPN with CC 101/100 instead of 99/98 — the standard path for pitch-bend range (0,0),
    # fine tuning (0,1) and coarse tuning (0,2).
    c = __midiArg("sendRPN", "channel", channel)
    if c is None: return
    m = __midiArg("sendRPN", "msb", msb)
    if m is None: return
    l = __midiArg("sendRPN", "lsb", lsb)
    if l is None: return
    v = __midiArg("sendRPN", "value14", value)
    if v is None: return
    s = 0xB0 | (c - 1)
    sendMidi([s, 0x65, m, s, 0x64, l, s, 0x06, (v >> 7) & 0x7F, s, 0x26, v & 0x7F])
def sendSongPosition(beats=None):
    b = __midiArg("sendSongPosition", "position", beats)
    if b is None: return
    sendMidi([0xF2, b & 0x7F, (b >> 7) & 0x7F])
def sendNoteOff(channel=None, note=None, velocity=None):
    c = __midiArg("sendNoteOff", "channel", channel)
    if c is None: return
    n = __note(note)
    if n is None: return __badNote("sendNoteOff", note)
    v = __midiArg("sendNoteOff", "velocity", 0 if velocity is None else velocity)
    if v is None: return
    sendMidi([0x80 | (c - 1), n, v])
def sendProgramChange(channel=None, program=None, bankMsb=None, bankLsb=None):
    verb = "sendProgramChange"
    c = __midiArg(verb, "channel", channel)
    if c is None: return
    p = __midiArg(verb, "program", program)
    if p is None: return
    msb = lsb = False
    if bankMsb is not None:
        msb = __midiArg(verb, "bank", bankMsb)
        if msb is None: return
    if bankLsb is not None:
        lsb = __midiArg(verb, "bank", bankLsb)
        if lsb is None: return
    # Bank select first: a device applies the bank that was in force when the program change lands.
    if msb is not False: sendCC(c, 0, msb)
    if lsb is not False: sendCC(c, 32, lsb)
    sendMidi([0xC0 | (c - 1), p])
def sendPitchBend(channel=None, value=None):
    c = __midiArg("sendPitchBend", "channel", channel)
    if c is None: return
    v = __midiArg("sendPitchBend", "bend", 8192 if value is None else value)
    if v is None: return
    sendMidi([0xE0 | (c - 1), v % 128, (v // 128) % 128])
def sendAftertouch(channel=None, pressure=None, note=None):
    c = __midiArg("sendAftertouch", "channel", channel)
    if c is None: return
    if note is None:
        p = __midiArg("sendAftertouch", "pressure", pressure)
        if p is None: return
        return sendMidi([0xD0 | (c - 1), p])
    n = __note(note)
    if n is None: return __badNote("sendAftertouch", note)
    p = __midiArg("sendAftertouch", "pressure", pressure)
    if p is None: return
    sendMidi([0xA0 | (c - 1), n, p])
def sendClock(): sendMidi([0xF8])
# Any action but stop and continue used to send Start, so "pause" started the sequencer.
def sendTransport(action=None):
    actions = 'The actions are "start", "continue" and "stop".'
    if action is None:
        logError("sendTransport: no action given, so nothing was sent. " + actions)
        return
    status = {"start": 0xFA, "continue": 0xFB, "stop": 0xFC}.get(action.lower()) if isinstance(action, str) else None
    if status is None:
        logError("sendTransport: " + __shownValue(action) + " is not a transport action, so nothing was sent. " + actions)
        return
    sendMidi([status])

# @module ce.device
# Device READS — four wrappers over one host primitive, so the shape a script sees is assembled
# here rather than per engine. Without a device host the query returns None and the host has
# already said why; these hand back None / an empty list rather than pretending.
def __role(r):
    return "mainSynth" if r is None or r == "" else str(r)

# @module ce.panel
# snapshot / restore. The only two ce.panel verbs that are NOT panel-view only: creating a control
# needs a renderer, reading and writing a value does not — and "put the panel back how it was before
# the solo" is a footswitch action in a DAW with the window shut.
#
# A control with no value of its own is LEFT OUT rather than recorded as nothing, so restoring a
# snapshot cannot blank a label by writing None over it.
def __panelQuery(kind, payload=None):
    return __api.panelQuery(kind, payload)
# each(fn) — fn(name) for every control, containers included, in document order.
def panelEach(fn):
    if not callable(fn):
        log("each(fn) needs a function to call — nothing was walked")
        return 0
    names = __panelQuery("controls", None)
    if not names: return 0
    for name in names: fn(name)
    return len(names)
def panelSnapshot():
    out = {}
    names = __panelQuery("controls", None)
    if not names: return out
    for name in names:
        v = __read(name + ".value")
        if v is not None: out[name] = v
    return out
def panelRestore(snap):
    if not isinstance(snap, dict): return 0
    n = 0
    for name, v in snap.items():
        # A name the panel no longer has is skipped rather than failing the whole restore: a
        # snapshot taken before an edit is still worth most of what it holds.
        if __read(name + ".value") is not None:
            set(name + ".value", v)
            n += 1
    return n

# @module ce.device
def __deviceQuery(kind, payload=None):
    return __api.deviceQuery(kind, payload)

def __deviceSet(kind, name, value, role):
    return __api.deviceSet(kind, name, value, role)

def deviceProfile(role=None):
    return __deviceQuery("profile", { "role": __role(role) })
# read / write. `read` is the LAST KNOWN value — what the synth most recently told us — not a live
# query: asking the synth is asynchronous and this verb is not. `write` encodes through the device
# profile and sends; it returns whether the message went out, not whether the synth accepted it.
def deviceRead(id, role=None):
    return __deviceQuery("read", { "role": __role(role), "id": str(id) })
def deviceWrite(id, value, role=None):
    return __api.deviceWrite(str(id), value, __role(role)) is True

def deviceConnected(role=None):
    return __deviceQuery("connected", { "role": __role(role) }) is True

# Preset recall, through the profile's own action. The slot is the device-global number the
# profile's banks partition, not a program number.
def recallPreset(slot, opts=None):
    return __deviceQuery("recallPreset", { "role": __role(opts.get("role") if opts else None), "slot": int(slot) })
def preset(role=None):
    return __deviceQuery("preset", { "role": __role(role) })

# The profile DOCUMENT, rather than the catalogue row deviceProfile() answers from. `variables` is
# what every recipe interpolates ($channel, $deviceId), so it decides what every message the panel
# sends looks like; `coverage` is what the profile claims it can do, in its own words.
def deviceVariables(role=None):
    return __deviceQuery("variables", { "role": __role(role) })
def deviceTiming(role=None):
    return __deviceQuery("timing", { "role": __role(role) })
def deviceCoverage(feature=None, role=None):
    return __deviceQuery("coverage", { "role": __role(role), "feature": "" if feature is None else str(feature) })
def deviceRecipes(role=None):
    return __deviceQuery("recipes", { "role": __role(role) }) or []
def deviceRequests(role=None):
    return __deviceQuery("requests", { "role": __role(role) }) or []
# The two writes. They land on THIS PROJECT's override, never on the shared profile.
def deviceSetVariable(name, value, role=None):
    return __deviceSet("variable", str(name), value, __role(role)) is True
def deviceSetTiming(name, ms, role=None):
    return __deviceSet("timing", str(name), ms, __role(role)) is True

def deviceParameters(opts=None):
    opts = opts or {}
    r = __deviceQuery("parameters", { "role": __role(opts.get("role")), "query": opts.get("query"),
                                      "group": opts.get("group"), "type": opts.get("type"),
                                      "access": opts.get("access"), "limit": opts.get("limit") })
    return r if r is not None else []

def deviceParameter(id, role=None):
    return __deviceQuery("parameter", { "role": __role(role), "id": str(id) })

# ports() — what is actually plugged in. connected(role) only answers yes/no for a role somebody
# configured in advance; this enumerates the real ports, so a panel can offer a choice or notice a
# device that showed up.
def devicePorts(opts=None):
    opts = opts or {}
    r = __deviceQuery("ports", { "direction": opts.get("direction") })
    return r if r is not None else []

# defineParameter / defineDump — teaching the app a synth it was not shipped knowing. The ROLE
# rides inside the spec rather than as a fourth host argument, the way it rides inside
# __deviceQuery's payload: one ABI slot, and adding a field later changes no engine's signature.
def __define(what, id, spec, role):
    spec = dict(spec or {})
    if role is not None and role != "":
        spec["role"] = str(role)
    return __api.deviceDefine(what, str(id), spec) is True

def deviceDefineParameter(id, spec=None, role=None):
    return __define("parameter", id, spec, role)

def deviceDefineDump(kind, spec=None, role=None):
    return __define("dump", kind, spec, role)

# requestDump(kind [, fn [, opts]]) — closing the loop. Fire-and-forget was the odd one out:
# deviceRead answers where it is called, and a dump's answer turned up at onDumpReceived with
# nothing tying it to the request.
#
# The waiter is removed BEFORE the callback runs, so a throw inside it cannot leave one armed for
# the next dump — the same rule after() follows, for the same reason.
__dumpWaiters = []
def __resolveDumps(kind, role, values, err):
    i = 0
    while i < len(__dumpWaiters):
        w = __dumpWaiters[i]
        if not w["done"] and (w["kind"] == "" or w["kind"] == kind):
            w["done"] = True
            __dumpWaiters.pop(i)
            try:
                w["fn"](values, { "ok": err is None, "kind": kind, "role": role or "", "error": err or "" })
            except Exception as e:
                log("requestDump callback failed: " + str(e))
        else:
            i += 1

def requestDump(kind, fn=None, opts=None):
    kind = str(kind if kind is not None else "")
    if callable(fn):
        # Left out, the wait the profile's request deserves: its timeout for every try it allows.
        wait = __deviceQuery("answerWaitMs", { "role": "mainSynth", "request": kind })
        ms = float(wait) if isinstance(wait, (int, float)) and wait > 0 else 3000
        if opts is not None and opts.get("timeout") is not None and float(opts.get("timeout")) > 0:
            ms = float(opts.get("timeout"))
        # A request's answer arrives under the dump it answers with ("requestSystem" brings
        # "system"), so that is what the callback waits for; waiting for the request's own id, it
        # heard only the timeout.
        answer = __deviceQuery("answers", { "role": "mainSynth", "request": kind })
        waitFor = answer if isinstance(answer, str) and answer else kind
        waiter = { "kind": waitFor, "fn": fn, "done": False }
        __dumpWaiters.append(waiter)
        # Resolved rather than left hanging: a synth that is off, or that does not answer this
        # request, is the common case and not the exotic one.
        def __timeout():
            if waiter["done"]: return
            __resolveDumps(waitFor, "", None, "no dump arrived within " + str(int(ms)) + "ms")
        after(ms, __timeout)
    return __api.requestDump(kind)

# Registered once, from the prelude, so it belongs to no script and outlives every reload of them.
# AFTER the declared events, so "the dump arrived" and "the dump I asked for arrived" cannot
# observe the panel in two different states.
def __dumpTick(info):
    get = info.get if hasattr(info, "get") else (lambda k, d=None: d)
    __resolveDumps(str(get("kind") or ""), str(get("role") or ""), get("values") or {}, None)
on("*", "onDumpReceived", __dumpTick)

# @module ce.storage
# ce.storage. `state` is a plain dict-like namespace: each script is exec'd into its OWN module
# namespace, which lives as long as the script is loaded, so it persists between handler calls with
# no host help. Settings go through the host, because they outlive the session.
# SimpleNamespace, not a dict: `state.count = 1` has to work the same way `state.count` does in a
# Lua table and a JS object, and a dict only offers state["count"].
import types as __ce_state_types
state = __ce_state_types.SimpleNamespace()

# Three scopes, differing in who sees a value and where it lives (design doc §43):
#   panel  — shared by every script on the panel, in the document, travels with it. The default,
#            and exactly what settings have always been.
#   script — private to the calling script, the way `state` already is.
#   local  — THIS MACHINE only, never written into the document.
# script scope is a key prefix on the panel store rather than a store of its own: a private setting
# should persist and travel exactly like a shared one, and only its visibility differs.
__CE_SCOPES = ("panel", "script", "local")
# U+0001 and not U+0000: a key travels through juce::String, which is NUL-terminated and would
# truncate there, and then the editor and the export would disagree about what a private key is
# even called. All four runtimes spell the prefix this way.
__CE_SCRIPT_PREFIX = "\u0001script:"

def __storageScope(opts, verb):
    """The scope asked for, or None when it is not one this build knows.

    Refusing rather than falling back to "panel": storing a value in a scope the caller did not ask
    for is how a private setting quietly becomes a shared one, and a typo in a scope name would be
    the way it happened. A typo in the KEY ({"scop": "script"}) is the same leak, so any key but
    "scope" is refused as well, sorted so every runtime names them in one order. A key that is a
    number is a list entry and is left alone. `verb` is the call's namespaced path; the WebView
    runtime's storageScopeOf says the same words."""
    if isinstance(opts, dict):
        unknown = sorted(str(k) for k in opts
                         if isinstance(k, str) and k != "scope" and not k.isdigit())
        if unknown:
            quoted = ['"' + k + '"' for k in unknown]
            listed = quoted[0] if len(quoted) == 1 else ", ".join(quoted[:-1]) + " and " + quoted[-1]
            logError(verb + ": " + listed
                     + (" is not one of its options" if len(unknown) == 1 else " are not among its options")
                     + ", so nothing was done. Its only option is scope.")
            return None
    raw = opts if isinstance(opts, str) else (opts.get("scope") if isinstance(opts, dict) else None)
    if raw is None or raw == "":
        return "panel"
    scope = str(raw)
    if scope in __CE_SCOPES:
        return scope
    logError(verb + ': "%s" is not a scope, so nothing was done. One of: panel, script, local.' % scope)
    return None

# Which of the host's two real stores a scope lives in.
def __storageStore(scope):  return "local" if scope == "local" else "panel"

# The key a scope actually stores under.
def __storageKeyFor(scope, key):
    k = "" if key is None else str(key)
    if scope == "script":
        return __CE_SCRIPT_PREFIX + str(globals().get("__scriptId", "") or "") + ":" + k
    return k

# …and back, for listing: None when the stored key does not belong to this scope.
def __storageKeyFrom(scope, stored):
    if scope == "script":
        prefix = __CE_SCRIPT_PREFIX + str(globals().get("__scriptId", "") or "") + ":"
        return stored[len(prefix):] if stored.startswith(prefix) else None
    # A panel listing hides other scripts' private keys rather than showing an unusable spelling.
    return None if stored.startswith(__CE_SCRIPT_PREFIX) else stored

def saveSetting(key, value, opts=None):
    scope = __storageScope(opts, "ce.storage.saveSetting")
    if scope is None:
        return False
    store = __storageStore(scope)
    if __api.settingsAvailable(store) is not True:
        logError('saveSetting("%s"): the %s store is unavailable here, so nothing was saved. '
                 'ce.storage.info() says which stores are available.' % (key, scope))
        return False
    __api.saveSetting(__storageKeyFor(scope, key), value, store)
    return True

def loadSetting(key, fallback=None, opts=None):
    scope = __storageScope(opts, "ce.storage.loadSetting")
    if scope is None:
        return fallback
    v = __api.loadSetting(__storageKeyFor(scope, key), __storageStore(scope))
    return fallback if v is None else v

# settings() lists every saved key; forget() deletes one and says whether there was one.
def listSettings(opts=None):
    scope = __storageScope(opts, "ce.storage.settings")
    if scope is None:
        return []
    out = []
    for stored in (__api.listSettings(__storageStore(scope)) or []):
        k = __storageKeyFrom(scope, str(stored))
        if k is not None:
            out.append(k)
    return out

def forgetSetting(key, opts=None):
    scope = __storageScope(opts, "ce.storage.forget")
    if scope is None:
        return False
    return __api.forgetSetting(__storageKeyFor(scope, key), __storageStore(scope)) is True

# Every setting as a table — the read every other module got. Listing keys and looping to fetch each
# one was the only way before.
def allSettings(opts=None):
    scope = __storageScope(opts, "ce.storage.all")
    if scope is None:
        return {}
    return { k: loadSetting(k, None, opts) for k in listSettings(opts) }

# Forget everything in one scope, and say how many went. Panel scope leaves other scripts' private
# keys alone: "clear my settings" must not mean "clear everybody's".
def clearSettings(opts=None):
    # Checked here first, so a refusal names clear rather than the settings() it calls.
    if __storageScope(opts, "ce.storage.clear") is None:
        return 0
    return sum(1 for k in listSettings(opts) if forgetSetting(k, opts))

# Which store a scope is talking to, and what is in it. `available` is the honest field: false means
# writes in this scope will not stick, which is worth saying once rather than per key.
def storageInfo(opts=None):
    scope = __storageScope(opts, "ce.storage.info")
    if scope is None:
        return None
    contents = allSettings(opts)
    text = encodeJson(contents)
    return {
        "scope": scope,
        # What the store IS, rather than what it is called: in the player, panel-scope settings live
        # in the DAW project state and machine-local ones do not.
        "backing": "machine" if scope == "local" else "project",
        "available": __api.settingsAvailable(__storageStore(scope)) is True,
        "count": len(contents),
        "bytes": -1 if text is None else len(text),
    }

# JSON. A Q10 exception, and the same one now() was: the Lua engine opens base, math, string and
# table and has NO json module, while this one and JavaScript each have their own with different
# names and different edge cases. "Use the language's own" was never available to a cross-runtime
# script, so all four grow one spelling here.
#
# Written out rather than handed to json.dumps, because dumps spells a float with repr() and repr
# disagrees with JavaScript exactly where it matters: repr(1e-5) is "1e-05" where JavaScript prints
# "0.00001", and repr pads an exponent to two digits where JavaScript does not. One structure would
# encode two ways, which is the one thing an encoder in a cross-runtime API may not do.
import json as __ce_json
import math as __ce_json_math

__CE_JSON_ESCAPES = {
    '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f",
    "\n": "\\n", "\r": "\\r", "\t": "\\t",
}

def __jsonString(s):
    # Control characters and the two structural ones only. Anything above passes through, so UTF-8
    # text stays UTF-8 — which is what JSON.stringify does.
    out = ['"']
    for ch in s:
        esc = __CE_JSON_ESCAPES.get(ch)
        if esc is not None:
            out.append(esc)
        elif ch < " ":
            out.append("\\u%04x" % ord(ch))
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)

def __jsonNumber(v):
    if isinstance(v, int):
        return "%d" % v
    if v != v or v in (float("inf"), float("-inf")):
        return "null"                                  # as JSON.stringify spells them
    if v == 0:
        return "0"                                     # and -0.0, which JavaScript spells "0"
    a = -v if v < 0 else v
    # An integral value below 1e21 prints as digits in JavaScript, however it is stored here.
    if v == __ce_json_math.floor(v) and a < 1e21:
        return "%d" % int(v)
    # The band where Python and JavaScript disagree about notation: repr goes exponential below
    # 1e-4, JavaScript below 1e-6.
    if 1e-6 <= a < 1e-4:
        for p in range(1, 21):
            s = "%.*f" % (p, v)
            if float(s) == v:
                return s
    # Otherwise repr is already the shortest spelling that reads back as the same double, which is
    # what JavaScript prints too — only the exponent is padded where JavaScript's is not.
    s = repr(v)
    at = s.find("e")
    if at >= 0:
        mantissa, exponent = s[:at], s[at + 1:]
        sign = exponent[0] if exponent[0] in "+-" else "+"
        digits = exponent.lstrip("+-").lstrip("0") or "0"
        s = mantissa + "e" + sign + digits
    return s

def __jsonEnc(v, indent, depth, seen):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"                # before int: a bool IS an int in Python
    if isinstance(v, (int, float)):
        return __jsonNumber(v)
    if isinstance(v, str):
        return __jsonString(v)
    if not isinstance(v, (list, tuple, dict)):
        return None                                    # a function, an object: no JSON form
    if id(v) in seen:
        raise ValueError("cycle")                      # the whole encode fails, as JSON.stringify does
    inner = seen | {id(v)}

    nl, pad, pad_in, colon = "", "", "", ":"
    if indent > 0:
        nl = "\n"
        pad = " " * (indent * depth)
        pad_in = " " * (indent * (depth + 1))
        colon = ": "

    if isinstance(v, (list, tuple)):
        if len(v) == 0:
            return "[]"
        parts = []
        for element in v:
            # An element with no JSON form is null in JavaScript, not a dropped element.
            s = __jsonEnc(element, indent, depth + 1, inner)
            parts.append(pad_in + ("null" if s is None else s))
        return "[" + nl + ("," + nl).join(parts) + nl + pad + "]"

    # Keys come out SORTED, in every runtime. Not a stylistic choice: a Lua table has no insertion
    # order to preserve, so sorted is the only ordering all four runtimes are able to produce — and
    # it is the ordering that makes two encodings of the same structure comparable.
    by_name = { str(k): x for k, x in v.items() }
    parts = []
    for name in sorted(by_name):
        s = __jsonEnc(by_name[name], indent, depth + 1, inner)
        if s is not None:                              # a member with no JSON form is dropped
            parts.append(pad_in + __jsonString(name) + colon + s)
    if not parts:
        return "{}"
    return "{" + nl + ("," + nl).join(parts) + nl + pad + "}"

def encodeJson(value, opts=None):
    indent = 0
    if isinstance(opts, dict):
        try:
            n = int(opts.get("indent") or 0)
            if n > 0:
                indent = n
        except (TypeError, ValueError):
            indent = 0
    try:
        return __jsonEnc(value, indent, 0, frozenset())
    except (TypeError, ValueError, RecursionError):
        # A cycle, or a value with no JSON form. Nothing back rather than a string that is not the
        # value — the same rule every "cannot read that" in this API follows.
        return None

def __jsonStripNulls(v):
    """JSON null read as NOTHING: an absent member, a skipped element. Not a preference — a Lua
    table cannot hold a null, and a value the four runtimes cannot all hold is not a value this API
    has."""
    if isinstance(v, list):
        return [__jsonStripNulls(x) for x in v if x is not None]
    if isinstance(v, dict):
        return { k: __jsonStripNulls(x) for k, x in v.items() if x is not None }
    return v

def decodeJson(text):
    # json.loads for the reading: it is the same strict grammar JSON.parse accepts, which is what
    # the hand-written Lua reader had to be written to match.
    try:
        v = __ce_json.loads("" if text is None else str(text))
    except (ValueError, TypeError):
        return None
    return None if v is None else __jsonStripNulls(v)

# @module -
# BEGIN GENERATED option keys — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
# An options table holding a key its member does not take REFUSES the call: nothing is done, the
# console names the keys and the options the member has, and the call answers what the member
# answers for any other refusal. The WebView runtime does the same from the same lists in
# panelApi.js (panelRuntime.js, applyOptionChecks), in the same words. A key that is a number is a
# list entry, not an option. The keys are named sorted, in every runtime, because a table keeps no
# order a message could follow.
# In Python an options argument can also be passed by its parameter's name, so it is looked for there.
__CE_OPTIONS = {
    "set": { "path": "set", "at": 2, "param": "opts", "refusal": "nothing", "names": ["transmit"] },
    "requestDump": { "path": "ce.device.requestDump", "at": 2, "param": "opts", "refusal": "false", "names": ["timeout"] },
    "recallPreset": { "path": "ce.device.recallPreset", "at": 1, "param": "opts", "refusal": "result", "names": ["role"] },
    "animateTo": { "path": "ce.anim.to", "at": 2, "param": "opts", "refusal": "false", "names": ["duration", "beats", "sync", "curve", "damping", "frequency", "from", "delay", "stagger", "repeat", "pingpong", "done"] },
    "animateSpring": { "path": "ce.anim.spring", "at": 2, "param": "opts", "refusal": "false", "names": ["duration", "damping", "frequency", "from", "beats", "sync", "delay", "stagger", "repeat", "pingpong", "done"] },
    "animateEnvelope": { "path": "ce.anim.envelope", "at": 2, "param": "opts", "refusal": "false", "names": ["from", "to", "duration", "beats", "sync", "delay", "stagger", "repeat", "pingpong", "done"] },
    "patchCurrent": { "path": "ce.patch.current", "at": 1, "param": "opts", "refusal": "nothing", "names": ["groups", "only", "except", "lock", "include", "role", "scope"] },
    "patchRead": { "path": "ce.patch.read", "at": 2, "param": "opts", "refusal": "false", "names": ["timeout", "role"] },
    "patchLoad": { "path": "ce.patch.load", "at": 1, "param": "opts", "refusal": "nothing", "names": ["role"] },
    "patchMorph": { "path": "ce.patch.morph", "at": 3, "param": "opts", "refusal": "nothing", "names": ["groups", "only", "except", "lock", "include", "role", "switchAt"] },
    "patchBlend": { "path": "ce.patch.blend", "at": 2, "param": "opts", "refusal": "nothing", "names": ["groups", "only", "except", "lock", "include", "role"] },
    "patchRandom": { "path": "ce.patch.random", "at": 0, "param": "opts", "refusal": "nothing", "names": ["groups", "only", "except", "lock", "include", "role", "scope", "seed", "from", "within"] },
    "patchMutate": { "path": "ce.patch.mutate", "at": 2, "param": "opts", "refusal": "nothing", "names": ["groups", "only", "except", "lock", "include", "role", "seed"] },
    "patchMerge": { "path": "ce.patch.merge", "at": 2, "param": "opts", "refusal": "nothing", "names": ["groups", "only", "except", "lock", "include", "role"] },
    "patchDiff": { "path": "ce.patch.diff", "at": 2, "param": "opts", "refusal": "nothing", "names": ["groups", "only", "except", "lock", "include", "role"] },
    "patchEqual": { "path": "ce.patch.equal", "at": 2, "param": "opts", "refusal": "nothing", "names": ["groups", "only", "except", "lock", "include", "role"] },
    "patchApply": { "path": "ce.patch.apply", "at": 1, "param": "opts", "refusal": "result", "names": ["groups", "only", "except", "lock", "include", "role", "send", "changedOnly", "live"] },
    "patchSave": { "path": "ce.patch.save", "at": 2, "param": "opts", "refusal": "false", "names": ["replace"] },
    "patchList": { "path": "ce.patch.list", "at": 0, "param": "opts", "refusal": "empty list", "names": ["role", "scope"] },
    "patchForget": { "path": "ce.patch.forget", "at": 1, "param": "opts", "refusal": "false", "names": ["role"] },
    "patchWrite": { "path": "ce.patch.write", "at": 2, "param": "opts", "refusal": "result", "names": ["role"] },
    "syncTimer": { "path": "ce.time.syncTimer", "at": 2, "param": "opts", "refusal": "nothing", "names": ["follow"] },
    "deviceParameters": { "path": "ce.device.parameters", "at": 0, "param": "opts", "refusal": "empty list", "names": ["role", "query", "group", "type", "access", "limit"] },
    "deviceDefineParameter": { "path": "ce.device.defineParameter", "at": 1, "param": "spec", "refusal": "false", "names": ["name", "group", "type", "min", "max", "access", "choices", "trueValue", "falseValue", "cc", "nrpn", "sysex", "channel", "encoding", "nibbles", "checksum", "variables", "length", "pad"], "nested": { "nrpn": { "names": ["msb", "lsb"] } } },
    "deviceDefineDump": { "path": "ce.device.defineDump", "at": 1, "param": "spec", "refusal": "false", "names": ["name", "request", "match", "prefix", "suffix", "offset", "size", "checksum", "fields"], "nested": { "match": { "names": ["prefix", "suffix"] } } },
    "devicePorts": { "path": "ce.device.ports", "at": 0, "param": "opts", "refusal": "empty list", "names": ["direction"] },
    "checksum": { "path": "ce.midi.checksum", "at": 2, "param": "opts", "refusal": "nothing", "names": ["offset"] },
    "panic": { "path": "ce.midi.panic", "at": 0, "param": "opts", "refusal": "nothing", "names": ["channel", "resetControllers"] },
    "encodeJson": { "path": "ce.storage.encode", "at": 1, "param": "opts", "refusal": "nothing", "names": ["indent"] },
    "formatNumber": { "path": "ce.format.number", "at": 1, "param": "opts", "refusal": "nothing", "names": ["decimals", "digits", "sign", "unit", "space", "width", "placeholder", "unicode"] },
    "formatHz": { "path": "ce.format.hz", "at": 1, "param": "opts", "refusal": "nothing", "names": ["decimals", "digits", "sign", "unit", "space", "width", "placeholder", "unicode", "scale"] },
    "formatTime": { "path": "ce.format.time", "at": 1, "param": "opts", "refusal": "nothing", "names": ["decimals", "digits", "sign", "unit", "space", "width", "placeholder", "unicode", "scale"] },
    "formatDb": { "path": "ce.format.db", "at": 1, "param": "opts", "refusal": "nothing", "names": ["decimals", "sign", "unit", "space", "width", "placeholder", "unicode", "fromGain", "floor"] },
    "formatPercent": { "path": "ce.format.percent", "at": 1, "param": "opts", "refusal": "nothing", "names": ["decimals", "sign", "unit", "space", "width", "placeholder", "unicode", "min", "max"] },
    "formatPan": { "path": "ce.format.pan", "at": 1, "param": "opts", "refusal": "nothing", "names": ["decimals", "width", "placeholder", "min", "max", "center", "steps", "style"] },
    "formatRatio": { "path": "ce.format.ratio", "at": 1, "param": "opts", "refusal": "nothing", "names": ["decimals", "digits", "width", "placeholder", "unicode", "style"] },
    "formatClock": { "path": "ce.format.clock", "at": 1, "param": "opts", "refusal": "nothing", "names": ["width", "placeholder", "unicode", "decimals", "hours"] },
    "formatNote": { "path": "ce.format.note", "at": 1, "param": "opts", "refusal": "nothing", "names": ["width", "placeholder", "unicode", "middleC", "flats", "octave"] },
    "formatDivision": { "path": "ce.format.division", "at": 1, "param": "opts", "refusal": "nothing", "names": ["decimals", "digits", "width", "placeholder", "tolerance"] },
    "formatParameter": { "path": "ce.format.parameter", "at": 2, "param": "opts", "refusal": "nothing", "names": ["decimals", "digits", "sign", "unit", "space", "width", "placeholder", "unicode", "role"] },
    "formatTable": { "path": "ce.format.table", "at": 2, "param": "opts", "refusal": "nothing", "names": ["width", "placeholder", "start"] },
    "formatFit": { "path": "ce.format.fit", "at": 2, "param": "opts", "refusal": "nothing", "names": ["abbreviations", "align", "pad", "steps"] },
    "formatLine": { "path": "ce.format.line", "at": 3, "param": "opts", "refusal": "nothing", "names": ["abbreviations", "gap"] },
    "formatParse": { "path": "ce.format.parse", "at": 1, "param": "opts", "refusal": "nothing", "names": ["kind", "min", "max", "center", "steps", "middleC"] },
    "bytesRead": { "path": "ce.midi.read", "at": 3, "param": "opts", "refusal": "nothing", "names": ["bits", "order"] },
    "bytesWrite": { "path": "ce.midi.write", "at": 4, "param": "opts", "refusal": "nothing", "names": ["bits", "order"] },
}
# The keys `opts` holds that `shape` does not list, in groups: its own, then those inside each
# option that lists fields of its own, in the contract's order.
def __ce_unknownOptions(opts, shape, parent, out):
    names = shape["names"]
    unknown = sorted(k for k in opts
                     if isinstance(k, str) and k not in names and not (k.isascii() and k.isdigit()))
    if unknown:
        out.append({ "parent": parent, "keys": unknown, "shape": shape })
    nested = shape.get("nested") or {}
    for name in names:
        if name in nested and isinstance(opts.get(name), dict):
            __ce_unknownOptions(opts[name], nested[name], (parent + "." + name) if parent else name, out)
    return out

def __ce_optionsLine(path, group):
    p = group["parent"]
    quoted = ['"' + (p + "." if p else "") + k + '"' for k in group["keys"]]
    if len(quoted) == 1:
        what = quoted[0] + " is not one of its options, so nothing was done."
    else:
        what = ", ".join(quoted[:-1]) + " and " + quoted[-1] + " are not among its options, so nothing was done."
    names = group["shape"]["names"]
    if len(names) == 1:
        listed = ("The only option of " + p if p else "Its only option") + " is " + names[0] + "."
    else:
        listed = ("The options of " + p if p else "Its options") + " are: " + ", ".join(names) + "."
    return path + ": " + what + " " + listed

def __ce_refused(refusal, lines):
    if refusal == "false": return False
    if refusal == "zero": return 0
    if refusal == "empty list": return []
    if refusal == "result": return { "ok": False, "error": " ".join(lines) }
    return None

def __ce_optionChecked(fn, spec):
    def checked(*args, **kwargs):
        at = spec["at"]
        opts = args[at] if len(args) > at else kwargs.get(spec["param"])
        if isinstance(opts, dict):
            groups = __ce_unknownOptions(opts, spec, "", [])
            if groups:
                lines = [__ce_optionsLine(spec["path"], g) for g in groups]
                for line in lines:
                    logError(line)
                return __ce_refused(spec["refusal"], lines)
        return fn(*args, **kwargs)
    return checked

__ceOptionId = None
for __ceOptionId in __CE_OPTIONS:
    if callable(globals().get(__ceOptionId)):
        globals()[__ceOptionId] = __ce_optionChecked(globals()[__ceOptionId], __CE_OPTIONS[__ceOptionId])
# del, for the reason the stub list gives: a module-level loop variable outlives its loop.
del __ceOptionId
# END GENERATED option keys
# BEGIN GENERATED module namespace — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
# Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
# on top. ce.core is global: its members are never namespaced, so they appear here only for
# discoverability (ce.core.set is the same function as set).
import types as __ce_types
__CE_MODULES = {
    "ce.core": { "action": "defineAction", "compute": "compute", "emit": "emit", "error": "logError", "get": "get", "intercept": "intercept", "log": "log", "noTransmit": "noTransmit", "off": "off", "on": "on", "run": "run", "set": "set", "transmit": "transmit", "warn": "logWarn", "watch": "watch" },
    "ce.midi": { "checksum": "checksum", "denibblize": "denibblize", "feed": "feedMidi", "find": "bytesFind", "from14bit": "from14bit", "from7bit": "from7bit", "fromAscii": "fromAscii", "fromBase64": "bytesFromBase64", "fromHex": "bytesFromHex", "fromNibbles": "fromNibbles", "fromOffset": "fromOffset", "fromSigned": "fromSigned", "getBits": "getBits", "interceptIn": "interceptMidiIn", "interceptOut": "interceptMidiOut", "nibblize": "nibblize", "panic": "panic", "put": "bytesPut", "read": "bytesRead", "route": "routeMidi", "sendAftertouch": "sendAftertouch", "sendCC": "sendCC", "sendClock": "sendClock", "sendMidi": "sendMidi", "sendNRPN": "sendNRPN", "sendNote": "sendNote", "sendNoteOff": "sendNoteOff", "sendPitchBend": "sendPitchBend", "sendProgramChange": "sendProgramChange", "sendRPN": "sendRPN", "sendSongPosition": "sendSongPosition", "sendSysex": "sendSysex", "sendTransport": "sendTransport", "setBits": "setBits", "slice": "bytesSlice", "to14bit": "to14bit", "to7bit": "to7bit", "toAscii": "toAscii", "toBase64": "bytesToBase64", "toHex": "bytesToHex", "toNibbles": "toNibbles", "toOffset": "toOffset", "toSigned": "toSigned", "write": "bytesWrite" },
    "ce.device": { "applyDump": "applyDump", "bind": "deviceBind", "buildDump": "buildDump", "connected": "deviceConnected", "coverage": "deviceCoverage", "defineDump": "deviceDefineDump", "defineParameter": "deviceDefineParameter", "parameter": "deviceParameter", "parameters": "deviceParameters", "ports": "devicePorts", "preset": "preset", "profile": "deviceProfile", "read": "deviceRead", "recallPreset": "recallPreset", "recipes": "deviceRecipes", "requestDump": "requestDump", "requests": "deviceRequests", "sendDump": "sendDump", "setTiming": "deviceSetTiming", "setVariable": "deviceSetVariable", "timing": "deviceTiming", "unbind": "deviceUnbind", "variables": "deviceVariables", "write": "deviceWrite" },
    "ce.math": { "almost": "almost", "alpha": "colourAlpha", "angle": "angleOf", "approach": "approach", "bipolar": "bipolar", "blend": "blend", "blendBy": "blendBy", "chance": "randomBool", "choice": "randomChoice", "clamp": "clamp", "crossfade": "crossfade", "curve": "curve", "darken": "darken", "dbPosition": "dbPosition", "dbToGain": "dbToGain", "deadzone": "deadzone", "degrees": "toDegrees", "denorm": "denorm", "distance": "distance", "euclid": "euclid", "fold": "fold", "fromARGB": "colourFromArgb", "fromHsl": "hslToHex", "fromRGBA": "colourFromRgba", "gainToDb": "gainToDb", "gaussian": "randomGaussian", "hex": "rgbToHex", "hsl": "hexToHsl", "hysteresis": "hysteresis", "index": "indexOfRange", "lerp": "lerp", "lighten": "lighten", "map": "mapCurve", "max": "maxOf", "mean": "meanOf", "median": "median", "min": "minOf", "mix": "mixColour", "norm": "norm", "polar": "polar", "quantize": "quantizeTo", "radians": "toRadians", "random": "random", "randomFloat": "randomFloat", "rgb": "hexToRgb", "round": "round", "roundTo": "roundTo", "scale": "scale", "seed": "randomSeed", "shape": "shapeCurve", "shuffle": "shuffle", "smooth": "smooth", "snap": "snap", "stream": "randomStream", "sum": "sumOf", "ticks": "tickStops", "unipolar": "unipolar", "unshape": "unshape", "walk": "randomWalk", "weights": "weightsFor", "wrap": "wrap" },
    "ce.format": { "clock": "formatClock", "db": "formatDb", "division": "formatDivision", "fit": "formatFit", "hz": "formatHz", "line": "formatLine", "note": "formatNote", "number": "formatNumber", "pan": "formatPan", "parameter": "formatParameter", "parse": "formatParse", "percent": "formatPercent", "ratio": "formatRatio", "table": "formatTable", "time": "formatTime" },
    "ce.music": { "arp": "arpOrder", "chord": "chordNotes", "degree": "scaleDegree", "degreeChord": "degreeChord", "inScale": "inScale", "lead": "voiceLead", "name": "noteName", "number": "noteNumber", "octaves": "expandOctaves", "quality": "chordQuality", "quantize": "quantizeNote", "scale": "scaleNotes", "spelling": "noteSpelling" },
    "ce.time": { "after": "after", "afterBeats": "afterBeats", "beatsToMs": "beatsToMs", "clockTempo": "clockTempo", "cycle": "cycleAt", "division": "beatsPerDivision", "divisions": "divisionNames", "looped": "loopedBeats", "msToBeats": "msToBeats", "now": "nowMs", "playing": "isPlaying", "position": "barBeatAt", "startTimer": "startTimer", "step": "stepAt", "steps": "stepsBetween", "stopTimer": "stopTimer", "swing": "swingOffset", "syncTimer": "syncTimer", "tap": "tapTempo", "tempo": "tempo", "timers": "runningTimers", "transport": "transportInfo" },
    "ce.anim": { "envelope": "animateEnvelope", "finish": "animateFinish", "list": "animateList", "pause": "animatePause", "play": "animatePlay", "resume": "animateResume", "reverse": "animateReverse", "running": "animateRunning", "spring": "animateSpring", "stop": "animateStop", "to": "animateTo", "value": "animateValue" },
    "ce.ui": { "choose": "uiChoose", "copy": "uiCopy", "dialog": "uiDialog", "dismiss": "uiDismiss", "notify": "uiNotify", "prompt": "uiPrompt", "state": "uiState", "status": "uiStatus", "update": "uiUpdate" },
    "ce.draw": { "arc": "drawArc", "batch": "drawBatch", "blend": "drawBlend", "circle": "drawCircle", "clear": "drawClear", "clip": "drawClip", "curve": "drawCurve", "ellipse": "drawEllipse", "fill": "drawFill", "gradient": "drawGradient", "grid": "drawGrid", "image": "drawImage", "line": "drawLine", "lines": "drawLines", "measure": "drawMeasure", "opacity": "drawOpacity", "path": "drawPath", "pixelText": "drawPixelText", "points": "drawPoints", "polygon": "drawPolygon", "rect": "drawRect", "redraw": "drawRedraw", "restore": "drawRestore", "save": "drawSave", "stroke": "drawStroke", "text": "drawText", "transform": "drawTransform" },
    "ce.panel": { "align": "panelAlign", "batch": "panelBatch", "circle": "panelCircle", "clone": "panelClone", "create": "panelCreate", "define": "panelDefine", "destroy": "panelDestroy", "distribute": "panelDistribute", "each": "panelEach", "entries": "panelEntries", "entry": "panelEntry", "find": "panelFind", "flip": "panelFlip", "grid": "panelGrid", "info": "panelInfo", "keep": "panelKeep", "match": "panelMatch", "order": "panelOrder", "parent": "panelParent", "patch": "panelPatch", "rect": "panelRect", "restore": "panelRestore", "snapshot": "panelSnapshot", "types": "panelTypes", "undefine": "panelUndefine" },
    "ce.storage": { "all": "allSettings", "clear": "clearSettings", "decode": "decodeJson", "encode": "encodeJson", "forget": "forgetSetting", "info": "storageInfo", "loadSetting": "loadSetting", "saveSetting": "saveSetting", "settings": "listSettings", "state": "state" },
    "ce.image": { "asset": "imageAsset", "assets": "imageAssets", "clear": "imageClear", "embed": "imageEmbed", "icon": "imageIcon", "load": "imageLoad", "read": "imageRead", "set": "imageSet" },
    "ce.patch": { "apply": "patchApply", "blend": "patchBlend", "current": "patchCurrent", "define": "patchDefine", "diff": "patchDiff", "equal": "patchEqual", "forget": "patchForget", "list": "patchList", "load": "patchLoad", "merge": "patchMerge", "morph": "patchMorph", "mutate": "patchMutate", "random": "patchRandom", "read": "patchRead", "save": "patchSave", "scopes": "patchScopes", "write": "patchWrite" },
    "ce.keys": { "focus": "keysFocus", "focused": "keysFocused", "held": "keysHeld", "isDown": "keysIsDown", "list": "keysList", "piano": "keysPiano", "pianoInfo": "keysPianoInfo", "remove": "keysRemove", "shortcut": "keysShortcut" },
    "ce.text": { "axis": "textAxis", "fit": "textFit", "font": "textFont", "fonts": "textFonts", "measure": "textMeasure", "read": "textRead", "style": "textStyle" },
    "ce.components.split": { "channel": "splitChannel", "mute": "splitMute", "point": "splitPoint", "preset": "splitPreset", "read": "splitRead", "transpose": "splitTranspose" },
    "ce.components.phrase": { "cell": "phraseCell", "clear": "phraseClear", "direction": "phraseDirection", "key": "phraseKey", "read": "phraseRead", "run": "phraseRun", "scale": "phraseScale", "seed": "phraseSeed", "transpose": "phraseTranspose" },
    "ce.components.recorder": { "bars": "recorderBars", "clear": "recorderClear", "countIn": "recorderCountIn", "load": "recorderLoad", "nudge": "recorderNudge", "play": "recorderPlay", "quantize": "recorderQuantize", "read": "recorderRead", "record": "recorderRecord", "shift": "recorderShift", "source": "recorderSource", "stop": "recorderStop", "store": "recorderStore", "transpose": "recorderTranspose", "undo": "recorderUndo" },
    "ce.components.harmony": { "channel": "harmonyChannel", "degree": "harmonyDegree", "inversion": "harmonyInversion", "keepPlayed": "harmonyKeepPlayed", "key": "harmonyKey", "mode": "harmonyMode", "octave": "harmonyOctave", "outOfKey": "harmonyOutOfKey", "read": "harmonyRead", "scale": "harmonyScale", "shape": "harmonyShape", "size": "harmonySize", "strum": "harmonyStrum", "voiceLeading": "harmonyVoiceLeading", "voicing": "harmonyVoicing" },
    "ce.components.setlist": { "crossfade": "setlistCrossfade", "enable": "setlistEnable", "jump": "setlistGoto", "next": "setlistNext", "prev": "setlistPrev", "read": "setlistRead", "wrap": "setlistWrap" },
    "ce.components.arp": { "baseOctave": "arpBaseOctave", "channel": "arpChannel", "chordType": "arpChordType", "degree": "arpDegree", "division": "arpDivision", "editable": "arpEditable", "euclid": "arpEuclid", "euclidPulses": "arpEuclidPulses", "euclidRotate": "arpEuclidRotate", "euclidSteps": "arpEuclidSteps", "followPanelKey": "arpFollowPanelKey", "gate": "arpGate", "inputChannel": "arpInputChannel", "key": "arpKey", "latch": "arpLatch", "link": "arpLink", "mute": "arpMute", "octaves": "arpOctaves", "pattern": "arpPattern", "phase": "arpPhase", "rate": "arpRate", "read": "arpRead", "run": "arpRun", "scale": "arpScale", "showHeader": "arpShowHeader", "showNotes": "arpShowNotes", "source": "arpSource", "swing": "arpSwing", "sync": "arpSync", "velocity": "arpVelocity" },
    "ce.components.chordpad": { "baseOctave": "chordPadBaseOctave", "channel": "chordPadChannel", "chordType": "chordPadChordType", "echo": "chordPadEcho", "echoChannel": "chordPadEchoChannel", "editable": "chordPadEditable", "followPanelKey": "chordPadFollowPanelKey", "gridCols": "chordPadGridCols", "inversion": "chordPadInversion", "key": "chordPadKey", "latch": "chordPadLatch", "layout": "chordPadLayout", "mode": "chordPadMode", "noteSpan": "chordPadNoteSpan", "octave": "chordPadOctave", "read": "chordPadRead", "scale": "chordPadScale", "showPiano": "chordPadShowPiano", "showRomans": "chordPadShowRomans", "strum": "chordPadStrum", "velocity": "chordPadVelocity", "voicing": "chordPadVoicing" },
    "ce.components.noteribbon": { "baseNote": "noteRibbonBaseNote", "bendRange": "noteRibbonBendRange", "channel": "noteRibbonChannel", "echo": "noteRibbonEcho", "echoChannel": "noteRibbonEchoChannel", "editable": "noteRibbonEditable", "followPanelKey": "noteRibbonFollowPanelKey", "key": "noteRibbonKey", "latch": "noteRibbonLatch", "modAxis": "noteRibbonModAxis", "modCc": "noteRibbonModCc", "mode": "noteRibbonMode", "octaves": "noteRibbonOctaves", "orientation": "noteRibbonOrientation", "read": "noteRibbonRead", "scale": "noteRibbonScale", "showHeader": "noteRibbonShowHeader", "showNames": "noteRibbonShowNames", "velocity": "noteRibbonVelocity", "velocityFrom": "noteRibbonVelocityFrom" },
    "ce.components.drumpads": { "baseNote": "drumPadsBaseNote", "channel": "drumPadsChannel", "choke": "drumPadsChoke", "colour": "drumPadsColour", "cols": "drumPadsCols", "cornerBottomLeft": "drumPadsCornerBottomLeft", "cornerBottomRight": "drumPadsCornerBottomRight", "cornerSize": "drumPadsCornerSize", "cornerTopLeft": "drumPadsCornerTopLeft", "cornerTopRight": "drumPadsCornerTopRight", "echo": "drumPadsEcho", "echoChannel": "drumPadsEchoChannel", "editable": "drumPadsEditable", "fill": "drumPadsFill", "flamMs": "drumPadsFlamMs", "gate": "drumPadsGate", "ghostVelocity": "drumPadsGhostVelocity", "label": "drumPadsLabel", "map": "drumPadsMap", "mode": "drumPadsMode", "note": "drumPadsNote", "origin": "drumPadsOrigin", "read": "drumPadsRead", "roll": "drumPadsRoll", "rollDelay": "drumPadsRollDelay", "rollHz": "drumPadsRollHz", "rollRate": "drumPadsRollRate", "rollSync": "drumPadsRollSync", "rollVelocity": "drumPadsRollVelocity", "rows": "drumPadsRows", "showHeader": "drumPadsShowHeader", "showLabels": "drumPadsShowLabels", "showNotes": "drumPadsShowNotes", "size": "drumPadsSize", "velocity": "drumPadsVelocity", "velocityFrom": "drumPadsVelocityFrom", "zones": "drumPadsZones" },
    "ce.components.turing": { "division": "turingDivision", "editable": "turingEditable", "fill": "turingFill", "gate": "turingGate", "length": "turingLength", "phase": "turingPhase", "quantize": "turingQuantize", "randomness": "turingRandomness", "rate": "turingRate", "read": "turingRead", "run": "turingRun", "showDivisions": "turingShowDivisions", "showGate": "turingShowGate", "size": "turingSize", "step": "turingStep", "sync": "turingSync" },
    "ce.components.looper": { "bars": "looperBars", "editable": "looperEditable", "fill": "looperFill", "insert": "looperInsert", "lane": "looperLane", "laneRest": "looperLaneRest", "phase": "looperPhase", "quantize": "looperQuantize", "read": "looperRead", "remove": "looperRemove", "run": "looperRun", "seconds": "looperSeconds", "showDivisions": "looperShowDivisions", "showGrid": "looperShowGrid", "showPlayhead": "looperShowPlayhead", "size": "looperSize", "sync": "looperSync" },
    "ce.components.orbit": { "bars": "orbitBars", "editable": "orbitEditable", "fill": "orbitFill", "insert": "orbitInsert", "node": "orbitNode", "nodeAngle": "orbitNodeAngle", "nodeDepth": "orbitNodeDepth", "nodeRadius": "orbitNodeRadius", "nodeRatio": "orbitNodeRatio", "phase": "orbitPhase", "rate": "orbitRate", "read": "orbitRead", "remove": "orbitRemove", "run": "orbitRun", "showRings": "orbitShowRings", "showSpokes": "orbitShowSpokes", "showTrails": "orbitShowTrails", "showValues": "orbitShowValues", "size": "orbitSize", "sync": "orbitSync" },
    "ce.components.kinetic": { "bounce": "kineticBounce", "editable": "kineticEditable", "friction": "kineticFriction", "gravity": "kineticGravity", "keepAlive": "kineticKeepAlive", "launch": "kineticLaunch", "read": "kineticRead", "run": "kineticRun", "showTrail": "kineticShowTrail", "showWalls": "kineticShowWalls", "sync": "kineticSync", "velocity": "kineticVelocity" },
    "ce.components.constellation": { "bars": "constellationBars", "blend": "constellationBlend", "editable": "constellationEditable", "links": "constellationLinks", "mode": "constellationMode", "probe": "constellationProbe", "rate": "constellationRate", "read": "constellationRead", "run": "constellationRun", "showField": "constellationShowField", "showLabels": "constellationShowLabels", "showLinks": "constellationShowLinks", "sync": "constellationSync" },
    "ce.components.timbre": { "anchorX": "timbreAnchorX", "anchorY": "timbreAnchorY", "axisX": "timbreAxisX", "axisY": "timbreAxisY", "editable": "timbreEditable", "fill": "timbreFill", "insert": "timbreInsert", "move": "timbreMove", "power": "timbrePower", "read": "timbreRead", "remove": "timbreRemove", "showAnchors": "timbreShowAnchors", "showField": "timbreShowField", "showReadout": "timbreShowReadout", "size": "timbreSize" },
    "ce.components.router": { "cc": "routerCc", "channel": "routerChannel", "curveShape": "routerCurveShape", "curveX": "routerCurveX", "curveY": "routerCurveY", "deadzone": "routerDeadzone", "dest": "routerDest", "destDepth": "routerDestDepth", "editable": "routerEditable", "fill": "routerFill", "input": "routerInput", "insert": "routerInsert", "invert": "routerInvert", "poly": "routerPoly", "read": "routerRead", "remove": "routerRemove", "showDivisions": "routerShowDivisions", "showGrid": "routerShowGrid", "size": "routerSize", "source": "routerSource", "sourceControl": "routerSourceControl" },
    "ce.components.macro": { "editable": "macroEditable", "fill": "macroFill", "insert": "macroInsert", "label": "macroLabel", "read": "macroRead", "remove": "macroRemove", "showDivisions": "macroShowDivisions", "showLanes": "macroShowLanes", "showValues": "macroShowValues", "size": "macroSize", "slot": "macroSlot", "slotCurve": "macroSlotCurve", "slotDepth": "macroSlotDepth", "slotMax": "macroSlotMax", "slotMin": "macroSlotMin", "value": "macroValue" },
    "ce.components.matrix": { "bipolar": "matrixBipolar", "cell": "matrixCell", "cellStyle": "matrixCellStyle", "clear": "matrixClear", "editable": "matrixEditable", "fill": "matrixFill", "read": "matrixRead", "showLabels": "matrixShowLabels", "showValues": "matrixShowValues", "size": "matrixSize", "step": "matrixStep" },
    "ce.components.constraint": { "editable": "constraintEditable", "fill": "constraintFill", "gap": "constraintGap", "insert": "constraintInsert", "member": "constraintMember", "mode": "constraintMode", "read": "constraintRead", "remove": "constraintRemove", "showBadge": "constraintShowBadge", "showValues": "constraintShowValues", "size": "constraintSize" },
    "ce.components.envelope": { "addOnDoubleClick": "envelopeAddOnDoubleClick", "editable": "envelopeEditable", "fill": "envelopeFill", "fillUnder": "envelopeFillUnder", "insert": "envelopeInsert", "loop": "envelopeLoop", "loopEnd": "envelopeLoopEnd", "loopStart": "envelopeLoopStart", "phase": "envelopePhase", "phaseSource": "envelopePhaseSource", "pointCurve": "envelopePointCurve", "pointX": "envelopePointX", "pointY": "envelopePointY", "preset": "envelopePreset", "read": "envelopeRead", "remove": "envelopeRemove", "showGrid": "envelopeShowGrid", "showPlayhead": "envelopeShowPlayhead", "size": "envelopeSize", "snapX": "envelopeSnapX", "snapY": "envelopeSnapY", "sustain": "envelopeSustain", "timeMax": "envelopeTimeMax" },
    "ce.components.ribbon": { "bipolar": "ribbonBipolar", "editable": "ribbonEditable", "label": "ribbonLabel", "orientation": "ribbonOrientation", "read": "ribbonRead", "returnCurve": "ribbonReturnCurve", "returnMode": "ribbonReturnMode", "returnTime": "ribbonReturnTime", "returnValue": "ribbonReturnValue", "showGlow": "ribbonShowGlow", "showValue": "ribbonShowValue", "snap": "ribbonSnap", "style": "ribbonStyle", "value": "ribbonValue", "valuePrecision": "ribbonValuePrecision" },
    "ce.components.crossfader": { "bipolar": "crossfaderBipolar", "detent": "crossfaderDetent", "editable": "crossfaderEditable", "labelA": "crossfaderLabelA", "labelB": "crossfaderLabelB", "law": "crossfaderLaw", "mix": "crossfaderMix", "orientation": "crossfaderOrientation", "read": "crossfaderRead", "returnCurve": "crossfaderReturnCurve", "returnMode": "crossfaderReturnMode", "returnTime": "crossfaderReturnTime", "returnValue": "crossfaderReturnValue", "showGains": "crossfaderShowGains", "showLabels": "crossfaderShowLabels" },
    "ce.components.joystick": { "bipolar": "joystickBipolar", "cornerLabel": "joystickCornerLabel", "editable": "joystickEditable", "fill": "joystickFill", "move": "joystickMove", "read": "joystickRead", "returnAxes": "joystickReturnAxes", "returnCurve": "joystickReturnCurve", "returnMode": "joystickReturnMode", "returnTime": "joystickReturnTime", "returnValue": "joystickReturnValue", "showCorners": "joystickShowCorners", "showCrosshair": "joystickShowCrosshair", "showGrid": "joystickShowGrid", "showTrail": "joystickShowTrail", "size": "joystickSize" },
    "ce.components.meter": { "dbCeil": "meterDbCeil", "dbFloor": "meterDbFloor", "decay": "meterDecay", "fill": "meterFill", "gradient": "meterGradient", "holdMs": "meterHoldMs", "insert": "meterInsert", "label": "meterLabel", "orientation": "meterOrientation", "peakHold": "meterPeakHold", "read": "meterRead", "remove": "meterRemove", "scale": "meterScale", "showScaleLabels": "meterShowScaleLabels", "showTicks": "meterShowTicks", "showValue": "meterShowValue", "size": "meterSize", "source": "meterSource", "value": "meterValue", "valueMax": "meterValueMax", "valueMin": "meterValueMin", "valuePrecision": "meterValuePrecision", "valuePrefix": "meterValuePrefix", "valueSuffix": "meterValueSuffix", "zoneAt": "meterZoneAt" },
    "ce.components.transport": { "beatUnit": "transportBeatUnit", "beatsPerBar": "transportBeatsPerBar", "bpm": "transportBpm", "clockDevice": "transportClockDevice", "clockOut": "transportClockOut", "countIn": "transportCountIn", "editable": "transportEditable", "loop": "transportLoop", "loopBars": "transportLoopBars", "loopStart": "transportLoopStart", "read": "transportRead", "runOnLoad": "transportRunOnLoad", "showPosition": "transportShowPosition", "showTap": "transportShowTap", "source": "transportSource", "swing": "transportSwing" },
    "ce.components.panic": { "centreBend": "panicSetCentreBend", "channel": "panicSetChannel", "clearLocal": "panicSetClearLocal", "editable": "panicSetEditable", "label": "panicSetLabel", "read": "panicSetRead", "resetControllers": "panicSetResetControllers", "scope": "panicSetScope", "showSummary": "panicSetShowSummary" },
    "ce.components.lcd": { "anim": "lcdAnim", "animFps": "lcdAnimFps", "animLoop": "lcdAnimLoop", "animPreset": "lcdAnimPreset", "animSpeed": "lcdAnimSpeed", "backlight": "lcdBacklight", "backlightSource": "lcdBacklightSource", "blink": "lcdBlink", "blinkRate": "lcdBlinkRate", "brightness": "lcdBrightness", "brightnessSource": "lcdBrightnessSource", "clear": "lcdClear", "contrast": "lcdContrast", "cursor": "lcdCursor", "cursorAt": "lcdCursorAt", "cursorBlink": "lcdCursorBlink", "editText": "lcdEditText", "fill": "lcdFill", "glyph": "lcdGlyph", "read": "lcdRead", "scroll": "lcdScroll", "scrollMode": "lcdScrollMode", "scrollRepeat": "lcdScrollRepeat", "scrollSpeed": "lcdScrollSpeed", "showGhost": "lcdShowGhost", "showGlass": "lcdShowGlass", "showGrid": "lcdShowGrid", "showScanlines": "lcdShowScanlines", "size": "lcdSize", "text": "lcdText", "value": "lcdValue", "valueMax": "lcdValueMax", "valueMin": "lcdValueMin", "valuePrecision": "lcdValuePrecision", "valuePrefix": "lcdValuePrefix", "valueSource": "lcdValueSource", "valueSuffix": "lcdValueSuffix" },
    "ce.components.pixel": { "anim": "pixelAnim", "animFps": "pixelAnimFps", "animLoop": "pixelAnimLoop", "animPreset": "pixelAnimPreset", "animSpeed": "pixelAnimSpeed", "backlight": "pixelBacklight", "backlightSource": "pixelBacklightSource", "blink": "pixelBlink", "brightness": "pixelBrightness", "brightnessSource": "pixelBrightnessSource", "contrast": "pixelContrast", "editText": "pixelEditText", "gamma": "pixelGamma", "glow": "pixelGlow", "h": "pixelH", "label": "pixelLabel", "layoutTransition": "pixelLayoutTransition", "read": "pixelRead", "show": "pixelShow", "showGhost": "pixelShowGhost", "showGlass": "pixelShowGlass", "showGrid": "pixelShowGrid", "showScanlines": "pixelShowScanlines", "text": "pixelText", "transitionMs": "pixelTransitionMs", "w": "pixelW", "x": "pixelX", "y": "pixelY" },
}
__CE_ORDER = ["ce.core","ce.midi","ce.device","ce.math","ce.format","ce.music","ce.time","ce.anim","ce.ui","ce.draw","ce.panel","ce.storage","ce.image","ce.patch","ce.keys","ce.text","ce.components.split","ce.components.phrase","ce.components.recorder","ce.components.harmony","ce.components.setlist","ce.components.arp","ce.components.chordpad","ce.components.noteribbon","ce.components.drumpads","ce.components.turing","ce.components.looper","ce.components.orbit","ce.components.kinetic","ce.components.constellation","ce.components.timbre","ce.components.router","ce.components.macro","ce.components.matrix","ce.components.constraint","ce.components.envelope","ce.components.ribbon","ce.components.crossfader","ce.components.joystick","ce.components.meter","ce.components.transport","ce.components.panic","ce.components.lcd","ce.components.pixel"]
__CE_META = [
    { "id": "ce.core", "version": "1.1", "runtime": "any" },
    { "id": "ce.midi", "version": "1.3", "runtime": "any" },
    { "id": "ce.device", "version": "1.3", "runtime": "any" },
    { "id": "ce.math", "version": "1.8", "runtime": "any" },
    { "id": "ce.format", "version": "1.1", "runtime": "any" },
    { "id": "ce.music", "version": "1.2", "runtime": "any" },
    { "id": "ce.time", "version": "1.3", "runtime": "any" },
    { "id": "ce.anim", "version": "1.1", "runtime": "any" },
    { "id": "ce.ui", "version": "1.2", "runtime": "webview" },
    { "id": "ce.draw", "version": "1.2", "runtime": "webview" },
    { "id": "ce.panel", "version": "1.4", "runtime": "any" },
    { "id": "ce.storage", "version": "1.2", "runtime": "any" },
    { "id": "ce.image", "version": "1.0", "runtime": "webview" },
    { "id": "ce.patch", "version": "1.0", "runtime": "any" },
    { "id": "ce.keys", "version": "1.0", "runtime": "webview" },
    { "id": "ce.text", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.split", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.phrase", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.recorder", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.harmony", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.setlist", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.arp", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.chordpad", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.noteribbon", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.drumpads", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.turing", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.looper", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.orbit", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.kinetic", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.constellation", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.timbre", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.router", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.macro", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.matrix", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.constraint", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.envelope", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.ribbon", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.crossfader", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.joystick", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.meter", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.transport", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.panic", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.lcd", "version": "1.0", "runtime": "webview" },
    { "id": "ce.components.pixel", "version": "1.0", "runtime": "webview" },
]
__CE_VALUES = { "state": True }
__CE_GATE_MSG = "{member}() needs the {module} module, which this panel has not enabled. Add \"{module}\" to the panel's Scripting Modules (Export tab) — or clear the list to let it follow the scripts automatically."
# The real implementation of every member, captured before anything is gated, so turning a module
# back on restores the function rather than leaving the stub in place.
__CE_REAL = {}
ce = __ce_types.SimpleNamespace()

def __ce_gate(__member, __module):
    def __stub(*args, **kwargs):
        log(__CE_GATE_MSG.replace("{member}", __member).replace("{module}", __module))
    return __stub

# __ce_apply_modules(enabled) — enabled is a list of module ids, or None for "everything on".
# The host calls this with the panel's resolved list; a member of a module that is not on becomes
# a stub that names the module instead of a call that quietly works.
def __ce_apply_modules(enabled):
    global ce
    __g = globals()
    __on = None
    if enabled is not None:
        __on = { "ce.core": True }
        for __id in enabled:
            __on[__id] = True
    ce = __ce_types.SimpleNamespace()
    for __path in __CE_ORDER:
        __live = (__on is None) or (__on.get(__path) is True)
        __node = ce
        for __seg in __path.split(".")[1:]:
            if not hasattr(__node, __seg):
                setattr(__node, __seg, __ce_types.SimpleNamespace())
            __node = getattr(__node, __seg)
        for __short, __global in __CE_MODULES[__path].items():
            if __global not in __CE_REAL:
                __CE_REAL[__global] = __g.get(__global)
            __v = __CE_REAL[__global]
            if (not __live) and (__CE_VALUES.get(__global) is not True):
                __v = __ce_gate(__global, __path)
            __g[__global] = __v
            setattr(__node, __short, __v)
    ce.version = "1.0"
    ce.runtime = "player"
    ce.language = "python"
    ce.modules = [__m for __m in __CE_META if __on is None or __on.get(__m["id"]) is True]
    def __ce_has(__id):
        for __m in ce.modules:
            if __m["id"] == __id:
                return __m["runtime"] == "any" or __m["runtime"] == ce.runtime
        return False
    ce.has = __ce_has
    __g["ce"] = ce


# __ce_register_module(path, members, version, runtime) — add an INSTALLED third-party module
# (ce.ext.*) to the same tables the built-in ones live in. The host evaluates the module's own
# prelude first, so its globals already exist by the time this runs; re-applying the gate then
# treats it exactly like anything else.
def __ce_register_module(path, members, version, runtime):
    if path not in __CE_MODULES:
        __CE_ORDER.append(path)
    __CE_MODULES[path] = members
    for __m in __CE_META:
        if __m["id"] == path:
            __m["version"] = version
            __m["runtime"] = runtime
            return
    __CE_META.append({ "id": path, "version": version, "runtime": runtime })

__ce_apply_modules(None)
# END GENERATED module namespace
)PY";

} // namespace

// --- the runtime: started once, shared by every instance's interpreter ---------------------------
namespace
{

// Where the stdlib lives: env override → `PythonRuntime` next to THIS binary → none. `diag`
// accumulates what we found, surfaced into the script log so a failure is debuggable in-host.
juce::String resolvePythonHome (juce::String& diag)
{
    if (auto env = juce::SystemStats::getEnvironmentVariable ("CEDITOR_PYTHONHOME", {}); env.isNotEmpty())
    { diag << "env CEDITOR_PYTHONHOME=" << env; return env; }

    // In a PLUGIN the process exe is the HOST (reaper.exe), so currentExecutableFile is wrong. Get
    // the directory of THIS module (the plugin DLL / this code) instead, so we find the bundled runtime.
    juce::File moduleDir;
   #if defined(_WIN32)
    HMODULE hmod = nullptr;
    if (GetModuleHandleExW (GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                            reinterpret_cast<LPCWSTR> (&resolvePythonHome), &hmod) && hmod != nullptr)
    {
        wchar_t path[MAX_PATH] = {};
        if (GetModuleFileNameW (hmod, path, MAX_PATH) > 0)
            moduleDir = juce::File (juce::String (path)).getParentDirectory();
    }
   #elif defined(__APPLE__) || defined(__linux__)
    // dladdr on a locally-defined symbol resolves the .dylib/.so that contains THIS code (the
    // plugin), whose folder holds the bundled PythonRuntime — currentExecutableFile would give the
    // HOST exe (reaper, etc.), the wrong place to look.
    Dl_info di {};
    if (dladdr (reinterpret_cast<void*> (&resolvePythonHome), &di) && di.dli_fname != nullptr)
        moduleDir = juce::File (juce::String::fromUTF8 (di.dli_fname)).getParentDirectory();
   #endif
    if (moduleDir == juce::File())
        moduleDir = juce::File::getSpecialLocation (juce::File::currentExecutableFile).getParentDirectory();

    diag << "moduleDir=" << moduleDir.getFullPathName();
    // Candidates: next to the binary (Windows/Linux layout), a Resources child, and — for the macOS
    // .vst3 bundle, where the binary is in Contents/MacOS — the sibling Contents/Resources.
    for (auto candidate : { moduleDir.getChildFile ("PythonRuntime"),
                            moduleDir.getChildFile ("Resources").getChildFile ("PythonRuntime"),
                            moduleDir.getParentDirectory().getChildFile ("Resources").getChildFile ("PythonRuntime") })
        if (candidate.isDirectory()) { diag << " (found PythonRuntime)"; return candidate.getFullPathName(); }

    diag << " (no PythonRuntime alongside)";
    return {}; // fall back to the interpreter's compiled-in default (a dev Python install)
}

struct PythonRuntime
{
    bool ok = false;
    juce::String info;   // why it failed, or where the stdlib was found — for the log
};

/** CPython, initialised once with the bundled stdlib home if there is one, and the GIL let go so
    that each instance can take it for each call into its own interpreter. Never finalised: a plug-in
    cannot know it is the last thing in the process using Python. */
const PythonRuntime& pythonRuntime()
{
    static const PythonRuntime runtime = []
    {
        PythonRuntime r;
        if (Py_IsInitialized())
        {
            r.ok = true;
            r.info = "Python ready (started by the host or another component)";
            return r;
        }

        PyConfig config;
        PyConfig_InitIsolatedConfig (&config);   // don't read user site / env that could break a plugin
        config.site_import = 1;                  // but DO import site so the full stdlib is wired up

        juce::String diag;
        const auto home = resolvePythonHome (diag);
        if (home.isNotEmpty())
            PyConfig_SetBytesString (&config, &config.home, home.toRawUTF8());

        PyStatus status = Py_InitializeFromConfig (&config);
        PyConfig_Clear (&config);

        if (PyStatus_Exception (status))
        {
            r.info = "Python init FAILED: " + juce::String (status.err_msg ? status.err_msg : "unknown")
                   + " | home=" + (home.isNotEmpty() ? home : juce::String ("<none — isolated init can't auto-find stdlib>"))
                   + " | " + diag;
            juce::Logger::writeToLog ("[python] " + r.info);
            return r;
        }
        PyEval_SaveThread();
        r.ok = true;
        r.info = "Python ready | home=" + (home.isNotEmpty() ? home : juce::String ("<compiled-in>")) + " | " + diag;
        return r;
    }();
    return runtime;
}

/** The thread state to make current again when an entry ends with nothing current: the main
    interpreter's, if PyGILState had that one bound to this thread. Since 3.12, making a thread state
    current binds PyGILState to it, so after an entry into an instance PyGILState_Ensure on this
    thread would answer with that instance's interpreter, and hand it whatever Python called it —
    another component's, or the host's. It did exactly that to this engine's first version of this
    code, which then swapped to a thread state the instance had already freed. */
PyThreadState* gilStateToRestore()
{
    PyThreadState* bound = PyGILState_GetThisThreadState();
    return bound != nullptr && PyThreadState_GetInterpreter (bound) == PyInterpreterState_Main() ? bound : nullptr;
}

/** Lets go of the GIL, leaving nothing current and PyGILState bound to `restore` if there is one. */
void letGo (PyThreadState* restore)
{
    if (restore != nullptr) PyThreadState_Swap (restore);
    PyEval_SaveThread();
}

/** The GIL let go for a while if this thread holds it, and taken back after. */
struct GilReleased
{
    GilReleased() : saved (currentThreadState() != nullptr ? PyEval_SaveThread() : nullptr) {}
    ~GilReleased() { if (saved != nullptr) PyEval_RestoreThread (saved); }
    GilReleased (const GilReleased&) = delete;
    GilReleased& operator= (const GilReleased&) = delete;

    PyThreadState* saved;
};

} // namespace

// --- the engine --------------------------------------------------------------------------------
class PythonScriptEngine final : public ScriptEngine
{
public:
    // The interpreter is made by the first script that needs it: every instance has this engine,
    // and most panels have no Python.
    PythonScriptEngine() = default;

    ~PythonScriptEngine() override
    {
        if (sub == nullptr) return;
        {
            // The watchdog takes the GIL to stop a script: never wait for it while holding it.
            const GilReleased released;
            watchdog.stop();
        }
        reset();
        {
            const Entry entry (*this, false);
            bridgeOwner->host = nullptr;   // what the interpreter runs as it ends reaches no instance
            bridgeOwner->engine = nullptr;
            Py_CLEAR (timeLimit);
            Py_CLEAR (bridge);
        }
        // Ended from nothing current, or from inside another instance's call, which is current
        // again afterwards. Py_EndInterpreter leaves nothing current and the GIL let go.
        PyThreadState* const prev = currentThreadState();
        PyThreadState* const restore = prev == nullptr ? gilStateToRestore() : nullptr;
        if (prev == nullptr) PyEval_RestoreThread (sub);
        else                 PyThreadState_Swap (sub);
        Py_EndInterpreter (sub);
        sub = nullptr;
        if (prev != nullptr)         PyEval_RestoreThread (prev);
        else if (restore != nullptr) { PyEval_RestoreThread (restore); PyEval_SaveThread(); }
    }

    juce::String language() const override { return "python"; }

    bool installApi (ScriptHostApi& h) override
    {
        host = &h;
        if (bridgeOwner != nullptr) bridgeOwner->host = &h;
        return true;   // whether Python itself is there is said by the first script that needs it
    }

    // Stored, then re-applied to every namespace that already exists, so toggling a module in the
    // editor takes effect without reloading the scripts.
    void setEnabledModules (const juce::StringArray& moduleIds) override
    {
        enabledModules = moduleIds;
        if (! interpreterOk) return;
        const Entry entry (*this);
        const auto call = moduleGateCall();
        for (auto& [id, ns] : namespaces)
        {
            juce::ignoreUnused (id);
            if (! exec (call.toRawUTF8(), ns)) PyErr_Clear();
        }
    }

    // Each script has its own namespace dict, so a module has to be installed into each of them.
    void setExtensionModules (const juce::var& modules) override
    {
        extensions = modules;
        if (! interpreterOk) return;
        const auto boot = extensionBoot();
        if (boot.isEmpty()) return;
        const Entry entry (*this);
        for (auto& [id, ns] : namespaces)
        {
            juce::ignoreUnused (id);
            if (! exec (boot.toRawUTF8(), ns)) PyErr_Clear();
        }
    }

    bool loadScript (const ScriptDefinition& def, const ScriptErrorSink& onError) override
    {
        if (! interpreterTried) { interpreterTried = true; createInterpreter(); }
        if (! interpreterOk) { onError (def.id, initInfo.isNotEmpty() ? initInfo : juce::String ("Python interpreter failed to initialize")); return false; }
        const Entry entry (*this, false); // the clock starts below, after the prelude

        // Fresh namespace dict per script (isolation). Seed builtins + owner, then prelude + source.
        PyObject* ns = PyDict_New();
        if (ns == nullptr) { onError (def.id, pyError()); return false; }
        PyDict_SetItemString (ns, "__builtins__", PyEval_GetBuiltins());
        {
            // resolveSelfOwner: a panel script's `self` is the panel (see ScriptRuntime.h).
            PyObject* owner = PyUnicode_FromString (resolveSelfOwner (def).toRawUTF8());
            PyDict_SetItemString (ns, "__owner", owner);
            Py_XDECREF (owner);
            // ce.storage's "script" scope spells a private key with the owning script's id in it,
            // so the id has to be readable from the prelude the same way the owner already is.
            PyObject* sid = PyUnicode_FromString (def.id.toRawUTF8());
            PyDict_SetItemString (ns, "__scriptId", sid);
            Py_XDECREF (sid);
        }

        currentScriptId = def.id;          // so a module-level on() tags its listener correctly
        // Prelude, then the module gate, then the user source — the gate has to be in place before
        // any top-level statement runs. Each script gets its own namespace dict, so the gate is
        // applied per script here rather than once for the language (as Lua can).
        //
        // The prelude is the app's own code and the same for every script, so it is not on the
        // script's clock. Compiling it is most of a load, and on a slow machine it took longer than
        // the two seconds a script gets: the watchdog stopped it before the script had run a line
        // ("prelude error: script stopped: it ran for more than 2 s"), as a Windows CI runner did.
        // What a panel brings, its extension modules and its script, still runs on the clock.
        bool preludeOk = exec (kPrelude, ns);
        bool sourceOk = false;
        {
            const Entry timedEntry (*this); // module-level statements obey the execution budget
            preludeOk = preludeOk
                     && exec (extensionBoot().toRawUTF8(), ns)
                     && exec (moduleGateCall().toRawUTF8(), ns);
            sourceOk = preludeOk && exec (def.source.toRawUTF8(), ns);
        }
        currentScriptId = {};
        if (! preludeOk) { onError (def.id, "prelude error: " + pyError()); Py_DECREF (ns); return false; }
        if (! sourceOk)  { onError (def.id, "load error: " + pyError()); Py_DECREF (ns); return false; }

        if (auto it = namespaces.find (def.id); it != namespaces.end()) Py_DECREF (it->second);
        namespaces[def.id] = ns; // keep the ref
        return true;
    }

    bool hasHandler (const juce::String& scriptId, const juce::String& fn) const override
    {
        auto it = namespaces.find (scriptId);
        if (it == namespaces.end()) return false;
        const Entry entry (*this, false);
        PyObject* f = PyDict_GetItemString (it->second, fn.toRawUTF8()); // borrowed
        return f != nullptr && PyCallable_Check (f);
    }

    /** Call a prelude function in one namespace. Returns the NEW reference, or nullptr after
        reporting. `args` may be null for a no-arg call; ownership stays with the caller. */
    PyObject* callPreludeRaw (PyObject* ns, const char* fn, PyObject* args,
                              const ScriptErrorSink& onError, const juce::String& what)
    {
        PyObject* f = PyDict_GetItemString (ns, fn);       // borrowed
        if (f == nullptr || ! PyCallable_Check (f)) return nullptr;
        PyObject* r = args != nullptr ? PyObject_CallObject (f, args) : PyObject_CallNoArgs (f);
        if (r == nullptr) { onError (what, pyError()); return nullptr; }
        return r;
    }

    /** The same, for a call whose result is not wanted. */
    bool callPrelude (PyObject* ns, const char* fn, PyObject* args,
                      const ScriptErrorSink& onError, const juce::String& what)
    {
        PyObject* r = callPreludeRaw (ns, fn, args, onError, what);
        if (r == nullptr) return false;
        Py_DECREF (r);
        return true;
    }

    juce::var dispatch (const juce::String& scriptId, const juce::String& fn,
                        const juce::var& payload, const ScriptErrorSink& onError) override
    {
        auto it = namespaces.find (scriptId);
        if (it == namespaces.end()) return {};
        const Entry entry (*this);
        PyObject* f = PyDict_GetItemString (it->second, fn.toRawUTF8()); // borrowed
        if (f == nullptr || ! PyCallable_Check (f)) return {};

        PyObject* arg = varToPy (payload);
        if (arg == nullptr) { onError (scriptId, "failed to convert payload: " + pyError()); return {}; }
        currentScriptId = scriptId;        // a handler may call on()/off() while running
        PyObject* result = PyObject_CallFunctionObjArgs (f, arg, nullptr);
        currentScriptId = {};
        Py_DECREF (arg);

        if (result == nullptr) { onError (scriptId, pyError()); return {}; }
        auto v = pyToVar (result);
        Py_DECREF (result);
        return v;
    }

    void deliverEvent (const juce::String& target, const juce::String& event,
                       const juce::var& payload, const ScriptErrorSink& onError) override
    {
        if (! interpreterOk) return;
        const Entry entry (*this);
        PyObject* arg = varToPy (payload);              // convert ONCE; the call borrows it
        if (arg == nullptr) { onError ("on:" + event, "failed to convert payload: " + pyError()); return; }

        // Handlers may add or remove listeners. Keep an owned snapshot: off() decrements the live
        // record's callable, so copying only the raw pointer would still leave this dispatch with a
        // dangling reference.
        auto listenersAtStart = listeners;
        for (auto& l : listenersAtStart)
            Py_XINCREF (l.fn);

        for (auto& l : listenersAtStart)
        {
            if (l.event != event) continue;
            if (l.target != target && l.target != "*" && l.target != "self") continue;
            currentScriptId = l.scriptId;
            PyObject* r = PyObject_CallFunctionObjArgs (l.fn, arg, nullptr);
            currentScriptId = {};
            if (r == nullptr) onError ("on:" + event, pyError());
            else Py_DECREF (r);
        }
        for (auto& l : listenersAtStart)
            Py_XDECREF (l.fn);
        Py_DECREF (arg);                                // release the single owned ref
    }

    /* --------------------------------------------------------------- the reactive core
     * The rules live in each script's namespace (see __runReactive in the prelude), so the C++
     * side is only the caller. Every namespace gets a pass: a formula in one script has to settle
     * whatever moved in another. */
    void runReactive (const ScriptErrorSink& onError) override
    {
        if (! interpreterOk) return;
        const Entry entry (*this);
        for (auto& kv : namespaces)
            if (! callPrelude (kv.second, "__runReactive", nullptr, onError, "compute/watch")) { /* reported */ }
    }

    bool applyMidiFilter (bool inbound, juce::var& bytes, const ScriptErrorSink& onError) override
    {
        if (! interpreterOk) return true;
        const Entry entry (*this);
        for (auto& kv : namespaces)
        {
            PyObject* a = Py_BuildValue ("(ON)", inbound ? Py_True : Py_False, varToPy (bytes));
            if (a == nullptr) { PyErr_Clear(); continue; }
            PyObject* out = callPreludeRaw (kv.second, "__applyMidiFilter", a, onError, "interceptMidi");
            Py_DECREF (a);
            if (out == nullptr) continue;
            auto v = pyToVar (out);
            Py_DECREF (out);
            if (auto* o = v.getDynamicObject())
            {
                if (o->hasProperty ("swallow")) return false;
                if (o->hasProperty ("bytes")) bytes = o->getProperty ("bytes");
            }
        }
        return true;
    }

    bool callAction (const juce::String& name, const juce::var& args, juce::var& result,
                     const ScriptErrorSink& onError) override
    {
        if (! interpreterOk) return false;
        const Entry entry (*this);
        for (auto& kv : namespaces)
        {
            PyObject* a = Py_BuildValue ("(sN)", name.toRawUTF8(), varToPy (args));
            if (a == nullptr) { PyErr_Clear(); continue; }
            PyObject* out = callPreludeRaw (kv.second, "__callAction", a, onError, "action:" + name);
            Py_DECREF (a);
            if (out == nullptr) continue;
            auto v = pyToVar (out);
            Py_DECREF (out);
            if (auto* o = v.getDynamicObject())
                if ((bool) o->getProperty ("found")) { result = o->getProperty ("value"); return true; }
        }
        return false;
    }

    juce::StringArray registeredActions() const override
    {
        juce::StringArray out;
        if (! interpreterOk) return out;
        const Entry entry (*this);
        for (auto& kv : namespaces)
        {
            PyObject* f = PyDict_GetItemString (kv.second, "__actionNames");   // borrowed
            if (f == nullptr || ! PyCallable_Check (f)) continue;
            PyObject* r = PyObject_CallNoArgs (f);
            if (r == nullptr) { PyErr_Clear(); continue; }
            auto names = pyToVar (r);
            Py_DECREF (r);
            if (auto* arr = names.getArray())
                for (auto& n : *arr) out.addIfNotAlreadyThere (n.toString());
        }
        return out;
    }

    void reset() override
    {
        if (! interpreterOk) return;
        const Entry entry (*this, false);
        for (auto& kv : namespaces) Py_XDECREF (kv.second);
        namespaces.clear();
        for (auto& l : listeners) Py_XDECREF (l.fn);
        listeners.clear();
    }

    // Called by the native on() bridge. Tagged with the script registering it, so off() removes
    // only the caller's listeners — one interpreter is shared by every Python script here.
    void addListener (const juce::String& target, const juce::String& event, PyObject* fn)
    { listeners.push_back ({ currentScriptId, target, event, fn }); } // fn already INCREF'd by caller

    /** off(target, event) — drop THIS script's listeners for that pair. Unknown pairs are a no-op. */
    void removeListener (const juce::String& target, const juce::String& event)
    {
        for (auto it = listeners.begin(); it != listeners.end();)
        {
            if (it->scriptId == currentScriptId && it->target == target && it->event == event)
            {
                Py_XDECREF (it->fn);          // we own the ref api_on took
                it = listeners.erase (it);
            }
            else ++it;
        }
    }

private:
    struct Listener { juce::String scriptId, target, event; PyObject* fn; };

    // Which script is executing, so on()/off() can tag and match listeners. One
    // interpreter serves every Python script, so without it off() could not tell whose
    // listener it was removing.
    juce::String currentScriptId;
    juce::StringArray enabledModules;   // empty = the panel declared nothing = every module on
    juce::var extensions;               // ce.ext.* modules the panel carries

    // Wall-clock execution budget per outermost entry into Python (matches the
    // JS engine's 2s maximumExecutionTime).
    static constexpr double executionBudgetSeconds = 2.0;

    /** Anti-flood / loop guard (parity with Lua's instruction hook and JS's QuickJS interrupt).
        When an entry into this instance's interpreter overruns its budget, this thread takes the
        GIL with a thread state of its own in that interpreter and raises `ceditor.TimeLimit` in the
        instance's thread, which unwinds the runaway handler at its next bytecode; it does so again
        every quarter second while the entry still runs, for a loop that caught it. TimeLimit is a
        BaseException, so `except Exception:` does not catch it.

        This used PyErr_SetInterrupt. That signals the main interpreter, never a sub-interpreter,
        and is ignored outright when Python installed no SIGINT handler — which an isolated config
        does not — so it never stopped a loop: the guard's test hung. A loop inside one C call that
        holds the GIL (a regex that backtracks for ever) is out of reach either way. */
    class Watchdog : private juce::Thread
    {
    public:
        Watchdog() : juce::Thread ("ce-python-watchdog") {}
        ~Watchdog() override { stop(); }

        void setTarget (PyInterpreterState* interpIn, unsigned long threadIdIn, PyObject* exceptionIn)
        { interp = interpIn; threadId = threadIdIn; exception = exceptionIn; }

        // arm, disarm and the watchdog's own re-arming all happen with the GIL held, so it can
        // never stop an entry that has already returned. Only an idle watchdog is woken: one
        // waiting on an earlier deadline wakes before this one and reads it then. Waking it for
        // every call was a context switch per call, a third of what a call into Python cost.
        void arm (double budgetSeconds)
        {
            deadlineMs.store (juce::Time::getMillisecondCounterHiRes() + budgetSeconds * 1000.0);
            if (! isThreadRunning()) startThread();
            else if (idle.load()) notify();
        }
        void disarm() { deadlineMs.store (0.0); }

        void stop() { stopThread (-1); }

    private:
        void run() override
        {
            while (! threadShouldExit())
            {
                const double deadline = deadlineMs.load();
                if (deadline <= 0.0)
                {
                    // Idle, said before the deadline is read again: an arm either sees the flag and
                    // wakes this, or stored its deadline before the read below sees it.
                    idle.store (true);
                    if (deadlineMs.load() <= 0.0) wait (-1);
                    idle.store (false);
                    continue;
                }
                const double left = deadline - juce::Time::getMillisecondCounterHiRes();
                if (left > 0.0) { wait ((int) std::ceil (left)); continue; }
                interruptOverrun();
            }
        }

        void interruptOverrun()
        {
            PyThreadState* own = PyThreadState_New (interp);
            if (own == nullptr) { deadlineMs.store (0.0); return; }
            PyEval_RestoreThread (own);
            const double deadline = deadlineMs.load();
            const double now = juce::Time::getMillisecondCounterHiRes();
            if (deadline > 0.0 && now >= deadline)
            {
                PyThreadState_SetAsyncExc (threadId, exception);
                deadlineMs.store (now + 250.0);
            }
            PyThreadState_Clear (own);
            PyThreadState_DeleteCurrent();   // and lets go of the GIL
        }

        PyInterpreterState* interp = nullptr;
        unsigned long threadId = 0;
        PyObject* exception = nullptr;
        std::atomic<double> deadlineMs { 0.0 };
        std::atomic<bool> idle { false };
    };

    /** This instance's interpreter, held for one entry from C++: the GIL, with this instance's
        thread state current. Whatever was current before is current again on the way out — nothing
        usually, or another instance's interpreter whose script reached this one through its host —
        so entries nest. A timed entry is on the clock; only the outermost one arms the watchdog, so
        a handler that emits into another does not reset it. */
    class Entry
    {
    public:
        explicit Entry (const PythonScriptEngine& engineIn, bool timedIn = true)
            : engine (engineIn), timed (timedIn), prev (currentThreadState()),
              restore (prev == nullptr ? gilStateToRestore() : nullptr)
        {
            if (prev == nullptr)          PyEval_RestoreThread (engine.sub);
            else if (prev != engine.sub)  PyThreadState_Swap (engine.sub);
            if (timed && engine.timedDepth++ == 0)
                engine.watchdog.arm (executionBudgetSeconds);
        }

        ~Entry()
        {
            if (timed && --engine.timedDepth == 0)
            {
                engine.watchdog.disarm();
                PyThreadState_SetAsyncExc (engine.threadId, nullptr); // one raised as the call returned
            }
            if (prev == nullptr)          letGo (restore);
            else if (prev != engine.sub)  PyThreadState_Swap (prev);
        }

        Entry (const Entry&) = delete;
        Entry& operator= (const Entry&) = delete;

    private:
        const PythonScriptEngine& engine;
        const bool timed;
        PyThreadState* const prev;
        PyThreadState* const restore;
    };

    /** An interpreter of this instance's own, sharing nothing with any other instance but the
        runtime: its own modules (sys.modules, builtins, everything a script imports or changes),
        and its own `ceditor` module, whose state names this instance. Threads are not allowed in
        it, as they are not in Pyodide with the window open: one would outlive the instance, and
        an interpreter cannot end while a thread of its own still runs. */
    void createInterpreter()
    {
        const auto& runtime = pythonRuntime();
        initInfo = runtime.info;
        if (! runtime.ok) return;

        // Made from nothing current, or from inside another instance's call, which is current
        // again afterwards. On success the new interpreter's thread state is current, holding the GIL.
        PyThreadState* const prev = currentThreadState();
        PyThreadState* const restore = prev == nullptr ? gilStateToRestore() : nullptr;
        const auto handBack = [prev, restore]
        {
            if (prev != nullptr) PyThreadState_Swap (prev);
            else                 letGo (restore);
        };

        PyInterpreterConfig config {};
        config.use_main_obmalloc = 1;
        config.allow_fork = 1;
        config.allow_exec = 1;
        config.allow_threads = 0;
        config.allow_daemon_threads = 0;
        config.check_multi_interp_extensions = 0;
        config.gil = PyInterpreterConfig_SHARED_GIL;
        PyThreadState* created = nullptr;
        const PyStatus status = Py_NewInterpreterFromConfig (&created, &config);
        if (PyStatus_Exception (status) || created == nullptr)
        {
            initInfo = "Python: this instance's interpreter could not be created: "
                     + juce::String (status.err_msg != nullptr ? status.err_msg : "unknown") + " | " + runtime.info;
            juce::Logger::writeToLog ("[python] " + initInfo);
            return;   // CPython has put back whatever was current
        }

        // `created` is current now, so this is its sys.modules.
        bridge = PyModule_Create (&apiModuleDef);
        timeLimit = bridge != nullptr ? PyErr_NewException ("ceditor.TimeLimit", PyExc_BaseException, nullptr) : nullptr;
        PyObject* modules = PyImport_GetModuleDict();   // borrowed
        if (timeLimit == nullptr || modules == nullptr
            || PyModule_AddObjectRef (bridge, "TimeLimit", timeLimit) != 0
            || PyDict_SetItemString (modules, "ceditor", bridge) != 0)
        {
            initInfo = "Python: this instance's bridge could not be set up: " + fetchPyError();
            juce::Logger::writeToLog ("[python] " + initInfo);
            Py_CLEAR (timeLimit);
            Py_CLEAR (bridge);
            Py_EndInterpreter (created);   // leaves nothing current and the GIL let go
            if (prev != nullptr)         PyEval_RestoreThread (prev);
            else if (restore != nullptr) { PyEval_RestoreThread (restore); PyEval_SaveThread(); }
            return;
        }

        bridgeOwner = ownerOf (bridge);
        bridgeOwner->engine = this;
        bridgeOwner->host = host;
        sub = created;
        threadId = created->thread_id;
        watchdog.setTarget (PyThreadState_GetInterpreter (created), threadId, timeLimit);
        interpreterOk = true;
        handBack();
    }

    /** The pending Python error as one line, and cleared. A call the watchdog stopped says so, in
        the words the editor's own limit uses (scripting/scriptWatchdog.js). */
    juce::String pyError() const
    {
        if (timeLimit != nullptr && PyErr_ExceptionMatches (timeLimit))
        {
            PyErr_Clear();
            return "script stopped: it ran for more than " + juce::String ((int) executionBudgetSeconds)
                 + " s without returning, so it was stopped (an endless loop?)";
        }
        return fetchPyError();
    }

    /** Each installed ce.ext.* module's Python prelude, followed by its registration call. A
        module that ships no Python contributes nothing — its members never appear in this engine,
        and ce.has() reports that truthfully rather than pretending. */
    juce::String extensionBoot() const
    {
        auto* arr = extensions.getArray();
        if (arr == nullptr) return {};

        juce::String out;
        for (const auto& item : *arr)
        {
            auto* obj = item.getDynamicObject();
            if (obj == nullptr) continue;
            const auto id = obj->getProperty ("id").toString();
            if (id.isEmpty()) continue;

            juce::String source;
            if (auto* prelude = obj->getProperty ("prelude").getDynamicObject())
                source = prelude->getProperty ("python").toString();
            if (source.isEmpty()) continue;

            juce::StringArray pairs;
            if (auto* list = obj->getProperty ("members").getArray())
            {
                for (const auto& m : *list)
                {
                    auto* mo = m.getDynamicObject();
                    if (mo == nullptr) continue;
                    const auto memberId = mo->getProperty ("id").toString();
                    if (memberId.isEmpty()) continue;
                    auto shortName = mo->getProperty ("name").toString();
                    if (shortName.isEmpty()) shortName = memberId;
                    pairs.add (shortName.quoted() + ":" + memberId.quoted());
                }
            }

            auto version = obj->getProperty ("version").toString();
            auto runtime = obj->getProperty ("runtime").toString();
            if (runtime.isEmpty()) runtime = "any";

            out << source << "\n"
                << "__ce_register_module(" << id.quoted() << ",{" << pairs.joinIntoString (",") << "},"
                << version.quoted() << "," << runtime.quoted() << ")\n";
        }
        return out;
    }

    /** `__ce_apply_modules([...])`, or `(None)` for "the panel declared nothing — everything on". */
    juce::String moduleGateCall() const
    {
        if (enabledModules.isEmpty()) return "__ce_apply_modules(None)\n";
        juce::StringArray quoted;
        for (const auto& id : enabledModules) quoted.add (id.quoted());
        return "__ce_apply_modules([" + quoted.joinIntoString (",") + "])\n";
    }

    bool exec (const char* code, PyObject* ns)
    {
        PyObject* r = PyRun_String (code, Py_file_input, ns, ns);
        if (r == nullptr) return false;
        Py_DECREF (r);
        return true;
    }

    ScriptHostApi* host = nullptr;
    bool interpreterTried = false;
    bool interpreterOk = false;
    juce::String initInfo;                        // why init failed (or where the stdlib was found) — for the log
    PyThreadState* sub = nullptr;                 // this instance's interpreter, by its thread state
    unsigned long threadId = 0;                   // that thread state's, which the watchdog raises in
    PyObject* bridge = nullptr;                   // its `ceditor` module (owned)
    BridgeOwner* bridgeOwner = nullptr;           // that module's state
    PyObject* timeLimit = nullptr;                // ceditor.TimeLimit (owned)
    std::map<juce::String, PyObject*> namespaces; // scriptId -> namespace dict (owned ref)
    std::vector<Listener> listeners;
    mutable Watchdog watchdog;
    mutable int timedDepth = 0;
};

namespace
{
PyObject* api_on (PyObject* self, PyObject* args)
{
    const char* target = nullptr; const char* event = nullptr; PyObject* fn = nullptr;
    if (! PyArg_ParseTuple (args, "ssO", &target, &event, &fn)) return nullptr;
    if (! PyCallable_Check (fn)) { PyErr_SetString (PyExc_TypeError, "on() needs a callable"); return nullptr; }
    if (auto* engine = ownerOf (self)->engine)
    {
        Py_INCREF (fn);
        engine->addListener (juce::String::fromUTF8 (target), juce::String::fromUTF8 (event), fn);
    }
    Py_RETURN_NONE;
}

PyObject* api_off (PyObject* self, PyObject* args)
{
    const char* target = nullptr; const char* event = nullptr;
    if (! PyArg_ParseTuple (args, "ss", &target, &event)) return nullptr;
    if (auto* engine = ownerOf (self)->engine)
        engine->removeListener (juce::String::fromUTF8 (target), juce::String::fromUTF8 (event));
    Py_RETURN_NONE;
}
} // namespace

std::unique_ptr<ScriptEngine> createPythonEngine() { return std::make_unique<PythonScriptEngine>(); }

} // namespace ceditor::scripting
