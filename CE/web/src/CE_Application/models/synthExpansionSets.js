// A second synth collection: conventional controls, different physical profiles and scales.
export const SYNTH_EXPANSION = [
  ['heritage','Heritage','1970s / cream caps','Scalloped ivory caps, inset pointer grooves, narrow vintage faders and piano-style keys.','tolex','2C2925','D7CFB8','BEB591','vintage','bar',14,34,5,10,'piano','needle','soft'],
  ['pinstripe','Pinstripe','Analogue / calibrated','Broad black skirts, paired index lines, dense printed scales and tall console fader caps.','console','25272A','36383C','D2B888','fader','console',17,44,3,20,'rocker','twin','soft'],
  ['dual-scale','Dual Scale','Studio / fine adjustment','Stacked coaxial profiles with two calibrated rings, milled faders and separate status lamps.','machined','30373A','A6B0B2','D5B98B','billet','block',21,38,8,24,'status','split','metal'],
  ['broadcast','Broadcast','Studio / dished metal','Dished aluminium faces, black inset indexes, broad console caps and illuminated rectangular keys.','console','444D50','C3C8C6','B9D1BE','fader','console',25,40,6,10,'inset','needle','metal'],
  ['compact-rack','Compact Rack','Rack / close spacing','Small ribbed pots in compact mounts, short slider grips and narrow latching buttons.','machined','BEC1BA','3D4545','867048','rubber','bar',11,28,3,5,'slim','segments','soft'],
  ['recessed','Recessed','Desktop / inset controls','Flush dial wells, raised index tabs, recessed fader slots and shallow rocker switches.','graphite','293138','687A85','B5C9D1','billet','block',16,34,12,8,'rocker','bar','flat'],
  ['digital-grid','Digital Grid','1990s / digital rack','Round encoders in square mounts, eight-point scales, square slider caps and membrane switches.','phosphor','242B36','556171','AFC7A8','fader','bar',18,30,6,8,'membrane','dots','flat'],
  ['studio-white','Studio White','Current / light studio','Low pale caps with open dual scales, slim console faders and clearly inset status indicators.','soft','E1E3DE','F1F1E9','3D7983','fader','console',16,32,4,6,'status','split','soft'],
  ['arc-line','Arc Line','Current / graphic','Open value arcs, long fine pointers, straight minimal faders and low rectangular touch keys.','graphite','1B252A','475C64','AFD5D3','fader','bar',8,30,2,5,'touch','bar','flat'],
  ['edge-light','Edge Light','Future / edge illumination','Raised encoder rims, illuminated perimeter indexes, lit fader slots and edge-lit keys.','obsidian','202A34','657C8A','BDDDE5','billet','block',14,36,7,12,'edge','segments','glass'],
  ['touch-encoder','Touch Encoder','Future / numeric surface','Wide flat encoder caps with central readouts, perimeter position dots and thin fader markers.','graphite','222930','4F616D','C7D8DC','fader','bar',9,24,4,8,'touch','dots','flat'],
  ['carbon-pro','Carbon Pro','Stage / deep grips','Deep rubber finger grips, inset pointer strips, broad tactile faders and resilient keyed pads.','carbon','282D2E','515B5D','D3BD90','rubber','bar',23,38,9,10,'inset','twin','rubber'],
].map(([id,name,title,detail,base,panel,face,accent,recipe,cap,width,height,track,ticks,key,meterStyle,finish],i)=>({
  id,name,title,detail,base,panel,face,accent,style:id,series:2,physical:true,rotary:id,
  material:finish==='metal'?'brushed':'rubber',finish,key,meterStyle,
  slider:{recipe,cap,width,height,track,ticks},
  padForm:`physical-${id}`,padRadius:[.06,.04,.045,.07,.04,.09,.04,.12,.04,.06,.1,.14][i],padLayout:'grid',
  numberRadius:[3,1,2,5,2,4,0,6,0,3,5,8][i],
  numberLayout:i%4===2?[[77-i*.2,55,23+i*.2,40],[0,5,71-i*.2,90],[77-i*.2,5,23+i*.2,40]]:i%4===3?[[0,53,26+i*.3,43],[32+i*.3,4,68-i*.3,92],[0,4,26+i*.3,43]]:[[0,6+i,21+i*.4,88-i*2],[26+i*.4,6+i,48-i*.8,88-i*2],[79-i*.4,6+i,21+i*.4,88-i*2]],
  stepKind:'rect',pad:'inset',radius:4,handle:'blade',meter:16,ribbon:'wheel3d',matrix:'dot',
}));
