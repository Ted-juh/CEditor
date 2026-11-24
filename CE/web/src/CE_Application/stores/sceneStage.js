/**
 * sceneStage.js — how a stage tells the controls on it which scene to draw, and where (the
 * Animation Designer's stage, step 5). It is a Svelte context, not a global store, so only the
 * controls inside that stage draw the scene: the panel's own canvas and Preview never do.
 *
 * The context's value is a store of `{ scene, at, playing, phase }`: `at` (ms) poses every clip at
 * the playhead, paused; `playing` lets them run from the moment it turned true; `phase` flips to
 * start a played scene again (keyframeAnimation.js, HOW IT RESTARTS).
 */
export const SCENE_STAGE = 'ce.sceneStage';
