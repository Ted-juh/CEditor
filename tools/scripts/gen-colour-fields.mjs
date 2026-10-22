// gen-colour-fields.mjs — write the tables the player's C++ reads a script's colour writes by.
//
// Which properties of a control are colours is decided in ONE place, the editor's section templates
// (CE/web/src/CE_Application/models/sectionDefaults.js), read by scriptColours.js into COLOUR_FIELDS.
// The WebView runtime imports that directly. With the plug-in's window shut a script's set() reaches
// the C++ panel model instead, which cannot import anything, so the same rule is ported to
// CE/src/Scripting/ScriptColours.h and the DATA it needs is generated from the editor's own modules
// into CE/src/Scripting/ScriptColours.generated.h:
//
//   - COLOUR_FIELDS, as scriptColours.js builds it: every colour field, by the section type it is
//     in and its path below it, with whether "" is a value there (`empty`), whether the renderer
//     resolves a control-set reference in it (`tokens`) and whether it is a gradient stop's colour
//     (`stop`), which is stored in the stop's own form, RRGGBB with no alpha;
//   - PANEL_COLOUR_FIELDS, the panel document's own colours (bgColour, the tints, the grid's, the
//     gradient's stops), read by the same rule from the document a new panel starts as
//     (models/panelDefaults.js), by their path below the panel, with the same three marks;
//   - the section templates' shape (their objects, lists and `_type`s), which colourFieldAt walks
//     where a control has not made a section yet, with EFFECT_TYPES and MADE_CHILDREN, the children
//     set() makes that no template lists;
//   - CSS_NAMED_COLOURS and COLOUR_FORMS, so the names and the words are not typed twice;
//   - the control set every panel falls back to (BASE_CONTROL_SET) and MAX_ALIAS_DEPTH, which say
//     whether a reference such as "{accent}" names a colour where the panel's own sets do not.
//
//   node tools/scripts/gen-colour-fields.mjs            # print the header
//   node tools/scripts/gen-colour-fields.mjs --write    # write it
//   node tools/scripts/gen-colour-fields.mjs --check    # exit 1 if the committed header is stale
//
// Plain Node from the repo root is enough: scriptColours.js reaches only plain .js modules. The
// web suite's colourPropertyCases.test.js compares the committed header with headerText(), so a
// template changed without regenerating fails `npm test`.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const app = (rel) => pathToFileURL(join(repo, 'CE', 'web', 'src', 'CE_Application', rel)).href;

const { SECTION_DEFAULTS } = await import(app('models/sectionDefaults.js'));
const { BASE_CONTROL_SET, BUILT_IN_CONTROL_SETS, MAX_ALIAS_DEPTH, resolveToken } = await import(app('models/controlSets.js'));
const { COLOUR_FIELDS, COLOUR_FORMS, CSS_NAMED_COLOURS, EFFECT_TYPES, MADE_CHILDREN, PANEL_COLOUR_FIELDS, templateChild }
  = await import(app('scripting/scriptColours.js'));

export const HEADER_FILE = 'CE/src/Scripting/ScriptColours.generated.h';

// Windows checkouts can carry CRLF line endings (core.autocrlf); the comparison is over the LF form.
const readText = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

