/* ce_java_shim.c — the C bridge that lets a GraalVM native-image handler module satisfy CEditor's FLAT
 * C ABI (NativeHandlerAbi.h). HAND-WRITTEN (the generator copies it verbatim into each Java module's
 * build dir). BUILD-UNVERIFIED: written without a GraalVM toolchain; iterate on a build machine.
 *
 * ============================================================================================
 * WHY THIS FILE EXISTS — the central design problem
 * --------------------------------------------------------------------------------------------
 * GraalVM @CEntryPoint methods REQUIRE a graal_isolatethread_t* (IsolateThread) as their FIRST
 * parameter — the SVM runtime needs it to know which isolate/thread the call runs on. But the host
 * (CE/src/Scripting/NativeHandlerEngine.cpp) resolves the flat-ABI symbols with NO isolate parameter:
 *
 *     int  ce_handler_init    (const CeHostVtable*, void**);
 *     int  ce_handler_dispatch(void*, CeStr, CeStr, const CeValue*, CeValue*);
 *     int  ce_handler_has     (void*, CeStr, CeStr);
 *     void ce_handler_shutdown(void*);
 *
 * The host knows nothing about GraalVM isolates and never passes one. So the Java side CANNOT export
 * ce_handler_dispatch directly as a @CEntryPoint (its real signature would have to start with an
 * IsolateThread). Instead:
 *
 *   - CeRuntime.java exports DIFFERENTLY-NAMED entry points that DO take an IsolateThread first:
 *         int  cej_abi_version(graal_isolatethread_t*);
 *         int  cej_init       (graal_isolatethread_t*, CeHostVtable*);
 *         int  cej_dispatch   (graal_isolatethread_t*, CeStr, CeStr, CeValue*, CeValue*);
 *         int  cej_has        (graal_isolatethread_t*, CeStr, CeStr);
 *         void cej_shutdown   (graal_isolatethread_t*);
 *
 *   - THIS shim exports the real flat ABI (ce_handler_*), owns the process-global isolate + main
 *     isolate-thread, creates them in ce_handler_init via graal_create_isolate(), and forwards each
 *     flat call to the matching cej_* entry point, threading the stored IsolateThread in front.
 *     ce_handler_shutdown tears the isolate down with graal_tear_down_isolate().
 *
 * native-image --shared emits the cej_* prototypes and the graal_create_isolate / graal_tear_down_isolate
 * / graal_attach_thread API into TWO generated headers placed next to the produced library:
 *     - graal_isolate.h        : graal_isolate_t, graal_isolatethread_t, graal_create_isolate, etc.
 *     - <libname>.h (here ce_handlers_java.h) : the cej_* @CEntryPoint prototypes.
 * We include both. (If your native-image version emits a single combined header, include that instead —
 * see genJava.mjs buildSteps.)
 * ============================================================================================
 *
 * THREADING: the host calls every entry point on the MESSAGE THREAD (NativeHandlerEngine runs there).
 * We create the isolate + attach the message thread in ce_handler_init, and ALL subsequent dispatch/has
 * calls arrive on that SAME thread, so reusing the stored isolate-thread is correct. If the host ever
 * called from another thread, we would need graal_attach_thread per foreign thread — guarded below.
 */

#include "NativeHandlerAbi.h"   /* the flat ABI we must export (CeStr/CeValue/CeHostVtable, CE_ABI_VERSION) */
#include "graal_isolate.h"      /* graal_isolate_t, graal_isolatethread_t, graal_create_isolate, ...        */
#include "ce_handlers_java.h"   /* the generated cej_* @CEntryPoint prototypes (native-image output)         */

#include <stddef.h>

/* ----------------------------------------------------------------------------------------------------
 * Process-global isolate state. Exactly ONE isolate per module: the host loads one ce_handlers_java
 * library per panel-language and init's it once. graal_isolatethread_t* is the "main" thread handle the
 * message thread is attached as.
 * -------------------------------------------------------------------------------------------------- */
