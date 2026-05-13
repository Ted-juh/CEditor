import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeCustomComponentReadiness,
  createCustomComponentLibraryEnvelope,
  createCustomComponentExportEnvelope,
  customComponentPackageProvenance,
  createCustomComponentThumbnail,
  customComponentPackageId,
  fingerprintCustomComponent,
  inferCustomComponentCapabilities,
  instantiateCustomComponentPackageControl,
  normalizeCustomComponentLibraryEnvelope,
  normalizeCustomComponentEnvelope,
  summarizeCustomComponentAssets,
  summarizeCustomComponent,
  summarizeCustomComponentPublicApi,
  validateCustomComponentPackage,
} from '../src/CE_Application/utils/customComponentPackage.js';

function makeCustomComponent(overrides = {}) {
  return {
    _children: {
      Core: { id: 'custom_package', name: 'Macro Grid', controlType: 'CustomComponent', enabled: true },
      Parts: { _children: { background: { _type: 'Part', name: 'background' } } },
      ValueChannels: { _children: { mainValue: { type: 'float', min: 0, max: 1, defaultValue: 0.5 } } },
      Behaviors: { _children: { mainSlider: { enabled: true, valueChannel: 'mainValue' } } },
      HitZones: { _children: { drag: { enabled: true, targetBehavior: 'mainSlider', targetValueChannel: 'mainValue' } } },
      PublishedProperties: {
        inputs: { mainValue: { enabled: true, channel: 'mainValue', type: 'float' } },
        outputs: { mainValue: { enabled: true, channel: 'mainValue', type: 'float' } },
      },
      Assets: { filmstrips: {} },
      Generators: { _children: {} },
      ExternalAPI: { addressableName: 'macroGrid' },
      Designer: { notes: 'Reusable macro grid.' },
      ...overrides,
    },
  };
}

test('validateCustomComponentPackage accepts complete custom component packages', () => {
  const validation = validateCustomComponentPackage(makeCustomComponent());

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.issues, []);
});

test('validateCustomComponentPackage catches broken generated hit-zone targets', () => {
  const validation = validateCustomComponentPackage(makeCustomComponent({
    Generators: {
      _children: {
        grid: {
          enabled: true,
          type: 'grid',
          rows: 1,
          columns: 1,
          generatedPartPrefix: 'grid',
          generatedHitZones: true,
          targetBehavior: 'mainSlider',
          targetValueChannel: 'missingValue',
        },
      },
    },
  }));

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.includes('missingValue')));
});

test('summarizeCustomComponent includes runtime generator output', () => {
  const summary = summarizeCustomComponent(makeCustomComponent({
    Generators: {
      _children: {
        grid: {
          enabled: true,
          type: 'grid',
          rows: 1,
          columns: 1,
          generatedPartPrefix: 'grid',
          generatedHitZones: true,
          targetBehavior: 'mainSlider',
          targetValueChannel: 'mainValue',
        },
      },
    },
  }));

  assert.equal(summary.parts, 1);
  assert.equal(summary.hitZones, 1);
  assert.equal(summary.generatedParts, 4);
  assert.equal(summary.generatedHitZones, 1);
  assert.equal(summary.generatedSources, 1);
  assert.equal(summary.materializedParts, 5);
  assert.equal(summary.materializedHitZones, 2);
});

test('createCustomComponentThumbnail includes materialized visual parts', () => {
  const thumbnail = createCustomComponentThumbnail(makeCustomComponent({
    Transform: { _type: 'Transform', width: 200, height: 100 },
    Generators: {
      _children: {
        ticks: {
          enabled: true,
          type: 'ticks',
          count: 3,
          generatedPartPrefix: 'tick',
          targetBehavior: 'mainSlider',
          targetValueChannel: 'mainValue',
        },
      },
    },
  }));

  assert.equal(thumbnail.width, 200);
  assert.equal(thumbnail.height, 100);
  assert.ok(thumbnail.parts.length >= 4);
  assert.ok(thumbnail.parts.some((part) => part.name === 'tick_major_1'));
  assert.ok(thumbnail.parts.every((part) => Number.isFinite(part.x) && Number.isFinite(part.width)));
});

