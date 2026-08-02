# Scripting: getting started

Your first panel script, end to end. Reference for every call used here:
the [scripting manual](scripting-manual.md); more worked examples: the
[cookbook](scripting-cookbook.md).

## 1. Open the script editor

Select a control on the canvas. The top bar's **Scripts / Logic** zone shows whether the
control has scripts (interactive controls do); press its **Script Editor** button to open the
**Behavior Designer** — the one script editor, bound to this panel's script document.

The window is one fixed frame: a nav rail on the left, a script list and a code editor on the
right. The nav rail is organised by *when scripts run*:

| Section | Fires | Typical job |
|---|---|---|
| **Startup** | `onPanelLoad` — before the GUI exists | MIDI setup only — controls don't exist yet |
| **Ready** | `onPanelReady` — GUI up | read the synth, fill controls |
| **Runtime** | control/panel/device events | everything reactive — most scripts live here |
| **DAW state** | `onDawSaveState` / `onDawRestoreState` | project save/restore (exported plugin in a DAW) |
| **Shutdown** | `onPanelClose` | cleanup, park edits, all-notes-off |

There is also a **Test / Trace** screen — more on it below.

## 2. Add a script

Press **+** on the section that matches *when* your script should run. For a first script,
choose **Runtime** — you get a script bound to `onValueChanged` on the selected control.

Pick a language from the script's language selector (Lua, JavaScript, TypeScript, Python,
C++, C#, or Java — the code is stored and run in whatever you write, never converted).

## 3. Write the handler

The script runs when its event fires, by defining a function named after the event. Link the
selected control to another one:

```lua
-- Lua
function onValueChanged(value)
  set("reso.value", value * 0.5)
end
```

Two things to lean on while typing:

- **The picker** (the tree on the right) lists every control with its properties and events,
  and the whole command set — click an entry and it inserts the call in your language's
  syntax. No path needs to be typed from memory.
- **Validation** runs as you type, against the real panel: unknown paths, a command used in
  the wrong scope, or a missing handler function show up as guidance in the problems list —
  e.g. adding a script to `onClick` without defining `onClick(mouse)` warns that it won't fire.

## 4. Run it

Turn on the panel **preview** and move the control — the handler fires live and `reso`
follows. No build step, no save dance: the runtime picks up your edits as you type.

When something doesn't happen, open **Test / Trace**:

- the **trace console** shows every event, `set`, MIDI message, error, and `log(...)` line —
  the fastest way to see *why* something fired or didn't;
- **live watch** shows control values updating as you interact.

Note: a few API areas run only in the exported plugin for now (timers, `emit`/`on`/`run`) —
the manual's availability badges mark exactly which, so a silent handler might be a badge,
not a bug.

## 5. Where scripts live

The script belongs to the control (or panel) it's attached to and travels with it — saved in
the panel, included at export. The exported plugin runs the same scripts in its C++ host
engines; errors go to a log file there instead of the console.

## Next

- [Cookbook](scripting-cookbook.md) — link controls, fill the panel from a dump, an
  Init-Patch button, and more.
- [Manual](scripting-manual.md) — every command, event, and helper, with availability badges
  and all seven languages.
