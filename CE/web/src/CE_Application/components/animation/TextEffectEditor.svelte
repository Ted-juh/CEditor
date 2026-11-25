<script>
  /**
   * A text effect's settings (utils/textEffects.js): which effect, in or out, how the words are cut
   * and in what order, the stagger between pieces, and what only some effects have — a direction
   * (roll, push, wipe), how far and how large (explode), a colour (typewriter, shimmer). And where it
   * plays: the control's own words, or a part's.
   *
   * Every change is one write of the fields it touches (`onpatch`); the tab merges them into the
   * animation, one undo step each, as the other kinds' editors do.
   */
  import PropertySelect from '../../properties/PropertySelect.svelte';
  import Segmented from '../../properties/Segmented.svelte';
  import NumberCell from '../../properties/NumberCell.svelte';
  import PathBar from './PathBar.svelte';
  import { cleanFrameColour } from '../../utils/keyframeAnimation.js';
  import { TEXT_EFFECTS, TEXT_EFFECT_NAMES, readTextEffect } from '../../utils/textEffects.js';
  import { isSliderFamily } from '../../utils/anatomyWords.js';

  let { row = null, control = null, onpatch = () => {} } = $props();

  let effect = $derived(readTextEffect({ ...(row?.animation ?? {}), enabled: true, kind: 'text' }));
  let has = $derived({
    direction: ['roll', 'push', 'wipe'].includes(effect?.effect),
    burst: effect?.effect === 'explode',
    colour: effect?.effect === 'typewriter' || effect?.effect === 'shimmer',
  });
  let colourText = $state('');
  $effect(() => { colourText = effect?.colour ?? ''; });

  /** A new effect starts from its own defaults; the way and where it plays stay. */
  function pickEffect(name) {
    const base = TEXT_EFFECTS[name];
    if (!base) return;
    onpatch({
      effect: name,
      split: base.split,
      order: base.order[effect?.way ?? 'in'],
      stagger: base.stagger,
      duration: base.duration,
      ...(base.direction ? { direction: base.direction } : {}),
      ...(name === 'explode' ? { scatter: base.scatter, scale: base.scale } : {}),
      colour: base.colour ?? null,
    });
  }

  function pickWay(way) {
    const base = TEXT_EFFECTS[effect?.effect] ?? TEXT_EFFECTS.typewriter;
    onpatch({ way, order: base.order[way] });
  }

  function commitColour() {
    const clean = cleanFrameColour(colourText);
    if (clean || colourText.trim() === '') onpatch({ colour: clean });
    else colourText = effect?.colour ?? '';
  }

  const PLACE = (target) => (String(target?.path ?? '').startsWith('Parts.') ? { path: `Parts.${String(target.path).split('.')[1]}` } : { path: 'Transform' });
</script>

{#if effect}
  <div class="txfx" data-text-effect>
    <div class="r">
      <span class="lab">Effect</span>
      <PropertySelect ariaLabel="Text effect" value={effect.effect}
                      options={TEXT_EFFECT_NAMES.map((name) => ({ value: name, label: TEXT_EFFECTS[name].label }))}
                      onchange={pickEffect} />
      <Segmented options={[{ value: 'in', label: 'In' }, { value: 'out', label: 'Out' }]} value={effect.way}
                 ariaLabel="In or out" onchange={pickWay} />
    </div>
    <div class="r">
      <span class="lab">Cut into</span>
      <Segmented options={[{ value: 'letter', label: 'Letters' }, { value: 'word', label: 'Words' }, { value: 'line', label: 'Lines' }, { value: 'whole', label: 'Whole' }]}
                 value={effect.split} ariaLabel="Cut into" onchange={(value) => onpatch({ split: value })} />
    </div>
    {#if effect.split !== 'whole'}
      <div class="r">
        <span class="lab">Order</span>
        <Segmented options={[{ value: 'forward', label: 'Forward' }, { value: 'reverse', label: 'Backward' }, { value: 'centre', label: 'From centre' }, { value: 'random', label: 'Random' }]}
                   value={effect.order} ariaLabel="Order" onchange={(value) => onpatch({ order: value })} />
        <div class="cell"><NumberCell label="ms apart" value={effect.stagger} min={0} step={5}
          onchange={(value) => onpatch({ stagger: Math.max(0, Math.round(value)) })} /></div>
      </div>
    {/if}
    {#if has.direction}
      <div class="r">
        <span class="lab">Moves</span>
        <Segmented options={[{ value: 'left', label: '←' }, { value: 'right', label: '→' }, { value: 'up', label: '↑' }, { value: 'down', label: '↓' }]}
                   value={effect.direction} ariaLabel="Moves" onchange={(value) => onpatch({ direction: value })} />
      </div>
    {/if}
    {#if has.burst}
      <div class="r">
        <span class="lab">Flies</span>
        <div class="cell"><NumberCell label="px" value={effect.scatter} min={0} step={5}
          onchange={(value) => onpatch({ scatter: Math.max(0, Math.round(value)) })} /></div>
        <div class="cell"><NumberCell label="× size" value={effect.scale} min={0.1} step={0.1}
          onchange={(value) => onpatch({ scale: Math.max(0.1, Math.round(value * 100) / 100) })} /></div>
      </div>
    {/if}
    {#if has.colour}
      <div class="r">
        <label class="lab" for="txfx-colour">{effect.effect === 'shimmer' ? 'Light' : 'Arrives in'}</label>
        <input id="txfx-colour" class="txt" type="text" bind:value={colourText} placeholder="AARRGGBB"
               title="Eight hex digits, AARRGGBB, as the document stores colours; empty for none"
               onchange={commitColour} />
        {#if effect.colour}<span class="sw" style:background={`#${effect.colour.slice(2)}${effect.colour.slice(0, 2)}`} aria-hidden="true"></span>{/if}
      </div>
    {/if}
    <div class="r">
      <span class="lab">Plays on</span>
      <PathBar {control} kind="keyframes" compact value={PLACE(row?.targets?.[0])}
               onchange={(target) => onpatch({ targets: [{ path: target.path === 'Transform' ? 'Text' : target.path }] })} />
    </div>
    {#if isSliderFamily(control)}
      <p class="hint">On a knob's numbers and ticks each one is a piece, round the scale in order; Whole plays them together. Its handle labels are cut as a Label's words are.</p>
    {:else}
      <p class="hint">On the words, a piece at a time, in Preview and in the plug-in. Text with an outline, a glow or a gradient fill plays it whole.</p>
    {/if}
  </div>
{/if}

<style>
  .txfx { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #AEB9C4; }
  .r { display: flex; align-items: center; gap: 8px; min-height: 30px; flex-wrap: wrap; }
  .lab { flex: 0 0 76px; color: #AEB9C4; }
  .cell { width: 120px; }
  .txt {
    width: 110px; height: 28px; box-sizing: border-box; padding: 0 8px; border: 1px solid #3A434C; border-radius: 4px;
    background: #12161A; color: #E8EEF5; font: 13px/1 'IBM Plex Mono', ui-monospace, monospace;
  }
  .sw { width: 18px; height: 18px; border-radius: 3px; border: 1px solid #3A434C; }
  .hint { margin: 2px 0 0; color: #8A949C; font-size: 12px; line-height: 1.4; }
</style>
