# Compile-at-export native handlers (C++ / C# / Java)

**Status: IMPLEMENTED + VERIFIED (per-language build + dispatch).** This document is the design; the
contract + host loader + all three generators exist and each is verified end-to-end on a real toolchain:
C++ (clang + JUCE), C# (Roslyn + self-contained CoreCLR via hostfxr), Java (javac + jlink JRE via JNI).
All three avoid Visual Studio entirely and ship only redistributable runtimes. The remaining gap is the
in-DAW end-to-end load test of a fully-bundled VST3 (the per-language modules + the host loader are each
proven; the export-pipeline wiring is exercised by the verifiers).

### Implementation status (this branch)
| Piece | File | Status |
|---|---|---|
| Shared C ABI | `NativeHandlerAbi.h` | ✅ done; compiles as C and C++ |
| Host loader (`ScriptEngine`) | `NativeHandlerEngine.cpp` (+ `ScriptRuntime`/CMake wiring, `CEDITOR_NATIVE_HANDLERS` off by default) | ✅ **verified against real JUCE 8**: `node tools/scripts/nativeHandlers/cpp/verify-host.mjs` builds the loader + `juce_core` + a generated module and asserts load→init→hasHandler→dispatch→host callbacks. (Building it caught two real bugs: a `juce::DynamicLibrary` move-assignment and a dangling-`CeStr` lifetime.) |
| C++ user surface | `tools/scripts/nativeHandlers/cpp/ce_runtime.h` | ✅ |
| C++ generator | `tools/scripts/nativeHandlers/cpp/genCpp.mjs` | ✅ **verified**: `node tools/scripts/nativeHandlers/cpp/verify.mjs` compiles a generated module + a JUCE-free host harness and asserts the full round-trip (load → init → dispatch → host callbacks) |
| Java generator (hosted-JVM) | `tools/scripts/nativeHandlers/java/{CeRuntime.java,ce_java_shim.c,genJava.mjs}` | ✅ **FULLY verified on JDK 21 (linux-x64)**: `verify-java.mjs` runs the real build — `javac` the handlers, `jar` them, `jlink` a ~39 MB JRE, and clang the JNI shim `ce_java_shim.c` (bundled clang, **no MSVC**) — then the shared host harness loads `ce_handlers_java.so`, the shim boots the JVM via the JNI Invocation API, and a Java handler dispatches + calls back into the host (`out=21`, `log='ran'`). **Replaced GraalVM native-image** (multi-GB/​multi-minute closed-world rebuild per export). |
| C# generator (hosted-CoreCLR) | `tools/scripts/nativeHandlers/csharp/{CeRuntime.cs,CeHost.c,genCsharp.mjs,hosting/*.h}` | ✅ **FULLY verified on .NET 10 (linux-x64)**: `verify-csharp.mjs` runs the real build — Roslyn `dotnet publish --self-contained` → `ce_managed.dll` + a CoreCLR; the C shim `CeHost.c` (built with the bundled clang, **no MSVC**) is compiled into the publish dir; the shared host harness loads `ce_handlers_csharp.so`, the shim boots CoreCLR via `hostfxr` (command-line init, which supports self-contained), and a C# handler dispatches + calls back into the host (`out=21`, `log='ran'`). **Replaced NativeAOT** — that path needs non-redistributable MSVC/WinSDK import libs on Windows (researched 2026-06, see §C#). Self-contained layout ~80 MB untrimmed (proven baseline); size-trim is a tracked follow-up. |
| Export orchestration | `tools/scripts/nativeHandlers/index.mjs` + `export-panel-vst3.mjs` (opt-in `compileNativeHandlers: 'on'`) | ⚠️ all three per-language build paths exercised by the verifiers; the VST3-bundling wrapper + a DAW load test are the remaining end-to-end gap. |

Run everything: `node tools/scripts/nativeHandlers/verify-all.mjs` — each check runs the **real build +
dispatch** when its toolchain is present (clang/JUCE for C++, Roslyn + self-contained CoreCLR for C#,
javac + jlink + JNI for Java), else degrades to a type/structural check. **Building all three for real
caught the bugs** the type-checks couldn't — including the load-bearing ABI fix: the host vtable passed
`CeStr`/`CeBytes` *by value*, which the GraalVM `@CStruct` prototype (a pointer type) could not express,
so the callbacks now pass them **by pointer** across every side (this also suits the C/JNI shims). C# added four more (duplicate `Compile` items; a static
class can't hold the user's instance handler; PascalCase vs the camelCase cross-language API; a private
handler unreachable by the registry → partial self-register). **All three languages build and dispatch
end to end.** The only remaining gap is wiring the compiled modules into a real `.vst3` and loading that
in a DAW.

