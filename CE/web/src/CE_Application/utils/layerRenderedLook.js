// layerRenderedLook.js — a component layer drawn as a rendered object (utils/renderedLook.js, piece
// E): the same image a knob's plate, a fader cap, a key or a meter's housing draws on the panel, made
// from the layer's own properties, so a control made into layers keeps its rendered look and a
// layer drawn from scratch can take one.
//
// A layer's rendered look is its `look: 'rendered'` and the render properties a panel part carries
// (renderProfile, renderCount, renderDepth, renderTaper, renderHeight, renderTop, renderMaterial,
// renderTopMaterial, renderTopColour), with three of a layer's own:
//
//   renderShape   'round', a turned body the size of the layer's narrower side, or 'block', a block
//                 the layer's box (a fader cap's, a key's, a meter's housing);
//   renderCorner  a block's corner, % of half its narrower side (a key takes its corner radius);
//   renderAxis    the way a block's ridges follow one another ('x' across, 'y' down).
//
// The body colour is the layer's fill. A round body whose light stays put (`meta.fixedLight`) does
// not turn as a picture: its rotation, from `meta.renderTurn`, picks the image whose grooves stand
// there, as the panel turns a knob's rendered plate under the set's lamp. Anything else turns and
// scales as the layer does.
//
// No imports but the core, so the export tools can bake a component's images in a bare page.

export { layerIsRendered, layerRenderedJobs, layerRenderedPlacement, layerRenderedSpec } from './renderedLookCore.js';
