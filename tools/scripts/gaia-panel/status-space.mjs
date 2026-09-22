// The Status page is the display itself; instructions stay in the screen tooltip.
export function expandStatusDisplay(panel) {
  const pages = panel.controls.find(c => c._children.Core.name === 'bottom_pages');
  const children = pages._children.Children._children;
  for (const [id, c] of Object.entries(children)) {
    if (['gaia_display_caption', 'gaia_display_help'].includes(c._children.Core.name)) delete children[id];
  }
  const screen = Object.values(children).find(c => c._children.Core.name === 'gaia_status_screen');
  const display = screen._children.Display, previousCols = display.cols;
  display.parameterEditor = true;
  Object.assign(screen._children.Transform, { x: 0, y: 0, width: pages._children.Transform.width,
    height: pages._children.Transform.height - pages._children.TabContainer.stripSize });
  if (display.cols === 112 && display.rows === 12) return panel;
  // Match the pixel grid to the wide page so the 5x7 glyphs retain square dots.
  Object.assign(display, { cols: 112, rows: 12, pixelWidth: 672, pixelHeight: 96 });
  const rows = {
    PATCH: { patch_selection: 3, patch_name: 4, patch_source: 6, patch_message: 8 },
    PARAM: { param_name: 3, param_idle: 5, param_value: 5, param_text: 5, param_bar: 7, param_local: 9 },
    ARP: { arp_end: 3, arp_tempo: 3, arp_grid: 5, arp_duration: 5, arp_motif: 7, arp_feedback: 9, arp_staged: 10 },
    SYSTEM: { sys_clock: 3, sys_tempo: 5, sys_level: 7, sys_pedal: 7, sys_local: 9 },
  };
  for (const layout of display.layouts) for (const zone of layout.zones) {
    zone.colStart = Math.round(((zone.colStart ?? 1) - 1) * 112 / previousCols) + 1;
    zone.colEnd = Math.round((zone.colEnd ?? previousCols) * 112 / previousCols);
    zone.row = zone.id === 'instrument_brand' ? 1 : zone.id.startsWith('menu_') ? 12
      : zone.id === 'connection' ? 10 : rows[layout.id]?.[zone.id] ?? zone.row;
  }
  return panel;
}
