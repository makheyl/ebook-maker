import {
  hasText,
  type BubbleElement,
  type ButtonElement,
  type ImageElement,
  type ShapeElement,
} from '@/core/schema';
import {
  Headphones,
  Layers,
  MousePointerClick,
  Palette,
  PanelRightClose,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs';
import { useLayoutStore } from '../layout/layout-store';
import { useSelectedElements } from '../store/selectors';
import { useUiStore, type RightTab } from '../store/ui-store';
import { AudioPanel } from '../audio/AudioPanel';
import { ElementAudioSection } from '../audio/ElementAudioSection';
import { ArrangeSection } from './ArrangeSection';
import { BubblePanel } from './BubblePanel';
import { ButtonPanel } from './ButtonPanel';
import { GroupPanel } from './GroupPanel';
import { CharacterPanel } from './CharacterPanel';
import { ImagePanel } from './ImagePanel';
import { InteractPanel } from './InteractPanel';
import { LayersPanel } from './LayersPanel';
import { PagePanel } from './PagePanel';
import { ShapePanel } from './ShapePanel';
import { TextPanel } from './TextPanel';

function DesignPanel() {
  const selected = useSelectedElements();
  if (!selected.length) return <PagePanel />;
  const texts = selected.filter(hasText);
  const bubbles = selected.filter((e): e is BubbleElement => e.type === 'bubble');
  const images = selected.filter((e): e is ImageElement => e.type === 'image');
  const shapes = selected.filter((e): e is ShapeElement => e.type === 'shape');
  const buttons = selected.filter((e): e is ButtonElement => e.type === 'button');
  const uniform =
    texts.length === selected.length ||
    images.length === selected.length ||
    shapes.length === selected.length ||
    buttons.length === selected.length;
  return (
    <div>
      {uniform && bubbles.length > 0 && <BubblePanel elements={bubbles} />}
      {uniform && texts.length > 0 && <TextPanel elements={texts} />}
      {images.length === 1 && selected.length === 1 && <CharacterPanel element={images[0]!} />}
      {uniform && images.length > 0 && <ImagePanel elements={images} />}
      {uniform && shapes.length > 0 && <ShapePanel elements={shapes} />}
      {uniform && buttons.length > 0 && <ButtonPanel elements={buttons} />}
      {selected.length === 1 && selected[0]!.type === 'group' && (
        <GroupPanel group={selected[0]!} />
      )}
      {selected.length === 1 && <ElementAudioSection element={selected[0]!} />}
      <ArrangeSection elements={selected} />
    </div>
  );
}

const TABS = [
  { value: 'design', label: 'Design', icon: Palette },
  { value: 'animate', label: 'Animate', icon: Sparkles },
  { value: 'interact', label: 'Interact', icon: MousePointerClick },
  { value: 'audio', label: 'Audio', icon: Headphones },
  { value: 'layers', label: 'Layers', icon: Layers },
] as const;

/** Context-sensitive right sidebar: Design (properties), Animate, Interact, Layers. */
export function RightPanel({ animate }: { animate?: React.ReactNode }) {
  const tab = useUiStore((s) => s.rightTab);
  const width = useLayoutStore((s) => s.sizes.right);
  // Five tabs need room for their words; narrower panels show icons (with tooltips).
  const compact = width < 340;
  return (
    <aside
      id="panel-properties"
      aria-label="Properties"
      className="glass glass-edge-l flex shrink-0 flex-col"
      style={{ width }}
    >
      <Tabs
        value={tab}
        onValueChange={(v) => useUiStore.getState().setRightTab(v as RightTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="m-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Hide properties panel"
            title="Hide properties panel"
            onClick={() => useLayoutStore.getState().toggle('right')}
          >
            <PanelRightClose />
          </Button>
          <TabsList className="grid w-auto flex-1 grid-cols-5">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="px-1" title={label}>
                {compact ? (
                  <>
                    <Icon aria-hidden="true" />
                    <span className="sr-only">{label}</span>
                  </>
                ) : (
                  label
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="design" className="min-h-0 flex-1 overflow-y-auto">
          <DesignPanel />
        </TabsContent>
        <TabsContent value="animate" className="min-h-0 flex-1 overflow-y-auto">
          {animate ?? (
            <p className="p-4 text-sm text-muted-foreground">Animations are coming soon.</p>
          )}
        </TabsContent>
        <TabsContent value="interact" className="min-h-0 flex-1 overflow-y-auto">
          <InteractPanel />
        </TabsContent>
        <TabsContent value="audio" className="min-h-0 flex-1 overflow-y-auto">
          <AudioPanel />
        </TabsContent>
        <TabsContent value="layers" className="min-h-0 flex-1 overflow-y-auto">
          <LayersPanel />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
