# `ce.verify`: asking the synth whether it holds what was sent

*Designed and approved by the owner on 2026-10-27. Built on 2026-10-28 on the `script-modules-build` branch; what differs from this record is listed in [the roadmap](script-modules-roadmap.md).* `ce.verify` asks the synth what it
holds and compares it with what the panel sent: 9 commands and 1 event. Each check ends in a report
that names every parameter that matched, every one that differed (with both values), and every one
it could not check, with the reason. It runs everywhere, as `ce.device` does, and the comparing is
done once, in the device layer, not in each language. Every entry is written in the scripting
manual's form, so it can go into `panelApi.js` as it stands. Sixth in
[Script modules: what is missing](script-modules-roadmap.md).

## What exists today

- **Reading the synth.** `ce.device.requestDump(kind, fn)` sends the profile's request and hands
  `fn` the decoded values. That is the only fresh read a script has.
- **`ce.device.read` cannot be the read-back.** It gives the last value the panel knows, and every
  value the panel sends is written into that store as it goes out
  (`DeviceProfileServiceMessages.cpp`). Read after a write, it gives back what was sent, whatever the
  synth did.
- **The same codec both ways.** A dump is built with the same encoder a knob uses
  (`validateAndEncodeValue`) and decoded by its exact inverse (`decodeDumpParameterValue`); a C++
  test round-trips GAIA dumps (`DeviceProfileEngineTests.cpp`). So sent and read-back values are in
  the same units and can be compared directly.
- **Dump lengths.** Every dump definition carries `completion.expectedBytes` and
  `expectedMessages`, and the engine compares an arriving dump with them and lists the payload bytes
  no parameter reads (`missingRangesForCoverage`). No script or author tool asks about either.
- **Checks that exist, but not for scripts or hardware.** `verifyRoundTrip` (`captureInference.js`)
  writes boundary values, reads them back and lists the failures, but runs only against a fake synth
  in tests (`fakeSynth.js`). The DPD tools check that a profile's codecs pack and unpack; their
  `verifiedRoundTrip` never touched a synth. A bulk send is "verified" when the expected dumps
  arrived, without comparing a value.
- **What scripts build by hand.** The GAIA panel's "Effect probe" requests a dump, reads each value,
  changes one, and requests again to see what moved.

The roadmap calls this "the verifiable half of the project's aim, which no script can do today".
[raising-the-bar.md](raising-the-bar.md) §G asks for the same thing as profile contracts
(`roundTrip`, `dumpStable`) and a report of coverage rather than a green tick.

## Everything at a glance

| Command | Changes the synth | What it answers |
|---|---|---|
| `ce.verify.coverage` | no, sends nothing | Which parameters can be checked at all and why not the rest; whether each dump's length adds up |
| `ce.verify.check` | no | Does the synth hold what the panel shows? |
| `ce.verify.dump` | no | Does a dump come back the same when asked twice? |
| `ce.verify.write` | yes | Did this value land? |
| `ce.verify.probe` | yes, then puts it back | Does the parameter take its lowest, middle and highest values? |
| `ce.verify.patch` | yes | Did the whole sound land? |
| `ce.verify.summary` | no | A report as one line of text |
| `ce.verify.running`, `cancel` | no | What check runs now; stop it |
| `verifyDone` (event) | — | A check finished, for any script that shows results |

## Rules every check keeps

- **Three answers, never two.** Each parameter ends as `matched`, `differed` or `unchecked`. A
  parameter the check could not read is never counted as a match, and `ok` is true only when nothing
  differed and nothing was left unchecked for a reason the check could have avoided (no reply, the
  user moved it).
- **A fresh reply every time.** The read-back is a dump the synth sent after the check asked for it,
  never the panel's store. A dump that was already on its way, or one the synth sent unasked, does
  not count.
- **The profile's own timing.** Each request waits the profile's `timeoutMs` for that request, not
  the 3000 ms `requestDump` uses, and is sent again `retries` times before the dump counts as "no
  reply". Messages keep the profile's `minDelayBetweenMessagesMs`.
