<script>
  /**
   * The panel side of the opener check: four section editors in ONE component tree.
   *
   * One tree matters. An earlier version of this harness called `mount()` once per editor, and the
   * openers then behaved as if they shared props — a click on one arming another's control. The app
   * renders every section inside a single tree (SectionRenderer inside PropertiesPanel), so four
   * roots was the harness inventing a situation the app never has.
   */
  import AnimationsEditor from '../src/CE_Application/sections/AnimationsEditor.svelte';
  import StepSequencerEditor from '../src/CE_Application/sections/StepSequencerEditor.svelte';
  import TextEditor from '../src/CE_Application/sections/TextEditor.svelte';
  import CustomPackageLibrary from '../src/CE_Application/sections/CustomPackageLibrary.svelte';

  let { custom = null, seq = null, label = null } = $props();
</script>

<div class="stack">
  <AnimationsEditor control={custom} />
  <StepSequencerEditor control={seq} />
  <TextEditor control={label} />
  <CustomPackageLibrary control={custom} />
</div>

<style>
  .stack { display: flex; flex-direction: column; }
</style>
