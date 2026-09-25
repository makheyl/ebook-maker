import { PAGE_SIZE_PRESETS } from '@/core/schema';
import { cn } from '@/ui/utils';

/** Visual radio group of page-size presets, each drawn at its true aspect ratio. */
export function PageSizePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (presetId: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Page size" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {PAGE_SIZE_PRESETS.map((preset) => {
        const selected = preset.id === value;
        const ratio = preset.width / preset.height;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(preset.id)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl glass-subtle p-3 text-center transition-colors hover:border-primary/60',
              selected && 'border-primary ring-2 ring-primary/35',
            )}
          >
            <span className="grid h-16 w-full place-items-center">
              <span
                className={cn(
                  'block rounded-sm border-2 bg-white/70 dark:bg-white/10',
                  selected && 'border-primary bg-accent',
                )}
                style={
                  ratio >= 1 ? { width: 56, height: 56 / ratio } : { height: 56, width: 56 * ratio }
                }
              />
            </span>
            <span className="text-sm font-medium">{preset.label}</span>
            <span className="text-xs text-muted-foreground">
              {preset.width}×{preset.height}
            </span>
          </button>
        );
      })}
    </div>
  );
}
