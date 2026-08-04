# Scripting: getting started

This guide takes you through your first panel script, step by step.
Every call used here is described in the [scripting manual](scripting-manual.md).
More examples are in the [cookbook](scripting-cookbook.md).

## 1. Open the script editor

Select a control on the canvas. Look at the **Scripts / Logic** zone in the top bar.
It shows whether the control has scripts. Interactive controls do.
Press the **Script Editor** button there. This opens the **Behavior Designer**.
The Behavior Designer is the script editor for this panel.

The window has a fixed layout. A navigation rail is on the left.
A script list and a code editor are on the right.
The navigation rail groups scripts by *when they run*:

| Section | Fires | Typical job |
|---|---|---|
| **Startup** | `onPanelLoad` — before the GUI exists | MIDI setup only — controls don't exist yet |
| **Ready** | `onPanelReady` — GUI up | read the synth, fill controls |
| **Runtime** | control/panel/device events | everything reactive — most scripts live here |
| **DAW state** | `onDawSaveState` / `onDawRestoreState` | project save/restore (exported plugin in a DAW) |
| **Shutdown** | `onPanelClose` | cleanup, park edits, all-notes-off |

There is also a **Test / Trace** screen. Step 4 explains it.

## 2. Add a script

Press **+** on the section that matches when your script should run.
For a first script, choose **Runtime**.
You get a script bound to `onValueChanged` on the selected control.

Pick a language from the script's language selector.
You can choose Lua, JavaScript, TypeScript, Python, C++, C#, or Java.
The code is stored and run in the language you write. It is never converted.

## 3. Write the handler

A script runs when its event fires. You make this happen by defining a function
named after the event. This example links the selected control to another one:

```lua
-- Lua
function onValueChanged(value)
  set("reso.value", value * 0.5)
end
```

Two tools help you while you type:

- **The picker** is the tree on the right. It lists every control, with its
  properties and events. It also lists every command. Click an entry and the
  call is inserted in your language. You never need to type a path from memory.
- **Validation** runs as you type. It checks against the real panel. Unknown
  paths, commands used in the wrong scope, and missing handler functions all
  appear in the problems list. For example: if you add a script to `onClick`
  but do not define `onClick(mouse)`, the list warns you that it will not fire.

## 4. Run it

Turn on the panel **preview** and move the control. The handler fires live,
and `reso` follows. There is no build step and nothing to save first.
The runtime picks up your edits as you type.

If something does not happen, open **Test / Trace**:

- The **trace console** shows every event, every `set`, every MIDI message,
  every error, and every `log(...)` line. It is the fastest way to see why
  something fired, or why it did not.
- **Live watch** shows control values changing while you interact.

Everything in this guide runs live in the preview. Some commands stop working
once the plugin window is closed in a DAW. The next section explains this.

## 5. Where scripts run

Your scripts can run in two places:

1. **The panel window.** While you build in the editor, and while someone has
   the plugin window open in their DAW, the panel is on screen. Scripts run
   right there.
2. **The plugin itself, with the window closed.** In a DAW, people close the
   plugin window all the time. The plugin keeps making sound, and your scripts
   keep running. Timers keep ticking. MIDI keeps arriving. There is just no
   window anymore.

Most commands work the same in both places. The manual marks them
**cross-runtime**. Some commands need the window: drawing, asking the user a
question, and driving the on-screen components. The manual marks them
**panel view only**. Calling one with the window closed does nothing, and a
note goes to the log. A few commands are marked **player**: they only work in
the exported plugin, because they involve the DAW. `onDawSaveState` is one.

So: if your script must keep working with the window closed — for example a
timer that keeps sending MIDI — use only cross-runtime commands. Check the
badge in the manual when you are not sure.

## 6. Where scripts live

A script belongs to the control or panel it is attached to. It travels with it.
It is saved in the panel and included at export. The exported plugin runs the
same scripts in its C++ host engines. Errors there go to a log file instead
of the console.

## Next

- [Cookbook](scripting-cookbook.md) — link controls, fill the panel from a dump,
  build an Init Patch button, and more.
- [Manual](scripting-manual.md) — every command, event, and helper, with
  availability badges and all seven languages.
