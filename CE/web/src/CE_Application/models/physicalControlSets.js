// Physical constructions share the standard gestures, but have different housings and actuators.
export const PHYSICAL_DIRECTIONS = [
  ['brassworks','Brassworks','Cast brass / valves','Cast valve wheel, piston keys, pressure gauge and bolted drum heads.','machined','243431','C5A15C','D69B60','brushed','porthole','grid'],
  ['bakelite','Bakelite','Moulded resin / radio','Chicken-head selectors, domed radio keys, amber tuning eye and fluted resin pads.','tolex','312523','795240','ECCF89','leather','petal','grid'],
  ['hi-fi','Hi-Fi','Turned aluminium / receiver','Coaxial aluminium dial, piano transport keys, stereo needle meters and bevelled key pads.','console','3D3028','D4CEC1','A8CA9A','brushed','pod','grid'],
  ['porcelain','Porcelain','Glazed ceramic / enamel','Ribbed porcelain selector, enamel rockers, glass tube meter and scalloped ceramic pads.','soft','DDD7CB','F5EFE3','568B86','glass','petal','stagger'],
  ['flightdeck','Flightdeck','Aircraft / throttle','Twin-rail throttle, safety-cage keys, drum altimeter and chamfered instrument pads.','field','262E32','83969B','F0B25D','blast','hex','grid'],
  ['stompbox','Stompbox','Pedalboard / cast alloy','Ratchet dial, sprung footswitch, LED portholes and resilient tread pads.','carbon','31463E','B6C1AF','EEC66D','hammer','shield','grid'],
  ['switchboard','Switchboard','Telephone / finger plate','Rotary finger plate, hook levers, moving flag gauge and saucer contact pads.','tolex','28262B','C3B599','DDA06A','leather','reel','grid'],
  ['chronograph','Chronograph','Watch / precision','Fluted watch bezel, crown pushers, jewel-bearing gauge and milled radial pads.','machined','202A37','CBD4DB','D6AA65','brushed','gear','grid'],
  ['cassette-deck','Cassette Deck','Tape / mechanical transport','Exposed thumbwheel, latching tape keys, twin tape reels and slotted transport pads.','console','C3B9A4','655E53','B24F34','blast','pod','stagger'],
  ['diesel','Diesel','Industrial / cast iron','T-handle regulator, bolted switch block, sight glass and heavy tread plates.','field','333733','84917C','F4B75D','hammer','hex','grid'],
  ['gemstone','Gemstone','Cut glass / jewel','Faceted crystal dial, prismatic keys, refracting column and diamond glass pads.','frost','1D303D','A9DCD8','F0BCBD','glass','diamond','grid'],
  ['leatherbound','Leatherbound','Leather / hand stitched','Strapped dial, cushioned leather keys, brass-cased gauge and stitched saddle pads.','tolex','42302A','A5734B','E8CC9F','leather','shield','stagger'],
].map(([id,name,title,detail,base,panel,face,accent,material,outline,padLayout])=>({id,name,title,detail,base,panel,face,accent,material,outline,padLayout,physical:true,rotary:id,padForm:`physical-${id}`,stepKind:'rect',pad:'raised',radius:7,handle:'block',meter:16,ribbon:'wheel3d',matrix:'dot'}));
