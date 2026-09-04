// hostProductBuild.test.js — the generated Hostage product's assembly pipeline.
//
// Drives the pure half of tools/scripts/build-host-product.mjs: manifest validation, artifact
// resolution over a faked directory listing, the staging plan, and the ISCC switch list. The
// path arithmetic and the /D switches are where this pipeline can silently rot — a wrong
// artefacts directory stages nothing and a missing #ifndef guard makes a hand compile disagree
// with a pipeline compile — so both live under test, and the template itself is held to the
// switch list by the drift check at the bottom.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  normalizeProject, sanitizeBaseName, artifactCandidateDirs, resolveArtifacts,
  stagePlan, privateSymbolPlan, isccArgs, TEMPLATE_DEFINES,
} from '../../../tools/scripts/build-host-product.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const goodProject = {
  productName: 'Super Rack',
  version: '2.1.0',
  publisher: 'Tedjuh-inc',
  appId: '9B2C4E86-1D2E-4F30-8A4B-000000000001',
  includeStandalone: true,
  includeVst3: true,
};

// --- the manifest --------------------------------------------------------------------------------

test('a complete manifest normalizes without errors', () => {
  const { project, errors } = normalizeProject(goodProject);
  assert.deepEqual(errors, []);
  assert.equal(project.productName, 'Super Rack');
});

test('the manifest refusals name their field', () => {
  assert.match(normalizeProject({ ...goodProject, productName: '  ' }).errors.join(), /productName/);
  assert.match(normalizeProject({ ...goodProject, version: 'two' }).errors.join(), /version/);
  assert.match(normalizeProject({ ...goodProject, appId: 'not-a-guid' }).errors.join(), /appId/);
  assert.match(
    normalizeProject({ ...goodProject, includeStandalone: false, includeVst3: false }).errors.join(),
    /no targets/);
});

test('absent target flags default to on — a fresh manifest builds everything', () => {
  const { project } = normalizeProject({ productName: 'X', appId: goodProject.appId });
  assert.equal(project.includeStandalone, true);
  assert.equal(project.includeVst3, true);
});

test('the setup base name survives hostile product names', () => {
  assert.equal(sanitizeBaseName('Super Rack!'), 'SuperRack');
  assert.equal(sanitizeBaseName('...'), 'HostProduct');
});

// --- finding artifacts ---------------------------------------------------------------------------

const fakeTree = (entries) => (dir) => entries[dir] ?? [];

test('artifact resolution prefers the config directory and falls back beside it', () => {
  const dirs = artifactCandidateDirs({ buildDir: '/b', config: 'Release' });
  const artifacts = resolveArtifacts({
    candidateDirs: dirs,
    listDir: fakeTree({
      [path.join('/b', 'CEHostStandalone_artefacts', 'Release')]: ['Hostage.exe'],
      [path.join('/b', 'CEHostVST3_artefacts', 'VST3')]: ['Hostage.vst3'],
      [path.join('/b', 'Release')]: ['CEditorPluginScanner.exe', 'CEditorPluginWorker.exe'],
      [path.join('/b', 'symbols', 'Release')]: ['CEditorPluginWorker.pdb'],
    }),
  });
  assert.equal(artifacts.standaloneExe,
    path.join('/b', 'CEHostStandalone_artefacts', 'Release', 'Hostage.exe'));
  // The VST3 came from the single-config layout — the fallback, not the preferred dir.
  assert.equal(artifacts.vst3Bundle,
    path.join('/b', 'CEHostVST3_artefacts', 'VST3', 'Hostage.vst3'));
  assert.equal(artifacts.scannerExe, path.join('/b', 'Release', 'CEditorPluginScanner.exe'));
  assert.equal(artifacts.liveWorkerExe, path.join('/b', 'Release', 'CEditorPluginWorker.exe'));
  assert.equal(artifacts.liveWorkerPdb,
    path.join('/b', 'symbols', 'Release', 'CEditorPluginWorker.pdb'));
});

test('a staged scanner is never mistaken for the standalone', () => {
  const dirs = artifactCandidateDirs({ buildDir: '/b', config: 'Release' });
  const artifacts = resolveArtifacts({
    candidateDirs: dirs,
    listDir: fakeTree({
      [path.join('/b', 'CEHostStandalone_artefacts', 'Release')]:
        ['CEditorPluginScanner.exe', 'CEditorPluginWorker.exe', 'Hostage.exe'],
    }),
  });
  assert.equal(path.basename(artifacts.standaloneExe), 'Hostage.exe');
});

