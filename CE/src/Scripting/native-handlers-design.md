# Compile-at-export native handlers (C++ / C# / Java)

**Status: PARTIALLY IMPLEMENTED.** This document is the design; the contract + host loader + all three
generators now exist. The C++ path is verified end-to-end (no JUCE needed); the C#/Java paths are
written but build-unverified (no .NET-AOT / GraalVM toolchain in this environment).

### Implementation status (this branch)
| Piece | File | Status |
|---|---|---|
| Shared C ABI | `NativeHandlerAbi.h` | ✅ done; compiles as C and C++ |
| Host loader (`ScriptEngine`) | `NativeHandlerEngine.cpp` (+ `ScriptRuntime`/CMake wiring, `CEDITOR_NATIVE_HANDLERS` off by default) | ✅ **verified against real JUCE 8**: `node tools/scripts/nativeHandlers/cpp/verify-host.mjs` builds the loader + `juce_core` + a generated module and asserts load→init→hasHandler→dispatch→host callbacks. (Building it caught two real bugs: a `juce::DynamicLibrary` move-assignment and a dangling-`CeStr` lifetime.) |
| C++ user surface | `tools/scripts/nativeHandlers/cpp/ce_runtime.h` | ✅ |
| C++ generator | `tools/scripts/nativeHandlers/cpp/genCpp.mjs` | ✅ **verified**: `node tools/scripts/nativeHandlers/cpp/verify.mjs` compiles a generated module + a JUCE-free host harness and asserts the full round-trip (load → init → dispatch → host callbacks) |
| Java generator (GraalVM) | `tools/scripts/nativeHandlers/java/{CeRuntime.java,ce_java_shim.c,harness.c,genJava.mjs}` | ✅ **FULLY verified on GraalVM CE 21.0.2**: `verify-java.mjs` runs the real `native-image --shared` build + the C-shim isolate link, loads the 14 MB module, and dispatches a Java handler that calls back into the host (`out=21`, `log='ran'`). Falls back to a javac-against-`graal-sdk` type-check where native-image is absent. |
| C# generator (NativeAOT) | `tools/scripts/nativeHandlers/csharp/{CeRuntime.cs,genCsharp.mjs}` | ⚠️ generator output **structurally verified** (`verify-csharp.mjs`) and the interop updated to the pointer-ABI for consistency with the verified C++/Java sides. The actual `dotnet publish` AOT build was **NOT runnable here**: the .NET SDK CDNs (`download.visualstudio.microsoft.com`, `builds.dotnet.microsoft.com`) are denied by this environment's egress policy — a sandbox limit, not a code gap. It needs a .NET SDK on the export/CI machine. |
| Export orchestration | `tools/scripts/nativeHandlers/index.mjs` + `export-panel-vst3.mjs` (opt-in `compileNativeHandlers: 'on'`) | ⚠️ C++/Java build paths exercised by the verifiers; the VST3-bundling wrapper is end-to-end-unverified. |

Run everything: `node tools/scripts/nativeHandlers/verify-all.mjs` (each check runs as far as its toolchain
allows; full native-image build when GraalVM is present, else a type-check). **Building Java for real
caught five bugs** the type-checks couldn't: a header-copy key mismatch, a missing `@CContext` directive,
`@CContext`-forces-build-time-init vs. `CeRuntime`'s runtime state, the shim passing `@CStruct` args
by value (native-image lowers them to pointers), and — the ABI fix that propagated to all sides — the
host vtable passing `CeStr`/`CeBytes` by value, which GraalVM can't express, so the callbacks now pass
them **by pointer**. What still needs a real build: the **C#** `dotnet publish` AOT (blocked here by
egress policy) and a **DAW load test** of the bundled modules. C++ and Java are proven end to end.

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

### C# — .NET NativeAOT (`NativeLib=Shared`)
- **Build**: a generated `.csproj` (`<PublishAot>true</PublishAot>`, `<NativeLib>Shared</NativeLib>`,
  size knobs: `InvariantGlobalization`, `StackTraceSupport=false`, `IlcOptimizationPreference=Size`),
  then `dotnet publish -c Release -r <rid> -p:NativeLib=Shared`. Output is a true native `.dll/.so/
  .dylib` with **no CLR shipped**.
- **Entry points**: `[UnmanagedCallersOnly(EntryPoint="ce_handler_dispatch", CallConvs=[CallConvCdecl])]`
  static methods; host callbacks via `delegate* unmanaged<…>` cached at init. **Blittable only** across
  the boundary — strings/arrays as (ptr,len); wrap every export body in `try/catch`→status (a managed
  exception escaping the boundary crashes the host).
- **Constraints**: no `Reflection.Emit`/dynamic loading; `System.Text.Json` only via source-gen; the
  runtime self-inits on first call (we force it in `ce_handler_init`); **no unload**.
- **Cost**: **~1.5–4 MB** per module per platform (GC + runtime slice baked in — no sub-MB option);
  build seconds.
- **Toolchain at export**: .NET 9/10 SDK **+** a native toolchain (MSVC on Win, clang on Linux, Xcode
  on mac). **No cross-OS build.**

### Java — GraalVM native-image (`--shared`, isolates)
- **Build**: `native-image --shared -o ce_handlers_<panel>_java -cp handlers.jar com.ce.Handlers`,
  emitting the lib + `graal_isolate.h`. **No JVM shipped.**
- **Entry points**: `@CEntryPoint(name="ce_handler_dispatch")` static methods whose **first parameter
  is an `IsolateThread`**. The host calls `graal_create_isolate` once (on the message thread), threads
  the `IsolateThread` token through every call, and `graal_attach_thread` for any other calling thread.
  Host callbacks via `@CFunction`/`CFunctionPointer`.
- **Constraints (the real ones)**: **closed-world** — the handler must be fully reachable at build
  time; any reflection needs reachability metadata captured at export. Disable the SVM segfault handler
  for a library so it doesn't fight the DAW's crash handler.
- **Cost**: **~8–15 MB** per module; **build 30 s–5 min and 8–16 GB RAM** — *every export re-runs
  native-image* because the user's code is baked in. This is the dominant UX cost.
- **Toolchain at export**: GraalVM/Liberica NIK JDK 21+ with `native-image` **+** a per-OS C toolchain.
  **No cross-OS build.**

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
3. **C# second** — reuses the same host engine + ABI unchanged; adds a `.csproj` generator + the
   `dotnet publish` step + the .NET SDK preflight. Accept the multi-MB size + per-OS build.
4. **Java last, gated on a decision** — same host engine, but adds GraalVM as an export dependency with
   **minutes-long, 8–16 GB builds every export** and a ~8–15 MB module. This is a real burden; see §9.

Per-platform build machines are mandatory for C#/Java (no cross-OS AOT). C++ also can't cross-OS but
already lives within the existing per-OS plugin build.

## 9. Open decisions for the user

- **Java worth it?** GraalVM adds a heavy export dependency (minutes + 8–16 GB RAM per export, ~8–15 MB
  per module, closed-world reflection limits). If few users write Java handlers, the cost/benefit is
  poor. Option: ship C++ + C#, leave Java as preview-only with an honest label.
- **Crash-safety appetite.** Accept best-effort (catch + disable + warn) and ship the disclaimer, or
  invest in out-of-process isolation (large, out of current scope)?
- **Build-time UX.** C#/Java AOT make export noticeably slower; acceptable, or gate them behind an
  explicit "compile native handlers" toggle (like `embedPython`) so the default export stays fast?
- **One module per panel** (recommended: fewer loads, shared glue) **vs per script** (independent
  unload — moot for C# which can't unload anyway).
