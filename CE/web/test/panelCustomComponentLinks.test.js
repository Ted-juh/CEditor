import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyPanelCustomLinkRoutes,
  convertPanelRouteValue,
  createPanelCustomRouteLink,
  findPanelCustomRouteLink,
  listPanelCustomApiEndpoints,
  listPanelCustomRouteCandidates,
  listPanelCustomRouteLinks,
} from '../src/CE_Application/utils/panelCustomComponentLinks.js';

function makeCustom(id, name, value = 0) {
  return {
    _children: {
      Core: { id, name, controlType: 'CustomComponent', enabled: true },
      ValueChannels: {
        _children: {
          mainValue: {
            type: 'float',
            min: 0,
            max: 1,
            step: 0.01,
            defaultValue: value,
            currentValue: value,
            snap: { enabled: true },
          },
          mode: {
            type: 'enum',
            defaultValue: 'A',
            values: ['A', 'B'],
          },
        },
      },
      PublishedProperties: {
        inputs: {
          mainValue: { channel: 'mainValue', label: 'Main Value', type: 'float', min: 0, max: 1, step: 0.01, defaultValue: value, enabled: true },
          mode: { channel: 'mode', label: 'Mode', type: 'enum', values: ['A', 'B'], defaultValue: 'A', enabled: true },
        },
        outputs: {
          mainValue: { channel: 'mainValue', label: 'Main Value', type: 'float', min: 0, max: 1, step: 0.01, defaultValue: value, enabled: true },
        },
      },
      Links: { _type: 'Links', enabled: true, _children: {} },
    },
  };
}

test('listPanelCustomApiEndpoints exposes custom component public inputs and outputs', () => {
  const endpoints = listPanelCustomApiEndpoints([makeCustom('a', 'A')]);
  assert.deepEqual(
    endpoints.map((endpoint) => `${endpoint.controlId}:${endpoint.direction}:${endpoint.channel}`),
    ['a:input:mainValue', 'a:input:mode', 'a:output:mainValue'],
  );
  assert.equal(endpoints[0].min, 0);
  assert.equal(endpoints[0].max, 1);
  assert.deepEqual(endpoints.find((endpoint) => endpoint.channel === 'mode')?.values, ['A', 'B']);
});

test('applyPanelCustomLinkRoutes routes a custom output into another custom input', () => {
  const source = makeCustom('source', 'Source', 0.2);
  const target = makeCustom('target', 'Target', 0);
  source._children.Links._children.routeMain = {
    _type: 'Link',
    enabled: true,
    type: 'external-output',
    source: 'mainValue',
    target: 'target.mainValue',
    targetControlId: 'target',
    targetPort: 'mainValue',
  };

  const routed = applyPanelCustomLinkRoutes([source, target], {
    source: { customValues: { mainValue: 0.73 } },
    target: { customValues: { mainValue: 0 } },
  });

  assert.equal(routed.target.customValues.mainValue, 0.73);
  assert.equal(routed.target.customNormalizedValue, 0.73);
  assert.equal(routed.target.valueOverrideEnabled, true);
  assert.equal(routed.target.valueOverride, 0.73);
});

test('listPanelCustomRouteCandidates marks inbound and outbound routes for selected custom component', () => {
  const source = makeCustom('source', 'Source', 0.2);
  const target = makeCustom('target', 'Target', 0);

  const sourceRoutes = listPanelCustomRouteCandidates([source, target], 'source');
  assert.equal(sourceRoutes.filter((candidate) => candidate.direction === 'outbound').length, 2);
  assert.equal(sourceRoutes.filter((candidate) => candidate.direction === 'inbound').length, 2);
  assert.equal(sourceRoutes[0].compatibility.status, 'compatible');

  const targetRoutes = listPanelCustomRouteCandidates([source, target], 'target');
  assert.equal(targetRoutes.filter((candidate) => candidate.direction === 'inbound').length, 2);
  assert.equal(targetRoutes.filter((candidate) => candidate.direction === 'outbound').length, 2);
});

