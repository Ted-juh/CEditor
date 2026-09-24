// playerRestorePush.test.js — the parts of Total Recall S2 that only a Windows DAW would find.
//
// The decision rules are a pure function with a real C++ test (CE/tests/RestorePolicyTests.cpp).
// What that test cannot reach is the WIRING, because it lives in `PluginProcessor.h`, which needs
// WebView2 and is compiled by nothing on this machine — its first reader is a Windows plugin build
// and its first exerciser is somebody with a synth.
//
// So this reads the source, the way `vendoredJucePatches.test.js` reads the vendored JUCE patch. It
// is a weaker check than compiling and it is the only one available, and each thing asserted here
// is a defect that was actually found reading the diff back:
//
//   a lambda capturing the editor, left on the processor after the editor was destroyed;
//   a 30Hz poll that would run for the life of a project;
//   a prompt that named "the connected device" because the field it read does not exist.
//
// All three are silent in a unit test and loud in a DAW.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROCESSOR = readFileSync(join(REPO, 'CE/src/Player/PluginProcessor.h'), 'utf8');
const HOST_H = readFileSync(join(REPO, 'CE/src/Player/PlayerHost.h'), 'utf8');
const HOST_CPP = readFileSync(join(REPO, 'CE/src/Player/PlayerHost.cpp'), 'utf8');
const PLAYER = readFileSync(join(REPO, 'CE/web/src/Player.svelte'), 'utf8');

test('setStateInformation arms the restore and does not send', () => {
  // The core constraint: that call arrives before the ports are open, before prepareToPlay, and on
  // a thread with no business emitting SysEx.
  const body = PROCESSOR.slice(PROCESSOR.indexOf('void setStateInformation'),
    PROCESSOR.indexOf('bool isBusesLayoutSupported'));
  assert.ok(body.includes('armRestorePush();'), 'setStateInformation does not arm the restore');
  assert.ok(!body.includes('runRestorePush'), 'setStateInformation must not send — wrong thread, ports may be shut');
  assert.ok(!body.includes('sendParamMidi'), 'nor send a parameter directly');
});

test('the push is serviced from the timer, before the window-open early return', () => {
  // A project reopened with the editor showing still has a synth on the wrong patch, and it is also
  // the only state in which the question can be asked at all.
  const timer = PROCESSOR.slice(PROCESSOR.indexOf('void timerCallback() override'));
  const service = timer.indexOf('serviceRestorePush');
  const earlyReturn = timer.indexOf('if (windowOpen) { wasWindowOpen = true; return; }');
  assert.ok(service > -1, 'the timer never services the restore');
  assert.ok(earlyReturn > -1, 'the window-open early return moved');
  assert.ok(service < earlyReturn, 'the restore is serviced after the early return, so it never runs window-open');
});

test('the editor clears its callback on the way out', () => {
  // The processor outlives the window and holds a lambda capturing the editor. The prompt is raised
  // precisely when a window has just been noticed, so a stale pointer here is a live path.
  const destructor = PROCESSOR.slice(PROCESSOR.indexOf('~PlayerAudioProcessorEditor() override'));
  assert.match(destructor.slice(0, 800), /processor\.onRestorePrompt = nullptr;/,
    'the editor leaves a lambda capturing itself on the processor');
});

test('the pending check is throttled', () => {
  // Under Ask with the window closed, a pending restore waits indefinitely and correctly. Building
  // a whole session-state object thirty times a second for the life of that project would be a real
  // cost for no extra responsiveness.
  const service = PROCESSOR.slice(PROCESSOR.indexOf('void serviceRestorePush'));
  assert.match(service.slice(0, 900), /restoreLastCheckedMs/, 'serviceRestorePush is not throttled');
});

test('the push clears the sent-value cache first', () => {
  // Otherwise it is a diff, not a restore: the cache holds what was sent to a synth that is no
  // longer the one in front of us, and every value matching a stale entry would be skipped —
  // silently leaving exactly those parameters wrong.
  const push = PROCESSOR.slice(PROCESSOR.indexOf('void runRestorePush'));
  const clear = push.indexOf('lastSentMidi.clear();');
  const send = push.indexOf('sendParamMidi');
  assert.ok(clear > -1 && send > -1 && clear < send, 'runRestorePush must clear the cache before sending');
});

test('every outcome that is not a send is logged', () => {
  // A restore that silently did not happen is the failure this whole feature exists to prevent.
  const service = PROCESSOR.slice(PROCESSOR.indexOf('void serviceRestorePush'),
    PROCESSOR.indexOf('restorePromptDeviceName() const'));
  assert.match(service, /Abandon:[\s\S]*scriptLogLine/, 'abandoning a restore is not logged');
  assert.match(service, /Ask:[\s\S]*scriptLogLine/, 'raising the question is not logged');
});

