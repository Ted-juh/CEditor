// showcaseCollections.js — the showcase collections, each a folder of demo panels under CE/panels/
// generated from its script: the Film Festival, the Song Book, Mechanisms and the Gallery. Where each
// goes and exactly what each file holds; export-showcases.mjs writes them, and the tests hold the
// committed files to this.
import { join } from 'node:path';
import { FILMS } from './filmFestivalPanels.js';
import { SONGS } from './songBookPanels.js';
import { MECHANISMS } from './mechanismsPanels.js';
import { GALLERY } from './galleryPanels.js';
import { serializePanel } from '../src/CE_Application/stores/panelModel.js';

const PANELS = join(import.meta.dirname, '../../panels');

export const COLLECTIONS = Object.freeze({
  films: { folder: 'Film Festival', list: FILMS },
  songs: { folder: 'Song Book', list: SONGS },
  mechanisms: { folder: 'Mechanisms', list: MECHANISMS },
  gallery: { folder: 'Gallery', list: GALLERY },
});

/** The folder a collection is written to. */
export const collectionDir = (key) => join(PANELS, COLLECTIONS[key].folder);

/** One panel of a collection by its id, as the editor opens it, or null. */
export function collectionPanel(key, id) {
  const entry = COLLECTIONS[key].list.find(([name]) => name === id);
  return entry ? entry[1]() : null;
}

/** The committed file for one panel of a collection: where it goes and exactly what it holds. */
export function collectionFile(key, id) {
  const panel = collectionPanel(key, id);
  return { path: join(collectionDir(key), `${panel.name}.cepanel`), text: `${serializePanel(panel)}\n` };
}
