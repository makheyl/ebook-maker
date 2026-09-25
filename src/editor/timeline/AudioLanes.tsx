import { useRef } from 'react';
import { removeClip, updateClip } from '@/core/ops';
import type { Page } from '@/core/schema';
import { cn } from '@/ui/utils';
import { usePeaks, waveformPath } from '../audio/waveform';
import { docStore, useDocStore } from '../store/doc-store';
import { useUiStore } from '../store/ui-store';
import {
  audioDragResult,
  type AudioBar,
  type AudioDragMode,
  type AudioDragResult,
  type AudioLane,
} from './audio-model';
import { snapTime } from './model';
import { LABEL_W, ROW_H, Row } from './row';

const BAR_H = ROW_H - 8;
const KIND_STYLE: Record<AudioBar['kind'], string> = {
  sound: 'bg-sky-400/80 border-sky-700',
  voice: 'bg-violet-400/80 border-violet-700',
  pageVoice: 'bg-violet-400/80 border-violet-700',
  bubble: 'bg-violet-300/60 border-violet-600 border-dashed',
  music: 'bg-slate-400/40 border-slate-500',
};
const KIND_NAME: Record<AudioBar['kind'], string> = {
  sound: 'sound',
  voice: 'voice line',
  pageVoice: 'page voiceover',
  bubble: 'bubble line',
  music: 'music',
};
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

/** Applies a drag's result to the document (inside the current gesture). */
function apply(pageId: string, bar: AudioBar, r: AudioDragResult, label: string) {
  docStore.change(
    (d) => {
      const page = d.pages.find((p) => p.id === pageId);
      if (!page) return;
      if (r.voiceoverAt !== undefined) page.voiceoverAt = r.voiceoverAt;
      if (!bar.clip) return;
      updateClip(d, pageId, bar.clip.id, (c) => {
        if (r.start) c.start = r.start;
        if (r.mix) Object.assign(c.mix, r.mix);
      });
    },
    { label, coalesceKey: `audio:${bar.key}:${label}` },
  );
}

function Waveform({ bar }: { bar: AudioBar }) {
  const peaks = usePeaks(bar.assetId);
  if (!peaks) return null;
  const file = bar.fileMs ?? bar.mix.trimStartMs + bar.length;
  const from = bar.kind === 'sound' ? bar.mix.trimStartMs / file : 0;
  const to = bar.kind === 'sound' ? Math.min(1, (bar.mix.trimStartMs + bar.length) / file) : 1;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full text-black/25"
      viewBox={`0 0 100 ${BAR_H}`}
      preserveAspectRatio="none"
    >
      <path d={waveformPath(peaks, from, to, 100, BAR_H)} stroke="currentColor" strokeWidth={0.6} />
    </svg>
  );
}

/**
 * The page's audio lanes under the animations: drag to move, the edges to trim (sounds), the
 * top corners to fade, and the line to set the volume. One undo step per drag. Bubble lines
 * move with their bubble's entrance; the music is shown for context.
 */
