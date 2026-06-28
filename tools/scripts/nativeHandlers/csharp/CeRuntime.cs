// CeRuntime.cs — the C# surface a user's exported handler compiles against, plus the flat-ABI interop
// layer and the [UnmanagedCallersOnly] entry points the host (NativeHandlerEngine) resolves by name.
//
// This is the C# mirror of NativeHandlerAbi.h (the flat C ABI) and cpp/ce_runtime.h (the user-facing
// CeContext/CeEvent surface). It is compiled into ONE per-panel NativeAOT module named
// `ce_handlers_csharp.<dll|dylib|so>` — exactly the file name NativeHandlerEngine::moduleFileName()
// looks for next to the plugin binary.
//
// BUILD-UNVERIFIED SCAFFOLD. No .NET AOT toolchain is available where this was authored. The struct
// layouts below are hand-aligned to the C header; a reviewer MUST double-check the [FieldOffset]/sizes
// against the C compiler's actual layout on a real build (see the "ABI-LAYOUT ASSUMPTIONS" notes at
// the bottom of this file). Requires .NET 9/10 SDK + a native toolchain; build is per-OS (no cross-OS).
//
// Memory rules honored here (from NativeHandlerAbi.h):
//   - whoever allocates frees: a CeValue the HOST fills via get() is freed by us via vtable.free_value;
//   - strings we pass TO the host are UTF-8 (ptr,len), pinned/stack-allocated, valid only for the call;
//   - no managed exception may cross an extern "C" frame — every entry point wraps its body in
//     try/catch and converts to a status code (an escaping exception would crash the host).

using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;

namespace Ce
{
    // ----------------------------------------------------------------- ABI constants / enums

    internal static class Abi
    {
        // Must equal CE_ABI_VERSION in NativeHandlerAbi.h. Bumped in lockstep with the C header.
        public const uint Version = 1u;
    }

    // CeTag — fixed-width (int32) to match CeTagInt in the C header.
    internal enum CeTag : int
    {
        Null = 0,
        Double = 1,
        Int64 = 2,
        Bool = 3,
        String = 4,
        Bytes = 5,
        List = 6,
        Map = 7,
    }

    // ----------------------------------------------------------------- blittable ABI structs
    //
    // Layout discipline: all are Sequential or Explicit with no managed reference fields, so the runtime
    // treats them as blittable and we can take raw pointers. Pointers are IntPtr (8 bytes on the 64-bit
    // targets; on 32-bit Windows IntPtr is 4 bytes, matching `const char*`). int64 lengths match the C
    // `int64_t`.

    // typedef struct { const char* ptr; int64_t len; } CeStr;  (UTF-8, not necessarily NUL-terminated)
    [StructLayout(LayoutKind.Sequential)]
    internal struct CeStr
    {
        public IntPtr ptr; // const char*
        public long len;   // int64_t

        public static unsafe CeStr FromUtf8Ptr(byte* p, int byteLen) => new CeStr { ptr = (IntPtr)p, len = byteLen };
    }

    // typedef struct { const uint8_t* ptr; int64_t len; } CeBytes;
    [StructLayout(LayoutKind.Sequential)]
    internal struct CeBytes
    {
        public IntPtr ptr; // const uint8_t*
        public long len;   // int64_t
    }

    // typedef struct { CeValue* items; int64_t len; } CeList;
    [StructLayout(LayoutKind.Sequential)]
    internal struct CeList
    {
        public IntPtr items; // CeValue*
        public long len;     // int64_t
    }

    // typedef struct { CeStr* keys; CeValue* vals; int64_t len; } CeMap;
    [StructLayout(LayoutKind.Sequential)]
    internal struct CeMap
    {
        public IntPtr keys; // CeStr*
        public IntPtr vals; // CeValue*
        public long len;    // int64_t
    }

    // struct CeValue { CeTagInt tag; int32_t _pad; union { ... } u; };
    //
    // The C union starts at offset 8 (after the 4-byte tag + 4-byte _pad). We model the union with
    // [StructLayout(LayoutKind.Explicit)]: tag at 0, _pad at 4, then every union member at FieldOffset 8.
    // The largest union member is CeMap (3 * 8 = 24 bytes) on a 64-bit target, so the struct is 8 + 24 =
    // 32 bytes — matching the C side where the union is 24 bytes and the whole struct is 32 bytes.
    [StructLayout(LayoutKind.Explicit)]
    internal struct CeValue
    {
        [FieldOffset(0)] public int tag;  // CeTagInt (one of CeTag)
        [FieldOffset(4)] public int _pad; // explicit pad, keeps the union 8-byte aligned