- **When two values are the same.** Compared in the parameter's own units, as the codec gives them:
  - numbers: the same after both are rounded to what the wire can carry (a `float` parameter is sent
    rounded);
  - text: the same after trailing padding and spaces are removed, as the synth pads a name to its
    length;
  - choices: the same choice id; a byte the profile does not name differs, with the raw number shown;
  - on/off: the same state.
- **Only `write`, `probe` and `patch` change the synth**, and their names say so. `probe` puts the
  old value back when it is done, and when it is cancelled.
- **One check at a time per device.** Starting a second while one runs returns false; the first is
  not disturbed. Checks on two different devices may run together.
- **A hand on a knob wins.** A parameter the user or a script moves while it is being checked ends
  `unchecked`, with the reason `moved`, and the check does not write it back.
- **Nothing waits.** Every check that talks to the synth returns at once and calls its function with
  the report when done; the same report is raised as `verifyDone`.

## The report

Every check gives the same report, so one script can show the result of any of them.

| Field | What it holds |
|---|---|
| `kind` | Which check: `"check"`, `"dump"`, `"write"`, `"probe"` or `"patch"`. |
| `role` | The device. |
| `ok` | True when nothing differed, every dump had the length the profile says, and nothing was left unchecked by no reply, a bad checksum, a move or a cancel. Parameters the profile cannot read at all do not make it false; `coverage` lists those. |
| `total` | How many parameters the check was asked about. |
| `matched` | The ids that matched. |
| `differed` | A list of `{ id, name, expected, got, raw }`: what the panel sent or shows, what the synth gave back, and for a choice the synth gave a byte the profile does not name, that byte. |
| `unchecked` | A list of `{ id, name, why }`. |
| `dumps` | A list of `{ kind, status, bytes, expectedBytes }` for every dump asked for: what arrived and what the profile says should. `status` is `"ok"`, `"noReply"`, `"badChecksum"`, `"incomplete"` (fewer messages or bytes than expected) or `"wrongLength"` (a different length than the profile says). |
| `probes` | `probe` only: a list of `{ id, value, got, same }`, one per value tried. |
| `ms` | How long it took. |
| `cancelled` | True when `cancel` stopped it. |

**Why a parameter is left unchecked.**

| `why` | Meaning | Fix |
|---|---|---|
| `"notInDump"` | No dump in the profile holds it, so the synth cannot be asked (74 parameters on the AN1x, 1 on the GAIA). | None: the synth does not report it. |
| `"noRequest"` | A dump holds it, but the profile has no request for that dump. | Add the request to the profile. |
| `"noReply"` | The request was sent, and sent again, and nothing came back in time. | Check the cable, the device id, or the synth's receive setting. |
| `"badChecksum"` | A reply came back with a wrong checksum. | Usually a cable or interface problem; check again. |
| `"notWritable"` | `write`, `probe`, `patch`: the profile says it cannot be written. | None. |
| `"moved"` | The user or a script changed it during the check. | Check again. |
| `"cancelled"` | `cancel` stopped the check before it was read. | Check again. |

Good to know:

- A parameter held in a dump the profile can request is checked whatever its `access.canRead` says;
  that flag is read by no code today and is false on every AN1x parameter, the ones in dumps too.

## Checks that send nothing

### `ce.verify.coverage([opts]) -> table`

Which parameters a check can read back, and why not the rest. Sends nothing; answers at once.

Example: `ce.verify.coverage().checkable` is how many of the synth's parameters can be verified.

- `opts` (options, optional): `role`, the device; `ids`, a list of parameter ids; `group`, a
  parameter group from the profile. Left out: every parameter of the main device.

Good to know:

- Returns `{ role, total, checkable, unchecked, dumps }`: `checkable` a count, `unchecked` a list of
  `{ id, name, why }` with `why` `"notInDump"` or `"noRequest"`, `dumps` a list of
  `{ kind, expectedBytes, layoutBytes, unread }` for every dump a check of these parameters would ask
  for.
