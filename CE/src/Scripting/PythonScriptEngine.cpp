// PythonScriptEngine — REAL CPython (3.x) embedded natively via the C API (Python.h).
//
// This is the "full" Python path: the actual CPython interpreter is linked into the host, so the
// complete language AND the complete standard library are available (`import json`, `re`, `struct`,
// `math`, … all work, same as desktop Python). Window-CLOSED Python lives here; the WebView
// (window-open) keeps using Pyodide (also real CPython, in WASM) — both are genuine CPython, so the
// fidelity gap between open/closed is only the patch version, not the language.
//
// Isolation: ONE process-wide interpreter (CPython is single-interpreter friendliest), but each
// script is exec'd into its OWN module namespace dict — exactly like Lua's sol::environment and the
// per-engine QuickJS scope. So two scripts can both `def onValueChanged(...)` and own a distinct
// `self` without clashing. `import`ed modules / sys.modules are shared (importing json once is fine).
//
// The native bridge is a builtin module `ceditor` (registered via PyImport_AppendInittab BEFORE
// Py_Initialize). The Python prelude wraps it as globals + the same pure-math / MIDI helpers as the
// Lua + JS preludes (kept in sync with panelApi.js).
//
// THREADING: message thread only. We Py_InitializeFromConfig once on that thread and never release
// the GIL, so every dispatch holds it implicitly. The audio thread never touches this.
//
// Requires Python3::Python (CMake, behind CEDITOR_PYTHON). UNVERIFIED until built with a Python
// dev install present. Stdlib search path: env CEDITOR_PYTHONHOME, else a `PythonRuntime` folder
// next to the host binary (what the exporter bundles), else the build-time default.

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

#include "ScriptRuntime.h"

#include <atomic>
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

// --- One host + one engine, process-wide (single interpreter, single message thread). ----------
// These are re-pointed at the currently-executing engine on every loadScript/dispatch/deliverEvent
// (all on the message thread, serial) so multi-instance plugins route api_* calls to the right host,
// and cleared by the owning engine's dtor so a torn-down instance never leaves g_host dangling.
ScriptHostApi*      g_host   = nullptr;
PythonScriptEngine* g_engine = nullptr;

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
        // leak into the next dispatch's fetchPyError() (the GIL is never released between calls).
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
PyObject* api_set (PyObject*, PyObject* args)
{
    const char* path = nullptr; PyObject* value = nullptr; PyObject* opts = nullptr;
    if (! PyArg_ParseTuple (args, "sO|O", &path, &value, &opts)) return nullptr;
    g_host->setValue (juce::String::fromUTF8 (path), pyToVar (value),
                      (opts && opts != Py_None) ? pyToVar (opts) : juce::var());
    Py_RETURN_NONE;
}
PyObject* api_get (PyObject*, PyObject* args)
{
    const char* path = nullptr; const char* form = "value";
    if (! PyArg_ParseTuple (args, "s|s", &path, &form)) return nullptr;
    return varToPy (g_host->getValue (juce::String::fromUTF8 (path), juce::String::fromUTF8 (form)));
}
PyObject* api_sendCC (PyObject*, PyObject* args)
{
    int ch = 0, cc = 0; PyObject* v = nullptr;
    if (! PyArg_ParseTuple (args, "iiO", &ch, &cc, &v)) return nullptr;
    g_host->sendCC (ch, cc, pyToVar (v)); Py_RETURN_NONE;
}
PyObject* api_sendNRPN (PyObject*, PyObject* args)
{
    int ch = 0, msb = 0, lsb = 0; PyObject* v = nullptr;
    if (! PyArg_ParseTuple (args, "iiiO", &ch, &msb, &lsb, &v)) return nullptr;
    g_host->sendNRPN (ch, msb, lsb, pyToVar (v)); Py_RETURN_NONE;
}
PyObject* api_sendSysex (PyObject*, PyObject* args)
{
    PyObject* bytes = nullptr;
    if (! PyArg_ParseTuple (args, "O", &bytes)) return nullptr;
    g_host->sendSysex (pyToVar (bytes)); Py_RETURN_NONE;
}
PyObject* api_requestDump (PyObject*, PyObject* args)
{
    const char* kind = nullptr; if (! PyArg_ParseTuple (args, "s", &kind)) return nullptr;
    g_host->requestDump (juce::String::fromUTF8 (kind)); Py_RETURN_NONE;
}
PyObject* api_applyDump (PyObject*, PyObject* args)
{
    PyObject* bytes = nullptr; if (! PyArg_ParseTuple (args, "O", &bytes)) return nullptr;
    g_host->applyDump (pyToVar (bytes)); Py_RETURN_NONE;
}
PyObject* api_deviceDefine (PyObject*, PyObject* args)
{
    const char* what = nullptr; const char* id = nullptr; PyObject* spec = nullptr;
    if (! PyArg_ParseTuple (args, "ssO", &what, &id, &spec)) return nullptr;
    const bool ok = g_host->deviceDefine (juce::String::fromUTF8 (what), juce::String::fromUTF8 (id),
                                          pyToVar (spec));
    return PyBool_FromLong (ok ? 1 : 0);
}
PyObject* api_sendDump (PyObject*, PyObject* args)
{
    const char* kind = nullptr; if (! PyArg_ParseTuple (args, "s", &kind)) return nullptr;
    g_host->sendDump (juce::String::fromUTF8 (kind)); Py_RETURN_NONE;
}
PyObject* api_buildDump (PyObject*, PyObject* args)
{
    const char* kind = nullptr; if (! PyArg_ParseTuple (args, "s", &kind)) return nullptr;
    return varToPy (g_host->buildDump (juce::String::fromUTF8 (kind)));
}
PyObject* api_animate (PyObject*, PyObject* args)
{
    const char* kind = nullptr; const char* path = nullptr; double target = 0.0; PyObject* opts = nullptr;
    if (! PyArg_ParseTuple (args, "ssd|O", &kind, &path, &target, &opts)) return nullptr;
    g_host->startAnimation (juce::String::fromUTF8 (kind), juce::String::fromUTF8 (path), target,
                            opts != nullptr ? pyToVar (opts) : juce::var());
    Py_RETURN_NONE;
}
PyObject* api_animateStop (PyObject*, PyObject* args)
{
    const char* path = nullptr; if (! PyArg_ParseTuple (args, "s", &path)) return nullptr;
    g_host->stopAnimation (juce::String::fromUTF8 (path)); Py_RETURN_NONE;
}
PyObject* api_animateRunning (PyObject*, PyObject* args)
{
    const char* path = nullptr; if (! PyArg_ParseTuple (args, "s", &path)) return nullptr;
    if (g_host->animationRunning (juce::String::fromUTF8 (path))) Py_RETURN_TRUE;
    Py_RETURN_FALSE;
}
PyObject* api_transportState (PyObject*, PyObject*)
{
    return varToPy (g_host->transportState());
}
PyObject* api_deviceQuery (PyObject*, PyObject* args)
{
    const char* kind = nullptr; PyObject* payload = nullptr;
    if (! PyArg_ParseTuple (args, "s|O", &kind, &payload)) return nullptr;
    return varToPy (g_host->deviceQuery (juce::String::fromUTF8 (kind),
                                         payload != nullptr ? pyToVar (payload) : juce::var()));
}
PyObject* api_panelQuery (PyObject*, PyObject* args)
{
    const char* kind = nullptr; PyObject* payload = nullptr;
    if (! PyArg_ParseTuple (args, "s|O", &kind, &payload)) return nullptr;
    return varToPy (g_host->panelQuery (juce::String::fromUTF8 (kind),
                                        payload != nullptr ? pyToVar (payload) : juce::var()));
}
PyObject* api_deviceWrite (PyObject*, PyObject* args)
{
    const char* id = nullptr; PyObject* value = nullptr; const char* role = nullptr;
    if (! PyArg_ParseTuple (args, "sOs", &id, &value, &role)) return nullptr;
    const bool ok = g_host->deviceWrite (juce::String::fromUTF8 (id),
                                         value != nullptr ? pyToVar (value) : juce::var(),
                                         juce::String::fromUTF8 (role));
    return PyBool_FromLong (ok ? 1 : 0);
}
PyObject* api_run (PyObject*, PyObject* args)
{
    const char* target = nullptr; PyObject* a = nullptr;
    if (! PyArg_ParseTuple (args, "s|O", &target, &a)) return nullptr;
    return varToPy (g_host->runAction (juce::String::fromUTF8 (target),
                                       (a && a != Py_None) ? pyToVar (a) : juce::var()));
}
PyObject* api_emit (PyObject*, PyObject* args)
{
    const char* name = nullptr; PyObject* d = nullptr;
    if (! PyArg_ParseTuple (args, "s|O", &name, &d)) return nullptr;
    g_host->emitEvent (juce::String::fromUTF8 (name), (d && d != Py_None) ? pyToVar (d) : juce::var());
    Py_RETURN_NONE;
}
PyObject* api_logAt (PyObject*, PyObject* args)
{
    const char* kind = nullptr; const char* message = nullptr; PyObject* value = nullptr;
    if (! PyArg_ParseTuple (args, "ss|O", &kind, &message, &value)) return nullptr;
    g_host->logAt (juce::String::fromUTF8 (kind), juce::String::fromUTF8 (message),
                   value != nullptr ? pyToVar (value) : juce::var());
    Py_RETURN_NONE;
}
PyObject* api_log (PyObject*, PyObject* args)
{
    const char* msg = nullptr; PyObject* v = nullptr;
    if (! PyArg_ParseTuple (args, "s|O", &msg, &v)) return nullptr;
    g_host->log (juce::String::fromUTF8 (msg), (v && v != Py_None) ? pyToVar (v) : juce::var());
    Py_RETURN_NONE;
}
PyObject* api_sendMidi (PyObject*, PyObject* args)
{
    PyObject* bytes = nullptr;
    if (! PyArg_ParseTuple (args, "O", &bytes)) return nullptr;
    g_host->sendMidi (pyToVar (bytes)); Py_RETURN_NONE;
}
PyObject* api_saveSetting (PyObject*, PyObject* args)
{
    const char* key = nullptr; PyObject* v = nullptr;
    if (! PyArg_ParseTuple (args, "sO", &key, &v)) return nullptr;
    g_host->saveSetting (juce::String::fromUTF8 (key), pyToVar (v)); Py_RETURN_NONE;
}
PyObject* api_listSettings (PyObject*, PyObject*)
{
    return varToPy (g_host->listSettings());
}
PyObject* api_forgetSetting (PyObject*, PyObject* args)
{
    const char* key = nullptr;
    if (! PyArg_ParseTuple (args, "s", &key)) return nullptr;
    return PyBool_FromLong (g_host->forgetSetting (juce::String::fromUTF8 (key)) ? 1 : 0);
}
PyObject* api_loadSetting (PyObject*, PyObject* args)
{
    const char* key = nullptr; if (! PyArg_ParseTuple (args, "s", &key)) return nullptr;
    return varToPy (g_host->loadSetting (juce::String::fromUTF8 (key)));
}
PyObject* api_startTimer (PyObject*, PyObject* args)
{
    const char* id = nullptr; int ms = 0;
    if (! PyArg_ParseTuple (args, "s|i", &id, &ms)) return nullptr;
    g_host->startTimer (juce::String::fromUTF8 (id), ms); Py_RETURN_NONE;
}
PyObject* api_stopTimer (PyObject*, PyObject* args)
{
    const char* id = nullptr; if (! PyArg_ParseTuple (args, "s", &id)) return nullptr;
    g_host->stopTimer (juce::String::fromUTF8 (id)); Py_RETURN_NONE;
}
PyObject* api_beginTransmit (PyObject*, PyObject* args)
{
    int on = 0; if (! PyArg_ParseTuple (args, "p", &on)) return nullptr;
    g_host->beginTransmitOverride (on != 0); Py_RETURN_NONE;
}
PyObject* api_endTransmit (PyObject*, PyObject*) { g_host->endTransmitOverride(); Py_RETURN_NONE; }
// routeMidi(role, fn) blocks — the destination for a RUN of sends, the same block shape
// noTransmit() uses rather than a role argument threaded through thirteen signatures.
PyObject* api_beginRoute (PyObject*, PyObject* args)
{
    const char* role = nullptr; if (! PyArg_ParseTuple (args, "s", &role)) return nullptr;
    g_host->beginRouteOverride (juce::String::fromUTF8 (role)); Py_RETURN_NONE;
}
PyObject* api_endRoute (PyObject*, PyObject*) { g_host->endRouteOverride(); Py_RETURN_NONE; }
PyObject* api_feedMidi (PyObject*, PyObject* args)
{
    PyObject* b = nullptr; if (! PyArg_ParseTuple (args, "O", &b)) return nullptr;
    g_host->feedMidi (pyToVar (b)); Py_RETURN_NONE;
}

