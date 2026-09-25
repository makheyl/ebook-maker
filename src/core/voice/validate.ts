import type { CheckIssue } from '../interaction/validate';
import { findElement } from '../schema/tree';
import type { Project } from '../schema/types';
import { pageVoiceLines } from './lines';
import { defaultLanguageOf } from './resolve';

/**
 * Voiceover checks: a tap line with nothing recorded (an error: the tap says nothing), a line
 * missing the default language (other readers get nothing there), and — per language — the
 * pages and lines that will fall back to the default language.
 */
export function validateVoice(project: Project): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const languages = project.voiceover.languages;
  const fallback = defaultLanguageOf(project);
  const fallbackName = languages.find((l) => l.code === fallback)?.name ?? '';
  const missing = new Map<string, { pageId: string; where: string }[]>();

  project.pages.forEach((page, i) => {
    for (const { target, line } of pageVoiceLines(page)) {
      const codes = Object.keys(line);
      const name =
        target.kind === 'page'
          ? `Page ${i + 1}`
          : `“${findElement(page.elements, target.elementId)?.name ?? 'Item'}” on page ${i + 1}`;
      const elementId = target.kind === 'page' ? undefined : target.elementId;
      const key = `${target.kind}:${elementId ?? page.id}`;
      if (!codes.length) {
        issues.push({
          id: `voice-empty:${key}`,
          severity: 'error',
          pageId: page.id,
          ...(elementId ? { elementId } : {}),
          message: `${name} has a voiceover with no recording — it won't say anything.`,
        });
        continue;
      }
      if (fallback && !line[fallback]) {
        issues.push({
          id: `voice-default:${key}`,
          severity: 'warning',
          pageId: page.id,
          ...(elementId ? { elementId } : {}),
          message: `${name} has no ${fallbackName} recording (the default), so readers of other languages hear nothing there.`,
        });
      }
      for (const l of languages) {
        if (l.code === fallback || line[l.code] || !fallback || !line[fallback]) continue;
        const list = missing.get(l.code) ?? [];
        list.push({ pageId: page.id, where: name });
        missing.set(l.code, list);
      }
    }
  });

  for (const l of languages) {
    const list = missing.get(l.code);
    if (!list?.length) continue;
    const shown = list
      .slice(0, 4)
      .map((m) => m.where)
      .join(', ');
    const more = list.length > 4 ? ` and ${list.length - 4} more` : '';
    issues.push({
      id: `voice-missing:${l.code}`,
      severity: 'warning',
      pageId: list[0]!.pageId,
      message: `No ${l.name} recording for ${shown}${more} — ${fallbackName} plays there instead.`,
    });
  }
  return issues;
}
