// CeRuntime.java — the Java side of CEditor's compile-at-export native handler module, HOSTED-JVM path
// (javac bytecode + a jlink'd JRE shipped in the plugin + a JNI shim), NOT GraalVM native-image.
//
// Why hosted-JVM and not GraalVM: native-image needs a 8–16 GB / 30 s–5 min closed-world rebuild on
// EVERY export, plus the whole GraalVM JDK on the dev machine. Instead the user's handlers compile to
// ordinary bytecode with `javac` (seconds), and a small ~40–60 MB JRE produced by `jlink` ships INSIDE
// the plugin. The native shim `ce_java_shim.c` (built with the bundled clang) boots that JRE via the
// JNI Invocation API and forwards the flat C ABI to the static entry points below. This mirrors the C#
// hosted-CoreCLR path and the Python embeddable.
//
// Interop model: unlike the GraalVM version (which read C structs directly via @CStruct), the C shim
// owns the host vtable and does ALL CeValue marshalling. Java reaches the host through the `static
// native` methods below (implemented in the shim via RegisterNatives), and reads the incoming event
// payload through the nP* accessors (the shim walks the CeValue* whose address it passes us as a long).
// So NOTHING here is GraalVM-specific — it's plain Java + JNI.
//
// The user-facing surface (CeContext / CeEvent) is byte-for-byte source-compatible with the previous
// version, so existing Java handler sources keep compiling unchanged.
//
// Each plug-in instance loads this class, the registry and the handlers through a class loader of its
// own (the shim's ce_new_loader), so every static here and in a handler is that instance's alone.

import java.util.HashMap;
import java.util.Map;

public final class CeRuntime {

    private CeRuntime() {}

    // CE_ABI_VERSION from NativeHandlerAbi.h (the shim also returns this for ce_handler_abi_version()).
    static final int CE_ABI_VERSION = 1;

    // CeTag enum (NativeHandlerAbi.h) — the shim reports these from nGetKind / nPKind.
    static final int CE_NULL = 0, CE_DOUBLE = 1, CE_INT64 = 2, CE_BOOL = 3,
                     CE_STRING = 4, CE_BYTES = 5, CE_LIST = 6, CE_MAP = 7;

    // ===================================================================================== host services
    // Implemented in ce_java_shim.c (RegisterNatives). The FIRST arg `h` is the per-instance host vtable
    // pointer (CeHostVtable*) threaded through dispatch — NOT a global — so two plugin instances sharing
    // this (process-global) JVM each call back into their OWN host. Strings are UTF-8. Scalars only
    // across the boundary (matching the C++/C# convenience surface); list/map are a TODO on all sides.
    static native void   nSetD(long h, String key, double v);
    static native void   nSetS(long h, String key, String v);
    static native void   nSetB(long h, String key, boolean v);
    static native int    nGetKind(long h, String key, String form);   // CeTag of the host-returned value
    static native double nGetD(long h, String key, String form);
    static native String nGetS(long h, String key, String form);
    static native void   nCCd(long h, int channel, int cc, double v);
    static native void   nCCs(long h, int channel, int cc, String v);
    static native void   nLog(long h, int level, String msg);
    static native void   nEmitD(long h, String name, double v);
    static native void   nEmitS(long h, String name, String v);
    // A value of one of four kinds — CE_NULL, CE_DOUBLE (d), CE_BOOL (d is 0 or 1) or CE_STRING (s) —
    // picked by `kind`, rather than a native per kind: these calls take whatever the handler passes.
    static native void   nLogV(long h, int level, String msg, int kind, double d, String s);
    static native void   nNrpnV(long h, int channel, int msb, int lsb, int kind, double d, String s);
    static native void   nCCv(long h, int channel, int cc, int kind, double d, String s);
    static native void   nEmitV(long h, String name, int kind, double d, String s);
    static native void   nSysexList(long h, int[] bytes);
    static native void   nSysexHex(long h, String hex);

    // ===================================================================================== payload reads
    // `p` is the native address (jlong) of the dispatch CeValue* payload; the shim walks it (CE_MAP keyed
    // lookup, or a scalar payload treated as the "value" field) and returns the requested field.
    static native int    nPKind(long p, String key);          // CeTag of field, or -1 if absent
    static native double nPD(long p, String key);
    static native String nPS(long p, String key);

