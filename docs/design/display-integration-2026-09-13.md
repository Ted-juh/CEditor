# Display integration — 13 September 2026

Combined `claude/ceditor-component-creator-gui-rrh1rs` at `ede77b46`, GitHub main at
`eedd7b04`, and the 164 modified/new local files saved in checkpoint `57b118bc`.
The checkpoint includes independent Instrument Host work; its production source was
preserved during integration.

The sole textual conflict was in DisplayEditor: the programmable glyph editor is
retained under the compact Screen dock's Content group, alongside all existing
properties. Text, Effects and Screen docks, shape effects, GIF playback and pixel
selection remain available. Script-authored zone/layout fields survive inspector
edits and duplication. Pixel element names survive editing; duplicating an individual
element intentionally clears its script name, while duplicating a layout retains names.

Codex coordinated with the existing Claude Code cloud task through the Claude app.
Claude reviewed upstream display contracts and the PanelPreviewSurface changes.
The review led to fixes for direct PixelDisplay parameter sources, preventing a
timeout from restarting after an automatic return, and treating unknown choice
values as absent. Both display renderers preserve the absent-value flag.

Other local corrections: use the proxy-safe cloning helper for surface effects;
restore a Text section icon; update source-structure tests for shared property themes
and extracted Host controls; use Windows-safe paths in the browser harness build.

Validation includes the complete web unit suite, scripting export checks, the compact
dock/shape/GIF/selection/glyph/preservation browser suites, sidebar suites, the new
screen-runtime regression, and an MSVC Release CEditor build. Hardware MIDI, plug-in
behavior and all export/plugin formats are not covered by those browser checks.

Some upstream features remain authored through scripts/JSON: soft-key actions,
layout return timers, menu visibility conditions and direct parameter source strings.
They are preserved; this integration does not add missing authoring UI for them.

The first integration above was local. The subsequent publication audit with Claude
found exactly three non-main remote branches: the GUI work already included here,
`innovative-midi-features-bryc31` (nine commits, seven new/updated design and Lua
prototype files), and `sled-display-examples-nbnh7x`. The innovative work is now
included. The sled branch's tree is identical to main (`d97ef7e03760`); its changes
were already rebased onto main, so its duplicate ancestry is not replayed.

Full publication validation builds every native Release target and runs all 33
CTest suites. It found and fixed three defects in the local Instrument Host work:
undo history captured opaque plug-in state during metadata edits; undo could race
a queued transport start; and MIDI pad learn could miss the first note before the
next event drain. The pickup fixture assertions now respect the stub plug-in's
0.01 parameter step instead of demanding unrepresentable values. All 33 suites pass.

The full browser sequence passes, with opener assertions updated for the compact
Text dock and an explicit wait for its asynchronously selected Screen target.
The screen-runtime regression additionally checks absent/deleted sources across
all five readout kinds in both LCD and Pixel renderers. The Lua prototype's eleven
round trips pass on Windows after correcting its file URL conversion; failures
now produce a nonzero exit status.

Publication uses one combined PR with CI enabled, followed by removal of obsolete
remote branches after verifying preservation. A verified external Git bundle
contains all original refs and local recovery snapshots. The existing Alpha0.04
release tag is retained.
