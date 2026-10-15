/* ce_java_shim.c — the native C shim for the Java (hosted-JVM) handler path. This file IS the module
 * the CEditor host loads (`ce_handlers_java.<dll|so|dylib>`): it exports the flat C ABI
 * (NativeHandlerAbi.h) and forwards every call to the Java handlers running on a SHIPPED, jlink'd JRE.
 * It is the Java analog of the C# CeHost.c shim.
 *
 * Why hosted-JVM (not GraalVM native-image): native-image needs a multi-GB closed-world rebuild on
 * every export; here the user's handlers are ordinary bytecode (javac, seconds) and a small jlink'd JRE
 * ships inside the plugin. The shim boots it via the JNI Invocation API.
 *
 * Build: with the bundled llvm-mingw clang (no MSVC). Depends only on <jni.h> (from the bundled JDK).
 * The JVM is loaded at runtime by dlopen/LoadLibrary of the shipped JRE's libjvm — NO link-time JVM
 * dependency, so the shim self-contains and the JRE is discovered beside the plugin.
 *
 * Shipped layout next to the plugin:
 *     ce_handlers_java.<ext>      <- this shim
 *     ce_handlers_java.jar        <- the user's compiled handler bytecode + CeRuntime + GeneratedRegistry
 *     jre/...                     <- the jlink'd runtime (lib/server/libjvm.so | bin/server/jvm.dll)
 *
 * libjvm discovery: $CE_JVM override -> <selfdir>/jre/<platform libjvm> -> $JAVA_HOME/<...> (dev/system).
 */
#ifndef _WIN32
#  define _GNU_SOURCE   /* dladdr / Dl_info */
#endif
#include "NativeHandlerAbi.h"
#include <jni.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#ifdef _WIN32
  #include <windows.h>
  typedef wchar_t ch_t;
  #define CE_SEP L'\\'
  static void* ce_dlopen(const ch_t* p){ return (void*)LoadLibraryExW(p, NULL, LOAD_WITH_ALTERED_SEARCH_PATH); }
  static void* ce_dlsym(void* h, const char* n){ return (void*)GetProcAddress((HMODULE)h, n); }
  static int   ce_exists(const ch_t* p){ return GetFileAttributesW(p) != INVALID_FILE_ATTRIBUTES; }
#else
  #include <dlfcn.h>
  #include <sys/stat.h>
  typedef char ch_t;
  #define CE_SEP '/'
  static void* ce_dlopen(const ch_t* p){ return dlopen(p, RTLD_NOW | RTLD_GLOBAL); }
  static void* ce_dlsym(void* h, const char* n){ return dlsym(h, n); }
  static int   ce_exists(const ch_t* p){ struct stat st; return stat(p, &st) == 0; }
#endif

/* ----------------------------------------------------------------- shim state
 * The JVM is process-global: a process can host one, and it cannot be recreated. Everything else is the
 * instance's own. Each instance loads the jar beside this shim through a class loader of its own, so
 * its CeRuntime, its registry and every handler class, with every static field in them, are its own
 * copies: two copies of a panel in one DAW count apart, and two different panels (two shims, two jars,
 * the same class names) each run their own classes. The ABI `state` handle is the instance.
 *
 * Until October 2026 the jar was the JVM's class path and every instance used the one CeRuntime: two
 * copies of a panel shared every static a handler kept, and a second panel's shim either loaded a
 * second libjvm beside the first or, finding the JVM, ran the first panel's classes. */
static JavaVM* gVm   = NULL;

typedef struct CeInstance {
    const CeHostVtable* host;   /* this instance's host, handed to Java on every dispatch */
    jobject   loader;           /* global ref: this instance's URLClassLoader over the jar */
    jclass    cls;              /* global ref: CeRuntime as that loader defined it */
    jmethodID mHas, mDispatch, mShutdown;
} CeInstance;

/* ----------------------------------------------------------------- small ABI helpers (C side owns marshalling) */

/* A CeStr from a NUL-terminated C string (valid for the duration of the host call only). */
static CeStr ce_str(const char* s) { CeStr r; r.ptr = s; r.len = s ? (int64_t)strlen(s) : 0; return r; }

/* Find a field in a dispatch payload: CE_MAP keyed lookup, or a scalar payload == the "value" field. */
static const CeValue* ce_field(const CeValue* p, const char* key) {
    if (!p) return NULL;
    if (p->tag == CE_MAP) {
        const CeMap* m = &p->u.map;
        int64_t klen = (int64_t)strlen(key);
        for (int64_t i = 0; i < m->len; i++) {
            const CeStr* k = &m->keys[i];
            if (k->len == klen && memcmp(key, k->ptr, (size_t)klen) == 0) return &m->vals[i];
        }
        return NULL;
    }
    if (strcmp(key, "value") == 0) return p;
    return NULL;
}
static double ce_as_double(const CeValue* v) {
    if (!v) return 0;
    switch (v->tag) {
        case CE_DOUBLE: return v->u.d;
        case CE_INT64:  return (double)v->u.i;
        case CE_BOOL:   return v->u.b;
        default:        return 0;
    }
}

