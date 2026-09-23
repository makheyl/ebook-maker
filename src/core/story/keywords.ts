import type { Params } from '../animation/types';

export type BeatKind = 'entrance' | 'action' | 'exit' | 'idle';

export type KeywordRule = {
  id: string;
  /** Whole-word match with simple stems. English only. */
  pattern: RegExp;
  kind: BeatKind;
  /** A step motion id, or an idle motion id for kind 'idle'. */
  motion: string;
  params?: Params;
};

/**
 * Story words → character motions, highest priority first. Negation ("didn't jump") is not
 * understood — the author reviews every suggestion before applying.
 */
export const KEYWORD_RULES: readonly KeywordRule[] = [
  {
    id: 'hop',
    pattern: /\b(jump(s|ed|ing)?|hop(s|ped|ping)?|leap(s|t|ed|ing)?|bounc(e|es|ed|ing))\b/i,
    kind: 'action',
    motion: 'hop',
  },
  {
    id: 'arrive',
    pattern:
      /\b(walk(s|ed|ing)?|run(s|ning)?|ran|went|go(es|ing)?|came|come(s)?|arriv(e|es|ed|ing))\b/i,
    kind: 'entrance',
    motion: 'walkIn',
  },
  { id: 'wave', pattern: /\b(wave(s|d)?|waving|hello|hi|hey)\b/i, kind: 'action', motion: 'wave' },
  {
    id: 'happy',
    pattern:
      /\b(happy|happily|yay|hooray|cheer(s|ed|ing)?|laugh(s|ed|ing)?|giggl(e|es|ed|ing)|celebrat(e|es|ed|ing))\b/i,
    kind: 'action',
    motion: 'excited',
  },
  { id: 'dance', pattern: /\b(danc(e|es|ed|ing)|party)\b/i, kind: 'action', motion: 'dance' },
  {
    id: 'sleep',
    pattern: /\b(sleep(s|y|ing)?|slept|tired|yawn(s|ed|ing)?|night|dream(s|ed|ing|t)?)\b/i,
    kind: 'idle',
    motion: 'snooze',
  },
  {
    id: 'scared',
    pattern: /\b(scared|afraid|frighten(ed)?|cold|nervous|shiver(s|ed|ing)?)\b/i,
    kind: 'action',
    motion: 'shiver',
  },
  { id: 'no', pattern: /\b(no|nope|refus(e|es|ed|ing))\b/i, kind: 'action', motion: 'shakeNo' },
  {
    id: 'look',
    pattern: /\b(look(s|ed|ing)?|search(es|ed|ing)?|find(s|ing)?|found|where)\b/i,
    kind: 'action',
    motion: 'lookAround',
  },
  {
    id: 'float',
    pattern: /\b(fl(y|ies|ew|ying)|float(s|ed|ing)?|balloons?)\b/i,
    kind: 'idle',
    motion: 'float',
  },
  { id: 'grow', pattern: /\b(grow(s|ing|n)?|grew|big(ger)?)\b/i, kind: 'action', motion: 'grow' },
  {
    id: 'surprise',
    pattern: /\b(wow|surprised?|gasp(s|ed)?|oh)\b/i,
    kind: 'action',
    motion: 'hop',
    params: { height: 0.2, intensity: 0.6 },
  },
  {
    id: 'leave',
    pattern: /\b(leav(e|es|ing)|left|away|goodbye|bye)\b/i,
    kind: 'exit',
    motion: 'walkOut',
  },
];

export type KeywordMatch = { rule: KeywordRule; word: string };

/** Every rule that matches, in priority order, with the word that triggered it. */
export function matchKeywords(text: string): KeywordMatch[] {
  const out: KeywordMatch[] = [];
  for (const rule of KEYWORD_RULES) {
    const m = rule.pattern.exec(text);
    if (m) out.push({ rule, word: m[0] });
  }
  return out;
}
