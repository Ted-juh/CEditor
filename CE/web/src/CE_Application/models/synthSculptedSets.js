// A third synth collection built around silhouette, relief and moving construction.
// Colours support the objects; they are not what distinguishes one set from another.
export const SYNTH_SCULPTED = [
  ['valve-console','Valve Console','Valve era / domed','High Bakelite domes rise from stepped brass skirts, with arched fader shoes and sprung piano keys.','tolex','28231F','4A3A30','D0B16F','vintage','bar',19,42,7,11,'piano','needle','soft','dome'],
  ['chicken-head','Chicken Head','Classic / pointer lever','Long chicken-head pointers sweep over horseshoe scales; wedge faders and levered switches repeat the profile.','tolex','312C27','DED6C2','B47B42','vintage','bar',18,39,5,11,'rocker','needle','soft','pointer'],
  ['turret-stack','Turret Stack','Modular / stepped body','Three concentric machined tiers form a tall turret, paired with bridge faders and guarded square keys.','machined','303437','9DA6A5','D5B67A','billet','block',23,46,8,17,'guard','split','metal','turret'],
  ['deep-flute','Deep Flute','Performance / finger grip','Twelve deep rubber channels create a positive grip, with ribbed fader caps and thick shock-mounted pads.','carbon','202629','465052','E0B96F','rubber','bar',25,43,9,9,'inset','twin','rubber','flute'],
  ['concave-studio','Concave Studio','Studio / dished cap','A broad concave thumb dish sits inside a raised alloy bezel, with saddle faders and recessed studio keys.','console','363D40','B7BDBA','A7C9C0','fader','console',22,40,7,15,'inset','needle','metal','concave'],
  ['hex-drive','Hex Drive','Industrial / six-sided','Faceted hexagonal knobs, bolt-head centres, hex fader blocks and bevelled mechanical keys.','machined','2B3032','7D8788','D1A762','billet','block',24,39,10,7,'guard','segments','metal','hex'],
  ['coin-edge','Coin Edge','Precision / fine knurl','Fine coin-edge teeth surround a low metal cap; narrow rail faders and engraved push keys keep the precision scale.','console','292D30','AEB5B5','D7C08A','billet','bar',18,36,5,25,'slim','needle','metal','coin'],
  ['gimbal-ring','Gimbal Ring','Laboratory / nested axes','Nested rings and a suspended inner dial expose the mechanism, echoed by yoke faders and framed controls.','aerospace','263238','80949B','9ED5D4','billet','block',21,44,6,13,'frame','split','metal','gimbal'],
  ['lever-dial','Lever Dial','Field / radial lever','A raised radial lever travels above a numbered plate, with long lever faders and guarded action keys.','field','34332D','777564','D5B36D','billet','bar',16,48,7,9,'guard','needle','metal','lever'],
  ['castellated','Castellated','Stage / crown grip','Eight tall castellations lock the hand to the control, with notched fader grips and protected stage switches.','carbon','24292B','4C5657','D7A868','rubber','console',26,45,10,9,'inset','segments','rubber','castle'],
  ['floating-halo','Floating Halo','Future / suspended light','A shadow gap makes the encoder appear to float above a luminous halo; suspended faders and edge keys match it.','obsidian','151D25','4B6270','83DDE5','billet','glass',20,40,5,18,'edge','dots','glass','halo'],
  ['prism-cap','Prism Cap','Future / faceted crystal','A twelve-facet translucent cap bends highlights across its surface, with prismatic faders and lens-like switches.','frost','202A33','829AA5','C0E4E2','fader','lens',23,41,8,12,'lens','bar','glass','prism'],
].map(([id,name,title,detail,base,panel,face,accent,recipe,cap,width,height,track,ticks,key,meterStyle,finish,padProfile],i)=>({
  id,name,title,detail,base,panel,face,accent,style:id,series:3,physical:true,rotary:id,
  material:finish==='metal'?'brushed':finish==='glass'?'glass':'rubber',finish,key,meterStyle,padProfile,
  slider:{recipe,cap,width,height,track,ticks},
  padForm:`physical-${id}`,padRadius:[.12,.04,.05,.1,.14,.03,.04,.16,.06,.05,.18,.08][i],padLayout:'grid',
  numberRadius:[10,2,4,8,12,2,1,7,3,5,14,6][i],
  numberLayout:[
    [[2,10,23,80],[29,18,42,64],[75,10,23,80]], [[0,58,28,38],[34,5,66,90],[0,4,28,38]],
    [[0,5,20,90],[25,12,50,76],[80,5,20,90]], [[3,16,25,68],[31,4,38,92],[72,16,25,68]],
    [[0,9,29,82],[34,22,32,56],[71,9,29,82]], [[75,56,25,40],[0,7,69,86],[75,4,25,40]],
    [[0,18,21,64],[27,8,46,84],[79,18,21,64]], [[0,4,27,92],[31,18,38,64],[73,4,27,92]],
    [[2,48,25,48],[31,8,67,84],[2,4,25,36]], [[0,13,24,74],[29,5,42,90],[76,13,24,74]],
    [[4,20,27,62],[35,10,30,80],[69,20,27,62]], [[77,50,23,46],[0,3,71,94],[77,3,23,40]],
  ][i],
  stepKind:'rect',pad:'raised',radius:6,handle:'block',meter:20,ribbon:'wheel3d',matrix:'dot',
}));
