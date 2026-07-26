/* CeHost.c — the native C hosting shim for the C# (hosted-CoreCLR) handler path.
 *
 * This tiny C file IS the module the CEditor host loads (`ce_handlers_csharp.<dll|so|dylib>`): it
 * exports the flat C ABI (NativeHandlerAbi.h) that NativeHandlerEngine resolves by name, and forwards
 * every call to the MANAGED handler assembly `ce_managed.dll` (Roslyn-compiled IL — no native
 * toolchain) running on a SHIPPED, trimmed CoreCLR. It is the C# analog of ce_java_shim.c.
 *
 * Why this exists (see native-handlers-design.md §C#): NativeAOT-on-Windows needs the MSVC CRT +
 * Windows SDK import libraries, which are Microsoft-proprietary and NOT redistributable — so we can't
 * ship a no-Visual-Studio NativeAOT path to users. Instead we ship a CoreCLR runtime (MIT) inside the
 * plugin and host it from native code via the official nethost/hostfxr API. The user's C# is compiled
 * to platform-neutral IL by Roslyn (no linker, no MSVC, no Windows SDK).
 *
 * Build: with the bundled llvm-mingw clang (its own static MinGW/UCRT — NO MSVC). It depends only on
 * hostfxr.h/coreclr_delegates.h (header-only) and loads hostfxr at runtime by path (no link against
 * nethost — so no libstdc++/MSVC dependency creeps in).
 *
 * Runtime layout shipped next to the plugin (the exporter assembles this):
 *     <plugin dir>/ce_handlers_csharp.<ext>      <- this shim
 *     <plugin dir>/ce_managed.dll                <- Roslyn-compiled user handlers + CeRuntime
 *     <plugin dir>/ce_managed.runtimeconfig.json
 *     <plugin dir>/dotnet-runtime/...            <- trimmed self-contained CoreCLR (hostfxr, coreclr, BCL)
 *
 * hostfxr discovery order: $CE_HOSTFXR (test/override) -> the shipped dotnet-runtime dir -> (if built
 * with -DCE_USE_NETHOST) nethost's get_hostfxr_path (a machine-wide dotnet install).
 */
#ifndef _WIN32
#  define _GNU_SOURCE   /* dladdr / Dl_info */
#endif
#include "NativeHandlerAbi.h"
#include "coreclr_delegates.h"
#include "hostfxr.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

/* Opt-in diagnostics: when the env var CE_HANDLER_LOG is set, append a line to
 * <temp>/ce_handlers_csharp.log on each ABI call (init/has/dispatch). Off by default (no overhead, no
 * file). Used to pin down why a handler fires once but not on a later window-open. */
static void ce_log(const char* fmt, ...) {
    if (getenv("CE_HANDLER_LOG") == NULL) return;
    char path[4096];
#ifdef _WIN32
    wchar_t tmpW[2048]; DWORD n = GetTempPathW(2048, tmpW);
    char tmpA[4096]; size_t cv = 0; if (n == 0) return; wcstombs_s(&cv, tmpA, sizeof tmpA, tmpW, _TRUNCATE);
    snprintf(path, sizeof path, "%sce_handlers_csharp.log", tmpA);
#else
    const char* t = getenv("TMPDIR"); if (t == NULL || !*t) t = "/tmp";
    snprintf(path, sizeof path, "%s/ce_handlers_csharp.log", t);
#endif
    FILE* f = fopen(path, "a"); if (!f) return;
    va_list ap; va_start(ap, fmt); vfprintf(f, fmt, ap); va_end(ap); fputc('\n', f); fclose(f);
}

#ifdef _WIN32
  #include <windows.h>
  typedef wchar_t ch_t;                 /* == char_t in hostfxr.h on Windows */
  #define CE_SEP   L'\\'
  #define CE_LIT(s) L##s
  static void*  ce_dlopen(const ch_t* p){ return (void*)LoadLibraryExW(p, NULL, LOAD_WITH_ALTERED_SEARCH_PATH); }
  static void*  ce_dlsym(void* h, const char* n){ return (void*)GetProcAddress((HMODULE)h, n); }
  static int    ce_exists(const ch_t* p){ DWORD a = GetFileAttributesW(p); return a != INVALID_FILE_ATTRIBUTES; }