test('createCustomComponentExportEnvelope stores a thumbnail descriptor', () => {
  const envelope = createCustomComponentExportEnvelope(makeCustomComponent(), {
    name: 'Macro Grid',
    version: '1.0.0',
  });
  const reloaded = normalizeCustomComponentEnvelope(envelope);

  assert.ok(envelope.thumbnail);
  assert.ok(envelope.thumbnail.parts.length > 0);
  assert.equal(envelope.capabilities.primaryKind, 'slider');
  assert.deepEqual(reloaded.thumbnail, envelope.thumbnail);
  assert.deepEqual(reloaded.capabilities, envelope.capabilities);
});

test('summarizeCustomComponentPublicApi preserves editable package surface metadata', () => {
  const api = summarizeCustomComponentPublicApi(makeCustomComponent({
    PublishedProperties: {
      inputs: {
        gain: {
          enabled: true,
          channel: 'mainValue',
          label: 'Gain',
          type: 'float',
          min: 0,
          max: 1,
          step: 0.01,
          defaultValue: 0.5,
        },
      },
      outputs: {
        mode: {
          enabled: true,
          channel: 'mainValue',
          label: 'Mode',
          type: 'enum',
          values: ['A', 'B'],
          defaultValue: 'A',
        },
      },
      editableProperties: {
        accent: {
          enabled: true,
          path: 'Parts.background.Background.Fill.colour',
          label: 'Accent',
          type: 'color',
          defaultValue: 'FF5B9BD5',
        },
      },
    },
  }));

  assert.equal(api.counts.total, 3);
  assert.deepEqual(api.inputs[0], {
    name: 'gain',
    label: 'Gain',
    type: 'float',
    channel: 'mainValue',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.5,
  });
  assert.deepEqual(api.outputs[0].values, ['A', 'B']);
  assert.equal(api.properties[0].path, 'Parts.background.Background.Fill.colour');
  assert.equal(api.properties[0].defaultValue, 'FF5B9BD5');
});

test('inferCustomComponentCapabilities classifies compound component packages', () => {
  const capabilities = inferCustomComponentCapabilities(makeCustomComponent({
    ValueChannels: {
      _children: {
        mainValue: { type: 'float', min: 0, max: 1, defaultValue: 0.5 },
        yValue: { type: 'float', min: 0, max: 1, defaultValue: 0.25 },
      },
    },
    Behaviors: {
      _children: {
        xyPad: { enabled: true, type: 'xy-pad', valueChannel: 'mainValue', valueChannels: ['mainValue', 'yValue'] },
      },
    },
    Generators: {
      _children: {
        xyGrid: {
          enabled: true,
          type: 'grid',
          rows: 4,
          columns: 4,
          generatedPartPrefix: 'grid',
          targetBehavior: 'xyPad',
          targetValueChannel: 'mainValue',
          targetValueChannelY: 'yValue',
        },
      },
    },
    Links: { _children: { route: { enabled: true, type: 'map', source: 'mainValue', target: 'yValue' } } },
  }));

  assert.equal(capabilities.primaryKind, 'grid');
  assert.ok(capabilities.labels.includes('grid'));
  assert.ok(capabilities.labels.includes('xy'));
  assert.ok(capabilities.labels.includes('multi'));
  assert.ok(capabilities.labels.includes('linked'));
});

