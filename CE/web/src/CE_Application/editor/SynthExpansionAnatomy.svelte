<script>
  import {SYNTH_EXPANSION} from '../models/synthExpansionSets.js';
  let {design,knob,meter,toggle,p,active,face,ink,accent,housing,legend,depth,size,detail,readout,label,showValue}=$props();
  const uid=$props.id(), paint=n=>`url(#${uid}-${n})`;
  let cfg=$derived(SYNTH_EXPANSION.find(d=>d.id===design));
  let angle=$derived(-135+p*270);
  const point=(a,r)=>[80+Math.sin(a*Math.PI/180)*r,76-Math.cos(a*Math.PI/180)*r];
  const arc=(r,to=135)=>`M${point(-135,r)}A${r} ${r} 0 ${to+135>180?1:0} 1 ${point(to,r)}`;
  const grip=(n,outer,inner)=>Array.from({length:n*4},(_,i)=>point(i*90/n,i%4<2?outer:inner).join(',')).join(' ');
</script>
<defs>
  <radialGradient id={`${uid}-cap`} cx=".32" cy=".2" r=".9"><stop stop-color="#fff" stop-opacity={depth*.45}/><stop offset=".3" stop-color={face}/><stop offset=".8" stop-color={face}/><stop offset="1" stop-color="#263238"/></radialGradient>
  <radialGradient id={`${uid}-dish`} cx=".7" cy=".85" r=".9"><stop stop-color="#eff3ee"/><stop offset=".4" stop-color={face}/><stop offset="1" stop-color="#485156"/></radialGradient>
  <linearGradient id={`${uid}-metal`} x2=".65" y2="1"><stop stop-color="#e5eae8"/><stop offset=".3" stop-color={face}/><stop offset=".53" stop-color="#c9d2d2"/><stop offset="1" stop-color="#38484c"/></linearGradient>
  <linearGradient id={`${uid}-edge`} x2=".1" y2="1"><stop stop-color="#9aa6aa"/><stop offset=".15" stop-color={face}/><stop offset="1" stop-color="#0e181e"/></linearGradient>
  <linearGradient id={`${uid}-well`} x2=".2" y2="1"><stop stop-color="#080e13"/><stop offset=".65" stop-color={housing}/><stop offset="1" stop-color="#5b6b73"/></linearGradient>
  <linearGradient id={`${uid}-lens`} x2=".5" y2="1"><stop stop-color="white" stop-opacity=".25"/><stop offset=".48" stop-color="white" stop-opacity=".02"/><stop offset=".5" stop-color="white" stop-opacity=".15"/><stop offset="1" stop-color={face} stop-opacity=".05"/></linearGradient>