---


## 1. The problem, stated honestly

CEditor runs scripts two ways:

- **Editor live-preview** — every language (incl. C++/C#/Java) runs through a small JS *subset
  interpreter* (`cppPreview.js`, `csharpPreview.js`, `javaPreview.js`) so handlers move controls while
  you design. This is correct and stays.
- **Shipped plugin / standalone** — Lua, JavaScript, and (optionally) Python run through real
  interpreters embedded in the C++ host (`ScriptRuntime`). C++/C#/Java **do nothing** today: the
  runtime routes unknown languages to Lua, which can't parse them, so they're skipped.

The shipped `.vst3` / standalone is **already compiled** at export by the existing pipeline
(`tools/scripts/export-panel-vst3.mjs` → `cmake --build … CEditorPlayerVST`). So the natural way to
make C++/C#/Java *do something* in the shipped plugin is **not** to embed a compiler/VM at runtime —
it is to **compile the user's handler at export time, on the dev machine, into a small native module
the plugin loads.** No language runtime ships.

This is the opposite trade-off from the interpreted languages, and it's the right one for these three
because none has a small embeddable interpreter.

## 2. Why interpreters for Lua/JS/Python but compile-at-export for C++/C#/Java

| | Lua / JS / Python | C++ / C# / Java |
|---|---|---|
| Shipped vehicle | embedded interpreter (script = data) | AOT-compiled native module (script = code) |
| Why | tiny, sandboxed, edit-without-rebuild, preview==shipped via the *same* engine | no small embeddable interpreter exists; only sane path is compile-at-export |
| Runtime shipped | Lua ~250 KB / QuickJS (in JUCE) / CPython (opt-in, stdlib) | **none** |

## 3. Unifying architecture — the "native handler module"

One panel, one language → **one native shared library**, built at export, implementing the flat C ABI
in `NativeHandlerAbi.h`:

```
ce_handler_abi_version()  // gate
ce_handler_init(host_vtable, &state)   // once, message thread, at load
ce_handler_has(state, "onValueChanged")
ce_handler_dispatch(state, "onValueChanged", payload, &result)
ce_handler_shutdown(state)
```

The host calls back into the panel API (set/get/sendCC/log/emit) **only** through the `CeHostVtable`
function pointers passed at init, so a handler module has **zero link-time dependency** on the host —
it's a self-contained module that receives function pointers. Values cross as a tagged-union `CeValue`
(double/int64/bool/string/bytes/list/map), UTF-8 strings as (ptr,len), allocation routed through the
vtable so nothing is freed across mismatched CRTs.

### Host side — `NativeHandlerEngine` (a new `ScriptEngine`)

It plugs into `ScriptRuntime` exactly like the Lua/JS/Python engines. `engineFor()` gains:

```cpp
if (language == "cpp" || language == "csharp" || language == "java")
    return native.get();   // NativeHandlerEngine, when CEDITOR_NATIVE_HANDLERS is built
```

`NativeHandlerEngine`:
- On `loadScripts`, for each panel+language it `juce::DynamicLibrary::open()`s the bundled module
  (named e.g. `ce_handlers_<panelid>_cpp.{dll,dylib,so}` beside the plugin), resolves the five entry
  points, checks `ce_handler_abi_version() == CE_ABI_VERSION`, builds a `CeHostVtable` whose function
  pointers trampoline into the live `ScriptHostApi`, and calls `ce_handler_init`.
- `hasHandler` → `ce_handler_has`. `dispatch` → marshal payload `juce::var`→`CeValue`, call
  `ce_handler_dispatch` inside the crash-guard (§6), marshal the result back.
- `reset`/dtor → `ce_handler_shutdown` + close the library (note: C# NativeAOT can't truly unload —
  keep loaded for process lifetime; Java tears down its isolate here).

The `juce::var`↔`CeValue` marshalling mirrors the existing `varToPy`/`pyToVar` in
`PythonScriptEngine.cpp`.

### Export side — extend `export-panel-vst3.mjs`

After the plugin binary is built (today's step), for each (language, panel) that has runnable
handlers of that language:
1. **Generate a module project**: write the user handlers + generated glue + `NativeHandlerAbi.h` into
   a temp dir, with the per-language project file (CMake / `.csproj` / Maven).
2. **Invoke the language's AOT toolchain** (§4) for the current platform's RID.
3. **Bundle** the resulting native module next to the plugin binary (same `vst3BinDir()` logic the
   Python bundler now uses), and set rpath/loader paths so it resolves on a clean machine.
4. On compile failure, capture stderr and surface it to the editor (§8) — the export fails loudly for
   that language, the rest of the plugin still ships.

The toolchain for a language is invoked **only if** the panel actually uses it (mirrors `embedPython`
auto-detection in `pythonEmbed.mjs`), so a Lua-only panel pays nothing.

## 4. Per-language compile pipelines (grounded)

### C++ — direct compile (cheap, clean)
- **Build**: a generated `CMakeLists.txt`, `add_library(ce_handlers_<panel>_cpp MODULE handler.cpp
  glue.cpp)`, hidden visibility + explicit `extern "C"` exports, `-fPIC`/`@rpath`/`$ORIGIN`. The user's
  code sees **only** `NativeHandlerAbi.h` plus a thin C++ convenience wrapper we generate (never JUCE
  headers — keeps compiles ~1 s and modules ~15–40 KB).
- **Toolchain at export**: the same MSVC/clang already required to build the plugin. **No new
  dependency.** This is why C++ ships first.

### C# — Roslyn managed DLL + shipped CoreCLR + C hosting shim  *(was: NativeAOT)*

**Why not NativeAOT (for the zero-VS user).** NativeAOT *does* build and dispatch, and I proved the link
step needs no MSVC linker (`-p:LinkerFlavor=lld` → `Linker: Ubuntu LLD 18.1.3`, E2E PASS on linux-x64).
But on **Windows** NativeAOT's generated objects still reference the **MSVC CRT + Windows SDK import
libraries** (`libcmt.lib`, `libucrt.lib`, `kernel32.lib`, …). `llvm-mingw` does not supply those, and
they are **Microsoft-proprietary and outside the VS redistribution grant** — we cannot legally bundle
them into CEditor and ship them to a user's machine. (Tools like `xwin` fetch them *per-developer at
build time*, which doesn't cover shipping them to end users.) So NativeAOT-no-VS is a licensing
dead-end. Kept only as an optional path for users who *do* have the C++ build tools.

**The shipped-runtime design (mirrors Java's jlink-JRE + JNI shim, and Python's embeddable).**
- **Build (no native toolchain for the managed side)**: Roslyn (`csc` / `dotnet build`) compiles
  `CeRuntime.cs` + the user's handler sources + the generated registration into a **managed IL**
  `ce_managed.dll` (+ `ce_managed.runtimeconfig.json` pointing at `Microsoft.NETCore.App`). No linker,
  no MSVC, no Windows SDK — pure IL emission.
- **Host shim** `ce_handlers_csharp.<dll|so|dylib>`: a tiny **C** shim built with the bundled
  **llvm-mingw clang** (its own MinGW/UCRT, statically linked — no MSVC). It exports our flat C ABI
  (`ce_handler_init/dispatch/has/shutdown`); inside, it `LoadLibrary`/`dlopen`s the **shipped**
  `hostfxr` by relative path (we ship the runtime, so no `nethost` link dependency is needed),
  `hostfxr_initialize_for_runtime_config` → `hdt_load_assembly_and_get_function_pointer`, and resolves
  the managed `[UnmanagedCallersOnly]` entry points of `ce_managed.dll` (init/dispatch/has/shutdown).
  `ce_handler_init` forwards the `CeHostVtable*` to managed `ce_managed_init`; dispatch/has just forward.
- **Ship into the plugin**: a **trimmed self-contained CoreCLR** (`coreclr`, `clrjit`, `hostfxr`,
  `hostpolicy`, `System.Private.CoreLib` + the BCL slice the handler API needs) **+** `ce_managed.dll`
  + its runtimeconfig + the C shim. All **MIT-licensed and freely redistributable**.
- **Mechanism proven (2026-06, linux-x64)**: `dotnet build` (Roslyn) → `ce_managed.dll`; a C shim using
  `get_hostfxr_path` → `hostfxr_initialize_for_runtime_config` → `load_assembly_and_get_function_pointer`
  (`UNMANAGEDCALLERSONLY_METHOD`) called a managed method through a function pointer — `Doubler(20)=41`,
  **CORECLR HOST E2E PASS**.
- **Entry points (managed)**: `[UnmanagedCallersOnly]` static methods (`ce_managed_dispatch`, …); host
  callbacks via the `CeHostVtable*` passed at init (cached `delegate* unmanaged<…>`). **Blittable only**
  across the boundary; every export body wrapped in `try/catch`→status.
- **Cost**: a **one-time ~15–30 MB trimmed CoreCLR** shipped once per plugin and **shared across every
  C# handler**; the `ce_managed.dll` itself is KBs. Build is Roslyn-fast (seconds), **no `native-image`
  closed-world rebuild** like Java. Unlike NativeAOT, the CLR **can** be torn down at shutdown.
- **Toolchain at export**: a portable **.NET SDK** (for Roslyn; provisioned like the JDK) **+** the
  bundled llvm-mingw clang (for the ~100-line C shim). **No MSVC, no Windows SDK, no NativeAOT, no
  cross-OS link problem** — the managed DLL is platform-neutral IL; only the tiny shim + the shipped
  runtime are per-OS, and the runtime is just downloaded per-OS, never linked by us.

### Java — hosted JVM (javac bytecode + jlink'd JRE + JNI shim)  *(was: GraalVM native-image)*

**Why hosted-JVM and not GraalVM.** native-image needs an **8–16 GB / 30 s–5 min closed-world rebuild
on every export** (the user's code is baked into the image) plus the whole GraalVM JDK on the dev
machine — the dominant UX cost of the old path. The hosted-JVM path keeps the same "ship a runtime"
model as C#/Python and is **seconds** to build.

- **Build (no native toolchain for the Java side)**: `javac` compiles the user's handlers + `CeRuntime`
  + the generated registry to ordinary **bytecode** → `jar`; `jlink --add-modules java.base` emits a
  **~40 MB trimmed JRE**. No native-image, no closed-world analysis, no reflection ban.
- **Host shim** `ce_handlers_java.<dll|so|dylib>`: the **C** shim `ce_java_shim.c` (built with the
  bundled **llvm-mingw clang** — no MSVC) exports the flat C ABI. In `ce_handler_init` it `dlopen`s the
  **shipped** `libjvm` (discovered beside the plugin), boots it via the **JNI Invocation API**
  (`JNI_CreateJavaVM`), `RegisterNatives` for the host-callback methods, and resolves the static entry
  points `CeRuntime.init/has/dispatch/shutdown`. Host callbacks: Java calls `static native` methods the
  shim implements (forwarding to the cached `CeHostVtable`). The incoming `CeValue*` payload is passed
  to Java as a `long`; Java reads fields via the shim's `nP*` accessors — so **the C side owns all
  CeValue marshalling** and the Java side is plain JNI (no GraalVM `@CStruct`).
- **Ship into the plugin**: the shim + `ce_handlers_java.jar` + the `jre/` dir. All redistributable
  (OpenJDK is GPLv2 **+ Classpath Exception** — linking/shipping is permitted).
- **Mechanism proven (2026-06, linux-x64)**: javac → jar → jlink (~39 MB) → clang the shim; the shared
  host harness boots the JVM and dispatches a Java handler that calls back into the host — **E2E PASS**.
- **Crash safety / threading**: dispatch runs on the host message thread; the shim `GetEnv`s (or
  `AttachCurrentThread`s) the JVM. A handler exception is caught at the JNI frame and turned into a
  non-zero status — never rethrown across `extern "C"`. The JVM stays up for process lifetime (an
  in-process JVM cannot be recreated; matches the C# "no real unload").
- **Cost**: a **one-time ~40 MB JRE** shipped per plugin (shared across every Java handler); the jar is
  KBs. Build is `javac`-fast.
- **Toolchain at export**: a JDK 21 (`javac`/`jar`/`jlink`, provisioned like before) **+** the bundled
  clang for the shim. **No cross-OS build** (the jar is portable bytecode, but the JRE + shim are
  per-OS — the JRE is just `jlink`'d per-OS, never a native compile of the user's code).

## 5. Crash safety — the blunt verdict (applies to all three)

**In-process native code cannot be sandboxed.** A bad pointer in the user's handler can corrupt or
crash the host DAW; there is no language- or OS-level mechanism inside the same process that prevents
it. Mitigations are damage-control, not containment:
- `try/catch(...)` around dispatch — stops a user `throw`/managed exception from unwinding into the
  JUCE message loop. Cheap; does **not** catch segfaults.
- **Windows SEH** (`__try/__except`) in a tiny C shim catches access violations and turns a crash into
  "disable this handler + warn loudly" — but state may already be corrupt; treat a caught fault as
  *disable + recommend host restart*, never *carry on*.
- **POSIX SIGSEGV**: fragile, fights the host's own handler, no reliable resume — do not promise it.
- **Watchdog**: can *detect* a hung handler on the message thread and refuse future dispatches; cannot
  safely kill the current one.
- Hardening that helps loudly-fail-early (not sandbox): `/GS /guard:cf` (MSVC),
  `-fstack-protector-strong -D_FORTIFY_SOURCE=2` (clang).

**Ship the disclaimer:** *"Exported C++/C#/Java handlers run as native code inside the host with full
privileges. A bug can crash or corrupt the host. We catch exceptions and (on Windows) hardware faults
to fail gracefully where possible, disable the offending handler, and log — but this is best-effort;
there is no true sandbox for in-process native code. Treat handler code as trusted; test before
export."* The only real containment is out-of-process (child process + IPC), which is out of scope.

## 6. Preview == shipped parity

The editor preview uses the JS subset interpreters; the shipped plugin runs real compiled code. These
are two implementations of the same handler and **can diverge** (the same risk the audit found between
the Lua/JS/Python preludes). Mitigations:
- Keep the handler API surface that the subset interpreters implement *small and identical* to the C
  ABI / generated convenience wrapper.
- A conformance test suite: a set of handler snippets run through (a) the subset interpreter and (b) a
  compiled module, asserting identical observable effects (set/sendCC/emit calls). Run in CI per
  language.

## 7. Error surfacing

Compile errors are the common case (the user typed invalid C++/C#/Java). The export step captures the
toolchain stderr, maps file/line back to the user's source offset (the glue is generated with a stable
preamble of known length, or `#line`/`// line` directives so diagnostics point at the user's lines),
and reports them through the same channel the editor already uses for live diagnostics — so a failed
export shows the real compiler error on the offending line, and the plugin still ships with the other
languages' handlers.

## 8. Staged rollout + recommendation

1. **Foundation** *(this change)*: `NativeHandlerAbi.h` (done) + this design.
2. **C++ first** — highest value, lowest cost: no new toolchain (reuses the plugin's compiler), tens of
   KB, ~1 s builds. Build `NativeHandlerEngine` (host loader + marshalling), the C++ glue generator,
   and the exporter step behind `CEDITOR_NATIVE_HANDLERS` (default OFF). This proves the whole ABI end
   to end with the cheapest language.
3. **C# second** *(done)* — reuses the same host engine + ABI unchanged; Roslyn → a managed DLL + a
   self-contained CoreCLR shipped in the plugin, booted by the `CeHost.c` shim via hostfxr. Provisioned
   portable .NET SDK; **no Visual Studio**.
4. **Java third** *(done)* — same host engine; javac → bytecode + a `jlink`'d JRE shipped in the plugin,
   booted by the `ce_java_shim.c` JNI shim. **Replaced GraalVM** (the old minutes-long, 8–16 GB
   per-export rebuild) — now `javac`-fast.

Per-platform shipping artifacts (the runtime + shim) are still per-OS, but the *user's code* is portable
(IL / bytecode / transpiled JS) — only the small shim + the runtime are per-OS, and the runtime is
downloaded/`jlink`'d per-OS, never a native compile of the handler.

## 9. Open decisions for the user

- **Java cost is now modest** (resolved). The hosted-JVM path dropped GraalVM's minutes-long/​8–16 GB
  per-export rebuild — Java is now `javac`-fast, shipping a one-time ~40 MB jlink'd JRE per plugin
  (shared across all Java handlers). No closed-world reflection limits. The only residual cost is the
  ~40 MB JRE in the bundle, same "ship a runtime" trade as C# (~80 MB CoreCLR) and Python (~11 MB).
- **Crash-safety appetite.** Accept best-effort (catch + disable + warn) and ship the disclaimer, or
  invest in out-of-process isolation (large, out of current scope)?
- **Build-time UX.** C#/Java AOT make export noticeably slower; acceptable, or gate them behind an
  explicit "compile native handlers" toggle (like `embedPython`) so the default export stays fast?
- **One module per panel** (recommended: fewer loads, shared glue) **vs per script** (independent
  unload — moot for C# which can't unload anyway).
