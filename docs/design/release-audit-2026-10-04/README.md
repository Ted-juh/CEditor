# Release audit, 2026-10-04 — Claude and Codex, side by side

The owner wants this tree on a formal release (beta, or close to final). This audit lists every
bug, error, faulty behaviour and unfinished implementation that stands between the current tree and
that release. **List, do not fix** — fixes come afterwards, from the consolidated list, in the order
the owner chooses.

Two agents, two models, two machines. Neither can reach the other directly; **this branch is the
channel.** The owner relays when needed.

| | Claude | Codex |
| --- | --- | --- |
| Machine | Linux cloud container, no display, no audio, no MIDI hardware | The owner's machine — Windows, the release target |
| Writes to | `claude-findings.md` | `codex-findings.md` |
| Finding IDs | `C-01`, `C-02`, … | `X-01`, `X-02`, … |

Tree under audit: branch `ccr-0d6b8446-x8nxzw` at `f37550c` (114 commits ahead of `main`, which it
fully contains — the animation overhaul is the newest and least-exercised code).

---

## Protocol

1. `git fetch origin ccr-0d6b8446-x8nxzw && git checkout ccr-0d6b8446-x8nxzw && git pull`.
   Pull again before every push. **Edit only your own findings file** — that is what keeps two
   agents pushing to one branch free of conflicts. Never rebase or force-push this branch.
2. Docs-only commits end their title with `[skip ci]` (see `CLAUDE.md`).
3. Push early and often — an hour-old partial list is more useful to the other side than a perfect
   one at the end. Each push lets the other agent start verifying.
4. Not a finding: something already recorded in `docs/known-issues.md`,
   `docs/design/residual-issues-2026-09-14.md` or the release checklist **at the severity recorded
   there**. If it is worse than recorded, or the record is wrong, it *is* a finding — cite the
   record.
5. The repo's evidence rule holds: a changed property, a mount, or a green unit test is not
   evidence. Observe the visible result, the bytes that leave, the file that is written, the reopen.

### Finding format

```
### C-07 — Short claim, in the words a user would use      (S2 · bug · Export)

**Repro.** Exact steps or the exact command.
**Observed.** What happened — log line, screenshot path, exit code.
**Expected.** What should have happened, and who says so (UI text, docs, release notes).
**Where.** file:line of the cause if known; "unknown" is a fine answer.
**Evidence level.** observed-in-app · observed-in-test · read-in-code (say which).
```

Severity:

| | Meaning |
| --- | --- |
| **S1** | Release blocker — crash, hang, data loss, corrupt save, wrong bytes to hardware, installer or export broken, security |
| **S2** | Major — a feature visibly wrong or dead with no workaround |
| **S3** | Minor — wrong, with a workaround, or cosmetic in a prominent place |
| **S4** | Polish — wording, layout, docs that disagree with the product |
| **U**  | Unfinished — offered in the UI, docs or release notes, and not implemented |

### Cross-verification — this is the point of two models

Each agent takes the **other's S1 and S2 findings** and tries to break them: reproduce, or read the
code and dispute. Record the verdict in your *own* file, under `## Verification of the other's
findings`, as `C-07: confirmed on Windows` / `not reproduced — <why>` / `disputed — <why>`.
A finding both models agree on goes to the top of the consolidated list; a disputed one gets a
third look rather than a coin toss.

---

## Claude's half (Linux container)

1. Web: `npm ci`, `test:all`, `lint`, `check`, `build`; the browser suites (`test:browser` and the
   `browser-checks` ledgers) under Playwright/Chromium.
2. C++: the native preset with `CEDITOR_SCRIPTING=ON`, every test target, all X11/ALSA packages.
3. The app built and run on Linux under Xvfb (WebKitGTK): every menu, every tab, every dock;
   screenshots and console errors; the out-of-process scanner and auditioner.
4. Plug-in export and the format validators (VST3 `validator`, `clap-validator`, `lv2lint`).
5. Code review by subsystem, newest code first: the animation overhaul, scripting and the seven
   script exporters, the stores/persistence layer, the bridge handlers.
6. Release-surface consistency: release notes, Help, About, version strings, docs against the
   product.

## Codex's half (Windows — the things only that machine can show)

Work top to bottom; skip a section the machine cannot do, and say so in your file.

- **W1. Build.** A clean MSVC Release build of this exact commit (`update-and-build.cmd`, or a VS
  Developer shell per `CLAUDE.md`). Every warning that looks like a bug, every error. Then `ctest`
  — the release checklist quotes 34/34; report the real number and every failure.
- **W2. Installer.** Install fresh (uninstall first) and over the previous install. First run:
  WebView2, the build stamp / About showing `f37550c`, Settings defaults, the unsigned-SmartScreen
  path the release notes describe. Uninstall: what is left behind.
- **W3. Native dialogs and recovery** (gate D3, never repeated unattended): New, Open, Save, Save As,
  File → Share Panel…, Open Shared Panel… (and a deliberately malformed package — it must be
  refused with a message), crash recovery (kill the process with unsaved edits, relaunch).
- **W4. Export, compiler-free, from the installed app.** A starter panel and
  `CE/qa/QA-09-custom-stress.cepanel` to VST3, CLAP and LV2. Load each in whatever host the machine
  has (Reaper, Bitwig, Ableton, Cakewalk, or JUCE's AudioPluginHost). Window open/close/reopen,
  automation of an exported parameter, save the host project and reopen it, MIDI out.
- **W5. The instrument host (Hostage) with the live worker** — the part Linux cannot do: scan real
  VST3s, load an instrument into a part, play it, browse presets and program lists, kill the worker
  process and confirm the app survives and says so.
- **W6. MIDI out, real ports.** With loopMIDI (or any virtual port) and a MIDI monitor: bind a panel,
  move controls, confirm the bytes; Total Recall restore order (dump first, then values); Ports,
  Routes and Snapshots render and work.
- **W7. The animation overhaul under WebView2.** Animation tab: timeline, keyframe drag, spring
  easing, Play, loop/hold/follow-value sequences, filmstrip frame tracks — in the editor and inside
  an exported plug-in window.
- **W8. An independent review of the C++ backend** with your own model's eye — `CE/src/Player`,
  `CE/src/Export`, `CE/src/InstrumentHost`, `CE/src/Scripting`, `CE/src/DeviceProfile`,
  `ValueTreeBridge*`, `WebViewHost.cpp`. Threading, object lifetime, file-IO error paths, anything
  that runs on the audio thread. Claude's review covers the web side first, so this is not
  duplicated effort.
- **W9. Cross-verify** Claude's S1/S2 findings on Windows, as above.

When you finish, write `## Done` at the bottom of `codex-findings.md` with the commit you tested,
and push. Claude then consolidates both files into `CONSOLIDATED.md` in this folder.
