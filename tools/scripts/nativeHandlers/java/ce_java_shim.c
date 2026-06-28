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

/* ----------------------------------------------------------------- shim state */
static const CeHostVtable* gHost = NULL;
static JavaVM* gVm   = NULL;
static jclass  gCls  = NULL;   /* global ref to CeRuntime */
static jmethodID mInit, mHas, mDispatch, mShutdown;

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

/* ----------------------------------------------------------------- JNI native impls (Java -> host vtable) */

static void JNICALL n_setD(JNIEnv* e, jclass c, jstring key, jdouble v) {
    (void)c; if (!gHost || !gHost->set) return;
    const char* k = (*e)->GetStringUTFChars(e, key, NULL);
    CeStr ks = ce_str(k); CeValue val; memset(&val, 0, sizeof val); val.tag = CE_DOUBLE; val.u.d = v;
    gHost->set(gHost->host_ctx, &ks, &val, NULL);
    (*e)->ReleaseStringUTFChars(e, key, k);
}
static void JNICALL n_setS(JNIEnv* e, jclass c, jstring key, jstring s) {
    (void)c; if (!gHost || !gHost->set) return;
    const char* k = (*e)->GetStringUTFChars(e, key, NULL);
    const char* sv = (*e)->GetStringUTFChars(e, s, NULL);
    CeStr ks = ce_str(k); CeValue val; memset(&val, 0, sizeof val); val.tag = CE_STRING; val.u.s = ce_str(sv);
    gHost->set(gHost->host_ctx, &ks, &val, NULL);
    (*e)->ReleaseStringUTFChars(e, s, sv);
    (*e)->ReleaseStringUTFChars(e, key, k);
}
static void JNICALL n_setB(JNIEnv* e, jclass c, jstring key, jboolean b) {
    (void)c; if (!gHost || !gHost->set) return;
    const char* k = (*e)->GetStringUTFChars(e, key, NULL);
    CeStr ks = ce_str(k); CeValue val; memset(&val, 0, sizeof val); val.tag = CE_BOOL; val.u.b = b ? 1 : 0;
    gHost->set(gHost->host_ctx, &ks, &val, NULL);
    (*e)->ReleaseStringUTFChars(e, key, k);
}
static jint JNICALL n_getKind(JNIEnv* e, jclass c, jstring key, jstring form) {
    (void)c; if (!gHost || !gHost->get) return CE_NULL;
    const char* k = (*e)->GetStringUTFChars(e, key, NULL);
    const char* f = (*e)->GetStringUTFChars(e, form, NULL);
    CeStr ks = ce_str(k), fs = ce_str(f); CeValue out; memset(&out, 0, sizeof out);
    gHost->get(gHost->host_ctx, &ks, &fs, &out);
    jint t = out.tag;
    if (gHost->free_value) gHost->free_value(gHost->host_ctx, &out);
    (*e)->ReleaseStringUTFChars(e, form, f); (*e)->ReleaseStringUTFChars(e, key, k);
    return t;
}
static jdouble JNICALL n_getD(JNIEnv* e, jclass c, jstring key, jstring form) {
    (void)c; if (!gHost || !gHost->get) return 0;
    const char* k = (*e)->GetStringUTFChars(e, key, NULL);
    const char* f = (*e)->GetStringUTFChars(e, form, NULL);
    CeStr ks = ce_str(k), fs = ce_str(f); CeValue out; memset(&out, 0, sizeof out);
    gHost->get(gHost->host_ctx, &ks, &fs, &out);
    double d = ce_as_double(&out);
    if (gHost->free_value) gHost->free_value(gHost->host_ctx, &out);
    (*e)->ReleaseStringUTFChars(e, form, f); (*e)->ReleaseStringUTFChars(e, key, k);
    return d;
}
static jstring JNICALL n_getS(JNIEnv* e, jclass c, jstring key, jstring form) {
    (void)c; if (!gHost || !gHost->get) return (*e)->NewStringUTF(e, "");
    const char* k = (*e)->GetStringUTFChars(e, key, NULL);
    const char* f = (*e)->GetStringUTFChars(e, form, NULL);
    CeStr ks = ce_str(k), fs = ce_str(f); CeValue out; memset(&out, 0, sizeof out);
    gHost->get(gHost->host_ctx, &ks, &fs, &out);
    jstring r;
    if (out.tag == CE_STRING && out.u.s.ptr) {
        char* tmp = (char*)malloc((size_t)out.u.s.len + 1);
        memcpy(tmp, out.u.s.ptr, (size_t)out.u.s.len); tmp[out.u.s.len] = 0;
        r = (*e)->NewStringUTF(e, tmp); free(tmp);
    } else { r = (*e)->NewStringUTF(e, ""); }
    if (gHost->free_value) gHost->free_value(gHost->host_ctx, &out);
    (*e)->ReleaseStringUTFChars(e, form, f); (*e)->ReleaseStringUTFChars(e, key, k);
    return r;
}
static void JNICALL n_ccD(JNIEnv* e, jclass c, jint ch, jint cc, jdouble v) {
    (void)e; (void)c; if (!gHost || !gHost->send_cc) return;
    CeValue val; memset(&val, 0, sizeof val); val.tag = CE_DOUBLE; val.u.d = v;
    gHost->send_cc(gHost->host_ctx, ch, cc, &val);
}
static void JNICALL n_ccS(JNIEnv* e, jclass c, jint ch, jint cc, jstring s) {
    (void)c; if (!gHost || !gHost->send_cc) return;
    const char* sv = (*e)->GetStringUTFChars(e, s, NULL);
    CeValue val; memset(&val, 0, sizeof val); val.tag = CE_STRING; val.u.s = ce_str(sv);
    gHost->send_cc(gHost->host_ctx, ch, cc, &val);
    (*e)->ReleaseStringUTFChars(e, s, sv);
}
static void JNICALL n_log(JNIEnv* e, jclass c, jint level, jstring msg) {
    (void)c; if (!gHost || !gHost->log) return;
    const char* m = (*e)->GetStringUTFChars(e, msg, NULL);
    CeStr ms = ce_str(m);
    gHost->log(gHost->host_ctx, level, &ms);
    (*e)->ReleaseStringUTFChars(e, msg, m);
}
static void JNICALL n_emitD(JNIEnv* e, jclass c, jstring name, jdouble v) {
    (void)c; if (!gHost || !gHost->emit) return;
    const char* nm = (*e)->GetStringUTFChars(e, name, NULL);
    CeStr ns = ce_str(nm); CeValue val; memset(&val, 0, sizeof val); val.tag = CE_DOUBLE; val.u.d = v;
    gHost->emit(gHost->host_ctx, &ns, &val);
    (*e)->ReleaseStringUTFChars(e, name, nm);
}
static void JNICALL n_emitS(JNIEnv* e, jclass c, jstring name, jstring s) {
    (void)c; if (!gHost || !gHost->emit) return;
    const char* nm = (*e)->GetStringUTFChars(e, name, NULL);
    const char* sv = (*e)->GetStringUTFChars(e, s, NULL);
    CeStr ns = ce_str(nm); CeValue val; memset(&val, 0, sizeof val); val.tag = CE_STRING; val.u.s = ce_str(sv);
    gHost->emit(gHost->host_ctx, &ns, &val);
    (*e)->ReleaseStringUTFChars(e, s, sv);
    (*e)->ReleaseStringUTFChars(e, name, nm);
}
/* payload accessors: p = (CeValue*) address */
static jint JNICALL n_pKind(JNIEnv* e, jclass c, jlong p, jstring key) {
    (void)c;
    const char* k = (*e)->GetStringUTFChars(e, key, NULL);
    const CeValue* f = ce_field((const CeValue*)(intptr_t)p, k);
    (*e)->ReleaseStringUTFChars(e, key, k);
    return f ? f->tag : -1;
}
static jdouble JNICALL n_pD(JNIEnv* e, jclass c, jlong p, jstring key) {
    (void)c;
    const char* k = (*e)->GetStringUTFChars(e, key, NULL);
    const CeValue* f = ce_field((const CeValue*)(intptr_t)p, k);
    (*e)->ReleaseStringUTFChars(e, key, k);
    return ce_as_double(f);
}
static jstring JNICALL n_pS(JNIEnv* e, jclass c, jlong p, jstring key) {
    (void)c;
    const char* k = (*e)->GetStringUTFChars(e, key, NULL);
    const CeValue* f = ce_field((const CeValue*)(intptr_t)p, k);
    (*e)->ReleaseStringUTFChars(e, key, k);
    if (f && f->tag == CE_STRING && f->u.s.ptr) {
        char* tmp = (char*)malloc((size_t)f->u.s.len + 1);
        memcpy(tmp, f->u.s.ptr, (size_t)f->u.s.len); tmp[f->u.s.len] = 0;
        jstring r = (*e)->NewStringUTF(e, tmp); free(tmp); return r;
    }
    return (*e)->NewStringUTF(e, "");
}