/* ----------------------------------------------------------------- JNI native impls (Java -> host vtable)
 * The leading `jlong host` is THIS instance's CeHostVtable* (threaded from dispatch), so two plugin
 * instances sharing the process-global JVM each reach their own host. */

/* A Java String's UTF-8, borrowed until ce_unutf. A null reference must never reach
 * GetStringUTFChars: the JVM crashes, and the plugin host with it, on what Java code treats as an
 * ordinary mistake (ctx.log(label, v) with label unset). It throws NullPointerException back into the
 * handler instead, which CeRuntime.dispatch catches and reports as a failed handler, as it does any
 * other exception. NULL means an exception is pending (GetStringUTFChars can also fail for memory),
 * and the native returns without calling the host. */
static const char* ce_utf(JNIEnv* e, jstring s, const char* what) {
    if (!s) {
        char msg[96]; snprintf(msg, sizeof msg, "%s is null", what);
        jclass npe = (*e)->FindClass(e, "java/lang/NullPointerException");
        if (npe) (*e)->ThrowNew(e, npe, msg);
        return NULL;
    }
    return (*e)->GetStringUTFChars(e, s, NULL);
}
static void ce_unutf(JNIEnv* e, jstring s, const char* utf) { if (s && utf) (*e)->ReleaseStringUTFChars(e, s, utf); }

static void JNICALL n_setD(JNIEnv* e, jclass c, jlong host, jstring key, jdouble v) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->set) return;
    const char* k = ce_utf(e, key, "the path"); if (!k) return;
    CeStr ks = ce_str(k); CeValue val; memset(&val, 0, sizeof val); val.tag = CE_DOUBLE; val.u.d = v;
    vt->set(vt->host_ctx, &ks, &val, NULL);
    ce_unutf(e, key, k);
}
static void JNICALL n_setS(JNIEnv* e, jclass c, jlong host, jstring key, jstring s) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->set) return;
    const char* k = ce_utf(e, key, "the path"); if (!k) return;
    const char* sv = ce_utf(e, s, "the text"); if (!sv) { ce_unutf(e, key, k); return; }
    CeStr ks = ce_str(k); CeValue val; memset(&val, 0, sizeof val); val.tag = CE_STRING; val.u.s = ce_str(sv);
    vt->set(vt->host_ctx, &ks, &val, NULL);
    ce_unutf(e, s, sv);
    ce_unutf(e, key, k);
}
static void JNICALL n_setB(JNIEnv* e, jclass c, jlong host, jstring key, jboolean b) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->set) return;
    const char* k = ce_utf(e, key, "the path"); if (!k) return;
    CeStr ks = ce_str(k); CeValue val; memset(&val, 0, sizeof val); val.tag = CE_BOOL; val.u.b = b ? 1 : 0;
    vt->set(vt->host_ctx, &ks, &val, NULL);
    ce_unutf(e, key, k);
}
static jint JNICALL n_getKind(JNIEnv* e, jclass c, jlong host, jstring key, jstring form) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->get) return CE_NULL;
    const char* k = ce_utf(e, key, "the path"); if (!k) return CE_NULL;
    const char* f = ce_utf(e, form, "the form"); if (!f) { ce_unutf(e, key, k); return CE_NULL; }
    CeStr ks = ce_str(k), fs = ce_str(f); CeValue out; memset(&out, 0, sizeof out);
    vt->get(vt->host_ctx, &ks, &fs, &out);
    jint t = out.tag;
    if (vt->free_value) vt->free_value(vt->host_ctx, &out);
    ce_unutf(e, form, f); ce_unutf(e, key, k);
    return t;
}
static jdouble JNICALL n_getD(JNIEnv* e, jclass c, jlong host, jstring key, jstring form) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->get) return 0;
    const char* k = ce_utf(e, key, "the path"); if (!k) return 0;
    const char* f = ce_utf(e, form, "the form"); if (!f) { ce_unutf(e, key, k); return 0; }
    CeStr ks = ce_str(k), fs = ce_str(f); CeValue out; memset(&out, 0, sizeof out);
    vt->get(vt->host_ctx, &ks, &fs, &out);
    double d = ce_as_double(&out);
    if (vt->free_value) vt->free_value(vt->host_ctx, &out);
    ce_unutf(e, form, f); ce_unutf(e, key, k);
    return d;
}
static jstring JNICALL n_getS(JNIEnv* e, jclass c, jlong host, jstring key, jstring form) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->get) return (*e)->NewStringUTF(e, "");
    const char* k = ce_utf(e, key, "the path"); if (!k) return NULL;
    const char* f = ce_utf(e, form, "the form"); if (!f) { ce_unutf(e, key, k); return NULL; }
    CeStr ks = ce_str(k), fs = ce_str(f); CeValue out; memset(&out, 0, sizeof out);
    vt->get(vt->host_ctx, &ks, &fs, &out);
    jstring r;
    if (out.tag == CE_STRING && out.u.s.ptr) {
        char* tmp = (char*)malloc((size_t)out.u.s.len + 1);
        memcpy(tmp, out.u.s.ptr, (size_t)out.u.s.len); tmp[out.u.s.len] = 0;
        r = (*e)->NewStringUTF(e, tmp); free(tmp);
    } else { r = (*e)->NewStringUTF(e, ""); }
    if (vt->free_value) vt->free_value(vt->host_ctx, &out);
    ce_unutf(e, form, f); ce_unutf(e, key, k);
    return r;
}
static void JNICALL n_ccD(JNIEnv* e, jclass c, jlong host, jint ch, jint cc, jdouble v) {
    (void)e; (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->send_cc) return;
    CeValue val; memset(&val, 0, sizeof val); val.tag = CE_DOUBLE; val.u.d = v;
    vt->send_cc(vt->host_ctx, ch, cc, &val);
}
static void JNICALL n_ccS(JNIEnv* e, jclass c, jlong host, jint ch, jint cc, jstring s) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->send_cc) return;
    const char* sv = ce_utf(e, s, "the text"); if (!sv) return;
    CeValue val; memset(&val, 0, sizeof val); val.tag = CE_STRING; val.u.s = ce_str(sv);
    vt->send_cc(vt->host_ctx, ch, cc, &val);
    ce_unutf(e, s, sv);
}
static void JNICALL n_log(JNIEnv* e, jclass c, jlong host, jint level, jstring msg) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->log) return;
    const char* m = ce_utf(e, msg, "the message"); if (!m) return;
    CeStr ms = ce_str(m);
    vt->log(vt->host_ctx, level, &ms);
    ce_unutf(e, msg, m);
}
static void JNICALL n_emitD(JNIEnv* e, jclass c, jlong host, jstring name, jdouble v) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->emit) return;
    const char* nm = ce_utf(e, name, "the event name"); if (!nm) return;
    CeStr ns = ce_str(nm); CeValue val; memset(&val, 0, sizeof val); val.tag = CE_DOUBLE; val.u.d = v;
    vt->emit(vt->host_ctx, &ns, &val);
    ce_unutf(e, name, nm);
}
static void JNICALL n_emitS(JNIEnv* e, jclass c, jlong host, jstring name, jstring s) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->emit) return;
    const char* nm = ce_utf(e, name, "the event name"); if (!nm) return;
    const char* sv = ce_utf(e, s, "the text"); if (!sv) { ce_unutf(e, name, nm); return; }
    CeStr ns = ce_str(nm); CeValue val; memset(&val, 0, sizeof val); val.tag = CE_STRING; val.u.s = ce_str(sv);
    vt->emit(vt->host_ctx, &ns, &val);
    ce_unutf(e, s, sv);
    ce_unutf(e, name, nm);
}
/* A value of the kind Java picked: CE_NULL, CE_DOUBLE (d), CE_BOOL (d is 0 or 1) or CE_STRING (s). The
 * string's UTF-8 is borrowed from `s` and must be released by the caller (ce_release_kind) after the
 * host call. */
