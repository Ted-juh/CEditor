import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';

// Move existing controls so saved customizations, bindings and pattern data survive.
export function applyPerformanceLayout(panel) {
  const all = flatControls(panel.controls);
  const named = name => all.find(c => c._children.Core.name === name);
  const arp = named('box_ARPEGGIO');
  if (arp?._children.Core.tabPageId === 'arpeggiator') return panel;
  const top = named('top_pages'), bottom = named('bottom_pages'), fx = named('box_EFFECTS / OUTPUT');
  if (!arp || !top || !bottom || !fx) throw new Error('GAIA performance layout sources missing');
  const rect = c => c._children.Transform;
  const move = (name, patch) => Object.assign(rect(named(name)), patch);
  const arpRect = { ...rect(arp) }, fxRect = { ...rect(fx) };
  const inRect = (c, r) => { const t=rect(c); return t.x >= r.x && t.x < r.x+r.width && t.y >= r.y && t.y < r.y+r.height; };
  const arpControls = panel.controls.filter(c => inRect(c, arpRect));
  panel.controls = panel.controls.filter(c => !arpControls.includes(c));
  for (const c of arpControls) {
    c._children.Core.tabPageId = 'arpeggiator';
    rect(c).x -= arpRect.x; rect(c).y -= arpRect.y;
    bottom._children.Children._children[c._children.Core.id] = c;
  }
  move('box_ARPEGGIO', {x:0,y:0,width:260,height:292});
  move('tab_ARPEGGIO', {x:2,y:2});
  move('common.switch', {x:184,y:4,width:64});
  for (const [i,name] of ['arp.grid','arp.duration','arp.motif'].entries()) {
    move(name, {x:12,y:49+i*48,width:236});
    move(name+'.caption', {x:12,y:36+i*48,width:236});
  }
  for (const [i,name] of ['arp.accentRate','arp.velocity','arp.octaveRange'].entries()) {
    move(name, {x:22+i*86,y:202});
    move(name+'.caption', {x:2+i*86,y:249,width:84,height:36});
    const multiline=named(name+'.caption')._children.Text._children.Multiline;
    Object.assign(multiline,{maxLines:3,fitMode:'shrink',wrapMode:'word'});
  }
  // Use the panel width gained by the tone-button column: grid loses only 158px.
  const width=panel.width-40;
  rect(bottom).width=width;
  for (const c of Object.values(bottom._children.Children._children)) {
    if (c._children.Core.tabPageId !== 'arpeggiator' || arpControls.includes(c)) continue;
    rect(c).x += 270;
    if (['box_ARPEGGIO PATTERN','arp_pattern_grid','arp_gesture_guide','gaia_hardware_sync_status'].includes(c._children.Core.name)) rect(c).width -= 158;
  }
  // The four processors run left-to-right, ending in the shared output controls.
  for (const c of panel.controls) {
    const t=rect(c);
    if(t.y>=arpRect.y && t.y<arpRect.y+arpRect.height && t.x>=arpRect.x+arpRect.width) t.x-=530;
  }
  const fxX=arpRect.x+1040;
  const fxControls=Object.values(top._children.Children._children).filter(c=>c._children.Core.tabPageId==='controls' && inRect(c,fxRect));
  for(const c of fxControls) {
    delete top._children.Children._children[c._children.Core.id];
    delete c._children.Core.tabPageId;
    const t=rect(c), output=t.x>=fxRect.x+600;
    t.x=fxX+(t.x-fxRect.x)+(output?-144:0);
    t.y=arpRect.y+(t.y-fxRect.y);
    panel.controls.push(c);
  }
  move('box_EFFECTS / OUTPUT',{width:width-1040,height:194});
  return panel;
}