static const JNINativeMethod kNatives[] = {
    { "nSetD",   "(Ljava/lang/String;D)V",                      (void*)n_setD   },
    { "nSetS",   "(Ljava/lang/String;Ljava/lang/String;)V",     (void*)n_setS   },
    { "nSetB",   "(Ljava/lang/String;Z)V",                      (void*)n_setB   },
    { "nGetKind","(Ljava/lang/String;Ljava/lang/String;)I",     (void*)n_getKind},
    { "nGetD",   "(Ljava/lang/String;Ljava/lang/String;)D",     (void*)n_getD   },
    { "nGetS",   "(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;", (void*)n_getS },
    { "nCCd",    "(IID)V",                                       (void*)n_ccD    },
    { "nCCs",    "(IILjava/lang/String;)V",                      (void*)n_ccS    },
    { "nLog",    "(ILjava/lang/String;)V",                       (void*)n_log    },
    { "nEmitD",  "(Ljava/lang/String;D)V",                       (void*)n_emitD  },
    { "nEmitS",  "(Ljava/lang/String;Ljava/lang/String;)V",      (void*)n_emitS  },
    { "nPKind",  "(JLjava/lang/String;)I",                       (void*)n_pKind  },
    { "nPD",     "(JLjava/lang/String;)D",                       (void*)n_pD     },
    { "nPS",     "(JLjava/lang/String;)Ljava/lang/String;",      (void*)n_pS     },
};