static CeValue ce_kind_value(JNIEnv* e, jint kind, jdouble d, jstring s, const char** utf) {
    CeValue v; memset(&v, 0, sizeof v); *utf = NULL;
    if (kind == CE_DOUBLE) { v.tag = CE_DOUBLE; v.u.d = d; }
    else if (kind == CE_BOOL) { v.tag = CE_BOOL; v.u.b = d != 0 ? 1 : 0; }
    else if (kind == CE_STRING && s && (*utf = (*e)->GetStringUTFChars(e, s, NULL)) != NULL) { v.tag = CE_STRING; v.u.s = ce_str(*utf); }
    else v.tag = CE_NULL;
    return v;
}
static void ce_release_kind(JNIEnv* e, jstring s, const char* utf) { ce_unutf(e, s, utf); }

/* log(message, value): the value goes to the host as it is, through log_value. A host older than that
 * slot gets the message alone, which is what a compiled handler always got before. */
static void JNICALL n_logV(JNIEnv* e, jclass c, jlong host, jint level, jstring msg, jint kind, jdouble d, jstring s) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt) return;
    const char* m = ce_utf(e, msg, "the message"); if (!m) return;
    CeStr ms = ce_str(m);
    if (CE_HAS_FIELD(vt, log_value) && vt->log_value) {
        const char* utf; CeValue v = ce_kind_value(e, kind, d, s, &utf);
        vt->log_value(vt->host_ctx, level, &ms, &v);
        ce_release_kind(e, s, utf);
    } else if (vt->log) {
        vt->log(vt->host_ctx, level, &ms);
    }
    ce_unutf(e, msg, m);
}
static void JNICALL n_nrpnV(JNIEnv* e, jclass c, jlong host, jint ch, jint msb, jint lsb, jint kind, jdouble d, jstring s) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->send_nrpn) return;
    const char* utf; CeValue v = ce_kind_value(e, kind, d, s, &utf);
    vt->send_nrpn(vt->host_ctx, ch, msb, lsb, &v);
    ce_release_kind(e, s, utf);
}
static void JNICALL n_ccV(JNIEnv* e, jclass c, jlong host, jint ch, jint cc, jint kind, jdouble d, jstring s) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->send_cc) return;
    const char* utf; CeValue v = ce_kind_value(e, kind, d, s, &utf);
    vt->send_cc(vt->host_ctx, ch, cc, &v);
    ce_release_kind(e, s, utf);
}
static void JNICALL n_emitV(JNIEnv* e, jclass c, jlong host, jstring name, jint kind, jdouble d, jstring s) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !vt->emit) return;
    const char* nm = ce_utf(e, name, "the event name"); if (!nm) return;
    CeStr ns = ce_str(nm);
    const char* utf; CeValue v = ce_kind_value(e, kind, d, s, &utf);
    vt->emit(vt->host_ctx, &ns, &v);
    ce_release_kind(e, s, utf);
    ce_unutf(e, name, nm);
}
/* sendSysex(int[]): a list of numbers to send_sysex_value, so the host clamps and frames it exactly as
 * it does for Lua and JS. A host older than that slot takes packed bytes, clamped here as it would. */
