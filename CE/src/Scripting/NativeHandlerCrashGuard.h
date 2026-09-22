#pragma once

#include "NativeHandlerAbi.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef int (CE_CALL *CeNativeDispatchFn) (void*, CeStr, CeStr, const CeValue*, CeValue*);

/** Calls an exported native handler behind the platform fault boundary. `fault_code` is zero for a
    normal return and carries the Windows exception code when SEH caught a hardware fault. */
int CE_CALL ce_dispatch_guarded (CeNativeDispatchFn dispatch, void* state,
                                 CeStr script_id, CeStr event_id,
                                 const CeValue* payload, CeValue* out_result,
                                 uint32_t* fault_code);

#ifdef __cplusplus
} /* extern "C" */
#endif
