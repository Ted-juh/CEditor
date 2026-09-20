<script>
  let {design,path,w,h,face,ink,accent,active,echo,depth}=$props();
  const uid=$props.id();
  const paint=n=>`url(#${uid}-${n})`;
  let small=$derived(Math.min(w,h));
</script>
<defs>
  <linearGradient id={`${uid}-edge`} x2=".3" y2="1"><stop stop-color="#fff7dc"/><stop offset=".17" stop-color={face}/><stop offset=".5" stop-color="#30302a"/><stop offset=".6" stop-color={face}/><stop offset="1" stop-color="#101611"/></linearGradient>
  <radialGradient id={`${uid}-skin`} cx=".32" cy=".15" r=".9"><stop stop-color="white" stop-opacity=".8"/><stop offset=".35" stop-color={face}/><stop offset=".8" stop-color={face}/><stop offset="1" stop-color="#161b17"/></radialGradient>
  <linearGradient id={`${uid}-glass`} x2=".6" y2="1"><stop stop-color="white" stop-opacity=".7"/><stop offset=".48" stop-color={face} stop-opacity=".1"/><stop offset=".5" stop-color="white" stop-opacity=".35"/><stop offset="1" stop-color={face} stop-opacity=".05"/></linearGradient>
  <pattern id={`${uid}-grain`} width="6" height="5" patternUnits="userSpaceOnUse"><rect width="6" height="5" fill={face}/><path d="M0 1l3 2 3-1M3 3v2" stroke="#321e12" stroke-opacity=".28" fill="none"/><path d="M0 0l3 2 3-1" stroke="white" stroke-opacity=".15" fill="none"/></pattern>
  <clipPath id={`${uid}-clip`}><path d={path}/></clipPath>
</defs>
<!-- Every layer stays within the shared hit outline, including its recessed mount. -->
<path d={path} fill={paint('edge')} stroke={echo?accent:'#121814'} stroke-width={echo?2:1}/>
<g clip-path={paint('clip')}>
  <path d={path} transform={`translate(${w*.07} ${h*.09}) scale(.86 .86)`} fill="#101614"/>
  <g transform={`translate(${w*.10} ${h*(active?.14:.06)}) scale(.80 .80)`}>
    <path d={path} transform={`translate(0 ${h*.08})`} fill="#161a17"/>
    <path d={path} fill={active?accent:design==='leatherbound'?paint('grain'):paint('skin')} stroke={face} stroke-width="1"/>
    {#if design==='brassworks'}<ellipse cx={w/2} cy={h/2} rx={w*.40} ry={h*.40} fill="none" stroke={paint('edge')} stroke-width={small*.05}/>{#each [0,1,2,3] as i}<circle cx={w*(.5+Math.cos(i*Math.PI/2)*.42)} cy={h*(.5+Math.sin(i*Math.PI/2)*.42)} r={small*.04} fill={paint('edge')} stroke="#34352b" stroke-width=".6"/>{/each}
    {:else if design==='bakelite'}{#each [0,1,2,3,4,5,6,7] as i}<path d={`M${w*.5} ${h*.12}v${h*.08}`} transform={`rotate(${i*45} ${w/2} ${h/2})`} stroke={ink} stroke-opacity=".35" stroke-width={small*.04}/>{/each}<ellipse cx={w*.5} cy={h*.4} rx={w*.23} ry={h*.21} fill="none" stroke="white" stroke-opacity=".18"/>
    {:else if design==='hi-fi'}<path d={`M${w*.14} ${h*.16}H${w*.86}M${w*.14} ${h*.2}H${w*.86}`} stroke="white" stroke-opacity=".6"/><path d={`M${w*.15} ${h*.79}H${w*.85}`} stroke={ink} stroke-opacity=".25" stroke-width={small*.05}/>
    {:else if design==='porcelain'}<path d={path} transform={`translate(${w*.09} ${h*.09}) scale(.82)`} fill="none" stroke="white" stroke-opacity=".65" stroke-width={small*.025}/><ellipse cx={w*.35} cy={h*.21} rx={w*.16} ry={h*.045} fill="white" opacity=".6"/>
    {:else if design==='flightdeck'}<path d={`M${w*.22} ${h*.12}H${w*.78}M${w*.22} ${h*.88}H${w*.78}`} stroke={ink} stroke-width={small*.05}/><path d={`M${w*.25} ${h*.16}H${w*.75}`} stroke={accent} stroke-width={small*.035}/>
    {:else if design==='stompbox'}{#each [0,1,2,3,4] as i}<path d={`M${w*.15} ${h*(.2+i*.13)}H${w*.85}`} stroke={ink} stroke-opacity=".24" stroke-width={small*.045}/>{/each}
    {:else if design==='switchboard'}<ellipse cx={w/2} cy={h/2} rx={w*.32} ry={h*.32} fill="none" stroke={paint('edge')} stroke-width={small*.07}/><ellipse cx={w/2} cy={h/2} rx={w*.26} ry={h*.26} fill="none" stroke="#161b17" stroke-opacity=".5"/>
    {:else if design==='chronograph'}{#each Array.from({length:20}) as _,i}<path d={`M${w*.5} ${h*.09}v${h*.06}`} transform={`rotate(${i*18} ${w/2} ${h/2})`} stroke={ink} stroke-width={small*.017}/>{/each}<ellipse cx={w/2} cy={h/2} rx={w*.31} ry={h*.31} fill="none" stroke="white" stroke-opacity=".7"/>
    {:else if design==='cassette-deck'}<path d={`M${w*.12} ${h*.16}H${w*.88}M${w*.12} ${h*.21}H${w*.88}M${w*.12} ${h*.8}H${w*.88}`} stroke={ink} stroke-opacity=".5" stroke-width={small*.025}/>
    {:else if design==='diesel'}{#each [0,1,2] as i}<path d={`M${w*(.24+i*.24)} ${h*.12}l${w*.08} ${h*.1}m${-w*.08} ${h*.5}l${w*.08} ${h*.1}`} stroke={ink} stroke-width={small*.05} stroke-opacity=".5"/>{/each}
    {:else if design==='gemstone'}<path d={`M${w*.5} 0L${w*.7} ${h*.5} ${w*.5} ${h} ${w*.3} ${h*.5}Z`} fill={paint('glass')} stroke="white" stroke-opacity=".6"/><path d={`M0 ${h*.5}H${w}L${w*.5} ${h}Z`} fill={accent} opacity=".25"/>
    {:else if design==='leatherbound'}<path d={path} transform={`translate(${w*.08} ${h*.08}) scale(.84)`} fill="none" stroke="#edc795" stroke-width={small*.018} stroke-dasharray="3 2"/>
    {/if}
    {#if ['porcelain','gemstone','bakelite','switchboard'].includes(design)}<path d={path} fill={paint('glass')} opacity={.3+depth*.5}/>{/if}
    <path d={`M${w*.43} ${h*.82}H${w*.57}`} stroke={active?ink:accent} stroke-width={Math.max(1,small*.035)}/>
  </g>
</g>
