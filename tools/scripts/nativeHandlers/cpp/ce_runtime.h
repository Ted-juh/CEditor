// ce_runtime.h — the C++ surface a user's exported handler compiles against. Thin wrapper over the
// flat ABI in NativeHandlerAbi.h: CeContext + CeEvent (value/firstTime/…).
// Compiled into the per-panel C++ handler module alongside the generated glue (see genCpp.mjs).
//
// Parity note: this surface must match what the editor's cppPreview.js interpreter exposes, or a
// handler will behave differently in preview vs the shipped plugin (native-handlers-design.md §6).
//
// WHAT IT COVERS. The preview hands a C++ handler the whole panel API as `ctx`; this does not, and
// cannot as it stands: a member that returns a structure is read as `info.playing` in the preview,
// which C++ cannot say of a dynamic value. What it does cover is the core every shipped example and
// the manual use — set/get (and setValue/getValue), log, sendCC/sendNRPN/sendSysex, and the
// arithmetic helpers clamp/scale/round/snap/lerp/curve — under the preview's own names, with the
// preview's own results to the bit (validate-script-exports.mjs compiles the canonical example
// through genCpp and runs it, and checks every helper against the C++ runtime's JS prelude).
#pragma once
#include "NativeHandlerAbi.h"
#include <cmath>
#include <initializer_list>
#include <string>
#include <cstring>
#include <type_traits>
#include <vector>

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
    void setValue(const char* path, const Var& v) { CeStr k = cstr(path); h_->set(h_->host_ctx, &k, v.abi(), nullptr); }
    void setValue(const char* path, double d)     { setValue(path, Var(d)); }
    Var  getValue(const char* path, const char* form = "value") {
        CeValue out {}; out.tag = CE_NULL;
        CeStr k = cstr(path), f = cstr(form);
        h_->get(h_->host_ctx, &k, &f, &out);
        Var r = copyOut(out);
        h_->free_value(h_->host_ctx, &out);
        return r;
    }
    void sendCC(int ch, int cc, const Var& v) { h_->send_cc(h_->host_ctx, ch, cc, v.abi()); }
    void log(const char* msg)                 { CeStr m = cstr(msg); h_->log(h_->host_ctx, 0, &m); }
    void emit(const char* name, const Var& data) { CeStr n = cstr(name); h_->emit(h_->host_ctx, &n, data.abi()); }

    // --- the preview's spellings ---------------------------------------------------------------
    // The preview's ctx has set/get as well as setValue/getValue (they are one function there), and
    // every path or message may be a std::string as well as a literal.
    //
    // A bool reaches the host as a bool, as it does from the preview (and from Lua and JS). It does
    // so through a template that only bool itself can match, not through a plain bool overload: that
    // would win set("label.text", "hello") — a pointer converts to bool by a standard conversion,
    // which beats Var's constructor — and set the label to true, and make set("x", 5) ambiguous.
    // Here a string still reaches Var, an int still the double overload, and only a bool this.
    template <typename B> requires std::is_same_v<B, bool>
    void setValue(const char* path, B b)                  { setValue(path, Var(b)); }
    template <typename B> requires std::is_same_v<B, bool>
    void setValue(const std::string& path, B b)           { setValue(path.c_str(), Var(b)); }
    template <typename B> requires std::is_same_v<B, bool>
    void set(const char* path, B b)                       { setValue(path, Var(b)); }
    template <typename B> requires std::is_same_v<B, bool>
    void set(const std::string& path, B b)                { setValue(path.c_str(), Var(b)); }
    void setValue(const std::string& path, const Var& v)  { setValue(path.c_str(), v); }
    void setValue(const std::string& path, double d)      { setValue(path.c_str(), Var(d)); }
    void set(const char* path, const Var& v)              { setValue(path, v); }
    void set(const char* path, double d)                  { setValue(path, Var(d)); }
    void set(const std::string& path, const Var& v)       { setValue(path.c_str(), v); }
    void set(const std::string& path, double d)           { setValue(path.c_str(), Var(d)); }
    Var  getValue(const std::string& path, const std::string& form = "value") { return getValue(path.c_str(), form.c_str()); }
    Var  get(const char* path, const char* form = "value") { return getValue(path, form); }
    Var  get(const std::string& path, const std::string& form = "value") { return getValue(path.c_str(), form.c_str()); }
    void log(const std::string& msg)                      { log(msg.c_str()); }
    void emit(const std::string& name, const Var& data)   { emit(name.c_str(), data); }

    /** log(message, value) — the value goes to the host as it is, and the host formats it, as it
        does for a Lua or JS log. A host older than the slot gets the message alone. */
    void log(const char* msg, const Var& value) {
        CeStr m = cstr(msg);
        if (CE_HAS_FIELD(h_, log_value) && h_->log_value) h_->log_value(h_->host_ctx, 0, &m, value.abi());
        else h_->log(h_->host_ctx, 0, &m);
    }
    void log(const std::string& msg, const Var& value)   { log(msg.c_str(), value); }

    void sendNRPN(int ch, int msb, int lsb, const Var& v) { h_->send_nrpn(h_->host_ctx, ch, msb, lsb, v.abi()); }

    /** sendSysex(bytes) or sendSysex("F0 41 10 …"). The list or the string goes to the host as it
        is — the host clamps each byte and adds F0/F7 exactly as it does for Lua and JS. */
    void sendSysex(const std::vector<int>& bytes) {
        std::vector<CeValue> items(bytes.size());
        for (size_t i = 0; i < bytes.size(); ++i) { items[i] = CeValue{}; items[i].tag = CE_INT64; items[i].u.i = bytes[i]; }
        CeValue list{}; list.tag = CE_LIST; list.u.list.items = items.data(); list.u.list.len = (int64_t) items.size();
        if (CE_HAS_FIELD(h_, send_sysex_value) && h_->send_sysex_value) { h_->send_sysex_value(h_->host_ctx, &list); return; }
        // A host older than the slot takes packed bytes: clamp them first, as the host would.
        std::vector<uint8_t> packed(bytes.size());
        for (size_t i = 0; i < bytes.size(); ++i) packed[i] = (uint8_t) (bytes[i] < 0 ? 0 : bytes[i] > 255 ? 255 : bytes[i]);
        CeBytes b { packed.data(), (int64_t) packed.size() };
        h_->send_sysex(h_->host_ctx, &b);
    }
    void sendSysex(std::initializer_list<int> bytes) { sendSysex(std::vector<int>(bytes)); }
    void sendSysex(const char* hex) {
        if (!(CE_HAS_FIELD(h_, send_sysex_value) && h_->send_sysex_value)) { log("sendSysex(\"\xE2\x80\xA6\"): this host takes a list of bytes, not a hex string."); return; }
        Var v(hex); h_->send_sysex_value(h_->host_ctx, v.abi());
    }
    void sendSysex(const std::string& hex) { sendSysex(hex.c_str()); }

    // --- the arithmetic helpers ----------------------------------------------------------------
    // Written from the preludes' own definitions (and the WebView's, which they agree with), to the
    // bit. Two things a straight translation gets wrong: JS Math.round rounds half towards +infinity
    // and returns -0 for [-0.5, 0), which neither std::round nor floor(v + 0.5) does at the edges;
    // and Math.max(0, NaN) is NaN where std::max gives 0. Where a product feeds a sum it is its own
    // statement, so no compiler fuses the two into one rounding the other runtimes do not make.
    static double jsRound(double v) {
        if (v != v || std::isinf(v) || v == std::floor(v)) return v;
        if (v < 0 && v >= -0.5) return -0.0;
        const double r = std::floor(v);
        return (v - r >= 0.5) ? r + 1.0 : r;
    }
    double clamp(double v, double lo, double hi) const { return v < lo ? lo : (v > hi ? hi : v); }
    double round(double v) const { return jsRound(v); }
    double scale(double v, double inLo, double inHi, double outLo, double outHi) const {
        if (inHi == inLo) return outLo;
        const double part = (v - inLo) * (outHi - outLo) / (inHi - inLo);
        return outLo + part;
    }
    double snap(double v, double step) const { return step == 0 ? v : jsRound(v / step) * step; }
    double lerp(double a, double b, double t) const {
        const double part = (b - a) * t;
        return a + part;
    }
    double curve(double v, const char* shape = "linear") {
        const std::string s = (shape == nullptr || *shape == 0) ? std::string("linear") : std::string(shape);
        if (s == "exp") return v * v;
        if (s == "log") return std::sqrt(v != v ? v : (v > 0 ? v : 0.0));
        if (s == "s") {
            const double twice = 2 * v;
            const double rest = 3 - twice;
            return v * v * rest;
        }
        if (s != "linear")
            log(("curve(v, " + jsonQuote(s) + "): unknown shape \xE2\x80\x94 using linear. The names are \"linear\", "
                 "\"exp\", \"log\" and \"s\"; for any other shape use map(v, points).").c_str());
        return v;
    }
    // JSON.stringify of a string, which is how the WebView quotes the shape in that message.
    static std::string jsonQuote(const std::string& s) {
        std::string out = "\"";
        for (unsigned char c : s) {
            switch (c) {
                case '"':  out += "\\\""; break;
                case '\\': out += "\\\\"; break;
                case '\b': out += "\\b"; break;
                case '\f': out += "\\f"; break;
                case '\n': out += "\\n"; break;
                case '\r': out += "\\r"; break;
                case '\t': out += "\\t"; break;
                default:
                    if (c < 0x20) { static const char* hex = "0123456789abcdef"; out += "\\u00"; out += hex[c >> 4]; out += hex[c & 15]; }
                    else out += (char) c;
            }
        }
        return out + "\"";
    }
    double curve(double v, const std::string& shape) { return curve(v, shape.c_str()); }

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
