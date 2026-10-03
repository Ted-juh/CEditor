/* harness.c — JUCE-free host harness for a compiled native handler module (C++, C# NativeAOT, or Java
 * GraalVM native-image). Loads the module (argv[1], default ./ce_handlers_java.so) through the flat
 * ABI, provides a CeHostVtable, inits (which brings up the language runtime: GC for C#, isolate for
 * Java), checks hasHandler, and dispatches knob1.onValueChanged with a scalar payload of 10 —
 * asserting the handler ran and called back into the host (set("out", 21) + log("ran")). Used by
 * verify-{java,csharp}.mjs when the toolchain is available. */
#include "NativeHandlerAbi.h"
#include <dlfcn.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static char g_out_key[64]; static double g_out_val; static char g_log[64];
/* knob2 — the calls that carry a value through the slots appended after ABI 1 */
static char g_logv_msg[64]; static double g_logv_val = -1; static int g_logv_tag = -1;
static int g_sx_list[16]; static int g_sx_list_n = -1; static char g_sx_hex[64]; static int g_sx_calls;
static int g_nrpn[3] = { -1, -1, -1 }; static double g_nrpn_val = -1;
static int g_cc_num = -1; static int g_cc_tag = -1; static int g_cc_b = -1;

static int  CE_CALL h_set(void* c, const CeStr* k, const CeValue* v, const CeValue* o) {
    (void)c;(void)o; size_t n = (size_t)k->len < sizeof(g_out_key)-1 ? (size_t)k->len : sizeof(g_out_key)-1;
    memcpy(g_out_key, k->ptr, n); g_out_key[n]=0;
    g_out_val = v->tag==CE_DOUBLE ? v->u.d : v->tag==CE_INT64 ? (double)v->u.i : 0; return 0;
}
static int  CE_CALL h_get(void* c, const CeStr* k, const CeStr* f, CeValue* out){ (void)c;(void)k;(void)f; if(out) out->tag=CE_NULL; return 0; }
static void CE_CALL h_cc(void* c,int32_t a,int32_t b,const CeValue* v){ (void)c;(void)a; g_cc_num=b; g_cc_tag = v ? v->tag : -1; g_cc_b = (v && v->tag==CE_BOOL) ? v->u.b : -1; }
static double num(const CeValue* v){ return !v ? -1 : v->tag==CE_DOUBLE ? v->u.d : v->tag==CE_INT64 ? (double)v->u.i : -1; }
static void CE_CALL h_nrpn(void* c,int32_t a,int32_t b,int32_t d,const CeValue* v){ (void)c; g_nrpn[0]=a; g_nrpn[1]=b; g_nrpn[2]=d; g_nrpn_val=num(v); }
static void CE_CALL h_logv(void* c,int32_t lvl,const CeStr* m,const CeValue* v){
    (void)c;(void)lvl; size_t n=(size_t)m->len<sizeof(g_logv_msg)-1?(size_t)m->len:sizeof(g_logv_msg)-1;
    memcpy(g_logv_msg,m->ptr,n); g_logv_msg[n]=0; g_logv_tag = v ? v->tag : -1; g_logv_val = num(v);
}
static void CE_CALL h_sxv(void* c,const CeValue* v){
    (void)c; g_sx_calls++;
    if (v && v->tag==CE_LIST) { g_sx_list_n = (int)v->u.list.len; for (int i=0;i<g_sx_list_n && i<16;i++) g_sx_list[i]=(int)num(&v->u.list.items[i]); }
    else if (v && v->tag==CE_STRING) { size_t n=(size_t)v->u.s.len<sizeof(g_sx_hex)-1?(size_t)v->u.s.len:sizeof(g_sx_hex)-1; memcpy(g_sx_hex,v->u.s.ptr,n); g_sx_hex[n]=0; }
}
static void CE_CALL h_sx(void* c,const CeBytes* b){ (void)c;(void)b; }
static void CE_CALL h_log(void* c,int32_t lvl,const CeStr* m){ (void)c;(void)lvl; size_t n=(size_t)m->len<sizeof(g_log)-1?(size_t)m->len:sizeof(g_log)-1; memcpy(g_log,m->ptr,n); g_log[n]=0; }
static void CE_CALL h_emit(void* c,const CeStr* nm,const CeValue* d){ (void)c;(void)nm;(void)d; }
static void CE_CALL h_fv(void* c,CeValue* v){ (void)c;(void)v; }
static void* CE_CALL h_al(void* c,size_t n){ (void)c; return malloc(n); }
static void CE_CALL h_de(void* c,void* p,size_t n){ (void)c;(void)n; free(p); }

int main(int argc, char** argv) {
    void* lib = dlopen(argc>1?argv[1]:"./ce_handlers_java.so", RTLD_NOW);
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
    vt.log_value=h_logv; vt.send_sysex_value=h_sxv;

    void* st=NULL; int r=init(&vt,&st);
    CeStr sid = { "knob1", 5 }, ev = { "onValueChanged", 14 };
    int hh = has(st, sid, ev);
    CeValue p; memset(&p,0,sizeof(p)); p.tag=CE_DOUBLE; p.u.d=10;
    disp(st, sid, ev, &p, NULL);
    printf("abi=%u init=%d has=%d out(%s)=%.1f log='%s'\n", ver(), r, hh, g_out_key, g_out_val, g_log);
    int ok = ver()==1 && r==0 && hh==1 && g_out_val==21.0 && strcmp(g_log,"ran")==0;

    /* knob2, when the module has it: log("v", 1.5), sendSysex({F0,7F,F7}), sendSysex("F0 7E F7"),
     * sendNRPN(1, 2, 3, 400), sendCC(1, 64, true). Each value must reach the host as the handler
     * passed it — the bool as a bool. */
    CeStr sid2 = { "knob2", 5 };
    if (has(st, sid2, ev)) {
        disp(st, sid2, ev, &p, NULL);
        int core = strcmp(g_logv_msg,"v")==0 && g_logv_tag==CE_DOUBLE && g_logv_val==1.5
                && g_sx_calls==2 && g_sx_list_n==3 && g_sx_list[0]==0xF0 && g_sx_list[1]==0x7F && g_sx_list[2]==0xF7
                && strcmp(g_sx_hex,"F0 7E F7")==0
                && g_nrpn[0]==1 && g_nrpn[1]==2 && g_nrpn[2]==3 && g_nrpn_val==400
                && g_cc_num==64 && g_cc_tag==CE_BOOL && g_cc_b==1;
        printf("knob2: log('%s', %g) sysex[%d]=%02X..%02X then '%s' nrpn(%d,%d,%d,%g) cc64=%s -> %s\n", g_logv_msg, g_logv_val,
               g_sx_list_n, g_sx_list_n > 0 ? g_sx_list[0] : 0, g_sx_list_n > 0 ? g_sx_list[g_sx_list_n-1] : 0, g_sx_hex,
               g_nrpn[0], g_nrpn[1], g_nrpn[2], g_nrpn_val, g_cc_tag==CE_BOOL ? (g_cc_b ? "true" : "false") : "not a bool",
               core ? "ok" : "WRONG");
        ok = ok && core;
    }
    printf("%s\n", ok ? "NATIVE HANDLER E2E PASS" : "FAIL");
    return ok ? 0 : 1;
}
