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
].map(([id,name,title,detail,rotary,padForm,padLayout,stepKind,base,panel,face,accent])=>({id,name,title,detail,rotary,padForm,padLayout,stepKind,base,panel,face,accent,pad:'raised',radius:4,handle:'block',meter:12,ribbon:'wheel3d',matrix:'dot'}));

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
    // No inherited texture: each construction has deliberate open space and contrast.
    return {...base,id:d.id,name:d.name,description:d.detail,tokens,panel:{colour:'FF'+d.panel},families:{...base.families,Label:{component:{...base.families?.Label?.component,'Text.Fill.colour':'{text.primary}'}}}};
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
];
export function additionalNumberFamily(id) {
  const index=ADDITIONAL_DIRECTIONS.findIndex(d=>d.id===id);
  if(index<0) return null;
  const d=ADDITIONAL_DIRECTIONS[index];
  return {parts:Object.fromEntries(['decrement','valueField','increment'].map((name,i)=>{
    const [x,y,width,height]=NUMBER_LAYOUTS[index][i];
    return [name,{kind:i===1?'rect':d.stepKind,'Layout.x':x,'Layout.y':y,'Layout.width':width,'Layout.height':height,'Layout.xUnit':'percent','Layout.yUnit':'percent','Layout.widthUnit':'percent','Layout.heightUnit':'percent','Layout.anchorX':'left','Layout.anchorY':'top','Background.Corners.radius':i===1?3:20,'Background.Fill.colour':i===1?'{control.field}':'{surface}','Background.Border.enabled':true,'Background.Border.thickness':1,'Background.Border.colour':'{accent}','Text.Fill.colour':i===1?'{text.primary}':ink(d.face)}];
  }))};
}
