# Live plug-in process isolation

## Status

This is the as-built source architecture for the strongest interpretation of Automatic Failover:
a native VST fault, deadlock or process termination must not terminate Hostage or stop the
unaffected parts of a performance.

`GuardedPluginProcessor` remains the rack's final failure edge and fallback layer. The normal
product path now places vendor code behind `IsolatedPluginProxy`, so access violations, heap
corruption and blocked callbacks occur in a disposable worker. The guard catches the proxy's
reported worker failure, silences/restores dry audio, and lets `InstrumentHostService` recreate
the processor from the last captured state.

The worker, proxy and process fixtures described here are implemented and verified in a native
Windows Release build. The opt-in `CEditorPluginWorkerRealVstSmoke` target turns the representative
real-VST run into one repeatable scanner/worker command; its instrument/effect gate passed on
2026-09-03 with Spire and Transfigure.

## Non-negotiable behavior

1. Third-party processor code runs only in a worker process when isolation is enabled.
2. A separate worker owns each live plug-in instance. One bad instance therefore has an exact
   identity and cannot take a second vendor instance down with it.
3. Hostage's audio callback never waits without a deadline. If the worker misses the deadline,
   an instrument returns silence and an effect returns its dry input for that block.
4. A process exit, broken connection or bounded run of missed deadlines creates the same
   `ProcessorFailure` edge already consumed by `InstrumentHostService`.
   Control-thread liveness polling also finds a process that dies while transport is stopped.
5. The existing retry policy owns re-instantiation, state restore and exponential backoff. The
   transport, rack and other workers continue while one target recovers.
6. Isolation adds one explicit processing block of latency. The proxy reports that latency so
   the graph/outer host can compensate it; it must never hide a variable blocking delay.
7. Worker launch failure is visible. The product never silently falls back to loading the same
   third-party module into Hostage after isolation failed.

## Process topology

```text
Hostage process                         one worker per plug-in instance

InstrumentRackHost
  └─ IsolatedPluginProxy  control IPC ── PluginWorker
       ├─ input block N   audio/MIDI ───►  real AudioPluginInstance
       ├─ output N-1      ◄─────────────   process block N
       └─ failure edge    sequence/process exit
```

The existing short-lived `CEditorPluginScanner` remains scan-only. Live workers have a
different protocol, lifetime and security boundary and must use a separate executable
(`CEditorPluginWorker`). Reusing the scanner would make both contracts harder to diagnose.

## Data plane

Use two preallocated shared-memory slots in each direction. A slot header contains:

- protocol version and worker generation;
- monotonically increasing block sequence;
- sample count and negotiated active channel counts;
- transport position needed by `AudioPlayHead`;
- byte ranges for audio, MIDI and returned parameter changes;
- completion sequence and an error/status code.

The proxy publishes input block N and immediately returns output block N-1. The worker wakes,
processes N and publishes it into the other slot. This fixed pipeline is what makes the audio
thread bounded. Named events/semaphores wake each side; sockets or JUCE child-process messages
are control-plane only and never carry audio blocks. Sequence and status publication uses
lock-free atomics inside the mapping, so checking whether a worker still owns a slot cannot race
with the worker completing it.

The mapping may reserve more channels than an instance uses, but every block carries the
plug-in's negotiated active counts. Optional sidechains and auxiliary outputs are not enabled by
the worker merely because capacity exists; mono and MIDI-only processors therefore receive their
real topology rather than a synthetic stereo buffer.

All shared and audio scratch buffers are allocated during prepare. The callback performs bounded
copies and atomic/event operations only: no JSON, message-thread locks, process launch, state
serialization or IPC connection setup. Returned MIDI is decoded into JUCE's callback buffer, whose
storage policy remains the surrounding graph's responsibility.

## Control plane

Versioned binary messages cover:

- create from the catalogue's serialized `PluginDescription`;
- prepare/release/reset;
- complete parameter metadata, plug-in-owned text formatting/parsing and value updates;
- get/set opaque plug-in state;
- program names/changes and non-realtime mode;
- initial latency/tail metadata;
- editor open/close through a worker-owned top-level window;
- ping, orderly shutdown and structured diagnostics.

Every request has a generation and request id. Replies from a worker generation that has already
failed are ignored, matching the rack's existing load-generation rule.
Frames are read and written to completion across partial named-pipe transfers under one overall
deadline, so multi-kilobyte and megabyte state blobs are not mistaken for disconnections.

## State and failover

The stable state remains owned by the Hostage process. A healthy worker may refresh it on the
message thread; a failed worker is never queried. On failure:

