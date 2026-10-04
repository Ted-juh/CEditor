# Eight checkers run over the tree: four defects fixed, one audio-thread hazard measured

> Status: **review, 2026-10-02.** The fifth pass of the kind
> [`lint-and-accessibility-2026-10-01.md`](lint-and-accessibility-2026-10-01.md) made, and its
> continuation: yesterday's linter found three bugs no test reached, so this pass asked which other
> checkers would find things nobody here is looking at. Eight were run against the real tree, and two
> libraries were weighed for the one fix that needs one. Four
> defects are fixed with tests, one of them in vendored JUCE; one hazard on the audio thread is
> measured and left as a proposal;
> and the rest are declined with the number that decided each. Every licence and version was read
> from the package or the cloned source on the day.

## How these were chosen

The previous four passes searched for libraries that answer a gap in the program, and between them
name about three hundred repositories. A fifth list of that kind would mostly repeat them. What none
of them did is run the tools that check a program, and the tree has kinds of mistake that only a
checker sees: a lock on the audio thread, an object leaked on a failure path, a module no test ever
loads. `libraries-weighed-2026-10-01.md` had dropped clang-tidy for want of a compile database, and
`ninja -t compdb` produces one from the existing Linux app build without a reconfigure. Clang 20,
which carries RealtimeSanitizer, installs from the distribution's own archive here.

## The list

