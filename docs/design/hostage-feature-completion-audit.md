# Hostage feature-list completion audit

This is the requirement-by-requirement audit of the 36 additions requested for Hostage. It is
an index into the implementation, not a substitute for the tests it names. The status describes
the current source tree and its verified Release binaries. The native rebuild, complete CTest
run and representative real-VST3 acceptance were completed on 2026-09-03.

## Evidence standard

A feature counts as implemented in source only when the tree contains all four relevant layers:

1. persistent model or deliberately transient runtime state;
2. native execution through the real rack/performance service;
3. a bridge command and usable Hostage UI;
4. focused behavioral tests, including persistence where the feature owns saved state.

Browser-preview behavior is useful UI evidence but does not prove the C++ audio path. Conversely,
a native engine class without a reachable UI is not a finished product feature.

## The 36 requested additions

| # | Requested feature | Authoritative implementation | User surface | Focused native evidence | Source verdict |
|---:|---|---|---|---|---|
| 1 | MIDI Looper | `InstrumentHostService::{start,finish,remove}MidiLoop`; private loop patterns and overdub passes in `PatternModel` | Performance → Capture & Loops | `InstrumentHostServiceTests::testPerformanceSystem` | Implemented |
| 2 | Retrospective MIDI Capture | lock-free, always-listening `MidiCaptureJournal` (120 seconds / 32,768 events); `captureRecentMidi` makes an ordinary editable pattern and clip | Performance → Capture & Loops | `PerformanceEngineTests::testRetrospectiveMidiJournal`; service capture assertions in `testPerformanceSystem` | Implemented |
| 3 | Gesture Recorder | `recordGestureValue`, gesture take/replace/overdub paths and gliding parameter lanes in `InstrumentHostService` | Performance → Capture & Loops | gesture sections of `InstrumentHostServiceTests::testPerformanceSystem` | Implemented |
| 4 | Parameter Locks | linked hidden parameter/CC lanes in `PatternModel`, compiled by the normal scheduler and resolved by exact target identity | per-step Lock inspector in Performance | `PerformanceEngineTests::testParameterLanesAndGlide`; lock section of `InstrumentHostServiceTests::testPerformanceSystem` | Implemented for VST parameters and hardware CC |
| 5 | Modulation Matrix | persisted `ModulationRoute` graph; source accumulation and normalized destination writes in `InstrumentHostService` | Performance → Matrix | `InstrumentHostServiceTests::testModulationMatrix` | Implemented |
| 6 | MIDI LFOs | `MidiLfo`/`MidiLfoOutput`; tempo/free phase, matrix output, and direct CC, 14-bit NRPN and templated SysEx output | Performance → LFOs | `RackModelTests::testRoundTrip`; `InstrumentHostServiceTests::testMidiLfos` | Implemented |
| 7 | Envelope Generators | `EnvelopeGenerator` host-level ADSR sources with channel/key filtering, retriggering, velocity response and manual gate | Performance → Envelopes | `InstrumentHostServiceTests::testEnvelopeGenerators`; retrospective gate assertions in `PerformanceEngineTests` | Implemented |
| 8 | MSEG Designer | persisted, curved 2–64 point `MsegGenerator`, tempo/free phase and matrix source | Performance → MSEG | `RackModelTests::{testRoundTrip,testValidation}`; `InstrumentHostServiceTests::testMsegDesigner` | Implemented |
| 9 | Random / Probability Modulators | deterministic `RandomModulator` sample-and-hold, smoothed random, chaos and bounded random walk with probability and seeded restart | Performance → Random | `RackModelTests::{testRoundTrip,testValidation}`; `InstrumentHostServiceTests::testRandomProbabilityModulators` | Implemented |
| 10 | Smart Chorder | scale-aware `MidiFxChain` chord expansion with inversions, voicing modes, key maps and nearest-motion voice leading | MIDI chain → Chorder | Smart Chorder sections of `PerformanceEngineTests::testMidiFxChain` and `InstrumentHostServiceTests::testMidiChainCommands` | Implemented |
| 11 | Strummer | `StrummerEngine` orders ascending, descending, alternate, outside-in, inside-out and random strokes with timing curve and velocity ramp | MIDI chain → Strummer | Strummer sections of `PerformanceEngineTests::testNoteModules` and `InstrumentHostServiceTests::testMidiChainCommands` | Implemented |
| 12 | Note Echo / MIDI Delay | `EchoEngine` schedules bounded repeats with step time, feedback velocity and pitch movement | MIDI chain → Echo | echo sections of `PerformanceEngineTests::testNoteModules` | Implemented |
| 13 | Scale / Key Engine | `MidiFxChain` named scales, force-to-scale processing, root selection and shared diatonic helpers | MIDI chain → Scale | `PerformanceEngineTests::testScalesAndSerialization` | Implemented |
| 14 | Microtuning Manager | `.scl` parser, repeating tuning model, MTS bulk messages and opt-in delivery to software or hardware parts | Performance → Tuning | `PerformanceEngineTests::testMicrotuning`; `InstrumentHostServiceTests::testMicrotuningManager`; `RackHostTests::testConfigurationMidiDelivery` | Implemented |
| 15 | MPE Transformer | `MpeTransformer` converts MPE, poly pressure, channel pressure and CC expression with voice allocation/collapse rules | MIDI chain → MPE | `PerformanceEngineTests::testMpeTransformer`; service chain assertions | Implemented |
| 16 | Velocity / Expression Designer | factory/custom response curves, input/output ranges and per-device profile name in `MidiFxChain` | MIDI chain → Velocity | velocity/expression sections of `PerformanceEngineTests::testMidiFxChain` and service commands | Implemented |
| 17 | Articulation Manager | `ArticulationManager` consumes trigger notes and emits keyswitches, bank/program changes or CC actions outside the musical transform chain | MIDI chain → Articulation | `PerformanceEngineTests::testArticulationManager`; service serialization/command assertions | Implemented |
| 18 | Pattern Variations | deterministic editable A/B/C/D generation in `makePatternVariation`, with reminted lane ids and lock links | Performance → Patterns | variation section of `PerformanceEngineTests::testScalesAndSerialization`; `InstrumentHostServiceTests::testPerformanceSystem` | Implemented |
| 19 | Fill System | `PerformanceEngine` held-fill pattern switching with quantization and optional pedal CC/channel | Performance → Clips / Stage | `PerformanceEngineTests::testHeldFillSystem`; service fill assertions | Implemented |
| 20 | Follow Actions | `CompiledClip::FollowAction` clip, next, previous, random, stop and one-shot transitions after a bounded loop count | Performance → Clips | `PerformanceEngineTests::testFollowActions` | Implemented |
| 21 | Song / Scene Arranger | ordered scene blocks with bar lengths, looping, start-from-item and live progress in `InstrumentHostService` | Performance → Arrange | arrangement section of `InstrumentHostServiceTests::testPerformanceSystem`; scene scheduling tests in `PerformanceEngineTests` | Implemented |
| 22 | MIDI Freeze / Bounce | `InstrumentHostService::freezeMidiClip` offline deterministic rendering through each target part's MIDI inserts into an editable post-FX clip | Performance → Capture & Loops | `PerformanceEngineTests::testFrozenMidiUsesPostFxStaging`; freeze section of `InstrumentHostServiceTests::testPerformanceSystem` | Implemented |
| 23 | Preset Audition Engine | persisted `PresetAuditionSettings` single/chord/scale/riff recipe; native timed phrase starts only after a library preset commits | Library audition controls | audition sections of `InstrumentHostServiceTests::{testPerformanceSystem,testLibrary}` | Implemented |
| 24 | Sound Comparison Mode | bounded 20-preset `SoundComparisonRuntime` reversible session, previous/next audition, keep or exact original-state restore | Library comparison strip | sound-comparison section of `InstrumentHostServiceTests::testLibrary` | Implemented |
| 25 | Layer Voice Allocation | central `LayerRouter` all/round-robin/least-busy assignment with note-off ownership | Layers panel | `RackHostTests::testLayerVoiceAllocationAndCrossfade`; `InstrumentHostServiceTests::testLayerGroupCommands` | Implemented |
| 26 | Dynamic Layering | `LayerRouter` velocity, key range, arbitrary CC, expression and macro sources with per-member ranges | Layers panel | same layer-router tests | Implemented |
| 27 | Crossfading Layers | `LayerRouter` continuous CC/expression/macro sources drive ramped audio gain per member, rather than only altering future note velocity | Layers panel | continuous morph section of `RackHostTests::testLayerVoiceAllocationAndCrossfade` | Implemented |
| 28 | Smart Transpose | chromatic or diatonic scale-step transposition in `MidiFxChain` | MIDI chain → Transpose | smart-transpose section of `PerformanceEngineTests::testMidiFxChain` | Implemented |
| 29 | Humanizer | deterministic `HumanizeEngine` timing, velocity and played-gate variation with chord preservation and beat protection | MIDI chain → Humanizer | humanizer sections of `PerformanceEngineTests::testNoteModules` and service commands | Implemented |
| 30 | Groove Templates | `GrooveTemplate::factoryTemplates` supplies three authored MPC-style feels plus imported timing/velocity templates committed into editable steps | Performance → Patterns | groove sections of `PerformanceEngineTests::testScalesAndSerialization` and `InstrumentHostServiceTests::testPerformanceSystem` | Implemented |
| 31 | Snapshot Automation | scenes capture complete mixer/macro/parameter states; `tickSceneMorph` interpolates continuous targets while switching booleans on the launch edge; arrangements sequence scenes | Performance → Scenes / Arrange | scene/morph sections of `InstrumentHostServiceTests::testPerformanceSystem` | Implemented |
| 32 | Performance Recorder | one sample-relative `PerformanceTake` timeline combines universal-inlet MIDI with replay-safe parameter, controller, scene, transport and setlist actions; starting rack state is embedded in the take | Performance → Capture & Loops | `RackModelTests::testPerformanceTakes`; `InstrumentHostServiceTests::testWholePerformanceRecorderAndReplay` | Implemented |
| 33 | Instant Performance Replay | `InstrumentHostService::startPerformanceReplay` restores the take's starting rig, schedules MIDI sample-accurately at the universal inlet, replays control actions and exposes progress/cancel/degraded state | Performance → Capture & Loops | `PerformanceEngineTests::testPerformanceReplayMidi`; `InstrumentHostServiceTests::testWholePerformanceRecorderAndReplay` | Implemented |
| 34 | Setlist Engine | persisted `Setlist` items carry rack capture or scene, notes, tempo and CTRL49 page; Prev/Next/Go apply them through the normal restore and page handshake | Performance → Setlist / Stage | setlist sections of `InstrumentHostServiceTests::{testPerformanceSystem,testLibrary}`; page handshake in `testPerformanceSystem` and `Ctrl49ReducerTests` | Implemented |
| 35 | Plug-in Preloading | `refreshSetlistPreloads` instantiates and prepares the next 0–2 full-rack setlist captures off the active graph, reports readiness, and transfers exact warm processors into the normal commit path | Performance → Setlist preload policy/status | warm-rack section of `InstrumentHostServiceTests::testLibrary` | Implemented and Release-verified |
| 36 | Automatic Failover | one `CEditorPluginWorker` per live plug-in, `IsolatedPluginProxy` one-block bounded audio/MIDI bridge with negotiated active buses, exact-framed state/control IPC, mirrored parameters/programs, worker-owned vendor window, dry/silent fallback, control-thread termination, a host-owned bounded Windows Job Object, structured diagnostics, eight-slot privacy-gated minidumps with exact worker-hash sidecars, private content-addressed Release-symbol retention, and `InstrumentHostService` retry with captured state/backoff | Reliability → Live plug-in failover | protocol large-state framing, data-plane and block-bridge channel-shape suites; Windows `PluginWorkerIsolationTests` crash/hang/access-violation/minidump/build-fingerprint/program/sidechain-instrument/job-handshake plus 16–8192-sample repeated-slot fixture; opt-in `CEditorPluginWorkerRealVstSmoke` scanner/worker/audio/MIDI/state harness; service failover, diagnostic/support-bundle privacy and symbol-archive packaging tests | Implemented and Release-verified with real instrument/effect |

