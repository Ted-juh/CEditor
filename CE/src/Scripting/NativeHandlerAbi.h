/* NativeHandlerAbi.h — the flat C ABI between the CEditor host and a COMPILE-AT-EXPORT native
 * handler module.
 *
 * A panel's C++ / C# / Java event handlers can be compiled ahead-of-time, at EXPORT time on the dev
 * machine, into ONE small native shared library per panel per language:
 *   • C++  -> compiled directly (clang/MSVC)            -> .dll/.dylib/.so   (~tens of KB)
 *   • C#   -> .NET NativeAOT (NativeLib=Shared)          -> native lib       (~1.5-4 MB, GC baked in)
 *   • Java -> GraalVM native-image (--shared, isolates)  -> native lib       (~8-15 MB, SVM baked in)
 * NO language runtime is embedded in the shipped plugin — these are plain native modules the host
 * loads with juce::DynamicLibrary (LoadLibrary/dlopen) and calls on the MESSAGE THREAD, exactly where
 * Lua/JS/Python already run. See native-handlers-design.md for the full pipeline + honest cost/risk.
 *
 * This header is PURE C and is compiled VERBATIM into both the host and every handler module, so the
 * struct layout is identical on both sides. Rules that keep it ABI-stable:
 *   - fixed-width types only (never `long`); explicit padding; `enum : int32_t`; no C `bool` in structs
 *   - the host vtable grows APPEND-ONLY (check struct_size before reading a newly-added field)
 *   - strings are UTF-8 (ptr,len), NOT necessarily NUL-terminated
 *   - whoever allocates frees: values the host fills are freed via host->free_value; values the
 *     handler returns to the host are allocated via host->alloc so the host frees with host->dealloc
 *   - no exception may cross an extern "C" frame — return status codes, never throw
 *
 * Status: DESIGN/CONTRACT. The host loader (NativeHandlerEngine) and the per-language glue generators
 * + export pipeline are specified in native-handlers-design.md and NOT yet built. This header is the
 * stable interface they will share.
 */
#ifndef CE_NATIVE_HANDLER_ABI_H
#define CE_NATIVE_HANDLER_ABI_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Bump on any incompatible change. The host passes this in the vtable; the handler reports the
 * version it was built against via ce_handler_abi_version() and the host refuses a mismatch. */
#define CE_ABI_VERSION 1u

/* Calling convention — pinned so 32-bit (cdecl vs stdcall) can't mismatch. 64-bit has one ABI. */
#if defined(_WIN32) && !defined(_WIN64)
  #define CE_CALL __cdecl
#else
  #define CE_CALL
#endif

/* Export macro — only the entry points below escape a handler module (everything else hidden). */
#if defined(_WIN32)
  #define CE_EXPORT __declspec(dllexport)
#else
  #define CE_EXPORT __attribute__((visibility("default")))
#endif

/* -------------------------------------------------------------- variant value (marshalling) */

typedef enum CeTag {
    CE_NULL = 0, CE_DOUBLE, CE_INT64, CE_BOOL, CE_STRING, CE_BYTES, CE_LIST, CE_MAP
} CeTag;
/* force the enum to a fixed width for stable layout */
typedef int32_t CeTagInt;

typedef struct CeValue CeValue;

typedef struct { const char*    ptr; int64_t len; } CeStr;    /* UTF-8, not necessarily NUL-terminated */
typedef struct { const uint8_t* ptr; int64_t len; } CeBytes;  /* raw bytes (sysex/dumps)               */
typedef struct { CeValue*       items; int64_t len; } CeList;
typedef struct { CeStr* keys; CeValue* vals; int64_t len; } CeMap;

struct CeValue {
    CeTagInt tag;     /* one of CeTag */
    int32_t  _pad;    /* explicit pad -> the union stays 8-byte aligned, layout deterministic */
    union {
        double  d;
        int64_t i;
        int32_t b;    /* bool as int32 to avoid C _Bool ABI ambiguity */
        CeStr   s;
        CeBytes by;
        CeList  list;
        CeMap   map;
    } u;
};

