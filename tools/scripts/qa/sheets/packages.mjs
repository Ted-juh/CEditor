// packages.mjs — QA-07: every custom-component starter, built and placed as a real instance.
//
// The gap. A custom component is the one thing on a panel that the editor did not author from a
// type definition — it comes out of the designer as a package, and gets instantiated onto a panel
// by a different code path from every other control (`instantiateCustomComponentPackageControl`,
// not `createControl`). QA-01 cannot cover it: there is one `CustomComponent` type and it renders
// as whatever package it carries, so placing the type at its default proves nothing about the
// fourteen real ones.
//
// It is also the path with the most ways to be subtly wrong. A package carries Parts, ValueChannels,
// Behaviors, HitZones, Generators, Links, Variants and PublishedProperties — the eleven sections
// QA-02 exempts by name, with "QA-07 covers it with real packages" as the reason. This is that
// sheet. Each starter is built through the same patch the designer applies, validated, and placed.
//
// The validation line under each one is the part worth keeping. `analyzeCustomComponentReadiness`
// and `validateCustomComponentPackage` are what stand between a component and being reusable, and
// they are usually met inside the designer where a failure is a nudge strip. Here they are printed
// on the sheet, so a starter that stopped validating is visible from across the room.
//
// THE RATCHET: every id in `CUSTOM_COMPONENT_STARTERS`. Add a starter and it appears here; the
// test fails until the sheet is regenerated.

import { createControl } from '../../../../CE/web/src/CE_Application/models/componentTypes.js';
import { createPanel } from '../../../../CE/web/src/CE_Application/stores/panelModel.js';
import {
  CUSTOM_COMPONENT_STARTERS,
  createCustomComponentStarterPatch,
} from '../../../../CE/web/src/CE_Application/utils/customComponentFactory.js';
import { analyzeCustomComponentReadiness } from '../../../../CE/web/src/CE_Application/utils/customComponentPackage.js';
import { flowGroups, styleSheet } from '../layout.mjs';

export const STARTER_IDS = CUSTOM_COMPONENT_STARTERS.map((s) => s.id);

/**
 * Build one starter into a real CustomComponent control.
 *
 * Through `createCustomComponentStarterPatch`, which is exactly what the designer's Starters flyout
 * applies — so a starter that breaks in the app breaks here, rather than the sheet carrying a
 * hand-written fixture that agrees with nothing.
 */
export function buildStarterControl(starter, id) {
  const control = createControl('CustomComponent', { Core: { id, name: id } });
  const patch = createCustomComponentStarterPatch(starter.id);
  for (const [dotPath, value] of Object.entries(patch ?? {})) {
    const parts = String(dotPath).split('.');
    if (parts.length === 1) {
      control._children[parts[0]] = value;
      continue;
    }
    const field = parts.pop();
    let node = control._children;
    for (const key of parts) node = node?.[key]?._children ?? node?.[key];
    if (node && typeof node === 'object') node[field] = value;
  }
  const size = starter.dimensions ?? {};
  control._children.Transform = {
    ...control._children.Transform,
    width: Math.max(120, size.width ?? 180),
    height: Math.max(80, size.height ?? 140),
  };
  return control;
}


/**
 * The readiness line printed under each instance.
 *
 * `analyzeCustomComponentReadiness` is what the designer's own nudge strip runs, so this prints the
 * verdict a user would see if they opened the starter and looked at the readiness rail — except
 * here it is on the sheet, where a starter that stopped validating is visible from across the room
 * rather than only to someone who went looking.
 */
