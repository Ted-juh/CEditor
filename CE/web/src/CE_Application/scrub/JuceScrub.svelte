<script lang="ts">
  /**
   * Binds ScrubControl to a JUCE 8 WebSliderRelay.
   *
   * The relay speaks normalised 0..1, which is exactly what the core works in,
   * so there's no conversion layer — this component only owns the plumbing:
   * two-way sync, automation gestures, and discrete-parameter stepping.
   */
  import * as Juce from 'juce-framework-frontend';
  import { onMount } from 'svelte';
  import ScrubControl from './ScrubControl.svelte';
  import { presets } from './dragScrub';

  interface Props {
    /** Must match the WebSliderRelay identifier declared in C++. */
    identifier: string;
    shape?: 'linear' | 'rotary';
    preset?: keyof typeof presets;
    label?: string;
    defaultValue?: number;
    pointerLock?: boolean;
    [key: string]: unknown;
  }

  let {
    identifier,
    shape = 'rotary',
    preset = 'knob',
    label,
    defaultValue,
    pointerLock = false,
    ...config
  }: Props = $props();

  const state = Juce.getSliderState(identifier);

  let value = $state(state.getNormalisedValue());
  let scaled = $state(state.getScaledValue());
  let properties = $state(state.properties);

  onMount(() => {
    const onValue = () => {
      // Host automation, preset recall, or another view of the same parameter.
      value = state.getNormalisedValue();
      scaled = state.getScaledValue();
    };
    const onProps = () => { properties = state.properties; };

    state.valueChangedEvent.addListener(onValue);
    state.propertiesChangedEvent?.addListener(onProps);
    return () => {
      state.valueChangedEvent.removeListener(onValue);
      state.propertiesChangedEvent?.removeListener(onProps);
    };
  });

  // Discrete parameters quantise in normalised space; hysteresis then stops
  // the value chattering when the pointer rests on a step boundary.
  const step = $derived(
    properties?.numSteps && properties.numSteps > 1 && properties.numSteps < 1000
      ? 1 / (properties.numSteps - 1)
      : 0
  );

  const display = $derived(
    `${typeof scaled === 'number' ? scaled.toFixed(2) : scaled}${properties?.label ? ' ' + properties.label : ''}`
  );

  function handleChange(v: number) {
    value = v;
    state.setNormalisedValue(v);
  }
</script>

<ScrubControl
  {shape}
  {preset}
  {step}
  {pointerLock}
  {defaultValue}
  {value}
  {display}
  label={label ?? properties?.name ?? identifier}
  onChange={handleChange}
  onDragStart={() => state.sliderDragStarted()}
  onDragEnd={() => state.sliderDragEnded()}
  {...config}
/>