test('custom component package summaries understand arpeggiator patterns', () => {
  const control = makeCustomComponent({
    Designer: {
      notes: 'Step sequencer.',
      arpeggiator: {
        enabled: true,
        stepCount: 16,
        viewNote: 60,
        blocks: [
          { id: 'kick', note: 60, step: 0, length: 2, velocity: 100 },
          { id: 'fifth', note: 67, step: 4, length: 1, velocity: 84 },
        ],
      },
    },
    ValueChannels: {
      _children: {
        mainValue: { type: 'float', min: 0, max: 1, defaultValue: 0.5 },
        arpCurrentStep: { type: 'int', min: 0, max: 15, defaultValue: 0 },
        arpNote: { type: 'int', min: 0, max: 127, defaultValue: 0 },
        arpVelocity: { type: 'int', min: 0, max: 127, defaultValue: 0 },
        arpGate: { type: 'bool', defaultValue: false },
      },
    },
    PublishedProperties: {
      inputs: {
        arpCurrentStep: { enabled: true, channel: 'arpCurrentStep', type: 'int', min: 0, max: 15, defaultValue: 0 },
      },
      outputs: {
        arpNote: { enabled: true, channel: 'arpNote', type: 'int', min: 0, max: 127, defaultValue: 0 },
        arpVelocity: { enabled: true, channel: 'arpVelocity', type: 'int', min: 0, max: 127, defaultValue: 0 },
        arpGate: { enabled: true, channel: 'arpGate', type: 'bool', defaultValue: false },
      },
    },
  });
  const summary = summarizeCustomComponent(control);
  const capabilities = inferCustomComponentCapabilities(control);
  const validation = validateCustomComponentPackage(control);

  assert.equal(summary.arpeggiator, true);
  assert.equal(summary.arpeggiatorSteps, 16);
  assert.equal(summary.arpeggiatorBlocks, 2);
  assert.equal(summary.arpeggiatorNotes, 2);
  assert.equal(capabilities.primaryKind, 'arpeggiator');
  assert.ok(capabilities.labels.includes('sequencer'));
  assert.equal(validation.ok, true);
});

test('validateCustomComponentPackage flags incomplete arpeggiator wiring', () => {
  const validation = validateCustomComponentPackage(makeCustomComponent({
    Designer: {
      arpeggiator: {
        enabled: true,
        stepCount: 32,
        blocks: [],
      },
    },
  }));

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.includes('arpCurrentStep')));
  assert.ok(validation.warnings.some((warning) => warning.includes('no note blocks')));
});

test('validateCustomComponentPackage catches broken published API entries', () => {
  const validation = validateCustomComponentPackage(makeCustomComponent({
    PublishedProperties: {
      inputs: { brokenInput: { enabled: true, channel: 'missingInput', type: 'float' } },
      outputs: { brokenOutput: { enabled: true, channel: 'missingOutput', type: 'float' } },
      editableProperties: { label: { enabled: true, path: '' } },
    },
  }));

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.includes('brokenInput')));
  assert.ok(validation.issues.some((issue) => issue.includes('brokenOutput')));
  assert.ok(validation.issues.some((issue) => issue.includes('Editable property')));
});

test('validateCustomComponentPackage catches editable properties targeting missing internals', () => {
  const validation = validateCustomComponentPackage(makeCustomComponent({
    PublishedProperties: {
      inputs: { mainValue: { enabled: true, channel: 'mainValue', type: 'float' } },
      outputs: { mainValue: { enabled: true, channel: 'mainValue', type: 'float' } },
      editableProperties: {
        missingPartColour: { enabled: true, path: 'Parts.missing.Background.Fill.colour' },
        missingChannelMin: { enabled: true, path: 'ValueChannels.missing.min' },
        validVariant: { enabled: true, path: 'Designer.activeVariant' },
      },
    },
  }));

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.includes('missingPartColour') && issue.includes('missing part')));
  assert.ok(validation.issues.some((issue) => issue.includes('missingChannelMin') && issue.includes('missing value channel')));
  assert.ok(!validation.issues.some((issue) => issue.includes('validVariant')));
});

