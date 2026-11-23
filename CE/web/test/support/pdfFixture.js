// PDFs written the way Illustrator writes the PDF part of an .ai file, for test/pdfArtwork.test.js:
// each top-level layer an optional content group (/OCProperties in the catalogue, the hidden ones in
// /OFF), its content marked /OC /MCn BDC ... EMC on the page, gradients as a clip and a shading.

/** A PDF of `objects` (the bodies of objects 1..n; object 1 the catalogue) and an Info dictionary. */
export function buildPdf(objects, info = null) {
  const all = [...objects];
  let infoRef = '';
  if (info) {
    all.push(`<< ${Object.entries(info).map(([k, v]) => `/${k} (${v})`).join(' ')} >>`);
    infoRef = ` /Info ${all.length} 0 R`;
  }
  let out = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  all.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${all.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${all.length + 1} /Root 1 0 R${infoRef} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

const stream = (dict, content) => `<< ${dict} /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;

/**
 * An Illustrator-like PDF of one page. `layers`: [{ name, hidden, content }] in stacking order, bottom
 * first; `resources`: { Shading, Pattern, ExtGState, Font, XObject } each name → object body, or
 * { dict, content } for a stream. Returns the file's bytes.
 */
export function illustratorPdf({ width = 200, height = 200, layers = [], resources = {}, creator = 'Adobe Illustrator 28.0 (Macintosh)', pages = 1 } = {}) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  add('CATALOG');
  add('PAGES');
  const ocgs = layers.map((layer) => add(`<< /Type /OCG /Name (${layer.name}) >>`));
  const resourceText = Object.entries(resources).map(([category, entries]) => {
    const refs = Object.entries(entries).map(([key, body]) => {
      const n = add(typeof body === 'string' ? body : stream(body.dict, body.content));
      return `/${key} ${n} 0 R`;
    });
    return `/${category} << ${refs.join(' ')} >>`;
  }).join(' ');
  const properties = layers.map((_, i) => `/MC${i} ${ocgs[i]} 0 R`).join(' ');
  const content = layers.map((layer, i) => `/OC /MC${i} BDC\n${layer.content}\nEMC`).join('\n');
  const pageRefs = [];
  for (let p = 0; p < pages; p += 1) {
    const contentRef = add(stream('', content));
    pageRefs.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${contentRef} 0 R /Resources << /Properties << ${properties} >> ${resourceText} >> >>`));
  }
  const off = layers.map((layer, i) => (layer.hidden ? `${ocgs[i]} 0 R` : '')).filter(Boolean).join(' ');
  objects[0] = `<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [${ocgs.map((n) => `${n} 0 R`).join(' ')}] /D << /Order [${ocgs.map((n) => `${n} 0 R`).join(' ')}] /OFF [${off}] >> >> >>`;
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages} >>`;
  return buildPdf(objects, creator ? { Creator: creator } : null);
}

/** A circle of radius `r` about (cx, cy) as PDF path operators (four Béziers). */
export function circle(cx, cy, r) {
  const k = 0.5523 * r;
  return [
    `${cx + r} ${cy} m`,
    `${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} c`,
    `${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} c`,
    `${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} c`,
    `${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} c`,
    'h',
  ].join(' ');
}
