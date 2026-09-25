import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { exportedAssetIds } from '../export/usage';
import { migrate } from '../migrations';
import { addLanguage, removeLanguage, setDefaultLanguage, setVoiceClip } from '../ops/voice';
import { removeSound } from '../ops/sounds';
import {
  createBubbleElement,
  createButtonElement,
  createPage,
  createProject,
  projectAssetIds,
  projectSchema,
  type Project,
  type VoiceClip,
} from '../schema';
import { MAX_VOICE_BYTES } from '../schema/project';
import { bookHasVoice, voiceClips, voiceLines } from './lines';
import { defaultLanguageOf, lineStatus, resolveClip } from './resolve';

const clip = (id: string, bytes = 100): VoiceClip => ({
  id,
  kind: 'voice',
  mime: 'audio/mpeg',
  bytes,
});

function book(): Project {
  const bubble = createBubbleElement('Hi', { x: 0, y: 0, width: 200, height: 100 });
  bubble.hidden = true;
  const button = createButtonElement('Say', { x: 0, y: 200, width: 100, height: 40 });
  button.interactions = [
    { id: 'ia1', trigger: 'tap', once: false, actions: [{ type: 'playVoice', line: {} }] },
  ];
  const page = {
    ...createPage(),
    elements: [
      {
        id: 'g1',
        type: 'group' as const,
        name: 'Group',
        x: 0,
        y: 0,
        width: 300,
        height: 300,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        children: [bubble, button],
      },
    ],
  };
  let project = createProject({ pages: [page, createPage()] });
  project = produce(project, (d) => {
    addLanguage(d, { code: 'en', name: 'English' });
    addLanguage(d, { code: 'tl', name: 'Tagalog' });
    const pageId = d.pages[0]!.id;
    setVoiceClip(d, { kind: 'page', pageId }, 'en', clip('vo_p_en'));
    setVoiceClip(d, { kind: 'page', pageId }, 'tl', clip('vo_p_tl'));
    setVoiceClip(d, { kind: 'bubble', pageId, elementId: bubble.id }, 'tl', clip('vo_b_tl'));
    setVoiceClip(
      d,
      { kind: 'tap', pageId, elementId: button.id, interactionId: 'ia1', index: 0 },
      'en',
      clip('vo_t_en'),
    );
    d.sounds.snd_x = { id: 'snd_x', kind: 'audio', mime: 'audio/mpeg', bytes: 5 };
    d.pages[1]!.openSound = 'snd_x';
  });
  return project;
}

describe('voiceover: schema and migration', () => {
  it('a v4 book gains an empty language list', () => {
    const v4 = { ...createProject(), schemaVersion: 4 } as Record<string, unknown>;
    delete v4.voiceover;
    const migrated = migrate(v4) as Project;
    expect(migrated.schemaVersion).toBe(6);
    expect(migrated.language).toBe('en');
    expect(migrated.voiceover).toEqual({ languages: [] });
    expect(projectSchema.safeParse(migrated).success).toBe(true);
  });

  it('accepts a full book and rejects bad codes, too many languages and huge clips', () => {
    const ok = book();
    expect(projectSchema.safeParse(ok).success).toBe(true);
    const bad = (patch: (p: Project) => void) => {
      const p = structuredClone(ok);
      patch(p);
      return projectSchema.safeParse(p).success;
    };
    expect(bad((p) => (p.voiceover.languages[0]!.code = 'English'))).toBe(false);
    expect(
      bad(
        (p) =>
          (p.voiceover.languages = Array.from({ length: 9 }, (_, i) => ({
            code: `l${String.fromCharCode(97 + i)}`,
            name: `L${i}`,
          }))),
      ),
    ).toBe(false);
    expect(bad((p) => (p.pages[0]!.voiceover!.en = clip('vo_big', MAX_VOICE_BYTES + 1)))).toBe(
      false,
    );
  });
});

