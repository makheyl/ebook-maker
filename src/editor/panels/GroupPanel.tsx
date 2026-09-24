import { Boxes, MousePointer2, Ungroup } from 'lucide-react';
import { flattenElements, type GroupElement } from '@/core/schema';
import { Button } from '@/ui/button';
import { ungroupSelected } from '../actions';
import { MOD } from '../keys';
import { useUiStore } from '../store/ui-store';
import { Section } from './controls';

/** A selected group: what's in it, edit its items, or ungroup. */
export function GroupPanel({ group }: { group: GroupElement }) {
  const items = flattenElements(group.children).length;
  const shift = MOD === '⌘' ? '⇧' : 'Shift+';
  return (
    <Section title="Group">
      <p className="flex items-center gap-2 text-sm">
        <Boxes className="size-4 text-muted-foreground" />
        {items} {items === 1 ? 'item' : 'items'} that move and animate together
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            useUiStore.getState().enterGroup(
              group.id,
              group.children.filter((c) => !c.hidden).map((c) => c.id),
            )
          }
          title="Edit items (Enter, or double-click on the page)"
        >
          <MousePointer2 /> Edit items
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => ungroupSelected()}
          title={`Ungroup (${MOD}${shift}G)`}
        >
          <Ungroup /> Ungroup
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Animations added to the group move all of it; items can still have their own.
      </p>
    </Section>
  );
}
