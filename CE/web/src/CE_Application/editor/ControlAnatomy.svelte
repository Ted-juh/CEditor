<script>
  import PhysicalAnatomy from './PhysicalAnatomy.svelte';
  import { PHYSICAL_DIRECTIONS } from '../models/physicalControlSets.js';
  import AdditionalAnatomy from './AdditionalAnatomy.svelte';
  import { anatomyValue } from '../models/controlAnatomy.js';
  import { meterConfig, meterPosition } from '../utils/meterLayout.js';
  import { formatSliderNumericValue } from '../utils/sliderBehavior.js';
  let { control, runtime = null, width = 160, height = 160, checked = false, label = '' } = $props();
  const uid = $props.id();
  let core = $derived(control?._children?.Core ?? {});
  let form = $derived(core.controlForm);
  let knob = $derived(core.controlType === 'Knob');
  let meter = $derived(['Meter','ProgressBar'].includes(core.controlType));
  let toggle = $derived(core.controlType === 'ToggleButton');
  let signals = $derived(runtime?.signals ?? {});
  let value = $derived(anatomyValue(control, signals));
  let cfg = $derived(meterConfig(control));
  let p = $derived(meter ? meterPosition(cfg.__value ?? cfg.value, cfg) : value.normalized);
  let active = $derived(toggle ? checked : signals.pressed === true);
  let depth = $derived(Math.max(0, Math.min(1, Number(core.formDepth ?? 60) / 100)));
  let detail = $derived(Math.max(4, Math.min(48, Math.round(Number(core.formDivisions) || 12))));
  let size = $derived(Math.max(.6, Math.min(1.15, Number(core.formSize ?? 100) / 100)));
  let angle = $derived(-135 + p * 270);
  let readout = $derived(meter ? `${cfg.valuePrefix ?? ''}${Number(cfg.__value ?? cfg.value ?? 0).toFixed(Math.max(0, Math.min(6, Number(cfg.valuePrecision) || 0)))}${cfg.valueSuffix ?? ''}` : formatSliderNumericValue(control?._children?.Behavior, value.raw));
  let counterDigits = $derived(Number(cfg.__value ?? cfg.value ?? 0).toFixed(Math.max(0, Math.min(3, Number(cfg.valuePrecision) || 0))).split(''));
  function css(v, fallback) { const h=String(v??'').replace('#','');return /^[0-9a-f]{8}$/i.test(h)?`#${h.slice(2)}${h.slice(0,2)}`:/^[0-9a-f]{6}$/i.test(h)?`#${h}`:fallback; }
  let face = $derived(css(core.formFaceColour, '#dedbd2'));
  let housing = $derived(css(core.formHousingColour, '#171a20'));
  let ink = $derived(css(core.formInkColour, '#20282c'));
  let legend = $derived(css(core.formLabelColour, ink));
  let accent = $derived(css(core.formAccentColour, '#40bccc'));
  let vh = $derived(knob ? 170 : 100);
  const point = (a,r,cx=80,cy=76) => ({x:cx+Math.sin(a*Math.PI/180)*r,y:cy-Math.cos(a*Math.PI/180)*r});
  function polygon(n,r1,r2) { return Array.from({length:n*2},(_,i)=>{const q=point(i*180/n,i%2?r2:r1);return `${q.x},${q.y}`;}).join(' '); }
</script>