/* ---------------------------------------------------------------------- host vtable (callbacks) */
/* The host passes ONE of these into ce_handler_init. Every host service the handler may call goes
 * through these function pointers, so a handler module has NO link-time dependency on the host. */
typedef struct CeHostVtable {
    uint32_t abi_version;   /* host fills CE_ABI_VERSION; handler checks first */
    uint32_t struct_size;   /* sizeof(CeHostVtable) — append-only growth, handler checks before new fields */
    void*    host_ctx;      /* opaque; passed back to every call below */

    /* Panel API surface — mirrors ScriptHostApi (set/get/sendCC/log/...). UTF-8 keys. All struct args
     * are passed BY POINTER (never by value): a GraalVM @CStruct is a pointer type, so a by-value struct
     * arg can't be expressed on the Java callback side. C/C++ callers simply take the address. */
    int  (CE_CALL *set)     (void* host_ctx, const CeStr* key, const CeValue* v, const CeValue* opts /*nullable*/);
    int  (CE_CALL *get)     (void* host_ctx, const CeStr* key, const CeStr* form, CeValue* out /*host-owned, free_value*/);
    void (CE_CALL *send_cc) (void* host_ctx, int32_t channel, int32_t cc, const CeValue* v);
    void (CE_CALL *send_nrpn)(void* host_ctx, int32_t channel, int32_t msb, int32_t lsb, const CeValue* v);
    void (CE_CALL *send_sysex)(void* host_ctx, const CeBytes* bytes);
    void (CE_CALL *log)     (void* host_ctx, int32_t level, const CeStr* msg);
    void (CE_CALL *emit)    (void* host_ctx, const CeStr* name, const CeValue* data /*nullable*/);

    /* Memory discipline. Free a value the HOST produced (e.g. via get). */
    void (CE_CALL *free_value)(void* host_ctx, CeValue* v);
    /* Allocate/free memory the handler hands BACK to the host, so the host frees with a matching
     * allocator (never free across mismatched CRTs). */
    void* (CE_CALL *alloc)  (void* host_ctx, size_t n);
    void  (CE_CALL *dealloc)(void* host_ctx, void* p, size_t n);

    /* --- appended: the rest of the panel API --------------------------------------------------
     * Originally a C++/C#/Java handler could only set/get, send raw CC/NRPN/sysex, log and emit —
     * a strictly weaker dialect than Lua/JS, with no way to discover that except at runtime.
     * These close the gap. CE_ABI_VERSION deliberately does NOT change: the host refuses a
     * version mismatch outright, so bumping it would disown every module already built, whereas
     * an append is compatible by construction. A module compiled against the shorter struct never
     * reads past its own end; one compiled against this header checks CE_HAS_FIELD first. */
    void (CE_CALL *request_dump)(void* host_ctx, const CeStr* kind);
    void (CE_CALL *apply_dump)  (void* host_ctx, const CeBytes* bytes);
    void (CE_CALL *send_dump)   (void* host_ctx, const CeStr* kind);
    int  (CE_CALL *build_dump)  (void* host_ctx, const CeStr* kind, CeValue* out /*host-owned, free_value*/);
    /* run("owner.action", args) — host-dispatched, so a native handler can call into a Lua/JS
     * script and back. out_result is optional. */
    int  (CE_CALL *run_action)  (void* host_ctx, const CeStr* ref, const CeValue* args /*nullable*/,
                                 CeValue* out /*nullable, host-owned, free_value*/);
    void (CE_CALL *start_timer) (void* host_ctx, const CeStr* id, int32_t interval_ms);
    void (CE_CALL *stop_timer)  (void* host_ctx, const CeStr* id);
    /* noTransmit/transmit blocks. Call begin_transmit(0|1) then end_transmit around the block —
     * the host keeps the stack, so these nest. */
    void (CE_CALL *begin_transmit)(void* host_ctx, int32_t transmit);
    void (CE_CALL *end_transmit)  (void* host_ctx);
    /* Raw MIDI bytes, exactly as given — no F0/F7 wrapping, no channel maths. Notes, program
     * changes, pitch bend, aftertouch and clock are all arithmetic over this one call in the
     * scripted engines; a native handler builds them the same way. */
    void (CE_CALL *send_midi)     (void* host_ctx, const CeBytes* bytes);
    /* Settings that outlive the session. Where they land is the host's business. */
    void (CE_CALL *save_setting)  (void* host_ctx, const CeStr* key, const CeValue* value);
    int  (CE_CALL *load_setting)  (void* host_ctx, const CeStr* key, CeValue* out /*host-owned, free_value*/);
    /* NOTE on module opt-in (design doc §5): a panel declares the modules its scripts may use, and
     * the scripted engines enforce it by swapping the prelude's members for explaining stubs. A
     * native handler has no prelude — it calls these function pointers directly — so there is
     * nothing to swap. That is deliberate, not an oversight: the module gate is an authoring aid
     * for source scripts, while a compiled handler was written against this vtable and the host
     * already checks every call it makes. If the gate ever needs to reach here it becomes an
     * appended `is_module_enabled` query, not a change to any existing slot.
     *
     * New fields append HERE only; bump struct_size; handlers gate on struct_size before reading. */
} CeHostVtable;

