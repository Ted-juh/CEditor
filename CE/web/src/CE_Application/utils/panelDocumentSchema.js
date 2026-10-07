/**
 * panelDocumentSchema.js — the shape a .cepanel document must have to be opened.
 *
 * A JSON Schema (draft-07), compiled ahead of time by scripts/generate-panel-validator.mjs into
 * generated/panelDocumentValidator.js, which utils/panelFormat.js runs on every document the editor
 * or the player opens. Precompiled so neither bundle carries Ajv's compiler, and so opening a panel
 * does not pay for compiling the schema first. Edit this file, then run `npm run gen:panel-validator`;
 * test/panelFormat.test.js fails while the generated validator is stale.
 *
 * WHAT IT IS FOR. Catching a document that is broken in a way the rest of the app would trip over
 * later and further from the cause: `controls` that is not a list, a control with no type, a script
 * whose source is a number, a layer that is a string. Before this, the loader checked that
 * `controls` was an array of objects and nothing else, so a bad field surfaced as a render error in
 * some component, or as an export that built and then misbehaved. Now it is refused on the way in,
 * with the path of what is wrong.
 *
 * WHAT IT IS NOT. A description of every control type's fields. Sections are stored as a diff
 * against their type's defaults (stores/documentShape.js), there are fifty-odd control types, and
 * most fields are tolerated with a default when missing. So this is deliberately permissive:
 * unknown keys are allowed everywhere (a newer CEditor's additions must not make a document
 * unopenable in an older one — the version check in panelFormat.js says so instead), and a key is
 * typed only where a wrong type is known to break a reader. Tighten it field by field as a field
 * earns it, with a committed panel in the tests that shows the shape.
 */

const string = { type: 'string' };
const number = { type: 'number' };
const boolean = { type: 'boolean' };
const object = { type: 'object' };
const array = { type: 'array' };
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });

const script = {
  type: 'object',
  properties: {
    id: string,
    name: string,
    language: string,
    source: string,
    compiledJs: string,
    scope: string,
    target: string,
    event: string,
    enabled: boolean,
  },
};

const section = { type: 'object' };

const control = {
  type: 'object',
  required: ['_type'],
  properties: {
    _type: { type: 'string', pattern: '\\S' },
    _children: {
      type: 'object',
      // Every section is an object: readers go `control._children.Core.name` without a guard.
      additionalProperties: section,
      properties: {
        // Sections deleted from the type's defaults (stores/documentShape.js REMOVED_KEY): the
        // one entry in `_children` that is a list of names rather than a section.
        _removed: { type: 'array', items: string },
        Core: {
          type: 'object',
          properties: {
            id: { type: ['string', 'number'] },
            name: string,
            parentId: nullable({ type: ['string', 'number'] }),
          },
        },
        Scripts: {
          type: 'object',
          properties: { scripts: { type: 'array', items: script } },
        },
      },
    },
  },
};

const layer = {
  type: 'object',
  properties: {
    id: { type: ['string', 'number'] },
    kind: string,
    name: string,
    visible: boolean,
    locked: boolean,
  },
};

const exportParameter = {
  type: 'object',
  properties: {
    id: string,
    label: string,
    controlName: string,
    path: string,
    min: number,
    max: number,
    defaultValue: number,
    choiceLabels: array,
    choiceValues: array,
  },
};

const carriedFont = {
  type: 'object',
  required: ['family', 'data'],
  properties: {
    family: { type: 'string', pattern: '\\S' },
    weight: string,
    style: string,
    unicodeRange: string,
    data: { type: 'string', pattern: '^data:' },
  },
};

// A library icon the panel carries with it (utils/documentIcons.js). `id` and `name` are the
// library entry's, so a control's Icon.assetId still finds it.
const carriedIcon = {
  type: 'object',
  required: ['id', 'name', 'dataUrl'],
  properties: {
    id: { type: 'string', pattern: '\\S' },
    name: string,
    dataUrl: { type: 'string', pattern: '^data:image/' },
    mimeType: string,
    isVector: { type: 'boolean' },
    width: { type: 'number', minimum: 0 },
    height: { type: 'number', minimum: 0 },
  },
};

export const PANEL_DOCUMENT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ceditor.local/schemas/cepanel.json',
  title: 'CEditor panel document',
  type: 'object',
  properties: {
    formatVersion: { type: 'integer', minimum: 1 },
    panelGuid: string,
    name: string,
    author: string,
    version: string,
    description: string,
    width: { type: 'number', minimum: 0 },
    height: { type: 'number', minimum: 0 },
    minWidth: number,
    minHeight: number,
    maxWidth: number,
    maxHeight: number,
    resizable: boolean,
    enabled: boolean,
    locked: boolean,
    filePath: nullable(string),
    bgLayerOrder: { type: 'array', items: string },
    bgGradient: object,
    guides: object,
    notepad: object,
    viewer: object,
    exportSettings: object,
    scripting: object,
    controlSet: nullable({ type: ['object', 'string'] }),
    controlSets: array,
    requiredProfiles: array,
    parameterSnapshots: object,
    cardPresets: array,
    snapshots: array,
    routes: array,
    programBank: nullable(object),
    musicalContext: nullable(object),
    deviceSession: nullable(object),
    captureSession: nullable(object),
    controls: { type: 'array', items: control },
    layers: { type: 'array', items: layer },
    scripts: { type: 'array', items: script },
    exportParameters: { type: 'array', items: exportParameter },
    fonts: { type: 'array', items: carriedFont },
    icons: { type: 'array', items: carriedIcon },
  },
};
