<script>
  import { getSection, updateControlProperty, removeControlNode, applyControlPatch } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { setDebugDock } from '../stores/debugDock.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import { ANIMATION_KINDS, SPRING_DEFAULTS, animationWithKind } from '../utils/animationModel.js';
  import HeaderPill from '../properties/HeaderPill.svelte';
  import OpenInDock from '../properties/OpenInDock.svelte';
  import Play from 'lucide-svelte/icons/play';
  import Target from 'lucide-svelte/icons/target';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Zap from 'lucide-svelte/icons/zap';

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

  /** One write for the kind and, for a spring, the numbers it needs (`animationWithKind`). */
  function setAnimationKind(kind) {
    if (!core?.id || !selectedAnimationName || !selectedAnimation) return;
    updateControlProperty(core.id, `Animations.${selectedAnimationName}`, animationWithKind(selectedAnimation, kind, control));
  }

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

<!--
  The way into the dock tab that covers this editor, in PropertySection's `tools` slot.
  Until this button existed the tab could not be reached from the properties panel at all —
  you had to find it in the dock strip yourself and press "Use selection".
  utils/dockOpeners.js has the reasoning and the registry.
-->
{#snippet openAnimationTab()}
  <OpenInDock tab="animation" controlId={core?.id ?? ''} what="this control's animations" compact />
{/snippet}

{#if multiEdit}
  <div class="placeholder">Animation editing is single-selection only right now.</div>
{:else if animations}
  <PropertySection title="Animation List" icon={Play} tools={openAnimationTab}>
    <PropertyCell label="Add" span={3} hint="Create a new animation node.">
      <input class="val" type="text" bind:value={newAnimationName} placeholder="Animation name" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Create the animation with a neutral transition shape." compact>
      <button class="action-btn" onclick={addAnimation}>Add</button>
    </PropertyCell>
    <PropertyCell label="Animations" span={3} hint="Select the animation to edit.">
      <select class="val" bind:value={selectedAnimationName}>
        {#each animationNames as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected animation." compact>
      <button class="action-btn danger" onclick={removeAnimation} disabled={!selectedAnimationName}>Remove</button>
    </PropertyCell>
  </PropertySection>

  {#if selectedAnimation}
    {#if partNames.length}
      <PropertySection title="Target" icon={Target}>
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
          <button class="action-btn" onclick={appendTarget}>Append target</button>
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

    <PropertySection title="Animation" icon={Pencil}>
      {#snippet tools()}
        <HeaderPill value={selectedAnimation.enabled !== false}
                    title="Enable or disable this animation."
                    onchange={() => setAnimationProp('enabled', !(selectedAnimation.enabled !== false))} />
      {/snippet}
      {#if selectedAnimation.enabled !== false}
      <PropertyCell label="Kind" span={2} hint="Transition eases between states on a named curve. Spring overshoots and settles, the same curve as ce.anim.spring, with its damping and frequency below. Keyframes is a sequence along a time axis, one track per target, edited in the Animation tab.">
        <select class="val" value={ANIMATION_KINDS.includes(selectedAnimation.kind) ? selectedAnimation.kind : 'transition'} onchange={(e) => setAnimationKind(e.target.value)}>
          {#each ANIMATION_KINDS as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label={selectedAnimation.kind === 'spring' ? 'Settle' : selectedAnimation.kind === 'keyframes' ? 'Length' : 'Duration'} span={1} compact hint="How long the change takes, in milliseconds. For a spring, the time it takes to settle; for keyframes, the length of the time axis.">
        <NumberCell label="Dur" value={selectedAnimation.duration ?? 120} step={1} min={0} defaultValue={120} onchange={(value) => setAnimationProp('duration', value)} />
      </PropertyCell>
      <PropertyCell label="Delay" span={1} compact hint="Transition delay in milliseconds.">
        <NumberCell label="Delay" value={selectedAnimation.delay ?? 0} step={1} min={0} defaultValue={0} onchange={(value) => setAnimationProp('delay', value)} />
      </PropertyCell>
      {#if selectedAnimation.kind === 'keyframes'}
        <PropertyCell label="Loop" span={1} compact hint="Play the sequence again from the start when it ends.">
          <HeaderPill value={selectedAnimation.loop === true} title="Loop" onchange={() => setAnimationProp('loop', !(selectedAnimation.loop === true))} />
        </PropertyCell>
        <PropertyCell label="Hold" span={1} compact hint="Keep the last frame while the state that started it is still active; off, the control returns to its static look when the sequence ends.">
          <HeaderPill value={selectedAnimation.hold !== false} title="Hold" onchange={() => setAnimationProp('hold', !(selectedAnimation.hold !== false))} />
        </PropertyCell>
        <PropertyCell label="Keyframes" span={2} hint="The tracks and their keyframes are drawn and edited on the Animation tab's timeline.">
          <OpenInDock tab="animation" controlId={core?.id ?? ''} what="this animation's keyframes" />
        </PropertyCell>
      {:else if selectedAnimation.kind === 'spring'}
        <PropertyCell label="Damping" span={1} compact hint="How fast the bounce dies away. Less is bouncier.">
          <NumberCell label="Damp" value={selectedAnimation.damping ?? SPRING_DEFAULTS.damping} step={0.5} min={0.5} defaultValue={SPRING_DEFAULTS.damping} onchange={(value) => setAnimationProp('damping', value)} />
        </PropertyCell>
        <PropertyCell label="Frequency" span={1} compact hint="How many times it swings on the way. More is busier.">
          <NumberCell label="Freq" value={selectedAnimation.frequency ?? SPRING_DEFAULTS.frequency} step={1} min={1} defaultValue={SPRING_DEFAULTS.frequency} onchange={(value) => setAnimationProp('frequency', value)} />
        </PropertyCell>
      {:else}
        <PropertyCell label="Easing" span={2} hint="Named easing curve, mapped to a CSS timing function.">
          <select class="val" value={selectedAnimation.easing ?? 'outQuad'} onchange={(e) => setAnimationProp('easing', e.target.value)}>
            {#each EASING_OPTIONS as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </PropertyCell>
      {/if}
      <PropertyCell label="Trigger" span={2} hint="Trigger family that causes this transition to run.">
        <select class="val" value={selectedAnimation.trigger?.type ?? 'stateChange'} onchange={(e) => setAnimationProp('trigger.type', e.target.value)}>
          {#each TRIGGER_TYPES as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
      {/if}
    </PropertySection>

    {#if selectedAnimation.trigger?.type === 'stateChange'}
      <PropertySection title="State Trigger" icon={Zap}>
        <PropertyCell label="From" span={2} hint="Comma-separated previous states. Use * to match any state set.">
          <input class="val" type="text" value={(selectedAnimation.trigger?.from ?? []).join(', ')} onchange={(e) => handleTriggerList('from', e.target.value)} />
        </PropertyCell>
        <PropertyCell label="To" span={2} hint="Comma-separated next states that activate this animation.">
          <input class="val" type="text" value={(selectedAnimation.trigger?.to ?? []).join(', ')} onchange={(e) => handleTriggerList('to', e.target.value)} />
        </PropertyCell>
      </PropertySection>
    {:else}
      <PropertySection title="Value Trigger" icon={Zap}>
        <PropertyCell label="Source" span={4} hint="Value source that should be smoothed by this transition.">
          <input class="val" type="text" value={selectedAnimation.trigger?.source ?? 'value.normalized'} onchange={(e) => setAnimationProp('trigger.source', e.target.value)} />
        </PropertyCell>
      </PropertySection>
    {/if}

    <PropertySection title="Targets" icon={Target}>
      <PropertyCell label="Targets" span={4} hint="JSON array of target descriptors. Each item can provide a path and optional property hints.">
        <textarea class="val code" rows="12" bind:value={targetsDraft} onblur={commitTargets}></textarea>
      </PropertyCell>
      <PropertyCell label="" span={4} hint="Send the selected animation payload to the Debug panel." compact>
        <div class="patch-footer">
          <span class="error">{parseError}</span>
          <button class="action-btn" onclick={dumpAnimationDebug}>Debug animation</button>
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

  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }

  /* A textarea wears `.val` too, and the shared skin is sized for a single-line field. Rows
     decide its height; the token is only a floor. */
  textarea.val {
    height: auto;
    min-height: var(--pp-field-height, 26px);
    padding: 4px 6px;
    line-height: 1.4;
    resize: vertical;
  }

  .val.code {
    font-family: Consolas, 'Courier New', monospace;
    line-height: 1.4;
  }

  .val:focus {
    border-color: var(--pp-field-focus, #5B9BD5);
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
