/* harness.c — JUCE-free host harness for a compiled Java (GraalVM native-image) handler module.
 * Loads ce_handlers_java.so through the flat ABI, provides a CeHostVtable, inits (which creates the
 * GraalVM isolate via the C shim), checks hasHandler, and dispatches knob1.onValueChanged with a
 * scalar payload of 10 — asserting the handler ran inside the isolate and called back into the host
 * (set("out", 21) + log("ran")). Used by verify-java.mjs when native-image is available. */
#include "NativeHandlerAbi.h"
#include <dlfcn.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static char g_out_key[64]; static double g_out_val; static char g_log[64];

static int  CE_CALL h_set(void* c, const CeStr* k, const CeValue* v, const CeValue* o) {
    (void)c;(void)o; size_t n = (size_t)k->len < sizeof(g_out_key)-1 ? (size_t)k->len : sizeof(g_out_key)-1;
    memcpy(g_out_key, k->ptr, n); g_out_key[n]=0;
    g_out_val = v->tag==CE_DOUBLE ? v->u.d : v->tag==CE_INT64 ? (double)v->u.i : 0; return 0;
}
static int  CE_CALL h_get(void* c, const CeStr* k, const CeStr* f, CeValue* out){ (void)c;(void)k;(void)f; if(out) out->tag=CE_NULL; return 0; }
static void CE_CALL h_cc(void* c,int32_t a,int32_t b,const CeValue* v){ (void)c;(void)a;(void)b;(void)v; }
static void CE_CALL h_nrpn(void* c,int32_t a,int32_t b,int32_t d,const CeValue* v){ (void)c;(void)a;(void)b;(void)d;(void)v; }
static void CE_CALL h_sx(void* c,const CeBytes* b){ (void)c;(void)b; }
static void CE_CALL h_log(void* c,int32_t lvl,const CeStr* m){ (void)c;(void)lvl; size_t n=(size_t)m->len<sizeof(g_log)-1?(size_t)m->len:sizeof(g_log)-1; memcpy(g_log,m->ptr,n); g_log[n]=0; }
static void CE_CALL h_emit(void* c,const CeStr* nm,const CeValue* d){ (void)c;(void)nm;(void)d; }
static void CE_CALL h_fv(void* c,CeValue* v){ (void)c;(void)v; }
static void* CE_CALL h_al(void* c,size_t n){ (void)c; return malloc(n); }
static void CE_CALL h_de(void* c,void* p,size_t n){ (void)c;(void)n; free(p); }

int main(void) {
    void* lib = dlopen("./ce_handlers_java.so", RTLD_NOW);
    if (!lib) { printf("dlopen: %s\n", dlerror()); return 1; }
    uint32_t (CE_CALL *ver)(void)                                      = (uint32_t(CE_CALL*)(void))dlsym(lib,"ce_handler_abi_version");
    int (CE_CALL *init)(const CeHostVtable*, void**)                   = (int(CE_CALL*)(const CeHostVtable*,void**))dlsym(lib,"ce_handler_init");
    int (CE_CALL *disp)(void*, CeStr, CeStr, const CeValue*, CeValue*) = (int(CE_CALL*)(void*,CeStr,CeStr,const CeValue*,CeValue*))dlsym(lib,"ce_handler_dispatch");
    int (CE_CALL *has)(void*, CeStr, CeStr)                            = (int(CE_CALL*)(void*,CeStr,CeStr))dlsym(lib,"ce_handler_has");
    if (!ver||!init||!disp||!has) { printf("missing symbols\n"); return 1; }

    CeHostVtable vt; memset(&vt,0,sizeof(vt));
    vt.abi_version=CE_ABI_VERSION; vt.struct_size=sizeof(vt);
    vt.set=h_set; vt.get=h_get; vt.send_cc=h_cc; vt.send_nrpn=h_nrpn; vt.send_sysex=h_sx;
    vt.log=h_log; vt.emit=h_emit; vt.free_value=h_fv; vt.alloc=h_al; vt.dealloc=h_de;

    void* st=NULL; int r=init(&vt,&st);
    CeStr sid = { "knob1", 5 }, ev = { "onValueChanged", 14 };
    int hh = has(st, sid, ev);
    CeValue p; memset(&p,0,sizeof(p)); p.tag=CE_DOUBLE; p.u.d=10;
    disp(st, sid, ev, &p, NULL);
    printf("abi=%u init=%d has=%d out(%s)=%.1f log='%s'\n", ver(), r, hh, g_out_key, g_out_val, g_log);
    int ok = ver()==1 && r==0 && hh==1 && g_out_val==21.0 && strcmp(g_log,"ran")==0;
    printf("%s\n", ok ? "JAVA NATIVE-IMAGE E2E PASS" : "FAIL");
    return ok ? 0 : 1;
}