- **Dump sizes, checked without a synth.** `expectedBytes` is the length the profile says the dump
  has (`completion.expectedBytes`, the number a synth manual gives). `layoutBytes` is what the
  profile's own layout adds up to: header, payload, checksum and end byte. When the two differ, the
  profile is wrong in one of them, and a real dump will be refused or read at the wrong offsets.
- `unread` lists the payload byte ranges no parameter reads, as `{ from, to }`. A manual that lists
  every byte of the dump lets an author see what is still missing.
- Works in the editor without a synth connected; it reads only the profile.
- The question a profile author asks first: on the AN1x it answers 1,222 of 1,296.

### `ce.verify.check([opts,] fn) -> boolean`

Ask the synth for its values and compare them with what the panel shows. Writes nothing.

Example: `ce.verify.check(function(report) log(ce.verify.summary(report)) end)` checks every
parameter and logs one line.

- `opts` (options, optional): `role`, `ids` and `group`, as `coverage` takes them.
- `fn` (function, required): Called with the report.

Good to know:

- Asks only for the dumps that hold the parameters asked about, one after another.
- `expected` in the report is what the panel holds for the parameter now; `got` is what the synth
  reported.
- For a panel opened on a synth that was already playing: it says whether the two agree before
  anything is sent.
- Returns true when started; false when a check already runs on that device, or the device is not
  connected.

### `ce.verify.dump(kind [, opts], fn) -> boolean`

Ask for the same dump twice and compare the replies. Writes nothing.

Example: `ce.verify.dump("common", function(report) log(#report.differed) end)` logs how many values
changed between two asks.

- `kind` (text, required): The dump, by the id the profile gives it.
- `opts` (options, optional): `times`, how many asks, 2 to 10 (default 2); `gapMs`, the wait between
  them (default 500); `role`.
- `fn` (function, required): Called with the report.

Good to know:

