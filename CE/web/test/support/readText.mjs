// readText — read a committed file back for comparison, in the LF form the repo is authored in.
//
// Windows checkouts carry CRLF (core.autocrlf=true, and nothing in the repo pins eol), while every
// generator and golden summary here builds its expected string in memory with \n. Comparing the two
// raw fails on Windows for a difference that is not in the content: twelve tests once reported five
// stale panels and seven controls "painting differently" when the entire diff was \r.
//
// So every freshness and golden gate reads through this. Tests that assert on file BYTES (sizes,
// costs) are defined over the LF form too, for the same reason.

import { readFileSync } from 'node:fs';

export const readText = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
