# Reliability, diagnostics and the support bundle

The §17 layer of the VIP-successor baseline, built after the seven functionality stages and
recorded here because §18.12 requires it: every stage handover must carry known limitations, a
compatibility matrix, updated diagnostics and support-bundle fields, and the architecture
decisions where implementation deviated from the plan. Those four were the ones nobody had
written down.

Verified against this tree at the commit that introduces this file, by reading the code. Per
this directory's convention, **when this record and the code disagree, the code is right.**

---

## Why this is not "Stage 8"

There is no Stage 8. §18 opens by saying the product is built in **seven coherent functionality
stages**, and goes out of its way to add that the Host Project boundary, the wrappers and the
installer path "are not an eighth feature stage". §18.11's dependency chain ends at Stage 7 and
§18.10 calls the seven stages "the product order".

What was genuinely outstanding was §17, which the stage sections lean on without owning:

- **§18.1 rule 8** — "Reliability is part of the feature. Scan isolation, clean shutdown,
  recovery, reconnect behavior and useful diagnostics are not optional polishing tasks added
  after the main implementation."
- **§18.3.3** — Stage 1's own reliability list, which included "offer safe startup without
  automatically reloading a suspected plug-in".
- **§18.12** — the handover contract, including the support-bundle fields.

Some of §17 was built as it went. The scanner has been isolated, timed out, dead-man marked and
quarantine-attributing since Stage 1 (§17.1); Stage 7 added the active-hosting marker (§18.9.8).
The rest is what this layer closed.

---

## What §17 asked for, and where each item now lives

| §17 requirement | Where | Since |
|---|---|---|
| Separate helper process, per-file timeout, crash/hang attribution, quarantine with reason | `PluginScannerCoordinator` | Stage 1 |
| Last-scanned marker / dead-man file | `PluginScannerCoordinator::markerFile` | Stage 1 |
| Re-scan changed binaries only | `PluginCatalog::needsRescan` + `fingerprintFor` | Stage 1 |
| Separate results per class in one module | `ModuleRecord::classes` | Stage 1 |
| Manual rescan / ignore | `clearQuarantine`, the Project panel | Stage 1 |
| **Architecture check** | `PluginCatalog::architecturesOf`, `hostArchitecture` | **here** |
| **Safe mode without third-party plug-ins** | `SafeMode::Level::noThirdParty` | **here** |
| Editor before instance destruction, generic fallback, load errors caught | `InstrumentRackHost`, `PluginEditorHost` | Stage 1–2 |
| **Validate architecture records before loading** | `ModuleRecord::unavailableReason` at both refusal sites | **here** |
| Last explicitly saved session | `session-performance.json` | Stage 1 |
| Rolling recovery snapshots | `session-revisions/` | Stage 5 |
| **Last-known-good snapshot** | `SessionRecovery::markKnownGood` | **here** |
| **Pending risky-operation marker** | `SessionRecovery::ScopedOperation` | **here** |
| **Plug-in state hashes** | `RackPart::stateBlobHash`, `EffectSlot::stateBlobHash` | **here** |
| **Safe recovery with the suspect disabled** | `SafeMode` + the degraded-restore report | **here** |
| **Identify the last operation** | `SessionRecovery::Report::lastOperation` | **here** |
| **Preserve the crashed state package** | `SessionRecovery::crashStateDirectory` | **here** |
| Hardware disconnect: stop sending, mark offline, no blocking reconnect | the CTRL49 broker and its watchdog | Stage 3 |
| Recoverable library rebuild, no destructive deletion on index | `Library`, `missing` as a flag | Stage 4 |
| WebView2: local content only, structured JSON, no arbitrary host objects | `ValueTreeBridge` | pre-existing |
| **Support bundle** | `SupportBundle` | **here** |

Two rows are deliberately *not* claimed. §17.5's "transactions, write-ahead logging, periodic
integrity check" describes a SQLite-shaped store; the catalogue and library are JSON documents
written whole through `replaceWithText`, which is atomic enough for a document of this size and
has no transaction log to keep. §17.3's "crash dumps where available" is not a minidump — what
this product preserves is the rack state that was live at an interruption, which is what a
diagnosis of *this* product needs. The bundle calls it that and not a crash dump.

---

## The four decisions worth arguing about

### An unsupported module is not a quarantined one

A 32-bit plug-in in a 64-bit host cannot load. The obvious implementation is to let the scanner
find that out — and it is wrong twice: it costs a process launch per module per pass, and the
failure that comes back is indistinguishable from a broken plug-in, so the module gets
quarantined for being the wrong shape.