        // --- union u @ offset 8 ---
        [FieldOffset(8)] public double d;  // CE_DOUBLE
        [FieldOffset(8)] public long i;    // CE_INT64
        [FieldOffset(8)] public int b;     // CE_BOOL (bool as int32)
        [FieldOffset(8)] public CeStr s;   // CE_STRING
        [FieldOffset(8)] public CeBytes by; // CE_BYTES
        [FieldOffset(8)] public CeList list; // CE_LIST
        [FieldOffset(8)] public CeMap map;   // CE_MAP

        public CeTag Tag => (CeTag)tag;

        public static CeValue Null() => new CeValue { tag = (int)CeTag.Null };
    }

    // struct CeHostVtable — the host's callback table. Function-pointer fields are
    // `delegate* unmanaged[Cdecl]<...>` in EXACTLY the C struct's field order. abi_version/struct_size
    // are uint32; host_ctx + every callback is pointer-sized.
    //
    // NOTE on calling convention: the C header pins __cdecl only on 32-bit Windows (64-bit has one ABI),
    // so [Cdecl] here is correct on all targets — on 64-bit it is the single platform convention.
    [StructLayout(LayoutKind.Sequential)]
    internal unsafe struct CeHostVtable
    {
        public uint abi_version; // host fills CE_ABI_VERSION
        public uint struct_size; // sizeof(CeHostVtable) on the host side — gate before reading new fields
        public IntPtr host_ctx;  // void* opaque, passed back to every callback below

        // int set(void* host_ctx, const CeStr* key, const CeValue* v, const CeValue* opts /*nullable*/);
        public delegate* unmanaged[Cdecl]<IntPtr, CeStr*, CeValue*, CeValue*, int> set;
        // int get(void* host_ctx, const CeStr* key, const CeStr* form, CeValue* out /*host-owned, free_value*/);
        public delegate* unmanaged[Cdecl]<IntPtr, CeStr*, CeStr*, CeValue*, int> get;
        // void send_cc(void* host_ctx, int32_t channel, int32_t cc, const CeValue* v);
        public delegate* unmanaged[Cdecl]<IntPtr, int, int, CeValue*, void> send_cc;
        // void send_nrpn(void* host_ctx, int32_t channel, int32_t msb, int32_t lsb, const CeValue* v);
        public delegate* unmanaged[Cdecl]<IntPtr, int, int, int, CeValue*, void> send_nrpn;
        // void send_sysex(void* host_ctx, const CeBytes* bytes);
        public delegate* unmanaged[Cdecl]<IntPtr, CeBytes*, void> send_sysex;
        // void log(void* host_ctx, int32_t level, const CeStr* msg);
        public delegate* unmanaged[Cdecl]<IntPtr, int, CeStr*, void> log;
        // void emit(void* host_ctx, const CeStr* name, const CeValue* data /*nullable*/);
        public delegate* unmanaged[Cdecl]<IntPtr, CeStr*, CeValue*, void> emit;
        // void free_value(void* host_ctx, CeValue* v);
        public delegate* unmanaged[Cdecl]<IntPtr, CeValue*, void> free_value;
        // void* alloc(void* host_ctx, size_t n);
        public delegate* unmanaged[Cdecl]<IntPtr, nuint, IntPtr> alloc;
        // void dealloc(void* host_ctx, void* p, size_t n);
        public delegate* unmanaged[Cdecl]<IntPtr, IntPtr, nuint, void> dealloc;
    }

    // ----------------------------------------------------------------- UTF-8 marshalling helpers

    internal static unsafe class Utf8
    {
        // Encode `s` into a CeStr backed by a freshly-allocated unmanaged buffer. The caller is
        // responsible for freeing it (see Free) once the host call has returned. We use this for strings
        // we pass to the host: the bytes must stay valid for the duration of the call only.
        public static CeStr Alloc(string? s)
        {
            if (string.IsNullOrEmpty(s))
                return new CeStr { ptr = IntPtr.Zero, len = 0 };

            int byteLen = Encoding.UTF8.GetByteCount(s);
            IntPtr buf = Marshal.AllocHGlobal(byteLen == 0 ? 1 : byteLen);
            fixed (char* src = s)
            {
                Encoding.UTF8.GetBytes(src, s.Length, (byte*)buf, byteLen);
            }
            return new CeStr { ptr = buf, len = byteLen };
        }