/* ----------------------------------------------------------------- JVM bootstrap */

typedef jint (JNICALL *CreateJavaVM_t)(JavaVM**, void**, void*);

static int ce_self_dir(ch_t* out, size_t cap) {
#ifdef _WIN32
    HMODULE self = NULL;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                            (LPCWSTR)(void*)&ce_handler_abi_version, &self)) return 0;
    DWORD n = GetModuleFileNameW(self, out, (DWORD)cap);
    if (n == 0 || n >= cap) return 0;
    for (DWORD i = n; i > 0; --i) if (out[i-1] == L'\\' || out[i-1] == L'/') { out[i-1] = 0; return 1; }
    return 0;
#else
    Dl_info info;
    if (!dladdr((void*)&ce_handler_abi_version, &info) || !info.dli_fname) return 0;
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

/* ----------------------------------------------------------------- exported flat ABI */

CE_EXPORT uint32_t CE_CALL ce_handler_abi_version(void) { return CE_ABI_VERSION; }

CE_EXPORT int CE_CALL ce_handler_init(const CeHostVtable* host, void** out_state) {
    if (!host || host->abi_version != CE_ABI_VERSION) return -1;
    gHost = host;

    ch_t selfdir[4096];
    if (!ce_self_dir(selfdir, 4096)) { fprintf(stderr, "[ce-java] cannot locate own module dir\n"); return -2; }
    ch_t jvmPath[4096];
    if (!ce_find_jvm(jvmPath, 4096, selfdir)) { fprintf(stderr, "[ce-java] libjvm not found (ship a jlink'd jre/)\n"); return -2; }

    void* jvmLib = ce_dlopen(jvmPath);
    if (!jvmLib) { fprintf(stderr, "[ce-java] cannot load libjvm\n"); return -2; }
    CreateJavaVM_t createVm = (CreateJavaVM_t)ce_dlsym(jvmLib, "JNI_CreateJavaVM");
    if (!createVm) { fprintf(stderr, "[ce-java] JNI_CreateJavaVM not found\n"); return -2; }

    /* classpath = <selfdir>/ce_handlers_java.jar */
    char cp[5000];
#ifdef _WIN32
    /* selfdir is wide; build the classpath option in narrow UTF-8 for JNI (paths are ASCII here). */
    char sd[4096]; size_t cv = 0; wcstombs_s(&cv, sd, sizeof(sd), selfdir, _TRUNCATE);
    snprintf(cp, sizeof(cp), "-Djava.class.path=%s\\ce_handlers_java.jar", sd);
#else
    snprintf(cp, sizeof(cp), "-Djava.class.path=%s/ce_handlers_java.jar", selfdir);
#endif

    JavaVMOption opts[1];
    opts[0].optionString = cp;
    JavaVMInitArgs args;
    memset(&args, 0, sizeof args);
    args.version = JNI_VERSION_1_8;
    args.nOptions = 1;
    args.options = opts;
    args.ignoreUnrecognized = JNI_FALSE;

    JNIEnv* env = NULL;
    if (createVm(&gVm, (void**)&env, &args) != JNI_OK || !env) { fprintf(stderr, "[ce-java] JNI_CreateJavaVM failed\n"); return -2; }

    jclass cls = (*env)->FindClass(env, "CeRuntime");
    if (!cls) { (*env)->ExceptionClear(env); fprintf(stderr, "[ce-java] CeRuntime class not found on classpath\n"); return -2; }
    gCls = (*env)->NewGlobalRef(env, cls);

    if ((*env)->RegisterNatives(env, gCls, kNatives, (jint)(sizeof(kNatives)/sizeof(kNatives[0]))) != 0) {
        (*env)->ExceptionClear(env); fprintf(stderr, "[ce-java] RegisterNatives failed\n"); return -2;
    }

    mInit     = (*env)->GetStaticMethodID(env, gCls, "init", "()I");
    mHas      = (*env)->GetStaticMethodID(env, gCls, "has", "(Ljava/lang/String;Ljava/lang/String;)I");
    mDispatch = (*env)->GetStaticMethodID(env, gCls, "dispatch", "(Ljava/lang/String;Ljava/lang/String;J)I");
    mShutdown = (*env)->GetStaticMethodID(env, gCls, "shutdown", "()V");
    if (!mInit || !mHas || !mDispatch || !mShutdown) { fprintf(stderr, "[ce-java] entry-point method IDs missing\n"); return -2; }

    jint r = (*env)->CallStaticIntMethod(env, gCls, mInit);
    if ((*env)->ExceptionCheck(env)) { (*env)->ExceptionClear(env); return -3; }
    if (out_state) *out_state = gVm;
    return (int)r;
}

