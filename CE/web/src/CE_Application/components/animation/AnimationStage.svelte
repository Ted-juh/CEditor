<script>
  /**
   * The stage: the armed control, drawn live, on a preview session of its own.
   *
   * Seeing an animation used to mean leaving the editor for Preview and performing the trigger
   * yourself at full speed. Here the control is drawn by the real renderers (the same
   * InteractiveTestSurface the Interaction tab uses), so you can hover, press and drag it in place,
   * and Play performs the selected animation's trigger for you — the state it starts from, the
   * change, and the way back — with Slow stretching every animation on the stage to four times its
   * length. utils/animationPlayback.js has the plan; this runs it.
   *
   * The session is the stage's own and never touches the panel's, so nothing here can leave the
   * document or the Preview in a pressed state, and slow motion never reaches the panel.
   */
  import { onDestroy, untrack } from 'svelte';
  import Play from 'lucide-svelte/icons/play';
  import Square from 'lucide-svelte/icons/square';
  import InteractiveTestSurface from '../InteractiveTestSurface.svelte';
  import { createInteractionPreviewSession } from '../../stores/interactionPreview.js';
  import { requestAnimationPlay } from '../../stores/animationActivity.js';
  import { resolveInteractiveControl } from '../../utils/interactionRuntime.js';
  import { playbackPlan } from '../../utils/animationPlayback.js';

  let {
    control = null,
    row = null,
  } = $props();

  /** Slow is a time scale on the stage's session: 4 means every animation takes four times as long. */
  const SLOW_SCALE = 4;

  let controlId = $derived(control?._children?.Core?.id ?? '');
  let session = $state({});
  let slow = $state(false);
  let playing = $state(false);
  let stepLabel = $state('');
  let timer = null;
  let runId = 0;

  // A different control gets a fresh session: a press left over from the last one is not this one's.
  $effect(() => {
    controlId;
    untrack(() => {
      stop();
      session = control ? createInteractionPreviewSession(control) : {};
    });
  });

  let staged = $derived({ ...session, animationTimeScale: slow ? SLOW_SCALE : 1 });
  let resolved = $derived(control ? resolveInteractiveControl(control, staged) : null);
  let plan = $derived(row ? playbackPlan(control, row, { timeScale: slow ? SLOW_SCALE : 1 }) : null);

  function patch(next = {}) {
    session = { ...session, ...next };
  }

  function stop() {
    runId += 1;
    if (timer) clearTimeout(timer);
    timer = null;
    playing = false;
    stepLabel = '';
  }

  function play() {
    if (!plan?.ok) return;
    stop();
    if (plan.request) {
      // A beat or script keyframe animation: ask for it, as ce.anim.play would.
      requestAnimationPlay(controlId, row?.name);
      return;
    }
    const id = runId;
    const steps = plan.steps;
    playing = true;
    let index = 0;
    const next = () => {
      if (id !== runId) return;
      if (index >= steps.length) { playing = false; stepLabel = ''; return; }
      const step = steps[index];
      index += 1;
      patch(step.session);
      stepLabel = step.label;
      timer = setTimeout(next, step.hold);
    };
    next();
  }

  onDestroy(stop);
</script>

<div class="stage-box">
  <div class="stage-tools">
    <button type="button" class="play" disabled={!plan?.ok && !playing}
            title={playing ? 'Stop' : plan?.ok ? (plan.request ? `Play ${row?.name ?? ''} now` : `Play ${row?.name ?? ''}: ${plan.steps.map((step) => step.label).join(' → ')}`) : (plan?.reason ?? 'Select an animation')}
            aria-label={playing ? 'Stop' : 'Play'}
            onclick={() => (playing ? stop() : play())}>
      {#if playing}<Square size={10} />{:else}<Play size={10} />{/if}
      {playing ? 'Stop' : 'Play'}
    </button>
    <button type="button" class="slow" class:on={slow} aria-pressed={slow}
            title="Slow motion: every animation on the stage takes four times as long. The panel is not affected."
            onclick={() => { slow = !slow; }}>
      0.25×
    </button>
    <span class="steplabel" aria-live="polite">{stepLabel}</span>
  </div>
  <div class="stage">
    {#if control && resolved}
      <InteractiveTestSurface
        {control}
        resolvedControl={resolved.control}
        resolvedRuntime={resolved.runtime}
        session={staged}
        onpatchsession={patch}
        compact
      />
    {/if}
  </div>
  {#if plan && !plan.ok}
    <p class="why">{plan.reason}</p>
  {:else if plan?.note}
    <p class="why">{plan.note}</p>
  {/if}
</div>

<style>
  .stage-box {
    border: 1px solid #333;
    border-radius: 4px;
    background: #1A1D20;
    padding: 6px 8px 8px;
    margin-bottom: 8px;
  }
  .stage-tools { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
  .play, .slow {
    display: inline-flex; align-items: center; gap: 4px;
    height: 22px; padding: 0 8px;
    border: 1px solid #333B42; border-radius: 3px; background: #12171A;
    color: #9AA6AE; font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer;
  }
  .play { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }
  .play:hover:not(:disabled) { border-color: #14B8A6; color: #C9FFF8; }
  .play:disabled { opacity: 0.35; cursor: default; }
  .slow.on { border-color: #5B9BD5; background: #173449; color: #EAF5FF; }
  .steplabel {
    margin-left: auto;
    font: 500 9px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #8FEDE3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stage {
    position: relative;
    height: 132px;
    border-radius: 3px;
    background:
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px) 0 0 / 14px 14px,
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px) 0 0 / 14px 14px,
      #0C0F12;
    overflow: hidden;
  }
  .why { margin: 6px 0 0; font: 400 9px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #8A949C; }
</style>