#else
  #include <dlfcn.h>
  #include <sys/stat.h>
  typedef char ch_t;                    /* == char_t in hostfxr.h on Unix */
  #define CE_SEP   '/'
  #define CE_LIT(s) s
  static void*  ce_dlopen(const ch_t* p){ return dlopen(p, RTLD_LAZY | RTLD_LOCAL); }
  static void*  ce_dlsym(void* h, const char* n){ return dlsym(h, n); }
  static int    ce_exists(const ch_t* p){ struct stat st; return stat(p, &st) == 0; }
#endif

/* ---- managed entry-point function-pointer types (must match Ce.Exports' [UnmanagedCallersOnly]) ---- */
typedef int  (CE_CALL *m_init_fn)(const CeHostVtable*, void**);
typedef int  (CE_CALL *m_has_fn)(void*, CeStr, CeStr);
typedef int  (CE_CALL *m_disp_fn)(void*, CeStr, CeStr, const CeValue*, CeValue*);
typedef void (CE_CALL *m_shut_fn)(void*);

static m_init_fn s_init = NULL;
static m_has_fn  s_has  = NULL;
static m_disp_fn s_disp = NULL;
static m_shut_fn s_shut = NULL;
static int s_boot_tried = 0, s_boot_ok = 0;

/* ----------------------------------------------------------------- path helpers (char_t world) */

/* Directory containing THIS shared module, written into `out` (capacity `cap` ch_t units, NUL-term). */
static int ce_self_dir(ch_t* out, size_t cap) {
#ifdef _WIN32
    HMODULE self = NULL;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                            (LPCWSTR)(void*)&ce_handler_abi_version, &self))
        return 0;
    DWORD n = GetModuleFileNameW(self, out, (DWORD)cap);
    if (n == 0 || n >= cap) return 0;
    for (DWORD i = n; i > 0; --i) { if (out[i-1] == L'\\' || out[i-1] == L'/') { out[i-1] = 0; return 1; } }
    return 0;
#else
    Dl_info info;
    if (!dladdr((void*)&ce_handler_abi_version, &info) || !info.dli_fname) return 0;
    size_t n = strlen(info.dli_fname);
    if (n >= cap) return 0;
    memcpy(out, info.dli_fname, n + 1);
    for (size_t i = n; i > 0; --i) { if (out[i-1] == '/') { out[i-1] = 0; return 1; } }
    out[0] = '.'; out[1] = 0; return 1;
#endif
}

/* Join dir + sep + leaf into out. */
static void ce_join(ch_t* out, size_t cap, const ch_t* dir, const ch_t* leaf) {
#ifdef _WIN32
    _snwprintf(out, cap, L"%s%c%s", dir, CE_SEP, leaf);
#else
    snprintf(out, cap, "%s%c%s", dir, CE_SEP, leaf);
#endif
}

/* The platform's hostfxr shared-lib leaf name. */
static const ch_t* ce_hostfxr_leaf(void) {
#ifdef _WIN32
    return L"hostfxr.dll";
#elif defined(__APPLE__)
    return "libhostfxr.dylib";
#else
    return "libhostfxr.so";
#endif
}

/* Locate hostfxr. Order: $CE_HOSTFXR override -> <selfdir>/<leaf> (self-contained publish, the shim
 * lives in the runtime folder) -> <selfdir>/dotnet-runtime/<leaf> (separate-runtime layout) ->
 * (CE_USE_NETHOST) nethost's machine-wide search. */
