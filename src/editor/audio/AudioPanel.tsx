import { useActivePage, useProject } from '../store/selectors';
import { SoundEffectsSection } from './SoundEffectsSection';
import { VoiceoverSection } from './VoiceoverSection';

/** The Audio tab: voiceover and sound effects, as two separate sections. */
export function AudioPanel() {
  const project = useProject();
  const page = useActivePage();
  const pageNumber = project.pages.findIndex((p) => p.id === page.id) + 1;
  return (
    <div>
      <VoiceoverSection page={page} pageNumber={pageNumber} />
      <SoundEffectsSection page={page} />
    </div>
  );
}