CE_EXPORT int CE_CALL ce_handler_has(void* state, CeStr script_id, CeStr event_id) {
    (void)state; if (!gVm || !gCls) return 0;
    JNIEnv* e = ce_env(); if (!e) return 0;
    jstring js = ce_jstr(e, script_id), jev = ce_jstr(e, event_id);
    jint r = (*e)->CallStaticIntMethod(e, gCls, mHas, js, jev);
    if ((*e)->ExceptionCheck(e)) { (*e)->ExceptionClear(e); r = 0; }
    (*e)->DeleteLocalRef(e, js); (*e)->DeleteLocalRef(e, jev);
    return (int)r;
}

CE_EXPORT int CE_CALL ce_handler_dispatch(void* state, CeStr script_id, CeStr event_id,
                                          const CeValue* payload, CeValue* out_result) {
    (void)state; (void)out_result; if (!gVm || !gCls) return -1;
    JNIEnv* e = ce_env(); if (!e) return -1;
    jstring js = ce_jstr(e, script_id), jev = ce_jstr(e, event_id);
    jint r = (*e)->CallStaticIntMethod(e, gCls, mDispatch, js, jev, (jlong)(intptr_t)payload);
    if ((*e)->ExceptionCheck(e)) { (*e)->ExceptionClear(e); r = -1; }
    (*e)->DeleteLocalRef(e, js); (*e)->DeleteLocalRef(e, jev);
    return (int)r;
}

CE_EXPORT void CE_CALL ce_handler_shutdown(void* state) {
    (void)state;
    if (gVm && gCls) {
        JNIEnv* e = ce_env();
        if (e) { (*e)->CallStaticVoidMethod(e, gCls, mShutdown); if ((*e)->ExceptionCheck(e)) (*e)->ExceptionClear(e); }
    }
    /* Leave the JVM running for process lifetime (DestroyJavaVM blocks until all threads exit and a JVM
     * cannot be recreated in-process) — matches the C# "no real unload" note. */
    gHost = NULL;
}
