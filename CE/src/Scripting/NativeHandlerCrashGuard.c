#include "NativeHandlerCrashGuard.h"

#if defined(_WIN32) && defined(_MSC_VER)
 #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
 #endif
 #include <windows.h>
#endif

int CE_CALL ce_dispatch_guarded (CeNativeDispatchFn dispatch, void* state,
                                 CeStr script_id, CeStr event_id,
                                 const CeValue* payload, CeValue* out_result,
                                 uint32_t* fault_code)
{
    if (fault_code != NULL)
        *fault_code = 0;
    if (dispatch == NULL)
        return -1;

#if defined(_WIN32) && defined(_MSC_VER)
    __try
    {
        return dispatch (state, script_id, event_id, payload, out_result);
    }
    __except (EXCEPTION_EXECUTE_HANDLER)
    {
        if (fault_code != NULL)
            *fault_code = (uint32_t) GetExceptionCode();
        return -1;
    }
#else
    return dispatch (state, script_id, event_id, payload, out_result);
#endif
}