export function AudioLanes({
  page,
  lanes,
  offsets,
  pxPerMs,
  totalWidth,
  groupWidths,
  snapTargets,
}: {
  page: Page;
  lanes: readonly AudioLane[];
  offsets: readonly number[];
  pxPerMs: number;
  totalWidth: number;
  groupWidths: readonly number[];
  snapTargets: (group: number, exclude: string) => number[];
}) {
  const drag = useRef<{
    bar: AudioBar;
    mode: AudioDragMode;
    x0: number;
    y0: number;
    label: string;
  } | null>(null);
  if (!lanes.length) return null;

  const labelFor = (mode: AudioDragMode) =>
    mode === 'move'
      ? 'Move sound'
      : mode === 'volume'
        ? 'Sound volume'
        : mode.startsWith('fade')
          ? 'Sound fade'
          : 'Trim sound';

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, bar: AudioBar) => {
    e.stopPropagation();
    if (bar.kind === 'music') {
      useUiStore.getState().setRightTab('audio');
      return;
    }
    if (bar.kind === 'bubble') {
      useUiStore.getState().select([bar.key.slice('bubble:'.length)]);
      return;
    }
    const handle = (e.target as HTMLElement).dataset.handle as AudioDragMode | undefined;
    const mode: AudioDragMode = handle ?? 'move';
    if ((mode === 'trimStart' || mode === 'trimEnd') && bar.kind !== 'sound') return;
    const label = labelFor(mode);
    drag.current = { bar, mode, x0: e.clientX, y0: e.clientY, label };
    docStore.get().beginGesture(label);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (bar.clip?.elementId) useUiStore.getState().select([bar.clip.elementId]);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const deltaMs = (e.clientX - d.x0) / pxPerMs;
    const targets = snapTargets(d.bar.group, d.bar.key);
    const snap = (ms: number) =>
      e.shiftKey ? ms : snapTime(ms, { targets, thresholdMs: 8 / pxPerMs, grid: 50 });
    const r = audioDragResult(d.bar, d.mode, deltaMs, snap, -(e.clientY - d.y0) / BAR_H);
    apply(page.id, d.bar, r, d.label);
  };
  const onPointerUp = () => {
    if (drag.current) useDocStore.getState().commitGesture();
    drag.current = null;
  };
  const onKey = (e: React.KeyboardEvent, bar: AudioBar) => {
    if (bar.kind === 'music' || bar.kind === 'bubble') return;
    const step = e.shiftKey ? 500 : 50;
    let r: AudioDragResult | null = null;
    let label = 'Move sound';
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      r = audioDragResult(bar, 'move', e.key === 'ArrowRight' ? step : -step);
    } else if ((e.key === '[' || e.key === ']') && bar.kind === 'sound') {
      label = 'Trim sound';
      r = audioDragResult(
        bar,
        e.key === '[' ? 'trimStart' : 'trimEnd',
        e.key === '[' ? step : -step,
      );
    } else if (e.key === '-' || e.key === '=' || e.key === '+') {
      label = 'Sound volume';
      r = audioDragResult(bar, 'volume', 0, undefined, e.key === '-' ? -0.05 : 0.05);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && bar.clip) {
      e.preventDefault();
      docStore.change((d) => removeClip(d, page.id, bar.clip!.id), { label: 'Remove sound' });
      return;
    }
    if (!r) return;
    e.preventDefault();
    e.stopPropagation();
    apply(page.id, bar, r, label);
  };

  const renderBar = (bar: AudioBar) => {
    if (bar.kind === 'music') {
      return groupWidths.map((w, gi) => (
        <div
          key={`music-${gi}`}
          role="button"
          tabIndex={-1}
          aria-label={`Music: ${bar.label}, volume ${Math.round(bar.mix.volume * 100)} %`}
          className={cn(
            'absolute top-1 bottom-1 overflow-hidden rounded-md border px-2 text-[10px] leading-5 text-muted-foreground',
            KIND_STYLE.music,
          )}
          style={{ left: offsets[gi], width: w }}
          onPointerDown={(e) => onPointerDown(e, bar)}
        >
          ♪ {bar.label}
        </div>
      ));
    }
    const left = offsets[bar.group]! + bar.start * pxPerMs;
    const width = Math.max(8, bar.length * pxPerMs);
    const fadeIn = Math.min(width, bar.mix.fadeInMs * pxPerMs);
    const fadeOut = Math.min(width, bar.mix.fadeOutMs * pxPerMs);
    const volumeY = 3 + (1 - bar.mix.volume) * (BAR_H - 6);
    const editable = bar.kind !== 'bubble';
    return (
      <div
        key={bar.key}
        role="button"
        tabIndex={0}
        data-testid="audio-bar"
        data-kind={bar.kind}
        data-fade-in={bar.mix.fadeInMs}
        data-fade-out={bar.mix.fadeOutMs}
        data-trim-start={bar.mix.trimStartMs}
        aria-describedby={editable ? 'audio-bar-keys' : undefined}
        aria-label={`${bar.label}, ${KIND_NAME[bar.kind]}, starts ${seconds(bar.start)}, ${seconds(bar.length)} long, volume ${Math.round(bar.mix.volume * 100)} %`}
        className={cn(
          'absolute top-1 bottom-1 overflow-hidden rounded-md border text-[10px] font-medium text-black/80 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring',
          KIND_STYLE[bar.kind],
          editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        )}
        style={{ left, width }}
        onPointerDown={(e) => onPointerDown(e, bar)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => onKey(e, bar)}
        title={bar.kind === 'bubble' ? 'Moves with the bubble’s entrance' : undefined}
      >
        <Waveform bar={bar} />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${width} ${BAR_H}`}
          preserveAspectRatio="none"
        >
          {fadeIn > 0 && <polygon points={`0,0 ${fadeIn},0 0,${BAR_H}`} fill="rgba(0,0,0,.25)" />}
          {fadeOut > 0 && (
            <polygon
              points={`${width},0 ${width - fadeOut},0 ${width},${BAR_H}`}
              fill="rgba(0,0,0,.25)"
            />
          )}
        </svg>
        <span className="pointer-events-none absolute top-0.5 left-1.5 truncate">{bar.label}</span>
        {editable && (
          <>
            {/* The volume line: drag it up or down. */}
            <span
              data-handle="volume"
              className="absolute inset-x-2 h-2 -translate-y-1 cursor-ns-resize"
              style={{ top: volumeY }}
            >
              <span className="pointer-events-none absolute inset-x-0 top-1 h-px bg-black/60" />
            </span>
            {/* Fade handles at the top corners. */}
            <span
              data-handle="fadeIn"
              aria-hidden="true"
              className="absolute top-0 size-2.5 -translate-x-1/2 cursor-ew-resize rounded-full border border-black/50 bg-white"
              style={{ left: Math.max(10, fadeIn) }}
            />
            <span
              data-handle="fadeOut"
              aria-hidden="true"
              className="absolute top-0 size-2.5 translate-x-1/2 cursor-ew-resize rounded-full border border-black/50 bg-white"
              style={{ right: Math.max(10, fadeOut) }}
            />
            {bar.kind === 'sound' && (
              <>
                <span
                  data-handle="trimStart"
                  className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-black/20"
                />
                <span
                  data-handle="trimEnd"
                  className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-black/20"
                />
              </>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <p id="audio-bar-keys" className="sr-only">
        Left and right arrows move it (Shift: half a second). [ and ] trim a sound. Minus and equals
        change the volume. Delete removes it.
      </p>
      <div
        className="sticky left-0 border-y bg-muted/60 px-2 py-1 text-[11px] font-medium text-muted-foreground"
        style={{ width: LABEL_W }}
      >
        Audio
      </div>
      {lanes.map((lane) => (
        <Row
          key={lane.key}
          label={
            <button
              type="button"
              className="w-full truncate px-2 text-left text-xs hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() =>
                lane.elementId
                  ? useUiStore.getState().select([lane.elementId])
                  : useUiStore.getState().setRightTab('audio')
              }
            >
              {lane.label}
            </button>
          }
          width={totalWidth}
          testId="audio-lane"
        >
          {lane.bars.map(renderBar)}
        </Row>
      ))}
    </>
  );
}
