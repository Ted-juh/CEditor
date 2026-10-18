# Bytes in scripts: lists, not a MemoryBlock

Status: **decided and built.** 2026-10-18.

JUCE has `MemoryBlock`, a resizable buffer of raw bytes with methods to append, insert, remove,
fill, read and write bit ranges (`getBitRange`, `setBitRange`), and convert to and from base64 and
hex. The scripting API had nothing like it, and the question was whether it should. This record
gives the answer and what was built instead: **bytes stay plain lists, and MemoryBlock's useful
operations became eleven helpers in `ce.midi` that take and return lists.**

## How scripts carry bytes

As lists of numbers, everywhere:

- **Arriving.** `onSysexIn` gets the message as a list, and `onMidiIn` has `midi.bytes`.
- **Built.** `buildDump` returns a list, and the encoders (`to7bit`, `nibblize`, `toAscii`,
  `checksum`) take and return lists.
- **Sent.** Every call that sends bytes also reads hex text such as `"F0 41 10 F7"`, by one rule in
  every runtime: a token is one byte.
- **Already native in two places.** The player's Python engine reads Python `bytes` as a list
  (`PythonScriptEngine.cpp`, `pyToVar`). The native handlers (C++, C#, Java) already have a raw
  byte type in their interface, `CE_BYTES` (`NativeHandlerAbi.h`).

The data is small. The largest dump in the repository's panels is the GAIA's at 512 bytes, the
AN1x's is 28, and a MIDI message is one to three.

## What a block would give

- **Speed on large data.** A list crosses each language bridge one number at a time; a block would
  cross as one piece. With dumps of the sizes above this does not matter. It would for multi-kilobyte
  bulk dumps, which no panel here has.
- **The common SysEx work in one place.** Packed bit fields (synths put several settings in one
  byte), multi-byte values at an offset, slicing, finding a header. Each script was doing these by
  hand in its own language.
- **Editing in place**, then recomputing a checksum.
- **Text forms for storage**, so a dump can live in a setting.

## What it would cost

- **It breaks the rule the API is built on.** The panel API spec says *"Only simple data crosses
  the boundary (numbers, strings, plain tables/objects) — no live cross-engine references"*
  (`panel-api-spec.md`, Q3). A block is a live object. `run()`, `emit()`, events, `state` and
  `saveSetting` all carry plain data, so a block would become a list at each of those edges anyway,
  or the rule would have to change.
- **Seven languages in two runtimes.** The editor runs JavaScript and TypeScript, Lua through
  wasmoon, Python through Pyodide, and the C++, C# and Java previews. The exported plugin runs its
  own Lua, JavaScript and Python engines and the native handlers. A new object type needs a binding
  in every one, behaving identically, under the tests that check they agree. The bridges are the
  fragile part already: `scriptPreludeAgreement.test.js` notes that passing Lua tables back and forth
  through wasmoon *"corrupts its heap after a few dozen crossings"*, and `panelRuntime.js` works
  around wasmoon handing lists over as objects.
- **Every language already has a byte type**: `bytes` and `bytearray` in Python, `Uint8Array` in
  JavaScript, `byte[]` in C# and Java, vectors in C++, binary-safe strings in Lua. A custom block
  would be a second way to do the same thing in each, and a less natural one.
- **Off-by-one in Lua.** MemoryBlock counts from 0 and Lua lists from 1. A 0-based object beside
  1-based tables invites exactly the drift this codebase works to prevent.
- **Little measured need.** `defineDump` already describes a dump's layout (fields, offsets,
  encodings, checksum) and decodes it, so scripts seldom edit raw bytes at all.

## What was built

Lists stay the one byte type. The operations worth having from MemoryBlock are helpers in `ce.midi`,
with short names in the namespace and flat names that say "bytes". A bare global called `read`,
`write`, `slice`, `put` or `find` is a word a script would reach for itself.