    // ===================================================================================== the host seam
    // Every call CeContext and CeEvent make goes through HOST. The shipped module leaves it as the JNI
    // host (the natives above); the export validator puts a recording host here, so what it runs is
    // the real generated registry and handlers over the real CeContext and CeEvent, on any machine
    // with a JDK — only the far side of each call differs. That half is the shim's, and
    // verify-java.mjs runs it end to end.
    static CeHostCalls HOST = new CeJniHost();

    // ===================================================================================== dispatch registry
    @FunctionalInterface
    public interface Handler {
        void run(CeContext ctx, CeEvent event);   // mirrors `void onValueChanged(CeContext, CeEvent)`
    }

    private static final Map<String, Handler> REGISTRY = new HashMap<>();
    private static String key(String scriptId, String eventId) { return scriptId + "\0" + eventId; }

    /** Called by the generated registry to wire one handler. */
    public static void register(String scriptId, String eventId, Handler h) {
        REGISTRY.put(key(scriptId, eventId), h);
    }

    // The generator emits GeneratedRegistry whose <clinit> calls register(...). Force it to load.
    private static void ensureRegistryLoaded() {
        try { Class.forName("GeneratedRegistry"); }
        catch (Throwable t) { /* registry absent -> has/dispatch become no-ops */ }
    }

    // ===================================================================================== flat-ABI entry points
    // Called by the C shim (CallStaticIntMethod / CallStaticVoidMethod). No IsolateThread, no struct
    // pointers — the shim resolved everything to JNI primitives. Every body swallows exceptions so none
    // escapes back across the JNI/extern "C" frame into the host.

    /** ce_handler_init -> here (the shim already cached the vtable + created the JVM). */
    public static int init() {
        try { ensureRegistryLoaded(); return 0; }
        catch (Throwable t) { return -2; }
    }

    /** ce_handler_has. */
    public static int has(String scriptId, String eventId) {
        try { return REGISTRY.containsKey(key(scriptId, eventId)) ? 1 : 0; }
        catch (Throwable t) { return 0; }
    }

    /** ce_handler_dispatch. `payload` is the native CeValue* address (or 0); `host` is this instance's
     *  CeHostVtable* (so callbacks reach the right plugin instance). */
    public static int dispatch(String scriptId, String eventId, long payload, long host) {
        try {
            Handler h = REGISTRY.get(key(scriptId, eventId));
            if (h == null) return 0;               // no such handler is not an error (parity with C++/C#)
            h.run(new CeContext(host), new CeEvent(payload));
            return 0;
        } catch (Throwable t) {
            return -1;                              // host logs + disables; never rethrow across the frame
        }
    }

    /** ce_handler_shutdown: this instance's registry. The shim then closes the instance's class loader;
     *  the JVM stays up for the process. */
    public static void shutdown() {
        try { REGISTRY.clear(); } catch (Throwable t) { /* swallow */ }
    }
}

// ====================================================================================================
// CeHostCalls — what CeContext and CeEvent ask of the host. CeJniHost answers it through the shim.
// ====================================================================================================
interface CeHostCalls {
    void   setD(long h, String key, double v);
    void   setS(long h, String key, String v);
    void   setB(long h, String key, boolean v);
    int    getKind(long h, String key, String form);
    double getD(long h, String key, String form);
    String getS(long h, String key, String form);
    void   ccD(long h, int channel, int cc, double v);
    void   ccS(long h, int channel, int cc, String v);
    void   ccV(long h, int channel, int cc, int kind, double d, String s);
    void   nrpnV(long h, int channel, int msb, int lsb, int kind, double d, String s);
    void   sysexList(long h, int[] bytes);
    void   sysexHex(long h, String hex);
    void   log(long h, int level, String msg);
    void   logV(long h, int level, String msg, int kind, double d, String s);
    void   emitD(long h, String name, double v);
    void   emitS(long h, String name, String v);
    void   emitV(long h, String name, int kind, double d, String s);
    int    pKind(long p, String key);
    double pD(long p, String key);
    String pS(long p, String key);
}