// --- the staging plan ----------------------------------------------------------------------------

const foundArtifacts = {
  standaloneExe: path.join('/b', 'exe', 'Hostage.exe'),
  vst3Bundle: path.join('/b', 'vst3', 'Hostage.vst3'),
  scannerExe: path.join('/b', 'scan', 'CEditorPluginScanner.exe'),
  liveWorkerExe: path.join('/b', 'scan', 'CEditorPluginWorker.exe'),
  liveWorkerPdb: path.join('/b', 'symbols', 'CEditorPluginWorker.pdb'),
};

test('the plan stages both targets with both workers beside each binary', () => {
  const { project } = normalizeProject(goodProject);
  const { ops, missing } = stagePlan({ project, artifacts: foundArtifacts, stageDir: '/s' });
  assert.deepEqual(missing, []);

  const targets = ops.map((op) => op.to);
  assert.ok(targets.includes(path.join('/s', 'Standalone', 'Hostage.exe')));
  assert.ok(targets.includes(path.join('/s', 'Standalone', 'CEditorPluginScanner.exe')));
  assert.ok(targets.includes(path.join('/s', 'Standalone', 'CEditorPluginWorker.exe')));
  assert.ok(targets.includes(path.join('/s', 'VST3', 'Hostage.vst3')));
  // Inside the bundle, beside the module — where the plug-in's worker search starts.
  assert.ok(targets.includes(path.join('/s', 'VST3', 'Hostage.vst3',
    'Contents', 'x86_64-win', 'CEditorPluginScanner.exe')));
  assert.ok(targets.includes(path.join('/s', 'VST3', 'Hostage.vst3',
    'Contents', 'x86_64-win', 'CEditorPluginWorker.exe')));
});

test('a disabled target stages nothing of itself', () => {
  const { project } = normalizeProject({ ...goodProject, includeVst3: false });
  const { ops, missing } = stagePlan({ project, artifacts: foundArtifacts, stageDir: '/s' });
  assert.deepEqual(missing, []);
  assert.ok(ops.every((op) => !op.to.includes('VST3')));
});

test('missing artifacts refuse by name instead of staging half a product', () => {
  const { project } = normalizeProject(goodProject);
  const { missing } = stagePlan({
    project,
    artifacts: {
      standaloneExe: null, vst3Bundle: foundArtifacts.vst3Bundle,
      scannerExe: null, liveWorkerExe: null,
    },
    stageDir: '/s',
  });
  assert.match(missing.join('\n'), /CEHostStandalone/);
  assert.match(missing.join('\n'), /CEditorPluginScanner/);
  assert.match(missing.join('\n'), /CEditorPluginWorker/);
});

// --- the installer compile -----------------------------------------------------------------------

test('the ISCC switches carry the whole manifest and the discovered names', () => {
  const { project } = normalizeProject(goodProject);
  const args = isccArgs({
    project, stageDir: '/s', outDir: '/o', artifacts: foundArtifacts, templatePath: '/t.iss',
  });
  assert.ok(args.includes('/DMyAppName=Super Rack'));
  assert.ok(args.includes('/DMyAppId=9B2C4E86-1D2E-4F30-8A4B-000000000001'));
  assert.ok(args.includes('/DMySetupBase=SuperRack'));
  assert.ok(args.includes('/DIncludeStandalone=1'));
  assert.ok(args.includes('/DMyAppExeName=Hostage.exe'));
  assert.ok(args.includes('/DMyVst3BundleName=Hostage.vst3'));
  assert.equal(args.at(-1), '/t.iss', 'the template is the trailing positional');
});

test('every /D the script can pass has an #ifndef guard in the template', () => {
  // The drift check: a define without a guard makes a hand compile of the template disagree
  // with a pipeline compile — the CEditor.iss convention, enforced instead of remembered.
  const template = readFileSync(
    path.join(repoRoot, 'tools', 'installer', 'HostProductTemplate.iss'), 'utf8');
  for (const name of TEMPLATE_DEFINES)
    assert.match(template, new RegExp(`#ifndef ${name}\\b`), `${name} needs an #ifndef default`);
});

