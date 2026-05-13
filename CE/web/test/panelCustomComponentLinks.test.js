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