static void JNICALL n_sysexList(JNIEnv* e, jclass c, jlong host, jintArray arr) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt || !arr) return;
    jsize n = (*e)->GetArrayLength(e, arr);
    jint* xs = (*e)->GetIntArrayElements(e, arr, NULL);
    if (CE_HAS_FIELD(vt, send_sysex_value) && vt->send_sysex_value) {
        CeValue* items = (CeValue*)calloc(n > 0 ? (size_t)n : 1, sizeof(CeValue));
        for (jsize i = 0; i < n; i++) { items[i].tag = CE_INT64; items[i].u.i = xs[i]; }
        CeValue list; memset(&list, 0, sizeof list); list.tag = CE_LIST; list.u.list.items = items; list.u.list.len = n;
        vt->send_sysex_value(vt->host_ctx, &list);
        free(items);
    } else if (vt->send_sysex) {
        uint8_t* packed = (uint8_t*)malloc(n > 0 ? (size_t)n : 1);
        for (jsize i = 0; i < n; i++) packed[i] = (uint8_t)(xs[i] < 0 ? 0 : xs[i] > 255 ? 255 : xs[i]);
        CeBytes b; b.ptr = packed; b.len = n;
        vt->send_sysex(vt->host_ctx, &b);
        free(packed);
    }
    (*e)->ReleaseIntArrayElements(e, arr, xs, JNI_ABORT);
}
/* sendSysex("F0 41 …"): the string to send_sysex_value, which parses it as the host does for every
 * other language. A host older than that slot cannot take a string at all, and says so. */
static void JNICALL n_sysexHex(JNIEnv* e, jclass c, jlong host, jstring hex) {
    (void)c; const CeHostVtable* vt = (const CeHostVtable*)(intptr_t)host; if (!vt) return;
    if (!(CE_HAS_FIELD(vt, send_sysex_value) && vt->send_sysex_value)) {
        if (vt->log) { CeStr m = ce_str("sendSysex(\"\xE2\x80\xA6\"): this host takes a list of bytes, not a hex string."); vt->log(vt->host_ctx, 0, &m); }
        return;
    }
    const char* h = ce_utf(e, hex, "the hex string"); if (!h) return;
    CeValue v; memset(&v, 0, sizeof v); v.tag = CE_STRING; v.u.s = ce_str(h);
    vt->send_sysex_value(vt->host_ctx, &v);
    ce_unutf(e, hex, h);
}

/* payload accessors: p = (CeValue*) address (no host needed) */
static jint JNICALL n_pKind(JNIEnv* e, jclass c, jlong p, jstring key) {
    (void)c;
    const char* k = ce_utf(e, key, "the field name"); if (!k) return -1;
    const CeValue* f = ce_field((const CeValue*)(intptr_t)p, k);
    ce_unutf(e, key, k);
    return f ? f->tag : -1;
}
static jdouble JNICALL n_pD(JNIEnv* e, jclass c, jlong p, jstring key) {
    (void)c;
    const char* k = ce_utf(e, key, "the field name"); if (!k) return 0;
    const CeValue* f = ce_field((const CeValue*)(intptr_t)p, k);
    ce_unutf(e, key, k);
    return ce_as_double(f);
}
static jstring JNICALL n_pS(JNIEnv* e, jclass c, jlong p, jstring key) {
    (void)c;
    const char* k = ce_utf(e, key, "the field name"); if (!k) return NULL;
    const CeValue* f = ce_field((const CeValue*)(intptr_t)p, k);
    ce_unutf(e, key, k);
    if (f && f->tag == CE_STRING && f->u.s.ptr) {
        char* tmp = (char*)malloc((size_t)f->u.s.len + 1);
        memcpy(tmp, f->u.s.ptr, (size_t)f->u.s.len); tmp[f->u.s.len] = 0;
        jstring r = (*e)->NewStringUTF(e, tmp); free(tmp); return r;
    }
    return (*e)->NewStringUTF(e, "");
}

