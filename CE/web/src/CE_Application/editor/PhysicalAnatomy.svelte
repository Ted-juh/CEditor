<script>
  let {design,knob,meter,toggle,p,active,face,ink,accent,housing,legend,depth,size,detail,readout,label,showValue}=$props();
  const uid=$props.id();
  const paint=name=>`url(#${uid}-${name})`;
  let angle=$derived(-135+p*270);
  const point=(a,r,cx=80,cy=76)=>[cx+Math.sin(a*Math.PI/180)*r,cy-Math.cos(a*Math.PI/180)*r];
  const polygon=(n,r,inner=r)=>Array.from({length:n*2},(_,i)=>point(i*180/n,i%2?inner:r).join(',')).join(' ');
</script>
<defs>
  <linearGradient id={`${uid}-metal`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="145" y2="135"><stop stop-color="#fff"/><stop offset=".18" stop-color={face}/><stop offset=".39" stop-color="#30322f"/><stop offset=".49" stop-color="#f9f3d9"/><stop offset=".57" stop-color={face}/><stop offset="1" stop-color="#3c403c"/></linearGradient>
  <radialGradient id={`${uid}-cap`} cx=".31" cy=".2" r=".85"><stop stop-color="white" stop-opacity={.4+depth*.4}/><stop offset=".35" stop-color={face}/><stop offset=".8" stop-color={face}/><stop offset="1" stop-color="#171919"/></radialGradient>
  <linearGradient id={`${uid}-rim`} x2=".2" y2="1"><stop stop-color="#fff"/><stop offset=".15" stop-color={face}/><stop offset=".48" stop-color={face}/><stop offset="1" stop-color="#080b0d"/></linearGradient>
  <linearGradient id={`${uid}-well`} x2=".15" y2="1"><stop stop-color="#050708"/><stop offset=".6" stop-color={housing}/><stop offset="1" stop-color="#89918a"/></linearGradient>
  <linearGradient id={`${uid}-glass`} x2=".65" y2="1"><stop stop-color="#fff" stop-opacity=".75"/><stop offset=".48" stop-color={accent} stop-opacity=".1"/><stop offset=".51" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color={face} stop-opacity=".08"/></linearGradient>
  <pattern id={`${uid}-leather`} width="7" height="6" patternUnits="userSpaceOnUse"><rect width="7" height="6" fill={face}/><path d="M0 1l3 2 4-1M2 6l1-3" fill="none" stroke="#160e09" stroke-opacity=".22"/><path d="M0 0l3 2 4-1" fill="none" stroke="white" stroke-opacity=".12"/></pattern>
  <filter id={`${uid}-shadow`} x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx={1+depth} dy={2+depth*4} stdDeviation={1+depth*2} flood-opacity=".65"/></filter>
</defs>
{#snippet screw(x,y,r=3)}<g transform={`translate(${x} ${y})`}><circle r={r} fill={paint('metal')} stroke="#20211e" stroke-width=".6"/><path d={`M${-r*.6} ${r*.35}L${r*.6} ${-r*.35}`} stroke="#292b28" stroke-width="1"/></g>{/snippet}
{#snippet ticks(cx,cy,r,count=detail)}{#each Array.from({length:count+1}) as _,i}<path d={`M${cx} ${cy-r}v${i%3===0?6:3}`} transform={`rotate(${-135+i*270/count} ${cx} ${cy})`} stroke={legend} stroke-width={i%3===0?1.5:.7}/>{/each}{/snippet}
{#snippet bezel(cx,cy,r)}<circle cx={cx+1} cy={cy+4} r={r+2} fill="#050707" opacity=".55"/><circle {cx} {cy} r={r} fill={paint('metal')} stroke="#171a1b" stroke-width="1.5"/><circle {cx} {cy} r={r-5} fill={paint('well')} stroke="white" stroke-opacity=".25"/>{/snippet}
{#snippet plate(x,y,w,h,r=5)}<rect {x} y={y+3} width={w} height={h} rx={r} fill="#090b0c"/><rect {x} {y} width={w} height={h} rx={r} fill={paint('rim')} stroke="#111619"/><rect x={x+3} y={y+3} width={w-6} height={h-6} rx={Math.max(1,r-2)} fill={housing}/>{/snippet}

{#if knob}
  <g transform={`translate(${80*(1-size)} ${76*(1-size)}) scale(${size})`}>
  {#if design==='brassworks'}
    {@render ticks(80,76,73)}{@render bezel(80,76,48)}
    <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}>
      <circle cx="80" cy="76" r="48" fill="none" stroke="#372d1e" stroke-width="17"/><circle cx="80" cy="73" r="48" fill="none" stroke={paint('metal')} stroke-width="13"/>
      {#each [0,120,240] as a}<path d="M80 76V26" transform={`rotate(${a} 80 76)`} stroke={paint('metal')} stroke-width="11"/>{/each}
      <polygon points="65,66 80,58 95,66 95,84 80,93 65,84" fill={paint('metal')} stroke="#4b3b21"/>{@render screw(80,75,6)}<path d="M80 16v16" stroke={accent} stroke-width="5"/>
    </g>
  {:else if design==='bakelite'}
    {@render ticks(80,76,71)}{@render bezel(80,79,58)}
    <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><circle cx="80" cy="76" r="46" fill={paint('cap')}/><path d="M69 39L80 15 91 39 98 96Q80 121 62 96Z" fill={paint('rim')} stroke="#261a14" stroke-width="2"/><path d="M80 25V55" stroke="#eee1b7" stroke-width="3"/><path d="M67 88Q80 98 93 88" fill="none" stroke="white" stroke-opacity=".22"/></g>
  {:else if design==='hi-fi'}
    {@render ticks(80,76,72)}{@render bezel(80,78,60)}
    {#each Array.from({length:48}) as _,i}<path d="M80 23v8" transform={`rotate(${i*7.5} 80 78)`} stroke={face} opacity=".6"/>{/each}
    <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><circle cx="80" cy="76" r="44" fill={paint('metal')} stroke="#dfe1d8"/><circle cx="80" cy="76" r="36" fill={paint('cap')}/>{#each [12,20,28,34] as r}<circle cx="80" cy="76" {r} fill="none" stroke="#eee" stroke-opacity=".17"/>{/each}<path d="M80 36v12" stroke="#242a29" stroke-width="3"/></g>
  {:else if design==='porcelain'}
    {@render ticks(80,76,72)}<ellipse cx="80" cy="90" rx="57" ry="51" fill={paint('well')}/>
    {#each [0,1,2] as i}<ellipse cx="80" cy={88-i*9} rx={55-i*5} ry={41-i*3} fill={paint('cap')} stroke="#9e9b8f"/>{/each}
    <g transform={`rotate(${angle} 80 66)`} filter={paint('shadow')}><path d="M64 49Q80 22 96 49L99 86Q80 100 61 86Z" fill={paint('cap')} stroke="#beb9aa"/><path d="M80 39V56" stroke={accent} stroke-width="4"/><ellipse cx="73" cy="55" rx="4" ry="12" fill="white" opacity=".6"/></g>
  {:else if design==='flightdeck'}
    {@render plate(22,12,116,130)}{#each [49,111] as x}<rect {x} y="24" width="7" height="102" rx="3" fill={paint('metal')}/>{/each}
    <rect x="66" y="22" width="28" height="106" rx="8" fill={paint('well')}/>{#each [0,1,2,3,4,5] as i}<path d={`M31 ${29+i*18}h9M120 ${29+i*18}h9`} stroke={legend}/>{/each}
    <g transform={`translate(0 ${77-p*73})`} filter={paint('shadow')}><path d="M48 34H117V49H48Z" fill={paint('metal')}/><rect x="39" y="20" width="85" height="30" rx="9" fill={paint('cap')} stroke="#111"/>{#each [0,1,2,3,4] as i}<path d={`M${57+i*12} 23v22`} stroke="#111" opacity=".35"/>{/each}<path d="M76 25h10" stroke={accent} stroke-width="3"/></g>
    {@render screw(29,19)}{@render screw(131,133)}
  {:else if design==='stompbox'}
    {@render ticks(80,76,72)}{@render bezel(80,78,56)}
    <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><polygon points={polygon(10,53,46)} fill={paint('rim')} stroke="#151a16" stroke-width="2"/><circle cx="80" cy="76" r="37" fill={paint('cap')}/><path d="M74 39h12v38H74Z" fill={accent} stroke="#333"/><circle cx="80" cy="82" r="10" fill={paint('metal')}/></g>
  {:else if design==='switchboard'}
    {@render bezel(80,76,66)}
    <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><circle cx="80" cy="76" r="58" fill={paint('metal')} stroke="#aaa491"/>{#each Array.from({length:10}) as _,i}{@const v=point(i*30-120,43)}<circle cx={v[0]} cy={v[1]} r="10" fill={paint('well')} stroke="#eee2c0" stroke-width="1.5"/>{/each}<circle cx="80" cy="76" r="27" fill="#e5dac0" stroke="#504332" stroke-width="3"/><path d="M80 54v9" stroke={accent} stroke-width="4"/><text x="80" y="81" text-anchor="middle" fill="#493b29" font-size="10">DIAL</text></g><path d="M126 110l11 7-8 12-10-12Z" fill={paint('metal')} stroke="#111"/>
  {:else if design==='chronograph'}
    {@render bezel(80,76,64)}{#each Array.from({length:40}) as _,i}<path d="M80 13v6" transform={`rotate(${i*9} 80 76)`} stroke="#101b23" stroke-width="2"/>{/each}
    <circle cx="80" cy="76" r="51" fill={housing}/>{@render ticks(80,76,47,24)}
    <g transform={`rotate(${angle} 80 76)`}><path d="M80 34l4 42-4 13-4-13Z" fill={accent} stroke="#f6ddb4"/><path d="M80 76L105 91" stroke={face} stroke-width="3"/></g><circle cx="80" cy="76" r="5" fill={paint('metal')}/><circle cx="80" cy="76" r="50" fill={paint('glass')}/><rect x="143" y="65" width="12" height="22" rx="3" fill={paint('metal')}/>
  {:else if design==='cassette-deck'}
    {@render plate(15,25,130,108)}<rect x="36" y="34" width="88" height="91" rx="10" fill={paint('well')}/>
    <g filter={paint('shadow')}><rect x="49" y="37" width="62" height="84" rx="13" fill={paint('cap')}/>{#each Array.from({length:12}) as _,i}<path d={`M53 ${41+((i*7+p*28)%77)}h54`} stroke="#171817" stroke-width="2"/><path d={`M53 ${42+((i*7+p*28)%77)}h54`} stroke="white" stroke-opacity=".25"/>{/each}</g><path d="M20 77h20l-8-6v12Z" fill={accent}/><rect x="116" y={113-p*72} width="15" height="5" fill={accent}/>{@render screw(24,34)}{@render screw(136,124)}
  {:else if design==='diesel'}
    {@render ticks(80,76,72)}<polygon points={polygon(6,61)} fill={paint('metal')} stroke="#080d08" stroke-width="3"/><circle cx="80" cy="76" r="41" fill={paint('well')}/>
    <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><path d="M73 42h14v63H73Z" fill={paint('metal')}/><rect x="31" y="30" width="98" height="25" rx="6" fill={paint('cap')} stroke="#111" stroke-width="2"/><path d="M42 35v14M118 35v14M80 33v15" stroke={accent} stroke-width="3"/><circle cx="80" cy="83" r="14" fill={paint('metal')}/>{@render screw(80,83,5)}</g>
  {:else if design==='gemstone'}
    {@render ticks(80,76,72)}{@render bezel(80,78,57)}
    <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><polygon points={polygon(6,60)} fill={face} stroke="#f7ffff"/>{#each Array.from({length:12}) as _,i}{@const a=point(i*30,60)}{@const b=point((i+1)*30,60)}<path d={`M80 76L${a}L${b}Z`} fill={i%3===0?'white':i%3===1?accent:housing} opacity=".5"/>{/each}<polygon points={polygon(6,32)} fill={paint('glass')} stroke="white" stroke-opacity=".65"/><path d="M80 17v14" stroke="#fff" stroke-width="4"/></g>
  {:else if design==='leatherbound'}
    {@render ticks(80,76,72)}{@render bezel(80,78,59)}
    <g transform={`rotate(${angle} 80 76)`} filter={paint('shadow')}><circle cx="80" cy="76" r="51" fill={paint('leather')} stroke="#3b2416" stroke-width="3"/><circle cx="80" cy="76" r="44" fill="none" stroke="#e2c194" stroke-width="1.5" stroke-dasharray="3 3"/><path d="M67 30Q80 23 93 30V115Q80 125 67 115Z" fill={paint('cap')} stroke="#492d1a"/><path d="M72 36V108M88 36V108" stroke="#ddbb8b" stroke-dasharray="3 3"/><rect x="65" y="45" width="30" height="21" rx="3" fill="none" stroke={paint('metal')} stroke-width="5"/><path d="M80 32v10" stroke={accent} stroke-width="3"/></g>
  {/if}
  </g>
  {#if showValue}<text x="80" y="163" text-anchor="middle" fill={legend} font-size="12" font-family="monospace">{readout}</text>{/if}
{:else if meter}
  {#if ['brassworks','chronograph','leatherbound'].includes(design)}
    {@render bezel(80,48,44)}<circle cx="80" cy="48" r="36" fill={design==='chronograph'?housing:'#e5d8b8'}/>
    <g style={`color:${design==='chronograph'?face:'#3b3021'}`}>{#each Array.from({length:13}) as _,i}<path d="M80 17v5" transform={`rotate(${-110+i*220/12} 80 48)`} stroke="currentColor"/>{/each}</g>
    <g transform={`rotate(${-110+p*220} 80 48)`}><path d="M80 20l3 35-3 4-3-4Z" fill={accent} stroke="#443723" stroke-width=".6"/></g><circle cx="80" cy="48" r="4" fill={paint('metal')}/><circle cx="80" cy="48" r="35" fill={paint('glass')}/>
    {#if design==='leatherbound'}<path d="M17 22v53M143 22v53" stroke={face} stroke-width="16"/><path d="M17 22v53M143 22v53" stroke={accent} stroke-dasharray="3 3"/>{:else if design==='chronograph'}<circle cx="121" cy="79" r="12" fill={paint('metal')}/><circle cx="121" cy="79" r="8" fill={housing}/><path d="M121 73v6h4" stroke={accent} fill="none"/>{/if}
  {:else if design==='bakelite'}
    {@render plate(9,14,142,70,18)}<ellipse cx="80" cy="49" rx="57" ry="27" fill="#151b0b" stroke={paint('metal')} stroke-width="4"/><path d={`M80 51L${30+p*46} 26Q80 11 ${130-p*46} 26Z`} fill={accent}/><ellipse cx="80" cy="51" rx="15" ry="17" fill={paint('well')}/><ellipse cx="80" cy="47" rx="55" ry="24" fill={paint('glass')}/>
  {:else if design==='hi-fi'}
    {@render plate(4,16,152,69,4)}{#each [0,1] as i}<g transform={`translate(${9+i*73} 22)`}><path d="M0 0h67v51H0Z" fill="#e6dcc0"/><path d="M7 27Q34 0 60 27" fill="none" stroke="#624c36"/><path d="M34 48V8" transform={`rotate(${-45+p*(i?80:90)} 34 48)`} stroke="#a74428" stroke-width="1.5"/><path d="M0 0h67v51H0Z" fill={paint('glass')}/></g>{/each}
  {:else if design==='porcelain' || design==='gemstone'}
    {@render plate(13,27,134,48,design==='porcelain'?20:2)}<rect x="24" y="36" width="112" height="28" rx={design==='porcelain'?14:0} fill={paint('well')}/><rect x="27" y="39" width={106*p} height="22" rx={design==='porcelain'?11:0} fill={accent}/>{#each [0,1,2,3,4,5,6,7,8] as i}<path d={`M${29+i*12} 37v6`} stroke={face}/>{/each}<rect x="24" y="36" width="112" height="28" rx={design==='porcelain'?14:0} fill={paint('glass')}/>
    {#if design==='gemstone'}<path d="M13 27l11 9M147 27l-11 9M13 75l11-11M147 75l-11-11" stroke="white"/>{/if}
  {:else if design==='flightdeck'}
    {@render plate(19,8,122,82,9)}<rect x="30" y="23" width="100" height="52" rx="5" fill="#090d0e"/>{#each [0,1,2] as i}<rect x={35+i*32} y="26" width="28" height="46" rx="3" fill={paint('rim')}/><text x={49+i*32} y="58" text-anchor="middle" fill={ink} font-size="29" font-family="monospace">{String(Math.round(p*1000)).padStart(3,'0').slice(-3)[i]}</text>{/each}{@render screw(25,15)}{@render screw(135,83)}
  {:else if design==='stompbox'}
    {@render plate(5,25,150,50,8)}{#each Array.from({length:8}) as _,i}<circle cx={18+i*18} cy="49" r="7" fill={paint('metal')}/><circle cx={18+i*18} cy="49" r="5" fill={p>i/8?accent:'#171e15'}/><circle cx={16+i*18} cy="47" r="1.5" fill="white" opacity=".7"/>{/each}
  {:else if design==='switchboard'}
    {@render plate(10,13,140,73,13)}{#each [0,1,2,3,4] as i}<rect x={21+i*25} y="24" width="19" height="49" rx="8" fill={paint('well')}/><path d={`M${23+i*25} ${p>i/5?28:48}h15v19h-15Z`} fill={p>i/5?accent:face}/>{/each}
  {:else if design==='cassette-deck'}
    {@render plate(6,12,148,76,4)}<rect x="15" y="24" width="130" height="47" rx="10" fill={paint('well')}/><path d="M43 33H117V63H43Z" fill="#2a2118"/>{#each [43,117] as x}<g transform={`rotate(${p*540} ${x} 47)`}><circle cx={x} cy="47" r={x===43?12+p*7:19-p*7} fill={paint('metal')}/>{#each [0,120,240] as a}<path d={`M${x} 47v-11`} transform={`rotate(${a} ${x} 47)`} stroke={housing} stroke-width="4"/>{/each}<circle cx={x} cy="47" r="4" fill={accent}/></g>{/each}<path d="M15 24h130v23H15Z" fill={paint('glass')}/>
  {:else if design==='diesel'}
    {@render plate(7,20,146,58,2)}<rect x="27" y="32" width="107" height="34" fill={paint('well')}/><rect x="30" y="35" width={101*p} height="28" fill={accent}/>{#each [0,1,2,3,4,5] as i}<path d={`M${36+i*17} 33v31`} stroke={housing} stroke-width="3"/>{/each}<rect x="27" y="32" width="107" height="34" fill={paint('glass')}/>{@render screw(17,30,4)}{@render screw(143,67,4)}
  {/if}
  {#if showValue}<text x="80" y="99" text-anchor="middle" fill={legend} font-size="9" font-family="monospace">{readout}</text>{/if}
{:else}
  {@const travel=active?4:0}
  {#if design==='brassworks' || design==='stompbox' || design==='chronograph'}
    {@render bezel(80,44,35)}
    {#if design==='stompbox'}<polygon points="54,28 80,16 106,28 106,58 80,73 54,58" fill={paint('metal')} stroke="#212720"/><ellipse cx="80" cy="48" rx="20" ry="12" fill={paint('well')}/>{/if}
    <g transform={`translate(0 ${travel})`}><rect x="62" y={design==='chronograph'?18:24} width="36" height="26" rx="5" fill={paint('metal')}/><ellipse cx="80" cy="26" rx={design==='brassworks'?26:21} ry="14" fill={paint('cap')} stroke={face}/><path d="M66 21Q80 15 94 21" fill="none" stroke="white" stroke-opacity=".65"/></g>
    {#if toggle}<circle cx="128" cy="28" r="6" fill={paint('metal')}/><circle cx="128" cy="28" r="4" fill={active?accent:housing}/>{/if}
  {:else if design==='bakelite'}
    {@render plate(27,13,106,63,19)}<g transform={`translate(0 ${travel})`}><ellipse cx="80" cy="45" rx="42" ry="27" fill={paint('cap')} stroke="#261711" stroke-width="2"/><path d="M49 34Q76 13 106 30" fill="none" stroke="white" stroke-opacity=".25" stroke-width="3"/><ellipse cx="80" cy="45" rx="15" ry="11" fill={active?accent:paint('well')}/></g>
  {:else if design==='hi-fi' || design==='cassette-deck'}
    {@render plate(20,12,120,66,3)}<g transform={`translate(0 ${travel})`}><path d="M31 18H129V61L121 71H39L31 61Z" fill={paint('metal')} stroke="#222"/><rect x="37" y="21" width="86" height="38" rx="2" fill={paint('cap')}/>{#if design==='cassette-deck'}<path d={toggle?'M69 29h7v19h-7Zm15 0h7v19h-7Z':'M71 29l20 10-20 10Z'} fill={active?accent:ink}/>{:else}<path d="M51 52h58" stroke={active?accent:ink} stroke-width="3"/>{/if}</g>
  {:else if design==='porcelain'}
    {@render plate(32,8,96,71,23)}<g transform={`translate(0 ${travel})`}><path d={toggle&&active?'M42 28Q80 6 118 28V64Q80 79 42 64Z':'M42 19Q80 8 118 19V57Q80 82 42 57Z'} fill={paint('cap')} stroke="#aaa799"/><path d="M55 27Q80 19 105 27" fill="none" stroke="white" stroke-width="3"/><path d="M76 46h8" stroke={active?accent:ink} stroke-width="4"/></g>
  {:else if design==='flightdeck'}
    {@render plate(25,14,110,63,4)}<rect x="52" y="21" width="56" height="47" rx="6" fill={paint('well')}/><g transform={`translate(0 ${travel})`}><rect x="61" y={active?39:24} width="38" height="24" rx="4" fill={paint('cap')}/><path d={`M66 ${active?44:29}h28`} stroke={accent} stroke-width="3"/></g><path d="M40 67V19Q40 7 52 7H109Q120 7 120 19V67" fill="none" stroke={paint('metal')} stroke-width="7"/>{@render screw(33,68)}{@render screw(127,68)}
  {:else if design==='switchboard'}
    {@render plate(21,15,118,62,13)}<ellipse cx="80" cy="48" rx="35" ry="20" fill={paint('well')}/><g transform={`rotate(${active?18:-18} 80 48)`} filter={paint('shadow')}><path d="M80 49V23" stroke={paint('metal')} stroke-width="12"/><path d="M48 20Q80 3 112 20L108 36Q80 25 52 36Z" fill={paint('cap')} stroke="#28211b"/><circle cx="80" cy="49" r="9" fill={paint('metal')}/></g>
  {:else if design==='diesel'}
    {@render plate(22,10,116,70,2)}{@render screw(31,19,4)}{@render screw(129,71,4)}<rect x="50" y="24" width="60" height="45" fill={paint('well')}/><g transform={`translate(0 ${travel})`}><path d="M56 24h48v32l-7 7H63l-7-7Z" fill={paint('cap')} stroke="#191e15" stroke-width="2"/>{#each [0,1,2] as i}<path d={`M64 ${32+i*7}h32`} stroke="#172015" stroke-width="2"/>{/each}<rect x="75" y="55" width="10" height="4" fill={active?accent:ink}/></g>
  {:else if design==='gemstone'}
    <path d="M80 8L136 42 80 79 24 42Z" fill={paint('metal')} stroke="#111"/><g transform={`translate(0 ${travel})`}><path d="M80 12L128 39 80 69 32 39Z" fill={face}/><path d="M80 12L104 39 80 69 56 39Z" fill={paint('glass')}/><path d="M32 39H128L80 69Z" fill={active?accent:housing} opacity=".45"/><path d="M32 39L80 12 128 39" fill="none" stroke="white" stroke-width="2"/></g>
  {:else if design==='leatherbound'}
    {@render plate(18,13,124,64,16)}<g transform={`translate(0 ${travel})`}><rect x="24" y="16" width="112" height="51" rx="15" fill={paint('leather')} stroke="#3a251b" stroke-width="3"/><rect x="30" y="22" width="100" height="39" rx="11" fill="none" stroke="#e0bc90" stroke-dasharray="3 3"/><path d="M36 20Q80 10 124 20" fill="none" stroke="white" stroke-opacity=".22"/><rect x="67" y="32" width="26" height="17" rx="3" fill={active?accent:paint('metal')}/></g>
  {/if}
  <text x="80" y="96" text-anchor="middle" fill={legend} font-size="11" font-family="sans-serif">{label}</text>
{/if}
