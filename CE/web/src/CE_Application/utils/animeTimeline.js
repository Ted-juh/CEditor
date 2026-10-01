// animeTimeline.js — the one piece of anime.js the keyframe runtime uses.
//
// The player loads this on demand (`keyframePlayer.js`) and the Animation tab imports it directly;
// both go through this module rather than the package, so the bundler can drop the rest of
// anime.js (draggables, scopes, scroll, text splitting) and the chunk a panel with keyframes
// fetches is the timeline alone.
export { createTimeline } from 'animejs';
