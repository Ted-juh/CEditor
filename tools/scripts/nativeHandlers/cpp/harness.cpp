// harness.cpp — a JUCE-free host harness that exercises a compiled C++ handler module through the
// flat ABI, mirroring what NativeHandlerEngine does. Used by verify.mjs to prove the C++ path
// (generated glue + NativeHandlerAbi.h + ce_runtime.h) loads, dispatches per-script, and calls back
// into the host. Builds against a module produced by genCpp.mjs from a fixed set of sample scripts.
#include "NativeHandlerAbi.h"
#include "ce_runtime.h"
#include <dlfcn.h>
#include <cstdio>
#include <cstring>
#include <string>
#include <map>
#include <vector>

static std::map<std::string,double> g_set;
static int g_cc = -1;
static std::string g_log;

static int  CE_CALL h_set(void*, const CeStr* k, const CeValue* v, const CeValue*) {
  std::string key(k->ptr,(size_t)k->len);
  double d = v->tag==CE_DOUBLE? v->u.d : v->tag==CE_INT64? (double)v->u.i : 0;
  g_set[key]=d; return 0;
}
static int  CE_CALL h_get(void*, const CeStr*, const CeStr*, CeValue* out){ if(out){out->tag=CE_NULL;} return 0; }
static void CE_CALL h_cc(void*, int32_t, int32_t cc, const CeValue*){ g_cc=cc; }
static void CE_CALL h_nrpn(void*, int32_t,int32_t,int32_t,const CeValue*){}
static void CE_CALL h_sysex(void*, const CeBytes*){}
static void CE_CALL h_log(void*, int32_t, const CeStr* m){ g_log.assign(m->ptr,(size_t)m->len); }
static void CE_CALL h_emit(void*, const CeStr*, const CeValue*){}
static void CE_CALL h_freev(void*, CeValue*){}
static void* CE_CALL h_alloc(void*, size_t n){ return malloc(n); }
static void  CE_CALL h_dealloc(void*, void* p, size_t){ free(p); }

// A Var holding text hands the host a pointer into its own string, through copies, moves and a vector
// that grows (which moves every element). The copies and moves the compiler wrote kept the source's
// pointer, so these read freed or overwritten memory: the strings came back empty or as another's.
static bool varKeepsItsText(){
  auto text = [](const ce::Var& v){ const CeValue* a = v.abi(); return a->tag==CE_STRING ? std::string(a->u.s.ptr,(size_t)a->u.s.len) : std::string("<not text>"); };
  bool ok = true;
  std::vector<ce::Var> held;
  for (int i = 0; i < 40; ++i) held.push_back(ce::Var(std::string("item ") + std::to_string(i)));
  for (int i = 0; i < 40; ++i) ok = ok && text(held[i]) == "item " + std::to_string(i);
  ce::Var a(std::string("short")); ce::Var b = a; a = ce::Var(std::string("XXXXX"));
  ok = ok && text(b) == "short" && text(a) == "XXXXX";
  ce::Var c(std::string("moved")); ce::Var d = std::move(c);
  ok = ok && text(d) == "moved" && c.abi()->u.s.ptr != d.abi()->u.s.ptr;
  ce::Var e; e = std::move(d); d = ce::Var(std::string("again"));
  ok = ok && text(e) == "moved" && text(d) == "again";
  printf("Var text through copies, moves and a growing vector: %s\n", ok ? "ok" : "WRONG");
  return ok;
}

int main(){
  void* lib = dlopen("./ce_handlers_cpp.so", RTLD_NOW);
  if(!lib){ printf("dlopen failed: %s\n", dlerror()); return 1; }
  auto ver  = (uint32_t(CE_CALL*)())dlsym(lib,"ce_handler_abi_version");
  auto init = (int(CE_CALL*)(const CeHostVtable*,void**))dlsym(lib,"ce_handler_init");
  auto disp = (int(CE_CALL*)(void*,CeStr,CeStr,const CeValue*,CeValue*))dlsym(lib,"ce_handler_dispatch");
  auto has  = (int(CE_CALL*)(void*,CeStr,CeStr))dlsym(lib,"ce_handler_has");
  if(ver()!=CE_ABI_VERSION){ printf("ABI mismatch\n"); return 1; }

  CeHostVtable vt{}; vt.abi_version=CE_ABI_VERSION; vt.struct_size=sizeof(vt);
  vt.set=h_set; vt.get=h_get; vt.send_cc=h_cc; vt.send_nrpn=h_nrpn; vt.send_sysex=h_sysex;
  vt.log=h_log; vt.emit=h_emit; vt.free_value=h_freev; vt.alloc=h_alloc; vt.dealloc=h_dealloc;
  void* st=nullptr; if(init(&vt,&st)!=0){ printf("init failed\n"); return 1; }

  auto S=[](const char* s){ return CeStr{ s,(int64_t)strlen(s) }; };
  // knob1.onValueChanged with scalar payload value=10  -> expects set("out", 21) + log("ran")
  CeValue payload{}; payload.tag=CE_DOUBLE; payload.u.d=10;
  printf("has(knob1,onValueChanged)=%d\n", has(st,S("knob1"),S("onValueChanged")));
  disp(st,S("knob1"),S("onValueChanged"),&payload,nullptr);
  printf("out=%.1f (expect 21.0)  log='%s' (expect 'ran')\n", g_set["out"], g_log.c_str());
  // knob2 -> set("r", 20)
  disp(st,S("knob2"),S("onValueChanged"),&payload,nullptr);
  printf("r=%.1f (expect 20.0)\n", g_set["r"]);
  // p1.onPanelReady firstTime=true -> sendCC(1,7,100)
  CeValue ft{}; ft.tag=CE_BOOL; ft.u.b=1;
  CeStr keys[1]={S("firstTime")}; CeValue vals[1]={ft};
  CeValue ready{}; ready.tag=CE_MAP; ready.u.map.len=1; ready.u.map.keys=keys; ready.u.map.vals=vals;
  disp(st,S("p1"),S("onPanelReady"),&ready,nullptr);
  printf("cc=%d (expect 7)\n", g_cc);

  bool ok = g_set["out"]==21 && g_log=="ran" && g_set["r"]==20 && g_cc==7 && varKeepsItsText();
  printf("%s\n", ok? "ALL PASS ✓" : "FAIL ✗");
  return ok?0:1;
}