// on(target, event, fn) — defined here so it can capture the engine's listener registry.
PyObject* api_on  (PyObject*, PyObject* args);  // fwd (needs the engine class)
PyObject* api_off (PyObject*, PyObject* args);  // fwd (needs the engine class)

PyMethodDef apiMethods[] = {
    { "set",           api_set,           METH_VARARGS, nullptr },
    { "get",           api_get,           METH_VARARGS, nullptr },
    { "sendCC",        api_sendCC,        METH_VARARGS, nullptr },
    { "sendNRPN",      api_sendNRPN,      METH_VARARGS, nullptr },
    { "sendSysex",     api_sendSysex,     METH_VARARGS, nullptr },
    { "sendMidi",      api_sendMidi,      METH_VARARGS, nullptr },
    { "saveSetting",   api_saveSetting,   METH_VARARGS, nullptr },
    { "loadSetting",   api_loadSetting,   METH_VARARGS, nullptr },
    { "listSettings",  api_listSettings,  METH_NOARGS,  nullptr },
    { "forgetSetting", api_forgetSetting, METH_VARARGS, nullptr },
    { "requestDump",   api_requestDump,   METH_VARARGS, nullptr },
    { "applyDump",     api_applyDump,     METH_VARARGS, nullptr },
    { "deviceDefine",  api_deviceDefine,  METH_VARARGS, nullptr },
    { "sendDump",      api_sendDump,      METH_VARARGS, nullptr },
    { "buildDump",     api_buildDump,     METH_VARARGS, nullptr },
    { "deviceQuery",   api_deviceQuery,   METH_VARARGS, nullptr },
    { "panelQuery",    api_panelQuery,    METH_VARARGS, nullptr },
    { "deviceWrite",   api_deviceWrite,   METH_VARARGS, nullptr },
    { "transportState", api_transportState, METH_NOARGS,  nullptr },
    { "animate",       api_animate,       METH_VARARGS, nullptr },
    { "animateStop",   api_animateStop,   METH_VARARGS, nullptr },
    { "animateRunning", api_animateRunning, METH_VARARGS, nullptr },
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

PyModuleDef apiModuleDef = {
    PyModuleDef_HEAD_INIT, "ceditor", "CEditor panel host bridge", -1,
    apiMethods, nullptr, nullptr, nullptr, nullptr
};

PyObject* PyInit_ceditor() { return PyModule_Create (&apiModuleDef); }

// --- Python prelude: globals wrapping `ceditor` + helpers (parity with Lua/JS) -----------------
const char* kPrelude = R"PY(
# @module -
import ceditor as __api

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

def watch(path, fn):     __putRule(__watchers, {"path": path, "fn": fn, "last": __sig(get(path)), "prev": None})
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
                if __sig(nxt) == __sig(get(c["path"])): continue
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
            cur = get(f["path"])
            if cur is None: continue
            d = __applyIntercepts(f["path"], cur)
            if d.get("reject"): continue      # a veto has nothing to revert to
            if __sig(d["value"]) != __sig(cur): set(f["path"], d["value"])
        for w in __watchers:
            v = get(w["path"])
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
def get(path, form="value"):      return __api.get(path, form)
# @module ce.midi
def sendCC(ch, cc, v):            return __api.sendCC(ch, cc, v)
def sendNRPN(ch, msb, lsb, v):    return __api.sendNRPN(ch, msb, lsb, v)
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

def beatsToMs(beats, bpm=None):
    bpm = bpm or tempo()
    if not bpm or bpm <= 0:
        return None
    return (float(beats) if beats is not None else 0.0) * 60000.0 / bpm

def msToBeats(ms, bpm=None):
    bpm = bpm or tempo()
    if not bpm or bpm <= 0:
        return None
    return (float(ms) if ms is not None else 0.0) * bpm / 60000.0

def syncTimer(id, beats):
    ms = beatsToMs(beats)
    if ms is None:
        log("syncTimer(\"" + str(id) + "\"): no tempo is being reported, so there is no interval to compute. Use startTimer with a millisecond interval, or wait for onTransport.")
        return
    # int(ms + 0.5), NOT round(ms): the prelude defines a global `round` (ce.math), which shadows
    # the builtin here, and syncTimer must not depend on another module for one rounding.
    startTimer(id, int(ms + 0.5))

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
        log("after(ms, fn) needs a function to run — nothing was scheduled")
        return None
    __afterN[0] += 1
    _id = "__after:" + str(__afterN[0])
    __after[_id] = fn
    startTimer(_id, ms)
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

# @module ce.anim
# Values that move over time. The engine lives in the host so ONE list exists and the position is a
# pure function of elapsed time — an incremental integrator per runtime would drift.
def animateTo(path, target, opts=None):
    __api.animate("to", str(path), float(target or 0), opts)

def animateSpring(path, target, opts=None):
    __api.animate("spring", str(path), float(target or 0), opts)

def animateStop(path=None):
    __api.animateStop("" if path is None else str(path))

def animateRunning(path=None):
    return __api.animateRunning("" if path is None else str(path))

# @module ce.device
# requestDump is assembled further down, over __api.requestDump: it takes an optional callback,
# which is a language value the host has no per-engine way to call back.
def applyDump(b):                 return __api.applyDump(b)
def sendDump(kind):               return __api.sendDump(kind)
def buildDump(kind):              return __api.buildDump(kind)
# @module ce.time
def startTimer(id, ms=0):         return __api.startTimer(id, ms)
def stopTimer(id):                return __api.stopTimer(id)
# @module -
def run(target, args=None):       return __api.run(target, args)
def emit(name, data=None):        return __api.emit(name, data)
def log(msg, v=None):             return __api.log(str(msg), v)
def on(target, event, fn):        return __api.on(target, event, fn)
def off(target, event):           return __api.off(target, event)

def noTransmit(fn):
    __api.beginTransmit(False)
    try: fn()
    finally: __api.endTransmit()

def transmit(fn):
    __api.beginTransmit(True)
    try: fn()
    finally: __api.endTransmit()

# `self` — owner-relative set/get (Q7). __owner is injected per-script before this prelude runs.
class _Self:
    def _p(self, p):
        o = globals().get("__owner", "")
        return p if not o else (o + "." + p)
    def set(self, p, value, opts=None): return __api.set(self._p(p), value, opts)
    def get(self, p, form="value"):     return __api.get(self._p(p), form)
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
def snap(v, step):
    return v if step == 0 else round(v / step) * step
def lerp(a, b, t): return a + (b - a) * t
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

# [[x, y], …] sorted by x. Accepts pairs and { "x": , "y": } mappings, so a panel can write either.
def __points(points):
    out = []
    for p in (points or []):
        x = y = None
        if isinstance(p, (list, tuple)) and len(p) >= 2:
            x, y = p[0], p[1]
        elif hasattr(p, "get"):
            x, y = p.get("x"), p.get("y")
        try:
            x, y = float(x), float(y)
        except (TypeError, ValueError):
            continue
        out.append((x, y))
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
        x0, y0 = lst[i - 1]
        x1, y1 = lst[i]
        if n < x1 and x1 != x0:
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
def randomFloat(lo, hi):
    a, b = __num(lo), __num(hi, 1)
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
    a, b = math.floor(lo or 0), math.floor(hi or 0)
    low, high = min(a, b), max(a, b)
    # Whole numbers, INCLUSIVE at both ends — the form a script wants for a note or a step.
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
# END GENERATED music tables

# Scales, chords and snap-to-key, over the generated tables above. `root`/`note` take a MIDI number
# or a name ("C4"), the way sendNote does. An unknown scale or chord name returns None rather than
# guessing "major" — a script that asked for something this build does not know should find out.
# noteNumber is None for a name it cannot read; __pitch feeds scaleNotes and friends, where a None
# root would turn one bad string into an unexplained None list.
def __pitch(v):
    import math
    if isinstance(v, str):
        return noteNumber(v) or 0
    return math.floor(v or 0)
def __steps(tbl, name, fallback):
    return tbl.get(fallback if name is None else str(name))
def scaleNotes(root, scale=None):
    s = __steps(__CE_SCALES, scale, "major")
    if s is None: return None
    base = __pitch(root)
    return [base + x for x in s]
def chordNotes(root, chordType=None):
    s = __steps(__CE_CHORDS, chordType, "major")
    if s is None: return None
    base = __pitch(root)
    return [base + x for x in s]
def quantizeNote(note, root, scale=None):
    s = __steps(__CE_SCALES, scale, "major")
    if s is None: return None
    n = __pitch(note); base = __pitch(root)
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
    if __CE_SCALES.get(nm) is None: return None
    pc = __m12(__pitch(root))
    # Judged by the RELATIVE MAJOR, so C minor spells E♭/A♭ rather than D♯/G♯.
    if __CE_MINOR_SCALES.get(nm) is True: pc = __m12(pc + 3)
    return __CE_FLAT_KEYS.get(pc) is True
def inScale(note, root, scale=None):
    s = __steps(__CE_SCALES, scale, "major")
    if s is None: return None
    base = __m12(__pitch(root)); pc = __m12(__pitch(note))
    return any(__m12(base + x) == pc for x in s)
# 1 for the tonic, 5 for the dominant. A note OUTSIDE the key has NO degree and gets None rather
# than the nearest one - rounding here turns a wrong note into a plausible chord, and quantizeNote
# is the verb that rounds on purpose.
def scaleDegree(note, root, scale=None):
    s = __steps(__CE_SCALES, scale, "major")
    if s is None: return None
    base = __m12(__pitch(root)); pc = __m12(__pitch(note))
    for i in range(len(s)):
        if __m12(base + s[i]) == pc: return i + 1
    return None
def __sortedNotes(list_):
    out = []
    if isinstance(list_, (list, tuple)):
        for v in list_:
            if isinstance(v, bool): continue
            if isinstance(v, (int, float)):
                out.append(v)                      # ints stay ints, so a note reads 60 and not 60.0
            else:
                try: out.append(float(v))
                except (TypeError, ValueError): pass
    return sorted(out)
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
    lst = __sortedNotes(notes)
    if not lst: return None
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
    s = __CE_SCALES.get(nm)
    if not s: return None
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
def voiceLead(notes, previous, mode=None):
    chord = __sortedNotes(notes); prev = __sortedNotes(previous)
    how = "closest" if mode is None else str(mode)
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
    base = __sortedNotes(notes)
    oc = max(1, min(4, __count(octaves, 1)))
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
def arpOrder(notes, pattern):
    asc = list(notes) if isinstance(notes, (list, tuple)) else []
    if not asc: return []
    p = str(pattern)
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
def checksum(kind, bytes=None):
    import math
    if bytes is None: bytes = kind; kind = "roland"
    kind = str(kind if kind is not None else "roland").lower()
    total = 0; x = 0
    for v in bytes:
        b = math.floor(v) & 0xff
        total = (total + b) % 128
        x = (x ^ b) & 0x7f
    if kind == "xor": return x
    if kind == "sum": return total
    return (128 - total) % 128

# panic([opts]) — All Sound Off (120), All Notes Off (123), Reset All Controllers (121), in that
# order because 120 must land before 123 for a device to cut a stuck note rather than let it ring
# out. Expands to plain sendCC calls, so it needs nothing of the host beyond CC output.
def panic(opts=None):
    import math
    opts = opts or {}
    reset = opts.get("resetControllers", True) is not False
    ch = opts.get("channel")
    channels = [math.floor(ch)] if ch is not None else range(1, 17)
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
# @module ce.ui
  "uiNotify","uiStatus","uiDialog",
# @module ce.draw
  "drawClear","drawFill","drawStroke","drawRect","drawCircle","drawLine","drawPath","drawArc",
  "drawText","drawRedraw",
# @module ce.panel
  "panelCreate","panelClone","panelDestroy","panelParent","panelFind","panelInfo","panelTypes",
  "panelEntries","panelEntry","panelDefine","panelUndefine","panelPatch",
# @module ce.components.split
  "splitPreset","splitMute","splitChannel","splitTranspose","splitPoint",
# @module ce.components.phrase
  "phraseSeed","phraseClear","phraseKey","phraseScale","phraseTranspose","phraseDirection",
  "phraseRun","phraseCell",
# @module ce.components.recorder
  "recorderRecord","recorderStop","recorderPlay","recorderClear","recorderUndo","recorderQuantize",
  "recorderTranspose","recorderBars","recorderSource","recorderNudge","recorderShift",
  "recorderStore","recorderLoad","recorderCountIn",
# @module ce.components.harmony
  "harmonyMode","harmonyKey","harmonyScale","harmonySize","harmonyShape","harmonyVoicing",
  "harmonyInversion","harmonyOctave","harmonyOutOfKey","harmonyKeepPlayed","harmonyChannel",
  "harmonyVoiceLeading","harmonyStrum","harmonyDegree",
# @module ce.components.setlist
  "setlistNext","setlistPrev","setlistGoto","setlistEnable","setlistWrap","setlistCrossfade",
# @module ce.components.arp
  "arpRun","arpPattern","arpRate","arpDivision","arpSync","arpOctaves","arpGate","arpSwing",
  "arpLatch","arpKey","arpScale","arpDegree","arpChordType","arpVelocity","arpChannel","arpEuclid",
  "arpEuclidSteps","arpEuclidPulses","arpEuclidRotate",
# @module ce.components.chordpad
  "chordPadMode","chordPadKey","chordPadScale","chordPadChordType","chordPadVoicing",
  "chordPadInversion","chordPadOctave","chordPadVelocity","chordPadChannel","chordPadStrum",
  "chordPadLatch",
# @module ce.components.noteribbon
  "noteRibbonMode","noteRibbonKey","noteRibbonScale","noteRibbonBaseNote","noteRibbonOctaves",
  "noteRibbonBendRange","noteRibbonVelocity","noteRibbonChannel","noteRibbonLatch",
# @module ce.components.drumpads
  "drumPadsMap","drumPadsBaseNote","drumPadsMode","drumPadsGate","drumPadsVelocity",
  "drumPadsChannel","drumPadsRows","drumPadsCols",
# @module ce.components.turing
  "turingRun","turingRate","turingDivision","turingSync","turingLength","turingRandomness",
  "turingQuantize","turingGate","turingStep",
# @module ce.components.looper
  "looperRun","looperSeconds","looperBars","looperSync","looperQuantize","looperLane",
  "looperLaneRest",
# @module ce.components.orbit
  "orbitRun","orbitRate","orbitBars","orbitSync","orbitPhase","orbitNode","orbitNodeRadius",
  "orbitNodeAngle","orbitNodeRatio","orbitNodeDepth",
# @module ce.components.kinetic
  "kineticRun","kineticSync","kineticGravity","kineticBounce","kineticFriction","kineticKeepAlive",
  "kineticLaunch","kineticVelocity",
# @module ce.components.constellation
  "constellationProbe","constellationMode","constellationBlend","constellationRun",
  "constellationRate","constellationSync","constellationBars","constellationLinks",
# @module ce.components.timbre
  "timbreMove","timbrePower","timbreAnchorX","timbreAnchorY",
# @module ce.components.router
  "routerSource","routerCc","routerChannel","routerPoly","routerInvert","routerDeadzone",
  "routerInput","routerDest","routerDestDepth",
# @module ce.components.macro
  "macroValue","macroSlot","macroSlotDepth","macroSlotCurve","macroSlotMin","macroSlotMax",
# @module ce.components.matrix
  "matrixCell","matrixClear","matrixBipolar","matrixStep",
# @module ce.components.constraint
  "constraintMode","constraintGap","constraintMember",
# @module ce.components.envelope
  "envelopePreset","envelopePointX","envelopePointY","envelopePointCurve","envelopeSustain",
  "envelopeLoop","envelopeLoopStart","envelopeLoopEnd","envelopeTimeMax","envelopePhase",
# @module ce.components.ribbon
  "ribbonValue","ribbonBipolar","ribbonReturnMode","ribbonReturnValue","ribbonReturnRate",
  "ribbonSnap",
# @module ce.components.crossfader
  "crossfaderMix","crossfaderLaw","crossfaderBipolar","crossfaderDetent","crossfaderReturnToCenter",
  "crossfaderReturnRate",
# @module ce.components.joystick
  "joystickMove","joystickBipolar","joystickReturnToCenter","joystickReturnAxes",
  "joystickReturnRate",
# @module ce.components.meter
  "meterValue","meterScale","meterPeakHold","meterHoldMs","meterDecay",
# @module ce.components.transport
  "transportBpm","transportSwing","transportSource","transportBeatsPerBar","transportBeatUnit",
  "transportLoop","transportLoopStart","transportLoopBars","transportCountIn","transportClockOut",
# @module ce.components.panic
  "panicSetScope","panicSetChannel","panicSetResetControllers","panicSetCentreBend",
  "panicSetClearLocal",
# @module ce.components.lcd
  "lcdText","lcdClear","lcdBacklight","lcdBrightness","lcdContrast","lcdScroll","lcdScrollSpeed",
  "lcdBlink","lcdCursor","lcdCursorAt","lcdValue",
# @module ce.components.pixel
  "pixelBacklight","pixelBrightness","pixelContrast","pixelGamma","pixelGlow","pixelAnim",
  "pixelAnimPreset","pixelAnimSpeed","pixelAnimLoop",
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
def __ch(c):
    import math
    c = math.floor(c or 1)
    return (1 if c < 1 else (16 if c > 16 else c)) - 1
def __7(v):
    import math
    v = math.floor(v or 0)
    return 0 if v < 0 else (127 if v > 127 else v)
# noteNumber is None for an unreadable name; a MIDI message still needs a BYTE, so it becomes 0
# here rather than a None slipping into a message.
def __note(n):
    if isinstance(n, str):
        return noteNumber(n) or 0
    return __7(n)

def sendNote(channel, note, velocity, ms=None):
    # A duration schedules the note off. Every script that plays a note was otherwise hand-rolling a
    # timer for it, and getting that wrong means a hung voice - the one MIDI mistake you hear rather
    # than read. A panel cannot play a note at all.
    n = __note(note)
    sendMidi([0x90 | __ch(channel), n, __7(velocity)])
    if ms is not None and ms > 0:
        after(ms, lambda: sendMidi([0x80 | __ch(channel), n, 0]))

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
def sendRPN(channel, msb, lsb, value):
    # RPN is NRPN with CC 101/100 instead of 99/98 — the standard path for pitch-bend range (0,0),
    # fine tuning (0,1) and coarse tuning (0,2).
    import math
    s = 0xB0 | __ch(channel)
    v = math.floor(value or 0)
    v = 0 if v < 0 else (16383 if v > 16383 else v)
    sendMidi([s, 0x65, __7(msb), s, 0x64, __7(lsb), s, 0x06, (v >> 7) & 0x7F, s, 0x26, v & 0x7F])
# Song Position Pointer: where the next start resumes from, in MIDI beats (six clocks each).
def sendSongPosition(beats):
    import math
    b = math.floor(beats or 0)
    b = 0 if b < 0 else (16383 if b > 16383 else b)
    sendMidi([0xF2, b & 0x7F, (b >> 7) & 0x7F])
def sendNoteOff(channel, note, velocity=0):
    sendMidi([0x80 | __ch(channel), __note(note), __7(velocity)])
def sendProgramChange(channel, program, bankMsb=None, bankLsb=None):
    # Bank select first: a device applies the bank that was in force when the program change lands.
    if bankMsb is not None: sendCC(channel, 0, __7(bankMsb))
    if bankLsb is not None: sendCC(channel, 32, __7(bankLsb))
    sendMidi([0xC0 | __ch(channel), __7(program)])
def sendPitchBend(channel, value):
    import math
    v = math.floor(value if value is not None else 8192)
    v = 0 if v < 0 else (16383 if v > 16383 else v)
    sendMidi([0xE0 | __ch(channel), v % 128, math.floor(v / 128) % 128])
def sendAftertouch(channel, pressure, note=None):
    if note is not None: sendMidi([0xA0 | __ch(channel), __note(note), __7(pressure)])
    else: sendMidi([0xD0 | __ch(channel), __7(pressure)])
def sendClock(): sendMidi([0xF8])
def sendTransport(action="start"):
    action = str(action).lower()
    if action == "stop": sendMidi([0xFC])
    elif action == "continue": sendMidi([0xFB])
    else: sendMidi([0xFA])

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
        v = get(name + ".value")
        if v is not None: out[name] = v
    return out
def panelRestore(snap):
    if not isinstance(snap, dict): return 0
    n = 0
    for name, v in snap.items():
        # A name the panel no longer has is skipped rather than failing the whole restore: a
        # snapshot taken before an edit is still worth most of what it holds.
        if get(name + ".value") is not None:
            set(name + ".value", v)
            n += 1
    return n

# @module ce.device
def __deviceQuery(kind, payload=None):
    return __api.deviceQuery(kind, payload)

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
        ms = 3000
        if opts is not None and opts.get("timeout") is not None and float(opts.get("timeout")) > 0:
            ms = float(opts.get("timeout"))
        waiter = { "kind": kind, "fn": fn, "done": False }
        __dumpWaiters.append(waiter)
        # Resolved rather than left hanging: a synth that is off, or that does not answer this
        # request, is the common case and not the exotic one.
        def __timeout():
            if waiter["done"]: return
            __resolveDumps(kind, "", None, "no dump arrived within " + str(int(ms)) + "ms")
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
def saveSetting(key, value):      return __api.saveSetting(str(key), value)
# settings() lists every saved key; forget() deletes one and says whether there was one.
def listSettings():               return __api.listSettings() or []
def forgetSetting(key):           return __api.forgetSetting(str(key)) is True
def loadSetting(key, fallback=None):
    v = __api.loadSetting(str(key))
    return fallback if v is None else v

# @module -
# BEGIN GENERATED module namespace — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
# Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
# on top. ce.core is global: its members are never namespaced, so they appear here only for
# discoverability (ce.core.set is the same function as set).
import types as __ce_types
__CE_MODULES = {
    "ce.core": { "action": "defineAction", "compute": "compute", "emit": "emit", "error": "logError", "get": "get", "intercept": "intercept", "log": "log", "noTransmit": "noTransmit", "off": "off", "on": "on", "run": "run", "set": "set", "transmit": "transmit", "warn": "logWarn", "watch": "watch" },
    "ce.midi": { "checksum": "checksum", "denibblize": "denibblize", "feed": "feedMidi", "from14bit": "from14bit", "from7bit": "from7bit", "fromAscii": "fromAscii", "fromNibbles": "fromNibbles", "fromOffset": "fromOffset", "fromSigned": "fromSigned", "interceptIn": "interceptMidiIn", "interceptOut": "interceptMidiOut", "nibblize": "nibblize", "panic": "panic", "route": "routeMidi", "sendAftertouch": "sendAftertouch", "sendCC": "sendCC", "sendClock": "sendClock", "sendMidi": "sendMidi", "sendNRPN": "sendNRPN", "sendNote": "sendNote", "sendNoteOff": "sendNoteOff", "sendPitchBend": "sendPitchBend", "sendProgramChange": "sendProgramChange", "sendRPN": "sendRPN", "sendSongPosition": "sendSongPosition", "sendSysex": "sendSysex", "sendTransport": "sendTransport", "to14bit": "to14bit", "to7bit": "to7bit", "toAscii": "toAscii", "toNibbles": "toNibbles", "toOffset": "toOffset", "toSigned": "toSigned" },
    "ce.device": { "applyDump": "applyDump", "bind": "deviceBind", "buildDump": "buildDump", "connected": "deviceConnected", "defineDump": "deviceDefineDump", "defineParameter": "deviceDefineParameter", "parameter": "deviceParameter", "parameters": "deviceParameters", "ports": "devicePorts", "profile": "deviceProfile", "read": "deviceRead", "requestDump": "requestDump", "sendDump": "sendDump", "unbind": "deviceUnbind", "write": "deviceWrite" },
    "ce.math": { "almost": "almost", "angle": "angleOf", "approach": "approach", "bipolar": "bipolar", "blend": "blend", "blendBy": "blendBy", "chance": "randomBool", "choice": "randomChoice", "clamp": "clamp", "crossfade": "crossfade", "curve": "curve", "dbPosition": "dbPosition", "dbToGain": "dbToGain", "deadzone": "deadzone", "degrees": "toDegrees", "denorm": "denorm", "distance": "distance", "euclid": "euclid", "fold": "fold", "gainToDb": "gainToDb", "gaussian": "randomGaussian", "hysteresis": "hysteresis", "index": "indexOfRange", "lerp": "lerp", "map": "mapCurve", "max": "maxOf", "mean": "meanOf", "median": "median", "min": "minOf", "norm": "norm", "polar": "polar", "quantize": "quantizeTo", "radians": "toRadians", "random": "random", "randomFloat": "randomFloat", "round": "round", "roundTo": "roundTo", "scale": "scale", "seed": "randomSeed", "shape": "shapeCurve", "shuffle": "shuffle", "smooth": "smooth", "snap": "snap", "stream": "randomStream", "sum": "sumOf", "ticks": "tickStops", "unipolar": "unipolar", "unshape": "unshape", "walk": "randomWalk", "weights": "weightsFor", "wrap": "wrap" },
    "ce.music": { "arp": "arpOrder", "chord": "chordNotes", "degree": "scaleDegree", "degreeChord": "degreeChord", "inScale": "inScale", "lead": "voiceLead", "name": "noteName", "number": "noteNumber", "octaves": "expandOctaves", "quality": "chordQuality", "quantize": "quantizeNote", "scale": "scaleNotes", "spelling": "noteSpelling" },
    "ce.time": { "after": "after", "beatsToMs": "beatsToMs", "msToBeats": "msToBeats", "playing": "isPlaying", "startTimer": "startTimer", "stopTimer": "stopTimer", "syncTimer": "syncTimer", "tempo": "tempo", "transport": "transportInfo" },
    "ce.anim": { "running": "animateRunning", "spring": "animateSpring", "stop": "animateStop", "to": "animateTo" },
    "ce.ui": { "dialog": "uiDialog", "notify": "uiNotify", "status": "uiStatus" },
    "ce.draw": { "arc": "drawArc", "circle": "drawCircle", "clear": "drawClear", "fill": "drawFill", "line": "drawLine", "path": "drawPath", "rect": "drawRect", "redraw": "drawRedraw", "stroke": "drawStroke", "text": "drawText" },
    "ce.panel": { "clone": "panelClone", "create": "panelCreate", "define": "panelDefine", "destroy": "panelDestroy", "each": "panelEach", "entries": "panelEntries", "entry": "panelEntry", "find": "panelFind", "info": "panelInfo", "parent": "panelParent", "patch": "panelPatch", "restore": "panelRestore", "snapshot": "panelSnapshot", "types": "panelTypes", "undefine": "panelUndefine" },
    "ce.storage": { "forget": "forgetSetting", "loadSetting": "loadSetting", "saveSetting": "saveSetting", "settings": "listSettings", "state": "state" },
    "ce.components.split": { "channel": "splitChannel", "mute": "splitMute", "point": "splitPoint", "preset": "splitPreset", "transpose": "splitTranspose" },
    "ce.components.phrase": { "cell": "phraseCell", "clear": "phraseClear", "direction": "phraseDirection", "key": "phraseKey", "run": "phraseRun", "scale": "phraseScale", "seed": "phraseSeed", "transpose": "phraseTranspose" },
    "ce.components.recorder": { "bars": "recorderBars", "clear": "recorderClear", "countIn": "recorderCountIn", "load": "recorderLoad", "nudge": "recorderNudge", "play": "recorderPlay", "quantize": "recorderQuantize", "record": "recorderRecord", "shift": "recorderShift", "source": "recorderSource", "stop": "recorderStop", "store": "recorderStore", "transpose": "recorderTranspose", "undo": "recorderUndo" },
    "ce.components.harmony": { "channel": "harmonyChannel", "degree": "harmonyDegree", "inversion": "harmonyInversion", "keepPlayed": "harmonyKeepPlayed", "key": "harmonyKey", "mode": "harmonyMode", "octave": "harmonyOctave", "outOfKey": "harmonyOutOfKey", "scale": "harmonyScale", "shape": "harmonyShape", "size": "harmonySize", "strum": "harmonyStrum", "voiceLeading": "harmonyVoiceLeading", "voicing": "harmonyVoicing" },
    "ce.components.setlist": { "crossfade": "setlistCrossfade", "enable": "setlistEnable", "jump": "setlistGoto", "next": "setlistNext", "prev": "setlistPrev", "wrap": "setlistWrap" },
    "ce.components.arp": { "channel": "arpChannel", "chordType": "arpChordType", "degree": "arpDegree", "division": "arpDivision", "euclid": "arpEuclid", "euclidPulses": "arpEuclidPulses", "euclidRotate": "arpEuclidRotate", "euclidSteps": "arpEuclidSteps", "gate": "arpGate", "key": "arpKey", "latch": "arpLatch", "octaves": "arpOctaves", "pattern": "arpPattern", "rate": "arpRate", "run": "arpRun", "scale": "arpScale", "swing": "arpSwing", "sync": "arpSync", "velocity": "arpVelocity" },
    "ce.components.chordpad": { "channel": "chordPadChannel", "chordType": "chordPadChordType", "inversion": "chordPadInversion", "key": "chordPadKey", "latch": "chordPadLatch", "mode": "chordPadMode", "octave": "chordPadOctave", "scale": "chordPadScale", "strum": "chordPadStrum", "velocity": "chordPadVelocity", "voicing": "chordPadVoicing" },
    "ce.components.noteribbon": { "baseNote": "noteRibbonBaseNote", "bendRange": "noteRibbonBendRange", "channel": "noteRibbonChannel", "key": "noteRibbonKey", "latch": "noteRibbonLatch", "mode": "noteRibbonMode", "octaves": "noteRibbonOctaves", "scale": "noteRibbonScale", "velocity": "noteRibbonVelocity" },
    "ce.components.drumpads": { "baseNote": "drumPadsBaseNote", "channel": "drumPadsChannel", "cols": "drumPadsCols", "gate": "drumPadsGate", "map": "drumPadsMap", "mode": "drumPadsMode", "rows": "drumPadsRows", "velocity": "drumPadsVelocity" },
    "ce.components.turing": { "division": "turingDivision", "gate": "turingGate", "length": "turingLength", "quantize": "turingQuantize", "randomness": "turingRandomness", "rate": "turingRate", "run": "turingRun", "step": "turingStep", "sync": "turingSync" },
    "ce.components.looper": { "bars": "looperBars", "lane": "looperLane", "laneRest": "looperLaneRest", "quantize": "looperQuantize", "run": "looperRun", "seconds": "looperSeconds", "sync": "looperSync" },
    "ce.components.orbit": { "bars": "orbitBars", "node": "orbitNode", "nodeAngle": "orbitNodeAngle", "nodeDepth": "orbitNodeDepth", "nodeRadius": "orbitNodeRadius", "nodeRatio": "orbitNodeRatio", "phase": "orbitPhase", "rate": "orbitRate", "run": "orbitRun", "sync": "orbitSync" },
    "ce.components.kinetic": { "bounce": "kineticBounce", "friction": "kineticFriction", "gravity": "kineticGravity", "keepAlive": "kineticKeepAlive", "launch": "kineticLaunch", "run": "kineticRun", "sync": "kineticSync", "velocity": "kineticVelocity" },
    "ce.components.constellation": { "bars": "constellationBars", "blend": "constellationBlend", "links": "constellationLinks", "mode": "constellationMode", "probe": "constellationProbe", "rate": "constellationRate", "run": "constellationRun", "sync": "constellationSync" },
    "ce.components.timbre": { "anchorX": "timbreAnchorX", "anchorY": "timbreAnchorY", "move": "timbreMove", "power": "timbrePower" },
    "ce.components.router": { "cc": "routerCc", "channel": "routerChannel", "deadzone": "routerDeadzone", "dest": "routerDest", "destDepth": "routerDestDepth", "input": "routerInput", "invert": "routerInvert", "poly": "routerPoly", "source": "routerSource" },
    "ce.components.macro": { "slot": "macroSlot", "slotCurve": "macroSlotCurve", "slotDepth": "macroSlotDepth", "slotMax": "macroSlotMax", "slotMin": "macroSlotMin", "value": "macroValue" },
    "ce.components.matrix": { "bipolar": "matrixBipolar", "cell": "matrixCell", "clear": "matrixClear", "step": "matrixStep" },
    "ce.components.constraint": { "gap": "constraintGap", "member": "constraintMember", "mode": "constraintMode" },
    "ce.components.envelope": { "loop": "envelopeLoop", "loopEnd": "envelopeLoopEnd", "loopStart": "envelopeLoopStart", "phase": "envelopePhase", "pointCurve": "envelopePointCurve", "pointX": "envelopePointX", "pointY": "envelopePointY", "preset": "envelopePreset", "sustain": "envelopeSustain", "timeMax": "envelopeTimeMax" },
    "ce.components.ribbon": { "bipolar": "ribbonBipolar", "returnMode": "ribbonReturnMode", "returnRate": "ribbonReturnRate", "returnValue": "ribbonReturnValue", "snap": "ribbonSnap", "value": "ribbonValue" },
    "ce.components.crossfader": { "bipolar": "crossfaderBipolar", "detent": "crossfaderDetent", "law": "crossfaderLaw", "mix": "crossfaderMix", "returnRate": "crossfaderReturnRate", "returnToCenter": "crossfaderReturnToCenter" },
    "ce.components.joystick": { "bipolar": "joystickBipolar", "move": "joystickMove", "returnAxes": "joystickReturnAxes", "returnRate": "joystickReturnRate", "returnToCenter": "joystickReturnToCenter" },
    "ce.components.meter": { "decay": "meterDecay", "holdMs": "meterHoldMs", "peakHold": "meterPeakHold", "scale": "meterScale", "value": "meterValue" },
    "ce.components.transport": { "beatUnit": "transportBeatUnit", "beatsPerBar": "transportBeatsPerBar", "bpm": "transportBpm", "clockOut": "transportClockOut", "countIn": "transportCountIn", "loop": "transportLoop", "loopBars": "transportLoopBars", "loopStart": "transportLoopStart", "source": "transportSource", "swing": "transportSwing" },
    "ce.components.panic": { "centreBend": "panicSetCentreBend", "channel": "panicSetChannel", "clearLocal": "panicSetClearLocal", "resetControllers": "panicSetResetControllers", "scope": "panicSetScope" },
    "ce.components.lcd": { "backlight": "lcdBacklight", "blink": "lcdBlink", "brightness": "lcdBrightness", "clear": "lcdClear", "contrast": "lcdContrast", "cursor": "lcdCursor", "cursorAt": "lcdCursorAt", "scroll": "lcdScroll", "scrollSpeed": "lcdScrollSpeed", "text": "lcdText", "value": "lcdValue" },
    "ce.components.pixel": { "anim": "pixelAnim", "animLoop": "pixelAnimLoop", "animPreset": "pixelAnimPreset", "animSpeed": "pixelAnimSpeed", "backlight": "pixelBacklight", "brightness": "pixelBrightness", "contrast": "pixelContrast", "gamma": "pixelGamma", "glow": "pixelGlow" },
}
__CE_ORDER = ["ce.core","ce.midi","ce.device","ce.math","ce.music","ce.time","ce.anim","ce.ui","ce.draw","ce.panel","ce.storage","ce.components.split","ce.components.phrase","ce.components.recorder","ce.components.harmony","ce.components.setlist","ce.components.arp","ce.components.chordpad","ce.components.noteribbon","ce.components.drumpads","ce.components.turing","ce.components.looper","ce.components.orbit","ce.components.kinetic","ce.components.constellation","ce.components.timbre","ce.components.router","ce.components.macro","ce.components.matrix","ce.components.constraint","ce.components.envelope","ce.components.ribbon","ce.components.crossfader","ce.components.joystick","ce.components.meter","ce.components.transport","ce.components.panic","ce.components.lcd","ce.components.pixel"]
__CE_META = [
    { "id": "ce.core", "version": "1.1", "runtime": "any" },
    { "id": "ce.midi", "version": "1.3", "runtime": "any" },
    { "id": "ce.device", "version": "1.3", "runtime": "any" },
    { "id": "ce.math", "version": "1.7", "runtime": "any" },
    { "id": "ce.music", "version": "1.2", "runtime": "any" },
    { "id": "ce.time", "version": "1.2", "runtime": "any" },
    { "id": "ce.anim", "version": "1.0", "runtime": "any" },
    { "id": "ce.ui", "version": "1.1", "runtime": "webview" },
    { "id": "ce.draw", "version": "1.1", "runtime": "webview" },
    { "id": "ce.panel", "version": "1.3", "runtime": "any" },
    { "id": "ce.storage", "version": "1.1", "runtime": "any" },
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

// --- the engine --------------------------------------------------------------------------------
class PythonScriptEngine final : public ScriptEngine
{
public:
    PythonScriptEngine() { g_engine = this; ensureInterpreter(); }
    ~PythonScriptEngine() override
    {
        reset();
        if (g_engine == this)   g_engine = nullptr;
        if (g_host   == host)   g_host   = nullptr; // don't leave g_host dangling at a destroyed host
    }

    juce::String language() const override { return "python"; }

    bool installApi (ScriptHostApi& h) override { host = &h; g_host = &h; return interpreterOk; }

    // Stored, then re-applied to every namespace that already exists, so toggling a module in the
    // editor takes effect without reloading the scripts.
    void setEnabledModules (const juce::StringArray& moduleIds) override
    {
        enabledModules = moduleIds;
        if (! interpreterOk) return;
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
        for (auto& [id, ns] : namespaces)
        {
            juce::ignoreUnused (id);
            if (! exec (boot.toRawUTF8(), ns)) PyErr_Clear();
        }
    }

    bool loadScript (const ScriptDefinition& def, const ScriptErrorSink& onError) override
    {
        if (! interpreterOk) { onError (def.id, initInfo.isNotEmpty() ? initInfo : juce::String ("Python interpreter failed to initialize")); return false; }
        g_host = host; g_engine = this; // a script may call api at module scope during exec — route to THIS instance

        // Fresh namespace dict per script (isolation). Seed builtins + owner, then prelude + source.
        PyObject* ns = PyDict_New();
        if (ns == nullptr) { onError (def.id, fetchPyError()); return false; }
        PyDict_SetItemString (ns, "__builtins__", PyEval_GetBuiltins());
        {
            // resolveSelfOwner: a panel script's `self` is the panel (see ScriptRuntime.h).
            PyObject* owner = PyUnicode_FromString (resolveSelfOwner (def).toRawUTF8());
            PyDict_SetItemString (ns, "__owner", owner);
            Py_XDECREF (owner);
        }

        const WatchdogScope guard (*this); // module-level statements obey the execution budget too
        currentScriptId = def.id;          // so a module-level on() tags its listener correctly
        // Prelude, then the module gate, then the user source — the gate has to be in place before
        // any top-level statement runs. Each script gets its own namespace dict, so the gate is
        // applied per script here rather than once for the language (as Lua can).
        const bool preludeOk = exec (kPrelude, ns)
                             && exec (extensionBoot().toRawUTF8(), ns)
                             && exec (moduleGateCall().toRawUTF8(), ns);
        const bool sourceOk  = preludeOk && exec (def.source.toRawUTF8(), ns);
        currentScriptId = {};
        if (! preludeOk) { onError (def.id, "prelude error: " + fetchPyError()); Py_DECREF (ns); return false; }
        if (! sourceOk)  { onError (def.id, "load error: " + fetchPyError()); Py_DECREF (ns); return false; }

        if (auto it = namespaces.find (def.id); it != namespaces.end()) Py_DECREF (it->second);
        namespaces[def.id] = ns; // keep the ref
        return true;
    }

    bool hasHandler (const juce::String& scriptId, const juce::String& fn) const override
    {
        auto it = namespaces.find (scriptId);
        if (it == namespaces.end()) return false;
        PyObject* f = PyDict_GetItemString (it->second, fn.toRawUTF8()); // borrowed
        return f != nullptr && PyCallable_Check (f);
    }

    // Anti-flood / loop guard (parity with Lua's instruction hook and JS's
    // QuickJS interrupt): a watchdog thread calls PyErr_SetInterrupt() when a
    // single entry into Python overruns its wall-clock budget, which raises
    // KeyboardInterrupt in the interpreter and aborts the runaway handler.
    // The error surfaces through the normal error sink via fetchPyError().
    /** Call a prelude function in one namespace. Returns the NEW reference, or nullptr after
        reporting. `args` may be null for a no-arg call; ownership stays with the caller. */
    PyObject* callPreludeRaw (PyObject* ns, const char* fn, PyObject* args,
                              const ScriptErrorSink& onError, const juce::String& what)
    {
        PyObject* f = PyDict_GetItemString (ns, fn);       // borrowed
        if (f == nullptr || ! PyCallable_Check (f)) return nullptr;
        PyObject* r = args != nullptr ? PyObject_CallObject (f, args) : PyObject_CallNoArgs (f);
        if (r == nullptr) { onError (what, fetchPyError()); return nullptr; }
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
        g_host = host; g_engine = this; // route api_* calls during this dispatch to THIS instance
        auto it = namespaces.find (scriptId);
        if (it == namespaces.end()) return {};
        PyObject* f = PyDict_GetItemString (it->second, fn.toRawUTF8()); // borrowed
        if (f == nullptr || ! PyCallable_Check (f)) return {};

        PyObject* arg = varToPy (payload);
        if (arg == nullptr) { onError (scriptId, "failed to convert payload: " + fetchPyError()); return {}; }
        const WatchdogScope guard (*this);
        currentScriptId = scriptId;        // a handler may call on()/off() while running
        PyObject* result = PyObject_CallFunctionObjArgs (f, arg, nullptr);
        currentScriptId = {};
        Py_DECREF (arg);

        if (result == nullptr) { onError (scriptId, fetchPyError()); return {}; }
        auto v = pyToVar (result);
        Py_DECREF (result);
        return v;
    }

    void deliverEvent (const juce::String& target, const juce::String& event,
                       const juce::var& payload, const ScriptErrorSink& onError) override
    {
        g_host = host; g_engine = this; // route api_* calls during delivery to THIS instance
        PyObject* arg = varToPy (payload);              // convert ONCE; the call borrows it
        if (arg == nullptr) { onError ("on:" + event, "failed to convert payload: " + fetchPyError()); return; }
        const WatchdogScope guard (*this);
        for (auto& l : listeners)
        {
            if (l.event != event) continue;
            if (l.target != target && l.target != "*" && l.target != "self") continue;
            PyObject* r = PyObject_CallFunctionObjArgs (l.fn, arg, nullptr);
            if (r == nullptr) onError ("on:" + event, fetchPyError());
            else Py_DECREF (r);
        }
        Py_DECREF (arg);                                // release the single owned ref
    }

    /* --------------------------------------------------------------- the reactive core
     * The rules live in each script's namespace (see __runReactive in the prelude), so the C++
     * side is only the caller. Every namespace gets a pass: a formula in one script has to settle
     * whatever moved in another. */
    void runReactive (const ScriptErrorSink& onError) override
    {
        if (! interpreterOk) return;
        g_host = host; g_engine = this;
        const WatchdogScope guard (*this);
        for (auto& kv : namespaces)
            if (! callPrelude (kv.second, "__runReactive", nullptr, onError, "compute/watch")) { /* reported */ }
    }

    bool applyMidiFilter (bool inbound, juce::var& bytes, const ScriptErrorSink& onError) override
    {
        if (! interpreterOk) return true;
        g_host = host; g_engine = this;
        for (auto& kv : namespaces)
        {
            PyObject* a = Py_BuildValue ("(OO)", inbound ? Py_True : Py_False, varToPy (bytes));
            if (a == nullptr) { fetchPyError(); continue; }
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

    bool applyIntercepts (const juce::String& path, juce::var& value, const ScriptErrorSink& onError) override
    {
        if (! interpreterOk) return true;
        g_host = host; g_engine = this;
        for (auto& kv : namespaces)
        {
            PyObject* args = Py_BuildValue ("(sO)", path.toRawUTF8(), varToPy (value));
            if (args == nullptr) { fetchPyError(); continue; }
            PyObject* out = callPreludeRaw (kv.second, "__applyIntercepts", args, onError, "intercept:" + path);
            Py_DECREF (args);
            if (out == nullptr) continue;
            auto decided = pyToVar (out);
            Py_DECREF (out);
            if (auto* o = decided.getDynamicObject())
            {
                if (o->hasProperty ("reject")) return false;
                if (o->hasProperty ("value")) value = o->getProperty ("value");
            }
        }
        return true;
    }

    bool callAction (const juce::String& name, const juce::var& args, juce::var& result,
                     const ScriptErrorSink& onError) override
    {
        if (! interpreterOk) return false;
        g_host = host; g_engine = this;
        const WatchdogScope guard (*this);
        for (auto& kv : namespaces)
        {
            PyObject* a = Py_BuildValue ("(sO)", name.toRawUTF8(), varToPy (args));
            if (a == nullptr) { fetchPyError(); continue; }
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

    // PyErr_SetInterrupt() is documented as callable from any thread without
    // the GIL — it simulates SIGINT, making the interpreter raise
    // KeyboardInterrupt in the main thread mid-execution.
    class Watchdog : private juce::Thread
    {
    public:
        Watchdog() : juce::Thread ("ce-python-watchdog") {}
        ~Watchdog() override { stopThread (2000); }

        void beginDispatch (double budgetSeconds)
        {
            fired.store (false);
            deadlineMs.store (juce::Time::getMillisecondCounterHiRes() + (budgetSeconds * 1000.0));
            if (! isThreadRunning()) startThread();
            notify();
        }

        void endDispatch()   { deadlineMs.store (0.0); }
        bool firedThisRun()  { return fired.exchange (false); }

    private:
        void run() override
        {
            while (! threadShouldExit())
            {
                const double deadline = deadlineMs.load();
                if (deadline > 0.0 && juce::Time::getMillisecondCounterHiRes() > deadline)
                {
                    PyErr_SetInterrupt();   // -> KeyboardInterrupt in the interpreter thread
                    fired.store (true);
                    deadlineMs.store (0.0); // fire once per dispatch
                }
                wait (50);
            }
        }

        std::atomic<double> deadlineMs { 0.0 };
        std::atomic<bool>   fired { false };
    };

    // Depth-shared like the Lua watchdog: only the outermost entry arms the
    // deadline, so nested dispatches (handler -> emit -> handler) don't reset
    // or prematurely clear it. On exit, absorb an interrupt that raced in
    // AFTER Python returned, so it can't leak into the next dispatch.
    struct WatchdogScope
    {
        explicit WatchdogScope (PythonScriptEngine& engineIn) : engine (engineIn)
        {
            if (engine.watchdogDepth++ == 0)
                engine.watchdog.beginDispatch (executionBudgetSeconds);
        }

        ~WatchdogScope()
        {
            if (--engine.watchdogDepth == 0)
            {
                engine.watchdog.endDispatch();
                if (engine.watchdog.firedThisRun() && PyErr_CheckSignals() != 0)
                    PyErr_Clear(); // late interrupt with no Python running — swallow it
            }
        }

        PythonScriptEngine& engine;
    };

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

    // Initialise CPython once, process-wide, with the bundled stdlib home if we can find one.
    void ensureInterpreter()
    {
        if (Py_IsInitialized())
        {
            // Another component (the host, or another plugin) already started CPython. Inittab can no
            // longer be appended, so register the `ceditor` bridge directly in sys.modules — otherwise
            // every script's `import ceditor` in the prelude would raise ModuleNotFoundError.
            PyObject* mods = PyImport_GetModuleDict(); // borrowed
            if (mods != nullptr && PyDict_GetItemString (mods, "ceditor") == nullptr)
            {
                PyObject* m = PyInit_ceditor(); // apiModuleDef has m_size = -1, so creating post-init is fine
                if (m == nullptr)
                {
                    interpreterOk = false;
                    initInfo = "Python ready (pre-initialized elsewhere) but failed to register 'ceditor' bridge: " + fetchPyError();
                    juce::Logger::writeToLog ("[python] " + initInfo);
                    return;
                }
                PyDict_SetItemString (mods, "ceditor", m);
                Py_DECREF (m);
            }
            interpreterOk = true;
            initInfo = "Python ready (interpreter pre-initialized by host/other component; ceditor bridge ensured)";
            return;
        }

        PyImport_AppendInittab ("ceditor", &PyInit_ceditor);

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
            interpreterOk = false;
            initInfo = "Python init FAILED: " + juce::String (status.err_msg ? status.err_msg : "unknown")
                     + " | home=" + (home.isNotEmpty() ? home : juce::String ("<none — isolated init can't auto-find stdlib>"))
                     + " | " + diag;
            juce::Logger::writeToLog ("[python] " + initInfo);
            return;
        }
        interpreterOk = true;
        initInfo = "Python ready | home=" + (home.isNotEmpty() ? home : juce::String ("<compiled-in>")) + " | " + diag;
    }

    // Where the stdlib lives: env override → `PythonRuntime` next to THIS binary → none. `diag`
    // accumulates what we found, surfaced into the script log so a failure is debuggable in-host.
    static juce::String resolvePythonHome (juce::String& diag)
    {
        if (auto env = juce::SystemStats::getEnvironmentVariable ("CEDITOR_PYTHONHOME", {}); env.isNotEmpty())
        { diag << "env CEDITOR_PYTHONHOME=" << env; return env; }

        // In a PLUGIN the process exe is the HOST (reaper.exe), so currentExecutableFile is wrong. Get
        // the directory of THIS module (the plugin DLL / this code) instead, so we find the bundled runtime.
        juce::File moduleDir;
       #if defined(_WIN32)
        HMODULE hmod = nullptr;
        if (GetModuleHandleExW (GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                                reinterpret_cast<LPCWSTR> (&PyInit_ceditor), &hmod) && hmod != nullptr)
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
        if (dladdr (reinterpret_cast<void*> (&PyInit_ceditor), &di) && di.dli_fname != nullptr)
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

    ScriptHostApi* host = nullptr;
    bool interpreterOk = false;
    juce::String initInfo;                        // why init failed (or where the stdlib was found) — for the log
    std::map<juce::String, PyObject*> namespaces; // scriptId -> namespace dict (owned ref)
    std::vector<Listener> listeners;
    Watchdog watchdog;
    int watchdogDepth = 0;
};

namespace
{
PyObject* api_on (PyObject*, PyObject* args)
{
    const char* target = nullptr; const char* event = nullptr; PyObject* fn = nullptr;
    if (! PyArg_ParseTuple (args, "ssO", &target, &event, &fn)) return nullptr;
    if (! PyCallable_Check (fn)) { PyErr_SetString (PyExc_TypeError, "on() needs a callable"); return nullptr; }
    Py_INCREF (fn);
    if (g_engine != nullptr) g_engine->addListener (juce::String::fromUTF8 (target), juce::String::fromUTF8 (event), fn);
    else Py_DECREF (fn);
    Py_RETURN_NONE;
}

PyObject* api_off (PyObject*, PyObject* args)
{
    const char* target = nullptr; const char* event = nullptr;
    if (! PyArg_ParseTuple (args, "ss", &target, &event)) return nullptr;
    if (g_engine != nullptr) g_engine->removeListener (juce::String::fromUTF8 (target), juce::String::fromUTF8 (event));
    Py_RETURN_NONE;
}
} // namespace

std::unique_ptr<ScriptEngine> createPythonEngine() { return std::make_unique<PythonScriptEngine>(); }

} // namespace ceditor::scripting
