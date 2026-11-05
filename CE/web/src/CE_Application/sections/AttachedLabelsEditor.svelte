<script>
  // The Labels attached to a control (utils/attachedLabels.js): each listed with what it shows and a
  // way to select it, and a button for each thing the control can have a Label show. Every Label is
  // a control of its own, styled on its own Text tab.
  import { getSection, addAttachedLabel } from '../stores/controls.js';
  import { activePanel, selectComponent } from '../stores/panels.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import Tags from 'lucide-svelte/icons/tags';
  import { flatControls } from '../utils/containment.js';
  import { getSliderValueMode } from '../utils/sliderBehavior.js';
  import { authoredShownText, LABEL_SHOWS, labelShows } from '../utils/labelShows.js';

  let { control = null } = $props();

  const WORDS = new Map([...LABEL_SHOWS.filter(([key]) => key).map(([key, words]) => [key, words.replace(/ of$/, '')]), ['caption', 'Caption']]);

  let core = $derived(getSection(control, 'Core'));
  let panelControls = $derived($activePanel?.controls ?? []);
  let attached = $derived(core?.id
    ? flatControls(panelControls).filter((c) => c?._children?.Core?.attachedTo === core.id)
    : []);
  // What this control can have a Label show: a knob's or slider's name, value and range (a range's
  // handles too); a meter's the same, and a caption in its own words; a button's its text (its
  // caption, which stays the button's) and its name.
  let type = $derived(String(core?.controlType ?? ''));
  let isMeter = $derived(type === 'Meter' || type === 'ProgressBar');
  let isSlider = $derived(!!getSection(control, 'Behavior') && String(getSection(control, 'Behavior')?.family ?? '').toLowerCase() === 'range');
  let ranged = $derived(isSlider && getSliderValueMode(getSection(control, 'Behavior')) !== 'single');
  let offered = $derived(isMeter ? ['name', 'value', 'min', 'max', 'unit', 'caption']
    : isSlider ? ['name', 'value', 'min', 'max', 'unit', ...(ranged ? ['start', 'end'] : [])]
      : ['text', 'name']);
  const addLabel = (shows) => (shows === 'caption'
    ? addAttachedLabel(core.id, '', { content: String(getSection(control, 'Meter')?.label ?? '').trim() || 'Caption' })
    : addAttachedLabel(core.id, shows));

  const shownWords = (label) => {
    const text = authoredShownText(label, panelControls);
    return text ?? String(label?._children?.Text?.content ?? '');
  };
</script>

{#if core?.id}
  <PropertySection title="Labels" icon={Tags}>
    {#each attached as label (label._children.Core.id)}
      {@const shows = labelShows(label)}
      <PropertyCell label={WORDS.get(shows) ?? 'Text'} span={4} hint="A Label of its own, attached to this control. Select it to style it with every text property.">
        <div class="attached-row">
          <span class="attached-words">{shownWords(label) ? `“${shownWords(label)}”` : '—'}</span>
          <span class="attached-name">{label._children.Core.name}</span>
          <button class="attached-btn" type="button" onclick={() => selectComponent(label._children.Core.id, false)}>Select</button>
        </div>
      </PropertyCell>
    {/each}
    <PropertyCell label="Add" span={4} hint="A Label showing this, placed beside the control and attached to it.">
      <div class="add-row">
        {#each offered as shows (shows)}
          <button class="add-btn" type="button" onclick={() => addLabel(shows)}>+ {WORDS.get(shows)}</button>
        {/each}
      </div>
    </PropertyCell>
    <p class="attached-note">
      Each is a Label of its own: select it to style it with every text property. It moves, copies and
      deletes with this control, and Alt+click selects the control with its Labels.{#if !isMeter && !isSlider}
      A Label showing its text prints it in place of the control.{/if}
    </p>
  </PropertySection>
{/if}

<style>
  .attached-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
  }

  .attached-words {
    min-width: 74px;
    font-size: 12px;
    color: #E6EDF3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .attached-name {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    color: #7F8A96;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .add-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .attached-btn,
  .add-btn {
    border: 1px solid #3B3B3B;
    background: #1E1E1E;
    color: #D6D6D6;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }

  .add-btn {
    border-color: #2E4A66;
    background: #16263A;
    color: #9CC4EE;
  }

  .attached-btn:hover,
  .add-btn:hover {
    border-color: #5B9BD5;
  }

  .attached-note {
    grid-column: 1 / -1;
    margin: 2px 0 0;
    font-size: 11px;
    line-height: 1.5;
    color: #8B96A3;
  }
</style>
