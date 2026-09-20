// Keep stable IDs so existing panels and pinned controls resolve after the design revision.
// The default gallery contains these twelve practical synthesizer directions.
export const PHYSICAL_DIRECTIONS = [
  ['brassworks','Vintage Mono','1970s / analogue','Wide skirted knobs, cream pointers, calibrated faders and mechanical rocker switches.','tolex','242321','333330','D8BA7F','vintage',.06],
  ['bakelite','Classic Poly','1980s / analogue','Fluted knobs with inset caps, rectangular slider grips and recessed square keys.','console','24262A','4A4D51','D99963','poly',.07],
  ['hi-fi','Studio Console','Studio / console','Turned aluminium caps, long line pointers, console faders and split stereo meters.','console','32383B','B6BCC0','99C5B2','console',.035],
  ['porcelain','Compact Analog','Desktop / compact','Small pale knobs with dark skirts, contrasting pointers and short, broad fader caps.','soft','D8D9D4','EBEBE5','477A83','compact',.12],
  ['flightdeck','Modular Metal','Modular / hardware','Narrow ribbed knobs, full printed scales, machined faders and compact latching switches.','machined','A9ACA9','363C3B','97523D','modular',.03],
  ['stompbox','Performance','Stage / soft touch','Deep rubber grips, clear pointer wedges, broad fader caps and resilient backlit pads.','carbon','242A2B','454E50','C7A764','rubber',.14],
  ['switchboard','Digital 1986','1980s / digital','Low disc encoders, fine index marks, slim faders and rectangular membrane keys.','phosphor','232932','505966','8CBDAC','digital',.025],
  ['chronograph','Precision','Instrument / aluminium','Fine knurling, inset aluminium faces, engraved scales and milled rectangular sliders.','machined','292D31','9EA8AE','D4BA8E','precision',.04],
  ['cassette-deck','Workstation','1990s / workstation','Broad encoders with grooved rims, coloured index windows and deep travel fader caps.','console','34383E','6D747B','D39576','workstation',.07],
  ['diesel','Modern Flat','Current / minimal','Matte circular knobs, single value arcs, slim rectangular sliders and clear state indicators.','graphite','1C242A','43515B','9DCAC4','flat',.08],
  ['gemstone','Glass Signal','Future / translucent','Restrained translucent dials, illuminated index lines, glass-edged faders and quiet backlighting.','frost','1E2A35','76949F','B5D9E1','glass',.1],
  ['leatherbound','Future Lab','Future / technical','Recessed encoders, segmented value rings, precision faders and compact illuminated keys.','obsidian','171D24','485969','91C9D4','future',.035],
].map(([id,name,title,detail,base,panel,face,accent,style,padRadius])=>({id,name,title,detail,base,panel,face,accent,style,padRadius,material:['console','precision','modular'].includes(style)?'brushed':'rubber',padLayout:'grid',physical:true,rotary:id,padForm:`physical-${id}`,stepKind:'rect',pad:'inset',radius:4,handle:'blade',meter:16,ribbon:'wheel3d',matrix:'dot'}));
