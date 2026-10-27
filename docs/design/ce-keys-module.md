# `ce.keys`: the computer keyboard on a panel

*Designed and approved by the owner on 2026-10-27. Nothing built.* `ce.keys` lets a panel use the
computer keyboard: key events, shortcuts, the keys held down, a piano played from the letter keys,
and keyboard focus. 9 commands and 2 events. It runs in the panel view only, in the editor's preview
and in an exported plug-in with its window open; with the window shut there is no keyboard. Every
entry is written in the scripting manual's form, so it can go into `panelApi.js` as it stands.
Seventh in [Script modules: what is missing](script-modules-roadmap.md).

## What the panel does with keys today

- **Scripts hear no key at all.** The API has no key event, and no control carries a shortcut. The
  one key a panel can set is the panic key (`panicShortcut`, Esc by default).
- **Controls take keys when focused.** A focused knob or slider moves with the arrows, Home, End,
  PageUp and PageDown and takes typed digits; a button presses with Space or Enter; a list moves with
  the arrows and jumps by typed letters (`handleKeyDown` in `PanelPreviewSurface.svelte`).
  `Behavior.keyboardEnabled` and "Focusable" turn this off per control.
- **The Keyboard component takes no keys.** It plays only from the mouse.
- **In a DAW, unused keys go to the DAW** (`hostKeys.js`, Windows only so far): Space starts the
  transport while the plug-in has focus. A key the page used, by calling `preventDefault`, stays in
  the plug-in.
- **A QWERTY piano exists, in Hostage only** (`HostKeyboard.svelte`): A to K for the white keys, W to
  U for the black ones, Z and X for the octave, by physical key position, with every note released
  when the window loses focus.

## Everything at a glance

| New | Kind | What it gives |
|---|---|---|
| `keyDown`, `keyUp` | event | A key went down or up, with its name, its position and the modifiers |
| `ce.keys.shortcut` | command | Run a function when a key, or a key with modifiers, is pressed |
| `ce.keys.remove`, `list` | command | Take a shortcut away; list the panel's shortcuts |
| `ce.keys.isDown`, `held` | command | Is a key held now; which keys are held |
| `ce.keys.piano` | command | Play notes from the letter keys, as Hostage does |
| `ce.keys.pianoInfo` | command | The piano's octave, velocity and the notes it holds |
| `ce.keys.focus`, `focused` | command | Give a control the keyboard; which control has it |

## Rules every command keeps

**Who gets a key, in order.** Each step can keep the key; a kept key goes no further.

1. **Typing.** A text box, an LCD being edited, a list's search field or a half-typed accented letter
   keeps every key. Nothing below sees it.
2. **The panic key.** Esc, or the panel's own `panicShortcut`.
3. **Shortcuts** the panel's scripts set with `ce.keys.shortcut`.
4. **The piano**, when `ce.keys.piano` is on: the letter keys it plays.
5. **The focused control's own keys**: arrows on a knob, Space on a button, as now.
6. **`keyDown`**, for any script that listens. A handler that returns true keeps the key.
7. **Whatever is around the panel**: the DAW in an exported plug-in, the editor's shortcuts in the
   preview.

The other rules:

- **Typing is never a key event.** Step 1 is the same check `hostKeys.js` and the editor use
  (`isTextEntryTarget`, `[data-editing]`), so a script cannot see what is typed into a text box.
- **The editor and the DAW keep the keys they claim.** `shortcut` refuses the editor's own keys (F1,
  F5, Ctrl+S, Ctrl+Z and the rest of `globalShortcuts.js`), the keys DAWs claim (`HOST_CLAIMED` in
  `panicLayout.js`) and the panic key, with a console line saying why. Space is allowed, with a
  console line: in a DAW it then no longer starts the transport while the plug-in has focus.
- **Shortcuts name the key printed on it; the piano uses its place.** "Ctrl+R" is R wherever it sits
  on a German or French keyboard. The piano plays by position, so the white keys are the middle
  letter row on every layout, as in Hostage.
- **Everything is let go when the panel loses the keyboard.** When the window loses focus, is
  hidden, or the panel closes, every held key gets its `keyUp`, every piano note its note-off, and
  `held` is empty. A key held while switching windows never sticks.
- **Holding a key down** raises `keyDown` again with `repeat` true; shortcuts and the piano ignore
  those unless asked.
