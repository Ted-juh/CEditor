// Locks the requested 36-feature Hostage completion audit to the source tree.
//
// Behavioral details live in the focused browser/native suites. This test protects the layer
// above them: every requested item must remain in the audit, must name implementation/UI/test
// evidence, and every native test routine cited by that body of work must actually be called by
// its executable. A dormant `void testThing()` is documentation, not evidence.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readRepo = (...parts) => readFileSync(path.join(repoRoot, ...parts), 'utf8');

const requestedFeatures = [
  'MIDI Looper',
  'Retrospective MIDI Capture',
  'Gesture Recorder',
  'Parameter Locks',
  'Modulation Matrix',
  'MIDI LFOs',
  'Envelope Generators',
  'MSEG Designer',
  'Random / Probability Modulators',
  'Smart Chorder',
  'Strummer',
  'Note Echo / MIDI Delay',
  'Scale / Key Engine',
  'Microtuning Manager',
  'MPE Transformer',
  'Velocity / Expression Designer',
  'Articulation Manager',
  'Pattern Variations',
  'Fill System',
  'Follow Actions',
  'Song / Scene Arranger',
  'MIDI Freeze / Bounce',
  'Preset Audition Engine',
  'Sound Comparison Mode',
  'Layer Voice Allocation',
  'Dynamic Layering',
  'Crossfading Layers',
  'Smart Transpose',
  'Humanizer',
  'Groove Templates',
  'Snapshot Automation',
  'Performance Recorder',
  'Instant Performance Replay',
  'Setlist Engine',
  'Plug-in Preloading',
  'Automatic Failover',
];

const nativeTestFiles = [
  ['CE', 'tests', 'InstrumentHostServiceTests.cpp'],
  ['CE', 'tests', 'PerformanceEngineTests.cpp'],
  ['CE', 'tests', 'RackHostTests.cpp'],
  ['CE', 'tests', 'RackModelTests.cpp'],
  ['CE', 'tests', 'PluginWorkerIsolationTests.cpp'],
];

test('the complete 36-item Hostage list retains implementation, UI and live test evidence', () => {
  const audit = readRepo('docs', 'design', 'hostage-feature-completion-audit.md');
  const rows = audit.split(/\r?\n/)
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));

  assert.equal(rows.length, requestedFeatures.length,
    'the completion matrix must contain every requested feature exactly once');
  assert.deepEqual(rows.map((row) => Number(row[0])),
    requestedFeatures.map((_, index) => index + 1),
    'feature numbers must remain contiguous and retain the requested order');
  assert.deepEqual(rows.map((row) => row[1]), requestedFeatures,
    'the matrix must not rename, merge or silently replace a requested feature');

  for (const row of rows) {
    assert.equal(row.length, 6, `${row[1]} must retain all six audit columns`);
    assert.match(row[2], /`[^`]+`/, `${row[1]} needs a concrete implementation symbol`);
    assert.ok(row[3].length > 3, `${row[1]} needs a reachable user surface`);
    assert.match(row[4], /test/i, `${row[1]} needs focused behavioral-test evidence`);
    assert.match(row[5], /^Implemented(?:\b| )/,
      `${row[1]} cannot be counted while its source verdict is incomplete`);
    assert.doesNotMatch(row.slice(2).join(' '),
      /\b(?:todo|fixme|placeholder|mock[- ]only|coming soon|planned only)\b/i,
      `${row[1]} still contains provisional rather than completion evidence`);
  }

  for (const parts of nativeTestFiles) {
    const source = readRepo(...parts);
    const definitions = [...source.matchAll(/^void\s+(test[A-Za-z0-9_]+)\s*\(/gm)]
      .map((match) => match[1]);
    assert.ok(definitions.length > 0, `${parts.at(-1)} must expose focused test routines`);
    assert.match(source, /\bint\s+main\s*\(/, `${parts.at(-1)} must remain executable`);
    for (const name of definitions) {
      const occurrences = [...source.matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))].length;
      assert.ok(occurrences >= 2,
        `${parts.at(-1)} defines ${name} but never calls it from its test run`);
    }
  }

  const authoritativeSources = [
    ['CE', 'src', 'InstrumentHost', 'InstrumentHostService.cpp'],
    ['CE', 'src', 'InstrumentHost', 'InstrumentHostService.h'],
    ['CE', 'src', 'InstrumentHost', 'RackModel.h'],
    ['CE', 'src', 'Performance', 'PatternModel.h'],
    ['CE', 'web', 'src', 'CE_Application', 'sections', 'PerformancePanel.svelte'],
    ['CE', 'web', 'src', 'CE_Application', 'sections', 'MidiChainPanel.svelte'],
    ['CE', 'web', 'src', 'CE_Application', 'sections', 'LayerGroupsPanel.svelte'],
    ['CE', 'web', 'src', 'CE_Application', 'sections', 'ReliabilityPanel.svelte'],
  ];
  for (const parts of authoritativeSources)
    assert.doesNotMatch(readRepo(...parts),
      /\b(?:todo|fixme|not implemented|unimplemented|coming soon|mock[- ]only)\b/i,
      `${parts.at(-1)} still advertises an unfinished requested-feature path`);
});