test('validateCustomComponentPackage warns about incomplete published metadata', () => {
  const validation = validateCustomComponentPackage(makeCustomComponent({
    ValueChannels: {
      _children: {
        mainValue: { type: 'float', min: 0, max: 1, defaultValue: 0.5 },
        mode: { type: 'enum', values: ['A', 'B'], defaultValue: 'A' },
      },
    },
    PublishedProperties: {
      inputs: {
        badRange: { enabled: true, channel: 'mainValue', type: 'float', min: 1, max: 0, defaultValue: 2 },
        typeMismatch: { enabled: true, channel: 'mode', type: 'float', min: 0, max: 1 },
      },
      outputs: {
        badChoice: { enabled: true, channel: 'mode', type: 'enum', values: ['B'], defaultValue: 'A' },
      },
      editableProperties: {
        labelText: { enabled: true, path: 'Parts.background.name', type: 'text' },
      },
    },
  }));

  assert.equal(validation.ok, true);
  assert.ok(validation.warnings.some((warning) => warning.includes('badRange') && warning.includes('min is greater than max')));
  assert.ok(validation.warnings.some((warning) => warning.includes('badRange') && warning.includes('outside its public range')));
  assert.ok(validation.warnings.some((warning) => warning.includes('typeMismatch') && warning.includes('differs from channel type')));
  assert.ok(validation.warnings.some((warning) => warning.includes('badChoice') && warning.includes('not in its public enum values')));
  assert.ok(validation.warnings.some((warning) => warning.includes('labelText') && warning.includes('no package default value')));
});

test('validateCustomComponentPackage warns about incomplete image assets', () => {
  const validation = validateCustomComponentPackage(makeCustomComponent({
    Assets: {
      images: {
        emptyBadge: { name: 'emptyBadge', source: '', width: 0, height: 0 },
        missingSize: { name: 'missingSize', source: 'data:image/png;base64,abc' },
      },
      filmstrips: {},
    },
  }));

  assert.equal(validation.ok, true);
  assert.ok(validation.warnings.some((warning) => warning.includes('emptyBadge') && warning.includes('no embedded source')));
  assert.ok(validation.warnings.some((warning) => warning.includes('missingSize') && warning.includes('width/height')));
});

test('summarizeCustomComponentAssets creates a searchable package manifest', () => {
  const assetManifest = summarizeCustomComponentAssets(makeCustomComponent({
    Assets: {
      images: {
        badge: {
          source: 'data:image/png;base64,QUJDRA==',
          width: 12,
          height: 8,
          sourceFileName: 'badge.png',
          importedAt: '2026-05-07T12:00:00.000Z',
        },
      },
      filmstrips: {
        knob: {
          source: 'data:image/png;base64,QUJDRA==',
          width: 40,
          height: 160,
          frameWidth: 40,
          frameHeight: 40,
          frameCount: 4,
          orientation: 'vertical',
          valueSource: 'mainValue',
        },
      },
    },
  }));

  assert.equal(assetManifest.counts.images, 1);
  assert.equal(assetManifest.counts.filmstrips, 1);
  assert.equal(assetManifest.counts.total, 2);
  assert.equal(assetManifest.totalBytes, 8);
  assert.equal(assetManifest.images[0].mimeType, 'image/png');
  assert.equal(assetManifest.images[0].bytes, 4);
  assert.equal(assetManifest.images[0].sourceFileName, 'badge.png');
  assert.equal(assetManifest.filmstrips[0].frameCount, 4);
  assert.equal(assetManifest.filmstrips[0].valueSource, 'mainValue');
});

test('validateCustomComponentPackage warns about heavy embedded assets', () => {
  const largePayload = 'A'.repeat(3 * 1024 * 1024);
  const validation = validateCustomComponentPackage(makeCustomComponent({
    Assets: {
      images: {
        largeBadge: {
          source: `data:image/png;base64,${largePayload}`,
          width: 1024,
          height: 1024,
        },
      },
      filmstrips: {
        largeKnob: {
          source: `data:image/png;base64,${largePayload}`,
          frameCount: 64,
        },
      },
    },
  }));

  assert.equal(validation.ok, true);
  assert.ok(validation.warnings.some((warning) => warning.includes('largeBadge') && warning.includes('embedded')));
  assert.ok(validation.warnings.some((warning) => warning.includes('largeKnob') && warning.includes('fewer frames')));
});

