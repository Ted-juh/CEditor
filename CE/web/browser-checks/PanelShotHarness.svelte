<script>
  // A whole .cepanel rendered at 1:1, so a generated panel can be looked at rather than reasoned
  // about. It exists because two bugs in the AN1x panel were invisible to every structural check:
  // a Combobox whose Behavior.buttonType had been elided drew NOTHING, and four curve lanes drew
  // in the stock blue because their colours had been written under a child section nothing reads.
  // Both were obvious in a screenshot and inspectable in neither the JSON nor the DOM shape.
  //
  // Each control gets the default preview session the editor would give it, so a fader sits where
  // its parameter's default puts it rather than at the channel floor. Without it every bar, cap
  // and pointer draws at minimum and the shot says nothing about whether the defaults landed.
  import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';
  import { createInteractionPreviewSession } from '../src/CE_Application/stores/interactionPreview.js';
  import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
  let { panel } = $props();
  const controls = $derived(panel?.controls ?? []);
  // The session alone is not enough: a custom component's parts are moved by resolving its
  // bindings AGAINST the session, and that resolved control is what the editor hands the renderer.
  // Passing only the session leaves every bar and cap where it was authored.
  const previews = $derived(new Map(controls.map((control) => {
    const session = createInteractionPreviewSession(control);
    return [control._children?.Core?.id, { session, resolved: resolveInteractiveControl(control, session) }];
  })));
</script>

<div class="panel" style="width:{panel.width}px;height:{panel.height}px;background:#{String(panel.bgColour ?? 'FF202020').slice(2)}">
  {#each controls as control (control._children?.Core?.id)}
    <CanvasControl
      {control}
      scale={1}
      panelLocked={false}
      allControls={controls}
      panelControls={controls}
      panelWidth={panel.width}
      panelHeight={panel.height}
      editorInteractionEnabled={false}
      previewSessionOverride={previews.get(control._children?.Core?.id)?.session}
      resolvedControlOverride={previews.get(control._children?.Core?.id)?.resolved?.control ?? control}
      interactionRuntimeOverride={previews.get(control._children?.Core?.id)?.resolved?.runtime ?? null}
    />
  {/each}
</div>

<style>
  .panel { position: relative; overflow: hidden; }
</style>
