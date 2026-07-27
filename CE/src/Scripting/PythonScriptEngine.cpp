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
import ceditor as __api

def set(path, value, opts=None): return __api.set(path, value, opts)
def get(path, form="value"):      return __api.get(path, form)
def sendCC(ch, cc, v):            return __api.sendCC(ch, cc, v)
def sendNRPN(ch, msb, lsb, v):    return __api.sendNRPN(ch, msb, lsb, v)
def sendSysex(b):                 return __api.sendSysex(b)
def requestDump(kind):            return __api.requestDump(kind)
def applyDump(b):                 return __api.applyDump(b)
def sendDump(kind):               return __api.sendDump(kind)
def buildDump(kind):              return __api.buildDump(kind)
def startTimer(id, ms=0):         return __api.startTimer(id, ms)
def stopTimer(id):                return __api.stopTimer(id)
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

# Panel-component verbs (panelApi.js PANEL_COMMANDS). The Zone Splitter, Phrase Sequencer,
# Recorder, Harmoniser and Setlist are modelled and rendered in the panel view; there is no C++
# counterpart to drive with the window closed. Defining them here as explaining stubs means a
# script that strays across the boundary says so, instead of raising NameError.
__WEBVIEW_ONLY = [
    "splitPreset","splitMute","splitChannel","splitTranspose","splitPoint",
    "phraseSeed","phraseClear","phraseKey","phraseScale","phraseTranspose","phraseDirection","phraseRun","phraseCell",
    "recorderRecord","recorderStop","recorderPlay","recorderClear","recorderUndo","recorderQuantize",
    "recorderTranspose","recorderBars","recorderSource","recorderNudge","recorderShift","recorderStore",
    "recorderLoad","recorderCountIn",
    "harmonyMode","harmonyKey","harmonyScale","harmonySize","harmonyShape","harmonyVoicing","harmonyInversion",
    "harmonyOctave","harmonyOutOfKey","harmonyKeepPlayed","harmonyChannel","harmonyVoiceLeading","harmonyStrum",
    "harmonyDegree",
    "setlistNext","setlistPrev","setlistGoto","setlistEnable","setlistWrap","setlistCrossfade",
]
def __webviewOnly(name):
    def stub(*args, **kwargs):
        log("[panel] " + name + "() needs the panel window open — that component is drawn and modelled "
            "in the panel view, so there is nothing to drive while the window is closed.")
    return stub
for __n in __WEBVIEW_ONLY:
    globals()[__n] = __webviewOnly(__n)

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

# BEGIN GENERATED module namespace — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
# Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
# on top. ce.core is global: its members are never namespaced, so they appear here only for
# discoverability (ce.core.set is the same function as set).
import types as __ce_types
__CE_MODULES = {
    "ce.core": { "emit": "emit", "get": "get", "log": "log", "noTransmit": "noTransmit", "off": "off", "on": "on", "run": "run", "set": "set", "transmit": "transmit" },
    "ce.midi": { "checksum": "checksum", "denibblize": "denibblize", "from14bit": "from14bit", "from7bit": "from7bit", "fromAscii": "fromAscii", "fromNibbles": "fromNibbles", "fromOffset": "fromOffset", "fromSigned": "fromSigned", "nibblize": "nibblize", "panic": "panic", "sendAftertouch": "sendAftertouch", "sendCC": "sendCC", "sendClock": "sendClock", "sendMidi": "sendMidi", "sendNRPN": "sendNRPN", "sendNote": "sendNote", "sendNoteOff": "sendNoteOff", "sendPitchBend": "sendPitchBend", "sendProgramChange": "sendProgramChange", "sendSysex": "sendSysex", "sendTransport": "sendTransport", "to14bit": "to14bit", "to7bit": "to7bit", "toAscii": "toAscii", "toNibbles": "toNibbles", "toOffset": "toOffset", "toSigned": "toSigned" },
    "ce.device": { "applyDump": "applyDump", "buildDump": "buildDump", "requestDump": "requestDump", "sendDump": "sendDump" },
    "ce.math": { "clamp": "clamp", "curve": "curve", "lerp": "lerp", "round": "round", "scale": "scale", "snap": "snap" },
    "ce.music": { "noteName": "noteName", "noteNumber": "noteNumber" },
    "ce.time": { "startTimer": "startTimer", "stopTimer": "stopTimer" },
    "ce.storage": { "loadSetting": "loadSetting", "saveSetting": "saveSetting", "state": "state" },
    "ce.components.split": { "channel": "splitChannel", "mute": "splitMute", "point": "splitPoint", "preset": "splitPreset", "transpose": "splitTranspose" },
    "ce.components.phrase": { "cell": "phraseCell", "clear": "phraseClear", "direction": "phraseDirection", "key": "phraseKey", "run": "phraseRun", "scale": "phraseScale", "seed": "phraseSeed", "transpose": "phraseTranspose" },
    "ce.components.recorder": { "bars": "recorderBars", "clear": "recorderClear", "countIn": "recorderCountIn", "load": "recorderLoad", "nudge": "recorderNudge", "play": "recorderPlay", "quantize": "recorderQuantize", "record": "recorderRecord", "shift": "recorderShift", "source": "recorderSource", "stop": "recorderStop", "store": "recorderStore", "transpose": "recorderTranspose", "undo": "recorderUndo" },
    "ce.components.harmony": { "channel": "harmonyChannel", "degree": "harmonyDegree", "inversion": "harmonyInversion", "keepPlayed": "harmonyKeepPlayed", "key": "harmonyKey", "mode": "harmonyMode", "octave": "harmonyOctave", "outOfKey": "harmonyOutOfKey", "scale": "harmonyScale", "shape": "harmonyShape", "size": "harmonySize", "strum": "harmonyStrum", "voiceLeading": "harmonyVoiceLeading", "voicing": "harmonyVoicing" },
    "ce.components.setlist": { "crossfade": "setlistCrossfade", "enable": "setlistEnable", "jump": "setlistGoto", "next": "setlistNext", "prev": "setlistPrev", "wrap": "setlistWrap" },
}
ce = __ce_types.SimpleNamespace()
for __ce_path, __ce_members in __CE_MODULES.items():
    __ce_node = ce
    for __ce_seg in __ce_path.split(".")[1:]:
        if not hasattr(__ce_node, __ce_seg):
            setattr(__ce_node, __ce_seg, __ce_types.SimpleNamespace())
        __ce_node = getattr(__ce_node, __ce_seg)
    for __ce_short, __ce_global in __ce_members.items():
        setattr(__ce_node, __ce_short, globals()[__ce_global])
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
        const bool preludeOk = exec (kPrelude, ns);
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
