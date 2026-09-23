import { Lightbulb, MousePointerClick, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/ui/button';
import { MOD } from '../keys';
import { useActivePage } from '../store/selectors';
import { useUiStore } from '../store/ui-store';

const TIPS_KEY = 'folio-tips-dismissed';

function tipsDismissed(): boolean {
  try {
    return localStorage.getItem(TIPS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Empty-page guidance and a dismissible first-run tips card. */
export function StageHints() {
  const page = useActivePage();
  const previewing = useUiStore((s) => s.previewing);
  const [showTips, setShowTips] = useState(() => !tipsDismissed());
  const empty = page.elements.length === 0;

  return (
    <>
      {empty && !previewing && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex max-w-sm flex-col items-center gap-2 rounded-2xl bg-background/85 px-6 py-5 text-center shadow-sm backdrop-blur">
            <MousePointerClick className="size-6 text-primary" />
            <p className="font-medium">This page is empty</p>
            <p className="text-sm text-muted-foreground">
              Add text, an image or a shape from the toolbar above — or drop images anywhere here.
            </p>
          </div>
        </div>
      )}
      {showTips && (
        <aside
          aria-label="Tips"
          className="absolute bottom-3 left-3 z-10 w-72 rounded-xl border bg-popover p-3 text-sm shadow-md"
        >
          <div className="mb-2 flex items-center gap-2 font-medium">
            <Lightbulb className="size-4 text-amber-500" /> Quick tips
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss tips"
              onClick={() => {
                setShowTips(false);
                try {
                  localStorage.setItem(TIPS_KEY, '1');
                } catch {
                  // Not persisted in private mode; that's fine.
                }
              }}
            >
              <X />
            </Button>
          </div>
          <ul className="grid gap-1 text-xs text-muted-foreground">
            <li>Double-click text to type; Esc when done.</li>
            <li>Drag to move · corners resize · top handle rotates.</li>
            <li>Shift-click or drag a box to select several.</li>
            <li>Open the Animate tab to add motion to the selection.</li>
            <li>
              Preview with <kbd className="rounded border px-1">{MOD}↵</kbd>; undo with{' '}
              <kbd className="rounded border px-1">{MOD}Z</kbd>.
            </li>
          </ul>
        </aside>
      )}
    </>
  );
}
