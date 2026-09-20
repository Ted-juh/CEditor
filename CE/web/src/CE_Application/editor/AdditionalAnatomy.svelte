<script>
  let { design, knob, meter, toggle, p, active, face, ink, accent, housing, legend, depth, size, detail, readout, label, showValue } = $props();
  const uid=$props.id();
  let angle=$derived(-135+p*270);
  const pt=(a,r,x=80,y=76)=>[x+Math.sin(a*Math.PI/180)*r,y-Math.cos(a*Math.PI/180)*r];
  const teeth=(n,r=61)=>Array.from({length:n*4},(_,i)=>pt(i*90/n,i%4<2?r:r-9).join(',')).join(' ');
</script>

<defs>
  <radialGradient id={`${uid}-glaze`} cx=".3" cy=".2"><stop stop-color="white" stop-opacity={depth}/><stop offset=".6" stop-color={face}/><stop offset="1" stop-color={housing}/></radialGradient>
  <linearGradient id={`${uid}-fold`} x2="1" y2="0"><stop stop-color={face}/><stop offset=".5" stop-color={ink} stop-opacity={depth*.6}/><stop offset="1" stop-color={face}/></linearGradient>
</defs>
{#if knob}
  <g transform={`translate(${80*(1-size)} ${76*(1-size)}) scale(${size})`}>
    {#if design==='atlas'}
      <circle cx="80" cy="76" r="43" fill="none" stroke={face} stroke-width="12"/>
      <g transform={`rotate(${angle} 80 76)`}>
        {#each Array.from({length:8}) as _,i}<g transform={`rotate(${i*45} 80 76)`}><path d="M80 76V14" stroke={face} stroke-width="7"/><rect x="75" y="7" width="10" height="20" rx="4" fill={accent}/></g>{/each}
        <circle cx="80" cy="76" r="15" fill={face} stroke={ink}/><path d="M80 58L86 75H74Z" fill={ink}/>
      </g><path d="M80 0L85 7H75Z" fill={legend}/>
    {:else if design==='kiln'}
      <ellipse cx="80" cy="95" rx="63" ry="42" fill={housing}/><ellipse cx="80" cy="78" rx="61" ry="48" fill={face} stroke={ink}/><ellipse cx="80" cy="64" rx="49" ry="36" fill={`url(#${uid}-glaze)`}/>
      <g transform={`rotate(${angle} 80 64)`}><path d="M76 61L80 29 85 61Z" fill={accent}/><circle cx="80" cy="64" r="8" fill={face}/></g><path d="M32 109Q80 135 128 109" fill="none" stroke={accent} stroke-width="3"/>
    {:else if design==='arcade'}
      <path d="M39 18H121L146 43V111L121 136H39L14 111V43Z" fill={face} stroke={ink} stroke-width="4"/><path d="M80 42V110M46 76H114" stroke={ink} stroke-width="6"/>
      {@const tip=pt(angle,31)}<path d={`M80 83L${tip[0]} ${tip[1]}`} stroke={housing} stroke-width="14"/><circle cx={tip[0]} cy={tip[1]} r="22" fill={accent} stroke={ink} stroke-width="3"/><ellipse cx={tip[0]-6} cy={tip[1]-8} rx="7" ry="4" fill="white" opacity={depth}/>
    {:else if design==='spool'}
      <g transform={`rotate(${angle} 80 76)`}><circle cx="80" cy="76" r="64" fill={face} stroke={ink} stroke-width="2"/><circle cx="80" cy="76" r="52" fill={housing}/>
      {#each [0,120,240] as a}<path d="M73 70L64 18Q94 8 115 35L86 81Z" fill={face} transform={`rotate(${a} 80 76)`}/>{/each}<circle cx="80" cy="76" r="19" fill={face}/><circle cx="80" cy="76" r="7" fill={accent}/><circle cx="80" cy="20" r="5" fill={accent}/></g>
    {:else if design==='tessera'}
      <path d="M18 14H142V138H18Z" fill="none" stroke={ink}/><g transform={`rotate(${angle} 80 76)`}><rect x="39" y="35" width="82" height="82" fill={face} stroke={ink} stroke-width="3"/><rect x="56" y="52" width="48" height="48" fill={housing}/><path d="M80 35V52H104V76H121V35Z" fill={accent}/></g>
      {#each [0,1,2,3] as i}<rect x={22+i*31} y="143" width="23" height="4" fill={accent} opacity={p>i/4?1:.2}/>{/each}
    {:else if design==='bellows'}
      {@const length=48+p*70}<rect x="12" y="33" width="18" height="85" rx="5" fill={ink}/>
      {#each Array.from({length:8}) as _,i}<path d={`M${30+i*length/8} 41l${length/16} -10 ${length/16} 10v65l-${length/16} 12 -${length/16} -12Z`} fill={`url(#${uid}-fold)`} stroke={ink}/>{/each}
      <rect x={30+length} y="33" width="16" height="85" rx="5" fill={accent}/><path d="M20 131H149" stroke={legend}/>
    {:else if design==='helix'}
      <path d="M31 19V130M129 19V130" stroke={ink} stroke-width="9"/><rect x="37" y="29" width="86" height="94" fill={face} stroke={ink}/>
      {#each Array.from({length:8}) as _,i}<path d={`M38 ${31+i*11}L121 ${47+i*9}`} stroke={ink} opacity=".6" stroke-width="3"/>{/each}<rect x={38+p*61} y="17" width="22" height="116" rx="5" fill={accent} stroke={ink}/><path d={`M${49+p*61} 48V94`} stroke={face} stroke-width="4"/>
    {:else if design==='iris'}
      <circle cx="80" cy="76" r="65" fill={housing} stroke={ink} stroke-width="4"/>
      {#each Array.from({length:7}) as _,i}<path d={`M80 16Q140 25 139 87L${80+10+p*24} ${76-10-p*24}Z`} transform={`rotate(${i*360/7+p*24} 80 76)`} fill={face} stroke={ink}/>{/each}
      <circle cx="80" cy="76" r={9+p*25} fill={housing} stroke={accent} stroke-width="2"/>
    {:else if design==='balance'}
      <path d="M57 133L80 58 103 133Z" fill={face} stroke={ink} stroke-width="3"/><path d="M32 137H128" stroke={ink} stroke-width="6"/>
      <g transform={`rotate(${-25+p*50} 80 58)`}><path d="M13 58H147" stroke={ink} stroke-width="7"/><path d="M28 58V83M132 58V83" stroke={legend}/><path d="M8 83H48L40 105H16Z" fill={face} stroke={ink}/><rect x="116" y="77" width="31" height="39" rx="3" fill={accent}/></g><circle cx="80" cy="58" r="9" fill={accent}/>
    {:else if design==='satellite'}
      <path d="M22 136H138L114 119H46Z" fill={face}/><path d="M79 121L59 91 93 60" fill="none" stroke={ink} stroke-width="12"/><circle cx="59" cy="91" r="10" fill={accent}/>
      <g transform={`rotate(${-50+p*100} 93 60)`}><path d="M42 40Q93 128 144 40Z" fill={face} stroke={ink} stroke-width="2"/><path d="M93 77V21M42 40Q93 56 144 40" fill="none" stroke={ink} stroke-width="2"/><circle cx="93" cy="21" r="7" fill={accent}/></g>
    {:else if design==='fan'}
      {#each Array.from({length:9}) as _,i}<path d="M80 136L65 20 95 20Z" transform={`rotate(${-p*65+i*p*130/8} 80 136)`} fill={i%2?face:accent} stroke={ink}/>{/each}<circle cx="80" cy="136" r="9" fill={ink}/>
    {:else if design==='crown'}
      <g transform={`rotate(${angle} 80 76)`}><polygon points={teeth(12)} fill={face} stroke={ink} stroke-width="2"/><circle cx="80" cy="76" r="37" fill={housing}/>{#each [0,90,180,270] as a}<path d="M76 32H84V66H76Z" fill={face} transform={`rotate(${a} 80 76)`}/>{/each}<circle cx="80" cy="76" r="14" fill={accent}/><path d="M80 10V28" stroke={accent} stroke-width="5"/></g>
    {/if}
    {#if ['atlas','spool','iris','crown'].includes(design)}{#each Array.from({length:detail}) as _,i}{@const q=pt(i*360/detail,72)}<circle cx={q[0]} cy={q[1]} r="1" fill={legend}/>{/each}{/if}
  </g>
  {#if showValue}<text x="80" y="165" text-anchor="middle" fill={legend} font-size="11" font-family="monospace">{readout}</text>{/if}
{:else if meter}
  {#if design==='atlas'}
    <path d="M9 72Q25 62 40 72T72 72T104 72T151 72" fill="none" stroke={legend}/><path d={`M${14+p*123} 65v-42l-12 12h24l-12-12`} fill={accent} stroke={accent} stroke-width="3"/>
  {:else if design==='kiln'}
    <path d="M29 22Q80 0 131 22V77H29Z" fill={face} stroke={ink}/><rect x="42" y="24" width="76" height="42" rx="20" fill={housing}/><rect x="46" y="28" width={Math.max(1,p*68)} height="34" rx="15" fill={accent}/>
  {:else if design==='arcade'}
    {#each Array.from({length:8}) as _,i}<path d={`M${8+i*19} 47l8-17 8 17-8 17Z`} fill={i/8<p?accent:face} stroke={ink}/>{/each}
  {:else if design==='spool'}
    <path d="M15 23H145V78H15Z" fill={face} stroke={ink}/><circle cx="35" cy="50" r="18" fill={housing}/><circle cx="125" cy="50" r="18" fill={housing}/><path d="M35 32H125M35 68H125" stroke={ink}/><rect x="56" y="40" width={p*47} height="20" fill={accent}/>
  {:else if design==='tessera'}
    {#each Array.from({length:20}) as _,i}<rect x={10+(i%10)*14} y={30+Math.floor(i/10)*23} width="11" height="19" fill={i/20<p?accent:face} stroke={ink}/>{/each}
  {:else if design==='bellows'}
    {#each Array.from({length:12}) as _,i}<path d={`M${9+i*12} 66v-${12+(i+1)*3}l9 8v${4+(i+1)*3}Z`} fill={i/12<p?accent:face} stroke={ink}/>{/each}
  {:else if design==='helix'}
    <path d="M10 48H150" stroke={ink} stroke-width="16"/>{#each Array.from({length:14}) as _,i}<path d={`M${10+i*10} 38l8 20`} stroke={face} stroke-width="3"/>{/each}<rect x={8+p*118} y="22" width="26" height="54" rx="4" fill={accent} stroke={ink}/>
  {:else if design==='iris'}
    <path d="M16 20H144V80H16Z" fill={housing} stroke={ink}/><path d={`M20 24H${80-p*57}V76H20ZM140 24H${80+p*57}V76H140Z`} fill={face}/><path d="M80 24V76" stroke={accent}/>
  {:else if design==='balance'}
    <path d="M63 78L80 42 97 78Z" fill={face} stroke={ink}/><path d="M20 43H140" stroke={accent} stroke-width="7" transform={`rotate(${-24+p*48} 80 43)`}/>
  {:else if design==='satellite'}
    <path d="M11 73Q80-31 149 73Z" fill={face} fill-opacity=".3" stroke={legend}/><path d={`M80 73L${80+Math.sin((p-.5)*Math.PI)*68} ${73-Math.cos((p-.5)*Math.PI)*68}`} stroke={accent} stroke-width="4"/><circle cx="80" cy="73" r="5" fill={accent}/>
  {:else if design==='fan'}
    {#each Array.from({length:10}) as _,i}<path d="M80 78L75 15H85Z" transform={`rotate(${-65+i*130/9} 80 78)`} fill={i/10<p?accent:face} stroke={ink}/>{/each}
  {:else if design==='crown'}
    {#each Array.from({length:10}) as _,i}<path d={`M${9+i*14} 62V36h3v-9h6v9h3v26Z`} fill={i/10<p?accent:face} stroke={ink}/>{/each}
  {/if}
  {#if showValue}<text x="80" y="96" fill={legend} font-size="10" text-anchor="middle">{readout}</text>{/if}
{:else}
  <g transform={`translate(0 ${!toggle&&active?4*depth:0})`}>
    {#if design==='atlas'}
      <circle cx="80" cy="40" r="33" fill={face} stroke={ink} stroke-width="3"/><g transform={`rotate(${active?45:-45} 80 40)`}><path d="M80 10L89 40 80 69 71 40Z" fill={accent} stroke={ink}/><circle cx="80" cy="40" r="5" fill={ink}/></g>
    {:else if design==='kiln'}
      <path d="M38 66Q24 19 54 15H106Q136 19 122 66Z" fill={`url(#${uid}-glaze)`} stroke={ink}/><ellipse cx={toggle?(active?102:58):80} cy={active?42:32} rx="17" ry="11" fill={accent} stroke={ink}/><path d="M39 67H122" stroke={ink} stroke-width="4"/>
    {:else if design==='arcade'}
      <path d="M49 5H111L135 29V52L111 76H49L25 52V29Z" fill={housing} stroke={ink}/><path d={active?'M52 15H108L124 31V48L108 64H52L36 48V31Z':'M52 9H108L124 25V42L108 58H52L36 42V25Z'} fill={active?accent:face} stroke={ink} stroke-width="3"/><path d={active?'M72 38H88M80 30V46':'M70 32H90'} stroke={ink} stroke-width="4"/>
    {:else if design==='spool'}
      <path d="M18 16H142V66H18Z" fill={face} stroke={ink}/><path d={active?'M58 25H70V55H58ZM90 25H102V55H90Z':'M68 23L104 40 68 57Z'} fill={accent} stroke={ink}/><path d="M24 71H137" stroke={ink} stroke-width="4"/>
    {:else if design==='tessera'}
      {#each [0,1,2] as i}<rect x={27+i*37} y={active&&i===1?24:12} width="32" height="52" fill={i===(active?1:0)?accent:face} stroke={ink} stroke-width="2"/>{/each}
    {:else if design==='bellows'}
      {#each Array.from({length:7}) as _,i}<path d={`M${20+i*(active?15:18)} 18l7-7 7 7v43l-7 7-7-7Z`} fill={`url(#${uid}-fold)`} stroke={ink}/>{/each}<path d={`M${active?127:148} 14V65`} stroke={accent} stroke-width="6"/>
    {:else if design==='helix'}
      <path d="M18 14H142V68H18Z" fill={housing} stroke={ink}/><path d="M32 23H128M32 34H128M32 46H128M32 58H128" stroke={ink} stroke-width="4"/><rect x={active?91:37} y="12" width="32" height="57" rx="8" fill={face} stroke={ink}/><path d={`M${active?106:52} 25V55`} stroke={accent} stroke-width="6"/>
    {:else if design==='iris'}
      <path d="M26 10H134V70H26Z" fill={housing} stroke={ink}/><path d={active?'M30 14H53L68 40 53 66H30ZM130 14H107L92 40 107 66H130Z':'M30 14H78L91 40 78 66H30ZM130 14H83L70 40 83 66H130Z'} fill={face} stroke={ink}/><circle cx="80" cy="40" r={active?9:3} fill={accent}/>
    {:else if design==='balance'}
      <path d="M64 72L80 24 96 72Z" fill={face} stroke={ink}/><g transform={`rotate(${active?18:-18} 80 34)`}><path d="M22 34H138" stroke={ink} stroke-width="6"/><rect x="18" y="18" width="29" height="26" rx="4" fill={face}/><circle cx="126" cy="34" r="19" fill={accent} stroke={ink}/></g>
    {:else if design==='satellite'}
      <path d="M20 19H57V61H20ZM103 19H140V61H103Z" fill={face} stroke={ink}/><path d={active?'M44 40H116':'M12 40H44M116 40H148'} stroke={accent} stroke-width="8"/><path d="M66 14H94V66H66Z" fill={housing} stroke={ink}/><circle cx="80" cy="40" r={active?13:5} fill={accent}/>
    {:else if design==='fan'}
      {#each [0,1,2,3,4] as i}<path d="M80 71L65 9H95Z" transform={`rotate(${(i-2)*(active?25:12)} 80 71)`} fill={i%2?accent:face} stroke={ink}/>{/each}<circle cx="80" cy="71" r="5" fill={ink}/>
    {:else if design==='crown'}
      <path d="M33 20H127V65H33Z" fill={face} stroke={ink}/><path d={active?'M50 17V36H110V17':'M50 6V25H110V6'} fill="none" stroke={accent} stroke-width="10"/>{#each [0,1,2,3,4] as i}<path d={`M${48+i*16} 50v20`} stroke={ink} stroke-width="5"/>{/each}
    {/if}
  </g>
  <text x="80" y="95" text-anchor="middle" fill={legend} font-size="10">{label}{toggle?(active?' · ON':' · OFF'):''}</text>
{/if}