The architecture is read from the file instead. A VST3 bundle names its slices in directories
(`Contents/x86_64-win`); a bare module names itself in its own binary header, and PE, ELF and
Mach-O are all recognised. Neither needs the module loaded, so the check lives in `juce_core`
and runs on every machine including the test container.

The result is a third state beside `missing` and `quarantined`: **unsupported**. It is not a
failure, so `failureCount` does not move and quarantine does not apply; there is nothing to
retry, so `needsRescan` returns false; and the module stays catalogued with its reason so
"why is my plug-in not in the list" has an answer somewhere.

The check runs *before* the fingerprint check, because a module that has not changed can still
become unloadable — what changed may be the host.

**Unknown reads as supported, from both sides.** An unrecognised binary header, and a host
build whose own architecture this code does not know, both fall through to "offer it and let it
fail honestly". Hiding a working plug-in because a header was unfamiliar is the worse failure.

### A recorded incident that changes nothing is a crash loop with a log file

Stage 7 built the active-hosting marker to satisfy §18.9.8, which gates active-process isolation
behind field crash data. It counted, and that is all it did — so a plug-in that crashed the host
while playing was counted and loaded again on the very next start.

An incident now also makes the module a **suspect**, and a suspect does not load until somebody
vouches for it. The two records stay separate on purpose: the incident count is the evidence a
decision about isolation would rest on, the suspect list is what keeps the product startable in
the meantime, and clearing one does not touch the other.

Safe mode is **sticky**. A safe mode that quietly reset itself on the next start would turn a
crash loop into a crash loop that also lied about it. The level is visible in the workspace and
the way out is explicit.

The degraded-restore report now has to distinguish *refused* from *missing*, because the repair
differs: one needs an installation, the other needs a click. Both look identical to the rack —
an unresolved slot — so the distinction lives in a note that names the modules and says which
applies.

### The last saved session is the crash

§17.3 lists "last explicitly saved session" and "rolling recovery snapshots" and then, as a
separate item, "last-known-good snapshot". It is easy to read the first two as covering
recovery. They do not:

- The last saved session is the state that was live when the process died. Recovering to it is
  recovering to the crash.
- The rolling revisions are minutes apart and say nothing about whether the rig in them ever ran.

A state becomes known-good when a **new run restores it cleanly** — everything resolved, nothing
refused, no damaged blob. That is the only available evidence that a state can be loaded at all;
a copy taken at save time would only assert that the bytes were written.

The run that *follows* an interruption is excluded. It is restoring the very state that was live
when the last one died, and promoting it there would quietly replace the offer with the thing
the user is being offered an escape from. A later run that starts cleanly promotes it — two
clean boots is evidence, one is the suspect state loading once.

### A support bundle gathered by denylist is a leak waiting to happen

§17.7's list of what a bundle may contain matters less than its one prohibition: *never silently
include licence files, unrelated documents, account tokens or complete user directories.*

A denylist cannot honour that. Whatever is named as forbidden, the next thing dropped into the
data directory is not on the list. So the bundle is gathered by **allowlist**: every entry is
named in `SupportBundle.cpp`, and a file nobody named does not travel. Adding one is a
deliberate edit.

State blobs are redacted by default. The bytes go; the **digest and the byte count stay**, so a
bundle says "part 2's state is 84 KB, hash abc" without shipping somebody's sound — and the
digest is the same one §17.3 checks, so a corruption question is answerable from the bundle
alone. The redactor walks the manifest rather than known key paths, because blobs live in parts,
in each part's insert chain, in the master chain and in every return chain.

The bundle records which choice was made, so "no blobs here" cannot be mistaken for "this rack
had none". And previewing writes nothing: "with user review" only means something if the review
happens before the file exists.

---

## Bridge and state contract

New commands on the one `instrumentHost` listener:

| Command | Payload | Effect |
|---|---|---|
| `setSafeMode` | `{ level }` — `normal`, `skipSuspects`, `noThirdParty` | Sets the level. Unrecognised reads as `normal`. |
| `clearSafeModeSuspect` | `{ modulePath }` | Vouches for one module. Drops `skipSuspects` back to `normal` when it was the last suspect; leaves `noThirdParty` alone. |
| `clearAllSafeModeSuspects` | — | Same, for all of them. |
| `acknowledgeRecovery` | — | Clears the interruption notice. Never the known-good offer. |
| `restoreLastKnownGood` | — | Restores the last rig known to boot, and saves it as the live session. |
| `previewSupportBundle` | `{ includeStateBlobs?, includeCrashStates?, includeLogs? }` | Answers `instrumentHostSupportBundle`. Writes nothing. |
| `exportSupportBundle` | the same, plus `{ path? }` | Writes the zip, then answers with `written` and `path`. |

