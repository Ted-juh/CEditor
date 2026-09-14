# Integration checkpoint — 14 September 2026

## Release continuation — current Windows checkpoint

The authorized ineffective-option set is now implemented on Windows main through `43d50bc4`:

- `Icon.tint` uses a real mask tint for valid non-white colours while the default/white/invalid
  cases retain the original full-colour image. Fit, opacity, transforms and effects remain intact.
- Container, Group, TabContainer and ScrollArea now carry the Mouse section they need.
  `interceptChildClicks=true` preserves existing child interaction; false routes the gesture to the
  parent and suppresses child runtime output.
- Behavior emission flags now gate their named script events without gating normal control,
  binding, link or device state. Slider change/commit are distinct; active-handle changes carry the
  previous and current handle. Bool toggles with `allowMixed` cycle off/on/mixed, expose
  `aria-checked="mixed"`, and do not invent a boolean device value.
- `looper.quantize`, `constellation.showField` and `meter.showScaleLabels` now change actual playback
  timing or rendered pixels and survive save/reopen. The published-verb audit no longer reports
  them.

The changes were split into isolated worktrees before editing, then cherry-picked without conflict.
Live Claude CLI coordination was attempted first, but its saved OAuth session returned 401; the
checked-in Claude assignment and design records therefore remained the lead specification. File
ownership was agreed before the isolated edits, and the one shared renderer file changed in
disjoint hunks.

### Current Windows evidence

- Full Node suite: **4,876/4,876 passed**, zero failures or skips.
- Script-export checks: **7 passed**, 2 environment skips (C# SDK and Java compiler absent).
- Frontend production build: passed.
- Eight directly affected browser ledgers: Lists 19, Mouse 42, Widgets 18, Motion 115, Steps 73,
  Outbound 53, Buttons 27 and Track 43 — **390 verified rows, zero defects**. These measure real
  pixels, gestures, runtime events and reopen persistence rather than property writes. The
  create/configure/bind/preview/share/reopen walkthrough also passed 17/17, and the focused
  first-use release workflow passed.
- Coverage scan: 59 of 1,046 declared properties unmatched by its textual heuristic, down from 68.
  The published-verb audit reports only four Drum Pads corner false positives whose readers use
  computed key names.
- Fresh native Release build from `43d50bc4`: **34/34 CTest tests passed**. The installer compiled,
  upgraded the Program Files copy with exit 0, and the installed editor and VST3 template match
  staging byte-for-byte. Installed editor SHA-256:
  `04AA9528DD9B5D10A7BB9FA2495D43B9C086CBBF4DE606FB1303396FD1545255`.
- Installed, compiler-free export produced a 61-parameter QA VST3 and a scripted two-parameter
  VST3 with regenerated manifests and distinct identities. Both passed the installed isolated
  scanner/worker: 64 blocks, state serialization/restore, worker alive. The scripted export emitted
  CC 20/21/22 with no window open. The generic Player and built standalone each started responsive
  with a WebView2 child process.

### Adversarial custom-component follow-up

The deterministic QA set now also includes `QA-09-custom-stress.cepanel`: fourteen deliberately
dense package-instantiated controls, including generated piano and modulation-matrix zones. Its
routed chain drives XY Pad `x` into Segment Meter `level`; a JavaScript value-change handler selects
a waveform, then a Lua handler mirrors meter changes into a vertical LED ladder.

- `npm run test:browser:custom`: **100 verified rows, zero defects** across the existing custom,
  export and new stress ledgers. The 17 stress rows measure painted parts and sampled colours, real
  dial/range/button/transport/keyboard/matrix/XY gestures, exact enum payloads, routed values,
  JavaScript and Lua logs and visible side effects, then repeat the script/link chain after a fresh
  save/reopen. The older custom ledger retains one explicitly unverified display-only classification;
  it is not a failure and the generated-zone interactions are covered by the stress ledger.
- The QA generator reproduces all nine committed sheets byte-for-byte. The frontend production
  build passes, as do **4,876 unit tests** and **34/34 native tests**.
- Compiler-free export of QA-09 generated a distinct 25-parameter VST3. The staged scanner and
  worker loaded it out of process, processed 64 blocks and restored 3,072 bytes of state.

This follow-up changes the stress fixture, acceptance coverage and committed QA material, not the
installed application binaries. The native dialog limitation and the physical MIDI/DAW/platform
deferrals below are unchanged.

The refreshed native file-dialog/recovery walkthrough is the one partial gate. CEditor itself
starts cleanly, and the current browser workflow proves save/share/reopen semantics, but the
supported native-window automation service is not configured on this machine. The Program Files
Save/Open/Share dialogs and malformed-package refusal were therefore not clicked unattended; their
last direct evidence remains the 13 September run. Physical MIDI, broader DAW coverage and other
platforms/formats remain explicitly deferred.

## Previous synchronized source checkpoint

Claude confirmed `b81fc112267474b796a70735890b47a06c9913af` as his complete,
clean checkpoint, with no unpublished or in-flight edits. It contains 53 commits
after the previous shared main, `45ad9820`. Codex fast-forwarded the canonical
Windows checkout at `C:/dev/Projects/CEditor` without conflicts.

## Independent Windows verification

Against that complete source checkpoint:

- Node suite: 4,856 tests, 4,856 passed, zero failures or skips.
- Frontend production build: passed.
- Serial browser checks: Mouse 38, Shared 14, Assets 6, Combined 29,
  authoring Links 4, Surface 7, Scripts 7 verified rows: 105 total, zero defects.
- Combined panel includes 125 controls across all 58 registered types plus all
  14 custom starters, for 139 controls.

These are focused integration checks. Inert, unverified and closed-elsewhere rows
retain their individual dispositions; this is not a claim that every property,
language or native runtime has been verified.

Integration also removes hardcoded Linux checkout paths from the coverage and
published-verb audit scripts, using module-relative paths and Windows-safe file
URLs/basenames. Both scripts now execute on Windows. The coverage scan reports
63 sections, 1,046 declared properties, 68 unmatched by its textual heuristics.
This count is not a behavioural defect count. The published-verb scan also needs
manual interpretation, especially computed property names and shared keys.

No production source changed after the validated checkpoint; the integration
follow-up changes only these audit scripts and the status/checklist records.
Claude agreed to synchronize his checkout after main is pushed and to retire the
fully merged exchange branch. The final synchronization is verified separately
against the remote refs and Claude's checkout acknowledgement.

## Work still needed at that previous checkpoint (superseded by the current section above)

1. Refresh the installed Windows candidate: RC3 predates the fixes. Re-run the
   Windows Release build/native tests, native save/open/share/recovery, and
   exported Player/VST3 host checks against the refreshed bundle.
2. Resolve the remaining visible options without effective behaviour:
   `Icon.tint`, the Behavior emit flags and `allowMixed`, and the inapplicable
   `Mouse.interceptChildClicks` option. Resolve the published script promises
   `looper.quantize`, `constellation.showField`, and `meter.showScaleLabels`.
   Preserve supported properties; implementation or an explicit product decision
   is needed, not silent removal to improve a coverage number.
3. Retain the individually unverified inspector/runtime rows and explain that
   Recorder quantisation options act through the Quantise action. See the
   residual-issues document and authoring suite ledgers for their precise scope.
4. Validate physical MIDI equipment and the intended DAW/platform/export matrix,
   or explicitly limit the first release to what has actually been verified.

The source integration does not refresh an already installed executable and is
not release approval. The release checklist and residual-issues document remain
the detailed gate and issue records.
