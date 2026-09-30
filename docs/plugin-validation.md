# Validating exported plug-ins

`tools/scripts/validate-plugins.mjs` runs the hosts' own conformance suites over an export:
[pluginval](https://github.com/Tracktion/pluginval) (Tracktion) for `.vst3` and `.lv2`, and
[clap-validator](https://github.com/free-audio/clap-validator) (free-audio) for `.clap`.

```bash
node tools/scripts/validate-plugins.mjs                      # everything in export-out/
node tools/scripts/validate-plugins.mjs "export-out/My Panel.clap" --strictness 7
node tools/scripts/validate-plugins.mjs --report out/validation.json --require
```

Exit code 0 means every plug-in checked passed, 1 means one failed, 2 means nothing could be
checked. **A validator that is not installed is reported as "not run", never as a pass**, and
`--require` turns that into a failure, which is what a CI step should use.

To validate as part of an export, set `validatePlugins: true` in the panel's Export settings or
`CE_VALIDATE_EXPORT=1` in the environment of `export-panel-vst3.mjs`. It is opt-in because
pluginval takes a few minutes. A failure is printed; the export is not undone.

## Getting the validators

Neither is vendored: pluginval is GPLv3, and both are per-platform release binaries tens of MB in
size. They are separate programs that the script runs; nothing links against them.

| Validator | Where | Notes |
| --- | --- | --- |
| pluginval | [Releases](https://github.com/Tracktion/pluginval/releases) — `pluginval_Windows.zip`, `_macOS`, `_Linux` | One executable. |
| clap-validator | [free-audio/clap-validator](https://github.com/free-audio/clap-validator) | `cargo build --release`. 0.4.1 needs rustc 1.95 (`rustup toolchain install 1.95.0`, then `cargo +1.95.0 build --release`). |

The script looks for each one in this order: `$PLUGINVAL` / `$CLAP_VALIDATOR`, then
`tools/validators/<name>` (ignored by git — put them there), then `PATH`.

**GUI tests** open the plug-in's editor, which for a CEditor plug-in is a WebView. Off Windows and
macOS they are skipped automatically when there is no display; `--with-gui` or `--skip-gui` overrides
that.

## What it found the first time it ran

The first run was against the Roland GAIA panel exported as VST3, CLAP and LV2 on Linux. It
failed three ways out of three, and every one of these was a real defect in the product. None was a
quirk of the validator.

| Found by | Defect | Fixed in |
| --- | --- | --- |
| the build itself | No Linux plug-in could be linked: the scripting library and Lua were not position-independent. | `CMakeLists.txt` (`POSITION_INDEPENDENT_CODE`) |
| clap-validator `state-reproducibility-*` | After a project reload the host was never told to re-read parameter values. A DAW would keep showing defaults over a correctly restored state. | `PluginProcessor.h` `setStateInformation` |
| clap-validator `param-conversions` | Choice labels with any non-ASCII character (`Up · keep low+high`) converted from text to the first choice. | vendored CLAP wrapper, see its `VENDORED.md` |
| clap-validator `features-categories` | No main CLAP category, which CLAP requires. | `CMakeLists.txt` (`audio-effect`, matching the VST3's `Fx`) |
| pluginval, LV2 | A crash, and after a first fix a hang. Script engines were created and destroyed on the host's thread and used on the plug-in's message thread, so every JavaScript call failed with "stack overflow" (1.1 million lines in the player log), and teardown raced a timer. | `PluginProcessor.h` `onMessageThread` |

Two more came from reading the player log those runs left, not from a validator's verdict:

| Seen in | Defect | Fixed in |
| --- | --- | --- |
| 14,000 refused script writes | A plug-in built from a *saved* `.cepanel` lacked every default-valued property, and the command-line exporter derived its host parameters from the sparse controls: 5 instead of 60 on QA-08. | `tools/scripts/lib/exportDocument.mjs`: a saved document is completed first. Build by hand with `prepare-export-panel.mjs`. |
| the MIDI flood guard, at every load | Every `set()` counted as a MIDI send, a label's text included, so painting a long list silently dropped the MIDI of the next bound control. | `BridgeScriptHost.h`: only writes to bound paths count. |

Two clap-validator **warnings** remain and are understood:

- `process-audio-denormals` — processing takes several times longer on denormal input. The plug-in
  does not touch the audio at all, and adding flush-to-zero to `processBlock` did not change the
  figure, so the time is spent outside CEditor's code.
- `state-invalid-random` — random bytes load "successfully". The plug-in ignores a state it cannot
  parse, which is the safe outcome. The CLAP wrapper reports success for every load because
  JUCE's `setStateInformation` cannot return a failure.

The VST3 passed pluginval at strictness 10 throughout. pluginval restores state into the same
instance, and clap-validator into a fresh one; only the fresh-instance case exposed the missing
re-read.

## What it does not cover

- **Windows- and macOS-only paths.** The run above was on Linux. The threading fix matters most
  there, because a Windows host builds and destroys a plug-in on its UI thread. Run the script on a
  Windows export as well. There is no CI job for it yet: adding one is a change to CI, and
  `CLAUDE.md` leaves that to the owner.
- **The panel's own scripts.** The validators drive the plug-in with no hardware attached. A panel
  script that misbehaves only when a synth answers will not show up here.
