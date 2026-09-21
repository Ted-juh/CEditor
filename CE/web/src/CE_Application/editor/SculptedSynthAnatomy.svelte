<script>
  import {SYNTH_SCULPTED} from '../models/synthSculptedSets.js';
  let {design,knob,meter,toggle,p,active,face,ink,accent,housing,legend,depth,size,detail,readout,label,showValue}=$props();
  const uid=$props.id(), paint=n=>`url(#${uid}-${n})`;
  let cfg=$derived(SYNTH_SCULPTED.find(d=>d.id===design));
  let angle=$derived(-135+p*270);
  const point=(a,r,cx=80,cy=76)=>[cx+Math.sin(a*Math.PI/180)*r,cy-Math.cos(a*Math.PI/180)*r];
  const arc=(r,to=135)=>`M${point(-135,r)}A${r} ${r} 0 ${to+135>180?1:0} 1 ${point(to,r)}`;
  const star=(n,outer,inner,cx=80,cy=76)=>Array.from({length:n*2},(_,i)=>point(i*180/n,i%2?inner:outer,cx,cy).join(',')).join(' ');
</script>
<defs>
  <radialGradient id={`${uid}-dome`} cx=".3" cy=".18" r=".86"><stop stop-color="white" stop-opacity={.9*depth}/><stop offset=".22" stop-color={face}/><stop offset=".67" stop-color={face}/><stop offset="1" stop-color="#080d10"/></radialGradient>
  <radialGradient id={`${uid}-dish`} cx=".66" cy=".76" r=".88"><stop stop-color="#11191c"/><stop offset=".42" stop-color={face}/><stop offset=".72" stop-color="#dce4e1" stop-opacity={.7*depth}/><stop offset="1" stop-color="#202a2e"/></radialGradient>
  <linearGradient id={`${uid}-side`} x2="0" y2="1"><stop stop-color={face}/><stop offset=".25" stop-color="#1b2427"/><stop offset="1" stop-color="#05090b"/></linearGradient>
  <linearGradient id={`${uid}-metal`} x2=".8" y2="1"><stop stop-color="#f6faf8" stop-opacity={.85*depth}/><stop offset=".24" stop-color={face}/><stop offset=".48" stop-color="#4c5b5e"/><stop offset=".7" stop-color={face}/><stop offset="1" stop-color="#11191c"/></linearGradient>
  <linearGradient id={`${uid}-glass`} x2=".2" y2="1"><stop stop-color="white" stop-opacity={.65*depth}/><stop offset=".32" stop-color={face} stop-opacity=".72"/><stop offset=".62" stop-color={housing} stop-opacity=".55"/><stop offset="1" stop-color="#071117" stop-opacity=".9"/></linearGradient>
  <filter id={`${uid}-shadow`} x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy={5+depth*6} stdDeviation={2+depth*3} flood-color="#000" flood-opacity={.55+.3*depth}/></filter>
  <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
{#snippet scale(r,count,numbers=false)}
  {@const n=Math.max(5,Math.round(count*detail/12))}
  {#each Array.from({length:n+1}) as _,i}<path d={`M80 ${76-r}v${i%2===0?6:3}`} transform={`rotate(${-135+i*270/n} 80 76)`} stroke={legend} stroke-width={i%2===0?1.4:.7} stroke-opacity=".8"/>{/each}
  {#if numbers}{#each [0,2,4,6,8,10] as n}{@const t=point(-135+n*27,r+12)}<text x={t[0]} y={t[1]+2.5} text-anchor="middle" fill={legend} font-size="6.5">{n}</text>{/each}{/if}
{/snippet}
{#if knob}
  <g transform={`translate(${80*(1-size)} ${76*(1-size)}) scale(${size})`} data-synth-profile={design}>
    {#if design==='valve-console'}
      {@render scale(67,10,true)}<ellipse cx="80" cy="87" rx="52" ry="45" fill="#07090a" opacity=".8"/><ellipse cx="80" cy="82" rx="52" ry="44" fill={paint('side')}/><ellipse cx="80" cy="75" rx="48" ry="41" fill={accent} opacity=".55"/>
      <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><ellipse cx="80" cy="79" rx="40" ry="38" fill="#130f0d"/><circle cx="80" cy="72" r="40" fill={paint('dome')} stroke="#796552" stroke-width="2"/><path d="M76 28h8v34h-8Z" fill="#eee1bd"/><path d="M80 31v28" stroke="#4b3b2e" stroke-width="2"/><ellipse cx="68" cy="54" rx="10" ry="16" fill="white" opacity={.16*depth}/></g>
    {:else if design==='chicken-head'}
      {@render scale(69,20,true)}<circle cx="80" cy="81" r="51" fill="#0b0d0d"/><circle cx="80" cy="76" r="51" fill={paint('metal')} stroke={accent}/>
      <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><path d="M80 17L96 68Q101 82 90 91Q80 101 70 91Q59 82 64 68Z" fill={paint('dome')} stroke="#26211d" stroke-width="2"/><path d="M80 22L84 66" stroke={accent} stroke-width="3"/><ellipse cx="75" cy="75" rx="8" ry="13" fill="white" opacity={.16*depth}/></g>
    {:else if design==='turret-stack'}
      {@render scale(69,24,true)}<ellipse cx="80" cy="91" rx="53" ry="33" fill="#070b0d"/><ellipse cx="80" cy="84" rx="53" ry="32" fill={paint('side')}/><ellipse cx="80" cy="76" rx="49" ry="30" fill={paint('metal')}/>
      <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><ellipse cx="80" cy="77" rx="39" ry="32" fill="#293437"/><ellipse cx="80" cy="68" rx="39" ry="31" fill={paint('metal')} stroke="#d9dfdd"/><ellipse cx="80" cy="65" rx="27" ry="23" fill={paint('dome')}/><ellipse cx="80" cy="61" rx="15" ry="13" fill={face}/><path d="M78 37h4v29h-4Z" fill={ink}/></g>
    {:else if design==='deep-flute'}
      {@render scale(67,12)}<ellipse cx="80" cy="86" rx="55" ry="47" fill="#080d0e"/><g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><polygon points={star(12,54,42)} fill={paint('side')} stroke="#101719" stroke-width="2"/><polygon points={star(12,45,37)} fill={paint('dome')} stroke="#718083"/><circle cx="80" cy="76" r="28" fill={face}/><path d="M73 25h14l-4 35h-6Z" fill={accent}/><path d="M80 28v28" stroke="#f5e6c4" stroke-opacity=".45"/></g>
    {:else if design==='concave-studio'}
      {@render scale(69,16,true)}<ellipse cx="80" cy="87" rx="54" ry="43" fill="#0a1012"/><ellipse cx="80" cy="80" rx="54" ry="42" fill={paint('side')}/><circle cx="80" cy="73" r="49" fill={paint('metal')} stroke="#e5eae7"/>
      <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><circle cx="80" cy="73" r="41" fill={paint('dish')} stroke="#536064" stroke-width="2"/><ellipse cx="80" cy="78" rx="28" ry="22" fill="#172126" opacity=".72"/><path d="M78 31h4v29h-4Z" fill={accent}/><path d="M55 59q25-18 50 0" fill="none" stroke="white" stroke-opacity={.3*depth}/></g>
    {:else if design==='hex-drive'}
      {@render scale(67,12,true)}<polygon points="80,22 129,49 129,103 80,130 31,103 31,49" fill="#070b0d" transform="translate(0 7)"/><g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><polygon points="80,22 129,49 129,103 80,130 31,103 31,49" fill={paint('metal')} stroke="#cbd2cf" stroke-width="2"/><polygon points="80,34 118,55 118,97 80,118 42,97 42,55" fill={face} stroke="#354044"/><polygon points="80,48 104,61 104,88 80,102 56,88 56,61" fill={paint('dome')}/><path d="M78 27h4v34h-4Z" fill={accent}/></g>
    {:else if design==='coin-edge'}
      {@render scale(69,24,true)}<ellipse cx="80" cy="85" rx="52" ry="42" fill="#080d0f"/><g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><polygon points={star(36,52,48)} fill={paint('metal')} stroke="#2d393d"/><circle cx="80" cy="76" r="43" fill={paint('dome')} stroke="#dbe0dd"/><circle cx="80" cy="76" r="35" fill={face}/><path d="M79 30h2v34h-2Z" fill={ink}/><path d="M75 30h10" stroke={accent} stroke-width="2"/></g>
    {:else if design==='gimbal-ring'}
      {@render scale(70,12,true)}<ellipse cx="80" cy="86" rx="56" ry="48" fill="#070c0f"/><circle cx="80" cy="76" r="55" fill="none" stroke={paint('metal')} stroke-width="9" filter={paint('shadow')}/><g transform={`rotate(${angle} 80 76)`}><ellipse cx="80" cy="76" rx="44" ry="28" fill="none" stroke={face} stroke-width="7"/><ellipse cx="80" cy="76" rx="27" ry="42" fill="none" stroke={accent} stroke-opacity=".7" stroke-width="4"/><circle cx="80" cy="76" r="24" fill={paint('dome')} stroke="#d7e2e3"/><path d="M78 49h4v20h-4Z" fill={ink}/><circle cx="36" cy="76" r="4" fill={accent}/><circle cx="124" cy="76" r="4" fill={accent}/></g>
    {:else if design==='lever-dial'}
      {@render scale(70,20,true)}<ellipse cx="80" cy="86" rx="52" ry="42" fill="#080c0d"/><circle cx="80" cy="76" r="52" fill={paint('metal')} stroke="#bfc4bc"/><circle cx="80" cy="76" r="37" fill={housing} stroke={face}/>
      <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><circle cx="80" cy="76" r="18" fill={paint('dome')} stroke="#d7ddda"/><path d="M72 73V25Q72 17 80 17Q88 17 88 25V73Z" fill={paint('metal')} stroke="#20292b"/><path d="M80 21v39" stroke={accent} stroke-width="3"/><ellipse cx="76" cy="38" rx="3" ry="13" fill="white" opacity={.3*depth}/></g>
    {:else if design==='castellated'}
      {@render scale(68,12)}<ellipse cx="80" cy="88" rx="56" ry="45" fill="#070b0c"/><g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><polygon points={star(8,56,43)} fill={paint('side')} stroke="#101719" stroke-width="3"/><circle cx="80" cy="76" r="39" fill={paint('dome')} stroke="#6b7879"/><circle cx="80" cy="76" r="29" fill={face}/><path d="M73 24h14v37H73Z" fill="#1c2527"/><path d="M78 26h4v32h-4Z" fill={accent}/></g>
    {:else if design==='floating-halo'}
      {@render scale(70,16)}<circle cx="80" cy="79" r="57" fill="none" stroke={accent} stroke-width="5" opacity=".42" filter={paint('glow')}/><ellipse cx="80" cy="91" rx="45" ry="27" fill="#03070a" opacity=".9"/><g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><ellipse cx="80" cy="78" rx="45" ry="39" fill={paint('side')}/><circle cx="80" cy="68" r="43" fill={paint('glass')} stroke={accent} stroke-opacity=".7"/><circle cx="80" cy="68" r="34" fill={face}/><path d="M78 26h4v27h-4Z" fill={accent}/><path d="M52 49q28-18 56 0" fill="none" stroke="white" stroke-opacity={.28*depth}/></g>
    {:else if design==='prism-cap'}
      {@render scale(69,12,true)}<ellipse cx="80" cy="88" rx="54" ry="43" fill="#071016"/><g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><polygon points={star(12,52,49)} fill={paint('glass')} stroke="#d7f0f0" stroke-opacity=".7"/><polygon points="80,27 105,34 125,55 130,80 117,105 95,124 68,126 43,110 29,86 34,58 54,37" fill={face} fill-opacity=".45" stroke="white" stroke-opacity=".35"/><path d="M80 27L95 68L125 55M80 27L66 68L34 58M66 68L43 110M95 68L117 105M66 68L95 68L80 105Z" fill="none" stroke="white" stroke-opacity={.28*depth}/><path d="M78 28h4v32h-4Z" fill={accent}/></g>
    {/if}
  </g>
  {#if showValue}<text x="80" y="164" text-anchor="middle" fill={legend} font-size="12" font-family="monospace">{readout}</text>{/if}
{:else if meter}
  <g filter={paint('shadow')}><rect x="7" y="11" width="146" height="70" rx={cfg.meterStyle==='needle'?5:10} fill={paint('side')} stroke={face}/><rect x="14" y="17" width="132" height="54" rx="4" fill={cfg.meterStyle==='needle'?'#d9d2b8':housing}/>
  {#if cfg.meterStyle==='needle'}<path d="M24 49Q80 5 136 49" fill="none" stroke="#736b56"/><path d="M80 67V23" transform={`rotate(${-55+p*110} 80 67)`} stroke={accent} stroke-width="2"/>
  {:else}{#each Array.from({length:16}) as _,i}<rect x={18+i*7.7} y={cfg.meterStyle==='split'&&i%2?43:29} width="5" height={cfg.meterStyle==='dots'?5:24} rx={cfg.meterStyle==='dots'?2.5:1} fill={i/16<p?accent:face} opacity={i/16<p?1:.2}/>{/each}{/if}<path d="M18 20h124" stroke="white" stroke-opacity={.16*depth}/></g>
  {#if showValue}<text x="80" y="98" fill={legend} text-anchor="middle" font-size="10" font-family="monospace">{readout}</text>{/if}
{:else}
  {@const dy=active?4:0}{@const type=cfg.key}
  <g filter={paint('shadow')}><rect x="20" y="13" width="120" height="62" rx={type==='lens'?12:5} fill={paint('side')} stroke={face}/><g transform={`translate(0 ${dy})`}>
    {#if type==='piano'}<path d="M27 15H133V52L126 68H34L27 52Z" fill={paint('dome')} stroke="#171b1b"/>
    {:else if type==='rocker'}<path d={active?'M27 29L133 17V57L27 68Z':'M27 17L133 29V68L27 57Z'} fill={paint('dome')} stroke="#283033"/>
    {:else if type==='guard'}<rect x="27" y="18" width="106" height="49" rx="2" fill={paint('metal')}/><path d="M35 63L45 22M125 63L115 22" stroke={accent} stroke-width="3"/>
    {:else if type==='frame'}<rect x="28" y="19" width="104" height="47" rx="8" fill="none" stroke={paint('metal')} stroke-width="7"/><rect x="43" y="26" width="74" height="33" rx="4" fill={face}/>
    {:else if type==='edge'}<rect x="27" y="19" width="106" height="47" rx="5" fill={paint('glass')} stroke={active?accent:face} stroke-width="3"/>
    {:else if type==='lens'}<rect x="27" y="19" width="106" height="47" rx="12" fill={paint('glass')} stroke="white" stroke-opacity=".4"/><path d="M38 26Q80 15 122 26" fill="none" stroke="white" stroke-opacity=".35"/>
    {:else}<rect x="27" y="18" width="106" height="49" rx={type==='inset'?8:3} fill={paint('dome')} stroke="#172023"/>
    {/if}<path d="M55 55h50" stroke={active?accent:ink} stroke-width="3"/></g></g>
  <text x="80" y="96" fill={legend} text-anchor="middle" font-size="11">{label}</text>
{/if}