- **In the panel view only.** With the window shut nothing is raised and the commands are not there,
  as for other panel-view modules. In the editor's design view, outside the preview, nothing is
  raised either.

## Key events

### `keyDown`: a key went down

| Field | What it holds |
|---|---|
| `key` | The key's name as printed: `"R"`, `"7"`, `"Space"`, `"Enter"`, `"Up"`, `"F2"`. Letters always upper case. |
| `code` | The key's place, the same on every layout: `"KeyR"`, `"Digit7"`, `"Space"`. |
| `ctrl`, `shift`, `alt`, `meta` | Which modifiers are held. `meta` is the Windows key, or Cmd on a Mac. |
| `repeat` | True when the key is held and the system repeats it. |
| `control` | The name of the control that has the keyboard, or nothing. |

Good to know:

- A panel-wide event, heard with `on("keyDown", fn)` or `onKeyDown(key)` in the panel script.
- **Return true to keep the key.** It then goes no further: not to the DAW, not to the editor. Return
  nothing and it goes on, as if no script had seen it.
- Raised only for keys no earlier step kept (see the order in the rules): not while typing, not for
  the panic key, not for a shortcut, a piano key, or a key the focused control used.

### `keyUp`: a key was let go

The same fields as `keyDown`, without `repeat`.

Good to know:

- Raised for every key whose `keyDown` was raised, also when the panel loses the keyboard while the
  key is held; then it comes before the window's focus moves on.
- Its return value is not used: a key-up goes where its key-down went.

```lua
-- Lua: the left and right arrows step through the synth's presets,
-- unless a control has the keyboard
function onKeyDown(key)
  if key.control then return end
  if key.key == "Left" then ce.device.recallPreset(ce.device.preset().slot - 1); return true end
  if key.key == "Right" then ce.device.recallPreset(ce.device.preset().slot + 1); return true end
end
```
```js
// JavaScript
function onKeyDown(key) {
  if (key.control) return;
  if (key.key === "Left") { ce.device.recallPreset(ce.device.preset().slot - 1); return true; }
  if (key.key === "Right") { ce.device.recallPreset(ce.device.preset().slot + 1); return true; }
}
```

## Shortcuts and held keys

### `ce.keys.shortcut(keys, fn [, opts]) -> id`

Run a function when a key, or a key with modifiers, is pressed anywhere on the panel.

Example: `ce.keys.shortcut("Ctrl+R", randomizeVoice, { description = "Random voice" })` runs
`randomizeVoice` on Ctrl+R.

- `keys` (text, required): The key and its modifiers joined by `+`: `"Ctrl+R"`, `"Shift+Up"`, `"F2"`,
  `"Space"`. Modifiers are `Ctrl`, `Shift`, `Alt` and `Meta` (the Windows key, or Cmd on a Mac), in
  any order and any case. Read the same way as `panicShortcut`.
- `fn` (function, required): Called with the `keyDown` fields.
- `opts` (options, optional): `description`, the words `list` shows; `repeat`, true to run again
  while the key is held (default false).

Good to know:

- Refused, with a console line saying why: the editor's own keys, the keys DAWs claim, the panic
  key, and a key another shortcut already has. Space is allowed, with a console line.
- A shortcut without a modifier waits for a focused control that uses that key: with a knob focused,
  a shortcut on `"Up"` does not run, and the knob moves. With a modifier it always runs.
- Returns an id for `remove`; refused: nothing.

### `ce.keys.remove(id) -> boolean`

Take a shortcut away.

Example: `ce.keys.remove(state.randomKey)` when the page that used it is hidden.

- `id` (number, required): The id `shortcut` gave.

Good to know:

- Returns true when there was one. A script's shortcuts are removed when it reloads.

### `ce.keys.list() -> list`

Every shortcut on the panel, for a help page.

Example: `#ce.keys.list()` is how many keys the panel uses.

Good to know:

- Returns a list of `{ id, keys, description }`, the panic key first (id `"panic"`), then in the
  order they were made.
- The piano is one entry while it is on, `keys` `"Piano"`.

### `ce.keys.isDown(key) -> boolean`

Whether a key is held now.

Example: `ce.keys.isDown("Shift")` in `onValueChange` to move a knob in fine steps while Shift is
held.