test('validateCustomComponentPackage catches broken animation targets', () => {
  const validation = validateCustomComponentPackage(makeCustomComponent({
    Animations: {
      _children: {
        badMove: {
          enabled: true,
          targets: [
            { path: 'Parts.missingHandle.Layout.scale', properties: ['transform'] },
            { path: '', properties: ['opacity'] },
          ],
        },
      },
    },
  }));

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.includes('missingHandle')));
  assert.ok(validation.issues.some((issue) => issue.includes('empty target')));
});

test('validateCustomComponentPackage catches broken bindings, links, generators, and filmstrip sources', () => {
  const validation = validateCustomComponentPackage(makeCustomComponent({
    Bindings: {
      _children: {
        badBinding: {
          enabled: true,
          source: 'channel.missingChannel.normalized',
          target: 'Parts.missingHandle.Layout.rotation',
        },
      },
    },
    Links: {
      _children: {
        badRoute: {
          enabled: true,
          type: 'map',
          source: 'mainValue',
          target: 'missingTarget',
        },
      },
    },
    Generators: {
      _children: {
        badFilmstripGenerator: {
          enabled: true,
          type: 'filmstrip-frames',
          assetName: 'missingFilmstrip',
          targetValueChannel: 'missingGeneratorChannel',
        },
      },
    },
    Assets: {
      images: {},
      filmstrips: {
        knobFrames: {
          source: 'data:image/png;base64,abc',
          frameCount: 8,
          valueSource: 'missingFilmstripSource',
        },
      },
    },
    PublishedProperties: {
      inputs: { mainValue: { enabled: true, channel: 'mainValue', type: 'float' } },
      outputs: { mainValue: { enabled: true, channel: 'mainValue', type: 'float' } },
      editableProperties: {
        badFilmstripSource: { enabled: true, path: 'Assets.filmstrips.missing.source' },
      },
    },
  }));

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.includes('badBinding') && issue.includes('missingChannel')));
  assert.ok(validation.issues.some((issue) => issue.includes('badBinding') && issue.includes('missingHandle')));
  assert.ok(validation.issues.some((issue) => issue.includes('badRoute') && issue.includes('missingTarget')));
  assert.ok(validation.issues.some((issue) => issue.includes('badFilmstripGenerator') && issue.includes('missingFilmstrip')));
  assert.ok(validation.issues.some((issue) => issue.includes('missingGeneratorChannel')));
  assert.ok(validation.issues.some((issue) => issue.includes('knobFrames') && issue.includes('missingFilmstripSource')));
  assert.ok(validation.issues.some((issue) => issue.includes('badFilmstripSource')));
});

test('analyzeCustomComponentReadiness reports reusable package progress', () => {
  const ready = analyzeCustomComponentReadiness(makeCustomComponent({
    Bindings: { _children: { move: { enabled: true, source: 'value.normalized', target: 'Parts.background.Layout.x' } } },
    PublishedProperties: {
      inputs: { mainValue: { enabled: true, channel: 'mainValue', type: 'float' } },
      outputs: { mainValue: { enabled: true, channel: 'mainValue', type: 'float' } },
      editableProperties: { fill: { enabled: true, path: 'Parts.background.Background.Fill.colour' } },
    },
    Assets: { images: {}, filmstrips: { knob: { source: 'data:image/png;base64,abc', frameCount: 8 } } },
  }));

  assert.equal(ready.ok, true);
  assert.equal(ready.requiredOpenCount, 0);
  assert.ok(ready.score > 80);
  assert.ok(ready.steps.some((step) => step.id === 'publicApi' && step.done));
  assert.ok(ready.steps.some((step) => step.id === 'assets' && step.done));

  const broken = analyzeCustomComponentReadiness(makeCustomComponent({
    Parts: { _children: {} },
    ValueChannels: { _children: {} },
    PublishedProperties: { inputs: {}, outputs: {} },
  }));

  assert.equal(broken.ok, false);
  assert.ok(broken.requiredOpenCount >= 2);
  assert.ok(broken.steps.some((step) => step.id === 'visuals' && !step.done));
  assert.ok(broken.steps.some((step) => step.id === 'values' && !step.done));
});