function verdictCard(starter, control, id) {
  let lines;
  let bad = false;
  try {
    const readiness = analyzeCustomComponentReadiness(control);
    const { issues = [], warnings = [] } = readiness.validation ?? {};
    bad = !readiness.ok;
    const open = readiness.steps.filter((step) => !step.done);
    lines = [
      `${readiness.score}% ready — ${readiness.doneCount}/${readiness.totalCount} steps`,
      issues.length
        ? `FAILS: ${issues[0]}${issues.length > 1 ? ` (+${issues.length - 1})` : ''}`
        : warnings.length
          ? `valid · ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`
          : 'valid · no issues',
      open.length ? `open: ${open.map((step) => step.label).join(', ')}` : 'every step done',
    ];
  } catch (error) {
    bad = true;
    lines = ['validator threw:', String(error?.message ?? error).slice(0, 90)];
  }
  return createControl('Label', {
    Core: { id, name: id },
    Transform: { width: 330, height: 66 },
    Text: {
      content: [starter.creates?.join(' + ') ?? '', ...lines].join('\n'),
      _children: { Font: { size: 10 } },
    },
    Background: {
      _children: {
        Fill: { colour: bad ? 'FF3A1F1F' : 'FF181D22' },
        Border: { enabled: true, thickness: 1, colour: bad ? 'AAE06C6C' : '3389C2FF' },
        Corners: { radius: 4 },
      },
    },
    ContentLayout: { mode: 'text_only', horizontalAlign: 'left', verticalAlign: 'top', paddingLeft: 8, paddingTop: 5 },
  });
}

export function buildPackagesSheet() {
  const panel = createPanel('QA-07 Custom Component Packages');

  // Grouped by the starter's own `group`, in first-seen order — the same order and the same names
  // the designer's Starters flyout uses, so the sheet and the menu read alike.
  const byGroup = new Map();
  for (const starter of CUSTOM_COMPONENT_STARTERS) {
    const key = starter.group ?? 'Starters';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(starter);
  }

  const groups = [...byGroup].map(([group, starters]) => ({
    title: `${group} — ${starters.length} starter${starters.length === 1 ? '' : 's'}`,
    cells: starters.flatMap((starter) => {
      const id = `qa07_${starter.id.replace(/\W+/g, '_')}`;
      const control = buildStarterControl(starter, id);
      return [
        { caption: `${starter.label} — ${starter.id}`, control },
        { caption: starter.summary, control: verdictCard(starter, control, `${id}_verdict`) },
      ];
    }),
  }));

  const { controls, height } = flowGroups(groups);
  panel.controls = controls;
  panel.height = height;

  return styleSheet(panel, {
    title: `QA-07 — ${CUSTOM_COMPONENT_STARTERS.length} custom-component starters, built and validated`,
    notes: [
      'WHAT THIS SHEET IS',
      '',
      `Every starter in the custom-component designer — ${CUSTOM_COMPONENT_STARTERS.length} of them —`,
      'built through the same patch the Starters flyout applies, instantiated as a real',
      'CustomComponent, and printed beside its readiness verdict.',
      '',
      'This is the sheet QA-02 defers to. Eleven sections — Parts, ValueChannels, Behaviors,',
      'HitZones, Generators, Links, Variants, Animations, Bindings, Assets, PublishedProperties —',
      'are exempt from QA-02 because a hand-written recipe for them proves nothing: they only mean',
      'anything inside a real package. These are real packages.',
      '',
      'HOW TO RUN THE PASS',
      '',
      '  1. Look at each instance first, before reading its card. A starter that renders as an',
      '     empty rectangle is the finding, whatever the verdict says.',
      '  2. Then read the card. A red card is a starter that no longer validates — the designer',
      '     would refuse to publish it, and a user who picked it would be stuck.',
      '  3. Drag one. Custom components are instantiated by a different code path from every',
      '     other control, and dragging is the cheapest way to exercise it.',
      '  4. Right-click → Edit Custom Component on one, and check the readiness rail in the',
      '     designer agrees with the card printed here. They run the same function; if they',
      '     disagree, the instantiation path lost something.',
      '',
      'WHAT A FAILURE LOOKS LIKE',
      '',
      '  - a blank or rectangle-only instance         the parts did not materialize',
      '  - a red card                                 the package stopped validating',
      '  - "validator threw"                          the validator itself broke on this shape',
      '  - an instance that ignores its dimensions    the starter patch lost its Transform',
      '  - a card reading 100% next to a blank cell   the readiness model is measuring the wrong',
      '                                               thing, which is worse than a red card',
      '',
      'WHAT IT CANNOT PROVE',
      '',
      'Nothing here is interactive. Hit zones, behaviors, generators and links are all validated as',
      'wiring, not exercised — a hit zone that points at the right behavior and never fires looks',
      'identical on this sheet. Driving them is a mouse and this sheet open beside you.',
    ].join('\n'),
  });
}
