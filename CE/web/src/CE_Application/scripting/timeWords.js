// timeWords.js — what ce.time's helpers do with a number they cannot use as written, in one place,
// so the runtime (panelRuntime.js) says it and the script editor's Values tab says it in its words.
//
// The helpers are the transport's own arithmetic (utils/transportLayout.js), and they never stop:
// a position before the start is read as the start, a bar of no beats as a bar of one, a loop of no
// length as one of 0.01 beats, and text that is not a number as the argument's default. Each gave
// an answer for a number nobody wrote, without a word. The tempo was worse: a bpm that was not above
// 0 used the transport's tempo here, and gave nothing in every prelude, and "fast" raised an error
// in Lua and Python and gave NaN in JavaScript.
//
// Each prelude reads its arguments the same way (__tread) and says the same sentence, once per call
// and argument, since these run on every frame; scriptPreludeAgreement.test.js holds the four to
// these words. Text that is a number is read as one, as it always was, and an argument left out
// is its default without a word.

import { realNumber } from './scriptColours.js';
import { shownValue as shown } from './shownValue.js';

// For each helper, the call as a script writes it and each number argument: what is used when it is
// not a number (`fallback`), the least and the most it is read as, and whether it is rounded first.
// `tempo` is the one argument whose fallback is not a number: the transport's tempo.
export const TIME_NUMBERS = {
  barBeatAt: { verb: 'ce.time.position', args: { beats: { fallback: 0, min: 0 }, beatsPerBar: { fallback: 4, min: 1 } } },
  stepAt: { verb: 'ce.time.step', args: { beats: { fallback: 0, min: 0 } } },
  stepsBetween: { verb: 'ce.time.steps', args: { from: { fallback: 0, min: 0 }, to: { fallback: 0, min: 0 }, max: { fallback: 16, min: 1, round: true } } },
  swingOffset: { verb: 'ce.time.swing', args: { step: { fallback: 0 }, amount: { fallback: 0, min: 0, max: 1 } } },
  cycleAt: { verb: 'ce.time.cycle', args: { beats: { fallback: 0, min: 0 }, bars: { fallback: 0.25, min: 0.25, max: 64 }, beatsPerBar: { fallback: 4, min: 1 } } },
  loopedBeats: { verb: 'ce.time.looped', args: { beats: { fallback: 0, min: 0 }, startBeats: { fallback: 0, min: 0 }, lengthBeats: { fallback: 0.01, min: 0.01 } } },
  beatsToMs: { verb: 'ce.time.beatsToMs', args: { beats: { fallback: 0 }, bpm: { tempo: true } } },
  msToBeats: { verb: 'ce.time.msToBeats', args: { ms: { fallback: 0 }, bpm: { tempo: true } } },
};

/**
 * A ce.time helper's number argument as the helper reads it: `n`, the number used (undefined for a
 * tempo that falls back to the transport's), and `said`, the sentence for one not used as written,
 * or null. Nothing given is the default and says nothing.
 */
export function timeNumber(memberId, name, value) {
  const helper = TIME_NUMBERS[memberId];
  const spec = helper?.args?.[name];
  if (!spec) return { n: realNumber(value), said: null };
  const say = (why, used) => ({ n: spec.tempo ? undefined : used, said: `${helper.verb}: ${name} is ${shown(value)}, which is ${why}, so ${used} was used.` });
  if (value === undefined || value === null) return { n: spec.tempo ? undefined : spec.fallback, said: null };
  const read = realNumber(value);
  if (spec.tempo) {
    if (read === undefined) return say('not a number', "the transport's tempo");
    if (!(read > 0)) return say('not above 0', "the transport's tempo");
    return { n: read, said: null };
  }
  if (read === undefined) return say('not a number', spec.fallback);
  const n = spec.round ? Math.round(read) : read;
  if (spec.min !== undefined && n < spec.min) return say(`less than ${spec.min}`, spec.min);
  if (spec.max !== undefined && n > spec.max) return say(`more than ${spec.max}`, spec.max);
  return { n, said: null };
}