test('createCustomComponentExportEnvelope normalizes metadata and can be reloaded', () => {
  const control = makeCustomComponent();
  const envelope = createCustomComponentExportEnvelope(control, {
    name: 'Macro Grid',
    version: '2.0.0',
    tags: 'grid, macro, custom',
    category: 'grid',
    license: 'MIT',
    homepage: 'https://example.test/macro-grid',
  });
  const reloaded = normalizeCustomComponentEnvelope(envelope);

  assert.equal(envelope.format, 'ceditor-component');
  assert.equal(envelope.compatibility.customComponentVersion, 1);
  assert.equal(envelope.metadata.id, 'macrogrid');
  assert.equal(envelope.metadata.version, '2.0.0');
  assert.deepEqual(envelope.metadata.tags, ['grid', 'macro', 'custom']);
  assert.equal(envelope.metadata.category, 'grid');
  assert.equal(envelope.metadata.license, 'MIT');
  assert.equal(envelope.metadata.homepage, 'https://example.test/macro-grid');
  assert.equal(envelope.summary.parts, 1);
  assert.equal(envelope.summary.publicInputs, 1);
  assert.equal(typeof envelope.fingerprint, 'string');
  assert.equal(envelope.fingerprint, fingerprintCustomComponent(control));
  assert.equal(customComponentPackageId(envelope), 'macrogrid@2-0-0');
  assert.equal(reloaded.metadata.name, 'Macro Grid');
  assert.equal(reloaded.validation.ok, true);
  assert.deepEqual(reloaded.summary, summarizeCustomComponent(control));
  assert.equal(reloaded.publicApiSummary.counts.inputs, 1);
  assert.equal(reloaded.assetManifest.counts.total, 0);
  assert.equal(envelope.readiness.ok, true);
  assert.equal(reloaded.readiness.ok, true);
  assert.ok(reloaded.readiness.score > 0);
  assert.equal(reloaded.readiness.requiredOpenCount, 0);
  assert.equal(reloaded.fingerprint, envelope.fingerprint);
});

test('normalizeCustomComponentEnvelope warns about newer package compatibility', () => {
  const envelope = createCustomComponentExportEnvelope(makeCustomComponent());
  envelope.formatVersion = 99;
  envelope.compatibility = {
    customComponentVersion: 99,
    minimumFormatVersion: 1,
  };

  const reloaded = normalizeCustomComponentEnvelope(envelope);

  assert.equal(reloaded.validation.ok, true);
  assert.ok(reloaded.validation.warnings.some((warning) => warning.includes('format version 99')));
  assert.ok(reloaded.validation.warnings.some((warning) => warning.includes('compatibility version 99')));
});

test('normalizeCustomComponentMetadata falls back to package name for empty addressable names', () => {
  const control = makeCustomComponent({
    ExternalAPI: { addressableName: '' },
  });
  const envelope = createCustomComponentExportEnvelope(control, {
    name: 'User Macro Grid',
    version: '1.0.0',
  });

  assert.equal(envelope.metadata.id, 'user-macro-grid');
  assert.equal(customComponentPackageId(envelope), 'user-macro-grid@1-0-0');
});

test('normalizeCustomComponentEnvelope recalculates stale validation', () => {
  const envelope = createCustomComponentExportEnvelope(makeCustomComponent({
    PublishedProperties: {
      inputs: { brokenInput: { enabled: true, channel: 'missingInput', type: 'float' } },
      outputs: {},
    },
  }));
  envelope.validation = { ok: true, issues: [], warnings: [] };

  const reloaded = normalizeCustomComponentEnvelope(envelope);

  assert.equal(reloaded.validation.ok, false);
  assert.ok(reloaded.validation.issues.some((issue) => issue.includes('brokenInput')));
});

