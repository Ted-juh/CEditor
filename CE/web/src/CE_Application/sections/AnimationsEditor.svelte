<script>
  import { getSection, updateControlProperty, removeControlNode } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { setDebugDock } from '../stores/debugDock.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let animations = $derived(getSection(control, 'Animations'));
  let multiEdit = $derived($selectedComponentIds.size > 1);

  let selectedAnimationName = $state('');
  let newAnimationName = $state('');
  let targetsDraft = $state('[]');
  let parseError = $state('');

  let animationNames = $derived(Object.keys(animations?._children ?? {}));
  let selectedAnimation = $derived(animations?._children?.[selectedAnimationName] ?? null);

  $effect(() => {
    if (!animationNames.length) {
      selectedAnimationName = '';
      return;
    }
    if (!selectedAnimationName || !animationNames.includes(selectedAnimationName)) {
      selectedAnimationName = animationNames[0];
    }
  });

  $effect(() => {
    targetsDraft = JSON.stringify(selectedAnimation?.targets ?? [], null, 2);
    parseError = '';
  });

  function setAnimationProp(prop, value) {
    if (!core?.id || !selectedAnimationName) return;
    updateControlProperty(core.id, `Animations.${selectedAnimationName}.${prop}`, value);
  }

  function addAnimation() {
    const name = String(newAnimationName ?? '').trim();
    if (!core?.id || !name || animations?._children?.[name]) return;
    updateControlProperty(core.id, `Animations.${name}`, {
      _type: 'Animation',
      name,
      enabled: true,
      kind: 'transition',
      trigger: {
        type: 'stateChange',
        from: ['*'],
        to: ['hover'],
      },
      targets: [],
      duration: 120,
      delay: 0,
      easing: 'outQuad',
    });
    newAnimationName = '';
    selectedAnimationName = name;
  }

  function removeAnimation() {
    if (!core?.id || !selectedAnimationName) return;
    removeControlNode(core.id, `Animations.${selectedAnimationName}`);
    selectedAnimationName = '';
  }

  function commitTargets() {
    if (!core?.id || !selectedAnimationName) return;
    try {
      const parsed = JSON.parse(targetsDraft || '[]');
      updateControlProperty(core.id, `Animations.${selectedAnimationName}.targets`, parsed);
      parseError = '';
    } catch (error) {
      parseError = error?.message ?? 'Invalid JSON';
    }
  }

  function handleTriggerList(prop, rawValue) {
    const values = String(rawValue ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    setAnimationProp(`trigger.${prop}`, values);
  }

  function dumpAnimationDebug() {
    if (!selectedAnimationName || !selectedAnimation) return;
    setDebugDock({
      title: 'Animation Debug',
      source: `${core?.id ?? ''}:${selectedAnimationName}`,
      text: JSON.stringify(selectedAnimation, null, 2),
    });
  }

  const TRIGGER_TYPES = ['stateChange', 'valueChange'];
  const EASING_OPTIONS = ['linear', 'outQuad', 'inOutQuad', 'outCubic'];
</script>

{#if multiEdit}
  <div class="placeholder">Animation editing is single-selection only right now.</div>
{:else if animations}
  <PropertySection title="Animation List">
    <PropertyCell label="Add" span={3} hint="Create a new animation node.">
      <input class="val" type="text" bind:value={newAnimationName} placeholder="Animation name" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Create the animation with a neutral transition shape.">
      <button class="action-btn" onclick={addAnimation}>Add</button>
    </PropertyCell>
    <PropertyCell label="Animations" span={3} hint="Select the animation to edit.">
      <select class="val" bind:value={selectedAnimationName}>
        {#each animationNames as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected animation.">
      <button class="action-btn danger" onclick={removeAnimation} disabled={!selectedAnimationName}>Remove</button>
    </PropertyCell>
  </PropertySection>

  {#if selectedAnimation}
    <PropertySection title="Animation">
      <PropertyCell label="Enabled" span={1} hint="Enable or disable this animation.">
        <PropertyToggle value={selectedAnimation.enabled !== false} onchange={() => setAnimationProp('enabled', !(selectedAnimation.enabled !== false))} />
      </PropertyCell>
      <PropertyCell label="Kind" span={1} hint="Animation family. Transition is the only runtime kind in this slice.">
        <input class="val" type="text" value={selectedAnimation.kind ?? 'transition'} onchange={(e) => setAnimationProp('kind', e.target.value)} />
      </PropertyCell>
      <PropertyCell label="Duration" span={1} hint="Transition duration in milliseconds.">
        <NumberInput value={selectedAnimation.duration ?? 120} step={1} min={0} onchange={(value) => setAnimationProp('duration', value)} />
      </PropertyCell>
      <PropertyCell label="Delay" span={1} hint="Transition delay in milliseconds.">
        <NumberInput value={selectedAnimation.delay ?? 0} step={1} min={0} onchange={(value) => setAnimationProp('delay', value)} />
      </PropertyCell>
      <PropertyCell label="Easing" span={2} hint="Named easing curve. The current runtime maps a small stable set to CSS timing functions.">
        <select class="val" value={selectedAnimation.easing ?? 'outQuad'} onchange={(e) => setAnimationProp('easing', e.target.value)}>
          {#each EASING_OPTIONS as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Trigger" span={2} hint="Trigger family that causes this transition to run.">
        <select class="val" value={selectedAnimation.trigger?.type ?? 'stateChange'} onchange={(e) => setAnimationProp('trigger.type', e.target.value)}>
          {#each TRIGGER_TYPES as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
    </PropertySection>

    {#if selectedAnimation.trigger?.type === 'stateChange'}
      <PropertySection title="State Trigger">
        <PropertyCell label="From" span={2} hint="Comma-separated previous states. Use * to match any state set.">
          <input class="val" type="text" value={(selectedAnimation.trigger?.from ?? []).join(', ')} onchange={(e) => handleTriggerList('from', e.target.value)} />
        </PropertyCell>
        <PropertyCell label="To" span={2} hint="Comma-separated next states that activate this animation.">
          <input class="val" type="text" value={(selectedAnimation.trigger?.to ?? []).join(', ')} onchange={(e) => handleTriggerList('to', e.target.value)} />
        </PropertyCell>
      </PropertySection>
    {:else}
      <PropertySection title="Value Trigger">
        <PropertyCell label="Source" span={4} hint="Value source that should be smoothed by this transition.">
          <input class="val" type="text" value={selectedAnimation.trigger?.source ?? 'value.normalized'} onchange={(e) => setAnimationProp('trigger.source', e.target.value)} />
        </PropertyCell>
      </PropertySection>
    {/if}

    <PropertySection title="Targets">
      <PropertyCell label="Targets" span={4} hint="JSON array of target descriptors. Each item can provide a path and optional property hints.">
        <textarea class="val code" rows="12" bind:value={targetsDraft} onblur={commitTargets}></textarea>
      </PropertyCell>
      <PropertyCell label="" span={4} hint="Send the selected animation payload to the Debug panel.">
        <div class="patch-footer">
          <span class="error">{parseError}</span>
          <button class="action-btn" onclick={dumpAnimationDebug}>Debug Animation</button>
        </div>
      </PropertyCell>
    </PropertySection>
  {/if}
{/if}

<style>
  .placeholder {
    padding: 16px;
    color: #666;
    font-size: 11px;
  }

  .val {
    width: 100%;
    min-width: 0;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    padding: 4px 6px;
    font-family: inherit;
    outline: none;
  }

  .val.code {
    font-family: Consolas, 'Courier New', monospace;
    line-height: 1.4;
  }

  .val:focus {
    border-color: #5B9BD5;
  }

  .action-btn {
    width: 100%;
    background: #252525;
    border: 1px solid #3B3B3B;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    padding: 4px 8px;
    cursor: pointer;
    font-family: inherit;
  }

  .action-btn:hover:not(:disabled) {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .action-btn.danger:hover:not(:disabled) {
    border-color: #D56B6B;
  }

  .patch-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .error {
    flex: 1;
    color: #C96A6A;
    font-size: 10px;
    min-height: 12px;
  }
</style>
