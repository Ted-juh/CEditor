<script lang="ts">
  /**
   * Binds ScrubControl to a JUCE 8 WebSliderRelay.
   *
   * The relay speaks normalised 0..1, which is exactly what the core works in,
   * so there's no conversion layer — this component only owns the plumbing:
   * two-way sync, automation gestures, and discrete-parameter stepping.
   */
  import * as Juce from 'juce-framework-frontend';
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

  interface SliderProperties {
    numSteps?: number;
    label?: string;
    name?: string;
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

  let sliderState = $derived(Juce.getSliderState(identifier));
  let value = $state(0);
  let scaled = $state(0);
  let properties = $state<SliderProperties>({});

  // The identifier is a prop and can change when a reusable control is rebound.
  // Reconnect to the matching relay and detach from the old one in that case.
  $effect(() => {
    const relay = sliderState;
    const onValue = () => {
      // Host automation, preset recall, or another view of the same parameter.
      value = relay.getNormalisedValue();
      scaled = relay.getScaledValue();
    };
    const onProps = () => { properties = (relay.properties ?? {}) as SliderProperties; };

    onValue();
    onProps();

    const valueListener = relay.valueChangedEvent.addListener(onValue);
    const propertiesListener = relay.propertiesChangedEvent?.addListener(onProps);
    return () => {
      relay.valueChangedEvent.removeListener(valueListener);
      if (propertiesListener !== undefined) relay.propertiesChangedEvent?.removeListener(propertiesListener);
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
    sliderState.setNormalisedValue(v);
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
  onDragStart={() => sliderState.sliderDragStarted()}
  onDragEnd={() => sliderState.sliderDragEnded()}
  {...config}
/>
