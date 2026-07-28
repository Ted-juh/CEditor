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
    { "requestDump",   api_requestDump,   METH_VARARGS, nullptr },
    { "applyDump",     api_applyDump,     METH_VARARGS, nullptr },
    { "sendDump",      api_sendDump,      METH_VARARGS, nullptr },
    { "buildDump",     api_buildDump,     METH_VARARGS, nullptr },
    { "deviceQuery",   api_deviceQuery,   METH_VARARGS, nullptr },
    { "transportState", api_transportState, METH_NOARGS,  nullptr },
    { "animate",       api_animate,       METH_VARARGS, nullptr },
    { "animateStop",   api_animateStop,   METH_VARARGS, nullptr },
    { "animateRunning", api_animateRunning, METH_VARARGS, nullptr },
    { "startTimer",    api_startTimer,    METH_VARARGS, nullptr },
    { "stopTimer",     api_stopTimer,     METH_VARARGS, nullptr },
    { "run",           api_run,           METH_VARARGS, nullptr },
    { "emit",          api_emit,          METH_VARARGS, nullptr },
    { "log",           api_log,           METH_VARARGS, nullptr },
    { "beginTransmit", api_beginTransmit, METH_VARARGS, nullptr },
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

def set(path, value, opts=None): return __api.set(path, value, opts)
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
def requestDump(kind):            return __api.requestDump(kind)
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
    return v
# @module ce.music
__NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
def noteName(n):
    import math; n = math.floor(n)
    return __NOTES[((n % 12) + 12) % 12] + str(math.floor(n / 12) - 1)
def noteNumber(name):
    import re
    m = re.match(r"^([A-G]#?)(-?\d+)$", name)
    if not m: return 0
    i = __NOTES.index(m.group(1)) if m.group(1) in __NOTES else -1
    return 0 if i < 0 else (int(m.group(2)) + 1) * 12 + i

# BEGIN GENERATED music tables — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
# @module ce.music
__CE_SCALES = {}
__CE_CHORDS = {}
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
# END GENERATED music tables

# Scales, chords and snap-to-key, over the generated tables above. `root`/`note` take a MIDI number
# or a name ("C4"), the way sendNote does. An unknown scale or chord name returns None rather than
# guessing "major" — a script that asked for something this build does not know should find out.
def __pitch(v):
    import math
    return noteNumber(v) if isinstance(v, str) else math.floor(v or 0)
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
    inKey = set((base + x) % 12 for x in s)
    # Search outwards from the note itself. A TIE GOES UP, always: the +d candidate is tested before
    # the -d one, so a note exactly between two scale tones lands on the same one in every runtime.
    for d in range(0, 7):
        if (n + d) % 12 in inKey: return n + d
        if (n - d) % 12 in inKey: return n - d
    return n
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
# @module ce.ui
  "uiNotify","uiStatus","uiDialog",
# @module ce.draw
  "drawClear","drawFill","drawStroke","drawRect","drawCircle","drawLine","drawPath","drawText",
  "drawRedraw",
# @module ce.panel
  "panelCreate","panelClone","panelDestroy","panelParent","panelFind","panelInfo","panelTypes",
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
for __n in __WEBVIEW_ONLY:
    globals()[__n] = __webviewOnly(__n)
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
def sendMidi(b):                  return __api.sendMidi(b)
def __ch(c):
    import math
    c = math.floor(c or 1)
    return (1 if c < 1 else (16 if c > 16 else c)) - 1
def __7(v):
    import math
    v = math.floor(v or 0)
    return 0 if v < 0 else (127 if v > 127 else v)
def __note(n):
    return noteNumber(n) if isinstance(n, str) else __7(n)

def sendNote(channel, note, velocity):
    sendMidi([0x90 | __ch(channel), __note(note), __7(velocity)])
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

def __deviceQuery(kind, payload=None):
    return __api.deviceQuery(kind, payload)

def deviceProfile(role=None):
    return __deviceQuery("profile", { "role": __role(role) })

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