1. the proxy switches immediately to silence/dry pass-through;
2. the service records the incident and retry time;
3. the old process and shared-memory generation are abandoned;
4. a fresh worker is launched and prepared off the active graph;
5. the last good state and current parameter values are restored;
6. the normal generation-ticket commit replaces the failed proxy;
7. the recovered processor returns through the existing mixer path.

Repeated crashes obey today's capped exponential backoff and manual Retry control. One transient
late block uses the declared dry/silent fallback. If the worker falls more than one full block
behind, the proxy fails it before either shared-memory slot could be reused while the worker still
owns it; the rack's controlling thread then terminates that worker even when automatic retry is
disabled, and replaces it when retry is enabled.

## Native editor boundary

An editor window belongs to the worker process, and it appears INSIDE Hostage's window: the
worker creates it as a child window of whichever Hostage window the editor is shown in — the
pane's, or a floating editor window's — with `CreateWindowEx` and a parent in another process,
which Windows allows and which is how WebView2 sits in the same window. On the Hostage side the
`AudioProcessorEditor` the proxy hands out is the component that child covers; it keeps the
child positioned over itself (the arithmetic `juce::HWNDComponent` uses, without
`HWNDComponent` itself, whose destructor destroys and reparents the window it hosts) and polls
the worker for the editor's size so a vendor GUI that resizes itself is followed. Creation and
destruction are the worker's; position is Hostage's. The Hostage parameter editor continues to
work through mirrored parameter metadata even when a vendor editor cannot be shown.

Two earlier shapes are recorded here so they are not tried again:

- A worker-owned **top-level** window, with Hostage showing a placeholder. The window opened
  behind Hostage every time, because a background process may not take the foreground; the
  placeholder was centred over the very window it announced.
- The same, with Hostage granting the foreground (`AllowSetForegroundWindow`) and then making
  the window an **owned** window of its own (`GWLP_HWNDPARENT`). Still behind. The click that
  starts it lands in WebView2, a separate process, so Hostage is not reliably the foreground
  process when it acts, and neither measure took.

A child window has none of these problems by construction, and the earlier note's concern —
that cross-process embedding is fragile across plug-in toolkits and DPI modes — is the right
one to watch for per plug-in, not a reason to leave every editor behind the host.

## Delivery slices

1. **Protocol tests:** serialization, version refusal and request/generation handling with no
   VST loaded. **Control-envelope source and tests are present** in
   `PluginWorkerProtocol.h` / `PluginWorkerProtocolTests.cpp`, including partial-transfer tests
   with a state frame larger than the operating-system pipe buffer. The fixed double-buffer layout,
   bounds, sequence fence and MIDI wire codec are present in `PluginWorkerDataPlane.h` /
   `PluginWorkerDataPlaneTests.cpp`. `PluginWorkerSharedMemory` owns the Windows named mapping
   and its two auto-reset wake events; the host side never needs to block on either event.
   `PluginWorkerBlockBridge` implements the proxy's fixed one-block pipeline, exact-sequence
   acceptance, dry/silent fallback and bounded missed-block failure edge.
2. **Crashable stub worker:** proxy passes audio/MIDI and detects exit, disconnect and hang;
   unaffected rack paths continue. **Source fixture and end-to-end Windows test are present** in
   `PluginWorkerCrashStubMain.cpp` / `PluginWorkerIsolationTests.cpp`.
3. **Real VST worker:** `PluginWorkerMain.cpp` owns instantiate, prepare, float/double processing,
   state, transport and parameter mirroring in the child process. The default-off
   `PluginWorkerRealVstSmokeMain.cpp` acceptance harness asks the existing scanner process for an
   opaque description, launches the shipping proxy, prepares at 48 kHz / 256 samples, sends twelve
   audio blocks plus note-on/off when supported, retrieves/restores state and verifies worker
   liveness. Its own target explicitly compiles with `JUCE_PLUGINHOST_VST3=0`, so it cannot become
   an accidental second place that loads vendor code. **Release-verified with a real instrument
   and effect.**
4. **Rack integration:** editor and generated runtimes use `makeIsolatedPluginInstantiator`;
   `PluginWorkerIsolationTests` commits a crashable proxy beside a healthy rack part, and the
   existing service owns retry/state restore. **Present in source.**
5. **Editor compatibility:** the proxy mirrors parameters for the generic editor and asks the
   worker to own/show the vendor's top-level window. **Present in source.**
