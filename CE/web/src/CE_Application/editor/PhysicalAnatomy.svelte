<script>
  import SynthExpansionAnatomy from './SynthExpansionAnatomy.svelte';
  import SculptedSynthAnatomy from './SculptedSynthAnatomy.svelte';
  import {PHYSICAL_DIRECTIONS} from '../models/physicalControlSets.js';
  let {design,knob,meter,toggle,p,active,face,ink,accent,housing,legend,depth,size,detail,readout,label,showValue}=$props();
  const uid=$props.id(), paint=name=>`url(#${uid}-${name})`;
  let style=$derived(PHYSICAL_DIRECTIONS.find(d=>d.id===design)?.style??'flat');
  let modern=$derived(['flat','glass','future','digital'].includes(style));
  let angle=$derived(-135+p*270);
  const pt=(a,r,cx=80,cy=76)=>[cx+Math.sin(a*Math.PI/180)*r,cy-Math.cos(a*Math.PI/180)*r];
  const arc=(r,to=135)=>{const a=pt(-135,r),b=pt(to,r);return `M${a}A${r} ${r} 0 ${to+135>180?1:0} 1 ${b}`;};
  const ribs=(n,r,inner)=>Array.from({length:n*4},(_,i)=>pt(i*90/n,i%4<2?r:inner).join(',')).join(' ');
</script>
<defs>
  <radialGradient id={`${uid}-cap`} cx=".35" cy=".2" r=".95"><stop stop-color="white" stop-opacity={depth*.34}/><stop offset=".35" stop-color={face}/><stop offset=".78" stop-color={face}/><stop offset="1" stop-color="#141819"/></radialGradient>
  <linearGradient id={`${uid}-metal`} x2=".8" y2="1"><stop stop-color="#e2e5e5"/><stop offset=".24" stop-color={face}/><stop offset=".5" stop-color="#e5e8e8"/><stop offset=".7" stop-color={face}/><stop offset="1" stop-color="#454c4e"/></linearGradient>
  <linearGradient id={`${uid}-edge`} x2=".2" y2="1"><stop stop-color="#9b9f9e"/><stop offset=".12" stop-color={face}/><stop offset="1" stop-color="#111719"/></linearGradient>
  <linearGradient id={`${uid}-well`} x2="0" y2="1"><stop stop-color="#090d0f"/><stop offset="1" stop-color={housing}/></linearGradient>
  <linearGradient id={`${uid}-glass`} x2=".65" y2="1"><stop stop-color="#eefaff" stop-opacity=".4"/><stop offset=".46" stop-color={face} stop-opacity=".1"/><stop offset=".49" stop-color="#e5f5ff" stop-opacity=".22"/><stop offset="1" stop-color={face} stop-opacity=".1"/></linearGradient>