static const JNINativeMethod kNatives[] = {
    { "nSetD",   "(JLjava/lang/String;D)V",                      (void*)n_setD   },
    { "nSetS",   "(JLjava/lang/String;Ljava/lang/String;)V",     (void*)n_setS   },
    { "nSetB",   "(JLjava/lang/String;Z)V",                      (void*)n_setB   },
    { "nGetKind","(JLjava/lang/String;Ljava/lang/String;)I",     (void*)n_getKind},
    { "nGetD",   "(JLjava/lang/String;Ljava/lang/String;)D",     (void*)n_getD   },
    { "nGetS",   "(JLjava/lang/String;Ljava/lang/String;)Ljava/lang/String;", (void*)n_getS },
    { "nCCd",    "(JIID)V",                                      (void*)n_ccD    },
    { "nCCs",    "(JIILjava/lang/String;)V",                     (void*)n_ccS    },
    { "nLog",    "(JILjava/lang/String;)V",                      (void*)n_log    },
    { "nEmitD",  "(JLjava/lang/String;D)V",                      (void*)n_emitD  },
    { "nEmitS",  "(JLjava/lang/String;Ljava/lang/String;)V",     (void*)n_emitS  },
    { "nLogV",   "(JILjava/lang/String;IDLjava/lang/String;)V",  (void*)n_logV   },
    { "nNrpnV",  "(JIIIIDLjava/lang/String;)V",                  (void*)n_nrpnV  },
    { "nCCv",    "(JIIIDLjava/lang/String;)V",                   (void*)n_ccV    },
    { "nEmitV",  "(JLjava/lang/String;IDLjava/lang/String;)V",   (void*)n_emitV  },
    { "nSysexList", "(J[I)V",                                    (void*)n_sysexList },
    { "nSysexHex",  "(JLjava/lang/String;)V",                    (void*)n_sysexHex  },
    { "nPKind",  "(JLjava/lang/String;)I",                       (void*)n_pKind  },
    { "nPD",     "(JLjava/lang/String;)D",                       (void*)n_pD     },
    { "nPS",     "(JLjava/lang/String;)Ljava/lang/String;",      (void*)n_pS     },
};

/* ----------------------------------------------------------------- JVM bootstrap */

typedef jint (JNICALL *CreateJavaVM_t)(JavaVM**, void**, void*);
typedef jint (JNICALL *GetCreatedJavaVMs_t)(JavaVM**, jsize, jsize*);

/* An address inside THIS module, to ask the loader which file it came from. Private on purpose: an
 * exported function's address, which this used, resolves through the global symbol scope, so with
 * another panel's copy of this shim loaded too it named the other one's file, and this panel ran the
 * other panel's handlers. Nor is this module put in the global scope when it pins itself, for the same
 * reason. */
static void ce_self_anchor(void) {}

static int ce_self_dir(ch_t* out, size_t cap) {
#ifdef _WIN32
    HMODULE self = NULL;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                            (LPCWSTR)(void*)&ce_self_anchor, &self)) return 0;
    DWORD n = GetModuleFileNameW(self, out, (DWORD)cap);
    if (n == 0 || n >= cap) return 0;
    for (DWORD i = n; i > 0; --i) if (out[i-1] == L'\\' || out[i-1] == L'/') { out[i-1] = 0; return 1; }
    return 0;
#else
    Dl_info info;
    if (!dladdr((void*)&ce_self_anchor, &info) || !info.dli_fname) return 0;
    size_t n = strlen(info.dli_fname);
    if (n >= cap) return 0;
    memcpy(out, info.dli_fname, n + 1);
    for (size_t i = n; i > 0; --i) if (out[i-1] == '/') { out[i-1] = 0; return 1; }
    out[0] = '.'; out[1] = 0; return 1;
#endif
}

/* Locate libjvm: $CE_JVM -> <selfdir>/jre/<platform path> -> $JAVA_HOME/<platform path>. */
static int ce_find_jvm(ch_t* out, size_t cap, const ch_t* selfdir) {
#ifdef _WIN32
    const ch_t* rel = L"bin\\server\\jvm.dll";
    DWORD g = GetEnvironmentVariableW(L"CE_JVM", out, (DWORD)cap);
    if (g > 0 && g < cap && ce_exists(out)) return 1;
    ch_t p[4096]; _snwprintf(p, 4096, L"%s\\jre\\%s", selfdir, rel);
    if (ce_exists(p)) { wcsncpy(out, p, cap); return 1; }
    ch_t jh[4096]; DWORD jn = GetEnvironmentVariableW(L"JAVA_HOME", jh, 4096);
    if (jn > 0 && jn < 4096) { _snwprintf(p, 4096, L"%s\\%s", jh, rel); if (ce_exists(p)) { wcsncpy(out, p, cap); return 1; } }
#else
  #ifdef __APPLE__
    const char* rel = "lib/server/libjvm.dylib";
  #else
    const char* rel = "lib/server/libjvm.so";
  #endif
    const char* env = getenv("CE_JVM");
    if (env && *env && ce_exists(env)) { strncpy(out, env, cap - 1); out[cap-1] = 0; return 1; }
    char p[4096]; snprintf(p, sizeof(p), "%s/jre/%s", selfdir, rel);
    if (ce_exists(p)) { strncpy(out, p, cap - 1); out[cap-1] = 0; return 1; }
    const char* jh = getenv("JAVA_HOME");
    if (jh && *jh) { snprintf(p, sizeof(p), "%s/%s", jh, rel); if (ce_exists(p)) { strncpy(out, p, cap - 1); out[cap-1] = 0; return 1; } }
#endif
    return 0;
}

