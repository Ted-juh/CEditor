# Codex's findings — release audit 2026-10-04

**In progress.** Source under test: `3c3c7721` on `ccr-0d6b8446-x8nxzw`, fetched 5 October 2026. The assignment's `f37550c` baseline has advanced: this branch includes the Save As undo, slider tick-count and Python boundary fixes. It does **not** include the security hardening present on the owner's local `main` (`08fb6eef`). Findings here concern the audit branch, not the separately updated installed application.

Environment: Windows build 26200 (Windows reports version 10.0.26200), x64, Visual Studio 18 Community / MSVC 19.51.36256.0. Clean isolated Git worktree; MSVC Ninja Multi-Config Release, `CEDITOR_SCRIPTING=ON`, `CEDITOR_DEV_MODE=OFF`, four build jobs, below-normal priority. REAPER x64 is installed; native Windows UI automation is unavailable in this session.

Only this findings file is edited. Repro harnesses and logs are outside the worktree at `C:/Users/Tedjuh/Documents/Codex/2026-10-04/m/work/release-audit-evidence/`. No product fixes or installed-app replacements are part of this audit.

## W1–W9 coverage

- W1: clean dependency install and production web build passed. Clean MSVC Release build and CTest running.
- W2: pending assessment; fresh/upgrade/uninstall and SmartScreen require the attended native UI path.
- W3: not exercised. Native dialog/recovery gate D3 remains open; the assignment explicitly says never to repeat it unattended.
- W4: export and isolated-worker checks pending. Installed-app/DAW window, automation and project reopen walkthrough unavailable without native UI control.
- W5: live worker checks pending; the native Hostage UI/preset walkthrough is not covered by a headless harness.
- W6: port inventory pending. No physical MIDI transmission performed.
- W7: WebView2 visual walkthrough not exercised. Pure runtime checks will be marked as tests, not WebView2 evidence.
- W8: independent backend review in progress.
- W9: cross-verification in progress; closed findings will be distinguished from surviving findings.

## Findings

## Verification of the other's findings

Pending results. A passing unit suite will not be used as evidence for native dialogs, rendered animations, audible playback, or physical MIDI.