/* Does the vtable the host handed us carry the field `member`? Handlers built against a newer ABI
 * than the host use this before calling anything appended after ABI 1. */
#define CE_HAS_FIELD(vt, member) \
    ((vt)->struct_size >= (uint32_t) (offsetof(CeHostVtable, member) + sizeof((vt)->member)))

/* --------------------------------------------------------------------------- handler entry points */
/* A handler module exports exactly these. The host resolves them by name (getFunction/dlsym).
 * One module per panel per language; ce_handler_dispatch is keyed by the handler/event id so all of
 * a panel's handlers live in one module. Status: 0 = ok, non-zero = error (host logs + disables). */

/* Gate FIRST: host refuses to use the module unless this equals its own CE_ABI_VERSION. */
CE_EXPORT uint32_t CE_CALL ce_handler_abi_version(void);

/* Called once, on the message thread, at plugin load. Cache the vtable. *out_state is opaque,
 * handler-owned, passed back to dispatch/shutdown. (Java: also create + attach the GraalVM isolate
 * here; C#: first call triggers NativeAOT runtime/GC bring-up — keep it here so it's deterministic.) */
CE_EXPORT int CE_CALL ce_handler_init(const CeHostVtable* host, void** out_state);

/* Run `script_id`'s handler `event_id` (e.g. "onValueChanged") with `payload`. The script id keys the
 * call so a panel can hold several scripts that each define the same handler name without colliding
 * (the generator compiles each script into its own namespace). Optional `out_result` for handlers that
 * return a value (e.g. onDawSaveState). Must NOT let an exception cross this frame. */
CE_EXPORT int CE_CALL ce_handler_dispatch(void* state, CeStr script_id, CeStr event_id,
                                          const CeValue* payload, CeValue* out_result /*nullable*/);

/* Does `script_id` implement `event_id`? Lets the host skip events with no handler (parity with
 * ScriptEngine::hasHandler). */
CE_EXPORT int CE_CALL ce_handler_has(void* state, CeStr script_id, CeStr event_id);

/* Called at teardown. (Java: tear down the isolate. C#: NativeAOT cannot truly unload — the host
 * keeps the module loaded for process lifetime; this just flushes handler state.) */
CE_EXPORT void CE_CALL ce_handler_shutdown(void* state);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* CE_NATIVE_HANDLER_ABI_H */