test('createPanelCustomRouteLink creates a panel route link from endpoint metadata', () => {
  const endpoints = listPanelCustomApiEndpoints([makeCustom('source', 'Source'), makeCustom('target', 'Target')]);
  const source = endpoints.find((endpoint) => endpoint.controlId === 'source' && endpoint.direction === 'output');
  const target = endpoints.find((endpoint) => endpoint.controlId === 'target' && endpoint.direction === 'input' && endpoint.channel === 'mode');

  const link = createPanelCustomRouteLink(source, target);

  assert.equal(link.type, 'external-output');
  assert.equal(link.source, 'mainValue');
  assert.equal(link.target, 'target.mode');
  assert.equal(link.targetControlId, 'target');
  assert.equal(link.targetPort, 'mode');
  assert.equal(link.routeMeta.source.label, 'Main Value');
  assert.equal(link.routeMeta.target.type, 'enum');
  assert.equal(link.routeMeta.compatibility, 'convert');
  assert.match(link.name, /^route_Source_mainValue_to_Target_mode$/);
  assert.match(link.notes, /Source \/ Main Value/);
  assert.match(link.notes, /Target \/ Mode/);
});

test('listPanelCustomRouteLinks resolves existing panel routes and duplicate matches', () => {
  const source = makeCustom('source', 'Source', 0.2);
  const target = makeCustom('target', 'Target', 0);
  const endpoints = listPanelCustomApiEndpoints([source, target]);
  const output = endpoints.find((endpoint) => endpoint.controlId === 'source' && endpoint.direction === 'output');
  const input = endpoints.find((endpoint) => endpoint.controlId === 'target' && endpoint.direction === 'input' && endpoint.channel === 'mainValue');
  const link = createPanelCustomRouteLink(output, input);
  source._children.Links._children[link.name] = link;

  const routes = listPanelCustomRouteLinks([source, target]);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].source.controlId, 'source');
  assert.equal(routes[0].target.controlId, 'target');
  assert.equal(routes[0].compatibility.status, 'compatible');
  assert.equal(findPanelCustomRouteLink([source, target], output, input)?.name, link.name);
});

test('endpointTypeCompatibility reports enum overlap and numeric range conversion in route candidates', () => {
  const source = makeCustom('source', 'Source', 0.2);
  const target = makeCustom('target', 'Target', 0);
  source._children.PublishedProperties.outputs.mode = {
    channel: 'mode',
    label: 'Mode',
    type: 'enum',
    values: ['A', 'C'],
    enabled: true,
  };
  target._children.PublishedProperties.inputs.mode.values = ['B', 'C'];
  target._children.PublishedProperties.inputs.mainValue.max = 127;

  const routes = listPanelCustomRouteCandidates([source, target], 'source');
  const modeRoute = routes.find((candidate) => candidate.source.channel === 'mode' && candidate.target.channel === 'mode');
  const rangeRoute = routes.find((candidate) => candidate.source.channel === 'mainValue' && candidate.target.channel === 'mainValue');

  assert.equal(modeRoute.compatibility.status, 'convert');
  assert.match(modeRoute.compatibility.warning, /C/);
  assert.equal(rangeRoute.compatibility.status, 'convert');
  assert.match(rangeRoute.compatibility.warning, /ranges differ/);
});

test('convertPanelRouteValue maps route values through public endpoint metadata', () => {
  assert.equal(
    convertPanelRouteValue(
      { type: 'float', min: 0, max: 1 },
      { type: 'float', min: 0, max: 127, step: 1 },
      0.5,
    ),
    64,
  );
  assert.equal(
    convertPanelRouteValue(
      { type: 'float', min: 0, max: 1 },
      { type: 'enum', values: ['low', 'mid', 'high'] },
      0.8,
    ),
    'high',
  );
  assert.equal(
    convertPanelRouteValue(
      { type: 'enum', values: ['A', 'B'] },
      { type: 'enum', values: ['C', 'D'], defaultValue: 'C' },
      'B',
    ),
    'C',
  );
});

