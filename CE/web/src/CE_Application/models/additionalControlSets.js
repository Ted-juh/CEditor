import { lighten, darken, SLIDER_DESIGNS } from './controlSetDesigns.js';
import { PHYSICAL_DIRECTIONS } from './physicalControlSets.js';
// Twelve constructions. Palettes are secondary to their moving geometry and performance surfaces.
export const ADDITIONAL_DIRECTIONS = [
  ['atlas','Atlas','Nautical / spokes','Ship wheel, compass needles, porthole pads and split circular steppers.','wheel','porthole','grid','circle','blueprint','172D3B','E3CF98','76CCD0'],
  ['kiln','Kiln','Ceramic / glazed','Stacked pottery dial, porcelain keys, petal pads and vertical ceramic steppers.','pottery','petal','stagger','capsule','soft','EEE7DC','F5F0E8','B6533C'],
  ['arcade','Arcade','Arcade / cabinet','Joystick dial, octagonal punch keys, diamond pads and oversized directional steppers.','joystick','diamond','grid','diamond','pop','202039','ECD94A','FF7085'],
  ['spool','Spool','Tape / transport','Open reel, transport keys, reel pads and a divided tape-counter stepper.','reelhub','reel','grid','circle','tolex','282620','DCCDA9','DF744A'],
  ['tessera','Tessera','Mosaic / modular','Rotating square frame, mosaic keys, hexagonal pads and a stepped number stack.','squareframe','hex','stagger','hexagon','graphite','E8E3D7','365E63','BC592C'],
  ['bellows','Bellows','Fold / pneumatic','Expanding bellows, squeeze keys, concertina pads and offset end-cap steppers.','accordion','concertina','grid','parallelogram','carbon','27252B','B7A6C4','E9A86B'],
  ['helix','Helix','Thread / machine','Lead screw, threaded plungers, ribbed capsule pads and column-mounted steppers.','leadscrew','ribbed','stagger','capsule','machined','D4D9D8','54615F','A6432B'],
  ['iris','Iris','Optical / shutter','Variable aperture, shutter keys, shutter pads and triangular focus steppers.','aperture','shutter','grid','triangle','obsidian','171C26','4F6081','ECBA68'],
  ['balance','Balance','Balance / kinetic','Tilting beam, counterweight keys, shield pads and balanced number paddles.','beam','shield','grid','trapezoid','ivory','EEECE4','29403E','B65A42'],
  ['satellite','Satellite','Space / articulated','Articulated dish arm, docking keys, orbital pods and stacked navigation steppers.','dish','pod','orbit','circle','frost','162B35','C2DADB','70CFC0'],
  ['fan','Fan','Paper / radial','Opening fan, pleated keys, fan-shaped pads and folded triangular steppers.','foldfan','fan','grid','triangle','pop','F1E6D8','E4A17C','36596A'],
  ['crown','Crown','Clockwork / escapement','Toothed crown, escapement keys, gear pads and inset mechanical steppers.','gear','gear','grid','hexagon','machined','292728','CEAD73','91BEAF'],
].map(([id,name,title,detail,rotary,padForm,padLayout,stepKind,base,panel,face,accent])=>({id,name,title,detail,rotary,padForm,padLayout,stepKind,base,panel,face,accent,pad:'raised',radius:4,handle:'block',meter:12,ribbon:'wheel3d',matrix:'dot'})).concat(PHYSICAL_DIRECTIONS);