test('the prompt names the port or the profile, never only "the connected device"', () => {
  // The whole risk being guarded against is that the thing plugged in today is not the thing the
  // session was saved against, and a generic noun hides exactly that. The session record has no
  // `deviceName` field — reading one would have produced the generic every time.
  const name = PROCESSOR.slice(PROCESSOR.indexOf('juce::String restorePromptDeviceName'),
    PROCESSOR.indexOf('void runRestorePush'));
  assert.match(name, /midiDestination/, 'the prompt does not read the bound port');
  assert.match(name, /profileId/, 'and has no fallback to the profile');
  assert.ok(!name.includes('"deviceName"'), 'the session record has no deviceName field to read');
  assert.match(name, /pendingRequests/, 'pendingRequests is a sibling of the roles and must be skipped');
});

test('the question travels to the panel and the answer comes back', () => {
  assert.match(HOST_H, /void showRestorePrompt/);
  assert.match(HOST_H, /onRestoreAnswer/);
  assert.match(HOST_CPP, /emitToWebView \("restorePrompt"/);
  assert.match(HOST_CPP, /withEventListener \("restoreAnswer"/);
  assert.match(PROCESSOR, /host\.showRestorePrompt \(deviceName\)/);
  assert.match(PROCESSOR, /p\.answerRestorePrompt \(answer\)/);
});

test('the answer is persisted with the project, and only always/never are remembered', () => {
  // Saved with the project rather than globally: the decision was made about this session's patch
  // and this session's synth, and a different project is a different question.
  assert.match(PROCESSOR, /createNewChildElement \("RestoreAnswer"\)/);
  assert.match(PROCESSOR, /getChildByName \("RestoreAnswer"\)/);
  const answer = PROCESSOR.slice(PROCESSOR.indexOf('void answerRestorePrompt'));
  const body = answer.slice(0, answer.indexOf('\n    }\n'));
  assert.match(body, /if \(a != "always" && a != "never"\) return;[\s\S]*restoreAnswer = a;/,
    'anything other than always/never must be ignored, not stored');
});

test('"load" settles the pending push without sending or remembering anything', () => {
  // Load from the synth: the Player reads the patch and what arrives becomes the project's values.
  // Pushing the saved sound as well would overwrite the patch the user just chose to keep.
  const answer = PROCESSOR.slice(PROCESSOR.indexOf('void answerRestorePrompt'));
  const load = answer.slice(answer.indexOf('if (a == "load")'), answer.indexOf('if (a != "always"'));
  assert.ok(load.length > 0, 'the load answer is not handled');
  assert.match(load, /restorePending = false;/, 'the pending restore is not settled');
  assert.match(load, /scriptLogLine/, 'a restore that did not happen must say why');
  assert.ok(!/restoreAnswer = /.test(load), 'load is a one-off, never remembered');
  assert.ok(!/runRestorePush|sendParamMidi/.test(load), 'and never sends');
  assert.match(PLAYER, /answerRestore\('load'\)/, 'the bar has no Load button');
  assert.match(PLAYER, /if \(answer === 'load'\) runStartupRead\(/, 'Load does not read the synth');
});

test('closing the window does not resend every parameter behind the restore decision', () => {
  // The panel sent every change itself while it was open. Clearing the cache on close resent the
  // whole project to the synth after "Not now" or "Never".
  const timer = PROCESSOR.slice(PROCESSOR.indexOf('void timerCallback() override'));
  const closed = timer.slice(timer.indexOf('if (wasWindowOpen)'), timer.indexOf('for (const auto& desc : panelParams)'));
  assert.match(closed, /rebaselineSentMidi\(\);/, 'closing the window must take current values as sent');
  assert.ok(!closed.includes('lastSentMidi.clear()'), 'clearing the cache on close resends the whole project');
});

test('the Player learns whether this is a reopened project before it touches the port', () => {
  const set = PROCESSOR.slice(PROCESSOR.indexOf('void setStateInformation'), PROCESSOR.indexOf('bool isBusesLayoutSupported'));
  assert.equal((set.match(/markSessionRestored\(\);/g) ?? []).length, 2, 'both state formats mark the session restored');
  const load = HOST_CPP.slice(HOST_CPP.indexOf('void PlayerHost::loadPanelIntoWebView'));
  const flag = load.indexOf('__CE_PLAYER_SESSION__'), panel = load.indexOf('__CE_LOAD_PANEL__(');
  assert.ok(flag > -1 && flag < panel, 'the restored flag must be set before the panel loads');
  assert.match(PROCESSOR, /host\.isSessionRestored = \[&p\] \{ return p\.wasSessionRestored\(\); \};/);
  assert.match(PROCESSOR, /host\.notifySessionRestored\(\);/, 'a restore into an open window is not reported');
  assert.match(HOST_CPP, /emitToWebView \("sessionRestored"/);
  assert.match(PLAYER, /addEventListener\('sessionRestored'/);
  assert.match(PLAYER, /window\.__CE_PLAYER_SESSION__\?\.restored/);
});

test('opening the window moves the controls to the saved values and sends none of them', () => {
  // Before, applyParamSync committed every restored value to the synth on open, so an Ask panel
  // pushed without asking. The first host value per parameter is a seed now.
  const sync = PLAYER.slice(PLAYER.indexOf('function applyParamSync'), PLAYER.indexOf('function emitChangedParams'));
  const seed = sync.indexOf('hostSeeds.isSeed(parameterId)'), dedup = sync.indexOf('lastParamValue[parameterId] === v');
  assert.ok(seed > -1 && seed < dedup, 'the seed must be marked before the duplicate check');
  assert.ok(sync.indexOf('if (seed) return;') < sync.indexOf('commitDeviceParameter'), 'a seed must return before sending');
});

test('the Player connects under the panel\'s own role, and identifies a restored device', () => {
  assert.match(PLAYER, /\(\{ deviceRole, profileId \} = playerDeviceTarget\(next\)\);/);
  assert.match(PLAYER, /mapDeviceRole\(deviceRole, profileId,/, 'the port is still mapped under the default role');
  assert.ok(!/mapDeviceRole\(DEFAULT_DEVICE_ROLE/.test(PLAYER));
  // The processor waits for a READY role before it restores or asks. The identity handshake is
  // what makes it ready, and changes nothing on the synth.
  const run = PLAYER.slice(PLAYER.indexOf('function runStartupRead'));
  assert.match(run.slice(0, 1200), /request: 'identityRequest'/);
});

test('a question nobody could see is asked again', () => {
  // Two ways the prompt can be raised into nothing, and both leave the restore pending forever
  // with no bar on screen — the silent no-restore this feature exists to prevent. Closing a plugin
  // window is not an answer, and no callback yet means no window has claimed the question.
  const service = PROCESSOR.slice(PROCESSOR.indexOf('void serviceRestorePush'),
    PROCESSOR.indexOf('juce::String restorePromptDeviceName'));
  assert.match(service, /if \(restorePromptSent && ! windowOpen\) restorePromptSent = false;/,
    'a window closing with the question unanswered must let it be asked again');
  assert.match(service, /if \(onRestorePrompt == nullptr\) return;[\s\S]{0,120}restorePromptSent = true;/,
    'the prompt must not be marked sent when there is nothing to send it to');
});

// --- S3: the whole patch, not just the automation list ----------------------------------------

test('the dump goes out before the values', () => {
  // The values belong to the patch the dump IS, so sending them first has the dump overwrite them
  // a moment later. Same ordering rule the Setlist follows when it sends MIDI before values.
  const push = PROCESSOR.slice(PROCESSOR.indexOf('void runRestorePush'));
  const dumps = push.indexOf('sendRestoredDumps()');
  const values = push.indexOf('sendParamMidi');
  assert.ok(dumps > -1, 'the restore never sends the captured dump');
  assert.ok(dumps < values, 'the dump must be sent before the parameter values');
});

test('the dump is captured off the message thread, not inside getStateInformation', () => {
  // A host may call getStateInformation from any thread, and building a dump walks the whole
  // profile and runs the shared encoder over every parameter in it.
  const save = PROCESSOR.slice(PROCESSOR.indexOf('void getStateInformation'),
    PROCESSOR.indexOf('void setStateInformation'));
  assert.ok(!save.includes('buildDumpMessage'), 'getStateInformation must not build dumps itself');
  assert.match(save, /capturedDumpsLock/, 'the cached dump must be read under its lock');
  assert.match(save, /createNewChildElement \("DeviceDumps"\)/);
  assert.match(PROCESSOR, /void refreshCapturedDumps\(\)/);
});

test('capture is throttled and skipped when the patch has not moved', () => {
  // A dump is a walk over the whole profile. A knob being dragged would otherwise rebuild it
  // thirty times a second for a save that may never come.
  const capture = PROCESSOR.slice(PROCESSOR.indexOf('void serviceDumpCapture'),
    PROCESSOR.indexOf('void serviceRestorePush'));
  assert.match(capture, /dumpsLastCapturedMs/, 'the capture is not throttled');
  assert.match(capture, /if \(! changed\) return;/, 'an unchanged patch must cost nothing');
});

test('dumps are sent in the profile\'s declared order', () => {
  // A device with a common block and per-part blocks wants the common block first, and the profile
  // author is the only one who knows which is which.
  const send = PROCESSOR.slice(PROCESSOR.indexOf('int sendRestoredDumps'),
    PROCESSOR.indexOf('void runRestorePush'));
  assert.match(send, /dumpDefinitionIds\(\)/, 'the send order does not come from the profile');
});

test('one unbuildable dump does not cost the others', () => {
  // A profile can declare a dump this panel binds nothing in. Aborting the whole capture for it
  // would lose the block that would have worked.
  const refresh = PROCESSOR.slice(PROCESSOR.indexOf('void refreshCapturedDumps'),
    PROCESSOR.indexOf('int sendRestoredDumps'));
  assert.match(refresh, /if \(result\.ok && result\.hex\.isNotEmpty\(\)\)/,
    'a failed dump must be skipped, not fatal');
});

// --- S4: host-visible programs ----------------------------------------------------------------

test('setCurrentProgram sends nothing — the timer does', () => {
  // A host may call it from the audio thread (VST3 maps a program change onto a parameter), and the
  // send path runs a script's interceptMidiOut filter, which is message-thread work.
  const setter = PROCESSOR.slice(PROCESSOR.indexOf('void setCurrentProgram (int index)'),
    PROCESSOR.indexOf('const juce::String getProgramName'));
  assert.ok(!setter.includes('sendRawMidiBytes'), 'setCurrentProgram must not send from the caller\'s thread');
  assert.match(setter, /programChangePending\.store \(true\)/);
  assert.match(PROCESSOR, /std::atomic<bool> programChangePending/,
    'the flag is written from the audio thread and must be atomic');
});

test('a restored program index does not fire a program change', () => {
  // The restore push is about to put the whole patch back. A program change on top of it recalls a
  // slot over the patch that was just restored — the wrong sound and the wrong order.
  const load = PROCESSOR.slice(PROCESSOR.indexOf('getChildByName ("CurrentProgram")'),
    PROCESSOR.indexOf('getChildByName ("CurrentProgram")') + 700);
  assert.ok(!load.includes('programChangePending'), 'restoring the index must not queue a send');
  assert.match(load, /currentProgram = index;/);
});

test('a captured patch is sent as itself; a name-only slot is recalled', () => {
  // The two are genuinely different and the second is weaker: it tells the synth which of its own
  // patches to load, and what is in that slot today is the synth's business.
  const service = PROCESSOR.slice(PROCESSOR.indexOf('void serviceProgramChange'),
    PROCESSOR.indexOf('void serviceRestorePush'));
  assert.match(service, /program->hasData\(\)/);
  assert.match(service, /compilePresetRecall/);
  assert.match(service, /for \(const auto& message : recall\.transaction\.messages\)/,
    'a bankPc recall is three messages and each must go out on its own');
});

test('the plugin never reports zero programs', () => {
  // Some hosts refuse to instantiate such a plugin, and JUCE assumes at least one exists.
  assert.match(PROCESSOR, /int getNumPrograms\(\) override \{ return ce::hostProgramCount \(programBank\); \}/);
});

test('the bank is read once, at construction', () => {
  // The host caches getNumPrograms() the moment it loads us, so the count had better not change.
  const ctor = PROCESSOR.slice(PROCESSOR.indexOf('PlayerAudioProcessor()'),
    PROCESSOR.indexOf('~PlayerAudioProcessor() override'));
  assert.match(ctor, /programBank = ce::parseProgramBank \(document\);/);
});

test('the Player asks in a bar, and "not now" answers nothing', () => {
  // A modal over a plugin window in a DAW is a good way to lose a take. And a deferred restore is
  // still pending — sending "not now" to the processor would turn it into a third permanent answer.
  assert.match(PLAYER, /class="restore-bar"/);
  assert.ok(!/restore-bar[\s\S]{0,600}modal/i.test(PLAYER), 'the prompt should not be a modal');
  assert.match(PLAYER, /answerRestore\(''\)/, 'there is no "not now" that sends nothing');
  assert.match(PLAYER, /if \(backend && answer\) backend\.emitEvent\('restoreAnswer'/,
    '"not now" must not reach the processor');
});
