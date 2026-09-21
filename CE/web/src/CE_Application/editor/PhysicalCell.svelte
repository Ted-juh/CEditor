<script>
  import {PHYSICAL_DIRECTIONS} from '../models/physicalControlSets.js';
  let {design,path,w,h,face,ink,accent,active,echo,depth}=$props();
  const uid=$props.id();
  let style=$derived(PHYSICAL_DIRECTIONS.find(d=>d.id===design)?.style??'flat');
  let finish=$derived(PHYSICAL_DIRECTIONS.find(d=>d.id===design)?.finish);
  let profile=$derived(PHYSICAL_DIRECTIONS.find(d=>d.id===design)?.padProfile);
  let sculpted=$derived(PHYSICAL_DIRECTIONS.find(d=>d.id===design)?.series===3);
  let flat=$derived(finish==='flat'||['flat','digital','future'].includes(style));
  const paint=n=>`url(#${uid}-${n})`;
</script>
<defs>
  <linearGradient id={`${uid}-edge`} x2=".1" y2="1"><stop stop-color="#7b8589"/><stop offset=".15" stop-color="#131a1d"/><stop offset="1" stop-color="#10181c"/></linearGradient>
  <linearGradient id={`${uid}-cap`} x2=".2" y2="1"><stop stop-color="#eef2ef" stop-opacity={depth*.35}/><stop offset=".18" stop-color={face}/><stop offset=".83" stop-color={face}/><stop offset="1" stop-color="#1b2428"/></linearGradient>
  <clipPath id={`${uid}-clip`}><path d={path}/></clipPath>
  <radialGradient id={`${uid}-pad-dome`} cx=".3" cy=".18" r=".9"><stop stop-color="white" stop-opacity={depth*.62}/><stop offset=".35" stop-color={face}/><stop offset="1" stop-color="#0b1114"/></radialGradient>
  <radialGradient id={`${uid}-pad-dish`} cx=".65" cy=".8" r=".9"><stop stop-color="#0b1114"/><stop offset=".5" stop-color={face}/><stop offset="1" stop-color="white" stop-opacity={depth*.38}/></radialGradient>
  <filter id={`${uid}-pad-shadow`} x="-30%" y="-30%" width="170%" height="190%"><feDropShadow dx="0" dy={Math.max(2,h*.06)} stdDeviation={Math.max(1,Math.min(w,h)*.035)} flood-color="#000" flood-opacity=".75"/></filter>
</defs>
<path d={path} transform={sculpted?`translate(0 ${h*.065})`:undefined} fill="#070b0d" opacity={sculpted?.85:1} filter={sculpted?paint('pad-shadow'):undefined}/>
<path d={path} fill={flat?'#10181d':paint('edge')} stroke={echo?accent:face} stroke-width={echo?2:.7}/>
<g clip-path={paint('clip')}><g transform={`translate(${w*.055} ${h*(active?.11:.045)}) scale(.89 .85)`}>
  <path d={path} transform={`translate(0 ${flat?0:h*.045})`} fill="#090f13"/><path d={path} fill={active?accent:profile==='concave'?paint('pad-dish'):sculpted?paint('pad-dome'):flat?face:paint('cap')} stroke={active?accent:face} stroke-width=".6"/>
  {#if style==='rubber'||finish==='rubber'}<path d={`M${w*.14} ${h*.17}H${w*.86}M${w*.14} ${h*.82}H${w*.86}`} stroke={ink} stroke-opacity=".18" stroke-width="2"/>{/if}
  {#if style==='console'||style==='precision'||finish==='metal'}<path d={`M${w*.1} ${h*.13}H${w*.9}`} stroke="white" stroke-opacity=".28"/>{/if}
  {#if style==='glass'||finish==='glass'}<path d={`M0 0H${w}V${h*.37}L0 ${h*.62}Z`} fill="white" opacity=".09"/>{/if}
  {#if profile==='pointer'}<path d={`M${w*.18} ${h*.72}L${w*.8} ${h*.2}L${w*.66} ${h*.76}Z`} fill={ink} opacity=".22"/>
  {:else if profile==='turret'}<rect x={w*.16} y={h*.2} width={w*.68} height={h*.62} rx={Math.min(w,h)*.12} fill="none" stroke={ink} stroke-opacity=".28" stroke-width="3"/><rect x={w*.28} y={h*.3} width={w*.44} height={h*.42} rx={Math.min(w,h)*.08} fill="none" stroke="white" stroke-opacity=".18"/>
  {:else if profile==='flute'}{#each Array.from({length:7}) as _,i}<path d={`M${w*(.16+i*.11)} ${h*.17}V${h*.83}`} stroke={i%2?ink:'white'} stroke-opacity={i%2?.24:.12} stroke-width="2"/>{/each}
  {:else if profile==='concave'}<ellipse cx={w*.5} cy={h*.53} rx={w*.28} ry={h*.25} fill="none" stroke={ink} stroke-opacity=".32" stroke-width="3"/>
  {:else if profile==='hex'}<path d={`M${w*.5} ${h*.16}L${w*.82} ${h*.34}V${h*.68}L${w*.5} ${h*.86}L${w*.18} ${h*.68}V${h*.34}Z`} fill="none" stroke={ink} stroke-opacity=".34" stroke-width="3"/>
  {:else if profile==='coin'}{#each Array.from({length:10}) as _,i}<path d={`M${w*(.12+i*.085)} ${h*.14}V${h*.27}M${w*(.12+i*.085)} ${h*.73}V${h*.86}`} stroke={ink} stroke-opacity=".35"/>{/each}
  {:else if profile==='gimbal'}<ellipse cx={w*.5} cy={h*.5} rx={w*.31} ry={h*.19} fill="none" stroke={ink} stroke-opacity=".3" stroke-width="3"/><ellipse cx={w*.5} cy={h*.5} rx={w*.16} ry={h*.31} fill="none" stroke={accent} stroke-opacity=".35" stroke-width="2"/>
  {:else if profile==='lever'}<path d={`M${w*.22} ${h*.68}L${w*.72} ${h*.2}`} stroke={ink} stroke-opacity=".3" stroke-width={Math.min(w,h)*.12} stroke-linecap="round"/>
  {:else if profile==='castle'}<path d={`M${w*.13} ${h*.3}H${w*.24}V${h*.17}H${w*.38}V${h*.3}H${w*.62}V${h*.17}H${w*.76}V${h*.3}H${w*.87}`} fill="none" stroke={ink} stroke-opacity=".35" stroke-width="3"/>
  {:else if profile==='halo'}<rect x={w*.13} y={h*.14} width={w*.74} height={h*.72} rx={Math.min(w,h)*.25} fill="none" stroke={accent} stroke-opacity={active?.95:.48} stroke-width="3"/>
  {:else if profile==='prism'}<path d={`M${w*.5} ${h*.11}L${w*.86} ${h*.5}L${w*.5} ${h*.89}L${w*.14} ${h*.5}ZM${w*.5} ${h*.11}V${h*.89}M${w*.14} ${h*.5}H${w*.86}`} fill="none" stroke="white" stroke-opacity=".26" stroke-width="2"/>
  {/if}
  <path d={`M${w*.36} ${h*.84}H${w*.64}`} stroke={active?ink:accent} stroke-opacity={active?1:.7} stroke-width={Math.max(1,Math.min(w,h)*.025)}/>
</g></g>