function physicalFinish(d, inset=false) {
  const colour=inset?d.panel:d.face;
  return {'Background.Fill.gradientEnabled':d.finish!=='flat'&&!['flat','digital','future'].includes(d.style),'Background.Fill.gradient':{type:'linear',angle:180,edge:0,stops:[{color:inset?darken(colour,.65):lighten(colour,.5),position:0},{color:colour,position:inset?35:45},{color:inset?lighten(colour,.12):darken(colour,.45),position:100}]},'Background.Effects.Material.enabled':!inset&&(d.finish==='metal'||['console','modular','precision'].includes(d.style)),'Background.Effects.Material.kind':d.material,'Background.Effects.Material.strength':8,'Background.Effects.Material.shine':65,'Effects.Bevel.enabled':d.finish!=='flat'&&!['flat','digital','future'].includes(d.style),'Effects.Bevel.style':inset?'inner-bevel':'outer-bevel','Effects.Bevel.size':2,'Effects.Bevel.softness':1,'Effects.Bevel.depth':120,'Effects.Bevel.highlightOpacity':75,'Effects.Bevel.shadowOpacity':70};
}
function ink(hex) { const [r,g,b]=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)); return .2126*r+.7152*g+.0722*b>145?'FF202529':'FFF7F4EC'; }
export function makeAdditionalControlSets(bases) {
  return ADDITIONAL_DIRECTIONS.map(d=>{
    const base=bases.find(s=>s.id===d.base);
    const tokens={...base.tokens};
    for(const key of Object.keys(tokens)) {
      if(key.startsWith('surface') || key.startsWith('control.button') || key==='control.cap') tokens[key]='FF'+d.face;
      if(key.startsWith('text.')) tokens[key]=ink(d.panel);
    }
    Object.assign(tokens,{'accent':'FF'+d.accent,'accent.hot':'FF'+d.accent,'control.field':'FF'+d.panel,'control.track':'FF'+d.panel,'control.fill':'FF'+d.accent,'text.inverse':ink(d.face)});
    const families={...base.families,Label:{component:{...base.families?.Label?.component,'Text.Fill.colour':'{text.primary}'}}};
    if(d.physical) for(const type of ['TextInput','Combobox','CyclicButton']) {
      const inset=type==='TextInput';
      families[type]={...families[type],component:{...families[type]?.component,...physicalFinish(d,inset),'Background.Fill.colour':inset?'{control.field}':'{surface}','Text.Fill.colour':ink(inset?d.panel:d.face),'Background.Corners.radius':d.radius}};
    }
    if(d.physical) {
      const common={slot:'0E1215',slotEdge:lighten(d.panel,.2),track:'11171B',fill:d.accent,cap:d.face,groove:ink(d.face).slice(2),tick:ink(d.panel).slice(2),plate:lighten(d.face,.15),rail:'555752',light:d.accent,lit:d.style==='future'};
      const recipe=d.slider?.recipe??(['precision','modular','future'].includes(d.style)?'billet':d.style==='vintage'?'vintage':['rubber','workstation'].includes(d.style)?'rubber':'fader');
      families.Slider=SLIDER_DESIGNS[recipe](common).Slider;
      const capWidths={vintage:14,poly:16,console:18,compact:14,modular:12,rubber:21,digital:12,precision:20,workstation:22,flat:9,glass:12,future:14};
      for(const part of ['pointerCurrent','pointerStart','pointerEnd']) Object.assign(families.Slider.parts[part],{'Layout.width':d.slider?.width??capWidths[d.style],'Layout.height':d.slider?.height??(d.style==='compact'?28:d.style==='workstation'?44:36)});
      if(d.slider) {
        Object.assign(families.Slider.component,{'Behavior.majorTickCount':d.slider.ticks,'Behavior.minorTickCount':0});
        for(const part of ['pointerCurrent','pointerStart','pointerEnd']) Object.assign(families.Slider.parts[part],{kind:d.slider.cap,'Background.Fill.gradientEnabled':d.finish!=='flat',shadow:d.finish!=='flat','Background.Corners.radius':d.numberRadius});
        for(const part of ['bodyTrackBase','bodyTrackFill']) Object.assign(families.Slider.parts[part],{'Layout.height':d.slider.track,'Background.Corners.radius':d.finish==='glass'?3:1});
        if(d.style==='edge-light') families.Slider.parts.bodyTrackFill.glow=true;
      }
      if(['flat','glass','digital'].includes(d.style)) for(const part of ['pointerCurrent','pointerStart','pointerEnd']) Object.assign(families.Slider.parts[part],{kind:'bar',shadow:d.style!=='flat','Background.Fill.gradientEnabled':d.style==='glass','Background.Corners.radius':d.style==='glass'?4:1});
    }
    // Physical sets supply their own restrained panel material.
    return {...base,id:d.id,name:d.name,description:d.detail,tokens,panel:{colour:'FF'+d.panel,...(d.physical?{material:{enabled:(d.finish==='metal'||['console','modular','precision'].includes(d.style)),kind:d.material,strength:8,shine:15,grain:40,lampFollowsSet:true}}:{})},families};
  });
}