final class CeJniHost implements CeHostCalls {
    public void   setD(long h, String key, double v)                 { CeRuntime.nSetD(h, key, v); }
    public void   setS(long h, String key, String v)                 { CeRuntime.nSetS(h, key, v); }
    public void   setB(long h, String key, boolean v)                { CeRuntime.nSetB(h, key, v); }
    public int    getKind(long h, String key, String form)           { return CeRuntime.nGetKind(h, key, form); }
    public double getD(long h, String key, String form)              { return CeRuntime.nGetD(h, key, form); }
    public String getS(long h, String key, String form)              { return CeRuntime.nGetS(h, key, form); }
    public void   ccD(long h, int channel, int cc, double v)         { CeRuntime.nCCd(h, channel, cc, v); }
    public void   ccS(long h, int channel, int cc, String v)         { CeRuntime.nCCs(h, channel, cc, v); }
    public void   ccV(long h, int ch, int cc, int kind, double d, String s) { CeRuntime.nCCv(h, ch, cc, kind, d, s); }
    public void   nrpnV(long h, int ch, int msb, int lsb, int kind, double d, String s) { CeRuntime.nNrpnV(h, ch, msb, lsb, kind, d, s); }
    public void   sysexList(long h, int[] bytes)                     { CeRuntime.nSysexList(h, bytes); }
    public void   sysexHex(long h, String hex)                       { CeRuntime.nSysexHex(h, hex); }
    public void   log(long h, int level, String msg)                 { CeRuntime.nLog(h, level, msg); }
    public void   logV(long h, int level, String msg, int kind, double d, String s) { CeRuntime.nLogV(h, level, msg, kind, d, s); }
    public void   emitD(long h, String name, double v)               { CeRuntime.nEmitD(h, name, v); }
    public void   emitS(long h, String name, String v)               { CeRuntime.nEmitS(h, name, v); }
    public void   emitV(long h, String name, int kind, double d, String s) { CeRuntime.nEmitV(h, name, kind, d, s); }
    public int    pKind(long p, String key)                          { return CeRuntime.nPKind(p, key); }
    public double pD(long p, String key)                             { return CeRuntime.nPD(p, key); }
    public String pS(long p, String key)                             { return CeRuntime.nPS(p, key); }
}

// ====================================================================================================
// CeContext — the user-facing host surface (mirrors cpp/ce_runtime.h ce::Context and the C# CeContext).
// Top-level + package-private so generated handler signatures name it unqualified. Stateless: the host
// vtable lives in the shim, reached through CeRuntime.HOST.
//
// It covers the core every shipped example and the manual use, under the preview's own names — set/get
// (and setValue/getValue), log, sendCC/sendNRPN/sendSysex and clamp/scale/round/snap/lerp/curve — with
// the preview's results to the bit. The preview hands a Java handler the whole panel API as `ctx`;
// this does not, and a member past this core previews and does not compile.
// ====================================================================================================
final class CeContext {
    private final long h;   // this instance's CeHostVtable* (threaded from dispatch)
    CeContext(long host) { this.h = host; }

    /** setValue(path, value) — value as Double/Long/Integer/Boolean/String/null. */
    public void setValue(String path, Object value) {
        if (value == null) return;
        if (value instanceof String)  { CeRuntime.HOST.setS(h, path, (String) value); return; }
        if (value instanceof Boolean) { CeRuntime.HOST.setB(h, path, (Boolean) value); return; }
        if (value instanceof Number)  { CeRuntime.HOST.setD(h, path, ((Number) value).doubleValue()); return; }
        CeRuntime.HOST.setS(h, path, String.valueOf(value));
    }
    public void setValue(String path, double d) { CeRuntime.HOST.setD(h, path, d); }

    /** getValue(path, form) — returns Double/Boolean/String/null (scalars + strings, as on the C++ side).
     *  To read at a type, use getDouble/getInt/getString/getBoolean below: a number here is always a
     *  Double, so (int) ctx.get(...) throws. The Java preview reports the reads javac rejects
     *  (contextReadErrors in javaPreview.js). */
    public Object getValue(String path, String form) {
        switch (CeRuntime.HOST.getKind(h, path, form)) {
            case CeRuntime.CE_STRING: return CeRuntime.HOST.getS(h, path, form);
            case CeRuntime.CE_BOOL:   return CeRuntime.HOST.getD(h, path, form) != 0;
            case CeRuntime.CE_DOUBLE:
            case CeRuntime.CE_INT64:  return CeRuntime.HOST.getD(h, path, form);
            default:                  return null;
        }
    }
    public Object getValue(String path) { return getValue(path, "value"); }