test('custom component library envelopes round-trip multiple packages', () => {
  const first = createCustomComponentExportEnvelope(makeCustomComponent(), {
    name: 'Macro Grid',
    version: '1.0.0',
  });
  const second = createCustomComponentExportEnvelope(makeCustomComponent({
    Core: { id: 'custom_package_2', name: 'Macro Rings', controlType: 'CustomComponent', enabled: true },
    ExternalAPI: { addressableName: 'macroRings' },
  }), {
    name: 'Macro Rings',
    version: '1.0.0',
  });

  const bundle = createCustomComponentLibraryEnvelope([
    { envelope: first },
    second,
    { format: 'not-a-component' },
  ]);
  const reloaded = normalizeCustomComponentLibraryEnvelope(bundle);

  assert.equal(bundle.format, 'ceditor-component-library');
  assert.equal(bundle.packageCount, 2);
  assert.equal(reloaded.packageCount, 2);
  assert.equal(reloaded.rejected, 0);
  assert.deepEqual(reloaded.packages.map((entry) => entry.metadata.name), ['Macro Grid', 'Macro Rings']);
  assert.ok(reloaded.packages.every((entry) => Number.isFinite(entry.readiness?.score)));
});

test('normalizeCustomComponentLibraryEnvelope accepts arrays and reports rejected entries', () => {
  const valid = createCustomComponentExportEnvelope(makeCustomComponent());
  const bundle = normalizeCustomComponentLibraryEnvelope([valid, { format: 'broken' }, null]);

  assert.equal(bundle.packageCount, 1);
  assert.equal(bundle.rejected, 2);
  assert.equal(bundle.packages[0].metadata.name, 'Macro Grid');
});

test('instantiateCustomComponentPackageControl creates a panel-ready control from a package', () => {
  const envelope = createCustomComponentExportEnvelope(makeCustomComponent({
    Transform: { _type: 'Transform', x: 88, y: 99, width: 300, height: 140 },
  }), {
    name: 'Macro Grid',
    version: '1.0.0',
  });

  const control = instantiateCustomComponentPackageControl(envelope, {
    id: 'ctrl_inserted',
    Transform: { x: 12, y: 18 },
  });

  assert.equal(control._children.Core.id, 'ctrl_inserted');
  assert.equal(control._children.Core.controlType, 'CustomComponent');
  assert.equal(control._children.Core.name, 'Macro Grid');
  assert.equal(control._children.Transform.x, 12);
  assert.equal(control._children.Transform.y, 18);
  assert.equal(control._children.Transform.width, 300);
  assert.equal(control._children.Transform.height, 140);
  assert.equal(control._children.Designer.packageName, 'Macro Grid');
  assert.equal(control._children.Designer.packageVersion, '1.0.0');
  assert.equal(control._children.Designer.sourcePackage.id, customComponentPackageId(envelope));
  assert.equal(control._children.Designer.sourcePackage.fingerprint, envelope.fingerprint);
  assert.equal(control._children.Designer.sourcePackage.readiness.ok, true);
  assert.equal(control._children.Designer.sourcePackage.publicApiSummary.counts.inputs, 1);
  assert.equal(validateCustomComponentPackage(control).ok, true);
});

test('customComponentPackageProvenance captures shareable package identity and readiness', () => {
  const envelope = createCustomComponentExportEnvelope(makeCustomComponent(), {
    name: 'Macro Grid',
    version: '3.1.0',
    category: 'grid',
    license: 'MIT',
  });
  const provenance = customComponentPackageProvenance(envelope, '2026-05-07T12:00:00.000Z');

  assert.equal(provenance.id, 'macrogrid@3-1-0');
  assert.equal(provenance.name, 'Macro Grid');
  assert.equal(provenance.version, '3.1.0');
  assert.equal(provenance.category, 'grid');
  assert.equal(provenance.license, 'MIT');
  assert.equal(provenance.importedAt, '2026-05-07T12:00:00.000Z');
  assert.equal(provenance.fingerprint, envelope.fingerprint);
  assert.equal(provenance.readiness.ok, true);
  assert.ok(provenance.capabilities.labels.includes('slider'));
  assert.equal(provenance.publicApiSummary.counts.outputs, 1);
  assert.equal(provenance.assetManifest.counts.total, 0);
});
