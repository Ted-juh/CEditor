<script>
  /**
   * Dispatches a tab id to the right section editor. Used by PropertiesPanel
   * in four places (single + multi × normal + pinned-split views), all of
   * which used an identical if/else chain.
   *
   *   contextMode — 'panel' | 'component'
   *   tabId       — current tab id
   *   control     — $selectedControl (only used when contextMode is 'component')
   *   fallbackLabel — human label for the placeholder
  */
  import { isStateScopableTabId } from '../utils/stateTargets.js';
  import {
    ensureSectionEditorComponent,
    getSectionEditorComponent,
    hasSectionEditor,
  } from './sectionEditorLoaders.js';

  let {
    contextMode = 'panel',
    tabId = '',
    control = null,
    scopedControl = null,
    stateTargetKey = 'base',
    fallbackLabel = '',
  } = $props();

  let editorControl = $derived.by(() => {
    if (contextMode !== 'component' || !control) return control;
    if (!isStateScopableTabId(tabId)) return control;
    return scopedControl ?? control;
  });
  let textEditorRenderKey = $derived(
    `${control?._children?.Core?.id ?? 'none'}:${stateTargetKey}:${editorControl?._children?.Text?.content ?? ''}:${editorControl?._children?.Text?._children?.Font?.family ?? 'Arial'}`
  );
  let editorProps = $derived.by(() => {
    if (contextMode === 'panel') {
      return { tabId };
    }

    if (tabId === 'core') return { control };
    if (tabId === 'behavior') return { control };
    if (tabId === 'states') return { control };
    if (tabId === 'bindings') return { control };
    if (tabId === 'animations') return { control };
    return { control: editorControl };
  });
  let editorInstanceKey = $derived(
    tabId === 'text'
      ? textEditorRenderKey
      : `${contextMode}:${tabId}:${control?._children?.Core?.id ?? 'none'}`
  );
  let hasDedicatedEditor = $derived(hasSectionEditor(contextMode, tabId));
  let EditorComponent = $state(null);

  $effect(() => {
    let cancelled = false;

    if (!hasDedicatedEditor) {
      EditorComponent = null;
      return () => {
        cancelled = true;
      };
    }

    const existing = getSectionEditorComponent(contextMode, tabId);
    if (existing) {
      EditorComponent = existing;
      return () => {
        cancelled = true;
      };
    }

    EditorComponent = null;
    ensureSectionEditorComponent(contextMode, tabId).then((component) => {
      if (cancelled) return;
      EditorComponent = component;
    });

    return () => {
      cancelled = true;
    };
  });
</script>

{#if !hasDedicatedEditor}
  <div class="placeholder">Component: {fallbackLabel}</div>
{:else if EditorComponent}
  {#key editorInstanceKey}
    <EditorComponent {...editorProps} />
  {/key}
{:else}
  <div class="placeholder">Loading {fallbackLabel || tabId}…</div>
{/if}

<style>
  .placeholder {
    grid-column: span 4;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    color: #444;
    font-size: 11px;
  }
</style>