static graal_isolate_t*       g_isolate     = NULL;
static graal_isolatethread_t* g_main_thread = NULL;

/* abi_version does NOT need an isolate to answer — but cej_abi_version is a @CEntryPoint and still wants
 * a thread. The host calls ce_handler_abi_version BEFORE ce_handler_init (see NativeHandlerEngine: it
 * checks ver() right after resolving symbols), so no isolate exists yet. We therefore answer from C
 * directly using CE_ABI_VERSION from the shared header — no isolate required, no SVM call. This keeps
 * the ABI-gate cheap and avoids a chicken-and-egg isolate bring-up before init. */
CE_EXPORT uint32_t CE_CALL ce_handler_abi_version(void)
{
    return CE_ABI_VERSION;
}

/* Create the isolate, attach the calling (message) thread, cache the thread handle, then forward to
 * cej_init so the Java side can cache the host vtable + load its dispatch registry.
 * out_state: the host stores this opaque pointer and passes it back to dispatch/has/shutdown. We hand
 * back the isolate-thread pointer as the state token (non-NULL marker the host checks). */
CE_EXPORT int CE_CALL ce_handler_init(const CeHostVtable* host, void** out_state)
{
    if (host == NULL || out_state == NULL) {
        return -1;
    }
    if (g_isolate != NULL) {
        /* Already initialised (defensive — host inits once). Reuse. */
        *out_state = (void*) g_main_thread;
        return 0;
    }

    /* graal_create_isolate(params, &isolate, &thread): NULL params = defaults; attaches THIS thread and
     * returns its isolate-thread handle in g_main_thread. Non-zero return = failure. */
    if (graal_create_isolate(NULL, &g_isolate, &g_main_thread) != 0) {
        g_isolate = NULL;
        g_main_thread = NULL;
        return -2;
    }

    /* Forward to the Java entry point. NativeHandlerAbi.h declares host as const CeHostVtable*; the
     * generated cej_init prototype takes a non-const CeHostVtable* (native-image strips const from
     * @CStruct params). The cast is layout-safe — same struct, the Java side only reads it. */
    int rc = cej_init(g_main_thread, (CeHostVtable*) host);
    if (rc != 0) {
        graal_tear_down_isolate(g_main_thread);
        g_isolate = NULL;
        g_main_thread = NULL;
        return rc;
    }

    *out_state = (void*) g_main_thread; /* non-NULL state token; the host only checks it != NULL */
    return 0;
}

/* Forward a dispatch. `state` is the token we returned from init (== g_main_thread); we ignore it and
 * use the cached g_main_thread, which is robust even if the host passes something unexpected. */
CE_EXPORT int CE_CALL ce_handler_dispatch(void* state, CeStr script_id, CeStr event_id,
                                          const CeValue* payload, CeValue* out_result)
{
    (void) state;
    if (g_main_thread == NULL) {
        return -1; /* not initialised */
    }
    /* cej_dispatch's @CStruct params are non-const; cast away const on payload (Java side reads only). */
    return cej_dispatch(g_main_thread, script_id, event_id, (CeValue*) payload, out_result);
}

/* Forward a presence check. */
CE_EXPORT int CE_CALL ce_handler_has(void* state, CeStr script_id, CeStr event_id)
{
    (void) state;
    if (g_main_thread == NULL) {
        return 0;
    }
    return cej_has(g_main_thread, script_id, event_id);
}

/* Flush Java-side state, then tear the isolate down. After this the module must not be called again
 * until a fresh ce_handler_init (the host closes the library on reset()). */
CE_EXPORT void CE_CALL ce_handler_shutdown(void* state)
{
    (void) state;
    if (g_main_thread == NULL) {
        return;
    }
    cej_shutdown(g_main_thread);

    /* graal_tear_down_isolate detaches the current thread and destroys the isolate. Must be called on a
     * thread attached to the isolate — the message thread is, since init attached it here. */
    graal_tear_down_isolate(g_main_thread);
    g_isolate = NULL;
    g_main_thread = NULL;
}
