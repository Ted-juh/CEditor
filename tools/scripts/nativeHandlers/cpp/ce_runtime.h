// ce_runtime.h — the C++ surface a user's exported handler compiles against. Thin wrapper over the
// flat ABI in NativeHandlerAbi.h: CeContext (set/get/sendCC/log/emit) + CeEvent (value/firstTime/…).
// Compiled into the per-panel C++ handler module alongside the generated glue (see genCpp.mjs).
//
// Parity note: this surface must match what the editor's cppPreview.js interpreter exposes, or a
// handler will behave differently in preview vs the shipped plugin (native-handlers-design.md §6).
#pragma once
#include "NativeHandlerAbi.h"
#include <string>
#include <cstring>

namespace ce {

// Lightweight value: either an owned scalar/string the user builds, or a read-only view over an ABI
// CeValue handed in by the host. (Lists/maps round-trip through the host but the convenience getters
// here cover scalars + strings; richer access via abi(). TODO: ergonomic list/map helpers.)
class Var {
public:
    Var() { v_.tag = CE_NULL; }
    Var(double d)            { v_.tag = CE_DOUBLE; v_.u.d = d; }
    Var(int i)               { v_.tag = CE_INT64;  v_.u.i = i; }
    Var(long long i)         { v_.tag = CE_INT64;  v_.u.i = i; }
    Var(bool b)              { v_.tag = CE_BOOL;   v_.u.b = b ? 1 : 0; }
    Var(const char* s)       { s_ = s; bindStr(); }
    Var(const std::string& s){ s_ = s; bindStr(); }

    static Var view(const CeValue* v) { Var r; r.ext_ = v; return r; }
    const CeValue* abi() const { return ext_ ? ext_ : &v_; }

    double      asDouble() const { auto* v = abi(); if (!v) return 0; if (v->tag==CE_DOUBLE) return v->u.d; if (v->tag==CE_INT64) return (double) v->u.i; if (v->tag==CE_BOOL) return v->u.b; return 0; }
    long long   asInt()    const { return (long long) asDouble(); }
    bool        asBool()   const { auto* v = abi(); return v && (v->tag==CE_BOOL ? v->u.b!=0 : asDouble()!=0); }
    std::string asString() const { auto* v = abi(); return (v && v->tag==CE_STRING) ? std::string(v->u.s.ptr, (size_t) v->u.s.len) : std::string(); }
    operator double() const { return asDouble(); }

private:
    void bindStr() { v_.tag = CE_STRING; v_.u.s = CeStr { s_.data(), (int64_t) s_.size() }; }
    CeValue v_ {};
    const CeValue* ext_ = nullptr;
    std::string s_;
};

class Context {
public:
    explicit Context(const CeHostVtable* h) : h_(h) {}
    void setValue(const char* path, const Var& v) { h_->set(h_->host_ctx, cstr(path), v.abi(), nullptr); }
    void setValue(const char* path, double d)     { setValue(path, Var(d)); }
    Var  getValue(const char* path, const char* form = "value") {
        CeValue out {}; out.tag = CE_NULL;
        h_->get(h_->host_ctx, cstr(path), cstr(form), &out);
        Var r = copyOut(out);
        h_->free_value(h_->host_ctx, &out);
        return r;
    }
    void sendCC(int ch, int cc, const Var& v) { h_->send_cc(h_->host_ctx, ch, cc, v.abi()); }
    void log(const char* msg)                 { h_->log(h_->host_ctx, 0, cstr(msg)); }
    void emit(const char* name, const Var& data) { h_->emit(h_->host_ctx, cstr(name), data.abi()); }

private:
    static CeStr cstr(const char* s) { return CeStr { s, (int64_t) std::strlen(s) }; }
    static Var copyOut(const CeValue& o) {
        if (o.tag==CE_STRING) return Var(std::string(o.u.s.ptr, (size_t) o.u.s.len));
        if (o.tag==CE_DOUBLE) return Var(o.u.d);
        if (o.tag==CE_INT64)  return Var((long long) o.u.i);
        if (o.tag==CE_BOOL)   return Var((bool)(o.u.b != 0));
        return Var();
    }
    const CeHostVtable* h_;
};

// Public fields so handlers read `event.value` / `event.firstTime` (matching the editor skeleton).
class Event {
public:
    double value = 0;
    bool   firstTime = false;
    explicit Event(const CeValue* p) : p_(p) { value = field("value").asDouble(); firstTime = field("firstTime").asBool(); }
    Var get(const char* key) const { return field(key); }
    Var raw() const { return Var::view(p_); }

private:
    Var field(const char* key) const {
        if (!p_) return Var();
        if (p_->tag == CE_MAP) {
            const size_t kl = std::strlen(key);
            for (int64_t i = 0; i < p_->u.map.len; ++i) {
                const CeStr& k = p_->u.map.keys[i];
                if ((size_t) k.len == kl && std::strncmp(k.ptr, key, kl) == 0) return Var::view(&p_->u.map.vals[i]);
            }
            return Var();
        }
        if (std::strcmp(key, "value") == 0) return Var::view(p_); // scalar payload == the value
        return Var();
    }
    const CeValue* p_;
};

using CeContext = Context; // the names the editor's handler signature uses
using CeEvent   = Event;

} // namespace ce