static int ce_find_hostfxr(ch_t* out, size_t cap, const ch_t* selfdir) {
#ifdef _WIN32
    DWORD g = GetEnvironmentVariableW(L"CE_HOSTFXR", out, (DWORD)cap);
    if (g > 0 && g < cap && ce_exists(out)) return 1;
    ch_t sc[4096]; _snwprintf(sc, 4096, L"%s%c%s", selfdir, CE_SEP, ce_hostfxr_leaf());
    if (ce_exists(sc)) { wcsncpy(out, sc, cap); return 1; }
    ch_t rt[4096]; _snwprintf(rt, 4096, L"%s%cdotnet-runtime%c%s", selfdir, CE_SEP, CE_SEP, ce_hostfxr_leaf());
    if (ce_exists(rt)) { wcsncpy(out, rt, cap); return 1; }
#else
    const char* env = getenv("CE_HOSTFXR");
    if (env && *env && ce_exists(env)) { strncpy(out, env, cap - 1); out[cap-1] = 0; return 1; }
    char sc[4096]; snprintf(sc, sizeof(sc), "%s%c%s", selfdir, CE_SEP, ce_hostfxr_leaf());
    if (ce_exists(sc)) { strncpy(out, sc, cap - 1); out[cap-1] = 0; return 1; }
    char rt[4096]; snprintf(rt, sizeof(rt), "%s%cdotnet-runtime%c%s", selfdir, CE_SEP, CE_SEP, ce_hostfxr_leaf());
    if (ce_exists(rt)) { strncpy(out, rt, cap - 1); out[cap-1] = 0; return 1; }
#endif
#ifdef CE_USE_NETHOST
    {
        size_t sz = cap;
        extern int get_hostfxr_path(ch_t* buffer, size_t* buffer_size, const void* parameters);
        if (get_hostfxr_path(out, &sz, NULL) == 0) return 1;
    }
#endif
    (void)selfdir;
    return 0;
}

/* Pin THIS shared library so it is never unloaded for the process lifetime. Taking the plugin offline
 * makes the host dlclose/FreeLibrary us; but we host an in-process CoreCLR that CANNOT be recreated, so
 * if the DLL unloaded we'd lose the runtime + our cached state and online-again would fail. Pinning
 * keeps the DLL (and its statics) resident, so online-again reuses the live runtime. Uses the OS's
 * purpose-built "pin module" mechanisms (Win32 GET_MODULE_HANDLE_EX_FLAG_PIN / glibc RTLD_NODELETE). */
static void ce_pin_self(void) {
#ifdef _WIN32
    HMODULE self = NULL;
    GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
                       (LPCWSTR)(void*)&ce_handler_abi_version, &self);
#else
    Dl_info info;
    if (dladdr((void*)&ce_handler_abi_version, &info) && info.dli_fname)
        dlopen(info.dli_fname, RTLD_NOW | RTLD_GLOBAL | RTLD_NODELETE);
#endif
}

/* ----------------------------------------------------------------- CoreCLR bootstrap (once) */

