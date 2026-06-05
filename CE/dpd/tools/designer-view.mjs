// Designer "resolved view" surface (Layer 1 UI principle: the user edits a fully-resolved synth).
// Renders a real DPD profile as the mockup's parameter table — including the multi-wire receive
// column the new schema adds. Self-contained HTML so it's viewable without the editor app.
// Run: node CE/dpd/tools/designer-view.mjs roland.gaia  -> CE/dpd/build/designer.html
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProfile, resolveParams } from './dpd.mjs';

const id = process.argv[2] ?? 'roland.gaia';
const resolved = resolveProfile(id);
const params = resolveParams(resolved).filter((p) => p.instance === 0); // resolved Tone 1 + Global

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const msgOf = (p) => p.wires.write?.msg === 'cc' ? `CC ${p.wires.write.cc}` : 'SysEx';
const rxOf = (p) => p.wires.rxLive ? (p.wires.rxLive.msg === 'cc' ? `CC ${p.wires.rxLive.cc}` : 'DT1') : '—';
const vtype = (p) => ({ continuous: 'Continuous', signed: 'Signed', enum: `Enum · ${p.enum?.length ?? 0}`, toggle: 'Toggle', trigger: 'Trigger' }[p.valueType] ?? p.valueType);
const rng = (p) => p.valueType === 'enum' ? p.enum.map((e) => e.label).join(' / ') : `${p.range?.min ?? 0} – ${p.range?.max ?? 127}`;

const rows = params.map((p) => `
  <tr>
    <td class="pname">${esc(p.name)}<span class="scope">${esc(p.scope)}</span></td>
    <td><span class="ptype ${p.wires.write?.msg === 'cc' ? 'cc' : 'sysex'}">${esc(msgOf(p))}</span></td>
    <td><span class="vtype ${p.valueType}">${esc(vtype(p))}</span></td>
    <td class="addr">${esc(p.absAddress ?? '—')}</td>
    <td class="rx ${p.wires.rxLive?.msg === 'cc' ? 'cc' : ''}">${esc(rxOf(p))}</td>
    <td class="rng">${esc(rng(p))}</td>
    <td class="chk">✓</td>
  </tr>`).join('');

const prov = resolved.provenance ?? {};
const completeness = `${params.length} parameters · round-trip ${prov.verifiedRoundTrip ? '✓' : '—'} · hardware ${prov.verifiedOnHardware ?? 'not yet'} · ${resolved.completeness ?? 'partial'}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(resolved.label)} — Device Profile</title>
<style>
  body{margin:0;background:#181a1b;color:#e6e6e6;font:14px/1.5 'Segoe UI',system-ui,sans-serif}
  .wrap{max-width:920px;margin:0 auto;padding:28px}
  h1{font-size:20px;margin:0 0 2px} .based{color:#8a8f93;font-size:12.5px;margin-bottom:4px}
  .meter{color:#7fd6a8;font-size:12.5px;margin:10px 0 18px;padding:8px 12px;background:#1e2426;border:1px solid #2a3133;border-radius:8px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:#8a8f93;font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;padding:0 10px 8px;border-bottom:1px solid #2a3133}
  td{padding:9px 10px;border-bottom:1px solid #23282a;vertical-align:middle}
  .pname{font-weight:600} .scope{margin-left:8px;font-size:10px;color:#6b7173;background:#22282a;padding:2px 6px;border-radius:4px;text-transform:uppercase}
  .ptype{font-size:11px;font-weight:600;padding:3px 9px;border-radius:5px;border:1px solid}
  .ptype.sysex{color:#4dd6a0;border-color:rgba(77,214,160,.3)} .ptype.cc{color:#5a9bf0;border-color:rgba(90,155,240,.3)}
  .vtype{font-size:12px} .vtype.enum{color:#a98cf0} .vtype.continuous{color:#cfd4d6} .vtype.signed{color:#e0a23c}
  .addr{font-family:'JetBrains Mono',Consolas,monospace;color:#cfd4d6} .rng{color:#9aa0a3}
  .rx{font-family:'JetBrains Mono',Consolas,monospace;color:#6b7173} .rx.cc{color:#5a9bf0}
  .chk{color:#4dd6a0;text-align:center} caption{caption-side:bottom;color:#6b7173;font-size:11.5px;padding-top:14px;text-align:left}
</style></head><body><div class="wrap">
  <h1>${esc(resolved.label)}</h1>
  <div class="based">Based on: ${esc(resolved.inherits ?? '—')} family template — checksum, byte order and SysEx header come from here</div>
  <div class="meter">${esc(completeness)}</div>
  <table>
    <thead><tr><th style="width:22%">Parameter</th><th style="width:12%">Sends</th><th style="width:15%">Value type</th><th style="width:18%">Address / CC</th><th style="width:12%">Receives</th><th style="width:16%">Range / List</th><th style="width:5%">✓</th></tr></thead>
    <tbody>${rows}
    </tbody>
    <caption>Resolved view of <b>${esc(resolved.id)}@${esc(resolved.version)}</b> — Tone 1 shown (×${resolved.deviceStructure?.tones ?? 1} tones). The <b>Receives</b> column is the new multi-wire schema: cutoff is written via SysEx DT1 but received live as CC.</caption>
  </table>
</div></body></html>`;

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');
mkdirSync(dir, { recursive: true });
const file = join(dir, 'designer.html');
writeFileSync(file, html);
console.log(`wrote ${file} (${params.length} rows)`);
console.log(`  rows incl: ${params.slice(0, 3).map((p) => `${p.name}[${msgOf(p)}/rx ${rxOf(p)}]`).join(', ')}`);
