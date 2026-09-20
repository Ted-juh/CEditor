<script>
  import {PHYSICAL_DIRECTIONS} from '../models/physicalControlSets.js';
  let {design,path,w,h,face,ink,accent,active,echo,depth}=$props();
  const uid=$props.id();
  let style=$derived(PHYSICAL_DIRECTIONS.find(d=>d.id===design)?.style??'flat');
  let flat=$derived(['flat','digital','future'].includes(style));
  const paint=n=>`url(#${uid}-${n})`;
</script>
<defs>
  <linearGradient id={`${uid}-edge`} x2=".1" y2="1"><stop stop-color="#7b8589"/><stop offset=".15" stop-color="#131a1d"/><stop offset="1" stop-color="#10181c"/></linearGradient>
  <linearGradient id={`${uid}-cap`} x2=".2" y2="1"><stop stop-color="#eef2ef" stop-opacity={depth*.35}/><stop offset=".18" stop-color={face}/><stop offset=".83" stop-color={face}/><stop offset="1" stop-color="#1b2428"/></linearGradient>
  <clipPath id={`${uid}-clip`}><path d={path}/></clipPath>
</defs>
<path d={path} fill={flat?'#10181d':paint('edge')} stroke={echo?accent:face} stroke-width={echo?2:.7}/>
<g clip-path={paint('clip')}><g transform={`translate(${w*.055} ${h*(active?.11:.045)}) scale(.89 .85)`}>
  <path d={path} transform={`translate(0 ${flat?0:h*.045})`} fill="#090f13"/><path d={path} fill={active?accent:flat?face:paint('cap')} stroke={active?accent:face} stroke-width=".6"/>
  {#if style==='rubber'}<path d={`M${w*.14} ${h*.17}H${w*.86}M${w*.14} ${h*.82}H${w*.86}`} stroke={ink} stroke-opacity=".18" stroke-width="2"/>{/if}
  {#if style==='console'||style==='precision'}<path d={`M${w*.1} ${h*.13}H${w*.9}`} stroke="white" stroke-opacity=".28"/>{/if}
  {#if style==='glass'}<path d={`M0 0H${w}V${h*.37}L0 ${h*.62}Z`} fill="white" opacity=".09"/>{/if}
  <path d={`M${w*.36} ${h*.84}H${w*.64}`} stroke={active?ink:accent} stroke-opacity={active?1:.7} stroke-width={Math.max(1,Math.min(w,h)*.025)}/>
</g></g>