        public static void Free(CeStr s)
        {
            if (s.ptr != IntPtr.Zero)
                Marshal.FreeHGlobal(s.ptr);
        }

        // Decode a CeStr (UTF-8 ptr+len, possibly non-NUL-terminated) handed to us by the host.
        public static string Decode(CeStr s)
        {
            if (s.ptr == IntPtr.Zero || s.len <= 0)
                return string.Empty;
            return Encoding.UTF8.GetString((byte*)s.ptr, checked((int)s.len));
        }
    }

    // ----------------------------------------------------------------- user-facing Var (mirror of ce::Var)
    //
    // Either an owned scalar/string the user builds, or a read-only view over an ABI CeValue handed in by
    // the host. Convenience getters cover scalars + strings; lists/maps round-trip through the host but
    // ergonomic helpers are a TODO (see Abi()).
    public sealed unsafe class Var
    {
        private CeValue _owned;        // backing store when this Var owns its value
        private readonly CeValue* _ext; // non-null when this Var is a view over a host-owned CeValue
        private string? _ownedString;   // keeps the managed string alive while _owned.s points into it
        private byte[]? _ownedUtf8;     // pinned-free copy of the UTF-8 bytes for owned strings

        public Var() { _owned = CeValue.Null(); _ext = null; }
        public Var(double d) { _owned = new CeValue { tag = (int)CeTag.Double, d = d }; _ext = null; }
        public Var(long i) { _owned = new CeValue { tag = (int)CeTag.Int64, i = i }; _ext = null; }
        public Var(int i) : this((long)i) { }
        public Var(bool b) { _owned = new CeValue { tag = (int)CeTag.Bool, b = b ? 1 : 0 }; _ext = null; }

        public Var(string s)
        {
            _ext = null;
            _ownedString = s ?? string.Empty;
            // Stash the UTF-8 bytes in a managed array; we hand a pinned pointer to the host only for the
            // duration of a call (see Context.WithAbi). Until then _owned.s.ptr stays zero/length-only.
            _ownedUtf8 = Encoding.UTF8.GetBytes(_ownedString);
            _owned = new CeValue { tag = (int)CeTag.String, s = new CeStr { ptr = IntPtr.Zero, len = _ownedUtf8.Length } };
        }

        // View over a host-owned CeValue* (read-only; do not free through this Var).
        internal static Var View(CeValue* v) => new Var(v);

        private Var(CeValue* ext) { _owned = CeValue.Null(); _ext = ext; }

        // The ABI value this Var represents. For owned strings we must publish a live UTF-8 pointer for
        // the call duration; callers that pass a Var to the host go through Context which pins/copies as
        // needed. Here we return the raw backing for views, and the scalar backing for owned values.
        internal CeValue* Abi(CeValue* scratch)
        {
            if (_ext != null) return _ext;

            *scratch = _owned;
            if (_owned.Tag == CeTag.String && _ownedUtf8 != null)
            {
                // The pointer is filled in by the caller (Context.WithAbi) under a `fixed` so the bytes
                // stay pinned for the host call. We leave length set and ptr to be patched there.
            }
            return scratch;
        }

        internal bool IsOwnedString => _ext == null && _owned.Tag == CeTag.String;
        internal byte[]? OwnedUtf8 => _ownedUtf8;
        internal CeValue OwnedBacking => _owned;

        private CeValue* Cur(CeValue* scratch)
        {
            if (_ext != null) return _ext;
            *scratch = _owned;
            return scratch;
        }

        public double AsDouble()
        {
            CeValue tmp;
            CeValue* v = Cur(&tmp);
            return v->Tag switch
            {
                CeTag.Double => v->d,
                CeTag.Int64 => (double)v->i,
                CeTag.Bool => v->b,
                _ => 0.0,
            };
        }

        public long AsInt() => (long)AsDouble();

        public bool AsBool()
        {
            CeValue tmp;
            CeValue* v = Cur(&tmp);
            return v->Tag == CeTag.Bool ? v->b != 0 : AsDouble() != 0.0;
        }

        public string AsString()
        {
            if (_ext != null)
                return _ext->Tag == CeTag.String ? Utf8.Decode(_ext->s) : string.Empty;
            return _owned.Tag == CeTag.String ? (_ownedString ?? string.Empty) : string.Empty;
        }

        public override string ToString() => AsString();
    }