- `key` (text, required): A name as `keyDown` gives it, or a place as `code` gives it.

Good to know:

- Counts keys the panel saw go down, typing excepted. False after the panel loses the keyboard.

### `ce.keys.held() -> list`

The keys held now, by name, in the order they went down.

Example: `ce.keys.held()` while Ctrl and R are held gives `{ "Ctrl", "R" }`.

```lua
-- Lua: Ctrl+R picks a random voice; a help LCD shows every key the panel uses, one per row
function onPanelReady()
  ce.keys.shortcut("Ctrl+R", function() run("Random.action") end, { description = "Random voice" })
  for row, s in ipairs(ce.keys.list()) do
    ce.components.lcd.text("Help", row, s.keys .. "  " .. (s.description or ""))
  end
end
```
```js
// JavaScript
function onPanelReady() {
  ce.keys.shortcut("Ctrl+R", () => run("Random.action"), { description: "Random voice" });
  ce.keys.list().forEach((s, i) => {
    ce.components.lcd.text("Help", i + 1, `${s.keys}  ${s.description ?? ""}`);
  });
}
```

## The computer-keyboard piano

### `ce.keys.piano([opts]) -> boolean`

Play notes from the letter keys.

Example: `ce.keys.piano({ target = "Keys" })` plays through the Keyboard component named "Keys",
which lights up as notes play.

- `opts` (options, optional): The options below. `{ on = false }` stops it and lets every note go.

Good to know:

- The layout is the one Ableton Live and Hostage use, by the keys' place: the middle letter row
  plays the white keys from C, the row above it the black ones (table below). On a German or French
  keyboard the same places play the same notes.
- A key held plays one note until it is let go; the system's key repeat is ignored. Keys pressed
  with Ctrl, Alt or Meta are left for shortcuts.
- With a `target`, the notes go through that Keyboard component: its channel, velocity, transpose,
  octave and scale lock apply, its keys show what is held, and it raises `hit` and `release` as for
  the mouse. Without one, the options below apply and the notes go to the device as `sendNote` sends
  them.
- Every note is let go when the panel loses the keyboard, when the piano is turned off, and on the
  panic key.
- Returns true when on; false when the panel has no device to play to.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `on` | on/off | on | Off stops the piano. |
| `target` | text | none | A Keyboard component to play through. |
| `octave` | number | 4 | The octave the A key starts: 4 makes it C4, note 60. |
| `velocity` | number (1 to 127) | 100 | How hard every note is played. |
| `channel` | number (1 to 16) | 1 | Without a `target`. |
| `role` | text | `"mainSynth"` | The device, without a `target`. |
| `octaveKeys` | on/off | on | Z and X move the octave down and up. |
| `velocityKeys` | on/off | on | C and V lower and raise the velocity by 20. |

**The layout**, by place on a US keyboard:

| Key | A | W | S | E | D | F | T | G | Y | H | U | J | K | O | L | P | ; | ' |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Note | C | C# | D | D# | E | F | F# | G | G# | A | A# | B | C | C# | D | D# | E | F |

### `ce.keys.pianoInfo() -> table`

What the piano is doing.

Example: `ce.keys.pianoInfo().octave` is the octave Z and X have moved it to.

Good to know:

- Returns `{ on, octave, velocity, channel, target, notes }`; `notes` is a list of `{ note, key }`
  for the notes held now.
- To react to each note as it is played, give the piano a `target` and listen to that component's
  `hit` and `release`.

```lua
-- Lua: a switch turns the piano on and off; an LCD shows its octave
function onValueChanged(value)
  ce.keys.piano({ on = value > 0, target = "Keys" })
  ce.components.lcd.text("Display", 2, "Octave " .. ce.keys.pianoInfo().octave)
end
```
```js
// JavaScript
function onValueChanged(value) {
  ce.keys.piano({ on: value > 0, target: "Keys" });
  ce.components.lcd.text("Display", 2, "Octave " + ce.keys.pianoInfo().octave);
}
```

## Focus

### `ce.keys.focus([control]) -> boolean`

Give a control the keyboard, so the arrows and digits move it.

Example: `ce.keys.focus("Cutoff")` after a shortcut that jumps to the filter.

- `control` (text, optional): The control's name. Left out: no control has the keyboard, and keys go
  to shortcuts and `keyDown`.

