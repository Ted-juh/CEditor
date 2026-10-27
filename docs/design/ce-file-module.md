# `ce.file`: librarian files, through the person's own dialogs

*Designed and approved by the owner on 2026-10-27. Nothing built.* The design for a scripting
module that reads and writes the files a librarian works with: `.syx` banks, `.mid` files, JSON and
text. 11 commands: two dialogs, reading and writing a chosen file again, a chosen folder, and two
pairs that take `.syx` and `.mid` files apart and put them together. Every command entry is written
in the scripting manual's form, so it can go into `panelApi.js` as it stands. Third in
[Script modules: what is missing](script-modules-roadmap.md).

## The one rule: a script never names a path

Every file comes from a dialog the person answered: `open` or `save` for one file, `folder` for a
folder. The script gets a file value back and works through it. A script cannot read your
documents, or write over anything, unless you pointed it there a moment before.

## What it builds on

- **The native side already works this way.** `NativeFileAccess` (`CE/src/NativeFileAccess.h`) lets
  the page read or write only a file the person picked in a dialog, and refuses the rest with
  "Select this file using Open or Browse first". `ce.file` sits on the same grants.
- The device profile's preset screen exports a bank as `.syx` (`exportLibraryBankSyx` in
  `stores/presetLibrarian.js`), through a browser download, not a save dialog.
- There is no `.syx` import that splits a file into messages, and no MIDI file code anywhere in the
  tree (2026-10-27).
- A Phrase Recorder's take is `{ events: [{ t, note, velocity, dur, pass }] }`, `t` and `dur` as
  parts of the loop (`normalizeEvents`, `utils/noteRecorderLayout.js`); `midiWrite` reads it at the
  recorder's bars.

## Where it runs

In the panel view, and in an exported plug-in while its window is open. Not with the window shut:
there is nobody to answer a dialog, so the seven commands that reach a file say so in the console
and do nothing. The four that take files apart (`syxSplit`, `syxJoin`, `midiRead`, `midiWrite`)
work on bytes alone and run everywhere.

## Every command at a glance

| Command | What it does | Example |
|---|---|---|
| `open(opts, fn)` | Ask the person for a file to read | `open({ types = {"syx"} }, fn)` |
| `save(name, data, opts, fn)` | Ask where to save, and write it | `save("Bank A.syx", bytes, {}, fn)` |
| `read(file, fn)` | Read a chosen file again | `read(state.bank, fn)` |
| `write(file, data [, fn])` | Write a chosen file again, without asking | `write(state.out, bytes)` |
| `folder(opts, fn)` | Ask the person for a folder | `folder({ title = "Export bank to" }, fn)` |
| `list(folder [, opts])` | The files in a chosen folder | `list(dir, { types = {"syx"} })` |
| `saveIn(folder, name, data [, opts [, fn]])` | Write a file into a chosen folder | `saveIn(dir, "001 Brass.syx", bytes)` |
| `syxSplit(bytes)` | A `.syx` file's messages, one by one | `syxSplit(bytes)` → `{ {0xF0, …, 0xF7}, … }` |
| `syxJoin(messages)` | Messages as one `.syx` file | `syxJoin({ a, b })` |
| `midiRead(bytes)` | A MIDI file as tracks of notes | `midiRead(bytes).tracks[1].notes` |
| `midiWrite(song)` | Notes, or a Phrase Recorder's take, as a MIDI file | `midiWrite(ce.components.recorder.read("Recorder"))` |

## The file value, and the safety rules

`open`, `save` and `folder` give a file value, a table the script keeps and passes back:

| Field | What it holds |
|---|---|
| `name` | The file's name with its extension, such as `"Bank A.syx"`. No folder: the script never sees where the file is. |
| `type` | The extension, lower case, without the dot: `"syx"`. |
| `size` | Its size in bytes, when it was chosen. |
| `canWrite` | Whether `write` may write it again: on for a file from `save`, off for one from `open` unless `writable` was asked for. |
| `isFolder` | On for a value from `folder`. |

The safety rules, which no option turns off:

- **A dialog first.** A file or folder is reached only through a dialog the person answered in this
  session. The script cannot make a file value up: one it did not get from `ce.file` is refused.
- **Only the types asked for.** A dialog shows and accepts only the types the call names, from a
  fixed list: `syx`, `mid`, `json`, `txt`, `csv`. Never a program or a script file.
- **Writing over a file is the person's choice.** `save` asks before writing over an existing file,
  as every save dialog does; `write` writes again only to a file the person saved to, or opened with
  `writable`.