test('applyPanelCustomLinkRoutes rescales numeric public routes into target ranges', () => {
  const source = makeCustom('source', 'Source', 0.2);
  const target = makeCustom('target', 'Target', 0);
  target._children.ValueChannels._children.mainValue.max = 127;
  target._children.ValueChannels._children.mainValue.step = 1;
  target._children.PublishedProperties.inputs.mainValue.max = 127;
  target._children.PublishedProperties.inputs.mainValue.step = 1;
  source._children.Links._children.routeMain = createPanelCustomRouteLink(
    listPanelCustomApiEndpoints([source, target]).find((endpoint) => endpoint.controlId === 'source' && endpoint.direction === 'output' && endpoint.channel === 'mainValue'),
    listPanelCustomApiEndpoints([source, target]).find((endpoint) => endpoint.controlId === 'target' && endpoint.direction === 'input' && endpoint.channel === 'mainValue'),
  );

  const routed = applyPanelCustomLinkRoutes([source, target], {
    source: { customValues: { mainValue: 0.5 } },
    target: { customValues: { mainValue: 0 } },
  });

  assert.equal(routed.target.customValues.mainValue, 64);
  assert.equal(routed.target.customNormalizedValue, 64 / 127);
});

// ---------------------------------------------------------------------------------------------
// The External chips and the Policy dropdown, which sat in the Published Properties tab being
// written to the document and read by nothing. Both now decide what `listPanelCustomApiEndpoints`
// offers — which is the Links editor's picker AND the run-time resolver, so these cover both.
// ---------------------------------------------------------------------------------------------

function withApi(control, api) {
  control._children.ExternalAPI = { _type: 'ExternalAPI', version: 1, ...api };
  return control;
}

/** A private channel the published contract does not mention — what the wider policies are for. */
function withPrivateChannel(control, name = 'internalTrim') {
  control._children.ValueChannels._children[name] = {
    type: 'float', min: 0, max: 1, step: 0.01, defaultValue: 0.5,
    publicInput: false, publicOutput: false, label: 'Internal Trim',
  };
  return control;
}

/** An unpublished channel left public — the opt-in `advancedOptIn` reads. */
function withOptInChannel(control, name = 'gain') {
  control._children.ValueChannels._children[name] = {
    type: 'float', min: 0, max: 2, step: 0.01, defaultValue: 1, label: 'Gain',
  };
  return control;
}

const key = (endpoint) => `${endpoint.direction}:${endpoint.channel}`;

test('acceptsExternalLinks off removes the component\'s inputs, leaving its outputs', () => {
  const control = withApi(makeCustom('a', 'A'), { acceptsExternalLinks: false });
  assert.deepEqual(listPanelCustomApiEndpoints([control]).map(key), ['output:mainValue']);
});

test('emitsExternalLinks off removes the component\'s outputs, leaving its inputs', () => {
  const control = withApi(makeCustom('a', 'A'), { emitsExternalLinks: false });
  assert.deepEqual(listPanelCustomApiEndpoints([control]).map(key), ['input:mainValue', 'input:mode']);
});

test('both off removes the component from linking entirely', () => {
  const control = withApi(makeCustom('a', 'A'), { acceptsExternalLinks: false, emitsExternalLinks: false });
  assert.deepEqual(listPanelCustomApiEndpoints([control]), []);
});

test('a direction turned off stops links already authored in it from carrying a value', () => {
  // The half that makes this a switch rather than a filter on a picker. A link made while the
  // component accepted input must stop moving the target once it does not — otherwise the setting
  // says "do not let others drive this" while others go on driving it.
  const source = makeCustom('source', 'Source', 0.2);
  const target = withApi(makeCustom('target', 'Target', 0), { acceptsExternalLinks: false });
  source._children.Links._children.routeMain = {
    _type: 'Link', enabled: true, type: 'external-output',
    source: 'mainValue', target: 'target.mainValue',
    targetControlId: 'target', targetPort: 'mainValue',
  };
  const sessions = { source: { customValues: { mainValue: 0.73 } }, target: { customValues: { mainValue: 0 } } };

  assert.equal(applyPanelCustomLinkRoutes([source, target], sessions).target.customValues.mainValue, 0);

  // And the same panel with the switch back on, so the assertion above is the switch and not the
  // fixture: one field changes, and the value arrives.
  target._children.ExternalAPI.acceptsExternalLinks = true;
  assert.equal(applyPanelCustomLinkRoutes([source, target], sessions).target.customValues.mainValue, 0.73);
});