## Browser evidence

`CE/web/test/instrumentHost.test.js` exercises the user-facing state and mock command path for
every feature family above, including the complete MIDI-chain processors, captures, loops,
gestures, variations, fills, arranger, freeze, layers, modulation sources, tuning, recorder,
replay, setlist and failover policy. `stageLock.test.js` separately proves that performance-safe
commands remain reachable on stage while construction commands are denied.

The last full run completed 4,322 Node tests (4,320 passed, 2 skipped), the script-export suite
completed 7 with 0 failures and 2 skips, and the Vite production bundle completed. A subsequent
169-test focused Hostage/source/packaging run also passed. A rendered 1280 × 720
browser pass populated and inspected Patterns, Looper, Gestures, Recorder, Matrix, LFO, Envelope,
MSEG, Random, Tuning, Clips/Scenes, Arranger, Setlist, all requested MIDI-chain processors, Layers,
Preset Audition, Sound Comparison, Health and Stage. These checks cover browser and
source-structure code only.

## Native verification

The 2026-09-03 Release build completed for all targets. CTest completed all 31 native test
executables with 0 failures. The opt-in isolation runner then completed its scanner, worker,
audio/MIDI, liveness and state round-trip checks with both installed plug-in categories:

- instrument: Reveal Sound Spire, 0 inputs / 2 outputs, 12 blocks, 5,317 state bytes restored;
- effect: Transfigure, 2 inputs / 2 outputs, 12 blocks, 1,427 state bytes restored.

The runner ended with `REAL_VST_ACCEPTANCE {"ok":true,...}`. The accurate conclusion is:
**the complete 36-item UI/source pass is present and the native Release completion gate passes.**