New event: **`instrumentHostSupportBundle`** — `{ entries: [{ name, description, sizeBytes,
included, note }], includeStateBlobs, written?, path? }`. The same event carries the preview and
the export; a payload with no `written` is a preview, and the panel must not report a file that
does not exist.

New top-level block in `instrumentHostState`:

```
reliability: {
  safeMode:       { level, suspects: [{ modulePath, name, reason, incidents }] },
  refusedThisRun: [{ modulePath, name, reason }],
  recovery:       { interrupted, lastOperation, lastOperationDetail,
                    preservedStateFile, hasLastKnownGood, lastKnownGoodAt },
  damagedState:   [ "…" ],
}
```

Each module in `modules` gains `architectures` (a list) and `unavailableReason` (one sentence,
empty when the module is on offer).

---

## State and schema migrations

**None are required, and that is a decision rather than an omission.** Two additive fields
landed:

| Field | In | Absent means |
|---|---|---|
| `architectures` | the catalogue's module records | not yet read — treated as supported |
| `stateBlobHash` | every part and effect slot in a Performance | written before hashes existed — unchecked, never "damaged" |

Both have a safe absent reading, both are ignored by an older build reading a newer file, and
neither changes the meaning of any existing field. So `PluginCatalog`'s stored `version` stays
1 and `Performance::currentSchemaVersion` stays 2. Bumping a schema version for a purely
additive field would make every older session report a compatibility caveat it does not have.

New files in the per-user data directory:

| File | Written | Read |
|---|---|---|
| `safe-mode.json` | on every level or suspect change | at construction |
| `operation.marker` | around each plug-in load and each restore | once at startup, then deleted |
| `session-last-known-good.json` | after a clean restore of a clean rig | on `restoreLastKnownGood` |
| `crash-state/session-at-*.json` | at startup when a marker was found; pruned to 8 | by the support bundle |

---

## Controlled failure fixtures

§18.10 asks for controlled fixtures rather than waiting for the field to produce failures. The
ones for the risks this layer introduces are in the test sources, and each is a real artefact
rather than a mocked call:

| Risk | Fixture | Test |
|---|---|---|
| Scanner crash, hang, garbage output, reported error | `CE/tests/ScannerStubMain.cpp` — behaviour keyed off the module filename | `PluginScannerCoordinatorTests` |
| Wrong-architecture bundle | a real `Contents/<slice>` tree, deliberately named so the stub would *crash* if it were ever launched — so "no failure was counted" proves the worker was never reached | `PluginScannerCoordinatorTests::testArchitectureIsCheckedBeforeLaunching` |
| Wrong-architecture bare module | hand-written PE, ELF and Mach-O headers, plus a garbage one | `PluginCatalogTests::testArchitectureReading` |
| A plug-in live at an abnormal termination | a planted `active-hosting.marker` — which is exactly what the file looks like either way | `InstrumentHostServiceTests::testSafeStartup` |
| An interrupted run | a planted `operation.marker` plus an edited live session, so preserved-versus-known-good is a real distinction | `InstrumentHostServiceTests::testSessionRecovery` |
| A damaged state blob | a manifest whose `stateBlob` and `stateBlobHash` disagree | same |
| A licence file, a token and a stray document in the data directory | planted, then the exported zip is read back | `InstrumentHostServiceTests::testSupportBundle` |

---

## Compatibility matrix, as built

What has been proved, and by what. "Proved on Linux" means the container this repository is
developed in; the product's own platform is Windows.

| Capability | Proved by | Not proved here |
|---|---|---|
| Catalogue, scanner isolation, quarantine, architecture gating | `PluginCatalog`, `PluginScannerCoordinator` on Linux | a real 32-bit VST3 bundle |
| Rack model, routing, buses, macros, multi-output | `RackModel`, `RackHost` with stub processors on Linux | a real multi-output instrument |
| Parameters, control pages, surface runtime | `Ctrl49*` suites on Linux | a physical CTRL49 |
| Transport, patterns, clips, scenes, setlists | `PerformanceEngine` on Linux | a real MIDI clock master |
| Service commands, persistence, restore, recovery, safe startup, support bundle | `InstrumentHostService` on Linux | — |
| Web surfaces | 4,169 node tests + Playwright over `host.html` | WebView2 (the app uses it, the tests use Chromium) |
| App, player and plug-in link | — | Windows only: `dwmapi` |
| MSVC's opinion of the source | — | Windows only |
| DAW transport sync, host automation, multi-out buses | `Transport` and the processor unit-tested | a real DAW |
| Multi-instance hardware arbitration | the claim/heartbeat file, single-process | two real instances |