    // ----------------------------------------------------------------- CeContext (mirror of ce::Context)
    //
    // Thin wrapper over the cached host vtable. set/get/sendCC/log/emit marshal strings as UTF-8 ptr+len
    // valid for the call duration only.
    public sealed unsafe class CeContext
    {
        private readonly CeHostVtable* _h;
        internal CeContext(CeHostVtable* h) { _h = h; }

        public void setValue(string path, Var v)
        {
            CeStr key = Utf8.Alloc(path);
            try
            {
                CeValue scratch;
                if (v.IsOwnedString && v.OwnedUtf8 != null)
                {
                    fixed (byte* sp = v.OwnedUtf8)
                    {
                        scratch = v.OwnedBacking;
                        scratch.s = new CeStr { ptr = (IntPtr)sp, len = v.OwnedUtf8.Length };
                        _h->set(_h->host_ctx, &key, &scratch, null);
                    }
                }
                else
                {
                    CeValue* abi = v.Abi(&scratch);
                    _h->set(_h->host_ctx, &key, abi, null);
                }
            }
            finally { Utf8.Free(key); }
        }

        public void setValue(string path, double d) => setValue(path, new Var(d));

        // get() returns a host-owned CeValue tree; we copy out the scalar/string we need and then free it
        // via vtable.free_value, honoring the memory rule.
        public Var getValue(string path, string form = "value")
        {
            CeStr key = Utf8.Alloc(path);
            CeStr frm = Utf8.Alloc(form);
            try
            {
                CeValue outv = CeValue.Null();
                _h->get(_h->host_ctx, &key, &frm, &outv);
                Var r = CopyOut(&outv);
                _h->free_value(_h->host_ctx, &outv); // host-produced value -> host frees
                return r;
            }
            finally
            {
                Utf8.Free(key);
                Utf8.Free(frm);
            }
        }

        public void sendCC(int channel, int cc, Var v)
        {
            CeValue scratch;
            if (v.IsOwnedString && v.OwnedUtf8 != null)
            {
                fixed (byte* sp = v.OwnedUtf8)
                {
                    scratch = v.OwnedBacking;
                    scratch.s = new CeStr { ptr = (IntPtr)sp, len = v.OwnedUtf8.Length };
                    _h->send_cc(_h->host_ctx, channel, cc, &scratch);
                }
            }
            else
            {
                CeValue* abi = v.Abi(&scratch);
                _h->send_cc(_h->host_ctx, channel, cc, abi);
            }
        }

        // Numeric convenience (mirrors setValue(string,double)): handlers call sendCC(1, 25, 127) with a
        // plain number; without this overload the int literal has no conversion to Var and won't compile.
        public void sendCC(int channel, int cc, double v) => sendCC(channel, cc, new Var(v));

        public void log(string msg)
        {
            CeStr m = Utf8.Alloc(msg);
            try { _h->log(_h->host_ctx, 0, &m); }
            finally { Utf8.Free(m); }
        }

        public void emit(string name, Var data)
        {
            CeStr nm = Utf8.Alloc(name);
            try
            {
                CeValue scratch;
                if (data.IsOwnedString && data.OwnedUtf8 != null)
                {
                    fixed (byte* sp = data.OwnedUtf8)
                    {
                        scratch = data.OwnedBacking;
                        scratch.s = new CeStr { ptr = (IntPtr)sp, len = data.OwnedUtf8.Length };
                        _h->emit(_h->host_ctx, &nm, &scratch);
                    }
                }
                else
                {
                    CeValue* abi = data.Abi(&scratch);
                    _h->emit(_h->host_ctx, &nm, abi);
                }
            }
            finally { Utf8.Free(nm); }
        }

        // Copy a (just-returned, still host-owned) CeValue into an owned Var before free_value reclaims it.
        // Strings are decoded into managed memory so they survive the free. List/map copy-out is a TODO
        // (mirrors ce_runtime.h: scalars + strings only).
        private static Var CopyOut(CeValue* o)
        {
            return o->Tag switch
            {
                CeTag.String => new Var(Utf8.Decode(o->s)),
                CeTag.Double => new Var(o->d),
                CeTag.Int64 => new Var(o->i),
                CeTag.Bool => new Var(o->b != 0),
                _ => new Var(),
            };
        }
    }

    // ----------------------------------------------------------------- CeEvent (mirror of ce::Event)
    //
    // Public fields so handlers read `e.Value` / `e.FirstTime` (matching the editor skeleton). Field
    // access reads the incoming CeValue* payload: a CE_MAP is searched by key; a scalar payload is treated
    // as the "value" field itself.
    public sealed unsafe class CeEvent
    {
        private readonly CeValue* _p;