- A value that changes when nothing was sent is one the synth changes by itself: a counter, a
  free-running phase, a clock. A check that compares it will always find it different; the profile
  should mark it so (see [Open decisions](#open-decisions)).
- `differed` holds the parameters that changed, with `expected` the first reply's value and `got` the
  last; the report also gains `bytes`, the offsets that changed and belong to no parameter.
- This is the `dumpStable` contract `raising-the-bar.md` asks for.

```lua
-- Lua: a "Check" button that shows the result on an LCD
function onClick()
  local started = ce.verify.check(function(report)
    ce.components.lcd.text("Display", 1, ce.verify.summary(report))
  end)
  if not started then ce.components.lcd.text("Display", 1, "Busy or not connected") end
end
```
```js
// JavaScript
function onClick() {
  const started = ce.verify.check((report) => {
    ce.components.lcd.text("Display", 1, ce.verify.summary(report));
  });
  if (!started) ce.components.lcd.text("Display", 1, "Busy or not connected");
}
```

## Checks that write

### `ce.verify.write(id, value [, opts], fn) -> boolean`

Send one value, ask the synth for it back, and compare.

Example: `ce.verify.write("tone1.filter.cutoff", 64, fn)` sends 64 and reports whether the synth
holds 64.

- `id` (text, required): The parameter id, as the profile names it.
- `value` (number, text or on/off, required): The value, in the parameter's own units, as
  `ce.device.write` takes it.
- `opts` (options, optional): `role`; `settleMs`, the wait between the write and the ask (default
  100).
- `fn` (function, required): Called with the report.

Good to know:

- Sent as `ce.device.write` sends it, so the panel's control follows, as it does for that.
- `ce.device.write` returns true when the message left; this returns the report that says whether it
  landed.

### `ce.verify.probe(id [, opts], fn) -> boolean`

Try a parameter at several values, read each back, then put the old value back.

Example: `ce.verify.probe("tone1.lfo.rate", fn)` tries the lowest, middle and highest rate and the
two next to each end.

- `id` (text, required): The parameter id.
- `opts` (options, optional): `values`, the list to try; `role`; `settleMs`, as `write` takes it.
- `fn` (function, required): Called with the report.

Good to know:

- Left out, `values` is: for a number, the lowest, the one above it, the middle, the one below the
  highest, and the highest; for a choice, every choice up to 16, then the first, middle and last;
  for on/off, both; for text, a name of full length and an empty one.
- The report's `probes` lists each value tried and what came back; `differed` lists the values that
  did not land.
- The old value is sent back when the probe ends, fails or is cancelled. The report gains
  `restored`: true when the old value was read back too.
- For a profile author: a parameter whose lowest and highest values both land has a range and codec
  the synth agrees with. This is what the capture tools' `verifyRoundTrip` does today, against a
  fake synth only.

### `ce.verify.patch([opts,] fn) -> boolean`

Send the panel's whole sound, ask for every dump that holds it, and compare every value.

Example: `ce.verify.patch(fn)` after building a sound in the panel, before saving it on the synth.

- `opts` (options, optional): `role`; `ids` or `group`, as `coverage` takes them; `via`, `"dump"` to
  send whole dumps or `"parameters"` to send one value at a time (default: what the profile delivers
  by, see below); `send`, false to compare without sending first, which is `check`.
- `fn` (function, required): Called with the report.

Good to know:

- Once `ce.patch` is built, `via` defaults to the profile's `patch.deliver`, and `opts.scope` takes a
  scope from `patch.scopes` ([ce-patch-module.md](ce-patch-module.md)). Until then it defaults to
  `"dump"` where the profile can build the dump, else `"parameters"`.
- An AN1x voice is 5 dumps; a GAIA tone, 8 address blocks. Each is asked for in turn, with the
  profile's gap between them.
- Values the synth always changes by itself (see `dump`) are left out once the profile marks them.

```lua
-- Lua: probe the LFO rate and log what failed
function onClick()
  ce.verify.probe("tone1.lfo.rate", function(report)
    for _, p in ipairs(report.probes) do
      if not p.same then log(p.id .. ": sent " .. tostring(p.value) .. ", got " .. tostring(p.got)) end
    end
  end)
end
```
```js
// JavaScript
function onClick() {
  ce.verify.probe("tone1.lfo.rate", (report) => {
    for (const p of report.probes) {
      if (!p.same) log(`${p.id}: sent ${p.value}, got ${p.got}`);
    }
  });
}
```

## Running checks

### `ce.verify.summary(report [, opts]) -> text`

A report as one line.

Example: `ce.verify.summary(report)` gives `"1180 of 1222 match, 3 differ, 39 unchecked (no reply:
tone3)"`.

- `report` (table, required): A report from any check.
- `opts` (options, optional): `width`, the most characters to give, for an LCD line; the reason in
  brackets goes first, then the words are shortened (`"1180/1222 ok 3 diff 39 unchk"`).

Good to know:

- Counts, not names; a cancelled check says so first.
- Reads only the report, so it runs anywhere and answers at once.

### `ce.verify.running([role]) -> table`

The check running now on a device.

Example: `ce.verify.running()` while a patch check runs gives
`{ kind = "patch", done = 3, total = 5, ms = 1840 }`.

- `role` (text, optional): The device. Left out: the main device.

Good to know:

- Returns `{ kind, role, done, total, ms }`: `done` and `total` count dumps asked for, so a script
  can show progress. Nothing running: nothing.

### `ce.verify.cancel([role]) -> boolean`

Stop the check running on a device.

Example: `ce.verify.cancel()` from a "Stop" button.

- `role` (text, optional): The device.

Good to know:

- The check's function is still called, with what was read so far and `cancelled` true; what was not
  read is `unchecked` with `"cancelled"`.
- A `probe` sends the old value back before it ends.
- Returns true when a check was running.

### `verifyDone`: a check finished

The payload is the report, as the check's own function got it.

Good to know:

- Panel-wide: a button's script can start a check and a display's script can show every result, with
  `on("verifyDone", fn)` or `onVerifyDone(report)` in the panel script.
- Raised after the check's own function has run, cancelled checks too.

## Found on the way

Problems in the dump path today. A check cannot be trusted until the first four are fixed, so they
are build step 1.

| What | Where | Effect today |
|---|---|---|
| `retries` on a request is stored and never used | `DeviceProfileServiceRequests.cpp`: a timed-out request is erased | One lost reply is a failed read |
| `requestDump` waits 3000 ms whatever the profile says | `panelRuntime.js` dump waiters | The AN1x's requests say 4000 ms; a slow reply is reported as none |
| A dump waiter is resolved by any dump of that kind | `dumpWaiters`, matched on the kind alone | A dump the synth sent unasked, or one already on its way, is taken as the answer |
| A request answered by several messages is never tied to it | `resolvePendingRequestsForDump` skips them | No callback for those requests |
| `access.canRead` is read by no code | Every profile | False on all 1,296 AN1x parameters, the 1,222 in dumps too |
| The `deviceParameters` access filter takes `writable`, `readonly`, `realtimeWarning` | `DeviceProfileServiceInternal.h` | The manual's example passes `"readwrite"`, which the filter ignores, so every parameter comes back; the summary's "read, write, or both" names no value it accepts |
| `diffSnapshots` compares with `Number()` | `snapshotModel.js` | A choice or a name always counts as changed; `ce.patch.diff` builds on it |

A dump's expected length can also hide a mistake. The DPD emitter writes `completion.expectedBytes`
from the layout, but when the author gives the manual's number (`completion.bytes`) it uses that
instead without comparing the two (`emit-legacy-core.mjs`). `coverage` reports the difference; the
emitter should warn too.

The `ce.patch` record said the GAIA has no dumps; the profile the GAIA panel uses has 26 address
blocks. Corrected in the same branch.

## Build steps

Four steps. The comparing and the report live once in the device layer, in the C++ engine and its
JavaScript twin, so the seven languages only pass calls through. Each step is tested against
`fakeSynth.js`, which already has a value that changes by itself, with one shared table of cases,
one for every `why`. The plain-description rules in
[api-descriptions-handoff.md](api-descriptions-handoff.md) apply to every text above.

| Step | What | Builds on |
|---|---|---|
| 1. Requests that can be trusted | `retries` sent again; each request's own `timeoutMs`; a reply counts only when it came after its request; several-message replies tied to their request | `DeviceProfileServiceRequests.cpp`, the dump waiters in `panelRuntime.js` |
| 2. Comparing without writing | `coverage` (with dump lengths and unread bytes), `check`, `dump`, `summary`, `running`, `cancel`, `verifyDone`; the rules for when two values are the same | `DumpParseResult`, the codec pair, `missingRangesForCoverage`, `diffPayloads` and `volatileMask` in `captureInference.js` |
| 3. Comparing after writing | `write`, `probe`, `patch` | `verifyRoundTrip`'s boundary values, `buildDumpMessage`, `sendDump` |
| 4. Fix `diffSnapshots` | Compare choices by id and text as text, with the same rules as step 2 | `snapshotModel.js`; needed by `ce.patch.diff` too |

## Open decisions

- [ ] A profile field for values the synth changes by itself: `volatile: true` on a parameter, and
  byte offsets on a dump, so checks leave them out. `ce.verify.dump` finds them; nothing records
  them yet.
- [ ] Whether `access.canRead` is filled in from the dumps when a profile is loaded, or removed, since
  no code reads it and the AN1x's values are wrong.
- [ ] Whether `write` and `probe` should ask for one address instead of a whole block where the synth
  allows it (Roland's RQ1 can ask for one parameter). The player has a hard-coded Roland path for
  this (`syncFromSynth` in `Player.svelte`); a profile request per address would make it general and
  the checks faster.
- [ ] Whether a check on real hardware can be saved into the profile as proof (which synth, which
  firmware, when), so "verified" in a profile means checked on a synth, as `raising-the-bar.md` asks.
- [ ] Whether `ce.patch.write` (to a slot on the synth) checks by default.
