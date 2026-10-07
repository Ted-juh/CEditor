# Scripting: getting started

This guide takes you through your first panel script, step by step.
Every call used here is described in the [scripting manual](scripting-manual.md).
More examples are in the [cookbook](scripting-cookbook.md).

## 1. Open the script editor

Select a control on the canvas. Look at the **Scripts / Logic** zone in the top bar.
The zone appears for controls that can hold scripts: knobs, sliders, buttons and the
other controls you play with, but not labels, images, shapes, containers or text
inputs. Press the **Script Editor** button there. This opens the **Behavior Designer**,
the script editor for this panel.

The window has a fixed layout. A navigation rail is on the left.
A script list and a code editor are on the right.
The navigation rail groups scripts by *when they run*:

| Section | Runs on | Typical job |
|---|---|---|
| **Startup** | `onPanelLoad` — before the controls exist | MIDI setup only — controls don't exist yet |
| **Ready** | `onPanelReady` — the controls exist | read the synth, fill controls |
| **Runtime** | control, panel and device events | everything reactive — most scripts live here |
| **DAW state** | `onDawSaveState` / `onDawRestoreState` | project save and restore (exported plugin in a DAW) |
| **Shutdown** | `onPanelClose` — the window closes, scripts keep running; `onPanelDestroy` — the scripts stop | close: tidy what is on screen; destroy: send a final dump, all notes off |

There is also a **Test / Trace** screen. Step 4 explains it.

## 2. Add a script

Press **+** on the section that matches when your script should run.
For a first script, choose **Runtime**. You get a new script, and above its code
are three settings:

- **Runs on** is the one event this script answers. For a Runtime script it starts
  as `onValueChanged`: the moment a control's value settles.
- **Attached control** is the control it listens to. A new script starts as
  **Any control**, which means every control on the panel. Pick your control here.
- **Language** is Lua, JavaScript, TypeScript, Python, C++, C# or Java. The code is
  stored exactly as you write it, in that language.

## 3. Write the handler

A script runs when its event happens. You make this work by defining a function
with the same name as the event in **Runs on**. This example links the attached
control to another one:

```lua
-- Lua
function onValueChanged(value)
  set("reso.value", value * 0.5)
end
```

A script answers only the event in its **Runs on** box. A second function in the
same script, named after another event, is never called. To react to another event,
add another script, or listen for it with `on` — the manual's chapter "When a script
runs" shows how.

Two tools help you while you type:

- **The picker** is the tree on the right. It lists every control, with its
  properties and events. It also lists every command. Click an entry and the
  call is inserted in your language. You never need to type a path from memory.
- **The problems list** checks as you type. It warns about a handler that will
  never be called because it does not match **Runs on** — if the script runs on
  `onClick` but defines no `onClick(mouse)`, you are told it will not fire — and
  about commands used where they cannot work. It does not check control names: a
  misspelled one shows up in Test / Trace when the line runs.

## 4. Run it

Turn on the panel **preview**. The first time, CEditor pauses your scripts and shows
a bar asking whether you trust them, because a script can send MIDI to your
instruments. Press **Enable scripts for this session**. It asks again after every
change to the code. Then move the control: the handler runs, and `reso` follows.
There is no build step.

If something does not happen, open **Test / Trace**:

- The **trace console** lists each handler as it runs, every `log(...)` line,
  every error, and the MIDI sent with send commands such as `sendCC`. It does not
  list every value a script sets, so add a `log` line when you want to see one.
- **Live watch** shows control values changing while you interact.

Preview is a rehearsal. Everything the preview changed is put back when you turn
preview off: a knob you dragged, a colour a script set, a control a script made.
Your panel is exactly as you left it. That is on purpose — you can run a script a
hundred times without it slowly rewriting the panel you are building.

If you want to keep something a script did, say so in the script:

```lua
-- Lua
set("Status.Background.Fill.colour", "#5B9BD5")
ce.panel.keep("Status.Background.Fill.colour")  -- keep this one property
ce.panel.keep()                                 -- or keep everything from now on
```

`ce.panel.keep()` with no path stops the rehearsal: everything this preview has
changed so far, and everything it changes until you turn preview off, is kept.

Two things are never put back, because they cannot be: MIDI you already sent, and
anything you stored with `ce.storage.saveSetting`. Controls a script created are
always cleared, even by `keep()` — the next run makes them again, so keeping one
would leave a copy sitting next to it every time.

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

Most commands work the same in both places. Some need the window: drawing,
asking the user a question, and driving the on-screen components. The manual
marks them **Panel window only**. Calling one with the window closed does
nothing, and a note goes to the log. Two hooks work the other way round:
`onDawSaveState` and `onDawRestoreState` only run in the exported plugin,
because only a DAW saves projects.

So: if your script must keep working with the window closed — for example a
timer that keeps sending MIDI — avoid the commands marked **Panel window
only**. The manual's chapter "When the plugin window is closed" explains more.

## 6. Where scripts live

The scripts you make in the Behavior Designer are saved in the panel, each one
naming the control it is attached to, and they are included when you export. The
exported plugin runs the same scripts in its own engines. Errors there go to a
log file instead of the console.

## Next

- [Cookbook](scripting-cookbook.md) — link controls, fill the panel from a dump,
  build an Init Patch button, and more.
- [Manual](scripting-manual.md) — how scripting works, explained step by step,
  and every hook, event and command in one reference.