# @module ce.storage
# ce.storage. `state` is a plain dict-like namespace: each script is exec'd into its OWN module
# namespace, which lives as long as the script is loaded, so it persists between handler calls with
# no host help. Settings go through the host, because they outlive the session.
# SimpleNamespace, not a dict: `state.count = 1` has to work the same way `state.count` does in a
# Lua table and a JS object, and a dict only offers state["count"].
import types as __ce_state_types
state = __ce_state_types.SimpleNamespace()
def saveSetting(key, value):      return __api.saveSetting(str(key), value)
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
    "ce.core": { "emit": "emit", "get": "get", "log": "log", "noTransmit": "noTransmit", "off": "off", "on": "on", "run": "run", "set": "set", "transmit": "transmit" },
    "ce.midi": { "checksum": "checksum", "denibblize": "denibblize", "from14bit": "from14bit", "from7bit": "from7bit", "fromAscii": "fromAscii", "fromNibbles": "fromNibbles", "fromOffset": "fromOffset", "fromSigned": "fromSigned", "nibblize": "nibblize", "panic": "panic", "sendAftertouch": "sendAftertouch", "sendCC": "sendCC", "sendClock": "sendClock", "sendMidi": "sendMidi", "sendNRPN": "sendNRPN", "sendNote": "sendNote", "sendNoteOff": "sendNoteOff", "sendPitchBend": "sendPitchBend", "sendProgramChange": "sendProgramChange", "sendSysex": "sendSysex", "sendTransport": "sendTransport", "to14bit": "to14bit", "to7bit": "to7bit", "toAscii": "toAscii", "toNibbles": "toNibbles", "toOffset": "toOffset", "toSigned": "toSigned" },
    "ce.device": { "applyDump": "applyDump", "buildDump": "buildDump", "connected": "deviceConnected", "parameter": "deviceParameter", "parameters": "deviceParameters", "profile": "deviceProfile", "requestDump": "requestDump", "sendDump": "sendDump" },
    "ce.math": { "clamp": "clamp", "curve": "curve", "lerp": "lerp", "round": "round", "scale": "scale", "snap": "snap" },
    "ce.music": { "chord": "chordNotes", "name": "noteName", "number": "noteNumber", "quantize": "quantizeNote", "scale": "scaleNotes" },
    "ce.time": { "after": "after", "beatsToMs": "beatsToMs", "msToBeats": "msToBeats", "playing": "isPlaying", "startTimer": "startTimer", "stopTimer": "stopTimer", "syncTimer": "syncTimer", "tempo": "tempo", "transport": "transportInfo" },
    "ce.anim": { "running": "animateRunning", "spring": "animateSpring", "stop": "animateStop", "to": "animateTo" },
    "ce.ui": { "dialog": "uiDialog", "notify": "uiNotify", "status": "uiStatus" },
    "ce.draw": { "circle": "drawCircle", "clear": "drawClear", "fill": "drawFill", "line": "drawLine", "path": "drawPath", "rect": "drawRect", "redraw": "drawRedraw", "stroke": "drawStroke", "text": "drawText" },
    "ce.panel": { "clone": "panelClone", "create": "panelCreate", "destroy": "panelDestroy", "find": "panelFind", "info": "panelInfo", "parent": "panelParent", "types": "panelTypes" },
    "ce.storage": { "loadSetting": "loadSetting", "saveSetting": "saveSetting", "state": "state" },
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
    { "id": "ce.core", "version": "1.0", "runtime": "any" },
    { "id": "ce.midi", "version": "1.1", "runtime": "any" },
    { "id": "ce.device", "version": "1.1", "runtime": "any" },
    { "id": "ce.math", "version": "1.0", "runtime": "any" },
    { "id": "ce.music", "version": "1.1", "runtime": "any" },
    { "id": "ce.time", "version": "1.2", "runtime": "any" },
    { "id": "ce.anim", "version": "1.0", "runtime": "any" },
    { "id": "ce.ui", "version": "1.1", "runtime": "webview" },
    { "id": "ce.draw", "version": "1.0", "runtime": "webview" },
    { "id": "ce.panel", "version": "1.0", "runtime": "webview" },
    { "id": "ce.storage", "version": "1.0", "runtime": "any" },
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
