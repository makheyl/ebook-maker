import type { Params } from '../animation/types';
import { matchKeywords } from './keywords';

export type MotionChoice = { motion: string; params?: Params };

export type PageSuggestion = {
  entrance?: MotionChoice;
  action?: MotionChoice;
  exit?: MotionChoice;
  /** Idle for this page when it differs from the character's usual idle. */
  idle?: string;
  /** Human-readable explanations, e.g. 'matched "jumped"'. */
  reasons: string[];
};

export type StoryPageInput = { text: string };

/** Pluggable: a smarter (e.g. AI) suggester can replace the keyword one later. */
export interface MotionSuggester {
  suggest(pages: readonly StoryPageInput[]): PageSuggestion[];
}

type Side = 'left' | 'right';

/**
 * Keyword suggester with continuity: the character walks in on its first page, stays put
 * while the story continues, leaves when the text says so and comes back from the other side
 * (as if it kept travelling), and waves goodbye on the last page.
 */
export const keywordSuggester: MotionSuggester = {
  suggest(pages) {
    let present = false;
    let enterFrom: Side = 'left';
    return pages.map((page, index) => {
      const matches = matchKeywords(page.text);
      const reasons: string[] = [];
      const pick = (kind: string) => matches.find((m) => m.rule.kind === kind);
      const suggestion: PageSuggestion = { reasons };

      const entranceMatch = pick('entrance');
      if (!present) {
        suggestion.entrance = { motion: 'walkIn', params: { from: enterFrom } };
        reasons.push(
          entranceMatch
            ? `walks in (matched "${entranceMatch.word}")`
            : index === 0
              ? 'walks in on the first page'
              : 'comes back in',
        );
        present = true;
      }

      const action = pick('action');
      if (action) {
        suggestion.action = { motion: action.rule.motion, params: action.rule.params };
        reasons.push(`matched "${action.word}"`);
      }

      const idle = pick('idle');
      if (idle) {
        suggestion.idle = idle.rule.motion;
        reasons.push(`idle: matched "${idle.word}"`);
      }

      const exit = pick('exit');
      if (exit && index < pages.length - 1) {
        const to: Side = enterFrom === 'left' ? 'right' : 'left';
        suggestion.exit = { motion: 'walkOut', params: { to } };
        reasons.push(`walks out (matched "${exit.word}")`);
        present = false;
        // Keep travelling: leave to the right, come back from the left.
        enterFrom = to === 'right' ? 'left' : 'right';
      }

      if (index === pages.length - 1 && !suggestion.action) {
        suggestion.action = { motion: 'wave' };
        reasons.push('waves goodbye at the end');
      }
      return suggestion;
    });
  },
};
