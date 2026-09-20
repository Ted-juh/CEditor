<script>
  import PhysicalCell from './PhysicalCell.svelte';
  import { performancePath } from '../utils/performanceShapes.js';
  let { form='rect', x=0,y=0,w=100,h=100,face,ink,accent,active=false,echo=false,depth=.6 }=$props();
  const uid=$props.id();
  let path=$derived(performancePath(form,w,h));
</script>
<g transform={`translate(${x} ${y})`} data-performance-form={form} data-active={active}>
  {#if form.startsWith('physical-')}
    <PhysicalCell design={form.slice(9)} {path} {w} {h} {face} {ink} {accent} {active} {echo} {depth}/>
  {:else}
  <defs><radialGradient id={`${uid}-skin`} cx=".3" cy=".2"><stop stop-color="white" stop-opacity={depth*.65}/><stop offset=".7" stop-color={face}/><stop offset="1" stop-color="black" stop-opacity={depth*.4}/></radialGradient></defs>
  {#if !active}<path d={path} transform="translate(0 2)" fill="black" opacity=".35"/>{/if}
  <path d={path} fill={active?accent:face} stroke={echo?accent:ink} stroke-width={echo?3:1.5}/>
  {#if ['petal','ribbed','pod'].includes(form)}<path d={path} fill={`url(#${uid}-skin)`} opacity={active?.25:1}/>{/if}
  {#if form==='porthole'}<ellipse cx={w/2} cy={h/2} rx={w*.38} ry={h*.38} fill="none" stroke={accent} stroke-width="3"/>{#each [0,1,2,3] as i}<circle cx={w*(.5+Math.cos(i*Math.PI/2)*.43)} cy={h*(.5+Math.sin(i*Math.PI/2)*.43)} r={Math.min(w,h)*.025} fill={ink}/>{/each}
  {:else if form==='reel'}{#each [0,1,2] as i}<ellipse cx={w*(.5+Math.cos(i*Math.PI*2/3-Math.PI/2)*.28)} cy={h*(.5+Math.sin(i*Math.PI*2/3-Math.PI/2)*.28)} rx={w*.105} ry={h*.105} fill={ink} opacity=".65"/>{/each}
  {:else if form==='concertina' || form==='ribbed'}{#each [0,1,2,3,4] as i}<path d={`M${w*(.2+i*.15)} ${h*.2}V${h*.8}`} stroke={ink} opacity=".22" stroke-width="3"/>{/each}
  {:else if form==='fan'}{#each [0,1,2,3,4] as i}<path d={`M${w*.5} ${h*.91}L${w*(.15+i*.175)} ${h*.2}`} stroke={ink} opacity=".35"/>{/each}
  {:else if form==='shutter'}{#each [0,1,2] as i}<path d={`M${w*.5} ${h*.5}L${w*.32} 0`} stroke={ink} transform={`rotate(${i*120} ${w/2} ${h/2})`} opacity=".5"/>{/each}
  {:else if form==='gear'}<ellipse cx={w/2} cy={h/2} rx={w*.29} ry={h*.29} fill="none" stroke={accent} stroke-width="3"/>
  {:else if form==='diamond'}<path d={`M${w*.24} ${h*.48}L${w*.5} ${h*.2}L${w*.76} ${h*.48}`} fill="none" stroke="white" opacity=".5" stroke-width="3"/>
  {:else if form==='shield'}<path d={`M${w*.18} ${h*.18}H${w*.82}M${w*.5} ${h*.78}V${h*.88}`} stroke={accent} stroke-width="3"/>
  {:else if form==='hex'}<path d={`M${w*.3} ${h*.08}H${w*.7}`} stroke={accent} stroke-width="4"/>
  {:else if form==='pod'}<path d={`M${w*.1} ${h*.35}V${h*.65}M${w*.9} ${h*.35}V${h*.65}`} stroke={accent} stroke-width="3"/>{/if}
  {/if}
</g>