| Project | Licence | What it checks | Verdict |
| --- | --- | --- | --- |
| [RealtimeSanitizer](https://clang.llvm.org/docs/RealtimeSanitizer.html) (LLVM 20) | Apache-2.0 with LLVM exception | Allocation, locks and blocking calls inside code marked `[[clang::nonblocking]]` | **One hazard found** in the player plug-in's audio callback. Proposed fix below. |
| [choc](https://github.com/Tracktion/choc) `VariableSizeFIFO` | ISC | Not a checker: the lock-free queue that answers the finding above | **Recommended** for that fix, measured as a drop-in. |
| [farbot](https://github.com/hogliux/farbot) | MIT | The other real-time FIFO in the JUCE world | Read, not taken: fixed-size elements, and SysEx is not fixed-size. |
| [clang-tidy](https://clang.llvm.org/extra/clang-tidy/) 20 | Apache-2.0 with LLVM exception | Bug-shaped patterns and the static analyser, over 64 own `.cpp` files | **Two leaks fixed**, 39 other findings read and left. |
| [AddressSanitizer, LeakSanitizer and UBSan](https://github.com/google/sanitizers) | Apache-2.0 with LLVM exception | Memory errors, leaks and undefined behaviour while 33 of the 35 C++ test targets run | **A use-after-return in JUCE's MIDI-CI fixed** as vendored patch 5; one timing-bound test made robust; undefined behaviour in JUCE's bundled libFLAC recorded. |
| Node's built-in test coverage (or [c8](https://github.com/bcoe/c8)) | MIT | Which source the 5,600 web tests never execute | **Adopted** as `npm run test:coverage`, no dependency. |
| `npm audit` against the [GitHub Advisory Database](https://github.com/github/advisory-database) | CC-BY-4.0 data | Known advisories in the 230 installed packages | **Four fixed** inside their version ranges; none was shipped. |
| [svelte-check](https://github.com/sveltejs/language-tools) with `checkJs` | MIT | TypeScript's checker over the JavaScript | **One defect fixed**; declined as a gate at 34,590 reports. |
| [cppcheck](https://github.com/danmar/cppcheck) 2.13 | GPL-3.0 | Static analysis without a compile database | Declined: eight reports, all false. |
| [DawDreamer](https://github.com/DBraun/DawDreamer) 0.9.0 and [pedalboard](https://github.com/spotify/pedalboard) 0.9.25 | GPL-3.0, GPL-3.0 | Load an exported plug-in headlessly from Python | Declined: neither returns a plug-in's MIDI output, which is the only thing CEditor's plug-in produces. |

## RealtimeSanitizer: the player's audio callback takes a lock on every block

`PluginProcessor::processBlock` (`CE/src/Player/PluginProcessor.h`) is three calls. It pushes each
incoming host message into `HostMidiInputQueue`, drains `scriptMidiCollector` into the host's
buffer, and copies the playhead into atomics. The input queue was written for the audio thread and
says so: "the audio callback never allocates, locks or executes panel scripts". The output side is
JUCE's `MidiMessageCollector`, which was written for a MIDI input callback, and it guards its queue
with a `CriticalSection` that both sides take. The message thread holds that lock while it appends
script MIDI, and appending can allocate.

The harness (`tools/rtsan/playerScriptMidi.cpp`, with its build line) runs those first two calls
with the real classes inside a function marked `[[clang::nonblocking]]`, while a second thread
enqueues MIDI the way the panel does at `PluginProcessor.h:1337`. Two thousand blocks each:

| Traffic from the panel | Lock taken | Host buffer reallocated |
| --- | --- | --- |
| A CC every 200 µs | 2,000 of 2,000 blocks | 0 |
| A 140-byte SysEx every 200 µs | 2,000 of 2,000 blocks | 6 |

The reallocation is the host's `MidiBuffer` growing when a burst of SysEx is drained into it in one
block (`MidiMessageCollector::removeNextBlockOfMessages` adds everything it holds).

**What it costs is harder to state than that it happens.** Timed without the sanitizer, the drain
with 64-message SysEx bursts against the same with choc's FIFO (below), five alternating runs of
40,000 blocks each:

| | p99 | p99.9 |
| --- | --- | --- |
| `MidiMessageCollector` | 15.5–18.5 µs | 37–46 µs |
| choc `VariableSizeFIFO` | 6.0–6.7 µs | 27–29 µs |

Both variants also showed single blocks of 0.3–4.3 ms. Those come from this container's scheduler
under load, not from either design: they appear with the lock-free version too, and the thread here
is not real-time priority. So the measurement supports "a lock contended by the message thread
widens the tail about 2.5 times", and says nothing about how often a DAW at a 64-sample buffer
would drop out. The case for fixing it is the class of the hazard, which the sanitizer shows
directly: the audio thread can wait behind an allocation on the message thread. It is the panel
that sends a bank dump while the transport runs that will find it.

**The performance engine is clean**, which is worth recording because it is the larger body of
audio-thread code. Its own test suite, with all eight `processBlock` calls routed through a
`nonblocking` function, passes with one report: the replay injector growing a buffer the test had
not pre-sized. The rack's real caller reserves 256 KB for exactly that, with a comment saying why
(`RackProcessors.h:229-234`). One question was raised and not settled: that node ends each block
with `midi.swapWith (combined)`, and JUCE's graph hands a node the same 512-byte buffer every block
(`juce_AudioProcessorGraph.cpp:809-814`), so the reservation is on the host's side of the swap on
alternate blocks. A harness did not reproduce a reallocation, because JUCE grows the slot to fit
what arrives before the node runs; it would take the engine adding far more than it received.

### The proposed fix, measured

choc's `VariableSizeFIFO` (ISC, header-only, Tracktion, last commit 2026-08-16) is "a multiple
writer, single consumer FIFO which can store items as contiguous blocks of data with individual
sizes. Multiple write threads may have to briefly spin-wait for each other, but the reader thread is
not blocked by the activity of writers." That is the shape of script MIDI: SysEx of any length, written
from the message thread where scripts run, read by one audio thread. Its `popAllAvailable` lets the reader
stop when the next message would overflow a per-block byte budget and leave it for the next block,
which removes the reallocation as well as the lock.

As a drop-in in the same harness: **zero sanitizer reports** for both traffic patterns, and the
tail figures above. What the change would need in the player, not done here:

1. `scriptMidiCollector` becomes the FIFO, reset in `prepareToPlay` (and once in the constructor,
   as now), sized generously: a whole GAIA bank dump should fit.
2. The drain budget comes from the host buffer's size at `prepareToPlay`. A message larger than the
   budget is the one case that cannot wait; it should be let through alone rather than stall the
   queue.
3. Timing changes. `MidiMessageCollector` spreads messages across the block by when they were
   queued; a FIFO places them at one offset. Nothing in the player depends on the spread that a
   reading of `PluginProcessor.h` shows, but it is a behaviour change and belongs in the commit
   message.
4. The test is the harness above, pointed at the player's class instead of a copy of its three
   calls, run under `-fsanitize=realtime`.

farbot (MIT, Fabian Renn-Giles, last commit 2026-09-08) has the better-known real-time `fifo`, with
single or multiple producers chosen by template parameter. Its elements are a fixed type, so SysEx
would need fixed-size slots or a second buffer; choc's variable-size items fit without either.

## clang-tidy with a compile database: two leaks on malformed-dump paths

The compile database came from the existing app build (`ninja -t compdb`, 1,218 entries, 64 of
CEditor's own `.cpp` files after filtering). Checks: `bugprone-*` with the six noisiest style checks
removed, the static analyser's core, C++, dead-code and Unix groups, and three performance checks,
headers under `CE/src` included. Ten minutes on two cores; one file (`LuaScriptEngine.cpp`) did not
parse under clang, through sol2.

| Check | Findings | Read as |
| --- | --- | --- |
| `performance-unnecessary-copy-initialization` | 14 | Copies of `juce::var` and strings; none on a hot path |
| `bugprone-misplaced-widening-cast` | 8 | `(size_t) (a * b)` index arithmetic in ranges that cannot overflow |
| `bugprone-empty-catch` | 5 | Deliberate: best-effort shutdown and teardown of the plug-in worker and the CTRL49 session |
| `performance-move-const-arg` | 4 | Harmless |
| `misc-redundant-expression` | 3 | `i < clips.size() && i < 8` where the type is `std::array<…, 8>`, twice; `JUCE_WEB_BROWSER != 0` with the macro expanding to a constant |
| **`clang-analyzer-cplusplus.NewDeleteLeaks`** | **3** | **Two real**; one a lambda moved into a callback, which the analyser loses track of |
| `clang-analyzer-deadcode.DeadStores` | 2 | Initial values overwritten before use |
| `bugprone-signed-char-misuse`, `bugprone-unused-return-value` | 1 each | Intended sign extension; `unique_ptr::release` after handing ownership on |

The two leaks have the same shape. `DeviceProfileEngine::parseDumpWithDefinition` and
`ScriptRuntime::decodeDeclaredDump` each `new` a `juce::DynamicObject` for the decoded values, then
return early on a malformed dump before anything owns it. A reference-counted object that nothing
references is never freed. The device-profile decoder leaks on two paths (an unknown parameter, a
value its codec cannot decode), the script runtime's on six (an undeclared parameter, a field outside the
message, a text field running off the end or holding a byte outside printable ASCII, a 14-bit or a
nibbled value running off the end). Small per message,
and repeated for every malformed dump a device sends. Both now hold the object in a
`DynamicObject::Ptr` from the moment it is created.

The device-profile path was already reached by an existing test ("unsupported codec"). The script
runtime's was not; `ScriptRuntimeTests.cpp` now declares a layout with a text field and sends it a
name containing a control character. In a plain build that pins the refusal; in the sanitizer build
below it is what shows the leak.

## AddressSanitizer, LeakSanitizer and UBSan over the C++ tests

Every test target, configured as CI configures it (scripting on) and built with clang 20,
`-fsanitize=address,undefined -fno-sanitize-recover=undefined`: 346 build steps, 30 minutes on
three cores, because each target compiles its own JUCE modules. One object failed to build,
`LuaScriptEngine.cpp`, through sol2, the same file clang-tidy could not parse; so `ScriptRuntime` and
`PlayerScriptIntegration`, the two targets that link the scripting library, did not run. The
other 33 ran in 23 seconds.

| Target | Result |
| --- | --- |
| 31 targets | Clean: no memory error, no leak, no undefined behaviour |
| `DeviceProfileEngine` | A stack-use-after-return in JUCE's MIDI-CI code, and one assertion that failed only under the slowdown. Both fixed, below. |
| `InstrumentHostService` | Undefined behaviour in the libFLAC that JUCE bundles, at check 1,092 of 1,574. Recorded, below. |

**The JUCE defect.** CEditor's MIDI-CI session hands an incoming message to
`juce::midi_ci::Device`, which visits it with a `Visitor` built on the stack of
`LastListener::tryRespond` and destroyed when that returns. The reply to a property-exchange
capabilities inquiry starts a chain of further inquiries, ResourceList, then DeviceInfo, then
ChannelList, and the callbacks that continue the chain when each reply arrives captured `this`, the
visitor. AddressSanitizer caught the first of them reading `device` out of the dead frame
(`juce_CIDevice.cpp:833`), in the test that drives a full property exchange between two CEditor
MIDI-CI endpoints. It worked by luck: the slot still held the right pointer. The subscription
callback had the same capture. All four now capture the device pointer, which outlives them;
`JUCE/VENDORED.md` records it as the fifth local patch, and `vendoredJucePatches.test.js` pins it.
JUCE's `develop` still has the original code, so it is a third candidate for an upstream pull
request beside the two prepared on 2026-10-01.

**The test that only failed when slow.** "monitor throttle lost the final snapshot" ingests a
hundred SysEx messages, sleeps 100 ms, runs the pending timers and expects the throttled final
snapshot. Under AddressSanitizer it failed every time; given 1,000 ms it passed, so the throttle is
right and the wait was a guess about how quickly JUCE's timer thread marks a timer due. It now polls
for the snapshot, for up to two seconds, and still finishes the suite in half a second in a plain
build.

**libFLAC.** `stream_encoder.c:4133` adds an offset to a null pointer while encoding, reached by
the snapshot store's FLAC writer. It is third-party code inside JUCE's install, the arithmetic is
undefined rather than observed to misbehave, and the place for a fix is upstream libFLAC, then JUCE.
Not patched. Because UBSan was told not to recover, it also ended that suite at check 1,092 of
1,574, so the remaining third ran in the plain build only.

**The leak, confirmed.** With the device-profile fix from the clang-tidy section reverted and the
target rebuilt, LeakSanitizer reports 32 bytes in one allocation from `parseDumpWithDefinition`,
reached by the existing "unsupported codec" test; with the fix, nothing. The script runtime's leak
could not be confirmed this way, because its target is one of the two that did not build.

## Node's built-in test coverage: it would have pointed at yesterday's bugs

`node --test --experimental-test-coverage` needs no dependency; c8 is the same V8 coverage with
nicer reports and is not needed for this. Over the full suite, merging per file (the lcov output
repeats a module once per test process):

| | |
| --- | --- |
| Source files, excluding generated | 837 |
| Loaded by at least one test | 573 |
| Never loaded by any test | 266 (220 `.svelte`, 46 `.js`), 91,238 lines |
| Lines executed, of loaded files | 80.9% |
| Functions executed, of loaded files | 77.6% |

By directory, of loaded files: `models` 97.6%, `scripting` 94.6%, `utils` 94.5%, `stores` 78.9%,
`editor` 55.7%, `sections` 57.3%, `panels` 49.3%. The 220 Svelte components are covered by the
browser checks, which this does not measure.

The useful output is the ranking. The two least-covered stores of any size are `appSettings.js`
(27% of 1,109 lines, 13 of 53 functions) and `alignment.js` (39% of 768 lines, 25 of 56). Those are
two of the three files where yesterday's lint found a `ReferenceError` on a reachable line. Snap
to Grid sat in a never-called function in a file that was already the second-worst covered store.
Coverage does not find bugs; it says where nobody has looked, and here that was the right place.
`alignment.js` is the clearest case for a few more tests: its maths is pinned by
`panelArrange.test.js`, and the 31 selection wrappers that call the maths are not.

Adopted as `npm run test:coverage`, which prints the table. Not in CI; it ran in 11 minutes here
against about 4 for the plain suite, with other jobs on the machine.

## npm audit: four advisories, all fixable in range, none shipped

| Package | Path | Advisories | Shipped? |
| --- | --- | --- | --- |
| `devalue` 5.8.1 | `svelte` | Seven, three high, in `uneval`, `stringify` and parsing | No. Svelte uses it in `internal/server` only; the string `devalue` is not in `dist`. |
| `vite` 6.4.2 | direct, development | `server.fs.deny` bypass on Windows paths; NTLM hash disclosure via `launch-editor` UNC paths | No, but the owner runs the dev server on Windows. |
| `postcss` 8.5.15 | ESLint's Svelte plugin | Source-map path traversal | No. |
| `nanoid` 3.3.12 | through `postcss` | Generator loops on bad sizes | No. |

`npm audit fix`, without `--force`, moved all four inside their declared ranges (vite 6.4.3, devalue
5.9.4, postcss 8.5.28, nanoid 3.3.19): a lockfile-only change, after which both audits report zero.
The full suite and the build pass on it. The repeatable version of this is GitHub's Dependabot
alerts, which is a repository setting rather than a workflow and is the owner's to turn on.

## svelte-check with `checkJs`: one defect in 34,590 reports

`svelte-check` is already a development dependency with an `npm run check` script, and passes: 1,584
files, no errors, one warning. That is because `jsconfig.json` has `checkJs: false`, so the 800-odd
JavaScript files are parsed and not type-checked. Turning it on for one run:

| | |
| --- | --- |
| Errors | 34,590 in 930 files |
| `implicitly has an 'any' type` (parameters, variables, bindings) | 21,201 |
| `Property 'X' does not exist on type 'Y'` | 6,706 |
| `'X' is possibly 'null'` and similar | 1,938 |
| Node globals in browser checks and tools | 574 |

Thirty-five errors in application code name a concrete mistake: a wrong argument count, a "did you
mean", a comparison that can never be true. Thirty-four of them are the checker misreading untyped
JavaScript or not knowing a global (a parameter defaulting to a no-argument arrow is inferred to take
none; a JSDoc comment is read as code; `__APP_BUILD__` is Vite's). One is real: the Component Designer's right-click handler called
`selectLayer (name, part, event)` against `selectLayer (name, event = null)`, so the part landed
where the mouse event was expected and Ctrl- or Shift-right-click on an unselected part replaced the
selection instead of adding to it, unlike a left click. Fixed.

Declined as a gate: one defect among 34,590 reports is a ratio nobody keeps reading. ESLint's
`no-undef` already covers the class of bug that cost something yesterday. If the project ever moves
toward types, `checkJs` file by file with `// @ts-check` is the route, starting with `stores/`.

## Measured and declined

### DawDreamer and pedalboard: a headless host that cannot hear MIDI

Both load the exported GAIA VST3 on Linux from Python. DawDreamer took 15.7 s and listed all 206
host parameters with their ranges and value strings. Both then fail the only test that would be new:
automate a parameter and check the SysEx that comes out. DawDreamer's `save_midi` writes the input
it was given (one `start` message in this run); pedalboard's `process` returns audio only, "returning
audio" in its own documentation. CEditor's plug-in makes no sound. What they can do (load, enumerate,
save and restore state) pluginval and clap-validator already do in CI.

### cppcheck: what it says without the headers

Run over `CE/src` with warning and portability checks, in 27 seconds. Eight reports, all
`missingReturn` in `PythonScriptEngine.cpp`, all at functions ending in `Py_RETURN_NONE`, a macro
that returns, which cppcheck cannot see without Python's headers. Given JUCE's and Python's headers
it would see more and run far slower; clang-tidy with a real compile database already does that.

## Changes made under this review

- `CE/src/Scripting/ScriptRuntime.cpp`, `CE/src/DeviceProfile/DeviceProfileEngine.cpp`: the decoded
  values object is owned from creation, so a malformed dump no longer leaks it.
- `CE/tests/ScriptRuntimeTests.cpp`: a malformed and a clean dump through a text field.
- `CE/web/src/CE_Application/sections/CustomDesignSurfaceEditor.svelte`: the right-click handler
  passes the mouse event to `selectLayer`.
- `CE/web/package.json`: `npm run test:coverage`.
- `CE/web/package-lock.json`: four packages moved inside their ranges by `npm audit fix`.
- `JUCE/include/JUCE-8.0.7/modules/juce_midi_ci/ci/juce_CIDevice.cpp`: four callbacks capture the
  device rather than the temporary visitor. `JUCE/VENDORED.md` records it as patch 5, and
  `CE/web/test/vendoredJucePatches.test.js` pins it.
- `CE/tests/DeviceProfileEngineTests.cpp`: the monitor-throttle test polls instead of sleeping a
  fixed 100 ms.
- `tools/rtsan/`: the RealtimeSanitizer harness and a script that builds and runs it.
- `docs/known-issues.md`: the player's script-MIDI lock, with the proposal.

## How to repeat these

```bash
# clang-tidy, from an existing app build
ninja -C build/app -t compdb > /tmp/cdb.json   # then keep CE/src entries only
run-clang-tidy-20 -p <dir-with-filtered-cdb> -header-filter='/CE/src/' -checks='-*,bugprone-*,clang-analyzer-core.*,clang-analyzer-cplusplus.*,clang-analyzer-deadcode.*,clang-analyzer-unix.*'

# RealtimeSanitizer over the player's audio callback (clang 20 or later)
tools/rtsan/run.sh            # CC traffic
tools/rtsan/run.sh sysex      # SysEx bursts

# AddressSanitizer, LeakSanitizer and UBSan over the C++ tests
cmake -S . -B build/sanitize -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo \
      -DCMAKE_C_COMPILER=clang-20 -DCMAKE_CXX_COMPILER=clang++-20 -DCEDITOR_SCRIPTING=ON -DCEDITOR_DEV_MODE=OFF \
      "-DCMAKE_CXX_FLAGS=-fsanitize=address,undefined -fno-omit-frame-pointer -fno-sanitize-recover=undefined" \
      "-DCMAKE_C_FLAGS=-fsanitize=address,undefined -fno-omit-frame-pointer" \
      "-DCMAKE_EXE_LINKER_FLAGS=-fsanitize=address,undefined"
cmake --build build/sanitize -- -k 0
ASAN_OPTIONS=detect_leaks=1 ctest --test-dir build/sanitize --output-on-failure

# coverage
cd CE/web && npm run test:coverage

# advisories
cd CE/web && npm audit && npm audit --omit=dev
```

## What this pass could not check

Windows. RealtimeSanitizer and the sanitizers are Clang-on-Linux tools; the shipped player runs
under MSVC, where the closest equivalent is MSVC's AddressSanitizer and nothing for real-time
safety. The latency figures come from a shared container with no real-time scheduling.
`LuaScriptEngine.cpp` does not compile under clang 20 through sol2, so clang-tidy did not analyse it
and the two scripting test targets did not run under the sanitizers. And the last third of the
instrument-host suite ran in the plain build only, behind libFLAC's undefined behaviour.