## Known limitations

These are true of the tree as it stands and are recorded so they are not mistaken for oversights.

- **A crash dump is not collected.** What is preserved is the rack state at an interruption. On
  Windows a real minidump would need an unhandled-exception filter and a symbol story; neither
  is built, and the bundle does not claim otherwise.
- **The architecture check reads three binary formats.** A module in a format none of them
  recognise reads as unknown, which means supported, which means it is offered and may fail at
  load. That is the deliberate direction to fail in.
- **Safe mode is per-install, not per-project.** The suspect list lives in the per-user data
  directory, so every instance and every project on that machine skips the same modules. For a
  plug-in that crashes the host this is right; for one that only misbehaves in a particular
  project it is blunter than it could be.
- **Vouching for a suspect does not reload it.** The module loads at the next restore. Making
  the click reload it would mean re-running a load transaction mid-session for a plug-in that
  has already taken the process down once.
- **`noThirdParty` is remembered across restarts** and can only be ended by the user. That is
  the point, and it does mean a forgotten safe mode looks like a rack that will not load
  anything. The header toggle turns red while it is on for exactly this reason.
- **The last-known-good is only as old as the last clean boot.** A long session with hours of
  edits and no restart has nothing newer to go back to than the state it started from. The
  rolling revisions cover "go back a bit"; the known-good covers "go back to something that
  definitely boots".
- **§17.5's database integrity story is not implemented as described**, because the store is not
  a database. See the note above the decisions.

---

## Manual test plan

Runs on Windows, against a build of the app or a generated product. Each step names what it
proves; a step that cannot be run is a gap to report rather than a step to skip.

1. **Architecture.** Install (or copy in) a 32-bit VST3 alongside the 64-bit ones and scan.
   *Expect:* the scan summary counts it under "wrong architecture"; it is absent from the
   instrument browser; the Health panel lists it with "built for x86, this host is x86_64"; the
   scan takes no longer than it did before it was there.
2. **Safe startup.** With a rack loaded and playing, kill the process (Task Manager → End task)
   while a plug-in is instantiating. Restart.
   *Expect:* the Health toggle is red; the level reads "Skipping plug-ins that crashed"; the
   suspect is named; the rack comes up with that part unresolved but keeping its name; the
   Product panel's restore report says it was refused, not that it is missing.
3. **Vouching.** Click "Load it again", then reopen the project.
   *Expect:* the level drops back to "Loading everything" if it was the last suspect, and the
   plug-in loads on the reopen.
4. **No third-party.** Set the level to "No third-party plug-ins at all" and restart.
   *Expect:* the rack, its parts, its routing and its patterns are all there; no plug-in loads;
   the toggle is red; setting the level back to normal and restarting loads everything.
5. **Recovery.** After step 2, before dismissing: click "Go back to the last rig that booted".
   *Expect:* the rack becomes the earlier one, and restarting keeps it — the recovery is not
   silently undone.
6. **Preserved state.** Check the data directory's `crash-state/`.
   *Expect:* one file per interruption, at most eight, each the rack as it was.
7. **Support bundle.** Put a file named `licence.key` in the data directory. Preview the bundle.
   *Expect:* the preview lists the manifest, the catalogue, the session and any crash states,
   and does not list `licence.key`. Export, open the zip.
   *Expect:* the same list; `session-performance.json` has empty `stateBlob` values with
   `stateBlobBytes` and `stateBlobHash` beside them; the manifest records
   `"stateBlobsIncluded": false`.
8. **Explicit inclusion.** Turn on "Include each plug-in's own saved state" and export again.
   *Expect:* the blobs are present, the manifest says so, and `licence.key` still is not.

## Demonstration

§18.12 asks each handover to include a demonstration exercising the complete user-visible
result. For this layer it is steps 2 → 3 → 5 → 7 run in order on one machine: crash the host
mid-load, watch the product come back up without the plug-in that killed it and say so, go back
to the rig that last booted, and hand somebody a bundle that describes all of it without
carrying anything it was not asked to carry.