/* Pin THIS shared library resident for the process lifetime (see the C# shim for the rationale): the
 * plugin going offline makes the host unload us, but the in-process JVM can't be recreated. */
static void ce_pin_self(void) {
#ifdef _WIN32
    HMODULE self = NULL;
    GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
                       (LPCWSTR)(void*)&ce_self_anchor, &self);
#else
    Dl_info info;
    if (dladdr((void*)&ce_self_anchor, &info) && info.dli_fname)
        dlopen(info.dli_fname, RTLD_NOW | RTLD_NOLOAD | RTLD_NODELETE);
#endif
}

static JNIEnv* ce_env(void) {
    JNIEnv* e = NULL;
    if (!gVm) return NULL;
    if ((*gVm)->GetEnv(gVm, (void**)&e, JNI_VERSION_1_8) == JNI_OK) return e;
    if ((*gVm)->AttachCurrentThread(gVm, (void**)&e, NULL) == 0) return e;
    return NULL;
}

/* Build a Java String from a CeStr (UTF-8 ptr,len; not necessarily NUL-terminated). */
static jstring ce_jstr(JNIEnv* e, CeStr s) {
    if (!s.ptr || s.len <= 0) return (*e)->NewStringUTF(e, "");
    char* tmp = (char*)malloc((size_t)s.len + 1);
    memcpy(tmp, s.ptr, (size_t)s.len); tmp[s.len] = 0;
    jstring r = (*e)->NewStringUTF(e, tmp); free(tmp);
    return r;
}

/* The JVM already in this process, if there is one, found without loading a libjvm: another panel's
 * shim, beside its own jre/, may have started it. Loading this shim's libjvm too would put a second
 * JVM library in the process, which HotSpot does not survive. */
static JavaVM* ce_existing_vm(void) {
    GetCreatedJavaVMs_t get = NULL;
#ifdef _WIN32
    HMODULE jvm = GetModuleHandleW(L"jvm.dll");
    if (jvm) get = (GetCreatedJavaVMs_t)GetProcAddress(jvm, "JNI_GetCreatedJavaVMs");
#else
    get = (GetCreatedJavaVMs_t)dlsym(RTLD_DEFAULT, "JNI_GetCreatedJavaVMs");   /* libjvm is loaded RTLD_GLOBAL */
#endif
    JavaVM* vm = NULL; jsize n = 0;
    if (get && get(&vm, 1, &n) == JNI_OK && n > 0) return vm;
    return NULL;
}

/* A Java String naming the jar beside this shim. */
static jstring ce_jar_path(JNIEnv* e) {
    ch_t selfdir[4096];
    if (!ce_self_dir(selfdir, 4096)) return NULL;
#ifdef _WIN32
    ch_t p[4200]; int n = _snwprintf(p, 4200, L"%s\\ce_handlers_java.jar", selfdir);
    if (n < 0) return NULL;
    return (*e)->NewString(e, (const jchar*)p, (jsize)wcslen(p));   /* UTF-16 as Windows has it */
#else
    char p[4200]; snprintf(p, sizeof p, "%s/ce_handlers_java.jar", selfdir);
    return (*e)->NewStringUTF(e, p);
#endif
}

/* Clears a pending Java exception; true if there was one. */
static int ce_failed(JNIEnv* e) {
    if (!(*e)->ExceptionCheck(e)) return 0;
    (*e)->ExceptionClear(e);
    return 1;
}

/* new URLClassLoader(new URL[] { new File(jar).toURI().toURL() }, ClassLoader.getPlatformClassLoader()).
 * Its parent is the platform loader, not the application loader: the class path is not this panel's
 * to read (the JVM may be another panel's), so nothing of ours can come from it. Local ref, or NULL. */
static jobject ce_new_loader(JNIEnv* e) {
    jstring jar = ce_jar_path(e); if (!jar) return NULL;
    jclass fileC = (*e)->FindClass(e, "java/io/File");
    jclass uriC  = (*e)->FindClass(e, "java/net/URI");
    jclass urlC  = (*e)->FindClass(e, "java/net/URL");
    jclass clC   = (*e)->FindClass(e, "java/lang/ClassLoader");
    jclass uclC  = (*e)->FindClass(e, "java/net/URLClassLoader");
    if (ce_failed(e) || !fileC || !uriC || !urlC || !clC || !uclC) return NULL;
    jobject file = (*e)->NewObject(e, fileC, (*e)->GetMethodID(e, fileC, "<init>", "(Ljava/lang/String;)V"), jar);
    if (ce_failed(e) || !file) return NULL;
    jobject uri = (*e)->CallObjectMethod(e, file, (*e)->GetMethodID(e, fileC, "toURI", "()Ljava/net/URI;"));
    if (ce_failed(e) || !uri) return NULL;
    jobject url = (*e)->CallObjectMethod(e, uri, (*e)->GetMethodID(e, uriC, "toURL", "()Ljava/net/URL;"));
    if (ce_failed(e) || !url) return NULL;
    jobjectArray urls = (*e)->NewObjectArray(e, 1, urlC, url);
    if (ce_failed(e) || !urls) return NULL;
    jobject parent = (*e)->CallStaticObjectMethod(e, clC,
        (*e)->GetStaticMethodID(e, clC, "getPlatformClassLoader", "()Ljava/lang/ClassLoader;"));
    if (ce_failed(e) || !parent) return NULL;
    jobject loader = (*e)->NewObject(e, uclC,
        (*e)->GetMethodID(e, uclC, "<init>", "([Ljava/net/URL;Ljava/lang/ClassLoader;)V"), urls, parent);
    if (ce_failed(e)) return NULL;
    return loader;
}