    public void sendCC(int channel, int cc, Object value) {
        if (value instanceof String) { CeRuntime.HOST.ccS(h, channel, cc, (String) value); return; }
        if (value instanceof Number) { CeRuntime.HOST.ccD(h, channel, cc, ((Number) value).doubleValue()); return; }
        if (value instanceof Boolean) { CeRuntime.HOST.ccV(h, channel, cc, CeRuntime.CE_BOOL, ((Boolean) value) ? 1 : 0, null); return; }
    }
    public void sendCC(int channel, int cc, double v) { CeRuntime.HOST.ccD(h, channel, cc, v); }

    public void log(String msg) { CeRuntime.HOST.log(h, 0, msg); }

    public void emit(String name, Object data) {
        if (data instanceof String) { CeRuntime.HOST.emitS(h, name, (String) data); return; }
        if (data instanceof Number) { CeRuntime.HOST.emitD(h, name, ((Number) data).doubleValue()); return; }
        if (data instanceof Boolean) { CeRuntime.HOST.emitV(h, name, CeRuntime.CE_BOOL, ((Boolean) data) ? 1 : 0, null); return; }
        CeRuntime.HOST.emitD(h, name, 0);
    }

    // ------------------------------------------------------------------ the preview's spellings
    // The preview's ctx has set/get as well as setValue/getValue: they are one function there.
    public void set(String path, Object value) { setValue(path, value); }
    public void set(String path, double d) { setValue(path, d); }
    public Object get(String path) { return getValue(path, "value"); }
    public Object get(String path, String form) { return getValue(path, form); }

    // ------------------------------------------------------------------ typed reads
    // get returns Object, which a Java variable cannot take without a cast, and a cast throws when the
    // value is not the type cast to. These read at the type wanted and never throw, here and in the
    // preview alike (javaTypedReads in panelRuntime.js). They convert as ce::Var and the C# Var do: a
    // number as itself, a bool as 1 or 0, anything else as 0; text as itself, anything else as "";
    // a bool as itself, anything else as whether its number is non-zero. getInt is (int) getDouble.
    public double  getDouble(String path)               { return asDouble(getValue(path, "value")); }
    public double  getDouble(String path, String form)  { return asDouble(getValue(path, form)); }
    public int     getInt(String path)                  { return (int) getDouble(path); }
    public int     getInt(String path, String form)     { return (int) getDouble(path, form); }
    public String  getString(String path)               { return asString(getValue(path, "value")); }
    public String  getString(String path, String form)  { return asString(getValue(path, form)); }
    public boolean getBoolean(String path)              { return asBoolean(getValue(path, "value")); }
    public boolean getBoolean(String path, String form) { return asBoolean(getValue(path, form)); }

    static double asDouble(Object v) {
        if (v instanceof Number) return ((Number) v).doubleValue();
        if (v instanceof Boolean) return ((Boolean) v) ? 1 : 0;
        return 0;
    }
    static String asString(Object v) { return v instanceof String ? (String) v : ""; }
    static boolean asBoolean(Object v) { return v instanceof Boolean ? (Boolean) v : asDouble(v) != 0; }

    /** log(message, value) — the value goes to the host as it is, and the host formats it, as it does
     *  for a Lua or JS log. A host older than that slot gets the message alone (the shim checks). */
    public void log(String msg, Object value) {
        if (value instanceof Number) CeRuntime.HOST.logV(h, 0, msg, CeRuntime.CE_DOUBLE, ((Number) value).doubleValue(), null);
        else if (value instanceof String) CeRuntime.HOST.logV(h, 0, msg, CeRuntime.CE_STRING, 0, (String) value);
        else if (value instanceof Boolean) CeRuntime.HOST.logV(h, 0, msg, CeRuntime.CE_BOOL, ((Boolean) value) ? 1 : 0, null);
        else if (value == null) CeRuntime.HOST.logV(h, 0, msg, CeRuntime.CE_NULL, 0, null);
        else CeRuntime.HOST.logV(h, 0, msg, CeRuntime.CE_STRING, 0, String.valueOf(value));
    }
    public void log(String msg, double value) { CeRuntime.HOST.logV(h, 0, msg, CeRuntime.CE_DOUBLE, value, null); }

