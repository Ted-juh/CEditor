# dragScrub

Pointer-drag value scrubbing for JUCE 8 WebView UIs. All interaction lives in the
frontend; C++ only ever sees a normalised value arriving through a relay.

```
dragScrub.ts         core — state machine + math, no DOM, no framework
dragScrubAction.ts   Svelte action — pointer capture, lock, wheel, keyboard
ScrubControl.svelte  widget — linear or rotary render, same core
JuceScrub.svelte     binds the widget to a WebSliderRelay parameter
```

## Use

```svelte
<script>
  import JuceScrub from './JuceScrub.svelte';
</script>

<!-- vertical drag, plugin-standard -->
<JuceScrub identifier="gain" shape="rotary" preset="knob" defaultValue={0.5} />

<!-- bidirectional: up and right both open it up -->
<JuceScrub identifier="cutoff" shape="rotary" preset="knobBidirectional" pointerLock />

<!-- every pixel of motion counts, any direction -->
<JuceScrub identifier="drive" shape="rotary" preset="knobFreeform" />

<!-- unbounded rotation in a small footprint -->
<JuceScrub identifier="phase" shape="rotary" preset="rotary" />

<!-- classic track-mapped slider -->
<JuceScrub identifier="mix" shape="linear" preset="linearHorizontal" />
```

Without JUCE, use `ScrubControl` directly with `value` / `onChange`.

## Measured behaviour

100 px of travel, sensitivity set so 200 px covers the full range:

| combine | right | up | up-right | up-left |
|---|---|---|---|---|
| `sum` | 0.500 | 0.500 | **0.707** | **0.000** |
| `projected` | 0.354 | 0.354 | 0.500 | 0.000 |
| `magnitude` | 0.500 | 0.500 | 0.500 | **-0.500** |

`sum` runs 1.41× on the diagonal and has a dead path where the opposing
diagonal cancels. `projected` never exceeds the pixels actually travelled — the
safe default — but pure-horizontal only counts for 71%; set `increaseAngle: 0`
if you want full horizontal rate with vertical contributing partially.
`magnitude` is the "nothing is wasted" option: same rate in every direction,
only the sign changes.

## C++ side

Nothing changes structurally — the relay is the whole interface.

```cpp
class Editor : public juce::AudioProcessorEditor
{
public:
    explicit Editor (Processor& p)
        : juce::AudioProcessorEditor (p),
          webView (juce::WebBrowserComponent::Options{}
              .withNativeIntegrationEnabled()
              .withOptionsFrom (gainRelay)
              .withOptionsFrom (cutoffRelay)
              .withResourceProvider ([this] (const auto& url) { return getResource (url); }))
    {
        addAndMakeVisible (webView);
        webView.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
        setSize (600, 400);
    }

private:
    juce::WebSliderRelay gainRelay   { "gain" };
    juce::WebSliderRelay cutoffRelay { "cutoff" };
    juce::WebBrowserComponent webView;

    juce::WebSliderParameterAttachment gainAttachment {
        *dynamic_cast<Processor&> (processor).params.getParameter ("gain"), gainRelay, nullptr };
    juce::WebSliderParameterAttachment cutoffAttachment {
        *dynamic_cast<Processor&> (processor).params.getParameter ("cutoff"), cutoffRelay, nullptr };
};
```

The identifier string must match the `identifier` prop exactly.
`WebSliderRelay`'s constructor signature changed during the JUCE 8 beta — if it
rejects a single-string argument, your version wants `(webBrowser, name)`.

## Webview gotchas

**Pointer lock is an enhancement, never a dependency.** WebView2 supports it;
WKWebView is inconsistent. The action requests it, checks
`document.pointerLockElement` to see whether it actually took, and works from
plain client coordinates when it didn't. Without lock the drag stalls at the
screen edge — annoying, not broken.

**Don't read `movementX`/`movementY` unless locked.** They are unreliable in
embedded webviews and scale with device pixel ratio on some platforms. The core
takes positions and derives deltas itself; `movementX` is only used to
integrate a virtual position while locked.

**Guard the feedback loop.** `valueChangedEvent` fires for host automation *and*
for your own `setNormalisedValue`. The action ignores external values while a
drag is in progress, otherwise the host and the gesture fight each other.

**Wrap gestures.** `sliderDragStarted()` / `sliderDragEnded()` map to
`beginChangeGesture` / `endChangeGesture`. Skip them and automation recording
produces one point per frame instead of a clean envelope. `JuceScrub` wires
these for drags, wheel and double-click.

**`touch-action: none`** is set by the action — without it the webview scrolls
instead of dragging on trackpad and touch.

**Webview zoom scales your sensitivity**, since everything is in CSS pixels. If
you support a resizable editor, scale `sensitivity` by the same factor.

## Settings surface

Expose `axis`, `invertX`/`invertY` and `sensitivity` per widget. Keep `combine`,
weights and `increaseAngle` behind an advanced reveal, and only show them when
`axis` is `both`. `deadZone`, `fineFactor` and `coarseFactor` work as global
defaults that almost nobody overrides.

Splitters and scrollbars derive their axis from orientation — give them no
direction setting at all.

## One distinction to keep

`combine` belongs strictly to controls that derive **one** value from two axes.
An XY pad, a curve point or a joystick derives **two** values from two axes,
which is two independent instances side by side. They look similar in config and
share no logic.