</defs>
{#snippet scale(radius,count,numbers=false)}
  {#each Array.from({length:count+1}) as _,i}<path d={`M80 ${76-radius}v${i%2===0?5:2.5}`} transform={`rotate(${-135+i*270/count} 80 76)`} stroke={legend} stroke-opacity={modern?.45:.8} stroke-width={i%2===0?1.4:.75}/>{/each}
  {#if numbers}{#each [0,2,4,6,8,10] as n}{@const v=pt(-135+n*27,radius+12)}<text x={v[0]} y={v[1]+3} fill={legend} text-anchor="middle" font-size="7">{n}</text>{/each}{/if}
{/snippet}
{#if PHYSICAL_DIRECTIONS.find(d=>d.id===design)?.series===3}
  <SculptedSynthAnatomy {design} {knob} {meter} {toggle} {p} {active} {face} {ink} {accent} {housing} {legend} {depth} {size} {detail} {readout} {label} {showValue}/>
{:else if PHYSICAL_DIRECTIONS.find(d=>d.id===design)?.series===2}
  <SynthExpansionAnatomy {design} {knob} {meter} {toggle} {p} {active} {face} {ink} {accent} {housing} {legend} {depth} {size} {detail} {readout} {label} {showValue}/>
{:else if knob}
  <g transform={`translate(${80*(1-size)} ${76*(1-size)}) scale(${size})`} data-synth-profile={style}>
  {#if style==='vintage'}
    {@render scale(63,20,true)}<circle cx="80" cy="81" r="49" fill="#080b0d"/><circle cx="80" cy="76" r="49" fill={paint('edge')} stroke="#0a0c0d" stroke-width="2"/>
    <g transform={`rotate(${angle} 80 76)`}><circle cx="80" cy="76" r="41" fill={paint('cap')}/><circle cx="80" cy="76" r="28" fill="#30312e" stroke="#6a6b62"/><path d="M77 30h6v30h-6Z" fill="#e7ddbd"/><circle cx="80" cy="76" r="17" fill="none" stroke="#77796e" stroke-opacity=".25"/></g>
  {:else if style==='poly'}
    {@render scale(65,10)}<circle cx="80" cy="81" r="51" fill="#0d1012"/><g transform={`rotate(${angle} 80 76)`}><polygon points={ribs(12,51,47)} fill={paint('edge')} stroke="#111518" stroke-width="2"/><circle cx="80" cy="76" r="38" fill={paint('cap')} stroke="#666d70"/><path d="M77 28h6v29h-6Z" fill={accent}/><path d="M80 60v9" stroke={ink} stroke-width="2"/></g>
  {:else if style==='console'}
    {@render scale(67,20,true)}<circle cx="80" cy="80" r="49" fill="#13191b"/><circle cx="80" cy="76" r="49" fill={paint('edge')}/><g transform={`rotate(${angle} 80 76)`}><circle cx="80" cy="76" r="43" fill={paint('metal')} stroke="#d0d4d4"/><circle cx="80" cy="76" r="37" fill={paint('cap')}/><path d="M78 34h4v25h-4Z" fill="#20272b"/><circle cx="80" cy="76" r="27" fill="none" stroke="white" stroke-opacity=".15"/></g>
  {:else if style==='compact'}
    {@render scale(58,10)}<circle cx="80" cy="80" r="44" fill="#1f292c"/><g transform={`rotate(${angle} 80 76)`}><polygon points={ribs(7,42,38)} fill={paint('edge')} stroke="#777c79"/><circle cx="80" cy="76" r="34" fill={paint('cap')}/><path d="M77 38h6v28h-6Z" fill={accent}/></g>
  {:else if style==='modular'}
    {@render scale(57,20,true)}<circle cx="80" cy="81" r="37" fill="#3b4140"/><circle cx="80" cy="76" r="38" fill="#171e1f" stroke="#d4d7d1"/><g transform={`rotate(${angle} 80 76)`}><polygon points={ribs(8,37,31)} fill={paint('edge')} stroke="#111819"/><circle cx="80" cy="76" r="26" fill={paint('cap')}/><path d="M78 43h4v30h-4Z" fill="#e4e7de"/></g>
  {:else if style==='rubber'}
    {@render scale(66,10)}<circle cx="80" cy="81" r="52" fill="#111819"/><g transform={`rotate(${angle} 80 76)`}><polygon points={ribs(16,51,46)} fill={paint('edge')} stroke="#1b2426" stroke-width="2"/><circle cx="80" cy="76" r="38" fill={paint('cap')}/><path d="M74 28h12l-3 31h-6Z" fill={accent}/></g>
  {:else if style==='digital'}
    {@render scale(61,20)}<circle cx="80" cy="80" r="46" fill="#090d14"/><circle cx="80" cy="76" r="46" fill={paint('edge')}/><circle cx="80" cy="76" r="40" fill={face}/><rect x="78" y="34" width="4" height="19" transform={`rotate(${angle} 80 76)`} fill={accent}/><path d="M54 106h52" stroke="#1d2631" stroke-width="2"/>
  {:else if style==='precision'}
    {@render scale(68,24,true)}<circle cx="80" cy="80" r="50" fill="#111719"/><circle cx="80" cy="76" r="50" fill={paint('metal')}/>{#each Array.from({length:48}) as _,i}<path d="M80 27v7" transform={`rotate(${i*7.5} 80 76)`} stroke="#253136" stroke-opacity=".75"/>{/each}<g transform={`rotate(${angle} 80 76)`}><circle cx="80" cy="76" r="39" fill={paint('cap')} stroke="#ced6d8"/><path d="M80 38V64" stroke="#172127" stroke-width="2"/><circle cx="80" cy="76" r="32" fill="none" stroke="#dce1e1" stroke-opacity=".22"/></g>
  {:else if style==='workstation'}
    {@render scale(66,16)}<circle cx="80" cy="82" r="51" fill="#101519"/><g transform={`rotate(${angle} 80 76)`}><polygon points={ribs(24,50,47)} fill={paint('edge')} stroke="#131a20"/><circle cx="80" cy="76" r="39" fill={face} stroke="#839098"/><rect x="73" y="29" width="14" height="19" rx="2" fill={accent}/><path d="M80 32v12" stroke="#242b32" stroke-width="2"/></g>
  {:else if style==='flat'}
    <path d={arc(59)} fill="none" stroke={face} stroke-width="4"/><path d={arc(59,-135+Math.max(.001,p)*270)} fill="none" stroke={accent} stroke-width="4"/><circle cx="80" cy="76" r="46" fill={face}/><path d="M80 35v24" transform={`rotate(${angle} 80 76)`} stroke={ink} stroke-width="3"/>
  {:else if style==='glass'}
    {@render scale(67,12)}<circle cx="80" cy="78" r="52" fill={paint('well')}/><circle cx="80" cy="76" r="50" fill={face} fill-opacity=".28" stroke={face}/><path d={arc(55,-135+Math.max(.001,p)*270)} fill="none" stroke={accent} stroke-width="2.5"/><circle cx="80" cy="76" r="43" fill={paint('glass')} stroke="#dbeef6" stroke-opacity=".25"/><path d="M80 31v28" transform={`rotate(${angle} 80 76)`} stroke={accent} stroke-width="3"/>
  {:else if style==='future'}
    {#each Array.from({length:24}) as _,i}<path d="M80 13v7" transform={`rotate(${-135+i*270/23} 80 76)`} stroke={i/23<=p?accent:face} stroke-width="3"/>{/each}<circle cx="80" cy="78" r="49" fill="#090e15"/><circle cx="80" cy="76" r="46" fill={face} stroke="#7c929f" stroke-width=".8"/><circle cx="80" cy="76" r="39" fill={housing}/><path d="M78 32h4v22h-4Z" transform={`rotate(${angle} 80 76)`} fill={accent}/><path d="M57 107h46" stroke={face}/>
  {/if}
  </g>
  {#if showValue}<text x="80" y="163" text-anchor="middle" fill={legend} font-size="12" font-family="monospace">{readout}</text>{/if}
{:else if meter}
  {#if ['vintage','console'].includes(style)}
    <rect x="4" y="10" width="152" height="72" rx="3" fill={paint('edge')} stroke="#101719"/>
    {#each Array.from({length:style==='console'?2:1}) as _,i}{@const wide=style==='console'?68:138}{@const off=style==='console'?9+i*74:11}<g transform={`translate(${off} 17)`}><rect width={wide} height="56" rx="1" fill="#ded6bd"/><path d={`M8 29Q${wide/2} -3 ${wide-8} 29`} fill="none" stroke="#706553"/>{#each [0,1,2,3,4,5] as n}<path d={`M${10+n*(wide-20)/5} ${22-Math.sin(n*Math.PI/5)*10}v4`} stroke="#706553"/>{/each}<path d={`M${wide/2} 50V6`} transform={`rotate(${-47+p*94} ${wide/2} 50)`} stroke="#a5573e" stroke-width="1.8"/><rect width={wide} height="56" fill={paint('glass')}/></g>{/each}
  {:else}
    <rect x="5" y="22" width="150" height="46" rx={modern?3:5} fill={paint('well')} stroke={face}/>
    {#if style==='flat'||style==='glass'}<rect x="13" y="33" width="134" height="22" rx="2" fill={face} opacity=".3"/><rect x="13" y="33" width={134*p} height="22" rx="2" fill={accent}/>{:else}{#each Array.from({length:18}) as _,i}<rect x={13+i*7.5} y="32" width="5" height="24" rx={style==='rubber'?1.5:0} fill={i/18<p?accent:face} opacity={i/18<p?1:.22}/>{/each}{/if}
    {#each [0,1,2,3,4] as n}<path d={`M${13+n*33.5} 72v4`} stroke={legend} opacity=".5"/>{/each}{#if style==='glass'}<rect x="7" y="24" width="146" height="42" rx="3" fill={paint('glass')}/>{/if}
  {/if}
  {#if showValue}<text x="80" y="98" text-anchor="middle" fill={legend} font-size="10" font-family="monospace">{readout}</text>{/if}
{:else}
  {@const down=active?3:0}{@const radius=['rubber','compact'].includes(style)?10:modern?3:4}
  {#if toggle&&['vintage','poly','modular'].includes(style)}
    <rect x="47" y="9" width="66" height="64" rx="4" fill={paint('edge')} stroke="#131819"/><rect x="54" y="15" width="52" height="51" rx="3" fill="#0c1216"/><path d={active?'M58 26L102 18V57L58 63Z':'M58 18L102 26V63L58 57Z'} fill={paint('cap')} stroke={face}/><path d={`M70 ${active?33:29}h20`} stroke={active?accent:ink} stroke-width="3"/>
  {:else}
    <rect x="21" y="13" width="118" height="59" rx={radius+2} fill="#0c1114" stroke={modern?face:'#657073'} stroke-width=".8"/>
    <g transform={`translate(0 ${down})`}><rect x="25" y="14" width="110" height="51" rx={radius} fill={modern?face:paint('cap')} stroke={modern?'#657987':'#282e30'} stroke-width=".8"/>{#if ['console','precision','workstation'].includes(style)}<path d="M32 19h96M32 58h96" stroke={ink} stroke-opacity=".18"/>{/if}{#if style==='glass'}<rect x="26" y="15" width="108" height="49" rx="3" fill={paint('glass')}/>{/if}<rect x={toggle?49:67} y="25" width={toggle?62:26} height={modern?3:4} rx="1" fill={active?accent:housing}/><path d="M68 46h24" stroke={ink} stroke-opacity=".7" stroke-width="2"/></g>
  {/if}
  <text x="80" y="95" text-anchor="middle" fill={legend} font-size="11" font-family="sans-serif">{label}</text>
{/if}