// Percentage layout is shared by the drawn parts and the existing Number hit tester.
const NUMBER_LAYOUTS = [
  [[0,22,24,56],[29,16,42,68],[76,22,24,56]],
  [[2,55,28,42],[34,8,62,84],[2,3,28,42]],
  [[0,15,30,70],[33,25,34,50],[70,15,30,70]],
  [[0,60,22,38],[25,10,50,80],[78,0,22,38]],
  [[0,50,28,50],[30,20,40,60],[72,0,28,50]],
  [[0,25,25,70],[28,8,44,84],[75,5,25,70]],
  [[72,52,28,48],[0,12,65,76],[72,0,28,48]],
  [[0,15,28,70],[30,18,40,64],[72,15,28,70]],
  [[0,45,28,52],[32,8,36,66],[72,45,28,52]],
  [[0,52,27,45],[31,18,65,64],[0,0,27,45]],
  [[0,20,28,72],[31,28,38,44],[72,5,28,72]],
  [[3,25,26,50],[33,0,34,100],[71,25,26,50]],
  [[0,12,24,76],[28,12,44,76],[76,12,24,76]],
  [[76,54,24,42],[0,4,70,92],[76,4,24,42]],
  [[0,8,22,84],[26,8,48,84],[78,8,22,84]],
  [[0,16,26,68],[30,16,40,68],[74,16,26,68]],
  [[78,52,22,46],[0,2,72,96],[78,2,22,46]],
  [[0,8,28,84],[32,8,36,84],[72,8,28,84]],
  [[0,52,24,46],[30,2,70,96],[0,2,24,46]],
  [[0,4,23,92],[27,4,46,92],[77,4,23,92]],
  [[0,10,25,80],[29,10,42,80],[75,10,25,80]],
  [[0,12,20,76],[25,12,50,76],[80,12,20,76]],
  [[0,14,24,72],[28,14,44,72],[76,14,24,72]],
  [[80,53,20,43],[0,4,74,92],[80,4,20,43]],
];
export function additionalNumberFamily(id) {
  const index=ADDITIONAL_DIRECTIONS.findIndex(d=>d.id===id);
  if(index<0) return null;
  const d=ADDITIONAL_DIRECTIONS[index];
  return {parts:Object.fromEntries(['decrement','valueField','increment'].map((name,i)=>{
    const [x,y,width,height]=(d.numberLayout??NUMBER_LAYOUTS[index])[i];
    return [name,{...(d.physical?physicalFinish(d,i===1):{}),kind:i===1?'rect':d.stepKind,'Layout.x':x,'Layout.y':y,'Layout.width':width,'Layout.height':height,'Layout.xUnit':'percent','Layout.yUnit':'percent','Layout.widthUnit':'percent','Layout.heightUnit':'percent','Layout.anchorX':'left','Layout.anchorY':'top','Background.Corners.radius':i===1?3:d.physical?(d.numberRadius??[4,14,2,12,2,8,20,3,1,0,6,10][index-12]):20,'Background.Fill.colour':i===1?'{control.field}':'{surface}','Background.Border.enabled':true,'Background.Border.thickness':1,'Background.Border.colour':'{accent}','Text.Fill.colour':i===1?'{text.primary}':ink(d.face)}];
  }))};
}
