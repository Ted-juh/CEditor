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
  import { setContext } from 'svelte';
  import { isStateScopableTabId } from '../utils/stateTargets.js';
  import { sectionEditorInstanceKey } from './sectionEditorKey.js';
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
    if (tabId === 'segments') return control;
    if (!isStateScopableTabId(tabId)) return control;
    return scopedControl ?? control;
  });
  let editorProps = $derived.by(() => {
    if (contextMode === 'panel') {
      return { tabId };
    }

    if (tabId === 'core') return { control };
    if (tabId === 'behavior') return { control };
    if (tabId === 'states') return { control };
    if (tabId === 'bindings') return { control };
    if (tabId === 'react') return { control };
    if (tabId === 'devicebindings') return { control };
    if (tabId === 'animations') return { control };
    if (tabId === 'segments') return { control, stateTargetKey };
    return { control: editorControl };
  });
  // Identity only — see sectionEditorKey.js for what used to be in here and why it is not any
  // more. In short: the Text tab keyed on the text content, so every undo remounted a 2,455-line
  // editor to change one caption.
  let editorInstanceKey = $derived(
    sectionEditorInstanceKey({
      contextMode,
      tabId,
      controlId: control?._children?.Core?.id ?? null,
      stateTargetKey,
    })
  );
  // The collapse scope every PropertySection below this point keys itself under. Deliberately
  // NOT `editorInstanceKey`: that carries the control id, and a key that varies per control is
  // exactly the behaviour being fixed — you would collapse Geometry on one knob and find it open
  // on the next.
  //
  // A getter, not a string: setContext runs once per SectionRenderer instance, but this component
  // is NOT re-created when `tabId` changes (only the keyed editor below it is), so a captured
  // string would pin every later tab's sections to the first tab's scope. The editors themselves
  // are re-created on that key, so each PropertySection calls this at its own init and reads the
  // scope as it is then.
  setContext('propertySectionScope', () => `${contextMode}:${tabId}`);

  let hasDedicatedEditor = $derived(hasSectionEditor(contextMode, tabId));
  let EditorComponent = $state(null);
  let editorComponentKey = $state('');
  let editorLoadError = $state('');
  let editorErrorKey = $state('');
  let retryKey = $state(0);

  $effect(() => {
    let cancelled = false;
    void retryKey;
    const requestedKey = `${contextMode}:${tabId}`;

    if (!hasDedicatedEditor) {
      EditorComponent = null;
      editorComponentKey = '';
      editorLoadError = '';
      editorErrorKey = '';
      return () => {
        cancelled = true;
      };
    }

    const existing = getSectionEditorComponent(contextMode, tabId);
    if (existing) {
      EditorComponent = existing;
      editorComponentKey = requestedKey;
      editorLoadError = '';
      editorErrorKey = '';
      return () => {
        cancelled = true;
      };
    }

    EditorComponent = null;
    editorComponentKey = '';
    editorLoadError = '';
    editorErrorKey = '';
    ensureSectionEditorComponent(contextMode, tabId)
      .then((component) => {
        if (cancelled) return;
        EditorComponent = component;
        editorComponentKey = requestedKey;
      })
      .catch((error) => {
        if (cancelled) return;
        editorLoadError = error?.message ?? 'The editor chunk could not be loaded.';
        editorErrorKey = requestedKey;
      });

    return () => {
      cancelled = true;
    };
  });
</script>

{#if !hasDedicatedEditor}
  <div class="placeholder">Component: {fallbackLabel}</div>
{:else if EditorComponent && editorComponentKey === `${contextMode}:${tabId}`}
  {#key editorInstanceKey}
    <EditorComponent {...editorProps} />
  {/key}
{:else if editorLoadError && editorErrorKey === `${contextMode}:${tabId}`}
  <div class="placeholder error">
    <span>Failed to load {fallbackLabel || tabId}: {editorLoadError}</span>
    <button type="button" onclick={() => retryKey += 1}>Retry</button>
  </div>
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

  .placeholder.error {
    flex-direction: column;
    gap: 8px;
    color: #B77;
  }

  .placeholder button {
    padding: 3px 10px;
    border: 1px solid #555;
    border-radius: 3px;
    background: #292929;
    color: #DDD;
    cursor: pointer;
  }
</style>
