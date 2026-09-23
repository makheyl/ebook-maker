import type { ImageElement, ShapeElement, TextElement } from '@/core/schema';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs';
import { useSelectedElements } from '../store/selectors';
import { useUiStore, type RightTab } from '../store/ui-store';
import { ArrangeSection } from './ArrangeSection';
import { CharacterPanel } from './CharacterPanel';
import { ImagePanel } from './ImagePanel';
import { LayersPanel } from './LayersPanel';
import { PagePanel } from './PagePanel';
import { ShapePanel } from './ShapePanel';
import { TextPanel } from './TextPanel';

function DesignPanel() {
  const selected = useSelectedElements();
  if (!selected.length) return <PagePanel />;
  const texts = selected.filter((e): e is TextElement => e.type === 'text');
  const images = selected.filter((e): e is ImageElement => e.type === 'image');
  const shapes = selected.filter((e): e is ShapeElement => e.type === 'shape');
  const uniform =
    texts.length === selected.length ||
    images.length === selected.length ||
    shapes.length === selected.length;
  return (
    <div>
      {uniform && texts.length > 0 && <TextPanel elements={texts} />}
      {images.length === 1 && selected.length === 1 && <CharacterPanel element={images[0]!} />}
      {uniform && images.length > 0 && <ImagePanel elements={images} />}
      {uniform && shapes.length > 0 && <ShapePanel elements={shapes} />}
      <ArrangeSection elements={selected} />
    </div>
  );
}

/** Context-sensitive right sidebar: Design (properties), Animate, Layers. */
export function RightPanel({ animate }: { animate?: React.ReactNode }) {
  const tab = useUiStore((s) => s.rightTab);
  return (
    <aside aria-label="Properties" className="flex w-72 shrink-0 flex-col border-l bg-sidebar">
      <Tabs
        value={tab}
        onValueChange={(v) => useUiStore.getState().setRightTab(v as RightTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList className="m-2 grid w-auto grid-cols-3">
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="animate">Animate</TabsTrigger>
          <TabsTrigger value="layers">Layers</TabsTrigger>
        </TabsList>
        <TabsContent value="design" className="min-h-0 flex-1 overflow-y-auto">
          <DesignPanel />
        </TabsContent>
        <TabsContent value="animate" className="min-h-0 flex-1 overflow-y-auto">
          {animate ?? (
            <p className="p-4 text-sm text-muted-foreground">Animations are coming soon.</p>
          )}
        </TabsContent>
        <TabsContent value="layers" className="min-h-0 flex-1 overflow-y-auto">
          <LayersPanel />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
