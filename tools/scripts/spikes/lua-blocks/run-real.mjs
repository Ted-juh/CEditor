import { readFileSync, readdirSync } from 'node:fs';
import { luaToBlocks, blocksToLua, sameMeaning, countRaw } from './roundtrip.mjs';

const dir = new URL('../../../ctrl49/', import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.endsWith('.lua'));

let pass = 0, fail = 0;
for (const f of files) {
  const src = readFileSync(`${dir}/${f}`, 'utf8');
  const lines = src.split('\n').length;
  try {
    const blocks = luaToBlocks(src);
    const out = blocksToLua(blocks);
    const ok = sameMeaning(src, out);
    const r = countRaw(blocks);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${f.padEnd(26)} ${String(lines).padStart(4)} lines, ${String(blocks.length).padStart(3)} top-level blocks, fallbacks: ${r.stmts} stmt / ${r.exprs} expr`);
    ok ? pass++ : fail++;
  } catch (e) {
    console.log(`ERR   ${f.padEnd(26)} ${e.message}`);
    fail++;
  }
}
console.log(`\n${pass} passed, ${fail} failed, over ${files.length} real Lua files`);
