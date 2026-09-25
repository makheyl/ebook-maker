import type { Project, VoiceClip, VoiceLine } from '../schema/types';

/** The reader's voice choice: a language code, or no voice at all. */
export type VoiceChoice = string | 'off';

/**
 * The clip to play for a line: the reader's language, else the book's default language (so
 * there's always a voice where one was recorded), else nothing.
 */
export function resolveClip(
  line: VoiceLine | undefined,
  choice: VoiceChoice,
  defaultLanguage: string | undefined,
): VoiceClip | undefined {
  if (!line || choice === 'off') return undefined;
  return line[choice] ?? (defaultLanguage ? line[defaultLanguage] : undefined);
}

export type LineStatus = 'recorded' | 'fallback' | 'missing';

/** For the overview and slots: what a reader of `code` gets for this line. */
export function lineStatus(
  line: VoiceLine | undefined,
  code: string,
  defaultLanguage: string | undefined,
): LineStatus {
  if (line?.[code]) return 'recorded';
  if (defaultLanguage && line?.[defaultLanguage]) return 'fallback';
  return 'missing';
}

/** The default language, or the first one (what cleanReferences also repairs to). */
export function defaultLanguageOf(project: Pick<Project, 'voiceover'>): string | undefined {
  const { languages, defaultLanguage } = project.voiceover;
  return languages.some((l) => l.code === defaultLanguage) ? defaultLanguage : languages[0]?.code;
}