static int ce_bootstrap(void) {
    if (s_boot_tried) return s_boot_ok;
    s_boot_tried = 1;
    ce_pin_self();   /* keep us mapped across the plugin going offline/online */

    ch_t selfdir[4096];
    if (!ce_self_dir(selfdir, 4096)) { fprintf(stderr, "[ce-csharp] cannot locate own module dir\n"); return 0; }

    ch_t fxr[4096];
    if (!ce_find_hostfxr(fxr, 4096, selfdir)) { fprintf(stderr, "[ce-csharp] hostfxr not found\n"); return 0; }

    void* hfxr = ce_dlopen(fxr);
    if (!hfxr) { fprintf(stderr, "[ce-csharp] cannot load hostfxr\n"); return 0; }

    /* command-line init (NOT initialize_for_runtime_config): the latter refuses self-contained
     * components, which is exactly what we ship. command_line takes the managed assembly as argv[0],
     * initializes the runtime (without running its Main), and still yields the load-assembly delegate. */
    hostfxr_initialize_for_dotnet_command_line_fn init_cli =
        (hostfxr_initialize_for_dotnet_command_line_fn)ce_dlsym(hfxr, "hostfxr_initialize_for_dotnet_command_line");
    hostfxr_get_runtime_delegate_fn get_delegate =
        (hostfxr_get_runtime_delegate_fn)ce_dlsym(hfxr, "hostfxr_get_runtime_delegate");
    hostfxr_close_fn close_ctx =
        (hostfxr_close_fn)ce_dlsym(hfxr, "hostfxr_close");
    if (!init_cli || !get_delegate || !close_ctx) { fprintf(stderr, "[ce-csharp] hostfxr symbols missing\n"); return 0; }

    ch_t asm_path[4096];
    ce_join(asm_path, 4096, selfdir, CE_LIT("ce_managed.dll"));

    const ch_t* cli_args[1] = { asm_path };
    hostfxr_handle ctx = NULL;
    int rc = init_cli(1, cli_args, NULL, &ctx);
    /* 0 = Success, 1 = Success_HostAlreadyInitialized, 2 = Success_DifferentRuntimeProperties */
    if ((rc != 0 && rc != 1 && rc != 2) || ctx == NULL) {
        fprintf(stderr, "[ce-csharp] hostfxr_initialize_for_dotnet_command_line rc=0x%x\n", (unsigned)rc);
        if (ctx) close_ctx(ctx);
        return 0;
    }

    load_assembly_and_get_function_pointer_fn lag = NULL;
    rc = get_delegate(ctx, hdt_load_assembly_and_get_function_pointer, (void**)&lag);
    close_ctx(ctx);
    if (rc != 0 || !lag) { fprintf(stderr, "[ce-csharp] get_runtime_delegate rc=0x%x\n", (unsigned)rc); return 0; }

    /* Resolve the four managed [UnmanagedCallersOnly] entry points on Ce.Exports. */
    const ch_t* type = CE_LIT("Ce.Exports, ce_managed");
    int ok = 1;
    ok &= (lag(asm_path, type, CE_LIT("Init"),     UNMANAGEDCALLERSONLY_METHOD, NULL, (void**)&s_init) == 0 && s_init);
    ok &= (lag(asm_path, type, CE_LIT("Has"),      UNMANAGEDCALLERSONLY_METHOD, NULL, (void**)&s_has)  == 0 && s_has);
    ok &= (lag(asm_path, type, CE_LIT("Dispatch"), UNMANAGEDCALLERSONLY_METHOD, NULL, (void**)&s_disp) == 0 && s_disp);
    ok &= (lag(asm_path, type, CE_LIT("Shutdown"), UNMANAGEDCALLERSONLY_METHOD, NULL, (void**)&s_shut) == 0 && s_shut);
    if (!ok) { fprintf(stderr, "[ce-csharp] failed to resolve managed entry points\n"); return 0; }

    s_boot_ok = 1;
    return 1;
}

/* ----------------------------------------------------------------- exported flat ABI */

CE_EXPORT uint32_t CE_CALL ce_handler_abi_version(void) {
    return CE_ABI_VERSION; /* a compile-time constant — answerable before the CLR is up */
}

CE_EXPORT int CE_CALL ce_handler_init(const CeHostVtable* host, void** out_state) {
    if (!ce_bootstrap()) { ce_log("init: bootstrap FAILED"); return -1; }
    int rc = s_init(host, out_state);
    ce_log("init host=%p -> rc=%d state=%p", (void*)host, rc, out_state ? *out_state : NULL);
    return rc;
}

CE_EXPORT int CE_CALL ce_handler_has(void* state, CeStr script_id, CeStr event_id) {
    if (!s_boot_ok) { ce_log("has: not booted"); return 0; }
    int r = s_has(state, script_id, event_id);
    ce_log("has '%.*s'/'%.*s' state=%p -> %d", (int)script_id.len, script_id.ptr ? script_id.ptr : "",
           (int)event_id.len, event_id.ptr ? event_id.ptr : "", state, r);
    return r;
}

CE_EXPORT int CE_CALL ce_handler_dispatch(void* state, CeStr script_id, CeStr event_id,
                                          const CeValue* payload, CeValue* out_result) {
    if (!s_boot_ok) { ce_log("dispatch: not booted"); return -1; }
    int rc = s_disp(state, script_id, event_id, payload, out_result);
    ce_log("dispatch '%.*s'/'%.*s' state=%p -> rc=%d", (int)script_id.len, script_id.ptr ? script_id.ptr : "",
           (int)event_id.len, event_id.ptr ? event_id.ptr : "", state, rc);
    return rc;
}

CE_EXPORT void CE_CALL ce_handler_shutdown(void* state) {
    ce_log("shutdown state=%p", state);
    if (s_boot_ok && s_shut) s_shut(state);
}