6. **Field hardening:** orphan cleanup is present: an independent worker watchdog terminates the
   process when its Hostage parent disappears, even if vendor code has wedged the audio or message
   thread. Each worker also joins a host-owned Windows Job Object before vendor code loads; the
   job closes the worker tree with Hostage, suppresses unhandled-fault dialogs and caps one
   plug-in's tree at 64 processes. CPU and memory are deliberately not throttled because real-time
   DSP and large sample players require burst CPU and large address spaces. Hostage also writes a
   host-side JSON-lines trail for launches, completed handshakes,
   control-channel failures, exits and forced termination. It is interprocess-serialised, rotates
   current/previous windows at 512 KiB, carries no opaque plug-in state or parameter values, and
   those two exact files are allowlisted in the reviewed support bundle. An unhandled-exception
   reporter is installed before vendor construction and restored again if a constructor replaces
   it. DbgHelp writes a stack/module minidump without full-process memory into one of eight fixed
   ring slots. Dumps are visible-but-excluded in support preview and require their own explicit,
   warned opt-in. The access-violation fixture checks the actual `MDMP` signature. A bounded soak
   fixture also drives 12 consecutive round trips at each representative block size from 16 through
   8192 samples, repeatedly reusing both shared-memory slots. Optimized Release workers emit a full
   linker PDB without embedding the developer's absolute build path; packaging hashes the worker/PDB
   pair into a private, content-addressed archive that is never part of the installer. At launch the
   host hashes the exact worker executable and passes that identity through the handshake into both
   the dump's comment stream and a fixed-slot JSON sidecar, so support can select the archive without
   guessing from a version number. The sidecar is exported only with its explicitly selected dump.
   Long-duration performance tests remain release hardening; the bounded Windows acceptance and
   representative real-VST binary gate are complete.

## Acceptance tests

- A stub instrument process exits during `processBlock`: only that part becomes silent, the
  worker is recreated, saved state returns, and playback elsewhere never stops.
- A stub effect exits: the affected path becomes dry until recovery.
- A worker deliberately blocks forever: the audio callback remains bounded and the proxy fails
  it before an in-use shared-memory slot can be overwritten; the control side terminates it.
- An unhandled access violation writes one bounded-ring Windows minidump, then only the affected
  worker exits. A default support bundle excludes it; an explicit dump opt-in carries it byte-for-byte
  with a worker-hash sidecar that `resolve-worker-symbols.mjs` verifies against the private PDB archive.
- A late reply from the dead generation cannot replace or alter the recovered instance.
- Parameter automation, MIDI, state round-trip and transport position match the in-process
  processor within the declared one-block latency.
- One live worker survives repeated processing after re-prepare at 16, 64, 128, 256, 512, 1024,
  2048, 4096 and 8192 samples without growing or replacing its fixed shared-memory mapping.
- Worker launch failure is visible and retryable; it never silently falls back to loading the
  plug-in into Hostage.
- Closing Hostage terminates every worker and leaves no named IPC resources behind.

## Completion gate

Automatic Failover's native completion gate passed on 2026-09-03: all 31 CTest executables passed,
including the crashable worker/isolation fixtures, and the strict runner passed with the installed
Spire instrument and Transfigure effect. Both processed twelve 48 kHz / 256-sample blocks in their
own workers and restored captured state successfully.

The real-VST half is deliberately opt-in and absent from CTest because installed plug-ins may
need licences or first-run interaction. To repeat the completed gate, configure and build the
explicit target, then require one real instrument and one real effect through the strict read-only
runner:

```powershell
cmake -S . -B build/native -DCEDITOR_REAL_VST_SMOKE=ON
cmake --build build/native --config Release --target CEditorPluginWorkerRealVstSmoke
.\tools\scripts\run-real-vst-acceptance.ps1 `
    -InstrumentVst3 "C:\Program Files\Common Files\VST3\A-Representative-Instrument.vst3" `
    -EffectVst3 "C:\Program Files\Common Files\VST3\A-Representative-Effect.vst3"
```

The runner only locates the three already-built executables in the selected configuration; it
never configures or rebuilds. It rejects missing/ambiguous binaries, a handshake-only result, or
an instrument supplied in the effect slot. For a multi-class bundle, pass `-InstrumentClass` or
`-EffectClass` with an exact class name/`ceId`. Each child run ends with
`SMOKE_RESULT {"ok":true,...}` and the complete gate ends with
`REAL_VST_ACCEPTANCE {"ok":true,...}`. Failure returns a non-zero exit code and the harness retains
its uniquely named temporary workspace so the bounded diagnostics/minidumps remain inspectable.