| `ce.midi.` | Flat name | What it does | MemoryBlock |
|---|---|---|---|
| `getBits(value, start, count)` | `getBits` | Reads a bit field from a number (up to 32 bits) or across a list | `getBitRange` |
| `setBits(value, start, count, bits)` | `setBits` | Writes one, returning a number or a new list | `setBitRange` |
| `read(bytes, offset, count [, opts])` | `bytesRead` | Reads a 1- to 4-byte value at an offset: 7- or 8-bit bytes, either order | — |
| `write(bytes, offset, count, value [, opts])` | `bytesWrite` | Writes one, returning a new list | — |
| `slice(bytes, offset [, count])` | `bytesSlice` | Copies a run of bytes out | `copyTo` |
| `put(bytes, offset, values)` | `bytesPut` | Writes a run of bytes in, overwriting | `copyFrom` |
| `find(bytes, pattern [, from])` | `bytesFind` | Finds where a pattern first occurs | — |
| `toHex(bytes)` / `fromHex(text)` | `bytesToHex` / `bytesFromHex` | `"F0 41 10 F7"`, the console's form | `toString` / `loadFromHexString` |
| `toBase64(bytes)` / `fromBase64(text)` | `bytesToBase64` / `bytesFromBase64` | Standard base64, for keeping a dump as text | `toBase64Encoding` / `fromBase64Encoding` |

`read` and `write` default to SysEx's 7-bit bytes, most significant first, the way `to7bit` writes
them. `toHex` existed nowhere before, so a script could read hex text but not write it, not even to
log a message readably.

## The rules, and why

The same in the WebView runtime and the Lua, JavaScript and Python preludes:

- **Offsets and bit positions count from 0, in every language, Lua included.** Dump layouts count
  from 0, synth manuals give addresses from 0, and a script ported from one language to another
  must not change its numbers. Lua's own lists still start at 1; these helpers do not pretend
  otherwise, they just never ask for a Lua index.
- **Bits are counted as MemoryBlock counts them**: lowest bit first, running on from one byte into
  the next, eight to a byte. `getBits([0x80, 0x01], 7, 2)` is 3.
- **A list may also be hex text**, read by the rule every send uses, or a typed array in
  JavaScript, or `bytes` or a `bytearray` in Python. A list always comes back, so what a script does
  next is the same everywhere.
- **Each byte is read modulo 256**, so `toHex([300])` is `"2C"`.
- **Every list that comes back is new.** The one passed in is never changed, so a dump a script was
  handed cannot be edited by accident.
- **A mistake answers nothing and says what it was**: bits or bytes past the end, a value that does
  not fit, an offset or count that is not a whole number in range, text that is not hex or not
  base64. Nothing is cut down, wrapped or padded into a plausible answer, because a plausible wrong
  byte sent to a synth is the failure every fix on 2026-10-18 was about.
- **One exception: a write may run past the end and grow the list**, since that is how a message is
  built. It cannot start beyond the end, which would leave a gap.
- **Not finding a pattern is an answer**, so `find` returns nothing then and writes nothing to the
  console.

## Limits, on purpose

- `read` and `write` take 1 to 4 bytes (28 bits of 7-bit data, 32 of 8-bit). That covers every
  SysEx value seen here, and it keeps the arithmetic exact in JavaScript's doubles.
- A number's bit fields stop at bit 31. Past that the three languages' integers differ (Lua's are
  64-bit, JavaScript's doubles are exact to 53 bits, Python's are unbounded).
- Bit fields across a list count 8 bits a byte. A value spread over 7-bit SysEx bytes is a `read`
  with `bits: 7`, not a bit range.
- There is no insert or remove: `put` overwrites, as `copyFrom` does. A script that needs to insert
  joins lists in its own language.

## How it is held together

- `scriptPreludeAgreement.test.js` runs every helper in all four engines and requires the same
  values. That includes negative numbers and full 32-bit fields, where the languages' integers
  would part company if the arithmetic differed. It also requires the same words for 36 refusals
  and silence in three cases that must not refuse. A separate test there checks each language's own
  byte type.
- `scriptBytes.test.js` pins the behaviour itself: MemoryBlock's bit order, inputs left unchanged,
  growth, and base64 against node's own encoder.
- `ScriptRuntimeTests` and `PythonScriptEngineTests` call the helpers through their namespaced names
  in the real Lua, JavaScript and embedded Python engines.
- Every helper has a derived example in `tools/scripts/apiExamples.mjs`, re-run by
  `apiExamples.test.js`.

## When to reopen this

If a measured case shows lists are too slow, such as a multi-kilobyte bulk dump stalling the editor
when it crosses into Lua. Even then the fix belongs inside the engines (the native handlers'
`CE_BYTES` is the shape of it), not in a block object that scripts see and that every runtime has to
bind.
