<script>
  import { getSection, updateControlProperty, removeControlNode, applyControlPatch } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { setDebugDock } from '../stores/debugDock.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let designer = $derived(getSection(control, 'Designer'));
  let parts = $derived(getSection(control, 'Parts'));
  let animations = $derived(getSection(control, 'Animations'));
  let multiEdit = $derived($selectedComponentIds.size > 1);
  let partNames = $derived(Object.keys(parts?._children ?? {}));
  let selectedLayer = $derived(partNames.includes(designer?.selectedLayer) ? designer.selectedLayer : (partNames[0] ?? ''));

  let selectedAnimationName = $state('');
  let newAnimationName = $state('');
  let targetsDraft = $state('[]');
  let parseError = $state('');
  let targetPart = $state('');
  let targetProperty = $state('Layout.scale');
  let quickState = $state('pressed');

  let animationNames = $derived(Object.keys(animations?._children ?? {}));
  let selectedAnimation = $derived(animations?._children?.[selectedAnimationName] ?? null);

  $effect(() => {
    if (designer?.selectedAnimation && animationNames.includes(designer.selectedAnimation)) {
      selectedAnimationName = designer.selectedAnimation;
      return;
    }
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

  function selectedTargetDescriptor() {
    const target = TARGET_PROPERTIES.find((entry) => entry.path === targetProperty) ?? TARGET_PROPERTIES[0];
    return {
      path: `Parts.${targetPart || selectedLayer}.${target.path}`,
      properties: target.props,
    };
  }

  function appendTarget() {
    if (!core?.id || !selectedAnimationName || !(targetPart || selectedLayer)) return;
    try {
      const parsed = JSON.parse(targetsDraft || '[]');
      const nextTargets = Array.isArray(parsed) ? parsed : [];
      nextTargets.push(selectedTargetDescriptor());
      updateControlProperty(core.id, `Animations.${selectedAnimationName}.targets`, nextTargets);
      targetsDraft = JSON.stringify(nextTargets, null, 2);
      parseError = '';
    } catch (error) {
      parseError = error?.message ?? 'Invalid JSON';
    }
  }

  function addQuickAnimation(kind) {
    if (!core?.id || !(targetPart || selectedLayer)) return;
    const partName = targetPart || selectedLayer;
    const stateName = quickState || 'pressed';
    const property = kind === 'rotate' ? 'rotation' : 'scale';
    const animationName = `${partName}_${kind}_${stateName}`;
    const target = kind === 'fade'
      ? { path: `Parts.${partName}.opacity`, properties: ['opacity'] }
      : { path: `Parts.${partName}.Layout.${property}`, properties: ['transform'] };
    const partPatch = kind === 'fade'
      ? { opacity: stateName === 'disabled' ? 0.45 : 0.82 }
      : { [`Layout.${property}`]: kind === 'rotate' ? 12 : 0.94 };

    applyControlPatch(core.id, {
      [`Animations.${animationName}`]: {
        _type: 'Animation',
        name: animationName,
        enabled: true,
        kind: 'transition',
        trigger: { type: 'stateChange', from: ['*'], to: [stateName] },
        targets: [target],
        duration: kind === 'press' ? 90 : 140,
        delay: 0,
        easing: kind === 'press' ? 'outQuad' : 'inOutQuad',
      },
      [`States.${stateName}`]: {
        _type: 'State',
        name: stateName,
        group: 'interaction',
        description: `${stateName} visual state for ${partName}.`,
        enabled: true,
        when: { [stateName]: true },
        patches: {
          component: {},
          parts: { [partName]: partPatch },
        },
      },
      'Designer.selectedLayer': partName,
    });
    selectedAnimationName = animationName;
  }

  const TRIGGER_TYPES = ['stateChange', 'valueChange'];
  const EASING_OPTIONS = ['linear', 'outQuad', 'inOutQuad', 'outCubic'];
  const TARGET_PROPERTIES = [
    { path: 'Layout.scale', props: ['transform'], label: 'Scale' },
    { path: 'Layout.rotation', props: ['transform'], label: 'Rotation' },
    { path: 'Layout.x', props: ['transform'], label: 'X Position' },
    { path: 'Layout.y', props: ['transform'], label: 'Y Position' },
    { path: 'opacity', props: ['opacity'], label: 'Opacity' },
    { path: 'Background.Fill.colour', props: ['background-color'], label: 'Fill Colour' },
    { path: 'Text.Fill.colour', props: ['color'], label: 'Text Colour' },
  ];
  const QUICK_STATES = ['hover', 'pressed', 'focused', 'dragging', 'disabled', 'checked'];

  $effect(() => {
    if (!targetPart && selectedLayer) targetPart = selectedLayer;
  });
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
    {#if partNames.length}
      <PropertySection title="Guided Targets">
        <PropertyCell label="Part" span={2} hint="Layer/part this animation target should affect.">
          <select class="val" bind:value={targetPart}>
            {#each partNames as name}
              <option value={name}>{name}</option>
            {/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Property" span={2} hint="Common animatable property.">
          <select class="val" bind:value={targetProperty}>
            {#each TARGET_PROPERTIES as target}
              <option value={target.path}>{target.label}</option>
            {/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Append" span={2} hint="Add this target to the selected animation target list.">
          <button class="action-btn" onclick={appendTarget}>Append Target</button>
        </PropertyCell>
        <PropertyCell label="State" span={1} hint="State used by quick animation presets.">
          <select class="val" bind:value={quickState}>
            {#each QUICK_STATES as state}
              <option value={state}>{state}</option>
            {/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Quick" span={1} hint="Create a state and animation preset for the chosen part.">
          <div class="mini-actions">
            <button class="mini-btn" type="button" onclick={() => addQuickAnimation('press')}>Scale</button>
            <button class="mini-btn" type="button" onclick={() => addQuickAnimation('rotate')}>Rotate</button>
            <button class="mini-btn" type="button" onclick={() => addQuickAnimation('fade')}>Fade</button>
          </div>
        </PropertyCell>
      </PropertySection>
    {/if}

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
      <PropertyCell label="Easing" span={2} hint="Named easing curve, mapped to a CSS timing function.">
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

  .mini-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    width: 100%;
  }

  .mini-btn {
    min-height: 24px;
    border: 1px solid #3B3B3B;
    background: #252525;
    color: #DDD;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
  }

  .mini-btn:hover {
    border-color: #5B9BD5;
    color: #FFF;
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