test('the template pins identity to the manifest appId, braces escaped for Inno', () => {
  const template = readFileSync(
    path.join(repoRoot, 'tools', 'installer', 'HostProductTemplate.iss'), 'utf8');
  assert.match(template, /AppId=\{\{\{#MyAppId\}\}/,
    'AppId must render {GUID} — {{ is the literal brace, {#MyAppId} the preprocessor value');
});

test('a factory performance stages beside the exe and into the bundle resources', () => {
  const { project } = normalizeProject(goodProject);
  const { ops } = stagePlan({
    project, artifacts: foundArtifacts, stageDir: '/s', performanceFile: '/author/session-performance.json',
  });
  const targets = ops.map((op) => op.to);
  assert.ok(targets.includes(path.join('/s', 'Standalone', 'factory-performance.json')));
  assert.ok(targets.includes(path.join('/s', 'VST3', 'Hostage.vst3',
    'Contents', 'Resources', 'factory-performance.json')));
});

test('no factory performance stages none — the product starts empty, not broken', () => {
  const { project } = normalizeProject(goodProject);
  const { ops, missing } = stagePlan({ project, artifacts: foundArtifacts, stageDir: '/s' });
  assert.deepEqual(missing, []);
  assert.ok(ops.every((op) => !op.to.includes('factory-performance')));
});

test('matching worker symbols are archived privately and never enter the customer stage', () => {
  const { project } = normalizeProject(goodProject);
  const exeHash = 'a'.repeat(64);
  const pdbHash = 'b'.repeat(64);
  const plan = privateSymbolPlan({
    project, artifacts: foundArtifacts, symbolsRoot: '/private',
    workerExeSha256: exeHash, workerPdbSha256: pdbHash,
  });
  assert.deepEqual(plan.missing, []);
  assert.deepEqual(plan.ops, [{
    kind: 'copyFile',
    from: foundArtifacts.liveWorkerPdb,
    to: path.join('/private', '2.1.0', 'aaaaaaaaaaaaaaaa', 'CEditorPluginWorker.pdb'),
  }]);
  assert.equal(plan.manifest.binary.sha256, exeHash);
  assert.equal(plan.manifest.symbols.sha256, pdbHash);
  assert.equal(plan.manifest.visibility, 'private-not-shipped');

  const stage = stagePlan({ project, artifacts: foundArtifacts, stageDir: '/s' });
  assert.ok(stage.ops.every((op) => !op.to.toLowerCase().endsWith('.pdb')),
    'PDB files must never be copied under the installer source tree');
});

test('product assembly refuses a worker binary whose matching PDB was not preserved', () => {
  const { project } = normalizeProject(goodProject);
  const plan = privateSymbolPlan({
    project, artifacts: { ...foundArtifacts, liveWorkerPdb: null }, symbolsRoot: '/private',
    workerExeSha256: 'a'.repeat(64), workerPdbSha256: null,
  });
  assert.match(plan.missing.join('\n'), /CEditorPluginWorker\.pdb/);
  assert.deepEqual(plan.ops, []);
});

test('the editor installer archives matching worker symbols outside its install tree', () => {
  const script = readFileSync(path.join(
    repoRoot, 'tools', 'scripts', 'package-installer.ps1'), 'utf8');
  const installer = readFileSync(path.join(
    repoRoot, 'tools', 'installer', 'CEditor.iss'), 'utf8');

  assert.match(script, /function Archive-PrivateWorkerSymbols[\s\S]*Get-FileHash[\s\S]*symbols\.json/,
    'editor packaging must hash and preserve the matching PDB with a machine-readable manifest');
  assert.match(script, /build\\package\\private-symbols/,
    'private symbols must live beside rather than under the staged install tree');
  assert.doesNotMatch(installer, /\.pdb\b/i,
    'the customer installer must never collect private debug symbols');
});

test('every shipping host entry point uses the isolated live-worker instantiator', () => {
  const readRepo = (...parts) => readFileSync(path.join(repoRoot, ...parts), 'utf8');
  const shell = readRepo('CE', 'src', 'InstrumentHost', 'HostRuntimeShell.cpp');
  const outerPlugin = readRepo('CE', 'src', 'InstrumentHost', 'HostPluginProcessor.cpp');
  const editorPreview = readRepo('CE', 'src', 'ValueTreeBridgeHandlers.cpp');
  const ctrl49Demo = readRepo('CE', 'src', 'ControlSurface', 'Ctrl49RackDemo.cpp');
  const worker = readRepo('CE', 'src', 'InstrumentHost', 'PluginWorkerMain.cpp');
  const reliabilityPanel = readRepo('CE', 'web', 'src', 'CE_Application', 'sections',
    'ReliabilityPanel.svelte');
  const cmake = readRepo('CMakeLists.txt');

  for (const [name, source] of [
    ['standalone', shell], ['outer VST3', outerPlugin], ['editor preview', editorPreview],
    ['CTRL49 rack demo', ctrl49Demo],
  ]) {
    assert.match(source, /makeIsolatedPluginInstantiator\s*\(/,
      `${name} must instantiate through the process boundary`);
    assert.doesNotMatch(source, /options\.instantiate\s*=\s*makePluginInstantiator\s*\(/,
      `${name} must not silently fall back to in-process loading`);
    assert.doesNotMatch(source, /createPluginInstance\s*\(/,
      `${name} must not construct third-party plug-ins in the host process`);
    assert.doesNotMatch(source, /AudioPluginFormatManager/,
      `${name} must not retain an unused in-process plug-in loader`);
    assert.match(source, /livePluginIsolationAvailable\s*=\s*liveWorker\.existsAsFile\(\)/,
      `${name} must report isolation only when its worker executable exists`);
  }

  assert.match(worker, /AudioPluginFormatManager[\s\S]*createPluginInstance\s*\(/,
    'the disposable worker owns the only live third-party plug-in constructor');
  assert.doesNotMatch(worker, /enableAllBuses\s*\(/,
    'the worker must preserve negotiated buses instead of activating optional sidechains');

  assert.match(cmake, /add_executable\(CEditorPluginWorker[\s\S]*PluginWorkerMain\.cpp/);
  assert.match(cmake, /CE_HOST_COMMON_SOURCES[\s\S]*IsolatedPluginProxy\.cpp/);
  assert.match(reliabilityPanel, /\{#if failover\.isolationAvailable\}/,
    'the Health panel must distinguish an available worker from a missing one');
  assert.doesNotMatch(reliabilityPanel, /native access violation can still take[\s\S]{0,120}in-process host/i,
    'the process-isolation explanation must not contradict itself');
});

test('the real-VST acceptance harness is opt-in, isolated and never part of default CTest', () => {
  const readRepo = (...parts) => readFileSync(path.join(repoRoot, ...parts), 'utf8');
  const cmake = readRepo('CMakeLists.txt');
  const smoke = readRepo('CE', 'tests', 'PluginWorkerRealVstSmokeMain.cpp');
  const runner = readRepo('tools', 'scripts', 'run-real-vst-acceptance.ps1');

  assert.match(cmake, /option\(CEDITOR_REAL_VST_SMOKE[\s\S]*CTest\)" OFF\)/,
    'a machine-dependent installed plug-in must require an explicit configure opt-in');
  assert.match(cmake, /add_executable\(CEditorPluginWorkerRealVstSmoke EXCLUDE_FROM_ALL/,
    'the harness must not join the ordinary build graph');
  assert.doesNotMatch(cmake, /add_test\([^)]*CEditorPluginWorkerRealVstSmoke/,
    'licensed or interactive vendor plug-ins must never run in default CTest');
  assert.match(cmake, /JUCE_PLUGINHOST_VST3=0/,
    'the smoke-test host must be compiled without an in-process VST3 host');

  assert.match(smoke, /PluginScannerCoordinator[\s\S]*runOneJob/,
    'plug-in discovery must cross the short-lived scanner process');
  assert.match(smoke, /IsolatedPluginProxy::launchAsync/,
    'the selected class must cross the same live-worker proxy as the product');
  assert.match(smoke, /prepareToPlay[\s\S]*processBlock[\s\S]*getStateInformation/,
    'the acceptance path must exercise prepare, audio\/MIDI and state retrieval');
  assert.match(smoke, /setStateInformation/,
    'a non-empty real plug-in state must be restored to the worker');
  assert.match(smoke, /workerIsRunning\(\)/,
    'the harness must verify that processing and state calls leave the worker alive');
  assert.doesNotMatch(smoke, /createPluginInstance|createInstanceFromDescription|VST3PluginFormat/,
    'the acceptance host must never instantiate or scan vendor code in-process');

  assert.match(runner, /\[Parameter\(Mandatory = \$true\)\][\s\S]*\$InstrumentVst3[\s\S]*\[Parameter\(Mandatory = \$true\)\][\s\S]*\$EffectVst3/,
    'the completion runner must require both representative plug-in categories');
  assert.match(runner, /Invoke-SmokeRole -Role "instrument"[\s\S]*Invoke-SmokeRole -Role "effect"/,
    'instrument and effect must each complete the real process-boundary harness');
  assert.match(runner, /\$record\.processedBlocks -ne 12/,
    'the runner must reject a handshake-only result that never completed the block path');
  assert.match(runner, /\(\$Role -eq "instrument"\) -ne \$reportedInstrument/,
    'a second instrument must not be accepted as evidence for an effect');
  assert.match(runner, /REAL_VST_ACCEPTANCE/,
    'the two successful runs must produce one machine-readable gate record');
  assert.doesNotMatch(runner, /cmake\s+(?:--build|-S\b)/i,
    'the runner must never configure or rebuild as a side effect');
});

test('live-worker control frames retain partial reads across polling deadlines', () => {
  const readRepo = (...parts) => readFileSync(path.join(repoRoot, ...parts), 'utf8');
  const channel = readRepo('CE', 'src', 'InstrumentHost', 'PluginWorkerControlChannel.h');
  const nativeTest = readRepo('CE', 'tests', 'PluginWorkerProtocolTests.cpp');

  assert.match(channel, /pendingPrefixBytes/,
    'the next poll must resume a partly received length prefix');
  assert.match(channel, /pendingBodyBytes/,
    'the next poll must resume a partly received state body');
  assert.match(channel, /A polling deadline is not a framing boundary/,
    'the framing invariant should remain explicit beside the state machine');
  assert.match(nativeTest, /testReceiveResumesAfterPollingDeadline\s*\(\)/,
    'the native protocol suite must force a large frame across short polling deadlines');
});

test('isolated state restore and capture keep the proxy parameter mirror coherent', () => {
  const readRepo = (...parts) => readFileSync(path.join(repoRoot, ...parts), 'utf8');
  const proxy = readRepo('CE', 'src', 'InstrumentHost', 'IsolatedPluginProxy.cpp');
  const worker = readRepo('CE', 'src', 'InstrumentHost', 'PluginWorkerMain.cpp');
  const service = readRepo('CE', 'src', 'InstrumentHost', 'InstrumentHostService.cpp');
  const nativeTest = readRepo('CE', 'tests', 'PluginWorkerIsolationTests.cpp');

  assert.match(proxy, /flushParameterValues\s*\(3000, error\)[\s\S]*MessageType::getState/,
    'state capture must first deliver parameter edits that have not crossed an audio block');
  assert.match(proxy, /requestAndSyncParameters\s*\(MessageType::setState/,
    'state restore must replace the pre-restore proxy parameter snapshot');
  assert.match(proxy, /const auto effect = ! metadata\.instrument/,
    'MIDI-only effects must use delayed pass-through while sidechain instruments fail silent');
  assert.match(proxy, /config\.maxFrames = maxSupportedFrames/,
    'a later supported host block-size change must not outgrow the worker mapping');
  assert.match(worker, /MessageType::setParameter[\s\S]*processorSnapshot\s*\(processor\)/,
    'the worker must accept and acknowledge a complete parameter snapshot');
  assert.match(worker, /MessageType::setState[\s\S]*processorSnapshot\s*\(processor\)/,
    'the worker must return its post-state parameter values and program');
  assert.match(worker, /class ParentProcessWatchdog[\s\S]*TerminateProcess\s*\(GetCurrentProcess\(\), 73\)/,
    'an independent watchdog must reap a worker even when vendor code wedges its main thread');
  assert.match(worker, /wait != WaitResult::signalled\)[\s\S]{0,120}failed\.store/,
    'a broken data-plane event must become a worker failure instead of an idle zombie');
  assert.match(worker, /if \(! commandsStarted\)[\s\S]*audio\.stopThread \(1500\)/,
    'partial thread startup must unwind before worker-owned processor state is destroyed');
  assert.match(service, /lastKnownValues[\s\S]*retry\.parameterValues/,
    'failover must retain stable-ID values that may be newer than opaque plug-in state');
  assert.match(service, /if \(! failoverAttempt\)\s*failovers\.erase \(partId\)/,
    'a manual instrument replacement must cancel a queued automatic retry');
  assert.match(service, /if \(! failoverAttempt\)\s*failovers\.erase \(effectId\)/,
    'a manual effect replacement must cancel a queued automatic retry');
  assert.match(nativeTest, /state restore immediately refreshes the proxy's parameter mirror/,
    'the process fixture must verify the restored mirror before another audio block');
});

test('live-worker diagnostics are bounded, structured and explicitly support-bundled', () => {
  const readRepo = (...parts) => readFileSync(path.join(repoRoot, ...parts), 'utf8');
  const diagnostics = readRepo('CE', 'src', 'InstrumentHost', 'LiveWorkerDiagnostics.h');
  const proxy = readRepo('CE', 'src', 'InstrumentHost', 'IsolatedPluginProxy.cpp');
  const service = readRepo('CE', 'src', 'InstrumentHost', 'InstrumentHostService.cpp');
  const nativeTest = readRepo('CE', 'tests', 'InstrumentHostServiceTests.cpp');

  assert.match(diagnostics, /maximumBytes\s*=\s*512\s*\*\s*1024/,
    'a crash loop must not grow its worker log without bound');
  assert.match(diagnostics, /InterProcessLock/,
    'standalone and VST3 instances must not interleave structured log lines');
  assert.match(diagnostics, /live-worker-events\.previous\.jsonl/,
    'rotation must preserve the preceding diagnostic window');
  assert.match(proxy, /"launch_requested"[\s\S]*"worker_ready"/,
    'the log must distinguish launch attempts from completed worker handshakes');
  assert.match(proxy, /"control_receive_failed"/,
    'control-pipe failures must leave a diagnostic reason');
  assert.match(proxy, /"failed_worker_terminated"/,
    'a hung worker terminated by failover must leave a lifecycle event');
  assert.match(proxy, /if \(! launched\)[\s\S]*"launch_thread_failed"/,
    'failure to create the asynchronous launcher must itself be observable');
  assert.match(service, /LiveWorkerDiagnostics::supportFiles\s*\(options\.dataDirectory\)/,
    'the support bundle must name only the two internally-owned worker log files');
  assert.match(nativeTest, /previous\.existsAsFile\(\)[\s\S]*previous diagnostic window/,
    'native coverage must exercise real 512 KiB rotation, not only inspect the constant');
});

test('each live worker joins a host-owned bounded Windows job before loading vendor code', () => {
  const readRepo = (...parts) => readFileSync(path.join(repoRoot, ...parts), 'utf8');
  const job = readRepo('CE', 'src', 'InstrumentHost', 'PluginWorkerJob.h');
  const proxy = readRepo('CE', 'src', 'InstrumentHost', 'IsolatedPluginProxy.cpp');
  const worker = readRepo('CE', 'src', 'InstrumentHost', 'PluginWorkerMain.cpp');
  const stub = readRepo('CE', 'tests', 'PluginWorkerCrashStubMain.cpp');
  const nativeTest = readRepo('CE', 'tests', 'PluginWorkerIsolationTests.cpp');

  assert.match(job, /maximumAssociatedProcesses\s*=\s*64/,
    'a faulty plug-in must not proliferate an unbounded process tree');
  assert.match(job, /JOB_OBJECT_LIMIT_ACTIVE_PROCESS[\s\S]*JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/,
    'the job must bound process count and let Windows reap it when Hostage disappears');
  assert.match(job, /JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION/,
    'an unhandled vendor fault must exit rather than leave a modal OS error dialog');
  assert.match(proxy, /createHost \(jobName, error\)[\s\S]*process->start/,
    'Hostage must create and retain the job before starting the child process');
  assert.match(worker,
    /joinCurrentProcess \(workerJobName, error\)[\s\S]*manager\.addDefaultFormats\(\)/,
    'the real worker must join before discovering or constructing vendor code');
  assert.match(stub, /joinCurrentProcess[\s\S]*MessageType::createReply/,
    'the process fixture must obey the same pre-handshake job contract');
  assert.match(nativeTest, /handshake only after the stub joins its Windows worker job/,
    'native coverage must make the ordering part of its acceptance language');
});

test('unhandled live-worker faults write a fixed-ring minidump with explicit export consent', () => {
  const readRepo = (...parts) => readFileSync(path.join(repoRoot, ...parts), 'utf8');
  const slots = readRepo('CE', 'src', 'InstrumentHost', 'PluginWorkerCrashDumps.h');
  const reporter = readRepo('CE', 'src', 'InstrumentHost', 'PluginWorkerCrashReporter.cpp');
  const worker = readRepo('CE', 'src', 'InstrumentHost', 'PluginWorkerMain.cpp');
  const service = readRepo('CE', 'src', 'InstrumentHost', 'InstrumentHostService.cpp');
  const bundle = readRepo('CE', 'src', 'InstrumentHost', 'SupportBundle.cpp');
  const ui = readRepo('CE', 'web', 'src', 'CE_Application', 'sections', 'ReliabilityPanel.svelte');
  const fixture = readRepo('CE', 'tests', 'PluginWorkerCrashStubMain.cpp');
  const nativeTest = readRepo('CE', 'tests', 'PluginWorkerIsolationTests.cpp');
  const cmake = readRepo('CMakeLists.txt');

  assert.match(slots, /slotCount\s*=\s*8[\s\S]*live-worker-slot-/,
    'dump retention must be a hard fixed-filename bound, not best-effort pruning');
  assert.match(slots, /metadataFile[\s\S]*live-worker-slot-[\s\S]*\.json/,
    'each dump slot must have one equally bounded build-identity sidecar');
  assert.match(reporter, /MiniDumpNormal[\s\S]*MiniDumpWriteDump/,
    'the worker must capture a diagnostic minidump without full-process memory');
  assert.doesNotMatch(reporter, /MiniDumpWithFullMemory/,
    'the default dump must not opt into full process memory');
  assert.match(reporter, /workerSha256/,
    'the minidump comment must carry the exact worker fingerprint');
  assert.match(reporter, /metadataPath[\s\S]*WriteFile/,
    'the crash path must persist its precomputed sidecar without JSON work in the handler');
  assert.match(worker,
    /crashReporter\.install[\s\S]*manager\.createPluginInstance/,
    'the reporter must be active before vendor construction begins');
  assert.match(service, /includeWorkerDumps[^\n]*false/,
    'support export must default worker minidumps off at the native command boundary');
  assert.match(bundle, /workerMinidumpsIncluded[\s\S]*if \(options\.includeWorkerDumps\)/,
    'the manifest must record consent and binary export must enforce it');
  assert.match(ui, /includeWorkerDumps\s*=\s*\$state\(false\)/,
    'the Reliability UI must also begin with the dump opt-in off');
  assert.match(ui, /can contain stack memory and[\s\S]*local file paths/,
    'the opt-in must explain why minidumps are sensitive');
  assert.match(fixture, /EXCEPTION_ACCESS_VIOLATION/,
    'the process fixture must cause an actual unhandled native fault');
  assert.match(nativeTest, /memcmp \(header\.getData\(\), "MDMP", 4\)/,
    'native acceptance must inspect the produced file rather than infer it from process death');
  assert.match(nativeTest, /SHA256 \(stub\)[\s\S]*bounded sidecar identifies the exact worker/,
    'native acceptance must bind the crash artefact to the precise worker executable');
  assert.match(service, /supportMetadataFiles[\s\S]*crashDumpMetadataFiles/,
    'support export must use the fixed sidecar allowlist rather than sweep crash-dumps');
  assert.match(cmake, /PluginWorkerCrashReporter\.cpp[\s\S]*dbghelp/,
    'worker targets must link the Windows minidump implementation');
  assert.match(cmake,
    /ce_enable_private_release_symbols\(CEditorPluginWorker\)[\s\S]*CEditor: live VST3 worker ENABLED/,
    'the shipping worker must retain optimized release symbols');
  assert.match(cmake, /DEBUG:FULL[\s\S]*PDBALTPATH[\s\S]*PDB_OUTPUT_DIRECTORY_RELEASE/,
    'release symbols must be complete, path-private and written outside shippable artefacts');
});

test('the isolated worker fixture repeatedly covers every representative supported block size', () => {
  const nativeTest = readFileSync(path.join(
    repoRoot, 'CE', 'tests', 'PluginWorkerIsolationTests.cpp'), 'utf8');

  assert.match(nativeTest,
    /constexpr int sizes\[\]\s*\{\s*16, 64, 128, 256, 512, 1024, 2048, 4096, 8192\s*\}/,
    'native coverage must span small device buffers through the declared 8192-frame ceiling');
  assert.match(nativeTest, /for \(int iteration = 0; iteration < 12; \+\+iteration\)/,
    'each size must reuse the shared-memory slots repeatedly instead of receiving one token call');
  assert.match(nativeTest, /processedBlocks == 108/,
    'the fixture must prove that every planned block completed the one-block pipeline');
});

test('every command exposed by the Hostage store has a native service handler', () => {
  const store = readFileSync(path.join(
    repoRoot, 'CE', 'web', 'src', 'CE_Application', 'stores', 'instrumentHost.js'), 'utf8');
  const service = readFileSync(path.join(
    repoRoot, 'CE', 'src', 'InstrumentHost', 'InstrumentHostService.cpp'), 'utf8');

  const storeCommands = new Set(
    [...store.matchAll(/cmd:\s*'([^']+)'/g)].map((match) => match[1]));
  const nativeCommands = new Set(
    [...service.matchAll(/cmd\s*==\s*"([^"]+)"/g)].map((match) => match[1]));
  const missing = [...storeCommands].filter((command) => !nativeCommands.has(command)).sort();
  const internalNativeCommands = [
    'addLibraryPath',            // continuation of the native directory chooser
    'getLicence',                // state-refresh compatibility route
    'surfacePerformanceEncoder', // CTRL49 callback and recorded replay action
    'surfaceStepPad',            // CTRL49 callback and recorded replay action
  ];
  const nativeOnly = [...nativeCommands]
    .filter((command) => !storeCommands.has(command)).sort();

  assert.ok(storeCommands.size > 200, 'the audit must cover the complete Hostage command surface');
  assert.deepEqual(missing, [],
    `store commands without native handlers: ${missing.join(', ')}`);
  assert.deepEqual(nativeOnly, internalNativeCommands,
    `native commands without a browser route: ${nativeOnly.join(', ')}`);
});

test('persisted rack and performance lists expose their native edit operations', () => {
  const readRepo = (...parts) => readFileSync(path.join(repoRoot, ...parts), 'utf8');
  const host = readRepo('CE', 'web', 'src', 'CE_Application', 'sections', 'InstrumentHostView.svelte');
  const mixer = readRepo('CE', 'web', 'src', 'CE_Application', 'sections', 'HostMixerPanel.svelte');
  const performance = readRepo('CE', 'web', 'src', 'CE_Application', 'sections', 'PerformancePanel.svelte');

  for (const operation of [
    'moveRackPart', 'renameControlPage', 'renameMacro', 'renameReturn',
  ]) assert.match(host, new RegExp(`\\b${operation}\\b`), `${operation} needs a reachable host control`);
  assert.match(mixer, /\brenameBus\b/, 'group buses need a reachable rename control');
  for (const operation of ['renameScene', 'moveSetlistItem'])
    assert.match(performance, new RegExp(`\\b${operation}\\b`), `${operation} needs a reachable performance control`);

  assert.equal([...mixer.matchAll(/data-testid="bus-strip"/g)].length, 1,
    'the bus strip belongs to the bus bank once, never inside every part send section');
});

test('every command-sending store export is reachable from Svelte or deliberately internal', () => {
  const store = readFileSync(path.join(
    repoRoot, 'CE', 'web', 'src', 'CE_Application', 'stores', 'instrumentHost.js'), 'utf8');
  const ui = [
    'InstrumentHostView.svelte', 'HostMixerPanel.svelte', 'PerformancePanel.svelte',
    'MidiChainPanel.svelte', 'LayerGroupsPanel.svelte', 'HostRackCanvas.svelte',
    'ProductPanel.svelte', 'ReliabilityPanel.svelte', 'LicencePanel.svelte',
    'StageView.svelte', 'HostSurfacePanel.svelte',
  ].map((name) => readFileSync(path.join(
    repoRoot, 'CE', 'web', 'src', 'CE_Application', 'sections', name), 'utf8')).join('\n');

  const commandExports = store.split(/(?=export const\s+)/).flatMap((source) => {
    const name = source.match(/^export const\s+(\w+)/)?.[1];
    // Command wrappers are deliberately tiny. Limiting the declaration slice avoids assigning
    // a later exported function's send() to a long derived-store declaration.
    return name && /\bsend\s*\(/.test(source.slice(0, 500)) ? [name] : [];
  });
  const internal = new Set(['requestHostState']); // bridge initialization, not a visible action
  const unreachable = commandExports.filter((name) => !internal.has(name)
    && !(new RegExp(`\\b${name}\\b`)).test(ui)).sort();

  assert.ok(commandExports.length > 240, 'the audit must cover the complete exported command API');
  assert.deepEqual(unreachable, [],
    `command exports without a Svelte route: ${unreachable.join(', ')}`);
});
