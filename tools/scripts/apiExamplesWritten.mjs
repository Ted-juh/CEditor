// apiExamplesWritten.mjs — hand-written examples for the members that are not a pure function.
//
// Anything with a side effect, a host dependency or a callback lives here: there is no result to
// derive, so the example has to be written and the honesty comes from validation instead —
// gen-api-explorer refuses a key that is not a member, and refuses any `ce.*` path inside an example
// that does not resolve.
//
// `code` means Lua and JavaScript are byte-identical, which is true for most single calls and is
// worth expressing rather than pasting twice. `lua` + `js` when they genuinely differ: table versus
// object literals, `..` versus template strings, `function() end` versus arrow functions.
//
// Examples use the NAMESPACED spelling, because that is the one to reach for; ce.core is written
// bare because it is the global module and never namespaced.

export const WRITTEN = {
  /* ------------------------------------------------------------------ ce.core */
  set: {
    lua: `set("Cutoff.value", 0.72)\nset("Cutoff.normalizedValue", 0.5)   -- 0..1 of its own range\nset("Cutoff.value", 0.72, { transmit = false })`,
    js: `set("Cutoff.value", 0.72);\nset("Cutoff.normalizedValue", 0.5);   // 0..1 of its own range\nset("Cutoff.value", 0.72, { transmit: false });`,
  },
  get: {
    lua: `local hz = get("Cutoff.value")\nlocal t  = get("Cutoff.normalizedValue")\nlocal m  = get("Cutoff", "midiValue")`,
    js: `const hz = get("Cutoff.value");\nconst t  = get("Cutoff.normalizedValue");\nconst m  = get("Cutoff", "midiValue");`,
  },
  log: { code: 'log("cutoff now", get("Cutoff.value"))' },
  logWarn: { code: 'logWarn("no device profile — running open loop")' },
  logError: {
    lua: `logError("could not build the dump")\n-- prints; it does NOT stop the handler. To stop, use error().`,
    js: `logError("could not build the dump");\n// prints; it does NOT stop the handler. To stop, throw.`,
  },
  on: {
    lua: `on("Cutoff", "onChange", function(info)\n  log("cutoff ->", info.value)\nend)\n\non("*", "onNoteIn", function(n) log(n.note) end)`,
    js: `on("Cutoff", "onChange", (info) => {\n  log("cutoff ->", info.value);\n});\n\non("*", "onNoteIn", (n) => log(n.note));`,
  },
  off: { code: 'off("Cutoff", "onChange")' },
  emit: {
    lua: `emit("patchLoaded", { name = "Bass 3", bank = 2 })`,
    js: `emit("patchLoaded", { name: "Bass 3", bank: 2 });`,
  },
  run: {
    lua: `local ok = run("Init.reset")\nrun("Init.reset", { silent = true })`,
    js: `const ok = run("Init.reset");\nrun("Init.reset", { silent: true });`,
  },
  noTransmit: {
    lua: `-- an Init Patch button: move every control, send nothing\nnoTransmit(function()\n  set("Cutoff.value", 1)\n  set("Reso.value", 0)\nend)`,
    js: `// an Init Patch button: move every control, send nothing\nnoTransmit(() => {\n  set("Cutoff.value", 1);\n  set("Reso.value", 0);\n});`,
  },
  transmit: {
    lua: `-- force a send from inside an inbound handler, which is silent by default\non("*", "onCcIn", function(cc)\n  transmit(function() set("Cutoff.midiValue", cc.value) end)\nend)`,
    js: `// force a send from inside an inbound handler, which is silent by default\non("*", "onCcIn", (cc) => {\n  transmit(() => set("Cutoff.midiValue", cc.value));\n});`,
  },
  watch: {
    lua: `watch("Cutoff.value", function(now, before)\n  set("Readout.Text.content", ce.math.roundTo(now, 1) .. " Hz")\nend)`,
    js: `watch("Cutoff.value", (now, before) => {\n  set("Readout.Text.content", \`\${ce.math.roundTo(now, 1)} Hz\`);\n});`,
  },
  compute: {
    lua: `-- a value that is always derived, never set by hand\ncompute("Total.value", function()\n  return get("A.value") + get("B.value")\nend)`,
    js: `// a value that is always derived, never set by hand\ncompute("Total.value", () => get("A.value") + get("B.value"));`,
  },
  intercept: {
    lua: `-- this knob only takes even numbers, for every write from anywhere\nintercept("Steps.value", function(wanted)\n  return ce.math.snap(wanted, 2)\nend)`,
    js: `// this knob only takes even numbers, for every write from anywhere\nintercept("Steps.value", (wanted) => ce.math.snap(wanted, 2));`,
  },
  defineAction: {
    lua: `ce.core.action("reset", function(args)\n  noTransmit(function() set("Cutoff.value", 1) end)\n  return true\nend)\n-- another script, any language: run("Init.reset")`,
    js: `ce.core.action("reset", (args) => {\n  noTransmit(() => set("Cutoff.value", 1));\n  return true;\n});\n// another script, any language: run("Init.reset")`,
  },

  /* ------------------------------------------------------------------ ce.midi */
  sendCC: { code: 'ce.midi.sendCC(1, 74, 64)   -- channel 1..16, cc 0..127' },
  sendNRPN: { code: 'ce.midi.sendNRPN(1, 1, 32, 8192)' },
  sendRPN: { code: 'ce.midi.sendRPN(1, 0, 0, 2)   -- pitch-bend range = 2 semitones' },
  sendSysex: {
    lua: `ce.midi.sendSysex({ 0xF0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7F, 0x41, 0xF7 })`,
    js: `ce.midi.sendSysex([0xF0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7F, 0x41, 0xF7]);`,
  },
  sendMidi: {
    lua: `ce.midi.sendMidi({ 0x90, 60, 100 })   -- raw: note on, ch 1, C4`,
    js: `ce.midi.sendMidi([0x90, 60, 100]);   // raw: note on, ch 1, C4`,
  },
  sendNote: {
    lua: `ce.midi.sendNote(1, "C3", 100)\nce.midi.sendNote(1, 60, 100, 250)   -- and release it after 250 ms`,
    js: `ce.midi.sendNote(1, "C3", 100);\nce.midi.sendNote(1, 60, 100, 250);   // and release it after 250 ms`,
  },
  sendNoteOff: { code: 'ce.midi.sendNoteOff(1, "C3")' },
  sendProgramChange: { code: 'ce.midi.sendProgramChange(1, 12, 0, 2)   -- bank select first, then PC' },
  sendPitchBend: { code: 'ce.midi.sendPitchBend(1, 8192)   -- 0..16383, 8192 is centre' },
  sendAftertouch: {
    lua: `ce.midi.sendAftertouch(1, 90)       -- channel pressure\nce.midi.sendAftertouch(1, 90, 60)   -- polyphonic, for C4 only`,
    js: `ce.midi.sendAftertouch(1, 90);       // channel pressure\nce.midi.sendAftertouch(1, 90, 60);   // polyphonic, for C4 only`,
  },
  sendClock: {
    lua: `-- 24 per quarter note: at 120bpm that is every 20.83 ms\nce.time.startTimer("clock", 20.83)\nfunction onTimer(info)\n  if info.id == "clock" then ce.midi.sendClock() end\nend`,
    js: `// 24 per quarter note: at 120bpm that is every 20.83 ms\nce.time.startTimer("clock", 20.83);\nfunction onTimer(info) {\n  if (info.id === "clock") ce.midi.sendClock();\n}`,
  },
  sendTransport: { code: 'ce.midi.sendTransport("start")   -- "start" | "continue" | "stop"' },
  sendSongPosition: { code: 'ce.midi.sendSongPosition(16)   -- MIDI beats: 16 = bar 3 at 4/4' },
  panic: {
    lua: `ce.midi.panic()                              -- all 16 channels\nce.midi.panic({ channel = 1, resetControllers = false })`,
    js: `ce.midi.panic();                             // all 16 channels\nce.midi.panic({ channel: 1, resetControllers: false });`,
  },
  interceptMidiIn: {
    lua: `-- drop everything on channel 16 before the panel sees it\nce.midi.interceptIn(function(bytes)\n  if (bytes[1] & 0x0F) == 15 then return false end\n  return bytes\nend)`,
    js: `// drop everything on channel 16 before the panel sees it\nce.midi.interceptIn((bytes) => {\n  if ((bytes[0] & 0x0F) === 15) return false;\n  return bytes;\n});`,
  },
  interceptMidiOut: {
    lua: `-- transpose everything this panel sends up an octave\nce.midi.interceptOut(function(bytes)\n  local status = bytes[1] & 0xF0\n  if status == 0x90 or status == 0x80 then bytes[2] = bytes[2] + 12 end\n  return bytes\nend)`,
    js: `// transpose everything this panel sends up an octave\nce.midi.interceptOut((bytes) => {\n  const status = bytes[0] & 0xF0;\n  if (status === 0x90 || status === 0x80) bytes[1] += 12;\n  return bytes;\n});`,
  },
  feedMidi: {
    lua: `-- inject bytes as though the device had sent them\nce.midi.feed({ 0xB0, 74, 100 })`,
    js: `// inject bytes as though the device had sent them\nce.midi.feed([0xB0, 74, 100]);`,
  },
  routeMidi: {
    lua: `ce.midi.route("mainSynth", function()\n  ce.midi.sendCC(1, 74, 64)   -- goes to that role's port\nend)`,
    js: `ce.midi.route("mainSynth", () => {\n  ce.midi.sendCC(1, 74, 64);   // goes to that role's port\n});`,
  },

  /* ------------------------------------------------------------------ ce.device */
  requestDump: {
    lua: `ce.device.requestDump("patch", function(bytes)\n  ce.device.applyDump(bytes)\nend, { timeoutMs = 2000 })`,
    js: `ce.device.requestDump("patch", (bytes) => {\n  ce.device.applyDump(bytes);\n}, { timeoutMs: 2000 });`,
  },
  applyDump: {
    lua: `-- from the device, or from an already-decoded map with no device at all\nce.device.applyDump(bytes)\nce.device.applyDump({ ["osc1.wave"] = 2, ["filter.cutoff"] = 96 })`,
    js: `// from the device, or from an already-decoded map with no device at all\nce.device.applyDump(bytes);\nce.device.applyDump({ "osc1.wave": 2, "filter.cutoff": 96 });`,
  },
  sendDump: { code: 'ce.device.sendDump("patch")' },
  buildDump: {
    lua: `local bytes = ce.device.buildDump("patch")\nif bytes then ce.storage.saveSetting("lastPatch", bytes) end`,
    js: `const bytes = ce.device.buildDump("patch");\nif (bytes) ce.storage.saveSetting("lastPatch", bytes);`,
  },
  deviceRead: {
    lua: `local cutoff = ce.device.read("filter.cutoff")\nif cutoff == nil then log("the synth has never reported it") end`,
    js: `const cutoff = ce.device.read("filter.cutoff");\nif (cutoff === undefined) log("the synth has never reported it");`,
  },
  deviceWrite: { code: 'ce.device.write("filter.cutoff", 96)   -- in the parameter\'s own units' },
  deviceDefineParameter: {
    lua: `ce.device.defineParameter("osc1.fine", {\n  name = "Osc 1 Fine", group = "Oscillator",\n  type = "int", min = -64, max = 63, cc = 76,\n})`,
    js: `ce.device.defineParameter("osc1.fine", {\n  name: "Osc 1 Fine", group: "Oscillator",\n  type: "int", min: -64, max: 63, cc: 76,\n});`,
  },
  deviceDefineDump: {
    lua: `ce.device.defineDump("patch", {\n  request = { 0xF0, 0x41, 0x11, 0xF7 },\n  header  = { 0xF0, 0x41, 0x12 },\n  checksum = "roland",\n})`,
    js: `ce.device.defineDump("patch", {\n  request: [0xF0, 0x41, 0x11, 0xF7],\n  header:  [0xF0, 0x41, 0x12],\n  checksum: "roland",\n});`,
  },
  deviceBind: {
    lua: `ce.device.bind("Cutoff", "filter.cutoff", { role = "mainSynth" })`,
    js: `ce.device.bind("Cutoff", "filter.cutoff", { role: "mainSynth" });`,
  },
  deviceUnbind: { code: 'ce.device.unbind("Cutoff")' },
  devicePorts: {
    lua: `for _, p in ipairs(ce.device.ports({ direction = "out" })) do\n  log(p.name, p.connected)\nend`,
    js: `for (const p of ce.device.ports({ direction: "out" })) {\n  log(p.name, p.connected);\n}`,
  },
  deviceProfile: {
    lua: `local d = ce.device.profile()\nif d then log(d.name, d.connected) end`,
    js: `const d = ce.device.profile();\nif (d) log(d.name, d.connected);`,
  },
  deviceParameters: {
    lua: `local filters = ce.device.parameters({ group = "Filter", limit = 20 })\nlog(#filters .. " filter parameters")`,
    js: `const filters = ce.device.parameters({ group: "Filter", limit: 20 });\nlog(\`\${filters.length} filter parameters\`);`,
  },
  deviceParameter: {
    lua: `local p = ce.device.parameter("filter.cutoff")\nif p then set("Cutoff.Behavior.max", p.max) end`,
    js: `const p = ce.device.parameter("filter.cutoff");\nif (p) set("Cutoff.Behavior.max", p.max);`,
  },
  deviceConnected: {
    lua: `if ce.device.connected() then ce.device.requestDump("patch") end`,
    js: `if (ce.device.connected()) ce.device.requestDump("patch");`,
  },

  /* ------------------------------------------------------------------ ce.math (the random half) */
  random: {
    lua: `local n = ce.math.random()             -- float in [0, 1)\nlocal note = ce.math.random(48, 72)   -- whole number, INCLUSIVE`,
    js: `const n = ce.math.random();            // float in [0, 1)\nconst note = ce.math.random(48, 72);   // whole number, INCLUSIVE`,
  },
  randomSeed: {
    lua: `-- the same seed replays the same "random" patch, in every runtime\nce.math.seed(1234)\nlocal a = ce.math.random(0, 99)`,
    js: `// the same seed replays the same "random" patch, in every runtime\nce.math.seed(1234);\nconst a = ce.math.random(0, 99);`,
  },
  randomFloat: { code: 'ce.math.randomFloat(0.2, 0.8)' },
  randomGaussian: { code: 'ce.math.gaussian(64, 12)   -- centred on 64, most within +/-12' },
  randomWalk: {
    lua: `local next = ce.math.walk(current, 3, 0, 127)   -- drift, never leaving the range`,
    js: `const next = ce.math.walk(current, 3, 0, 127);   // drift, never leaving the range`,
  },
  randomBool: {
    lua: `if ce.math.chance(0.25) then ce.midi.sendNote(1, 60, 90) end`,
    js: `if (ce.math.chance(0.25)) ce.midi.sendNote(1, 60, 90);`,
  },
  randomChoice: {
    lua: `ce.math.choice({ "up", "down", "random" })\nce.math.choice({ 60, 64, 67 }, { 3, 1, 1 })   -- weighted: 60 three times as often`,
    js: `ce.math.choice(["up", "down", "random"]);\nce.math.choice([60, 64, 67], [3, 1, 1]);   // weighted: 60 three times as often`,
  },
  shuffle: {
    lua: `local order = ce.math.shuffle({ 1, 2, 3, 4, 5, 6, 7, 8 })`,
    js: `const order = ce.math.shuffle([1, 2, 3, 4, 5, 6, 7, 8]);`,
  },
  randomStream: {
    lua: `-- a named stream, independent of the shared one: reseeding the panel's randomness\n-- will not disturb this sequence\nce.math.stream("drums", function(rng) return rng(0, 15) end)`,
    js: `// a named stream, independent of the shared one: reseeding the panel's randomness\n// will not disturb this sequence\nce.math.stream("drums", (rng) => rng(0, 15));`,
  },

  /* ------------------------------------------------------------------ ce.time */
  startTimer: {
    lua: `ce.time.startTimer("blink", 500)\nfunction onTimer(info)\n  if info.id == "blink" then set("Led.Background.Fill.colour", nextColour()) end\nend`,
    js: `ce.time.startTimer("blink", 500);\nfunction onTimer(info) {\n  if (info.id === "blink") set("Led.Background.Fill.colour", nextColour());\n}`,
  },
  stopTimer: { code: 'ce.time.stopTimer("blink")   -- an unknown id is harmless' },
  syncTimer: {
    lua: `-- every sixteenth at the current tempo; re-arm from onTransport if the tempo moves\nce.time.syncTimer("step", 0.25)`,
    js: `// every sixteenth at the current tempo; re-arm from onTransport if the tempo moves\nce.time.syncTimer("step", 0.25);`,
  },
  after: {
    lua: `-- program change, let the synth settle, then the dump\nce.midi.sendProgramChange(1, 12)\nce.time.after(40, function() ce.device.sendDump("patch") end)`,
    js: `// program change, let the synth settle, then the dump\nce.midi.sendProgramChange(1, 12);\nce.time.after(40, () => ce.device.sendDump("patch"));`,
  },
  afterBeats: {
    lua: `ce.time.afterBeats(1, function() ce.midi.sendNote(1, 72, 90) end)`,
    js: `ce.time.afterBeats(1, () => ce.midi.sendNote(1, 72, 90));`,
  },
  tempo: {
    lua: `local bpm = ce.time.tempo()\nif bpm == nil then bpm = 120 end   -- read it, do not assume it`,
    js: `const bpm = ce.time.tempo() ?? 120;   // read it, do not assume it`,
  },
  isPlaying: {
    lua: `if ce.time.playing() then ce.components.arp.run("Arp", true) end`,
    js: `if (ce.time.playing()) ce.components.arp.run("Arp", true);`,
  },
  transportInfo: {
    lua: `local t = ce.time.transport()\nif t.valid then log(t.bar .. "." .. t.beat, t.bpm) end`,
    js: `const t = ce.time.transport();\nif (t.valid) log(\`\${t.bar}.\${t.beat}\`, t.bpm);`,
  },
  beatsToMs: {
    lua: `local ms = ce.time.beatsToMs(0.75)        -- a dotted eighth delay time\nlocal at90 = ce.time.beatsToMs(0.75, 90)   -- ...at 90bpm regardless of the transport`,
    js: `const ms = ce.time.beatsToMs(0.75);        // a dotted eighth delay time\nconst at90 = ce.time.beatsToMs(0.75, 90);  // ...at 90bpm regardless of the transport`,
  },
  msToBeats: {
    lua: `local beats = ce.time.msToBeats(500)`,
    js: `const beats = ce.time.msToBeats(500);`,
  },
  runningTimers: {
    lua: `for _, t in ipairs(ce.time.timers()) do log(t.id, t.ms) end`,
    js: `for (const t of ce.time.timers()) log(t.id, t.ms);`,
  },
  nowMs: {
    lua: `local t0 = ce.time.now()\n-- ...work...\nlog("took", ce.time.now() - t0, "ms")`,
    js: `const t0 = ce.time.now();\n// ...work...\nlog("took", ce.time.now() - t0, "ms");`,
  },

  /* ------------------------------------------------------------------ ce.anim */
  animateTo: {
    lua: `-- the whole opts vocabulary, which the signature only calls "opts"\nce.anim.to("Cutoff.value", 0.9, {\n  duration = 600,      -- ms; ignored when 'beats' is given\n  beats = 1,           -- musical length instead of ms\n  sync = true,         -- start on the next beat boundary\n  curve = "exp",       -- "linear" | "exp" | "log" | "s"\n  from = 0.1,          -- start here rather than from the current value\n  delay = 100,         -- wait this long first\n  stagger = 40,        -- per-item offset when the path matches several controls\n  repeat_ = 2,         -- run it this many times (repeat is a Lua keyword)\n  pingpong = true,     -- ...alternating direction\n  done = function() log("arrived") end,\n})`,
    js: `// the whole opts vocabulary, which the signature only calls "opts"\nce.anim.to("Cutoff.value", 0.9, {\n  duration: 600,       // ms; ignored when 'beats' is given\n  beats: 1,            // musical length instead of ms\n  sync: true,          // start on the next beat boundary\n  curve: "exp",        // "linear" | "exp" | "log" | "s"\n  from: 0.1,           // start here rather than from the current value\n  delay: 100,          // wait this long first\n  stagger: 40,         // per-item offset when the path matches several controls\n  repeat: 2,           // run it this many times\n  pingpong: true,      // ...alternating direction\n  done: () => log("arrived"),\n});`,
  },
  animateSpring: {
    lua: `ce.anim.spring("Fader.value", 0.8, {\n  stiffness = 180, damping = 12, mass = 1, velocity = 0,\n})`,
    js: `ce.anim.spring("Fader.value", 0.8, {\n  stiffness: 180, damping: 12, mass: 1, velocity: 0,\n});`,
  },
  animateEnvelope: {
    lua: `-- points are { at, value }; 'at' is 0..1 of the whole duration\nce.anim.envelope("Cutoff.value", {\n  { 0, 0 }, { 0.1, 1 }, { 0.4, 0.6 }, { 1, 0 },\n}, { duration = 1200, curve = "s" })`,
    js: `// points are [at, value]; 'at' is 0..1 of the whole duration\nce.anim.envelope("Cutoff.value", [\n  [0, 0], [0.1, 1], [0.4, 0.6], [1, 0],\n], { duration: 1200, curve: "s" });`,
  },
  animateStop: { code: 'ce.anim.stop("Cutoff.value")   -- no argument stops every animation' },
  animateRunning: {
    lua: `if not ce.anim.running("Cutoff.value") then ce.anim.to("Cutoff.value", 0) end`,
    js: `if (!ce.anim.running("Cutoff.value")) ce.anim.to("Cutoff.value", 0);`,
  },
  animateValue: {
    lua: `local a = ce.anim.value("Cutoff.value")\nif a then log(a.from, a.to, a.progress) end`,
    js: `const a = ce.anim.value("Cutoff.value");\nif (a) log(a.from, a.to, a.progress);`,
  },
  animateList: {
    lua: `for _, a in ipairs(ce.anim.list()) do log(a.path, a.progress) end`,
    js: `for (const a of ce.anim.list()) log(a.path, a.progress);`,
  },
  animatePause: { code: 'ce.anim.pause("Cutoff.value")' },
  animateResume: { code: 'ce.anim.resume("Cutoff.value")' },
  animateReverse: { code: 'ce.anim.reverse("Cutoff.value")   -- run back the way it came' },
  animateFinish: { code: 'ce.anim.finish("Cutoff.value")   -- jump to the destination now' },

  /* ------------------------------------------------------------------ ce.ui */
  uiNotify: {
    lua: `ce.ui.notify("Patch sent", { kind = "success", ms = 2000 })`,
    js: `ce.ui.notify("Patch sent", { kind: "success", ms: 2000 });`,
  },
  uiStatus: {
    lua: `ce.ui.status("Waiting for dump…")\nce.ui.status()   -- no argument clears it`,
    js: `ce.ui.status("Waiting for dump…");\nce.ui.status();   // no argument clears it`,
  },
  uiDialog: {
    lua: `ce.ui.dialog({\n  title = "Overwrite patch?",\n  message = "Slot 12 already has one.",\n  choices = { "Overwrite", "Cancel" },\n}, function(picked)\n  if picked == "Overwrite" then ce.device.sendDump("patch") end\nend)`,
    js: `ce.ui.dialog({\n  title: "Overwrite patch?",\n  message: "Slot 12 already has one.",\n  choices: ["Overwrite", "Cancel"],\n}, (picked) => {\n  if (picked === "Overwrite") ce.device.sendDump("patch");\n});`,
  },
  uiPrompt: {
    lua: `ce.ui.prompt({ title = "Patch name", value = "Bass 3", max = 16 },\n  function(answer)\n    if answer then set("Name.Text.content", answer) end\n  end)`,
    js: `ce.ui.prompt({ title: "Patch name", value: "Bass 3", max: 16 },\n  (answer) => {\n    if (answer) set("Name.Text.content", answer);\n  });`,
  },
  uiChoose: {
    lua: `ce.ui.choose({ title = "Bank", options = { "A", "B", "C" } },\n  function(picked) log(picked) end)`,
    js: `ce.ui.choose({ title: "Bank", options: ["A", "B", "C"] },\n  (picked) => log(picked));`,
  },
  uiDismiss: { code: 'ce.ui.dismiss()   -- everything this script put up; pass an id for one' },
  uiUpdate: {
    lua: `local id = ce.ui.notify("Sending 1/8…", { sticky = true })\nce.ui.update(id, "Sending 4/8…", { progress = 0.5 })`,
    js: `const id = ce.ui.notify("Sending 1/8…", { sticky: true });\nce.ui.update(id, "Sending 4/8…", { progress: 0.5 });`,
  },
  uiState: {
    lua: `local s = ce.ui.state()\nif s.dialogOpen then return end   -- do not stack a second one`,
    js: `const s = ce.ui.state();\nif (s.dialogOpen) return;   // do not stack a second one`,
  },
  uiCopy: { code: 'ce.ui.copy(ce.storage.encode(ce.panel.snapshot()))' },

  /* ------------------------------------------------------------------ ce.draw */
  drawClear: { code: 'ce.draw.clear()   -- this control\'s overlay; pass a name for another' },
  drawFill: { code: 'ce.draw.fill("#3A6EA5")' },
  drawStroke: {
    lua: `ce.draw.stroke("#39D98A", 2, { dash = { 4, 3 }, cap = "round" })`,
    js: `ce.draw.stroke("#39D98A", 2, { dash: [4, 3], cap: "round" });`,
  },
  drawRect: { code: 'ce.draw.rect(4, 4, 60, 20, 3)   -- x, y, w, h, corner radius' },
  drawCircle: { code: 'ce.draw.circle(30, 30, 12)' },
  drawEllipse: { code: 'ce.draw.ellipse(30, 30, 18, 10)' },
  drawArc: {
    lua: `-- degrees, 0 at twelve o'clock, clockwise — the way a knob arc is described\nce.draw.arc(30, 30, 20, -135, 135)`,
    js: `// degrees, 0 at twelve o'clock, clockwise — the way a knob arc is described\nce.draw.arc(30, 30, 20, -135, 135);`,
  },
  drawLine: { code: 'ce.draw.line(0, 16, 64, 16)' },
  drawPath: {
    lua: `ce.draw.path({ { x = 0, y = 20 }, { x = 20, y = 4 }, { x = 40, y = 18 } }, false)`,
    js: `ce.draw.path([{ x: 0, y: 20 }, { x: 20, y: 4 }, { x: 40, y: 18 }], false);`,
  },
  drawText: {
    lua: `-- (x, y) is the LEFT BASELINE, not the top-left\nce.draw.text(4, 14, "CUTOFF", { size = 9, align = "left", family = "Arial" })`,
    js: `// (x, y) is the LEFT BASELINE, not the top-left\nce.draw.text(4, 14, "CUTOFF", { size: 9, align: "left", family: "Arial" });`,
  },
  drawPixelText: { code: 'ce.draw.pixelText("A-01", 2, 2, 2)   -- the panel\'s own 5x7 LCD font' },
  drawMeasure: {
    lua: `local m = ce.draw.measure("CUTOFF", { size = 9 })\nif not m.exact then log("estimated, not measured") end\nce.draw.rect(2, 2, m.width + 4, m.height + 2)`,
    js: `const m = ce.draw.measure("CUTOFF", { size: 9 });\nif (!m.exact) log("estimated, not measured");\nce.draw.rect(2, 2, m.width + 4, m.height + 2);`,
  },
  drawGradient: {
    lua: `local g = ce.draw.gradient({ { 0, "#101116" }, { 1, "#3A6EA5" } }, 90)\nce.draw.fill(g)`,
    js: `const g = ce.draw.gradient([[0, "#101116"], [1, "#3A6EA5"]], 90);\nce.draw.fill(g);`,
  },
  drawOpacity: { code: 'ce.draw.opacity(0.4)' },
  drawTransform: {
    lua: `ce.draw.transform({ rotate = 45, cx = 30, cy = 30, scale = 1.2 })\nce.draw.transform()   -- no argument resets`,
    js: `ce.draw.transform({ rotate: 45, cx: 30, cy: 30, scale: 1.2 });\nce.draw.transform();   // no argument resets`,
  },
  drawRedraw: { code: 'ce.draw.redraw()   -- ask for onDraw again' },

  /* ------------------------------------------------------------------ ce.panel */
  panelSnapshot: {
    lua: `local before = ce.panel.snapshot()\nrandomisePatch()\n-- ...and to undo it:\nce.panel.restore(before)`,
    js: `const before = ce.panel.snapshot();\nrandomisePatch();\n// ...and to undo it:\nce.panel.restore(before);`,
  },
  panelRestore: {
    lua: `local n = ce.panel.restore(saved)   -- how many controls it put back`,
    js: `const n = ce.panel.restore(saved);   // how many controls it put back`,
  },
  panelEach: {
    lua: `ce.panel.each(function(info)\n  if info.type == "Knob" then set(info.name .. ".value", 0.5) end\nend)`,
    js: `ce.panel.each((info) => {\n  if (info.type === "Knob") set(\`\${info.name}.value\`, 0.5);\n});`,
  },
  panelCreate: {
    lua: `ce.panel.create("Knob", {\n  name = "Cutoff", x = 20, y = 40, width = 48, height = 48, parent = "FilterBox",\n})`,
    js: `ce.panel.create("Knob", {\n  name: "Cutoff", x: 20, y: 40, width: 48, height: 48, parent: "FilterBox",\n});`,
  },
  panelClone: {
    lua: `for i = 1, 8 do\n  ce.panel.clone("StepTemplate", { name = "Step" .. i, x = 8 + i * 30, y = 60 })\nend`,
    js: `for (let i = 1; i <= 8; i += 1) {\n  ce.panel.clone("StepTemplate", { name: \`Step\${i}\`, x: 8 + i * 30, y: 60 });\n}`,
  },
  panelDestroy: { code: 'ce.panel.destroy("Step8")' },
  panelParent: { code: 'ce.panel.parent("Cutoff", "FilterBox")   -- no container name unparents it' },
  panelFind: {
    lua: `local knobs = ce.panel.find({ type = "Knob" })\nlocal one = ce.panel.find("Cutoff")`,
    js: `const knobs = ce.panel.find({ type: "Knob" });\nconst one = ce.panel.find("Cutoff");`,
  },
  panelInfo: {
    lua: `local i = ce.panel.info("Cutoff")\nif i then log(i.type, i.x, i.y, i.width, i.height) end`,
    js: `const i = ce.panel.info("Cutoff");\nif (i) log(i.type, i.x, i.y, i.width, i.height);`,
  },
  panelTypes: {
    lua: `for _, t in ipairs(ce.panel.types()) do log(t) end`,
    js: `for (const t of ce.panel.types()) log(t);`,
  },
  panelEntries: {
    lua: `for _, name in ipairs(ce.panel.entries("Cutoff", "States")) do log(name) end`,
    js: `for (const name of ce.panel.entries("Cutoff", "States")) log(name);`,
  },
  panelEntry: {
    lua: `local hover = ce.panel.entry("Cutoff", "States", "Hover")`,
    js: `const hover = ce.panel.entry("Cutoff", "States", "Hover");`,
  },
  panelDefine: {
    lua: `ce.panel.define("Cutoff", "States", "Warn", {\n  when = { over = 0.9 },\n  patch = { ["Background.Fill.colour"] = "E05C5C" },\n})`,
    js: `ce.panel.define("Cutoff", "States", "Warn", {\n  when: { over: 0.9 },\n  patch: { "Background.Fill.colour": "E05C5C" },\n});`,
  },
  panelUndefine: { code: 'ce.panel.undefine("Cutoff", "States", "Warn")' },
  panelPatch: {
    lua: `-- a state's patch keys are ONE map key each, not three path steps\nce.panel.patch("Cutoff", "Hover", { ["Background.Fill.colour"] = "5B9BD5" })`,
    js: `// a state's patch keys are ONE map key each, not three path steps\nce.panel.patch("Cutoff", "Hover", { "Background.Fill.colour": "5B9BD5" });`,
  },
  panelAlign: {
    lua: `-- the FIRST name is the reference and does not move\nce.panel.align({ "A", "B", "C" }, "left")\nce.panel.align({ "A", "B", "C" }, "top", { to = "C" })`,
    js: `// the FIRST name is the reference and does not move\nce.panel.align(["A", "B", "C"], "left");\nce.panel.align(["A", "B", "C"], "top", { to: "C" });`,
  },
  panelDistribute: {
    lua: `ce.panel.distribute({ "A", "B", "C", "D" }, "horizontal", { gap = 8 })`,
    js: `ce.panel.distribute(["A", "B", "C", "D"], "horizontal", { gap: 8 });`,
  },
  panelMatch: {
    lua: `ce.panel.match({ "A", "B", "C" }, "both", { to = "A" })`,
    js: `ce.panel.match(["A", "B", "C"], "both", { to: "A" });`,
  },
  panelGrid: {
    lua: `ce.panel.grid({ "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8" },\n  { columns = 4, gapX = 6, gapY = 6 })`,
    js: `ce.panel.grid(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],\n  { columns: 4, gapX: 6, gapY: 6 });`,
  },
  panelCircle: {
    lua: `ce.panel.circle({ "P1", "P2", "P3", "P4" },\n  { cx = 100, cy = 100, radius = 60, from = 0, sweep = 360 })`,
    js: `ce.panel.circle(["P1", "P2", "P3", "P4"],\n  { cx: 100, cy: 100, radius: 60, from: 0, sweep: 360 });`,
  },
  panelFlip: {
    lua: `ce.panel.flip({ "A", "B", "C" }, "horizontal")`,
    js: `ce.panel.flip(["A", "B", "C"], "horizontal");`,
  },
  panelRect: {
    lua: `local r = ce.panel.rect("FilterBox")\nce.panel.grid(knobNames, { columns = 4, gapX = 6 })`,
    js: `const r = ce.panel.rect("FilterBox");\nce.panel.grid(knobNames, { columns: 4, gapX: 6 });`,
  },
  panelOrder: {
    lua: `ce.panel.order({ "Led" }, "front")   -- "front" | "back" | "forward" | "backward"`,
    js: `ce.panel.order(["Led"], "front");   // "front" | "back" | "forward" | "backward"`,
  },
  panelBatch: {
    lua: `-- one redraw for the whole lot instead of one per write\nce.panel.batch(function()\n  for i = 1, 32 do set("Step" .. i .. ".value", 0) end\nend)`,
    js: `// one redraw for the whole lot instead of one per write\nce.panel.batch(() => {\n  for (let i = 1; i <= 32; i += 1) set(\`Step\${i}.value\`, 0);\n});`,
  },

  /* ------------------------------------------------------------------ ce.storage */
  state: {
    lua: `-- a plain table, private to this script, gone when the panel closes\nce.storage.state.lastNote = 60\nlog(ce.storage.state.lastNote)`,
    js: `// a plain object, private to this script, gone when the panel closes\nce.storage.state.lastNote = 60;\nlog(ce.storage.state.lastNote);`,
  },
  saveSetting: {
    lua: `ce.storage.saveSetting("favouriteBank", 2)                    -- shared with the panel\nce.storage.saveSetting("cursor", 4, { scope = "script" })     -- private to this script\nce.storage.saveSetting("port", "USB 1", { scope = "machine" }) -- this machine only`,
    js: `ce.storage.saveSetting("favouriteBank", 2);                    // shared with the panel\nce.storage.saveSetting("cursor", 4, { scope: "script" });      // private to this script\nce.storage.saveSetting("port", "USB 1", { scope: "machine" }); // this machine only`,
  },
  loadSetting: {
    lua: `local bank = ce.storage.loadSetting("favouriteBank", 1)\nlocal cursor = ce.storage.loadSetting("cursor", 0, { scope = "script" })`,
    js: `const bank = ce.storage.loadSetting("favouriteBank", 1);\nconst cursor = ce.storage.loadSetting("cursor", 0, { scope: "script" });`,
  },
  listSettings: {
    lua: `for _, key in ipairs(ce.storage.settings({ scope = "script" })) do log(key) end`,
    js: `for (const key of ce.storage.settings({ scope: "script" })) log(key);`,
  },
  forgetSetting: {
    lua: `ce.storage.forget("cursor", { scope = "script" })`,
    js: `ce.storage.forget("cursor", { scope: "script" });`,
  },
  allSettings: {
    lua: `local everything = ce.storage.all()\nlog(ce.storage.encode(everything, { indent = 2 }))`,
    js: `const everything = ce.storage.all();\nlog(ce.storage.encode(everything, { indent: 2 }));`,
  },
  clearSettings: {
    lua: `local n = ce.storage.clear({ scope = "script" })   -- how many it removed`,
    js: `const n = ce.storage.clear({ scope: "script" });   // how many it removed`,
  },
  storageInfo: {
    lua: `local i = ce.storage.info()\nlog(i.count, i.bytes, i.scope)`,
    js: `const i = ce.storage.info();\nlog(i.count, i.bytes, i.scope);`,
  },

  /* ------------------------------------------------------------------ ce.text */
  textFonts: {
    lua: `-- portable = survives the export; a library font does not travel with the panel\nfor _, f in ipairs(ce.text.fonts({ portable = true })) do log(f.family) end`,
    js: `// portable = survives the export; a library font does not travel with the panel\nfor (const f of ce.text.fonts({ portable: true })) log(f.family);`,
  },
  textFont: {
    lua: `local face = ce.text.font("Arial")\nif face and face.variable then log("axes:", #face.axes) end`,
    js: `const face = ce.text.font("Arial");\nif (face?.variable) log("axes:", face.axes.length);`,
  },
  textStyle: {
    lua: `-- writes BOTH halves of the weight pair, which a bare set() does not\nce.text.style("Readout", {\n  family = "Arial", size = 18, bold = true, italic = false,\n  caseMode = "uppercase", justification = "left",\n  letterSpacing = 0.5, lineHeight = 1.3, tabularFigures = true,\n})`,
    js: `// writes BOTH halves of the weight pair, which a bare set() does not\nce.text.style("Readout", {\n  family: "Arial", size: 18, bold: true, italic: false,\n  caseMode: "uppercase", justification: "left",\n  letterSpacing: 0.5, lineHeight: 1.3, tabularFigures: true,\n});`,
  },
  textAxis: {
    lua: `-- refused if the face has no such axis; wght drags the weight pair with it\nce.text.axis("Readout", "wght", 620)`,
    js: `// refused if the face has no such axis; wght drags the weight pair with it\nce.text.axis("Readout", "wght", 620);`,
  },
  textRead: {
    lua: `local size = ce.text.read("Readout", "size")\nlocal all = ce.text.read("Readout")   -- { content, resolvedWeight, font, multiline, position }`,
    js: `const size = ce.text.read("Readout", "size");\nconst all = ce.text.read("Readout");   // { content, resolvedWeight, font, multiline, position }`,
  },
  textMeasure: {
    lua: `local m = ce.text.measure("Readout")\nlocal willFit = ce.text.measure("Readout", "A-01 SAWTOOTH")`,
    js: `const m = ce.text.measure("Readout");\nconst willFit = ce.text.measure("Readout", "A-01 SAWTOOTH");`,
  },
  textFit: {
    lua: `set("Readout.Text.content", patchName)\nlocal r = ce.text.fit("Readout", { min = 9 })\nif not r.fits then logWarn("still overflowing at " .. r.size) end`,
    js: `set("Readout.Text.content", patchName);\nconst r = ce.text.fit("Readout", { min: 9 });\nif (!r.fits) logWarn(\`still overflowing at \${r.size}\`);`,
  },
  /* ---------------------------------------------------- the five hand-written component families
   * These predate COMPONENT_VERBS, so the generator has no spec to build an example from and they
   * are written out here. Enum values are the app's own — HAND_WRITTEN_VALUES in componentTables.js
   * for the five that have a table, and the member summary for the rest. */
  splitPreset: {
    lua: `ce.components.split.preset("SplitZone", "layer")\nce.components.split.preset("SplitZone", "split", 36, 84)\n-- one of: single, split, layer, three`,
    js: `ce.components.split.preset("SplitZone", "layer");\nce.components.split.preset("SplitZone", "split", 36, 84);\n// one of: single, split, layer, three`,
  },
  splitPoint: { code: 'ce.components.split.point("SplitZone", 1, 60)   -- zone 1 ends at C4' },
  splitChannel: { code: 'ce.components.split.channel("SplitZone", 2, 3)   -- zone 2 sends on channel 3' },
  splitTranspose: { code: 'ce.components.split.transpose("SplitZone", 2, -12)' },
  splitMute: { code: 'ce.components.split.mute("SplitZone", 2, true)' },
  splitRead: {
    lua: `ce.components.split.read("SplitZone", "point")\nce.components.split.read("SplitZone")   -- the whole component`,
    js: `ce.components.split.read("SplitZone", "point");\nce.components.split.read("SplitZone");   // the whole component`,
  },

  phraseRun: { code: 'ce.components.phrase.run("Phrase", true)' },
  phraseSeed: { code: 'ce.components.phrase.seed("Phrase", 1234)   -- same seed, same phrase' },
  phraseClear: { code: 'ce.components.phrase.clear("Phrase")' },
  phraseKey: { code: 'ce.components.phrase.key("Phrase", "D")' },
  phraseScale: {
    lua: `ce.components.phrase.scale("Phrase", "dorian")\n-- major, minor, dorian, …`,
    js: `ce.components.phrase.scale("Phrase", "dorian");\n// major, minor, dorian, …`,
  },
  phraseTranspose: { code: 'ce.components.phrase.transpose("Phrase", 12)' },
  phraseDirection: {
    lua: `ce.components.phrase.direction("Phrase", "pingpong")\n-- one of: forward, reverse, pingpong, random`,
    js: `ce.components.phrase.direction("Phrase", "pingpong");\n// one of: forward, reverse, pingpong, random`,
  },
  phraseCell: { code: 'ce.components.phrase.cell("Phrase", 3, 1, true)   -- step 3, row 1, on' },
  phraseRead: {
    lua: `ce.components.phrase.read("Phrase", "direction")`,
    js: `ce.components.phrase.read("Phrase", "direction");`,
  },

  recorderRecord: {
    lua: `ce.components.recorder.record("Recorder")        -- no argument arms it\nce.components.recorder.record("Recorder", false)`,
    js: `ce.components.recorder.record("Recorder");       // no argument arms it\nce.components.recorder.record("Recorder", false);`,
  },
  recorderStop: { code: 'ce.components.recorder.stop("Recorder")' },
  recorderPlay: { code: 'ce.components.recorder.play("Recorder", true)' },
  recorderClear: { code: 'ce.components.recorder.clear("Recorder")' },
  recorderUndo: { code: 'ce.components.recorder.undo("Recorder")' },
  recorderBars: { code: 'ce.components.recorder.bars("Recorder", 4)' },
  recorderCountIn: { code: 'ce.components.recorder.countIn("Recorder", 1)' },
  recorderSource: {
    lua: `ce.components.recorder.source("Recorder", "both")\n-- one of: input, panel, both`,
    js: `ce.components.recorder.source("Recorder", "both");\n// one of: input, panel, both`,
  },
  recorderQuantize: {
    lua: `ce.components.recorder.quantize("Recorder", "1/16", 0.8, "minor", "A")\n-- grid, strength 0..1, then optional pitch repair to a scale and key`,
    js: `ce.components.recorder.quantize("Recorder", "1/16", 0.8, "minor", "A");\n// grid, strength 0..1, then optional pitch repair to a scale and key`,
  },
  recorderTranspose: { code: 'ce.components.recorder.transpose("Recorder", -12)' },
  recorderShift: { code: 'ce.components.recorder.shift("Recorder", 2)' },
  recorderNudge: { code: 'ce.components.recorder.nudge("Recorder", -10)   -- move the take in time' },
  recorderStore: { code: 'ce.components.recorder.store("Recorder", 2, "Verse riff")' },
  recorderLoad: { code: 'ce.components.recorder.load("Recorder", 2)' },
  recorderRead: {
    lua: `ce.components.recorder.read("Recorder", "bars")`,
    js: `ce.components.recorder.read("Recorder", "bars");`,
  },

  harmonyMode: {
    lua: `ce.components.harmony.mode("Harmoniser", "memory")\n-- one of: diatonic, memory`,
    js: `ce.components.harmony.mode("Harmoniser", "memory");\n// one of: diatonic, memory`,
  },
  harmonyKey: { code: 'ce.components.harmony.key("Harmoniser", "F")' },
  harmonyScale: { code: 'ce.components.harmony.scale("Harmoniser", "dorian")' },
  harmonySize: { code: 'ce.components.harmony.size("Harmoniser", 4)   -- voices per chord' },
  harmonyShape: { code: 'ce.components.harmony.shape("Harmoniser", "min7")' },
  harmonyVoicing: {
    lua: `ce.components.harmony.voicing("Harmoniser", "open")\n-- one of: close, open, drop2`,
    js: `ce.components.harmony.voicing("Harmoniser", "open");\n// one of: close, open, drop2`,
  },
  harmonyInversion: { code: 'ce.components.harmony.inversion("Harmoniser", 1)' },
  harmonyOctave: { code: 'ce.components.harmony.octave("Harmoniser", -1)' },
  harmonyStrum: { code: 'ce.components.harmony.strum("Harmoniser", 25)   -- ms between voices' },
  harmonyChannel: { code: 'ce.components.harmony.channel("Harmoniser", 2)' },
  harmonyKeepPlayed: { code: 'ce.components.harmony.keepPlayed("Harmoniser", true)' },
  harmonyOutOfKey: {
    lua: `ce.components.harmony.outOfKey("Harmoniser", "nearest")\n-- one of: pass, nearest, mute`,
    js: `ce.components.harmony.outOfKey("Harmoniser", "nearest");\n// one of: pass, nearest, mute`,
  },
  harmonyVoiceLeading: {
    lua: `ce.components.harmony.voiceLeading("Harmoniser", "smooth")\n-- one of: off, closest, smooth`,
    js: `ce.components.harmony.voiceLeading("Harmoniser", "smooth");\n// one of: off, closest, smooth`,
  },
  harmonyDegree: { code: 'ce.components.harmony.degree("Harmoniser", 5, "dom7")' },
  harmonyRead: {
    lua: `ce.components.harmony.read("Harmoniser", "voicing")`,
    js: `ce.components.harmony.read("Harmoniser", "voicing");`,
  },

  setlistNext: { code: 'ce.components.setlist.next("Setlist")' },
  setlistPrev: { code: 'ce.components.setlist.prev("Setlist")' },
  setlistGoto: { code: 'ce.components.setlist.jump("Setlist", 3)' },
  setlistEnable: { code: 'ce.components.setlist.enable("Setlist", 3, false)' },
  setlistWrap: { code: 'ce.components.setlist.wrap("Setlist", true)' },
  setlistCrossfade: { code: 'ce.components.setlist.crossfade("Setlist", 500)' },
  setlistRead: {
    lua: `ce.components.setlist.read("Setlist", "wrap")`,
    js: `ce.components.setlist.read("Setlist", "wrap");`,
  },
  /* ---------------------------------------------------------------- ce.draw, phase §49 */
  drawBatch: {
    lua: `-- one publish for the whole lot instead of one per command\nce.draw.batch(function()\n  for i = 0, 63 do\n    ce.draw.line(i * 2, 32 - trace[i + 1] * 32, i * 2, 32)\n  end\nend)`,
    js: `// one publish for the whole lot instead of one per command\nce.draw.batch(() => {\n  for (let i = 0; i < 64; i += 1) {\n    ce.draw.line(i * 2, 32 - trace[i] * 32, i * 2, 32);\n  }\n});`,
  },
  drawGrid: {
    lua: `ce.draw.stroke("#2A2D3A", 1)\nce.draw.grid({ columns = 16, rows = 4 })   -- the control's whole box\nce.draw.grid({ x = 4, y = 4, width = 120, height = 40, step = 10 })`,
    js: `ce.draw.stroke("#2A2D3A", 1);\nce.draw.grid({ columns: 16, rows: 4 });   // the control's whole box\nce.draw.grid({ x: 4, y: 4, width: 120, height: 40, step: 10 });`,
  },
  drawLines: {
    lua: `-- tick marks: disjoint, so one command rather than one per tick\nlocal ticks = {}\nfor i = 0, 10 do ticks[#ticks + 1] = { i * 12, 28, i * 12, i % 5 == 0 and 20 or 24 } end\nce.draw.lines(ticks)`,
    js: `// tick marks: disjoint, so one command rather than one per tick\nconst ticks = [];\nfor (let i = 0; i <= 10; i += 1) ticks.push([i * 12, 28, i * 12, i % 5 === 0 ? 20 : 24]);\nce.draw.lines(ticks);`,
  },
  drawPoints: {
    lua: `ce.draw.fill("#39D98A")\nce.draw.points({ { 10, 20 }, { 24, 14 }, { 38, 26 } }, 2)`,
    js: `ce.draw.fill("#39D98A");\nce.draw.points([[10, 20], [24, 14], [38, 26]], 2);`,
  },
  drawCurve: {
    lua: `-- through the points, not merely near them\nce.draw.stroke("#5B9BD5", 2)\nce.draw.curve({ { 0, 40 }, { 20, 8 }, { 50, 24 }, { 90, 4 } }, { tension = 0.6 })`,
    js: `// through the points, not merely near them\nce.draw.stroke("#5B9BD5", 2);\nce.draw.curve([[0, 40], [20, 8], [50, 24], [90, 4]], { tension: 0.6 });`,
  },
  drawPolygon: {
    lua: `ce.draw.fill("#172634")\nce.draw.polygon(32, 32, 20, 6, { rotation = 30 })   -- a hexagonal pad`,
    js: `ce.draw.fill("#172634");\nce.draw.polygon(32, 32, 20, 6, { rotation: 30 });   // a hexagonal pad`,
  },
  drawImage: {
    lua: `-- the source must be LOADABLE: a data URL or an http(s) one. A bare asset name is refused\n-- rather than accepted and drawn as nothing.\nce.draw.image(logoDataUrl, 4, 4, 24, 24, { fit = "contain" })`,
    js: `// the source must be LOADABLE: a data URL or an http(s) one. A bare asset name is refused\n// rather than accepted and drawn as nothing.\nce.draw.image(logoDataUrl, 4, 4, 24, 24, { fit: "contain" });`,
  },
  drawClip: {
    lua: `ce.draw.clip(0, 0, 60, 32)   -- everything after this stays inside\nce.draw.rect(-10, -10, 200, 200)\nce.draw.clip()               -- no arguments clears it`,
    js: `ce.draw.clip(0, 0, 60, 32);   // everything after this stays inside\nce.draw.rect(-10, -10, 200, 200);\nce.draw.clip();              // no arguments clears it`,
  },
  drawBlend: { code: 'ce.draw.blend("screen")   -- then "normal" to go back' },
  drawSave: {
    lua: `ce.draw.save()\nce.draw.stroke("#E05C5C", 3)\nce.draw.line(0, 0, 60, 0)\nce.draw.restore()   -- the stroke is whatever it was before`,
    js: `ce.draw.save();\nce.draw.stroke("#E05C5C", 3);\nce.draw.line(0, 0, 60, 0);\nce.draw.restore();   // the stroke is whatever it was before`,
  },
  drawRestore: {
    lua: `if not ce.draw.restore() then logWarn("a restore with no matching save") end`,
    js: `if (!ce.draw.restore()) logWarn("a restore with no matching save");`,
  },
};