test('publishedOnly is the default and offers only the published contract', () => {
  const control = withOptInChannel(withPrivateChannel(makeCustom('a', 'A')));
  assert.deepEqual(listPanelCustomApiEndpoints([control]).map(key),
    ['input:mainValue', 'input:mode', 'output:mainValue']);
  // Named explicitly, to prove the default is the value and not the absence of the section.
  assert.deepEqual(listPanelCustomApiEndpoints([withApi(control, { linkPolicy: 'publishedOnly' })]).map(key),
    ['input:mainValue', 'input:mode', 'output:mainValue']);
});

test('advancedOptIn adds unpublished channels that are not marked private, and keeps out the ones that are', () => {
  const control = withApi(withOptInChannel(withPrivateChannel(makeCustom('a', 'A'))), { linkPolicy: 'advancedOptIn' });
  const offered = listPanelCustomApiEndpoints([control]).map(key);
  assert.deepEqual(offered, [
    'input:mainValue', 'input:mode', 'input:gain',
    'output:mainValue', 'output:mode', 'output:gain',
  ]);
  assert.equal(offered.some((k) => k.endsWith(':internalTrim')), false);
  // The channel's own bounds come with it, so a link built on one is not silently 0..1.
  const gain = listPanelCustomApiEndpoints([control]).find((e) => e.channel === 'gain');
  assert.deepEqual([gain.min, gain.max, gain.label], [0, 2, 'Gain']);
});

test('allInternals reaches the private channel too', () => {
  const control = withApi(withOptInChannel(withPrivateChannel(makeCustom('a', 'A'))), { linkPolicy: 'allInternals' });
  const offered = listPanelCustomApiEndpoints([control]).map(key);
  assert.equal(offered.includes('input:internalTrim'), true);
  assert.equal(offered.includes('output:internalTrim'), true);
});

test('a published entry keeps its own label and range under a wider policy, and is not listed twice', () => {
  // Publishing is where an author renames a channel or narrows its range. A wider policy adds
  // reach; it must not hand back the bare channel beside the published version of the same thing.
  const control = withApi(makeCustom('a', 'A'), { linkPolicy: 'allInternals' });
  control._children.PublishedProperties.inputs.mainValue.label = 'Cutoff';
  control._children.PublishedProperties.inputs.mainValue.max = 0.5;
  const inputs = listPanelCustomApiEndpoints([control]).filter((e) => e.direction === 'input' && e.channel === 'mainValue');
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].label, 'Cutoff');
  assert.equal(inputs[0].max, 0.5);
});

test('an unknown policy value falls back to publishedOnly rather than opening the component up', () => {
  const control = withApi(withPrivateChannel(makeCustom('a', 'A')), { linkPolicy: 'everything' });
  assert.deepEqual(listPanelCustomApiEndpoints([control]).map(key),
    ['input:mainValue', 'input:mode', 'output:mainValue']);
});

test('a refused link is still listed, marked blocked rather than hidden or missing', () => {
  // The author made this link and it is in their document. Hiding it would leave them with
  // something they cannot see, understand or delete; calling it "missing" would send them looking
  // for a component that is right there.
  const source = makeCustom('source', 'Source', 0.2);
  const target = withApi(makeCustom('target', 'Target', 0), { acceptsExternalLinks: false });
  source._children.Links._children.routeMain = {
    _type: 'Link', enabled: true, type: 'external-output',
    source: 'mainValue', target: 'target.mainValue',
    targetControlId: 'target', targetPort: 'mainValue',
  };

  const [route] = listPanelCustomRouteLinks([source, target]);
  assert.equal(route.blocked, true);
  assert.equal(route.broken, false);
  assert.equal(route.compatibility.status, 'blocked');
  assert.match(route.compatibility.warning, /does not allow this link/);

  target._children.ExternalAPI.acceptsExternalLinks = true;
  const [allowed] = listPanelCustomRouteLinks([source, target]);
  assert.equal(allowed.blocked, false);
  assert.equal(allowed.compatibility.status, 'compatible');
});