Good to know:

- The control shows its focus ring, as after Tab.
- Refused (false) for a control with "Focusable" off or keys turned off
  (`Behavior.keyboardEnabled`), a hidden control, and in the editor's design view.
- Returns true when the control has the keyboard.

### `ce.keys.focused() -> text`

The control that has the keyboard.

Example: `ce.keys.focused() == "Cutoff"` while the cutoff knob takes the arrows.

Good to know:

- Returns the control's name; none: nothing. The same as `keyDown`'s `control`.

```lua
-- Lua: Tab-like jumps between the three filter knobs with Ctrl+Left and Ctrl+Right
local knobs = { "Cutoff", "Resonance", "EnvAmount" }

local function step(by)
  local at = 1
  for i, name in ipairs(knobs) do if name == ce.keys.focused() then at = i end end
  ce.keys.focus(knobs[(at - 1 + by) % #knobs + 1])
end

function onPanelReady()
  ce.keys.shortcut("Ctrl+Right", function() step(1) end, { description = "Next filter knob" })
  ce.keys.shortcut("Ctrl+Left", function() step(-1) end, { description = "Previous filter knob" })
end
```
```js
// JavaScript
const knobs = ["Cutoff", "Resonance", "EnvAmount"];

function step(by) {
  const at = Math.max(0, knobs.indexOf(ce.keys.focused()));
  ce.keys.focus(knobs[(at + by + knobs.length) % knobs.length]);
}

function onPanelReady() {
  ce.keys.shortcut("Ctrl+Right", () => step(1), { description: "Next filter knob" });
  ce.keys.shortcut("Ctrl+Left", () => step(-1), { description: "Previous filter knob" });
}
```

## Found on the way

| What | Where | Effect today |
|---|---|---|
| The panel view never lets notes go when the window loses focus or is hidden | `PanelPreviewSurface.svelte`: notes are silenced only on close | A note held on the Keyboard, Chord Pad, Drum Pads or Note Ribbon while switching windows can hang. Hostage releases on blur and on a hidden window; the panel should too. |
| Keys going to the DAW work on Windows only | `PlayerHost.cpp` `keysGoToHost`; `docs/known-issues.md` | On macOS and Linux a key the panel does not use does not reach the DAW, so `keyDown` returning nothing changes nothing there. The Windows path is not yet tried in a DAW by hand. |
| "The scripting API has no key event" | Comment in `panicLayout.js` | To be changed when `keyDown` exists. |

## Build steps

Three steps, all in the panel view: no window-shut engine, no C++ beyond what key forwarding already
does. Each is checked with a browser check in the way `playerHostKeys.mjs` checks key forwarding
today. The plain-description rules in [api-descriptions-handoff.md](api-descriptions-handoff.md)
apply to every text above.

| Step | What | Builds on |
|---|---|---|
| 1. Keys for scripts | `keyDown`, `keyUp`, `shortcut`, `remove`, `list`, `isDown`, `held`; the order of who gets a key; letting go on blur, hidden window and close (which fixes the stuck notes above) | `handleGlobalKeyDown` and `handleKeyDown` in `PanelPreviewSurface.svelte`, `isTextEntryTarget`, the shortcut parser in `panicLayout.js`, `hostKeys.js` for what reaches the DAW |
| 2. The piano | `piano`, `pianoInfo` | Hostage's `HostKeyboard.svelte` (layout by place, release on blur), `keyboardPress` in `keyboardLayout.js`, the Keyboard component's held notes and `hit`/`release` |
| 3. Focus | `focus`, `focused` | `keyboardFocusControlId`, `resolveTabIndex` |

## Open decisions

- [ ] Whether the Keyboard component gets a "Play from the computer keyboard" setting, so a panel has
  the piano without a script. `ce.keys.piano` would then be the script's way to the same thing.
- [ ] Whether the piano gets a second row (Z to M an octave lower), as FL Studio and Bitwig have. It
  would take Z, X, C and V from the octave and velocity keys.
- [ ] Whether the exported plug-in shows `ce.keys.list()` on its own help key, so a user finds a
  panel's keys without a help page in the panel.
- [ ] Keys to the DAW on macOS and Linux (the known issue above), which `ce.keys` needs before
  "return true to keep the key" means the same everywhere.
