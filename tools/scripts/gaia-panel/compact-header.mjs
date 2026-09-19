import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';

// Fold the former header into the lower pages without recreating any controls.
export function applyCompactHeader(panel) {
  const all = flatControls(panel.controls);
  const named = name => all.find(c => c._children.Core.name === name);
  const top = named('top_pages');
  if (!top) return panel;
  const bottom = named('bottom_pages'), banks = named('patch_banks');
  if (!bottom || !banks) throw new Error('GAIA lower pages / banks missing');
  const rect = c => c._children.Transform;
  const move = (name, patch) => Object.assign(rect(named(name)), patch);
  const children = Object.values(top._children.Children._children);
  const patch = children.filter(c => c !== banks && rect(c).x < 480);
  const sync = children.filter(c => rect(c).x >= 480 && rect(c).x < 640);
  const beam = children.filter(c => rect(c).x >= 640);
  if (patch.length + sync.length + beam.length + 1 !== children.length) throw new Error('Unclassified header control');
  bottom._children.TabContainer.pages.push({id:'banks',label:'PATCH BANKS'});
  for (const c of children) {
    c._children.Core.tabPageId = patch.includes(c) || c === banks ? 'banks' : 'status';
    bottom._children.Children._children[c._children.Core.id] = c;
  }
  move('patch_banks', {x:56,y:0}); // Retain all eight bank columns at their full width.
  move('box_PATCH', {x:0,y:230,width:1672,height:78});
  move('tab_PATCH', {x:2,y:232});
  move('common.patchName', {x:90,y:262,width:240});
  const caption = text => patch.find(c => c._children.Text?.content === text);
  Object.assign(rect(caption('NAME')), {x:90,y:245,width:240});
  for (const [i, [name, label]] of [
    ['common.patchLevel','LEVEL'], ['common.patchTempo','TEMPO'], ['common.octaveShift','OCTAVE'],
  ].entries()) {
    move(name, {x:390+i*120,y:234});
    Object.assign(rect(caption(label)), {x:376+i*120,y:291});
  }
  move('common.monoSwitch', {x:770,y:256});
  move('common.portamentoSwitch', {x:850,y:256});
  for (const [i, [name, label]] of [
    ['common.portamentoTime','PORTA TIME'], ['common.pitchBendRangeUp','BEND UP'], ['common.pitchBendRangeDown','BEND DN'],
  ].entries()) {
    move(name, {x:1050+i*180,y:242});
    Object.assign(rect(caption(label)), {x:1036+i*180,y:288});
  }
  for (const c of beam) {rect(c).x-=640; rect(c).y+=48;}
  for (const c of sync) {rect(c).x+=900; rect(c).y+=48;}
  move('gaia_display_brand', {x:330,y:22});
  move('gaia_display_caption', {x:650,y:22,width:400});
  move('gaia_display_help', {x:330,y:240,width:936,height:52});

  const removedHeight = rect(named('tone1.signalFlow')).y-24;
  const oldBottomEdge = rect(bottom).y+rect(bottom).height;
  panel.controls = panel.controls.filter(c => c !== top);
  for (const c of panel.controls) {
    if (c._children.Core.name === 'plate') rect(c).height-=removedHeight-16;
    else {
      const belowPages = rect(c).y >= oldBottomEdge;
      rect(c).y-=removedHeight;
      if (belowPages) rect(c).y+=16;
    }
  }
  rect(bottom).height+=16;
  panel.height-=removedHeight-16;
  return panel;
}