<svg class="anatomy" data-form={form} data-position={p} data-active={active} viewBox={`0 0 160 ${vh}`} {width} {height} aria-hidden="true" style={`--face:${face};--ink:${ink};--accent:${accent};`}>
  <defs>
    <linearGradient id={`${uid}-metal`} x2="0" y2="1"><stop stop-color="#fff" stop-opacity={.8*depth}/><stop offset=".42" stop-color={face}/><stop offset=".55" stop-color={face}/><stop offset="1" stop-color="#000" stop-opacity={.65*depth}/></linearGradient>
    <radialGradient id={`${uid}-dome`} cx=".32" cy=".25" r=".8"><stop stop-color="#fff" stop-opacity={.85*depth}/><stop offset=".45" stop-color={face}/><stop offset="1" stop-color="#000" stop-opacity={.6*depth}/></radialGradient>
  </defs>
  {#snippet ticks(radius=62, cy=76)}
    {#each Array.from({length:detail+1}) as _,i}
      {@const a=-135+i*270/detail}{@const q=point(a,radius,80,cy)}{@const z=point(a,radius-(i%3?4:9),80,cy)}
      <line x1={q.x} y1={q.y} x2={z.x} y2={z.y} stroke={legend} stroke-width={i%3?1:2}/>
    {/each}
  {/snippet}
  {#if PHYSICAL_DIRECTIONS.some(d=>form===`new-${d.id}`)}
    <PhysicalAnatomy design={form.slice(4)} {knob} {meter} {toggle} {p} {active} {face} {ink} {accent} {housing} {legend} {depth} {size} {detail} {readout} {label} showValue={core.formShowValue!==false} />
  {:else if String(form).startsWith('new-')}
    <AdditionalAnatomy design={form.slice(4)} {knob} {meter} {toggle} {p} {active} {face} {ink} {accent} {housing} {legend} {depth} {size} {detail} {readout} {label} showValue={core.formShowValue!==false} />
  {:else if knob}
    <g transform={`translate(80 76) scale(${size}) translate(-80 -76)`}>
    {#if form==='disc'}
      <path d="M39 117 A58 58 0 1 1 121 117" fill="none" stroke={ink} stroke-opacity=".2" stroke-width="5"/>
      <circle cx="80" cy="76" r="43" fill={face}/><g transform={`rotate(${angle} 80 76)`}><rect x="77" y="36" width="6" height="25" rx="3" fill={accent}/></g>
    {:else if form==='pointer'}
      {@render ticks()}<circle cx="80" cy="76" r="45" fill="none" stroke={ink} stroke-dasharray="2 5"/>
      <path d="M10 76H150 M80 6V146" stroke={ink} stroke-opacity=".2"/>
      <g transform={`rotate(${angle} 80 76)`}><path d="M80 16L85 87H75Z" fill={accent} stroke={ink}/><line x1="80" y1="88" x2="80" y2="108" stroke={ink} stroke-width="3"/></g><circle cx="80" cy="76" r="7" fill={face} stroke={ink}/>
    {:else if form==='tab'}
      <path d="M27 20L128 25 137 128 21 120Z" fill={ink}/><path d="M22 14L123 19 132 122 16 114Z" fill={face} stroke={ink} stroke-width="2"/>
      <circle cx="75" cy="72" r="43" fill="none" stroke={ink} stroke-dasharray="1 9" stroke-width="4"/>
      <g transform={`rotate(${angle} 80 76)`}><path d="M69 102L62 55 80 26 98 55 91 102Z" fill={accent} stroke={ink} stroke-width="3"/><path d="M62 55H98L80 64Z" fill={ink} opacity=".18"/></g><circle cx="80" cy="76" r="5" fill={face}/>
    {:else if form==='pebble'}
      <path d="M22 64Q25 16 80 18Q138 18 137 80Q141 140 79 136Q14 137 22 64" fill={ink} opacity=".15"/>
      <g transform={`rotate(${angle} 80 76)`}><path d="M43 45Q77 10 109 41Q137 65 107 110Q78 142 43 111Q18 78 43 45" fill={face}/><path d="M43 45Q77 10 109 41Q137 65 107 110Q78 142 43 111Q18 78 43 45" fill={`url(#${uid}-dome)`}/><ellipse cx="80" cy="42" rx="6" ry="10" fill={accent}/></g>
    {:else if form==='halo'}
      {@render ticks(69)}<circle cx="80" cy="76" r="47" fill="none" stroke={face} stroke-width="19" opacity=".55"/><circle cx="80" cy="76" r="58" fill="none" stroke={ink}/><circle cx="80" cy="76" r="36" fill="none" stroke={ink} stroke-opacity=".45"/>
      <g transform={`rotate(${angle} 80 76)`}><path d="M46 34A54 54 0 0 1 111 31" fill="none" stroke="white" stroke-width="4"/><circle cx="80" cy="29" r="9" fill={accent} stroke={ink}/></g>
    {:else if form==='lens'}
      <path d="M30 12H130L148 30V123L130 140H30L12 123V30Z" fill={housing} stroke={ink} stroke-opacity=".35"/><circle cx="80" cy="76" r="58" fill={face}/><circle cx="80" cy="76" r="49" fill={`url(#${uid}-dome)`}/><circle cx="80" cy="76" r="30" fill={housing} stroke={ink} stroke-opacity=".35"/>
      <g transform={`rotate(${angle} 80 76)`}><path d="M48 35A52 52 0 0 1 112 35" fill="none" stroke={accent} stroke-width="5"/><path d="M79 21H81V38H79Z" fill="white"/></g><text x="80" y="80" fill={accent} text-anchor="middle" font-size="12">{core.formShowValue!==false ? readout : ""}</text>
    {:else if form==='skirt'}
      {@render ticks(70)}<circle cx="80" cy="76" r="52" fill={housing} stroke={ink} stroke-opacity=".35"/><circle cx="80" cy="76" r="45" fill={face}/><g transform={`rotate(${angle} 80 76)`}><path d="M69 26H91L101 90 87 109H73L59 90Z" fill={ink}/><rect x="76" y="32" width="8" height="44" rx="2" fill={accent}/></g><path d="M43 133H117" stroke={ink} stroke-width="2"/>
    {:else if form==='roller'}
      <rect x="27" y="9" width="106" height="132" rx="34" fill={housing} stroke={ink} stroke-opacity=".35"/><rect x="39" y="15" width="82" height="120" rx="29" fill={face}/><rect x="39" y="15" width="82" height="120" rx="29" fill={`url(#${uid}-metal)`}/>
      {#each Array.from({length:13}) as _,i}<path d={`M45 ${23+((i*9+p*9)%108)}H115`} stroke={ink} stroke-width="3" opacity=".55"/>{/each}<path d="M21 75L32 69V81Z M139 75L128 69V81Z" fill={accent}/><rect x="63" y={28+p*84} width="34" height="5" rx="2" fill={accent}/>
    {:else if form==='vernier'}
      {@render ticks(71)}<circle cx="80" cy="76" r="55" fill={face} stroke={ink} stroke-width="3"/><circle cx="80" cy="76" r="48" fill={`url(#${uid}-metal)`}/>
      {#each Array.from({length:24}) as _,i}{@const q=point(i*15,47)}<circle cx={q.x} cy={q.y} r="2" fill={ink}/>{/each}
      <g transform={`rotate(${angle} 80 76)`}><circle cx="80" cy="76" r="32" fill={housing} stroke={ink} stroke-opacity=".35"/><rect x="76" y="45" width="8" height="30" fill={accent}/></g><path d="M111 35L139 18" stroke={ink}/><rect x="110" y="12" width="39" height="19" rx="2" fill={ink}/><text x="130" y="26" text-anchor="middle" fill={face} font-size="11">{core.formShowValue!==false ? readout : ""}</text>
    {:else if form==='tuning'}
      <path d="M10 100V59A70 48 0 0 1 150 59V100Z" fill={housing} stroke={ink} stroke-opacity=".35"/><path d="M18 91V60A62 40 0 0 1 142 60V91Z" fill={face}/>
      {#each Array.from({length:detail+1}) as _,i}<line x1={23+i*114/detail} y1="47" x2={23+i*114/detail} y2={i%3?53:60} stroke={ink}/>{/each}<text x="28" y="76" fill={ink} font-size="9">{control?._children?.Behavior?.min ?? 0}</text><text x="121" y="76" fill={ink} font-size="9">{control?._children?.Behavior?.max ?? 1}</text><line x1={24+p*112} y1="31" x2={24+p*112} y2="89" stroke={accent} stroke-width="3"/>
      <g transform={`rotate(${angle} 80 121)`}><circle cx="80" cy="121" r="23" fill={housing} stroke={ink} stroke-opacity=".35"/><rect x="76" y="99" width="8" height="23" rx="3" fill={face}/></g>
    {:else if form==='scallop'}
      {@render ticks(72)}<polygon points={polygon(8,55,43)} fill={housing}/><g transform={`rotate(${angle} 80 76)`}><polygon points={polygon(8,48,39)} fill={face}/><polygon points={polygon(8,48,39)} fill={`url(#${uid}-dome)`}/><path d="M73 110V44L80 26 87 44V110Z" fill={ink}/><path d="M80 31V60" stroke={accent} stroke-width="5"/></g>
    {:else if form==='encoder'}
      {#each Array.from({length:detail}) as _,i}{@const q=point(-135+i*270/(detail-1),58)}<rect x={q.x-3} y={q.y-6} width="6" height="12" transform={`rotate(${-135+i*270/(detail-1)} ${q.x} ${q.y})`} fill={i/(detail-1)<=p?accent:ink} opacity={i/(detail-1)<=p?1:.25}/>{/each}
      <path d="M50 37H110L128 76 110 115H50L32 76Z" fill={housing} stroke={ink} stroke-opacity=".35"/><text x="80" y="83" text-anchor="middle" fill={accent} font-family="monospace" font-size="18">{core.formShowValue!==false ? readout : ""}</text><path d="M68 102H92" stroke={face}/>
    {/if}
    </g>
    {#if core.formShowValue!==false && !['lens','vernier','encoder'].includes(form)}<text x="80" y="164" text-anchor="middle" fill={legend} font-size="12" font-family="monospace">{core.formShowValue!==false ? readout : ""}</text>{/if}
  {:else if meter}
    <g transform={`translate(80 46) scale(${size}) translate(-80 -46)`}>
    {#if ['vu','radio','dial'].includes(form)}
      <path d={form==='radio'?'M6 84V35Q80 -18 154 35V84Z':form==='dial'?'M24 86V10H136V86Z':'M6 13H154V87H6Z'} fill={housing} stroke={ink} stroke-opacity=".35"/>
      <path d={form==='radio'?'M14 76V40Q80 -4 146 40V76Z':form==='dial'?'M31 79V17H129V79Z':'M13 20H147V80H13Z'} fill={face}/>
      {#each Array.from({length:detail+1}) as _,i}{@const q=point(-65+i*130/detail,54,80,80)}{@const z=point(-65+i*130/detail,47,80,80)}<line x1={q.x} y1={q.y} x2={z.x} y2={z.y} stroke={i/detail>.8?accent:ink} stroke-width="1.5"/>{/each}
      {@const needle=point(-65+p*130,50,80,80)}<line x1="80" y1="80" x2={needle.x} y2={needle.y} stroke={accent} stroke-width="2"/><circle cx="80" cy="80" r="6" fill={ink}/><text x="80" y="57" text-anchor="middle" fill={ink} font-size="10">{form==='vu'?'VU':form==='radio'?'SIGNAL':'LEVEL'}</text>
    {:else if form==='counter'}
      <rect x="3" y="21" width="154" height="61" rx="6" fill={housing} stroke={ink} stroke-opacity=".35"/>{#each counterDigits as digit,i}{@const cell=144/counterDigits.length}<rect x={8+i*cell} y="27" width={cell-3} height="48" rx="3" fill={face}/><text x={8+(i+.5)*cell-1.5} y="62" text-anchor="middle" font-size={Math.min(33,cell)} font-family="monospace" fill={ink}>{digit}</text><path d={`M${8+i*cell} 51H${8+(i+1)*cell-3}`} stroke={ink} opacity=".5"/>{/each}
    {:else if form==='column'}
      <rect x="48" y="6" width="64" height="82" rx="21" fill={face} fill-opacity=".3" stroke={ink}/><rect x="55" y={80-p*66} width="50" height={Math.max(1,p*66)} rx="14" fill={accent}/><path d="M60 16V75" stroke="white" stroke-width="4" opacity=".6"/>{#each [0,1,2,3,4] as i}<path d={`M117 ${80-i*16}h8`} stroke={legend}/>{/each}
    {:else if form==='semaphore'}
      <path d="M25 14H135L149 50 135 86H25L11 50Z" fill={housing} stroke={ink} stroke-opacity=".35"/><rect x="28" y="25" width="104" height="49" fill={face}/><path d={`M28 25H${28+p*104}V74H28Z`} fill={accent}/><path d="M80 18V81" stroke={ink} stroke-width="3"/><text x="80" y="60" text-anchor="middle" font-size="24" fill={ink}>{Math.round(p*100)}</text>
    {:else if form==='ticket'}
      <path d="M5 23L13 18 21 23 29 18 37 23 45 18 53 23 61 18 69 23 77 18 85 23 93 18 101 23 109 18 117 23 125 18 133 23 141 18 155 23V80H5Z" fill={face} stroke={ink} stroke-width="2"/>
      {#each Array.from({length:15}) as _,i}<path d={`M${15+i*9} 39V65`} stroke={i/15<=p?accent:ink} stroke-width="4" opacity={i/15<=p?1:.15}/>{/each}
    {:else if form==='ruler'}
      <path d="M8 64H152" stroke={ink}/>{#each Array.from({length:21}) as _,i}<path d={`M${10+i*7} 64V${i%5?55:43}`} stroke={ink}/>{/each}<path d={`M${10+p*140-7} 25h14l-7 14Z`} fill={accent}/><path d={`M${10+p*140} 25V75`} stroke={accent}/>
    {:else if form==='dots'}
      <rect x="4" y="17" width="152" height="68" rx="3" fill={housing} stroke={ink} stroke-opacity=".35"/>{#each Array.from({length:60}) as _,i}<circle cx={14+(i%15)*9.4} cy={28+Math.floor(i/15)*15} r="3" fill={accent} opacity={(i%15)/15<=p?1:.13}/>{/each}
    {:else if form==='blocks'}
      {#each Array.from({length:8}) as _,i}<path d={`M${6+i*19} 33h13v39h-13Z`} fill={ink}/><rect x={7+i*19} y={i/8<=p?27:35} width="13" height="34" rx="3" fill={i/8<=p?accent:face}/>{/each}
    {:else}
      <rect x="8" y="34" width="144" height="30" rx={form==='capsule'?15:0} fill={ink} opacity=".22"/><rect x="8" y="34" width={Math.max(1,p*144)} height="30" rx={form==='capsule'?15:0} fill={accent}/>{#if form==='capsule'}<rect x="8" y="34" width="144" height="30" rx="15" fill={`url(#${uid}-metal)`} opacity=".35"/>{/if}
    {/if}
    </g>
    {#if core.formShowValue!==false}<text x="80" y="98" text-anchor="middle" fill={legend} font-size="10">{core.formShowValue!==false ? readout : ""}</text>{/if}
  {:else}
    <g transform={`translate(80 40) scale(${size}) translate(-80 -40)`}>
    {#if toggle}
      {#if form==='slide'}
        <rect x="18" y="18" width="124" height="45" rx="22" fill={ink} opacity=".18"/><rect x={active?81:21} y="21" width="58" height="39" rx="19" fill={active?accent:face}/><text x={active?49:112} y="47" fill={ink} text-anchor="middle" font-size="12">{active?'ON':'OFF'}</text>
      {:else if form==='knife'}
        <path d="M22 60H138 M40 15V65 M120 15V65" stroke={ink} stroke-width="2"/><circle cx="40" cy="43" r="9" fill={face} stroke={ink}/><path d={active?'M40 43H121':'M40 43L106 10'} stroke={ink} stroke-width="9"/><path d={active?'M80 43H122':'M77 24L109 8'} stroke={accent} stroke-width="12"/><path d="M114 31V55H129V31" fill="none" stroke={ink} stroke-width="3"/>
      {:else if form==='bookmark'}
        <path d="M27 19H133V62H27Z" fill={face} stroke={ink} stroke-width="2"/><path d={`M${active?88:37} 8h30v67l-15-12-15 12Z`} fill={accent} stroke={ink} stroke-width="2"/>
      {:else if form==='rocker'}
        <ellipse cx="80" cy="41" rx="59" ry="32" fill={ink} opacity=".3"/><path d={active?'M28 34Q80 -7 133 27L128 61Q80 77 31 59Z':'M28 27Q80 4 133 34L128 59Q80 91 31 61Z'} fill={face}/><ellipse cx="80" cy="41" rx="50" ry="23" fill={`url(#${uid}-metal)`}/><circle cx={active?110:50} cy="39" r="6" fill={accent}/>
      {:else if form==='orbit'}
        <circle cx="80" cy="39" r="29" fill="none" stroke={face} stroke-width="11"/><circle cx="80" cy="39" r="35" fill="none" stroke={ink}/><circle cx={active?108:52} cy="39" r="13" fill={accent} stroke={ink}/><text x="80" y="43" fill={ink} text-anchor="middle" font-size="10">{active?'I':'O'}</text>
      {:else if form==='split'}
        <path d="M14 15H76V66H14Z M84 15H146V66H84Z" fill={ink}/><path d={active?'M84 15H146V66H84Z':'M14 15H76V66H14Z'} fill={face}/><path d={active?'M96 56H134':'M26 56H64'} stroke={accent} stroke-width="4"/><text x="45" y="43" fill={active?face:ink} text-anchor="middle">O</text><text x="115" y="43" fill={active?ink:face} text-anchor="middle">I</text>
      {:else if form==='latch'}
        <rect x="42" y="7" width="76" height="68" rx="3" fill={housing} stroke={ink} stroke-opacity=".35"/><path d={active?'M48 19H112V67H48Z':'M48 9H112V59L48 68Z'} fill={face}/><rect x="58" y={active?28:19} width="44" height="8" fill={active?accent:ink}/><path d="M58 47H102 M58 52H102" stroke={ink} opacity=".3"/>
      {:else if form==='strap'}
        <path d="M19 33Q80 2 141 33V58Q80 87 19 58Z" fill={ink}/><path d={active?'M28 23Q80 60 132 23V49Q80 73 28 49Z':'M28 31Q80 -2 132 31V56Q80 29 28 56Z'} fill={face}/><path d="M66 34H94 M66 40H94 M66 46H94" stroke={accent} stroke-width="3"/>
      {:else if form==='bolt'}
        <path d="M15 25H145V60H15Z" fill={face} stroke={ink} stroke-width="3"/><rect x={active?50:18} y="33" width="91" height="19" fill={`url(#${uid}-metal)`} stroke={ink}/><path d={`M${active?86:54} 18v45`} stroke={ink} stroke-width="12"/><path d={`M${active?86:54} 18v25`} stroke={accent} stroke-width="7"/>
      {:else if form==='lever' || form==='guard'}
        {#if form==='guard'}<path d="M37 67V14H123V67" fill="none" stroke={ink} stroke-width="12"/><path d="M37 14H123" stroke={accent} stroke-width="8"/>{/if}
        <ellipse cx="80" cy="52" rx="23" ry="15" fill={face} stroke={ink} stroke-width="3"/><path d={active?'M80 52L100 22':'M80 52L58 28'} stroke={ink} stroke-width="10"/><ellipse cx={active?102:56} cy={active?20:26} rx="13" ry="9" fill={accent} stroke={ink} stroke-width="2"/>
      {:else if form==='binary'}
        {#each [0,1] as i}<path d={`M${20+i*66} 13h54v54h-54Z`} fill={housing}/>{#each Array.from({length:9}) as _,j}<rect x={29+i*66+(j%3)*13} y={22+Math.floor(j/3)*13} width="8" height="8" fill={accent} opacity={Number(active)===i?1:.15}/>{/each}{/each}
      {/if}
    {:else}
      <g transform={`translate(0 ${active?4*depth:0})`}>
      {#if form==='tile'}<rect x="15" y="12" width="130" height="57" rx="4" fill={active?accent:face}/><path d="M33 51H127" stroke={ink} stroke-width="2"/>
      {:else if form==='crosskey'}<path d="M80 5L144 40 80 75 16 40Z" fill={active?accent:face} fill-opacity={active?1:.1} stroke={ink} stroke-width="2"/><path d="M80 0V23 M80 57V80 M0 40H51 M109 40H160" stroke={ink}/><circle cx="80" cy="40" r="9" fill={accent}/>
      {:else if form==='fold'}<path d="M22 17H137V71H22Z" fill={ink}/><path d="M16 10H119L132 24V64H16Z" fill={active?accent:face} stroke={ink} stroke-width="2"/><path d="M119 10V24H132" fill={accent} stroke={ink}/><path d="M30 42H109" stroke={ink} stroke-width="3"/>
      {:else if form==='cushion'}<path d="M17 27Q25 0 80 9Q135 0 143 27Q158 68 115 72H45Q2 69 17 27Z" fill={active?accent:face}/><path d="M17 27Q25 0 80 9Q135 0 143 27Q158 68 115 72H45Q2 69 17 27Z" fill={`url(#${uid}-dome)`}/><path d="M67 38H93" stroke={ink} stroke-width="5" stroke-linecap="round"/>
      {:else if form==='glasskey'}<circle cx="80" cy="40" r="33" fill={face} fill-opacity=".4" stroke={ink}/><circle cx="80" cy="40" r="24" fill={active?accent:'none'} stroke="white" stroke-opacity=".7"/><path d="M62 22Q80 10 98 22" fill="none" stroke="white" stroke-width="3"/>
      {:else if form==='touch'}<path d="M8 24H152V57H8Z" fill={ink}/><path d="M25 48H135" stroke={active?face:accent} stroke-width={active?6:2}/><circle cx="80" cy="35" r="5" fill={accent}/>
      {:else if form==='piano'}<path d="M48 4H112V76H48Z" fill={housing} stroke={ink} stroke-opacity=".35"/><path d="M52 8H108V63L52 72Z" fill={active?accent:face}/><path d="M62 16H98V25H62Z" fill={ink}/><path d="M62 52H98" stroke={ink} stroke-opacity=".25"/>
      {:else if form==='rubber'}<rect x="26" y="6" width="108" height="70" rx="18" fill={housing} stroke={ink} stroke-opacity=".35"/><rect x="33" y="10" width="94" height="58" rx="17" fill={active?accent:face}/><path d="M49 25H111 M49 32H111 M49 39H111 M49 46H111" stroke={ink} opacity=".25" stroke-width="3"/>
      {:else if form==='hexkey'}<path d="M43 5H117L146 40 117 75H43L14 40Z" fill={housing} stroke={ink} stroke-opacity=".35"/><path d="M48 12H112L136 40 112 66H48L24 40Z" fill={active?accent:face}/><path d="M48 12H112L136 40 112 66H48L24 40Z" fill={`url(#${uid}-metal)`}/><circle cx="80" cy="39" r="9" fill={accent}/>
      {:else if form==='typewriter'}<ellipse cx="80" cy="49" rx="37" ry="26" fill={ink}/><ellipse cx="80" cy="34" rx="34" ry="25" fill={active?accent:face} stroke={ink} stroke-width="4"/><ellipse cx="80" cy="34" rx="27" ry="18" fill="none" stroke={ink}/>
      {:else if form==='guardkey'}<path d="M25 73V8H135V73" fill="none" stroke={ink} stroke-width="12"/><rect x="42" y="23" width="76" height="45" rx="5" fill={active?accent:face}/><path d="M28 9H132" stroke={accent} stroke-width="7"/>
      {:else if form==='pixelkey'}<path d="M33 8H127V72H33Z" fill={housing}/>{#each Array.from({length:15}) as _,i}<rect x={45+(i%5)*16} y={19+Math.floor(i/5)*17} width="9" height="9" fill={accent} opacity={active?1:(i%5===2?.8:.18)}/>{/each}
      {/if}
      </g>
    {/if}
    </g>
    <text x="80" y="96" text-anchor="middle" fill={legend} font-size="11" font-family="inherit">{label || (toggle ? 'SWITCH' : 'PRESS')}{toggle ? ` Â· ${active?'ON':'OFF'}` : ''}</text>
  {/if}
</svg>

<style>
  .anatomy{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;user-select:none}
  text{font-variant-numeric:tabular-nums}
  :global(.canvas-control.preview-interactive:hover:not(.preview-disabled)) > :global(*) .anatomy{filter:brightness(1.08)}
</style>