        public double value { get; }
        public bool firstTime { get; }

        internal CeEvent(CeValue* payload)
        {
            _p = payload;
            value = Field("value").AsDouble();
            firstTime = Field("firstTime").AsBool();
        }

        public Var Get(string key) => Field(key);
        public Var Raw() => Var.View(_p);

        private Var Field(string key)
        {
            if (_p == null) return new Var();

            if (_p->Tag == CeTag.Map)
            {
                CeMap map = _p->map;
                var keys = (CeStr*)map.keys;
                var vals = (CeValue*)map.vals;
                for (long i = 0; i < map.len; i++)
                {
                    if (Utf8.Decode(keys[i]) == key)
                        return Var.View(&vals[i]);
                }
                return new Var();
            }

            // Scalar payload == the value.
            if (key == "value")
                return Var.View(_p);
            return new Var();
        }
    }

    // ----------------------------------------------------------------- dispatch registry
    //
    // Keyed by (scriptId, eventId) -> the user's handler. Populated by GENERATED code (genCsharp.mjs emits
    // a `HandlerRegistry.Register` partial that adds each Script_<id>.<event> entry). ce_handler_dispatch
    // and ce_handler_has look up this table.
    internal static class HandlerRegistry
    {
        // (scriptId, eventId) -> Action<CeContext, CeEvent>.
        private static readonly Dictionary<(string, string), Action<CeContext, CeEvent>> Map = new();

        public static void Add(string scriptId, string eventId, Action<CeContext, CeEvent> fn)
            => Map[(scriptId, eventId)] = fn;

        public static bool Has(string scriptId, string eventId) => Map.ContainsKey((scriptId, eventId));

        public static bool TryGet(string scriptId, string eventId, out Action<CeContext, CeEvent>? fn)
            => Map.TryGetValue((scriptId, eventId), out fn);
    }

    // The generated registration partial calls into this so all entries are registered exactly once,
    // lazily, on first init. (NativeAOT has no module initializer ordering guarantees we want to rely on.)
    internal static partial class GeneratedRegistration
    {
        // Implemented by the generated *.Registration.cs partial. If no handlers were generated, the
        // generator still emits an empty body so this compiles.
        public static partial void RegisterAll();
    }

    // ----------------------------------------------------------------- exported entry points
    //
    // These four/five symbols are what NativeHandlerEngine resolves by name. They MUST be
    // [UnmanagedCallersOnly] with EntryPoint set to the exact C name and CallConvs = [CallConvCdecl], and
    // they MUST NOT let a managed exception escape (a throw across the extern "C" frame crashes the host).
    internal static unsafe class Exports
    {
        // Cached vtable pointer, set in ce_handler_init. The host keeps the CeHostVtable alive for the
        // module's lifetime (it lives in the host's `modules` map), so caching the pointer is safe.
        private static CeHostVtable* s_host = null;
        private static bool s_registered = false;

