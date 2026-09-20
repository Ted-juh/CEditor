import { PHYSICAL_DIRECTIONS } from '../models/physicalControlSets.js';
// The exact same outline drives drawing and pointer tests. Normalized to each cell's bounds.
export const PERFORMANCE_FORMS = [['rect','Original rectangle'],['porthole','Porthole'],['petal','Petal'],['diamond','Diamond'],['reel','Tape reel'],['hex','Hexagon'],['concertina','Concertina'],['ribbed','Ribbed capsule'],['shutter','Shutter'],['shield','Shield'],['pod','Orbital pod'],['fan','Folded fan'],['gear','Gear']];
for (const d of PHYSICAL_DIRECTIONS) PERFORMANCE_FORMS.push([d.padForm,d.name]);
const polygon = {
  rect:[[0,0],[1,0],[1,1],[0,1]],
  diamond:[[.5,0],[1,.5],[.5,1],[0,.5]],
  hex:[[.25,0],[.75,0],[1,.5],[.75,1],[.25,1],[0,.5]],
  concertina:[[0,.18],[.12,0],[.24,.16],[.38,0],[.5,.16],[.62,0],[.76,.16],[.88,0],[1,.18],[1,.82],[.88,1],[.76,.84],[.62,1],[.5,.84],[.38,1],[.24,.84],[.12,1],[0,.82]],
  shield:[[.06,0],[.94,0],[1,.55],[.5,1],[0,.55]],
  pod:[[.28,0],[.72,0],[1,.28],[1,.72],[.72,1],[.28,1],[0,.72],[0,.28]],
  shutter:[[.3,0],[.85,.08],[1,.5],[.7,1],[.15,.92],[0,.5]],
  fan:[[.04,.23],[.23,.06],[.5,0],[.77,.06],[.96,.23],[.72,1],[.28,1]],
};
function radial(n,radius) { return Array.from({length:n},(_,i)=>{const a=i*Math.PI*2/n-Math.PI/2;const r=radius(a,i);return [.5+Math.cos(a)*r,.5+Math.sin(a)*r];}); }
polygon.porthole=radial(48,()=>.49);
polygon.reel=radial(48,()=>.49);
polygon.petal=radial(64,a=>.41+.08*Math.cos(a*4));
polygon.gear=radial(48,(_,i)=>i%4<2?.49:.41);
polygon.ribbed=Array.from({length:48},(_,i)=>{const a=i*Math.PI*2/48;return [.5+Math.cos(a)*.49,.5+Math.sin(a)*.49];});
for (const d of PHYSICAL_DIRECTIONS) polygon[d.padForm]=polygon[d.outline];
export const performancePoints = form=>polygon[form]??polygon.rect;
export function performancePath(form,w,h,x=0,y=0) { return performancePoints(form).map(([px,py],i)=>`${i?'L':'M'}${x+px*w} ${y+py*h}`).join(' ')+'Z'; }
export function performanceContains(form,x,y) {
  if(x<0||y<0||x>1||y>1) return false;
  if(!form || form==='rect') return true;
  const points=performancePoints(form); let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [ax,ay]=points[i], [bx,by]=points[j];
    if((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
  }
  return inside;
}
