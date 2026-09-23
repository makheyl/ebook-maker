import { useEffect, useId, useRef, useState } from 'react';
import { Label } from '@/ui/label';
import { Slider } from '@/ui/slider';
import { cn } from '@/ui/utils';
import { docStore, useDocStore } from '../store/doc-store';

/** Shared, compact form controls for the properties panels. */

export function Section({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('grid gap-3 border-b px-4 py-4 last:border-b-0', className)}>
      {title && (
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * Numeric input that commits on Enter/blur and supports ↑/↓ (Shift = ×10).
 * Displays `value` rounded; empty/invalid input reverts.
 */
export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
  suffix,
  precision = 0,
  disabled,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  precision?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const shown = value === null ? '' : String(Number(value.toFixed(precision)));
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = (raw: string) => {
    setDraft(null);
    const v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) return;
    onCommit(clamp(v));
  };
  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          disabled={disabled}
          value={draft ?? shown}
          placeholder={value === null ? 'Mixed' : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
            if (e.key === 'Escape') setDraft(null);
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value !== null) {
              e.preventDefault();
              const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
              setDraft(null);
              onCommit(clamp(Number((value + delta).toFixed(6))));
            }
          }}
          className="h-8 w-full rounded-md border bg-background px-2 pr-7 text-sm tabular-nums shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

/**
 * Slider bound to the document with gesture semantics: a whole drag is one undo step,
 * and every intermediate value renders live.
 */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  onChange,
  gestureLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  gestureLabel: string;
}) {
  const active = useRef(false);
  const end = () => {
    if (active.current) {
      active.current = false;
      useDocStore.getState().commitGesture();
    }
  };
  useEffect(() => end, []);
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{format(value)}</span>
      </div>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => {
          if (!active.current) {
            active.current = true;
            docStore.get().beginGesture(gestureLabel);
          }
          onChange(v!);
        }}
        onValueCommit={end}
        onPointerUp={end}
        onBlur={end}
      />
    </div>
  );
}

const SWATCHES = [
  '#ffffff',
  '#f5f1e8',
  '#1f1d2b',
  '#6d4aff',
  '#ff6b6b',
  '#ffb84d',
  '#4cc38a',
  '#3aa0ff',
  '#ff8fc7',
  '#000000',
];

function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${[...color.slice(1)].map((c) => c + c).join('')}`;
  return '#000000';
}

/** Color picker (native) + hex input + quick swatches. */
export function ColorField({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  value: string | undefined;
  onChange: (color: string | undefined) => void;
  allowNone?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const commitText = (raw: string) => {
    setDraft(null);
    const v = raw.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) onChange(v);
    else if (allowNone && v === '') onChange(undefined);
  };
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <label
          className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border shadow-xs focus-within:ring-2 focus-within:ring-ring"
          style={{ background: value ?? 'transparent' }}
        >
          <span className="sr-only">{label} picker</span>
          <input
            type="color"
            value={toHex(value ?? '#ffffff')}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          {!value && (
            <span className="absolute inset-0 bg-[linear-gradient(135deg,transparent_45%,#e5484d_45%,#e5484d_55%,transparent_55%)]" />
          )}
        </label>
        <input
          id={id}
          value={draft ?? value ?? ''}
          placeholder={allowNone ? 'None' : '#000000'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commitText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commitText(e.currentTarget.value)}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Use ${c}`}
            onClick={() => onChange(c)}
            className="size-5 rounded border shadow-xs focus-visible:ring-2 focus-visible:ring-ring"
            style={{ background: c }}
          />
        ))}
        {allowNone && (
          <button
            type="button"
            aria-label="No color"
            onClick={() => onChange(undefined)}
            className="size-5 rounded border bg-[linear-gradient(135deg,transparent_45%,#e5484d_45%,#e5484d_55%,transparent_55%)] shadow-xs focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
      </div>
    </Field>
  );
}
