import { plainText } from '../schema/text';
import type { Project } from '../schema/types';
import type { StoryPlanRow } from './apply';
import { keywordSuggester, type MotionSuggester } from './suggest-motions';

/** All visible text on a page, as one line. */
export function pageText(project: Project, index: number): string {
  return project.pages[index]!.elements.filter((e) => e.type === 'text' && !e.hidden)
    .map((e) => (e.type === 'text' ? plainText(e.content) : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The reviewable plan: one row per page with suggested motions and reasons. */
export function suggestPlan(
  project: Project,
  suggester: MotionSuggester = keywordSuggester,
): StoryPlanRow[] {
  const texts = project.pages.map((_, i) => ({ text: pageText(project, i) }));
  return suggester
    .suggest(texts)
    .map((s, i) => ({ ...s, pageId: project.pages[i]!.id, include: true }));
}