- **A folder is the folder and nothing above it.** `saveIn` and `list` cannot leave it; a name with
  a `/`, `\` or `..` in it is refused.
- **Up to 8 MB a file.** A `.syx` bank is a few hundred KB at most; a larger file is refused with its
  size named.
- **Gone when the panel closes.** A file value is not saved with the panel; next time, the person is
  asked again.

## Asking the person

A dialog waits for the person, so both commands give their answer to a function, not as a result.

### `ce.file.open(opts, fn) -> boolean`

Ask the person for a file, and get its contents.

Example: `ce.file.open({ types = {"syx"} }, function(file, data) … end)` asks for a `.syx` file and gives its bytes.

- `opts` (options, required): The options below. `types` is needed.<br>No `types`, or none from the list: rejected with a console error.
- `fn` (function, required): Called as fn(file, data) once the person has chosen, or fn(nil) when they cancel.<br>`data` is the contents: bytes for `syx` and `mid`, a value for `json`, text for `txt` and `csv`.

Good to know:

- Returns true when the dialog opened. Another `ce.file` dialog already open, or the panel window shut: false, with a console line.
- A `json` file that is not valid JSON: fn(file, nil), with a console error naming the line it stops at.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `types` | list of text | none, needed | The types the dialog accepts, from `syx`, `mid`, `json`, `txt`, `csv`. |
| `title` | text | "Open" | The dialog's title: say what the file is for, "Import a bank". |
| `multiple` | on/off | off | Let the person pick several files: fn is then called once per file, in the order chosen. |
| `writable` | on/off | off | Let `write` write this file again later, as a librarian keeps a bank file open. The dialog says so. |
| `read` | on/off | on | Off: give the file value only, and read it later with `read`. |

```lua
-- Lua
ce.file.open({ types = {"syx"}, title = "Import a bank" }, function(file, bytes)
  if not file then return end
  for _, message in ipairs(ce.file.syxSplit(bytes)) do
    ce.midi.sendSysex(message)
  end
end)
```
```js
// JavaScript
ce.file.open({ types: ["syx"], title: "Import a bank" }, (file, bytes) => {
  if (!file) return;
  for (const message of ce.file.syxSplit(bytes)) ce.midi.sendSysex(message);
});
```

### `ce.file.save(name, data, opts, fn) -> boolean`

Ask the person where to save, then write the file there.

Example: `ce.file.save("Bank A.syx", bytes, {}, fn)` offers to save the bytes as "Bank A.syx".

- `name` (text, required): The name the dialog suggests. Its extension sets the type.<br>No extension, or one not on the list: rejected with a console error.
- `data` (bytes, text or value, required): What to write. Bytes for `syx` and `mid`; text for `txt` and `csv`; for `json`, any value, written as `ce.storage.encodeJson` writes it.<br>The wrong kind for the type: rejected with a console error, nothing written.
- `opts` (options, optional): `title`, as `open` takes it; `indent`, for JSON.
- `fn` (function, optional): Called as fn(file) when it is written, fn(nil, error) when the person cancels or the write fails.

Good to know:

- The file value it gives has `canWrite` on, so the script can save to it again with `write` without asking.
- The person can change the name in the dialog; the file value carries the name they chose.
- Returns true when the dialog opened.

## The same file again

### `ce.file.read(file, fn) -> boolean`

Read a chosen file again, as it is now.

Example: `ce.file.read(state.bank, function(data) … end)` reads the bank file the person opened earlier.

- `file` (file, required): A file value from `open`, `save` or `list`.<br>Not one: rejected with a console error.
- `fn` (function, required): Called as fn(data) with the contents, as `open` gives them; fn(nil, error) when the file has gone or cannot be read.

Good to know:

- For a file edited in another program while the panel is open: read it again to see the change.
- Returns true when the read started.

### `ce.file.write(file, data [, fn]) -> boolean`

Write a chosen file again, without asking.

Example: `ce.file.write(state.bank, ce.file.syxJoin(state.messages))` saves the edited bank back to its file.

- `file` (file, required): A file value whose `canWrite` is on: from `save`, from `open` with `writable`, or from `saveIn`.<br>`canWrite` off: rejected with a console error saying the person must save to it first.
- `data` (bytes, text or value, required): As `save` takes it.
- `fn` (function, optional): Called as fn(true) when written, fn(false, error) when not.

Good to know:

- Written whole, through a temporary file, so a write cut short leaves the old file as it was.
- Returns true when the write started.

## A folder of files

For a bank kept as one file per patch, as many librarians and forums share them: one dialog for the
folder, then any number of files in it.

### `ce.file.folder(opts, fn) -> boolean`

Ask the person for a folder.

Example: `ce.file.folder({ title = "Export the bank to" }, function(dir) … end)` asks where to put a bank's files.

- `opts` (options, required): `title`; and `writable`, on to let `saveIn` write into it (the dialog says so).
- `fn` (function, required): Called as fn(folder) once chosen, fn(nil) when the person cancels.

Good to know:

- Returns true when the dialog opened.
- Only this folder: not the folders inside it, and nothing above it.

### `ce.file.list(folder [, opts]) -> list`

The files in a chosen folder.

Example: `ce.file.list(dir, { types = {"syx"} })` gives every `.syx` file in it.

- `folder` (file, required): A file value from `folder`.
- `opts` (options, optional): `types`, as `open` takes them; left out: every type on the list.

Good to know:

- Returns a list of file values, sorted by name as a person would sort them ("2" before "10"); none: an empty list.
- Each can be read with `read`. They are writable only when the folder was chosen `writable`.

### `ce.file.saveIn(folder, name, data [, opts [, fn]]) -> boolean`

Write one file into a chosen folder.

Example: `ce.file.saveIn(dir, "001 Brass.syx", bytes)` writes one patch of a bank.

- `folder` (file, required): A file value from `folder` chosen `writable`.<br>Not writable: rejected with a console error.
- `name` (text, required): The file's name, with an extension from the list.<br>A `/`, `\` or `..` in it: rejected with a console error.
- `data` (bytes, text or value, required): As `save` takes it.
- `opts` (options, optional): `replace`, on to write over a file of that name.
- `fn` (function, optional): Called as fn(file) when written, fn(nil, error) when not.

Good to know:

- A file of that name already there: not written over, and fn gets an error, unless `opts.replace` is on. The person agreed to a folder, not to losing what was in it.
- Returns true when the write started.

```lua
-- Lua: one .syx file per slot of a captured bank
ce.file.folder({ title = "Export the bank to", writable = true }, function(dir)
  if not dir then return end
  for slot, bytes in ipairs(state.patches) do
    ce.file.saveIn(dir, string.format("%03d.syx", slot), bytes)
  end
end)
```
```js
// JavaScript
ce.file.folder({ title: "Export the bank to", writable: true }, (dir) => {
  if (!dir) return;
  state.patches.forEach((bytes, i) => ce.file.saveIn(dir, `${String(i + 1).padStart(3, "0")}.syx`, bytes));
});
```

## SysEx files

A `.syx` file is SysEx messages one after another, nothing between them. These two need no dialog
and run everywhere, window shut too: they work on bytes the script already holds.

### `ce.file.syxSplit(bytes [, opts]) -> list`

The messages in a `.syx` file, one by one.

Example: `ce.file.syxSplit(bytes)` gives a list of messages, each from F0 to F7.

- `bytes` (bytes, required): The file's bytes, a list or hex text.
- `opts` (options, optional): The options below.

Good to know:

- Bytes outside any message (some files carry a header, or a stray byte between two messages) are left out, with a console warning saying how many and where.
- A message with no F7 at the end of the file: left out, with a console warning, unless `opts.partial` is on.
- Returns a list of messages, each a list of bytes; none: an empty list.
- To recognise each message, pass it to `ce.patch.fromBytes` or `ce.device.applyDump`.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `partial` | on/off | off | Keep a last message with no F7, so a cut-off file can still be looked at. |
| `prefix` | bytes | none | Only messages that start with these bytes, such as `{0xF0, 0x41}` for Roland: a mixed file keeps one maker's. |

### `ce.file.syxJoin(messages) -> bytes`

Messages as one `.syx` file's bytes.

Example: `ce.file.save("Bank A.syx", ce.file.syxJoin(state.messages), {})` saves a bank.

- `messages` (list, required): Messages, each a list of bytes or hex text.<br>One that does not start with F0 and end with F7: rejected with a console error naming which, nothing joined.

Good to know:

- Returns the bytes, in the order given, nothing added between.

## MIDI files

Standard MIDI files, types 0 and 1, the kind every DAW reads and writes. Like the SysEx pair, these
work on bytes and run everywhere.

### The song value

`midiRead` gives this table, and `midiWrite` takes it:

| Field | What it holds |
|---|---|
| `ticksPerBeat` | The file's time resolution. `midiWrite` uses 480 when it is left out. |
| `tempo` | Beats per minute at the start. A file with tempo changes keeps them in `tempos`, a list of `{ beat, bpm }`. |
| `timeSignature` | `{ 4, 4 }` and the like, at the start. |
| `tracks` | A list of tracks, each `{ name, notes, events }`. |
| `tracks[].notes` | `{ beat, note, velocity, length, channel }` per note: `beat` from 0, `length` in beats, `channel` from 1. |
| `tracks[].events` | Everything that is not a note, `{ beat, bytes }`: controllers, program changes, bend, SysEx. |

### `ce.file.midiRead(bytes [, opts]) -> song`

A MIDI file as tracks of notes.

Example: `ce.file.midiRead(data).tracks[1].notes` gives the first track's notes.

- `bytes` (bytes, required): The file's bytes.<br>Not a MIDI file (no "MThd" at the start): no result, with a console error.
- `opts` (options, optional): `track`, to read only that track, counted from 1.

Good to know:

- A note-on with velocity 0 is read as the note's end, as the file format says.
- A note never ended is given the length up to the end of its track, with a console warning naming it.
- Type 2 files (separate songs in one file) are refused with a console error: almost nothing writes them.

### `ce.file.midiWrite(song [, opts]) -> bytes`

A MIDI file's bytes from notes, a song, or a Phrase Recorder's take.

Example: `ce.file.midiWrite(ce.components.recorder.read("Recorder"))` gives the recorder's take as a MIDI file.

- `song` (table, required): One of three:<br>a song value, as `midiRead` gives it;<br>a list of notes, `{ beat, note, velocity, length, channel }`, written as one track;<br>a Phrase Recorder's section, as `ce.components.recorder.read()` gives it: its take, over its bars.<br>None of these: rejected with a console error.
- `opts` (options, optional): The options below.

Good to know:

- One track is written as type 0, several as type 1.
- A Phrase Recorder's take is stored as places in its loop; it is written at the recorder's bars and the transport's beats per bar.
- Returns the bytes, for `ce.file.save`.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `tempo` | number (BPM) | the song's, else `ce.time.tempo()` | The tempo written at the start. |
| `name` | text | none | The track name written into the file. |
| `channel` | number (1 to 16) | the notes' own, else 1 | The channel for notes that carry none. |

```lua
-- Lua
local bytes = ce.file.midiWrite(ce.components.recorder.read("Recorder"), { name = "Take 1" })
ce.file.save("Take 1.mid", bytes, {})
```
```js
// JavaScript
const bytes = ce.file.midiWrite(ce.components.recorder.read("Recorder"), { name: "Take 1" });
ce.file.save("Take 1.mid", bytes, {});
```

## Build steps

Four steps. The first is pure and goes into all seven preludes; the rest are native work, in the
editor's bridge and then in the plug-in's host. The plain-description rules in
[api-descriptions-handoff.md](api-descriptions-handoff.md) apply to every text above.

| Step | Commands | Builds on |
|---|---|---|
| 1. Taking files apart | `syxSplit`, `syxJoin`, `midiRead`, `midiWrite` | The `ce.midi` byte helpers; `normalizeEvents` in `utils/noteRecorderLayout.js` for a take's notes |
| 2. Dialogs in the editor | `open`, `save`, `read`, `write` | `NativeFileAccess` grants, the bridge's `FileChooser` code, `writeTextAtomically` (a bytes form of it) |
| 3. Folders | `folder`, `list`, `saveIn` | A folder grant in `NativeFileAccess`, which has none today |
| 4. The exported plug-in | the same seven, with the window open | `PlayerHost`, which has no file dialogs today |

Two things to get right in step 2:

- **The page holds an id, never a path.** The native side keeps a table of id → file for the
  session; the script's file value carries the id. Today's bridge sends paths to the page and checks
  them against the grants; for scripts, a path never leaves the native side.
- **Bytes cross the bridge as base64**, as `ce.midi.bytesToBase64` writes them, not as a list of
  numbers in JSON, which is four to five times larger.

## Open decisions

- [ ] Whether a panel may remember a file the person chose, so a librarian panel reopens the same
  bank file next session. The editor already re-grants the open panels' own paths from its settings;
  the same could keep a panel's chosen files, shown in the panel's settings where the person can
  remove them.
- [ ] Whether the preset screen's "Export .syx" should use the save dialog, so the file goes where
  the person chooses rather than to Downloads.
- [ ] Whether dropping a file on the panel should count as choosing it, through an `onFileDrop` event.
