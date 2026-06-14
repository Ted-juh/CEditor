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

#include <map>
#include <vector>

namespace ceditor::scripting
{

class PythonScriptEngine; // defined below; the anon-namespace globals + native fns refer to it.

namespace
{

// --- One host + one engine, process-wide (single interpreter, single message thread). ----------
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
            PyList_SET_ITEM (list, i, varToPy ((*arr)[i])); // steals ref
        return list;
    }
    if (auto* obj = v.getDynamicObject())
    {
        PyObject* dict = PyDict_New();
        if (dict == nullptr) return nullptr;
        for (auto& prop : obj->getProperties())
        {
            PyObject* val = varToPy (prop.value);
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
    if (PyLong_Check (o)) return juce::var ((juce::int64) PyLong_AsLongLong (o));
    if (PyFloat_Check (o)) return juce::var (PyFloat_AsDouble (o));
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
        PyBytes_AsStringAndSize (o, &buf, &n);
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
PyObject* api_beginTransmit (PyObject*, PyObject* args)
{
    int on = 0; if (! PyArg_ParseTuple (args, "p", &on)) return nullptr;
    g_host->beginTransmitOverride (on != 0); Py_RETURN_NONE;
}
PyObject* api_endTransmit (PyObject*, PyObject*) { g_host->endTransmitOverride(); Py_RETURN_NONE; }

// on(target, event, fn) — defined here so it can capture the engine's listener registry.
PyObject* api_on (PyObject*, PyObject* args);   // fwd (needs the engine class)

PyMethodDef apiMethods[] = {
    { "set",           api_set,           METH_VARARGS, nullptr },
    { "get",           api_get,           METH_VARARGS, nullptr },
    { "sendCC",        api_sendCC,        METH_VARARGS, nullptr },
    { "sendNRPN",      api_sendNRPN,      METH_VARARGS, nullptr },
    { "sendSysex",     api_sendSysex,     METH_VARARGS, nullptr },
    { "requestDump",   api_requestDump,   METH_VARARGS, nullptr },
    { "applyDump",     api_applyDump,     METH_VARARGS, nullptr },
    { "sendDump",      api_sendDump,      METH_VARARGS, nullptr },
    { "buildDump",     api_buildDump,     METH_VARARGS, nullptr },
    { "run",           api_run,           METH_VARARGS, nullptr },
    { "emit",          api_emit,          METH_VARARGS, nullptr },
    { "log",           api_log,           METH_VARARGS, nullptr },
    { "beginTransmit", api_beginTransmit, METH_VARARGS, nullptr },
    { "endTransmit",   api_endTransmit,   METH_NOARGS,  nullptr },
    { "on",            api_on,            METH_VARARGS, nullptr },
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
def run(target, args=None):       return __api.run(target, args)
def emit(name, data=None):        return __api.emit(name, data)
def log(msg, v=None):             return __api.log(str(msg), v)
def on(target, event, fn):        return __api.on(target, event, fn)

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
        return p if (not o or o in ("self", "*")) else (o + "." + p)
    def set(self, p, value, opts=None): return __api.set(self._p(p), value, opts)
    def get(self, p, form="value"):     return __api.get(self._p(p), form)
self = _Self()

# Pure-math + MIDI helpers — keep in sync with the Lua/JS preludes + panelApi.js.
def clamp(v, lo, hi): return lo if v < lo else (hi if v > hi else v)
def round(v): import math; return math.floor(v + 0.5)
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
)PY";

} // namespace

// --- the engine --------------------------------------------------------------------------------
class PythonScriptEngine final : public ScriptEngine
{
public:
    PythonScriptEngine() { g_engine = this; ensureInterpreter(); }
    ~PythonScriptEngine() override { reset(); if (g_engine == this) g_engine = nullptr; }

    juce::String language() const override { return "python"; }

    bool installApi (ScriptHostApi& h) override { host = &h; g_host = &h; return interpreterOk; }

    bool loadScript (const ScriptDefinition& def, const ScriptErrorSink& onError) override
    {
        if (! interpreterOk) { onError (def.id, "Python interpreter failed to initialize"); return false; }

        // Fresh namespace dict per script (isolation). Seed builtins + owner, then prelude + source.
        PyObject* ns = PyDict_New();
        if (ns == nullptr) { onError (def.id, fetchPyError()); return false; }
        PyDict_SetItemString (ns, "__builtins__", PyEval_GetBuiltins());
        {
            PyObject* owner = PyUnicode_FromString (def.owner.toRawUTF8());
            PyDict_SetItemString (ns, "__owner", owner);
            Py_XDECREF (owner);
        }

        if (! exec (kPrelude, ns)) { onError (def.id, "prelude error: " + fetchPyError()); Py_DECREF (ns); return false; }
        if (! exec (def.source.toRawUTF8(), ns)) { onError (def.id, "load error: " + fetchPyError()); Py_DECREF (ns); return false; }

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

    juce::var dispatch (const juce::String& scriptId, const juce::String& fn,
                        const juce::var& payload, const ScriptErrorSink& onError) override
    {
        auto it = namespaces.find (scriptId);
        if (it == namespaces.end()) return {};
        PyObject* f = PyDict_GetItemString (it->second, fn.toRawUTF8()); // borrowed
        if (f == nullptr || ! PyCallable_Check (f)) return {};

        PyObject* arg = varToPy (payload);
        PyObject* result = PyObject_CallFunctionObjArgs (f, arg, nullptr);
        Py_XDECREF (arg);

        if (result == nullptr) { onError (scriptId, fetchPyError()); return {}; }
        auto v = pyToVar (result);
        Py_DECREF (result);
        return v;
    }

    void deliverEvent (const juce::String& target, const juce::String& event,
                       const juce::var& payload, const ScriptErrorSink& onError) override
    {
        for (auto& l : listeners)
        {
            if (l.event != event) continue;
            if (l.target != target && l.target != "*" && l.target != "self") continue;
            PyObject* arg = varToPy (payload);
            PyObject* r = PyObject_CallFunctionObjArgs (l.fn, arg, nullptr);
            Py_XDECREF (arg);
            if (r == nullptr) onError ("on:" + event, fetchPyError());
            else Py_DECREF (r);
        }
    }

    void reset() override
    {
        if (! interpreterOk) return;
        for (auto& kv : namespaces) Py_XDECREF (kv.second);
        namespaces.clear();
        for (auto& l : listeners) Py_XDECREF (l.fn);
        listeners.clear();
    }

    // Called by the native on() bridge.
    void addListener (const juce::String& target, const juce::String& event, PyObject* fn)
    { listeners.push_back ({ target, event, fn }); } // fn already INCREF'd by caller

private:
    struct Listener { juce::String target, event; PyObject* fn; };

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
        if (Py_IsInitialized()) { interpreterOk = true; return; }

        PyImport_AppendInittab ("ceditor", &PyInit_ceditor);

        PyConfig config;
        PyConfig_InitIsolatedConfig (&config);   // don't read user site / env that could break a plugin
        config.site_import = 1;                  // but DO import site so the full stdlib is wired up

        if (auto home = resolvePythonHome(); home.isNotEmpty())
            PyConfig_SetBytesString (&config, &config.home, home.toRawUTF8());

        PyStatus status = Py_InitializeFromConfig (&config);
        PyConfig_Clear (&config);

        if (PyStatus_Exception (status))
        {
            juce::Logger::writeToLog (juce::String ("[python] init failed: ")
                                      + (status.err_msg ? status.err_msg : "unknown"));
            interpreterOk = false;
            return;
        }
        interpreterOk = true;
    }

    // Where the stdlib lives: explicit env override → `PythonRuntime` next to the binary → none.
    static juce::String resolvePythonHome()
    {
        if (auto env = juce::SystemStats::getEnvironmentVariable ("CEDITOR_PYTHONHOME", {}); env.isNotEmpty())
            return env;

        auto exeDir = juce::File::getSpecialLocation (juce::File::currentExecutableFile).getParentDirectory();
        for (auto candidate : { exeDir.getChildFile ("PythonRuntime"),
                                exeDir.getChildFile ("Resources").getChildFile ("PythonRuntime") })
            if (candidate.isDirectory()) return candidate.getFullPathName();

        return {}; // fall back to the interpreter's compiled-in default (a dev Python install)
    }

    ScriptHostApi* host = nullptr;
    bool interpreterOk = false;
    std::map<juce::String, PyObject*> namespaces; // scriptId -> namespace dict (owned ref)
    std::vector<Listener> listeners;
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
} // namespace

std::unique_ptr<ScriptEngine> createPythonEngine() { return std::make_unique<PythonScriptEngine>(); }

} // namespace ceditor::scripting