describe('voiceover: finding and resolving lines', () => {
  it('finds page, bubble (in a group, hidden) and tap lines, and every clip once', () => {
    const project = book();
    expect(voiceLines(project).map((l) => l.target.kind)).toEqual(['page', 'bubble', 'tap']);
    expect(voiceClips(project).map((c) => c.id)).toEqual([
      'vo_p_en',
      'vo_p_tl',
      'vo_b_tl',
      'vo_t_en',
    ]);
    expect(bookHasVoice(project)).toBe(true);
    expect(bookHasVoice(createProject())).toBe(false);
  });

  it('falls back to the default language, and says so', () => {
    const line = { en: clip('a'), tl: clip('b') };
    expect(resolveClip(line, 'tl', 'en')?.id).toBe('b');
    expect(resolveClip({ en: clip('a') }, 'tl', 'en')?.id).toBe('a');
    expect(resolveClip({ tl: clip('b') }, 'es', 'en')).toBeUndefined();
    expect(resolveClip(line, 'off', 'en')).toBeUndefined();
    expect(lineStatus({ en: clip('a') }, 'tl', 'en')).toBe('fallback');
    expect(lineStatus({ en: clip('a') }, 'en', 'en')).toBe('recorded');
    expect(lineStatus({ tl: clip('b') }, 'es', 'en')).toBe('missing');
  });

  it('the first language added is the default', () => {
    const project = book();
    expect(project.voiceover.defaultLanguage).toBe('en');
    expect(defaultLanguageOf(project)).toBe('en');
    expect(defaultLanguageOf(produce(project, (d) => setDefaultLanguage(d, 'tl')))).toBe('tl');
  });
});

describe('voiceover: keeping references valid', () => {
  it('removing a language removes its recordings; emptied page lines go, tap lines stay', () => {
    const project = produce(book(), (d) => {
      setDefaultLanguage(d, 'tl');
      removeLanguage(d, 'tl');
    });
    expect(project.voiceover.defaultLanguage).toBe('en');
    expect(project.pages[0]!.voiceover).toEqual({ en: clip('vo_p_en') });
    const group = project.pages[0]!.elements[0]!;
    const [bubble, button] = group.type === 'group' ? group.children : [];
    expect(bubble?.type === 'bubble' && bubble.voice).toBeUndefined();
    expect(button?.interactions?.[0]?.actions[0]).toEqual({
      type: 'playVoice',
      line: { en: clip('vo_t_en') },
    });
    const none = produce(project, (d) => removeLanguage(d, 'en'));
    expect(none.pages[0]!.voiceover).toBeUndefined();
    expect(none.voiceover.defaultLanguage).toBeUndefined();
    // A tap line left empty stays, for the checks to point out.
    const tap = none.pages[0]!.elements[0]!;
    expect(tap.type === 'group' && tap.children[1]!.interactions![0]!.actions[0]).toEqual({
      type: 'playVoice',
      line: {},
    });
  });

  it('removing a sound clears a page’s opening sound', () => {
    const project = produce(book(), (d) => removeSound(d, 'snd_x'));
    expect(project.pages[1]!.openSound).toBeUndefined();
  });

  it('duplicate language codes collapse and the default is repaired', () => {
    const project = produce(book(), (d) => {
      d.voiceover.languages.push({ code: 'en', name: 'English again' });
      d.voiceover.defaultLanguage = 'xx';
      setVoiceClip(d, { kind: 'page', pageId: d.pages[1]!.id }, 'en', clip('vo_2'));
    });
    expect(project.voiceover.languages.map((l) => l.code)).toEqual(['en', 'tl']);
    expect(project.voiceover.defaultLanguage).toBe('en');
  });

  it('storage and exports own every recording', () => {
    const project = book();
    for (const id of ['vo_p_en', 'vo_p_tl', 'vo_b_tl', 'vo_t_en']) {
      expect(projectAssetIds(project)).toContain(id);
      expect(exportedAssetIds(project)).toContain(id);
    }
  });
});
