import { Mic, Music } from 'lucide-react';
import { openSoundClipId } from '@/core/audio';
import { findElement, flattenElements } from '@/core/schema/tree';
import { Section } from '../panels/controls';
import { useActivePage, useProject } from '../store/selectors';
import { useUiStore } from '../store/ui-store';

type Row = { key: string; icon: 'voice' | 'sound'; what: string; when: string; elementId?: string };

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Every sound and voice line on the page, in one list: what, whose, and when. */
export function PageAudioList() {
  const project = useProject();
  const page = useActivePage();
  const rows: Row[] = [];
  if (page.voiceover) {
    rows.push({
      key: 'page-voice',
      icon: 'voice',
      what: 'Page voiceover',
      when: `page opens${page.voiceoverAt ? ` + ${seconds(page.voiceoverAt)}` : ''}`,
    });
  }
  for (const clip of page.audio ?? []) {
    const owner = clip.elementId ? findElement(page.elements, clip.elementId)?.name : undefined;
    const name =
      clip.source.kind === 'sound'
        ? (project.sounds[clip.source.soundId]?.name ?? 'Sound')
        : 'Voice line';
    const when =
      clip.id === openSoundClipId(page.id)
        ? 'page opens'
        : clip.start.kind === 'time'
          ? `${clip.start.group ? `click ${clip.start.group} ` : ''}at ${seconds(clip.start.at)}`
          : 'as it appears';
    rows.push({
      key: clip.id,
      icon: clip.source.kind === 'voice' ? 'voice' : 'sound',
      what: owner ? `${owner}: ${name}` : name,
      when,
      elementId: clip.elementId,
    });
  }
  for (const el of flattenElements(page.elements)) {
    for (const i of el.interactions ?? []) {
      i.actions.forEach((a, index) => {
        if (a.type === 'playSound') {
          rows.push({
            key: `${i.id}:${index}`,
            icon: 'sound',
            what: `${el.name}: ${project.sounds[a.soundId]?.name ?? 'Sound'}`,
            when: 'when tapped',
            elementId: el.id,
          });
        } else if (a.type === 'playVoice') {
          rows.push({
            key: `${i.id}:${index}`,
            icon: 'voice',
            what: `${el.name}: voice`,
            when: 'when tapped',
            elementId: el.id,
          });
        }
      });
    }
    if (el.type === 'bubble' && el.voice) {
      rows.push({
        key: `bubble:${el.id}`,
        icon: 'voice',
        what: `${el.name}: voice`,
        when: 'bubble appears',
        elementId: el.id,
      });
    }
  }
  if (!rows.length) return null;
  return (
    <Section title="Everything on this page">
      <ul className="grid gap-0.5" aria-label="Audio on this page">
        {rows.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-xs hover:bg-accent"
              onClick={() => {
                const ui = useUiStore.getState();
                ui.select(r.elementId ? [r.elementId] : []);
                if (r.elementId) ui.setRightTab('design');
              }}
            >
              {r.icon === 'voice' ? (
                <Mic className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <Music className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">{r.what}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{r.when}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