/* Class.forName(name, true, loader). Local ref, or NULL. */
static jclass ce_load_class(JNIEnv* e, jobject loader, const char* name) {
    jclass classC = (*e)->FindClass(e, "java/lang/Class");
    if (ce_failed(e) || !classC) return NULL;
    jmethodID forName = (*e)->GetStaticMethodID(e, classC, "forName",
        "(Ljava/lang/String;ZLjava/lang/ClassLoader;)Ljava/lang/Class;");
    jstring jname = (*e)->NewStringUTF(e, name);
    if (ce_failed(e) || !forName || !jname) return NULL;
    jclass cls = (jclass)(*e)->CallStaticObjectMethod(e, classC, forName, jname, JNI_TRUE, loader);
    if (ce_failed(e)) return NULL;
    return cls;
}

/* Lets go of an instance: its registry cleared, its loader closed (which releases the jar), and its
 * classes left for the collector. */
static void ce_free_instance(JNIEnv* e, CeInstance* inst) {
    if (!inst) return;
    /* A native thread's local refs last until it detaches, which the host's never does. */
    if (e && (*e)->PushLocalFrame(e, 8) != 0) { ce_failed(e); e = NULL; }
    if (e && inst->cls && inst->mShutdown) { (*e)->CallStaticVoidMethod(e, inst->cls, inst->mShutdown); ce_failed(e); }
    if (e && inst->loader) {
        jclass uclC = (*e)->FindClass(e, "java/net/URLClassLoader");
        jmethodID close = uclC ? (*e)->GetMethodID(e, uclC, "close", "()V") : NULL;
        if (close) (*e)->CallVoidMethod(e, inst->loader, close);
        ce_failed(e);
    }
    if (e && inst->cls)    (*e)->DeleteGlobalRef(e, inst->cls);
    if (e && inst->loader) (*e)->DeleteGlobalRef(e, inst->loader);
    if (e) (*e)->PopLocalFrame(e, NULL);
    free(inst);
}

/* ----------------------------------------------------------------- exported flat ABI */

CE_EXPORT uint32_t CE_CALL ce_handler_abi_version(void) { return CE_ABI_VERSION; }

