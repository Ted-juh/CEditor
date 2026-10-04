// svgArtworkFonts.test.js — the fonts an SVG's text names, found and carried inside the SVG.
import test from 'node:test';
import assert from 'node:assert/strict';

import { embedSvgFonts, svgFontUsage } from '../src/CE_Application/utils/svgArtworkFonts.js';

const ART = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100">
  <defs><style>.cls-1{font-family:Rubik-Medium, Rubik;font-weight:500}</style></defs>
  <g font-family="Allerta Stencil">
    <text x="10" y="30">CUTOFF</text>
    <text x="10" y="60" class="cls-1">Res<tspan style="font-family:'Comic Neue'">!</tspan></text>
  </g>
  <text x="200" y="90" font-family="sans-serif">plain</text>
</svg>`;

test('text fonts are found from attributes, style, classes and the groups around them', () => {
  const usage = svgFontUsage(ART);
  const byFamily = Object.fromEntries(usage.map((u) => [u.candidates[0], u]));
  assert.deepEqual(Object.keys(byFamily).sort(), ['Allerta Stencil', 'Comic Neue', 'Rubik-Medium', 'sans-serif']);
  assert.deepEqual(byFamily['Rubik-Medium'].candidates, ['Rubik-Medium', 'Rubik'], 'the whole list, in order');
  assert.equal(byFamily['Rubik-Medium'].weight, 500);
  assert.equal(String.fromCodePoint(...byFamily['Allerta Stencil'].characters.sort((a, b) => a - b)), 'CFOTU');
  assert.deepEqual(byFamily['Comic Neue'].characters, ['!'.codePointAt(0)], 'a tspan inherits nothing it overrides');
  assert.deepEqual(svgFontUsage('<not svg'), []);
});

test('every face CEditor can supply is embedded, subset, under every name it was asked for; the rest are reported', async () => {
  const subsetCalls = [];
  const { svg, embedded, missing } = await embedSvgFonts(ART, {
    subset: async (dataUrl, characters) => { subsetCalls.push(characters); return 'data:font/woff2;base64,AAAA'; },
  });
  assert.deepEqual(embedded.sort(), ['Allerta Stencil', 'Rubik']);
  assert.deepEqual(missing, ['Comic Neue']);
  assert.match(svg, /^<\?xml version="1.0"\?>\n<svg[^>]*><style><!\[CDATA\[@font-face\{font-family:"Allerta Stencil"/);
  assert.match(svg, /font-family:"Rubik-Medium";font-weight:500;font-style:normal;src:url\(data:font\/woff2;base64,AAAA\) format\("woff2"\)/);
  assert.match(svg, /font-family:"Rubik";font-weight:500/, 'declared under the fallback name as well');
  assert.ok(!/sans-serif";/.test(svg), 'generic families are left to the browser');
  assert.equal(subsetCalls.length, 2);
  assert.ok(svg.endsWith('</svg>'));
});

test('artwork with no text, or text in nothing but generic families, is left exactly as it was', async () => {
  const plain = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
  assert.equal((await embedSvgFonts(plain)).svg, plain);
  const generic = '<svg xmlns="http://www.w3.org/2000/svg"><text font-family="serif">x</text></svg>';
  assert.equal((await embedSvgFonts(generic, { subset: async () => 'unused' })).svg, generic);
});

test('with the real subsetter the carried face is a small WOFF2', async () => {
  const { svg, embedded } = await embedSvgFonts('<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Allerta Stencil">AB</text></svg>');
  assert.deepEqual(embedded, ['Allerta Stencil']);
  const data = svg.match(/url\((data:[^)]+)\)/)[1];
  assert.match(data, /^data:font\/woff2;base64,/);
  assert.ok(data.length < 20000, `subset to the characters used (${data.length} chars)`);
});