        // uint32_t ce_handler_abi_version(void) — gate FIRST; host refuses a mismatch.
        [UnmanagedCallersOnly(EntryPoint = "ce_handler_abi_version", CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvCdecl) })]
        public static uint AbiVersion() => Abi.Version;

        // int ce_handler_init(const CeHostVtable* host, void** out_state)
        // Called once on the message thread at plugin load. Cache the vtable. Touching managed state here
        // forces NativeAOT runtime/GC bring-up deterministically (per the C# note in NativeHandlerAbi.h).
        [UnmanagedCallersOnly(EntryPoint = "ce_handler_init", CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvCdecl) })]
        public static int Init(CeHostVtable* host, void** outState)
        {
            try
            {
                if (host == null || host->abi_version != Abi.Version)
                    return -1;

                s_host = host;

                // Populate the dispatch registry once (forces GC/type-system bring-up now, not on the
                // first dispatch — deterministic, matches the design intent for C# AOT modules).
                if (!s_registered)
                {
                    GeneratedRegistration.RegisterAll();
                    s_registered = true;
                }

                // out_state is opaque + handler-owned; the host only passes it back to dispatch/shutdown.
                // We're effectively stateless (the vtable is cached statically), but the host asserts
                // *out_state != null on success, so hand back a non-null sentinel (the vtable pointer).
                if (outState != null)
                    *outState = host;

                return 0;
            }
            catch
            {
                return -2; // never let an exception cross the ABI frame
            }
        }

        // int ce_handler_has(void* state, CeStr script_id, CeStr event_id)
        [UnmanagedCallersOnly(EntryPoint = "ce_handler_has", CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvCdecl) })]
        public static int Has(void* state, CeStr scriptId, CeStr eventId)
        {
            try
            {
                string sid = Utf8.Decode(scriptId);
                string ev = Utf8.Decode(eventId);
                return HandlerRegistry.Has(sid, ev) ? 1 : 0;
            }
            catch
            {
                return 0; // "no handler" is the safe answer on failure
            }
        }

        // int ce_handler_dispatch(void* state, CeStr script_id, CeStr event_id,
        //                         const CeValue* payload, CeValue* out_result /*nullable*/)
        [UnmanagedCallersOnly(EntryPoint = "ce_handler_dispatch", CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvCdecl) })]
        public static int Dispatch(void* state, CeStr scriptId, CeStr eventId, CeValue* payload, CeValue* outResult)
        {
            try
            {
                if (s_host == null)
                    return -1;

                string sid = Utf8.Decode(scriptId);
                string ev = Utf8.Decode(eventId);

                if (!HandlerRegistry.TryGet(sid, ev, out var fn) || fn == null)
                    return 0; // no such handler is NOT an error (parity with the C++ glue)

                var ctx = new CeContext(s_host);
                var evt = new CeEvent(payload);

                // Value-returning handlers (e.g. onDawSaveState) are a TODO — see design §4. We leave
                // out_result as the host initialized it (CE_NULL) so the host reads back null.
                fn(ctx, evt);
                return 0;
            }
            catch
            {
                // Return non-zero so the host logs + disables; do NOT rethrow across the frame.
                return -3;
            }
        }

        // void ce_handler_shutdown(void* state)
        // NativeAOT can't truly unload; the host keeps the module loaded for process lifetime. This just
        // flushes handler state.
        [UnmanagedCallersOnly(EntryPoint = "ce_handler_shutdown", CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvCdecl) })]
        public static void Shutdown(void* state)
        {
            try
            {
                s_host = null;
                // We intentionally keep the registry populated: a re-init reuses it (s_registered stays
                // true only within a process; the static is reset only if the host reloads us, which AOT
                // does not support anyway).
            }
            catch
            {
                // swallow — nothing actionable, and we must not throw across the frame
            }
        }
    }
}

// ====================================================================================================
// ABI-LAYOUT ASSUMPTIONS A REVIEWER MUST DOUBLE-CHECK ON A REAL BUILD:
//
//  1. CeValue size/offsets. We assume sizeof(CeValue) == 32 on 64-bit (tag@0, _pad@4, union@8, union
//     is 24 bytes = CeMap's 3 pointers). Confirm the C compiler produces the same and that
//     Marshal.SizeOf<CeValue>() == 32. CeValue* arithmetic in CeEvent.Field (indexing map.vals[i])
//     relies on this stride matching the C side's array layout.
//
//  2. Pointer width. IntPtr is used for every C pointer. On 32-bit Windows that is 4 bytes and the C
//     `__cdecl` convention applies (CallConvCdecl handles it). On all 64-bit targets there is one ABI.
//     If a 32-bit target is ever shipped, re-verify CeStr/CeBytes/CeList/CeMap offsets (8-byte int64 len
//     after a 4-byte pointer introduces padding that must match the C struct).
//
//  3. CeHostVtable field order + count. It mirrors NativeHandlerAbi.h exactly (set, get, send_cc,
//     send_nrpn, send_sysex, log, emit, free_value, alloc, dealloc). The struct is append-only on the
//     host; if the host grows it we still read only these fields, but verify struct_size >= our expected
//     size before relying on any field if/when new ones are added.
//
//  4. bool marshalling. CE_BOOL is stored as int32 (CeValue.b). We never use a C# `bool` in any blittable
//     struct, avoiding the 1-vs-4-byte ambiguity. Confirm no implicit bool field crept in.
//
//  5. UTF-8 lifetime. Strings passed to the host (Utf8.Alloc / fixed-pinned OwnedUtf8) are valid only for
//     the duration of the single vtable call. The host copies what it needs synchronously (see
//     NativeHandlerEngine host_set/host_get etc.), so this is safe — confirm the host never retains a
//     CeStr.ptr past the call.
//
//  6. free_value discipline. We free ONLY the CeValue the host fills via get(). We never free the
//     incoming dispatch payload (host-owned, freed by the host after dispatch returns) nor any CeStr we
//     allocated for the host (those we free ourselves via Utf8.Free).
// ====================================================================================================