CE_EXPORT int CE_CALL ce_handler_init(const CeHostVtable* host, void** out_state) {
    if (!host || host->abi_version != CE_ABI_VERSION) return -1;
    ce_pin_self();   /* stay mapped across the plugin going offline/online */

    /* The JVM is process-global: created once, reused by every plugin instance (a process can host only
     * ONE JVM, and it cannot be recreated). */
    if (gVm == NULL) gVm = ce_existing_vm();
    if (gVm == NULL) {
        ch_t selfdir[4096];
        if (!ce_self_dir(selfdir, 4096)) { fprintf(stderr, "[ce-java] cannot locate own module dir\n"); return -2; }
        ch_t jvmPath[4096];
        if (!ce_find_jvm(jvmPath, 4096, selfdir)) { fprintf(stderr, "[ce-java] libjvm not found (ship a jlink'd jre/)\n"); return -2; }

        void* jvmLib = ce_dlopen(jvmPath);
        if (!jvmLib) { fprintf(stderr, "[ce-java] cannot load libjvm\n"); return -2; }
        CreateJavaVM_t createVm = (CreateJavaVM_t)ce_dlsym(jvmLib, "JNI_CreateJavaVM");
        if (!createVm) { fprintf(stderr, "[ce-java] JNI_CreateJavaVM not found\n"); return -2; }
        GetCreatedJavaVMs_t getCreatedVms = (GetCreatedJavaVMs_t)ce_dlsym(jvmLib, "JNI_GetCreatedJavaVMs");

        /* No class path: each instance loads its classes through a loader of its own (ce_new_loader). */
        JavaVMInitArgs args;
        memset(&args, 0, sizeof args);
        args.version = JNI_VERSION_1_8;
        args.nOptions = 0;
        args.options = NULL;
        args.ignoreUnrecognized = JNI_FALSE;

        JavaVM* vm = NULL; JNIEnv* env = NULL;
        // A process can host only ONE JVM and it cannot be recreated. If this module was unloaded and
        // reloaded (e.g. all plugin instances were removed, dropping the DLL refcount, then a new one was
        // added) the original JVM is still alive in the process — recover and reuse it instead of trying
        // to create a second one (which would fail). The shim pins itself resident to avoid the unload
        // in the first place; this is the belt-and-suspenders path.
        jsize nvms = 0;
        if (getCreatedVms && getCreatedVms(&vm, 1, &nvms) == JNI_OK && nvms > 0 && vm != NULL) {
            /* reuse it */
        } else {
            vm = NULL;
            if (createVm(&vm, (void**)&env, &args) != JNI_OK || !env) { fprintf(stderr, "[ce-java] JNI_CreateJavaVM failed\n"); return -2; }
        }
        gVm = vm; /* the VM is up; an instance that fails below leaves it for the next */
    }

    JNIEnv* env = ce_env();
    if (!env) { fprintf(stderr, "[ce-java] no JNIEnv after VM bring-up\n"); return -2; }
    if ((*env)->PushLocalFrame(env, 32) != 0) { ce_failed(env); return -2; }

    CeInstance* inst = (CeInstance*)calloc(1, sizeof(CeInstance));
    if (!inst) { (*env)->PopLocalFrame(env, NULL); return -2; }
    inst->host = host;
    int rc = -2;
    jobject loader = ce_new_loader(env);
    jclass cls = loader ? ce_load_class(env, loader, "CeRuntime") : NULL;
    if (!loader)   fprintf(stderr, "[ce-java] could not make this instance's class loader\n");
    else if (!cls) fprintf(stderr, "[ce-java] CeRuntime class not found in ce_handlers_java.jar\n");
    else {
        inst->loader = (*env)->NewGlobalRef(env, loader);
        inst->cls    = (jclass)(*env)->NewGlobalRef(env, cls);
        /* Each instance's CeRuntime is a class of its own, so its natives are bound to it here. */
        if ((*env)->RegisterNatives(env, inst->cls, kNatives, (jint)(sizeof(kNatives)/sizeof(kNatives[0]))) != 0) {
            ce_failed(env); fprintf(stderr, "[ce-java] RegisterNatives failed\n");
        } else {
            jmethodID mInit = (*env)->GetStaticMethodID(env, inst->cls, "init", "()I");
            inst->mHas      = (*env)->GetStaticMethodID(env, inst->cls, "has", "(Ljava/lang/String;Ljava/lang/String;)I");
            inst->mDispatch = (*env)->GetStaticMethodID(env, inst->cls, "dispatch", "(Ljava/lang/String;Ljava/lang/String;JJ)I");
            inst->mShutdown = (*env)->GetStaticMethodID(env, inst->cls, "shutdown", "()V");
            if (ce_failed(env) || !mInit || !inst->mHas || !inst->mDispatch || !inst->mShutdown) {
                fprintf(stderr, "[ce-java] entry-point method IDs missing\n");
            } else {
                jint r = (*env)->CallStaticIntMethod(env, inst->cls, mInit);
                rc = ce_failed(env) ? -3 : (int)r;
            }
        }
    }
    (*env)->PopLocalFrame(env, NULL);
    if (rc != 0) { ce_free_instance(env, inst); return rc; }

    if (out_state) *out_state = inst;
    return 0;
}

CE_EXPORT int CE_CALL ce_handler_has(void* state, CeStr script_id, CeStr event_id) {
    CeInstance* inst = (CeInstance*)state; if (!gVm || !inst) return 0;
    JNIEnv* e = ce_env(); if (!e) return 0;
    jstring js = ce_jstr(e, script_id), jev = ce_jstr(e, event_id);
    jint r = (*e)->CallStaticIntMethod(e, inst->cls, inst->mHas, js, jev);
    if ((*e)->ExceptionCheck(e)) { (*e)->ExceptionClear(e); r = 0; }
    (*e)->DeleteLocalRef(e, js); (*e)->DeleteLocalRef(e, jev);
    return (int)r;
}

CE_EXPORT int CE_CALL ce_handler_dispatch(void* state, CeStr script_id, CeStr event_id,
                                          const CeValue* payload, CeValue* out_result) {
    (void)out_result; CeInstance* inst = (CeInstance*)state; if (!gVm || !inst) return -1;
    JNIEnv* e = ce_env(); if (!e) return -1;
    jstring js = ce_jstr(e, script_id), jev = ce_jstr(e, event_id);
    /* This instance's own CeRuntime, handed this instance's host, so callbacks reach THIS instance. */
    jint r = (*e)->CallStaticIntMethod(e, inst->cls, inst->mDispatch, js, jev,
                                       (jlong)(intptr_t)payload, (jlong)(intptr_t)inst->host);
    if ((*e)->ExceptionCheck(e)) { (*e)->ExceptionClear(e); r = -1; }
    (*e)->DeleteLocalRef(e, js); (*e)->DeleteLocalRef(e, jev);
    return (int)r;
}

CE_EXPORT void CE_CALL ce_handler_shutdown(void* state) {
    /* This instance only: its registry, loader and classes. The JVM stays up for the process lifetime
     * (DestroyJavaVM blocks until all threads exit, and a JVM cannot be recreated in-process). */
    CeInstance* inst = (CeInstance*)state; if (!inst) return;
    ce_free_instance(gVm ? ce_env() : NULL, inst);
}
