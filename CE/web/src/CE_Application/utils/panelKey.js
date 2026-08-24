// panelKey.js — one key and scale for the whole panel, and the components that follow it.
//
// The musical-context design asked for "a panel-level key + scale that chord gen / pad grid /
// keyboard / arp read, re-harmonizing together, with local override allowed". Six sections already
// carry their own `key` and `scale`: ChordPad, Arp, NoteRibbon, Phrase, Harmoniser and Recorder.
//
// FOLLOWING IS A BROADCAST, NOT AN INDIRECTION, and that is the design decision here. The obvious
// implementation is for every component to read the panel's key at render time instead of its own —
// which means rewriting six layout modules and every one of their call sites, and leaves the file
// with a `key: 0` in each section that no longer means anything. Instead, changing the panel key
// WRITES the new key into each following component's own section. Everything downstream keeps
// working untouched: the renderers, the editors, undo, export, a panel opened in an older build.
// A follower is a component that agreed to be kept in step, not one that lost its own setting.
//
// THE PART THAT NEEDS CARE is that the two scale vocabularies are not the same. `musicalContext.js`
// knows fourteen scales; the components know twelve, and spell two of them differently. A panel set
// to a scale a component has no name for must be REPORTED, not silently rounded to major — a chord
// pad quietly playing the wrong mode is the kind of bug somebody blames on their ears.

import { SCALES as COMPONENT_SCALES } from './chordPadLayout.js';
import { DEFAULT_MUSICAL_CONTEXT, SCALES, intervalsFor, normalizeContext, rootFrom } from './musicalContext.js';
import { flatControls } from './containment.js';

/** The sections that carry a key and a scale of their own. */
export const KEY_SCALE_SECTIONS = ['ChordPad', 'Arp', 'NoteRibbon', 'Phrase', 'Harmoniser', 'Recorder'];

/**
 * Panel scale name → component scale name.
 *
 * Only the two that are spelled differently need an entry; everything else matches by name. Written
 * out rather than derived from the interval sets, because two scales with the same intervals and
 * different names are a naming question and not a maths one, and guessing would sooner or later
 * pick the wrong label for a mode.
 */
const SCALE_ALIASES = {
  pentatonicMajor: 'pentatonicMaj',
  pentatonicMinor: 'pentatonicMin',
};

/**
 * The component-side name for a panel scale, or `null` when there is none.
 *
 * `chromatic` and `wholeTone` are the two the components genuinely cannot express. A custom interval
 * array is also `null`: the components take a scale by name, so an ad-hoc interval set has nowhere
 * to go. Both cases are the caller's to report.
 */
export function componentScaleName(scale) {
  if (Array.isArray(scale)) return null;
  const name = String(scale ?? '');
  const mapped = SCALE_ALIASES[name] ?? name;
  return Object.hasOwn(COMPONENT_SCALES, mapped) ? mapped : null;
}

/** The panel's key and scale, defaulted. */
export function panelMusicalContext(panel) {
  return normalizeContext(panel?.musicalContext ?? DEFAULT_MUSICAL_CONTEXT);
}

function controlId(control) {
  return String(control?._children?.Core?.id ?? '');
}

function controlName(control) {
  return String(control?._children?.Core?.name ?? controlId(control));
}

/** The key/scale section a control carries, if it has one. */
export function keyScaleSectionOf(control) {
  for (const name of KEY_SCALE_SECTIONS) {
    const section = control?._children?.[name];
    if (section && Object.hasOwn(section, 'key') && Object.hasOwn(section, 'scale')) {
      return { name, section };
    }
  }
  return null;
}

/** True when this control has opted in to the panel key. Off by default, so nothing existing moves. */
export function followsPanelKey(control) {
  const hit = keyScaleSectionOf(control);
  return hit?.section?.followPanelKey === true;
}

/**
 * The effective key and scale for one control.
 *
 * A follower gets the panel's; everyone else keeps their own. A follower whose panel scale has no
 * component name keeps its own too, rather than being rounded — the same rule the broadcast follows,
 * so what a reader computes and what a broadcast writes cannot disagree.
 */
export function contextForControl(panel, control) {
  const hit = keyScaleSectionOf(control);
  if (!hit) return null;

  const own = { root: rootFrom(hit.section.key ?? 0), scale: String(hit.section.scale ?? 'major') };
  if (hit.section.followPanelKey !== true) return { ...own, following: false, section: hit.name };

  const context = panelMusicalContext(panel);
  if (context.enabled === false) return { ...own, following: false, section: hit.name };

  const scale = componentScaleName(context.scale);
  if (scale === null) return { ...own, following: false, section: hit.name, unsupported: String(context.scale) };

  return { root: context.root, scale, following: true, section: hit.name };
}

/**
 * What changing the panel key would write.
 *
 * Returned as a plan rather than applied, so the caller can show it, undo it as one step, or count
 * what it could not do. A follower already in the right key produces no entry — a broadcast that
 * rewrote every follower on every keystroke would fill the undo stack with nothing.
 */
export function panelKeyPlan(panel) {
  const context = panelMusicalContext(panel);
  const scale = componentScaleName(context.scale);

  const changes = [];
  const skipped = [];

  for (const control of flatControls(Array.isArray(panel?.controls) ? panel.controls : [])) {
    const hit = keyScaleSectionOf(control);
    if (!hit || hit.section.followPanelKey !== true) continue;

    if (scale === null) {
      skipped.push({
        controlId: controlId(control),
        controlName: controlName(control),
        section: hit.name,
        // Named, so the editor can say WHICH scale it could not use rather than "some did not work".
        reason: `no ${String(context.scale)} in the note components' scale list`,
      });
      continue;
    }

    if (rootFrom(hit.section.key ?? 0) === context.root && String(hit.section.scale) === scale) continue;

    changes.push({
      controlId: controlId(control),
      controlName: controlName(control),
      section: hit.name,
      patch: { key: context.root, scale },
    });
  }

  return { changes, skipped, context, scale };
}

/**
 * The panel key inferred from what is already on it.
 *
 * Offered when somebody first turns the panel key on: writing C major over a panel already set to F
 * minor throughout would be a destructive first impression of a convenience feature. The most
 * common key among the note components wins; a tie goes to the first, which is arbitrary and
 * harmless because the author is about to see it and can change it.
 */
export function inferPanelContext(panel) {
  const tally = new Map();
  for (const control of flatControls(Array.isArray(panel?.controls) ? panel.controls : [])) {
    const hit = keyScaleSectionOf(control);
    if (!hit) continue;
    const key = `${rootFrom(hit.section.key ?? 0)}:${String(hit.section.scale ?? 'major')}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  if (tally.size === 0) return { ...DEFAULT_MUSICAL_CONTEXT };

  const [best] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const [root, scale] = best[0].split(':');
  // Back through the panel vocabulary: the components' spelling is the one stored on them, and the
  // panel's context should read in its own names.
  const panelScale = Object.entries(SCALE_ALIASES).find(([, component]) => component === scale)?.[0]
    ?? (Object.hasOwn(SCALES, scale) ? scale : 'major');
  return { root: Number(root), scale: panelScale, enabled: true };
}

/** The panel's scale as intervals — for anything that wants the notes rather than the name. */
export function panelScaleIntervals(panel) {
  return intervalsFor(panelMusicalContext(panel).scale);
}