    public void sendNRPN(int channel, int msb, int lsb, double v) {
        CeRuntime.HOST.nrpnV(h, channel, msb, lsb, CeRuntime.CE_DOUBLE, v, null);
    }
    public void sendNRPN(int channel, int msb, int lsb, Object v) {
        if (v instanceof Number) sendNRPN(channel, msb, lsb, ((Number) v).doubleValue());
        else if (v instanceof String) CeRuntime.HOST.nrpnV(h, channel, msb, lsb, CeRuntime.CE_STRING, 0, (String) v);
        else if (v instanceof Boolean) CeRuntime.HOST.nrpnV(h, channel, msb, lsb, CeRuntime.CE_BOOL, ((Boolean) v) ? 1 : 0, null);
    }

    /** sendSysex(bytes) or sendSysex("F0 41 10 …"). The list or the string goes to the host as it is —
     *  the host reads it as it does for Lua and JS (each byte 0 to 255, each hex token one byte,
     *  anything else refused with a message) and adds F0/F7. No byte[] overload:
     *  a Java byte is signed, so (byte) 0xF0 is -16, where the preview reads it as 240. */
    public void sendSysex(int[] bytes) { CeRuntime.HOST.sysexList(h, bytes == null ? new int[0] : bytes); }
    public void sendSysex(java.util.List<Integer> bytes) {
        int[] out = new int[bytes == null ? 0 : bytes.size()];
        for (int i = 0; i < out.length; i++) { Integer b = bytes.get(i); out[i] = b == null ? 0 : b; }
        CeRuntime.HOST.sysexList(h, out);
    }
    public void sendSysex(String hex) { CeRuntime.HOST.sysexHex(h, hex == null ? "" : hex); }

    // ------------------------------------------------------------------ the arithmetic helpers
    // Written from the WebView runtime's definitions, which every prelude agrees with, to the bit.
    // Java's Math.round returns a long — no -0, no NaN, no infinity — so round is written out: JS
    // Math.round rounds half towards +infinity and returns -0 for [-0.5, 0).
    static double jsRound(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v) || v == Math.floor(v)) return v;
        if (v < 0 && v >= -0.5) return -0.0;
        double r = Math.floor(v);
        return (v - r >= 0.5) ? r + 1.0 : r;
    }
    public double clamp(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }
    public double round(double v) { return jsRound(v); }
    public double scale(double v, double inLo, double inHi, double outLo, double outHi) {
        return inHi == inLo ? outLo : outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo);
    }
    public double snap(double v, double step) { return step == 0 ? v : jsRound(v / step) * step; }
    public double lerp(double a, double b, double t) { return a + (b - a) * t; }
    public double curve(double v) { return v; }
    public double curve(double v, String shape) {
        if ("exp".equals(shape)) return v * v;
        if ("log".equals(shape)) return Math.sqrt(Double.isNaN(v) ? v : (v > 0 ? v : 0.0));
        if ("s".equals(shape)) return v * v * (3 - 2 * v);
        if (shape != null && !shape.isEmpty() && !"linear".equals(shape))
            log("curve(v, " + jsonQuote(shape) + "): unknown shape \u2014 using linear. The names are \"linear\", "
                + "\"exp\", \"log\" and \"s\"; for any other shape use map(v, points).");
        return v;
    }

    // JSON.stringify of a string, which is how the WebView quotes the shape in that message.
    static String jsonQuote(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.append('"').toString();
    }
}

// ====================================================================================================
// CeEvent — mirrors cpp/ce_runtime.h ce::Event and the C# CeEvent. Public value/firstTime + get(key).
// Reads the incoming payload through the host seam (the shim walks the CeValue* tree).
// ====================================================================================================
final class CeEvent {
    public final double value;
    public final boolean firstTime;
    private final long payload;       // native CeValue* address (0 if none)

    CeEvent(long payloadAddr) {
        this.payload = payloadAddr;
        this.value = (payload != 0) ? CeRuntime.HOST.pD(payload, "value") : 0.0;
        this.firstTime = (payload != 0) && CeRuntime.HOST.pD(payload, "firstTime") != 0.0;
    }

    /** Get a payload field as Double/String/null (scalars + strings). */
    public Object get(String key) {
        if (payload == 0) return null;
        switch (CeRuntime.HOST.pKind(payload, key)) {
            case CeRuntime.CE_STRING: return CeRuntime.HOST.pS(payload, key);
            case CeRuntime.CE_BOOL:   return CeRuntime.HOST.pD(payload, key) != 0;
            case CeRuntime.CE_DOUBLE:
            case CeRuntime.CE_INT64:  return CeRuntime.HOST.pD(payload, key);
            default:                  return null;
        }
    }
}
