import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { Button } from '@/ui/button';
import { MOD } from '../keys';
import { useLayoutStore } from './layout-store';

/** The slim strip a hidden side panel leaves behind, with a button to bring it back. */
export function CollapsedRail({ side }: { side: 'left' | 'right' }) {
  const label = side === 'left' ? 'Show pages panel' : 'Show properties panel';
  return (
    <div
      className={
        side === 'left'
          ? 'flex w-10 shrink-0 flex-col items-center border-r bg-sidebar pt-2'
          : 'flex w-10 shrink-0 flex-col items-center border-l bg-sidebar pt-2'
      }
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        title={`${label} (${MOD}\\ shows both)`}
        onClick={() => useLayoutStore.getState().toggle(side)}
      >
        {side === 'left' ? <PanelLeftOpen /> : <PanelRightOpen />}
      </Button>
    </div>
  );
}
