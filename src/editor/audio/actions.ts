import { toast } from 'sonner';
import {
  addLanguage,
  addVoiceToTap,
  removeLanguage,
  renameLanguage,
  setDefaultLanguage,
  setPageOpenSound,
  setVoiceClip,
} from '@/core/ops';
import type { VoiceLanguage } from '@/core/schema';
import { VOICE_TOTAL_WARNING_BYTES } from '@/core/sound/validate';
import { voiceClips, type VoiceTarget } from '@/core/voice';
import { importVoiceFiles, pickVoiceFiles } from '../assets/upload-voice';
import { docStore, useDocStore } from '../store/doc-store';

/** Languages offered when adding one (plus "Custom…"). */
export const LANGUAGE_PRESETS: readonly VoiceLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'fil', name: 'Filipino' },
  { code: 'ceb', name: 'Cebuano' },
  { code: 'ilo', name: 'Ilocano' },
  { code: 'es', name: 'Spanish' },
];

const undo = { label: 'Undo', onClick: () => useDocStore.getState().undo() };

export function addVoiceLanguage(language: VoiceLanguage): boolean {
  let added = false;
  docStore.change((d) => void (added = addLanguage(d, language)), { label: 'Add language' });
  if (!added) toast.error(`${language.name} can't be added (already there, or 8 languages).`);
  return added;
}

export function renameVoiceLanguage(code: string, name: string): void {
  docStore.change((d) => renameLanguage(d, code, name), { label: 'Rename language' });
}

export function makeDefaultLanguage(code: string): void {
  docStore.change((d) => setDefaultLanguage(d, code), { label: 'Default language' });
}

/** Removes a language and its recordings, with Undo. */
export function removeVoiceLanguage(code: string): void {
  const project = docStore.project();
  if (!project) return;
  const name = project.voiceover.languages.find((l) => l.code === code)?.name ?? code;
  const count = voiceClips(project).length;
  docStore.change((d) => removeLanguage(d, code), { label: 'Remove language' });
  const left = voiceClips(docStore.project()!).length;
  const removed = count - left;
  toast.info(
    removed
      ? `Removed ${name} and ${removed} recording${removed === 1 ? '' : 's'}.`
      : `Removed ${name}.`,
    { action: undo, duration: 7000 },
  );
}

/** Asks for a recording (or uses `files`) and puts it in a line for one language. */
export async function uploadVoice(
  target: VoiceTarget,
  code: string,
  files?: readonly File[],
): Promise<boolean> {
  const picked = files ?? (await pickVoiceFiles());
  if (!picked.length) return false;
  const { clips, errors } = await importVoiceFiles(picked.slice(0, 1));
  errors.forEach((e) => toast.error(`${e.name}: ${e.message}`));
  const first = clips[0];
  if (!first) return false;
  docStore.change((d) => setVoiceClip(d, target, code, first.clip), {
    label: 'Add voiceover',
  });
  warnIfLarge();
  return true;
}

export function removeVoice(target: VoiceTarget, code: string): void {
  docStore.change((d) => setVoiceClip(d, target, code, null), { label: 'Remove voiceover' });
}

export function setOpenSound(pageId: string, soundId: string | undefined): void {
  docStore.change((d) => setPageOpenSound(d, pageId, soundId), {
    label: 'Sound when the page opens',
  });
}

export function warnIfLarge(): void {
  const project = docStore.project();
  if (!project) return;
  const total = voiceClips(project).reduce((n, c) => n + c.bytes, 0);
  if (total > VOICE_TOTAL_WARNING_BYTES) {
    toast.warning(
      'This book has over 80 MB of voiceover — it may be slow to open on phones. Export as ZIP, or save recordings as mono MP3.',
    );
  }
}

/** "Speak when tapped": adds a Play voiceover to the element's tap (one undo step). */
export function speakWhenTapped(pageId: string, elementId: string): boolean {
  let ok = false;
  docStore.change((d) => void (ok = !!addVoiceToTap(d, pageId, elementId)), {
    label: 'Speak when tapped',
  });
  if (!ok) toast.error('This item already has 4 tap actions — remove one first.');
  return ok;
}

export type BulkPlan = { file: File; page: number; code: string; replaces: boolean };

/** Stores the matched recordings and puts each on its page, as one undo step. */
export async function applyBulkVoice(plan: readonly BulkPlan[]): Promise<number> {
  const project = docStore.project();
  if (!project || !plan.length) return 0;
  const { clips, errors } = await importVoiceFiles(plan.map((p) => p.file));
  errors.forEach((e) => toast.error(`${e.name}: ${e.message}`));
  const byFile = new Map(clips.map((c) => [c.file, c.clip]));
  const ready = plan.filter((p) => byFile.has(p.file));
  if (!ready.length) return 0;
  docStore.change(
    (d) => {
      for (const p of ready) {
        const page = d.pages[p.page];
        if (page) setVoiceClip(d, { kind: 'page', pageId: page.id }, p.code, byFile.get(p.file)!);
      }
    },
    { label: `Add ${ready.length} voiceover recording${ready.length === 1 ? '' : 's'}` },
  );
  warnIfLarge();
  return ready.length;
}
