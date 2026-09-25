import { MessageCircle } from 'lucide-react';
import { tapVoiceTarget } from '@/core/ops';
import type { PageElement } from '@/core/schema';
import { Button } from '@/ui/button';
import { useActivePage, useProject } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { speakWhenTapped } from './actions';
import { VoiceSlots } from './VoiceSlots';

/** What an element (a character, usually) says when tapped, with a one-click way to start. */
export function SpeakWhenTapped({ element, name }: { element: PageElement; name: string }) {
  const project = useProject();
  const page = useActivePage();
  const target = tapVoiceTarget(page, element.id);
  if (!target) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="justify-self-start"
        disabled={element.locked}
        onClick={() => speakWhenTapped(page.id, element.id)}
      >
        <MessageCircle /> Speak when tapped
      </Button>
    );
  }
  const action = element.interactions?.find((i) => i.id === target.interactionId)?.actions[
    target.index
  ];
  return (
    <div className="grid gap-1.5">
      <h4 className="text-xs font-medium">What {name} says when tapped</h4>
      {project.voiceover.languages.length ? (
        <VoiceSlots
          target={target}
          line={action?.type === 'playVoice' ? action.line : undefined}
          what={name}
        />
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Add a language in the{' '}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-2"
            onClick={() => useUiStore.getState().setRightTab('audio')}
          >
            Audio tab
          </button>
          , then upload the recordings.
        </p>
      )}
    </div>
  );
}
