import type { CheckIssue } from '@/core/interaction/validate';
import type { Project, TextElement } from '@/core/schema';
import { textProblems } from '../text/fit';

/**
 * Checks that need real measurements (so they live in the editor, not in core): text that
 * doesn't fit its box, and boxes that leave the page. Measurements are cached per element, so
 * only edited text is measured again.
 */
export function textIssues(project: Project): CheckIssue[] {
  const issues: CheckIssue[] = [];
  project.pages.forEach((page, i) => {
    for (const el of page.elements) {
      if (el.type !== 'text' || el.hidden) continue;
      const { overflow, offPage } = textProblems(el as TextElement, project.pageSize);
      if (overflow) {
        issues.push({
          id: `text-fit:${el.id}`,
          severity: 'error',
          pageId: page.id,
          elementId: el.id,
          message: `“${el.name}” on Page ${i + 1} doesn’t fit its box — part of it won’t show.`,
        });
      }
      if (offPage) {
        issues.push({
          id: `text-page:${el.id}`,
          severity: 'error',
          pageId: page.id,
          elementId: el.id,
          message: `“${el.name}” on Page ${i + 1} runs off the page.`,
        });
      }
    }
  });
  return issues;
}
