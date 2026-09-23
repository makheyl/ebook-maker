import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Copy,
  EyeOff,
  Lock,
  Trash2,
  Unlock,
} from 'lucide-react';
import type { PageElement } from '@/core/schema';
import { IconButton } from '../IconButton';
import { MOD } from '../keys';
import {
  alignSelected,
  deleteSelected,
  distributeSelected,
  duplicateSelected,
  patchSelected,
  reorderSelected,
  setElementsFlag,
} from '../actions';
import { NumberField, Section, SliderField } from './controls';

function common<T>(els: PageElement[], pick: (e: PageElement) => T): T | null {
  const first = pick(els[0]!);
  return els.every((e) => pick(e) === first) ? first : null;
}

/** Position/size/rotation/opacity, alignment, layer order, lock/hide — for any selection. */
export function ArrangeSection({ elements }: { elements: PageElement[] }) {
  const ids = elements.map((e) => e.id);
  const locked = elements.some((e) => e.locked);
  const multi = elements.length > 1;
  const key = ids.join(',');

  return (
    <>
      <Section title={multi ? `${elements.length} elements` : 'Arrange'}>
        <div className="flex flex-wrap items-center gap-0.5">
          <IconButton label="Align left" onClick={() => alignSelected('left')} disabled={locked}>
            <AlignStartVertical />
          </IconButton>
          <IconButton
            label="Align center"
            onClick={() => alignSelected('center')}
            disabled={locked}
          >
            <AlignCenterVertical />
          </IconButton>
          <IconButton label="Align right" onClick={() => alignSelected('right')} disabled={locked}>
            <AlignEndVertical />
          </IconButton>
          <IconButton label="Align top" onClick={() => alignSelected('top')} disabled={locked}>
            <AlignStartHorizontal />
          </IconButton>
          <IconButton
            label="Align middle"
            onClick={() => alignSelected('middle')}
            disabled={locked}
          >
            <AlignCenterHorizontal />
          </IconButton>
          <IconButton
            label="Align bottom"
            onClick={() => alignSelected('bottom')}
            disabled={locked}
          >
            <AlignEndHorizontal />
          </IconButton>
          {elements.length >= 3 && (
            <>
              <IconButton
                label="Distribute horizontally"
                onClick={() => distributeSelected('horizontal')}
              >
                <AlignHorizontalSpaceAround />
              </IconButton>
              <IconButton
                label="Distribute vertically"
                onClick={() => distributeSelected('vertical')}
              >
                <AlignVerticalSpaceAround />
              </IconButton>
            </>
          )}
        </div>
        <p className="-mt-1 text-[11px] text-muted-foreground">
          {multi ? 'Aligns to the selection.' : 'Aligns to the page.'}
        </p>
        {!multi && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="X"
              value={elements[0]!.x}
              disabled={locked}
              onCommit={(x) => patchSelected({ x }, { label: 'Move' })}
            />
            <NumberField
              label="Y"
              value={elements[0]!.y}
              disabled={locked}
              onCommit={(y) => patchSelected({ y }, { label: 'Move' })}
            />
            <NumberField
              label="Width"
              value={elements[0]!.width}
              min={1}
              disabled={locked}
              onCommit={(width) => patchSelected({ width }, { label: 'Resize' })}
            />
            <NumberField
              label="Height"
              value={elements[0]!.height}
              min={1}
              disabled={locked}
              onCommit={(height) => patchSelected({ height }, { label: 'Resize' })}
            />
            <NumberField
              label="Rotation"
              value={elements[0]!.rotation}
              suffix="°"
              min={-180}
              max={180}
              precision={1}
              disabled={locked}
              onCommit={(rotation) => patchSelected({ rotation }, { label: 'Rotate' })}
            />
          </div>
        )}
        <SliderField
          label="Opacity"
          value={Math.round((common(elements, (e) => e.opacity) ?? elements[0]!.opacity) * 100)}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          gestureLabel="Opacity"
          onChange={(v) => patchSelected({ opacity: v / 100 }, { coalesceKey: `opacity:${key}` })}
        />
      </Section>
      <Section title="Layer">
        <div className="flex flex-wrap items-center gap-0.5">
          <IconButton
            label="Bring forward"
            shortcut={`${MOD}]`}
            onClick={() => reorderSelected('forward')}
          >
            <ChevronUp />
          </IconButton>
          <IconButton
            label="Send backward"
            shortcut={`${MOD}[`}
            onClick={() => reorderSelected('backward')}
          >
            <ChevronDown />
          </IconButton>
          <IconButton
            label="Bring to front"
            shortcut={`${MOD}⌥]`}
            onClick={() => reorderSelected('front')}
          >
            <ArrowUpToLine />
          </IconButton>
          <IconButton
            label="Send to back"
            shortcut={`${MOD}⌥[`}
            onClick={() => reorderSelected('back')}
          >
            <ArrowDownToLine />
          </IconButton>
          <div className="mx-1 h-5 w-px bg-border" />
          <IconButton
            label={locked ? 'Unlock' : 'Lock'}
            aria-pressed={locked}
            onClick={() => setElementsFlag(ids, 'locked', !locked)}
          >
            {locked ? <Lock /> : <Unlock />}
          </IconButton>
          <IconButton label="Hide" onClick={() => setElementsFlag(ids, 'hidden', true)}>
            <EyeOff />
          </IconButton>
          <IconButton label="Duplicate" shortcut={`${MOD}D`} onClick={duplicateSelected}>
            <Copy />
          </IconButton>
          <IconButton label="Delete" shortcut="⌫" onClick={deleteSelected}>
            <Trash2 />
          </IconButton>
        </div>
      </Section>
    </>
  );
}