</defs>
{#snippet ticks(r,base,numbers=false)}
  {@const n=Math.max(4,Math.round(base*detail/12))}
  {#each Array.from({length:n+1}) as _,i}<path d={`M80 ${76-r}v${i%2===0?5:2.5}`} transform={`rotate(${-135+i*270/n} 80 76)`} stroke={legend} stroke-width={i%2===0?1.2:.6} stroke-opacity=".7"/>{/each}
  {#if numbers}{#each [0,2,4,6,8,10] as i}{@const t=point(-135+i*27,r+11)}<text x={t[0]} y={t[1]+2.5} text-anchor="middle" fill={legend} font-size="6.5">{i}</text>{/each}{/if}
{/snippet}
{#if knob}
  <g transform={`translate(${80*(1-size)} ${76*(1-size)}) scale(${size})`} data-synth-profile={design}>
  {#if design==='heritage'}
    {@render ticks(65,10,true)}<circle cx="80" cy="81" r="49" fill="#111716"/><g transform={`rotate(${angle} 80 76)`}><polygon points={grip(12,49,45)} fill={paint('edge')} stroke="#6d7369"/><circle cx="80" cy="76" r="38" fill={paint('cap')} stroke="#e0e4d6"/><path d="M77 31h6v27h-6Z" fill="#4d5246"/><path d="M80 35v19" stroke={ink} stroke-width="2"/><circle cx="80" cy="76" r="26" fill="none" stroke="#a3a798" stroke-width=".7"/></g>
  {:else if design==='pinstripe'}
    {@render ticks(68,24,true)}<circle cx="80" cy="79" r="55" fill="#080d12"/><circle cx="80" cy="76" r="55" fill={paint('edge')}/><circle cx="80" cy="76" r="49" fill="#191e20" stroke="#7a8080" stroke-width=".8"/>
    <g transform={`rotate(${angle} 80 76)`}><circle cx="80" cy="76" r="36" fill={paint('cap')} stroke="#596263"/><path d="M77 23v36M83 23v36" stroke="#e7e2d0" stroke-width="2"/><path d="M73 60h14" stroke={accent} stroke-width="2"/></g>
  {:else if design==='dual-scale'}
    {@render ticks(68,20,true)}<circle cx="80" cy="81" r="53" fill="#0d1419"/><circle cx="80" cy="76" r="53" fill={paint('metal')}/><circle cx="80" cy="76" r="47" fill={housing}/>{@render ticks(44,10)}
    <g transform={`rotate(${angle} 80 76)`}><circle cx="80" cy="76" r="32" fill={paint('cap')} stroke="#b7c3c5" stroke-width="2"/><path d="M78 45h4v23h-4Z" fill={ink}/><path d="M77 25h6v12h-6Z" fill={accent}/><circle cx="80" cy="76" r="22" fill="none" stroke="#d3dbd9" stroke-opacity=".3"/></g>
  {:else if design==='broadcast'}
    {@render ticks(67,12)}<circle cx="80" cy="81" r="52" fill="#131c20"/><circle cx="80" cy="76" r="52" fill={paint('metal')} stroke="#acb8b9"/><circle cx="80" cy="76" r="42" fill={paint('dish')} stroke="#6f7e80" stroke-width="1.5"/>
    <g transform={`rotate(${angle} 80 76)`}><path d="M77 26h6v35h-6Z" fill="#253238"/><path d="M78 27h1v33h-1Z" fill="#8d9c9f"/></g><circle cx="80" cy="76" r="28" fill="none" stroke="#bdc8c6" stroke-opacity=".3"/>
  {:else if design==='compact-rack'}
    {@render ticks(53,10,true)}<rect x="45" y="37" width="70" height="80" rx="5" fill={paint('well')} stroke="#626f6e"/>
    <g transform={`rotate(${angle} 80 76)`}><polygon points={grip(10,33,28)} fill={paint('edge')} stroke="#172124"/><circle cx="80" cy="76" r="22" fill={paint('cap')}/><path d="M78 45h4v29h-4Z" fill="#edf0e5"/></g><path d="M59 112h42" stroke={accent} stroke-width="1.5"/>
  {:else if design==='recessed'}
    {@render ticks(66,12)}<circle cx="80" cy="76" r="55" fill={paint('well')} stroke={face} stroke-width="1.5"/><circle cx="80" cy="76" r="46" fill="#17232b"/><g transform={`rotate(${angle} 80 76)`}><circle cx="80" cy="76" r="37" fill={face} stroke="#8799a3" stroke-width=".7"/><path d="M73 35h14l-3 27h-8Z" fill={accent}/><path d="M53 90q27 13 54 0" fill="none" stroke="#21323b" stroke-width="3"/></g>
  {:else if design==='digital-grid'}
    <rect x="23" y="19" width="114" height="114" rx="4" fill={paint('well')} stroke={face}/>{#each Array.from({length:8}) as _,i}{@const t=point(-135+i*270/7,65)}<rect x={t[0]-2} y={t[1]-2} width="4" height="4" fill={legend} opacity=".7"/>{/each}<circle cx="80" cy="76" r="45" fill={paint('edge')}/><circle cx="80" cy="76" r="37" fill={face}/><path d="M77 35h6v24h-6Z" fill={accent} transform={`rotate(${angle} 80 76)`}/><path d="M44 122h72" stroke={face}/>
  {:else if design==='studio-white'}
    <path d={arc(65)} fill="none" stroke={legend} stroke-width=".8"/><path d={arc(60)} fill="none" stroke={legend} stroke-opacity=".35" stroke-width=".8"/>{@render ticks(71,6)}<circle cx="80" cy="80" r="48" fill="#aab3b0"/><circle cx="80" cy="76" r="48" fill={paint('cap')} stroke="#b8c3bf"/><circle cx="80" cy="76" r="40" fill={face}/><path d="M80 31V68" transform={`rotate(${angle} 80 76)`} stroke={accent} stroke-width="3"/>
  {:else if design==='arc-line'}
    <path d={arc(66)} fill="none" stroke={face} stroke-width="2"/><path d={arc(60,-135+Math.max(.001,p)*270)} fill="none" stroke={accent} stroke-width="2"/><circle cx="80" cy="76" r="38" fill={face}/><circle cx="80" cy="76" r="30" fill={housing}/><path d="M80 17V78" transform={`rotate(${angle} 80 76)`} stroke={accent} stroke-width="2"/><circle cx="80" cy="76" r="4" fill={accent}/>
  {:else if design==='edge-light'}
    {@render ticks(67,12)}<circle cx="80" cy="79" r="53" fill="#09141d"/><circle cx="80" cy="76" r="52" fill={paint('metal')}/><circle cx="80" cy="76" r="46" fill={housing}/><path d={arc(49,-135+Math.max(.001,p)*270)} fill="none" stroke={accent} stroke-width="3"/><circle cx="80" cy="76" r="39" fill={paint('cap')}/><path d="M78 30h4v27h-4Z" fill={accent} transform={`rotate(${angle} 80 76)`}/><circle cx="80" cy="76" r="39" fill={paint('lens')}/>
  {:else if design==='touch-encoder'}
    <circle cx="80" cy="76" r="57" fill="none" stroke={face} stroke-width="1"/><path d={arc(57,-135+Math.max(.001,p)*270)} fill="none" stroke={accent} stroke-width="3"/><circle cx="80" cy="76" r="46" fill={face}/><circle cx="80" cy="76" r="39" fill={housing}/>{@const tip=point(angle,57)}<circle cx={tip[0]} cy={tip[1]} r="4" fill={accent}/>{#if showValue}<text x="80" y="82" text-anchor="middle" fill={legend} font-size="16" font-family="monospace">{readout}</text>{:else}<path d="M67 76h26" stroke={accent}/>{/if}
  {:else if design==='carbon-pro'}
    {@render ticks(66,10)}<circle cx="80" cy="80" r="54" fill="#111b20"/><g transform={`rotate(${angle} 80 76)`}><polygon points={grip(8,53,44)} fill={paint('edge')} stroke="#1c2a2e" stroke-width="2"/><circle cx="80" cy="76" r="33" fill={paint('cap')} stroke="#748387" stroke-width=".7"/><path d="M74 28h12v31H74Z" fill="#263238"/><path d="M78 30h4v26h-4Z" fill={accent}/></g>
  {/if}
  </g>
  {#if showValue&&design!=='touch-encoder'}<text x="80" y="163" text-anchor="middle" fill={legend} font-size="12" font-family="monospace">{readout}</text>{/if}
{:else if meter}
  {@const mode=cfg.meterStyle}
  {#if mode==='needle'}
    <rect x="8" y="12" width="144" height="69" rx="3" fill={paint('edge')} stroke="#111a20"/><rect x="15" y="19" width="130" height="54" rx="2" fill="#d8d3be"/><path d="M25 48Q80 5 135 48" fill="none" stroke="#736b56"/>{#each [0,1,2,3,4,5,6] as i}<path d={`M${27+i*17.5} ${43-Math.sin(i*Math.PI/6)*19}v5`} stroke="#736b56"/>{/each}<path d="M80 67V23" transform={`rotate(${-55+p*110} 80 67)`} stroke="#9f573d" stroke-width="1.6"/><rect x="15" y="19" width="130" height="54" fill={paint('lens')}/>
  {:else}
    <rect x="6" y="20" width="148" height="54" rx={mode==='dots'?6:2} fill={paint('well')} stroke={face}/>
    {#each Array.from({length:['twin','split'].includes(mode)?2:1}) as _,row}
      {@const y=['twin','split'].includes(mode)?29+row*20:32}{@const height=['twin','split'].includes(mode)?12:28}
      {#if mode==='bar'||mode==='split'}<rect x="13" {y} width="134" {height} fill={face} opacity=".2"/><rect x="13" {y} width={134*p} {height} fill={accent}/><path d={`M${13+134*p} ${y-2}v${height+4}`} stroke={legend} stroke-width="1.2"/>
      {:else}{#each Array.from({length:16}) as _,i}<rect x={14+i*8.2} {y} width={mode==='dots'?4:5.5} height={mode==='dots'?4:height} rx={mode==='dots'?2:0} transform={mode==='dots'?'translate(0 12)':undefined} fill={i/16<p?accent:face} opacity={i/16<p?1:.25}/>{/each}{/if}
    {/each}<path d="M14 79h134" stroke={legend} stroke-opacity=".25"/>
  {/if}
  {#if showValue}<text x="80" y="98" fill={legend} text-anchor="middle" font-size="10" font-family="monospace">{readout}</text>{/if}
{:else}
  {@const type=cfg.key}{@const dy=active?3:0}
  {#if toggle&&type==='rocker'}
    <rect x="40" y="12" width="80" height="61" rx="4" fill={paint('well')} stroke={face}/><path d={active?'M46 27L114 18V57L46 66Z':'M46 18L114 27V66L46 57Z'} fill={paint('cap')} stroke="#889398" stroke-width=".7"/><path d={`M65 ${active?33:29}h30`} stroke={active?accent:ink} stroke-width="3"/>
  {:else if type==='piano'}
    <rect x="25" y="12" width="110" height="61" rx="2" fill="#0b151a"/><g transform={`translate(0 ${dy})`}><path d="M29 14h102v39l-6 15H35l-6-15Z" fill={paint('cap')} stroke={face}/><path d="M40 57h80" stroke={active?accent:ink} stroke-width="3"/></g>
  {:else if type==='status'}
    <rect x="22" y="13" width="87" height="59" rx="3" fill={paint('well')} stroke={face}/><rect x="27" y={16+dy} width="77" height="47" rx="2" fill={paint('cap')} stroke={ink} stroke-opacity=".4"/><rect x="121" y="22" width="13" height="39" rx="2" fill="#111b22" stroke={face}/><rect x="124" y={active?26:48} width="7" height="9" fill={active?accent:face}/>
  {:else if type==='slim'}
    <rect x="49" y="8" width="62" height="68" rx="4" fill={paint('well')} stroke={face}/><rect x="55" y={12+dy} width="50" height="55" rx="3" fill={paint('cap')}/><path d="M66 30h28" stroke={active?accent:ink} stroke-width="3"/>
  {:else}
    {@const flat=['touch','membrane','edge'].includes(type)}
    <rect x="20" y="14" width="120" height="60" rx={type==='inset'?9:2} fill={paint('well')} stroke={type==='edge'&&active?accent:face} stroke-width={type==='edge'?2:1}/>
    <g transform={`translate(0 ${flat?dy*.4:dy})`}><rect x="26" y="18" width="108" height="47" rx={type==='inset'?6:1} fill={flat?face:paint('cap')}/>
      {#if type==='membrane'}<rect x="32" y="24" width="96" height="34" fill="none" stroke={ink} stroke-opacity=".45" stroke-width=".7"/><rect x="39" y="30" width="5" height="5" fill={active?accent:housing}/>
      {:else if type==='edge'}<path d="M33 23h94M33 60h94" stroke={active?accent:ink} stroke-width="1.5"/>
      {:else if type==='touch'}<path d="M51 55h58" stroke={active?accent:housing} stroke-width="3"/>
      {:else}<path d="M38 23h84" stroke={ink} stroke-opacity=".2"/><rect x="66" y="28" width="28" height="4" rx="1" fill={active?accent:housing}/>{/if}
    </g>
  {/if}
  <text x="80" y="95" fill={legend} text-anchor="middle" font-size="11">{label}</text>
{/if}