/** A C++ string literal for `text`, which must be printable ASCII: no escape is left to guess at. */
function cString(text) {
  const s = String(text);
  if (!/^[\x20-\x7e]*$/.test(s)) throw new Error(`gen-colour-fields: not printable ASCII, so not written: ${JSON.stringify(s)}`);
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/* ------------------------------------------------------------------------- the templates' shape */

const isObject = (v) => v !== null && typeof v === 'object';

/**
 * SECTION_DEFAULTS as colourFieldAt walks it: every object and list, every `_type`, and nothing
 * else. A list keeps its length, an item that is not an object standing in as 0.
 *
 * Leaving a property's value out is safe only while the walk could never stop on one where it
 * would also look for a template child: colourFieldAt takes `next ?? template`, so a value there,
 * where the C++ sees nothing, would send the two walks different ways. The walk looks for a
 * template child only at a node it reached with nothing below its section's type (rel empty), so
 * each node is visited here as the walk would reach it, and a value whose name templateChild finds
 * a child for at such a node stops generation rather than write a tree the C++ would walk differently.
 */
function templateShape() {
  const collisions = [];
  const shape = (node, where, type, atSection) => {
    if (Array.isArray(node)) {
      return node.map((item, i) => (isObject(item) ? shape(item, `${where}.${i}`, type, false) : 0));
    }
    if (typeof node._type === 'string') { type = node._type; atSection = true; }
    const out = {};
    const child = (value, name, at) => {
      // As colourFieldAt steps from this node to `value` under `name`.
      const template = (typeof value._type === 'string' || !atSection) ? undefined : templateChild(type, name, false);
      const childType = typeof value._type === 'string' ? value._type
        : (typeof template?._type === 'string' ? template._type : '');
      return shape(value, at, childType || type, Boolean(childType));
    };
    for (const [key, value] of Object.entries(node)) {
      if (key === '_type' && typeof value === 'string') out[key] = value;
      else if (key === '_children' && isObject(value) && !Array.isArray(value)) {
        // An entry that is not an object reads as nothing past it either way (0); null reads as
        // missing, and is left out.
        out[key] = {};
        for (const [name, kid] of Object.entries(value)) {
          const at = `${where}._children.${name}`;
          if (kid === null || kid === undefined) continue;
          if (!isObject(kid)) out[key][name] = 0;
          else out[key][name] = Array.isArray(kid) ? shape(kid, at, type, false) : child(kid, name, at);
        }
      } else if (isObject(value)) {
        out[key] = Array.isArray(value) ? shape(value, `${where}.${key}`, type, false) : child(value, key, `${where}.${key}`);
      } else if (value !== null && value !== undefined && atSection && templateChild(type, key, false) !== undefined) {
        collisions.push(`${where}.${key} (a ${type} child is called that too)`);
      }
    }
    return out;
  };
  const tree = shape(SECTION_DEFAULTS, 'SECTION_DEFAULTS', '', false);
  if (collisions.length) {
    throw new Error('gen-colour-fields: a template value shares its name with a child a template makes, so the '
      + 'template tree cannot leave values out:\n  ' + collisions.join('\n  '));
  }
  return tree;
}

/* ---------------------------------------------------------------------------- the control sets */

/** The names that resolve on `set` (falling back to the base set, as resolveToken does), sorted. */
function resolvingNames(set) {
  const names = new Set([...Object.keys(set?.tokens ?? {}), ...Object.keys(BASE_CONTROL_SET.tokens ?? {})]);
  return [...names].filter((name) => resolveToken(name, set) !== undefined).sort();
}

/* -------------------------------------------------------------------------------- the header */

/** A field's three marks, as the C++ initialiser lists them: empty, tokens, stop. */
const marks = (...flags) => flags.map((flag) => (flag ? 'true' : 'false')).join(', ');

export function headerText() {
  const fieldRows = [];
  for (const type of [...COLOUR_FIELDS.keys()].sort()) {
    const fields = COLOUR_FIELDS.get(type);
    for (const path of [...fields.keys()].sort()) {
      const { empty, tokens, stop } = fields.get(path);
      fieldRows.push(`    { ${cString(type)}, ${cString(path)}, ${marks(empty, tokens, stop)} },`);
    }
  }

  const panelRows = [...PANEL_COLOUR_FIELDS.keys()].sort().map((path) => {
    const { empty, tokens, stop } = PANEL_COLOUR_FIELDS.get(path);
    return `    { ${cString(path)}, ${marks(empty, tokens, stop)} },`;
  });

  const tree = templateShape();
  const treeRows = Object.entries(tree).map(([type, node], i, all) =>
    `    ${cString(`${JSON.stringify(type)}:${JSON.stringify(node)}${i < all.length - 1 ? ',' : ''}`)}`);

  const madeRows = Object.entries(MADE_CHILDREN).flatMap(([parent, children]) =>
    Object.entries(children).map(([name, type]) => `    { ${cString(parent)}, ${cString(name)}, ${cString(type)} },`));

  const namedRows = Object.entries(CSS_NAMED_COLOURS).map(([name, rgb]) => `    { ${cString(name)}, ${cString(rgb)} },`);

  const baseTokens = Object.entries(BASE_CONTROL_SET.tokens ?? {})
    .filter(([, value]) => typeof value === 'string')
    .map(([name, value]) => `    { ${cString(name)}, ${cString(value)} },`);
  const baseNames = resolvingNames(BASE_CONTROL_SET).join(' ');
  const setRows = BUILT_IN_CONTROL_SETS
    .filter((set) => set !== BASE_CONTROL_SET && resolvingNames(set).join(' ') !== baseNames)
    .map((set) => `    { ${cString(set.id)}, ${cString(resolvingNames(set).join(' '))} },`);

  return `// GENERATED by tools/scripts/gen-colour-fields.mjs — do not edit by hand.
//
// The editor's tables for what a script may write where the panel reads a colour, for the C++ that
// reads a script's writes with the plug-in's window shut (ScriptColours.h). Each is written from the
// module that defines it, so neither side can have a colour field, a CSS name or a word the other
// lacks. Regenerate after changing the section templates (models/sectionDefaults.js), the panel's
// (models/panelDefaults.js), scriptColours.js or the base control set:
//
//   node tools/scripts/gen-colour-fields.mjs --write
//
// CE/web/test/colourPropertyCases.test.js fails while this file is stale.

#pragma once

namespace ceditor::scripting::colours::generated
{

/** COLOUR_FORMS: the forms a colour may be written in, in the words every refusal uses. */
inline constexpr const char* kColourForms = ${cString(COLOUR_FORMS)};

/** COLOUR_FIELDS: each colour field, by the type of the section it is in and its path below that
    section, lower case, a list position as "*". \`empty\`: "" is a value there (no colour of its
    own). \`tokens\`: the renderer resolves a control-set reference in it. \`stop\`: a gradient
    stop's colour, stored as RRGGBB with no "#", and refused with an alpha below FF. */
struct ColourField { const char* type; const char* path; bool empty; bool tokens; bool stop; };
inline constexpr ColourField kColourFields[] = {
${fieldRows.join('\n')}
};

/** PANEL_COLOUR_FIELDS: the panel document's own colours, by their path below the panel, lower case,
    a list position as "*", read from the document a new panel starts as by the rule above. */
struct PanelColourField { const char* path; bool empty; bool tokens; bool stop; };
inline constexpr PanelColourField kPanelColourFields[] = {
${panelRows.join('\n')}
};

/** EFFECT_TYPES: Fill's optional effect targets, made from the Effects template under their own names. */
inline constexpr const char* kEffectTypes[] = { ${[...EFFECT_TYPES].map(cString).join(', ')} };

/** MADE_CHILDREN: the children set() makes that no template lists, by the section they are made
    under and the name (lower case) they are written as, with the type each is made as. */
struct MadeChild { const char* parent; const char* name; const char* type; };
inline constexpr MadeChild kMadeChildren[] = {
${madeRows.join('\n')}
};

/** SECTION_DEFAULTS as JSON, reduced to what the walk reads: every object and list, every \`_type\`.
    A list item that is not an object is 0; a property's value is left out, which
    gen-colour-fields.mjs checks the walk can never tell. Parsed once, on first use. */
inline constexpr const char* kSectionTemplates =
    "{"
${treeRows.join('\n')}
    "}";

/** CSS_NAMED_COLOURS: CSS Color Module Level 4's named colours, all ${namedRows.length}, as RRGGBB. */
struct NamedColour { const char* name; const char* rgb; };
inline constexpr NamedColour kCssNamedColours[] = {
${namedRows.join('\n')}
};

/** BASE_CONTROL_SET: the set a panel resolves against when it names none, or names one nobody has,
    and the one every other set falls back to for a name it does not define. */
inline constexpr const char* kBaseControlSetId = ${cString(BASE_CONTROL_SET.id)};
struct Token { const char* name; const char* value; };
inline constexpr Token kBaseControlSetTokens[] = {
${baseTokens.join('\n')}
};

/** The built-in sets on which the names that resolve are not the base set's, each with the names that
    do, separated by spaces. On every other built-in set a name resolves exactly where it does on the
    base set. The last entry's id is null. */
struct SetNames { const char* id; const char* names; };
inline constexpr SetNames kBuiltInSetNames[] = {
${setRows.length ? `${setRows.join('\n')}\n` : ''}    { nullptr, nullptr },
};

/** MAX_ALIAS_DEPTH: how many references to references resolveToken follows before giving up. */
inline constexpr int kMaxAliasDepth = ${MAX_ALIAS_DEPTH};

} // namespace ceditor::scripting::colours::generated
`;
}

function run() {
  const mode = process.argv[2] ?? '--print';
  const path = join(repo, HEADER_FILE);
  const next = headerText();
  const current = (() => { try { return readText(path); } catch { return null; } })();
  if (mode === '--write') {
    if (next !== current) { writeFileSync(path, next); console.log(`wrote ${HEADER_FILE}`); }
    else console.log(`unchanged ${HEADER_FILE}`);
  } else if (mode === '--check') {
    if (next !== current) {
      console.error(`STALE ${HEADER_FILE} — run: node tools/scripts/gen-colour-fields.mjs --write`);
      process.exit(1);
    }
    console.log(`ok ${HEADER_FILE}`);
  } else {
    process.stdout.write(next);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) run();
