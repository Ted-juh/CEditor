<script>
  /**
   * What a part tab (Knob, Button, Switch, Meter) says when its control has one of the illustrated
   * forms, Iris's and Satellite's (models/controlAnatomy.js isIllustratedForm): the form is drawn as a
   * whole, so the tab's parts do not apply to it. The tab dims them under this note. It used to send
   * the author to Convert to Parts, which these forms do not have.
   */
  let { name = '' } = $props();
</script>

<p class="illustrated-note" data-illustrated-note>
  <b>The {name} is an illustration.</b> It is drawn as a whole, so these parts do not apply to it. Its
  colours, size and depth are in Core › Control design. To edit it part by part, choose one of the
  other forms there.
</p>

<style>
  .illustrated-note {
    margin: 6px 8px; padding: 7px 9px; border: 1px solid #5A4C2E; border-left: 3px solid #E6C27A; border-radius: 4px;
    background: #2A2620; color: #DCD6C8; font-size: 11px; line-height: 1.45;
  }
  b { color: #F0E3C2; }
</style>
