import { findElement, parentOf } from '@/core/schema/tree';
import { useLayoutStore } from '../layout/layout-store';
import {
  Maximize2,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  Repeat,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EASINGS, getPreset } from '@/core/animation';
import {
  TRACK_PROPERTIES,
  type AnimationKind,
  type KeyframeTrack,
  type TrackProperty,
} from '@/core/schema';
import { updateAnimation } from '@/core/ops';
import { defaultLanguageOf } from '@/core/voice';
import { Button } from '@/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { cn } from '@/ui/utils';
import { docStore, useDocStore } from '../store/doc-store';
import { useActivePage, useProject } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import {
  addCustomMove,
  addKeyframeAt,
  deleteKeyframe,
  moveKeyframe,
  removeStep,
  updateKeyframe,
} from './actions';
import {
  buildTimelineModel,
  dragResult,
  groupOffsets,
  groupSpan,
  snapTargets,
  snapTime,
  type TimelineBar,
} from './model';
import { endScrub, isPlaying, pause, playFrom, scrubTo } from './session';
import { LABEL_W, Row } from './row';
import { audioGroupEnds, buildAudioLanes } from './audio-model';
import { AudioLanes } from './AudioLanes';

const GROUP_GAP = 28;
const KIND_BAR: Record<AnimationKind, string> = {
  entrance: 'bg-emerald-500/85 border-emerald-700',
  emphasis: 'bg-amber-400/90 border-amber-600',
  exit: 'bg-rose-500/85 border-rose-700',
};
const PROPERTY_LABELS: Record<TrackProperty, string> = {
  x: 'Move ↔',
  y: 'Move ↕',
  rotate: 'Rotate',
  scaleX: 'Width',
  scaleY: 'Height',
  opacity: 'Opacity',
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

type Drag =
  | { kind: 'bar'; bar: TimelineBar; mode: 'move' | 'start' | 'end'; x0: number }
  | {
      kind: 'key';
      stepId: string;
      property: TrackProperty;
      index: number;
      bar: TimelineBar;
      x0: number;
      t0: number;
    }
  | { kind: 'playhead'; group: number };

/**
 * The page timeline: every animation on the active page on a time ruler, split by the reader's
 * clicks. Scrubbing freezes the stage at that moment with the reader's own runtime; dragging bars
 * edits delay/duration (one undo step per drag); keyframe steps show editable keyframes.
 */
export default function TimelineDock() {
  const project = useProject();
  const page = useActivePage();
  const playhead = useUiStore((s) => s.playhead);
  const selectedStepId = useUiStore((s) => s.selectedStepId);
  const previewing = useUiStore((s) => s.previewing);
  const model = useMemo(() => buildTimelineModel(page, project), [page, project]);
  const height = useLayoutStore((st) => st.sizes.bottom);
  const [pxPerMs, setPxPerMs] = useState(0.12);
  /** Page the ruler was last fitted for (null = fit again). */
  const [fittedFor, setFittedFor] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState<{ property: TrackProperty; index: number } | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const languages = project.voiceover.languages;
  const previewVoice = useUiStore((s) => s.previewVoice);
  const lang =
    (previewVoice && languages.some((l) => l.code === previewVoice) ? previewVoice : undefined) ??
    defaultLanguageOf(project) ??
    'en';
  const audioLanes = useMemo(() => buildAudioLanes(page, project, lang), [page, project, lang]);
  const audioEnds = useMemo(() => audioGroupEnds(audioLanes), [audioLanes]);
  // Groups make room for audio that plays past their last animation.
  const durations = model.groups.map((g, gi) => Math.max(g.duration, audioEnds.get(gi) ?? 0));
  const offsets = groupOffsets(durations, pxPerMs, GROUP_GAP);
  const totalWidth =
    (offsets[offsets.length - 1] ?? 0) +
    groupSpan(durations[durations.length - 1] ?? 0) * pxPerMs +
    40;
  const groupAt = (x: number) => {
    let g = 0;
    offsets.forEach((o, i) => (x >= o ? (g = i) : undefined));
    return g;
  };
  const xToTime = (x: number, group: number) => Math.max(0, (x - offsets[group]!) / pxPerMs);

  const selectedBar =
    model.lanes.flatMap((l) => l.bars).find((b) => b.step.id === selectedStepId) ?? null;
  const selectedTracks =
    selectedBar?.step.preset === 'keyframes' ? (selectedBar.step.tracks ?? []) : null;

  // Fit the ruler to the available width once per page.
  useLayoutEffect(() => {
    if (fittedFor === page.id || !scrollRef.current) return;
    const avail = scrollRef.current.clientWidth - LABEL_W - 60 - GROUP_GAP * (durations.length - 1);
    const span = durations.reduce((s, d) => s + groupSpan(d), 0);
    setPxPerMs(Math.min(0.4, Math.max(0.03, avail / Math.max(1, span))));
    setFittedFor(page.id);
  }, [fittedFor, page.id, durations]);

  // Keep the stage in sync with the playhead while scrubbing, even after edits.
  useEffect(() => {
    if (previewing && !isPlaying()) scrubTo(page, project.pageSize, playhead.group, playhead.ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync only when the page changes
  }, [page]);

  // Leaving the dock returns the stage to editing.
  useEffect(() => () => endScrub(), []);

  const scrub = (group: number, ms: number) => {
    pause();
    setPlaying(false);
    scrubTo(page, project.pageSize, group, ms);
  };

  const togglePlay = () => {
    if (playing) {
      pause();
      setPlaying(false);
      return;
    }
    const end = durations[playhead.group] ?? 0;
    setPlaying(true);
    playFrom(page, project.pageSize, {
      group: playhead.group,
      from: playhead.ms,
      end: Math.max(end, 200),
      speed,
      loop,
      onDone: () => setPlaying(false),
      audio: { project, lang },
    });
  };

  const stop = () => {
    setPlaying(false);
    endScrub();
    useUiStore.getState().setPlayhead({ group: playhead.group, ms: 0 });
  };

  /** Snap targets for an audio bar: animation edges, other audio bars and the playhead. */
  const audioSnapTargets = (group: number, exclude: string) => {
    const targets = snapTargets(
      model,
      group,
      '',
      playhead.group === group ? playhead.ms : undefined,
    );
    for (const lane of audioLanes)
      for (const b of lane.bars)
        if (b.group === group && b.key !== exclude && b.kind !== 'music')
          targets.push(b.start, b.start + b.length);
    return targets;
  };

  const selectBar = (bar: TimelineBar) => {
    useUiStore.getState().setSelectedStep(bar.step.id);
    setSelectedKey(null);
  };

  // ─── Pointer handling for bars, keyframes and the playhead ───────────────────
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const rect = scrollRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current!.scrollLeft - LABEL_W;
    if (d.kind === 'playhead') {
      scrub(d.group, xToTime(x, d.group));
      return;
    }
    if (d.kind === 'bar') {
      const delta = (e.clientX - d.x0) / pxPerMs;
      const targets = snapTargets(
        model,
        d.bar.group,
        d.bar.step.id,
        playhead.group === d.bar.group ? playhead.ms : undefined,
      );
      let snapped: number | null = null;
      const snap = (ms: number) => {
        if (e.shiftKey) return ms;
        const s = snapTime(ms, { targets, thresholdMs: 8 / pxPerMs, grid: 100 });
        snapped = targets.includes(s) ? s : null;
        return s;
      };
      const r = dragResult(d.bar, d.mode, delta, snap);
      setSnapLine(snapped === null ? null : offsets[d.bar.group]! + snapped * pxPerMs);
      docStore.change(
        (draft) =>
          updateAnimation(draft, page.id, d.bar.step.id, (s) => {
            s.delay = r.delay;
            s.duration = r.duration;
          }),
        { label: d.mode === 'move' ? 'Move animation' : 'Change duration' },
      );
      const start = d.bar.anchor + r.delay;
      scrubTo(
        docStore.project()!.pages.find((p) => p.id === page.id)!,
        project.pageSize,
        d.bar.group,
        d.mode === 'end' ? start + r.duration : start,
      );
      return;
    }
    const dt = (e.clientX - d.x0) / pxPerMs / Math.max(1, d.bar.step.duration);
    moveKeyframe(d.stepId, d.property, d.index, Math.round((d.t0 + dt) * 100) / 100);
  };

  const endDrag = () => {
    if (drag.current && drag.current.kind !== 'playhead') useDocStore.getState().commitGesture();
    drag.current = null;
    setSnapLine(null);
  };

  const startBarDrag = (e: React.PointerEvent<HTMLElement>, bar: TimelineBar) => {
    e.stopPropagation();
    selectBar(bar);
    const box = e.currentTarget.getBoundingClientRect();
    const local = e.clientX - box.left;
    const mode = local < 6 ? 'start' : local > box.width - 6 ? 'end' : 'move';
    drag.current = { kind: 'bar', bar, mode, x0: e.clientX };
    docStore.get().beginGesture(mode === 'move' ? 'Move animation' : 'Change duration');
    scrollRef.current!.setPointerCapture(e.pointerId);
  };

  const onBarKey = (e: React.KeyboardEvent, bar: TimelineBar) => {
    const step = e.shiftKey ? 1000 : 100;
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (dir) {
      e.preventDefault();
      e.stopPropagation();
      const r = e.altKey
        ? { delay: bar.step.delay, duration: Math.max(50, bar.step.duration + dir * step) }
        : { delay: Math.max(0, bar.step.delay + dir * step), duration: bar.step.duration };
      docStore.change(
        (d) =>
          updateAnimation(d, page.id, bar.step.id, (s) => {
            s.delay = r.delay;
            s.duration = r.duration;
          }),
        {
          label: e.altKey ? 'Change duration' : 'Move animation',
          coalesceKey: `bar:${bar.step.id}`,
        },
      );
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      removeStep(bar.step.id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      useUiStore.getState().setRightTab('animate');
      selectBar(bar);
    }
  };

  const renderBar = (bar: TimelineBar, name: string) => {
    const preset = getPreset(bar.step.preset);
    const groupEnd = groupSpan(durations[bar.group] ?? 0) - 200;
    const left = offsets[bar.group]! + bar.start * pxPerMs;
    const width = Math.max(
      8,
      ((bar.loop ? Math.max(bar.end, groupEnd) : bar.end) - bar.start) * pxPerMs,
    );
    const selected = bar.step.id === selectedStepId;
    return (
      <div
        key={bar.step.id}
        role="button"
        tabIndex={0}
        data-testid="timeline-bar"
        data-step-id={bar.step.id}
        aria-label={`${name}: ${preset?.label ?? bar.step.preset}, starts at ${seconds(bar.start)}, lasts ${seconds(bar.step.duration)}`}
        aria-pressed={selected}
        className={cn(
          'absolute top-1 bottom-1 flex cursor-grab items-center overflow-hidden rounded-md border px-2 text-[11px] font-medium text-black/80 shadow-xs outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
          KIND_BAR[bar.step.kind],
          selected && 'ring-2 ring-primary ring-offset-1 ring-offset-surface',
          bar.loop &&
            'bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(255,255,255,.35)_6px_12px)]',
        )}
        style={{ left, width }}
        onPointerDown={(e) => startBarDrag(e, bar)}
        onKeyDown={(e) => onBarKey(e, bar)}
        onDoubleClick={() => useUiStore.getState().setRightTab('animate')}
      >
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" />
        <span className="truncate">{preset?.label ?? bar.step.preset}</span>
        <span className="pointer-events-none absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" />
      </div>
    );
  };

  const keyframeRows = (tracks: KeyframeTrack[], bar: TimelineBar) =>
    tracks.map((track) => (
      <Row
        key={track.property}
        label={
          <span className="flex w-full items-center gap-1 pl-5 text-[11px] text-muted-foreground">
            {PROPERTY_LABELS[track.property]}
            <button
              type="button"
              className="ml-auto rounded p-0.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Add ${PROPERTY_LABELS[track.property]} keyframe at the playhead`}
              title="Add keyframe at the playhead"
              onClick={() =>
                addKeyframeAt(
                  bar.step.id,
                  tracks,
                  track.property,
                  (playhead.ms - bar.start) / Math.max(1, bar.step.duration),
                )
              }
            >
              <Plus className="size-3" />
            </button>
          </span>
        }
        width={totalWidth}
      >
        {track.keyframes.map((k, i) => {
          const x = offsets[bar.group]! + (bar.start + k.t * bar.step.duration) * pxPerMs;
          const active = selectedKey?.property === track.property && selectedKey.index === i;
          return (
            <button
              key={i}
              type="button"
              data-testid="keyframe"
              aria-label={`${PROPERTY_LABELS[track.property]} keyframe at ${Math.round(k.t * 100)}%: ${k.v}`}
              className={cn(
                'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-primary bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active && 'bg-primary',
              )}
              style={{ left: x }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelectedKey({ property: track.property, index: i });
                drag.current = {
                  kind: 'key',
                  stepId: bar.step.id,
                  property: track.property,
                  index: i,
                  bar,
                  x0: e.clientX,
                  t0: k.t,
                };
                docStore.get().beginGesture('Move keyframe');
                scrollRef.current!.setPointerCapture(e.pointerId);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault();
                  e.stopPropagation();
                  deleteKeyframe(bar.step.id, track.property, i);
                  setSelectedKey(null);
                }
              }}
            />
          );
        })}
      </Row>
    ));

  const key =
    selectedKey &&
    selectedTracks?.find((t) => t.property === selectedKey.property)?.keyframes[selectedKey.index];
  const unusedProperties = selectedTracks
    ? TRACK_PROPERTIES.filter((p) => !selectedTracks.some((t) => t.property === p))
    : [];

  return (
    <section
      id="panel-timeline"
      aria-label="Timeline"
      className="glass glass-edge-t relative flex shrink-0 flex-col"
      style={{ height }}
      data-testid="timeline"
    >
      <header className="flex h-10 shrink-0 items-center gap-1 border-b px-2 text-xs">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={togglePlay}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Stop" onClick={stop}>
          <Square />
        </Button>
        <Button
          variant={loop ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-label="Loop"
          aria-pressed={loop}
          onClick={() => setLoop(!loop)}
        >
          <Repeat />
        </Button>
        <Select value={String(speed)} onValueChange={(v) => setSpeed(Number(v))}>
          <SelectTrigger className="h-7 w-20 text-xs" aria-label="Playback speed">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0.25, 0.5, 1].map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}×
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-2 text-muted-foreground">
          {model.groups[playhead.group]?.label ?? 'Page opens'}
        </span>
        <input
          aria-label="Playhead time"
          key={`${playhead.group}:${Math.round(playhead.ms)}`}
          defaultValue={(playhead.ms / 1000).toFixed(2)}
          inputMode="decimal"
          className="h-7 w-16 rounded border bg-white/70 dark:bg-white/5 px-1.5 text-right tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = Number(e.currentTarget.value);
              if (Number.isFinite(v)) scrub(playhead.group, Math.max(0, v * 1000));
            }
          }}
        />
        <span className="text-muted-foreground">s</span>
        {selectedTracks && key && selectedKey && selectedBar && (
          <div
            className="ml-3 flex items-center gap-1 rounded-md border bg-white/70 dark:bg-white/5 px-1.5 py-0.5"
            aria-label="Keyframe"
          >
            <span className="text-muted-foreground">{PROPERTY_LABELS[selectedKey.property]}</span>
            <input
              aria-label="Keyframe value"
              key={`${selectedKey.property}:${selectedKey.index}:${key.v}`}
              defaultValue={key.v}
              inputMode="decimal"
              className="h-6 w-16 rounded border px-1 text-right tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = Number(e.currentTarget.value);
                  if (Number.isFinite(v))
                    updateKeyframe(selectedBar.step.id, selectedKey.property, selectedKey.index, {
                      v,
                    });
                }
              }}
            />
            <Select
              value={key.easing ?? 'linear'}
              onValueChange={(easing) =>
                updateKeyframe(selectedBar.step.id, selectedKey.property, selectedKey.index, {
                  easing,
                })
              }
            >
              <SelectTrigger className="h-6 w-28 text-xs" aria-label="Keyframe easing">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EASINGS.map((ez) => (
                  <SelectItem key={ez.id} value={ez.id}>
                    {ez.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Delete keyframe"
              onClick={() => {
                deleteKeyframe(selectedBar.step.id, selectedKey.property, selectedKey.index);
                setSelectedKey(null);
              }}
            >
              <Trash2 />
            </Button>
          </div>
        )}
        <div className="flex-1" />
        {languages.length > 1 && (
          <Select value={lang} onValueChange={(v) => useUiStore.getState().setPreviewVoice(v)}>
            <SelectTrigger className="h-7 w-28 text-xs" aria-label="Timeline voice language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <label className="flex items-center gap-1 text-muted-foreground">
          Zoom
          <input
            type="range"
            aria-label="Timeline zoom"
            min={0.03}
            max={0.5}
            step={0.01}
            value={pxPerMs}
            onChange={(e) => setPxPerMs(Number(e.target.value))}
            className="w-24 accent-[var(--primary)]"
          />
        </label>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fit timeline"
          onClick={() => setFittedFor(null)}
        >
          <Maximize2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close timeline"
          onClick={() => useUiStore.getState().setTimelineOpen(false)}
        >
          <X />
        </Button>
      </header>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="relative" style={{ width: LABEL_W + totalWidth, minHeight: '100%' }}>
          {/* Ruler */}
          <div className="sticky top-0 z-20 flex h-7 border-b bg-surface">
            <div
              className="sticky left-0 z-10 shrink-0 border-r bg-surface"
              style={{ width: LABEL_W }}
            />
            <div
              className="relative cursor-text"
              style={{ width: totalWidth }}
              onPointerDown={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - box.left;
                const g = groupAt(x);
                drag.current = { kind: 'playhead', group: g };
                scrollRef.current!.setPointerCapture(e.pointerId);
                scrub(g, xToTime(x, g));
              }}
            >
              {model.groups.map((g, gi) => {
                const span = groupSpan(durations[gi] ?? g.duration);
                const step = pxPerMs > 0.2 ? 250 : pxPerMs > 0.08 ? 500 : 1000;
                return (
                  <div
                    key={gi}
                    className="absolute inset-y-0 border-l border-border"
                    style={{ left: offsets[gi], width: span * pxPerMs }}
                  >
                    <span className="absolute top-0.5 left-1 flex items-center gap-1 text-[10px] font-medium whitespace-nowrap text-muted-foreground">
                      {gi > 0 && <MousePointerClick className="size-3" aria-hidden="true" />}
                      {g.label}
                    </span>
                    {Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => (
                      <span
                        key={i}
                        className="absolute bottom-0 h-1.5 border-l border-muted-foreground/40 text-[9px] text-muted-foreground"
                        style={{ left: i * step * pxPerMs }}
                      >
                        {i > 0 && i % 2 === 0 && (
                          <span className="absolute -top-3 left-0.5">{(i * step) / 1000}s</span>
                        )}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {model.lanes.length === 0 && model.interaction.length === 0 && !audioLanes.length && (
            <p className="p-4 text-sm text-muted-foreground" style={{ marginLeft: LABEL_W }}>
              No animations on this page yet. Add some from the Animate tab — or double-click a row
              here later to add a custom move.
            </p>
          )}

          {model.lanes.map((lane) => (
            <div key={lane.element.id}>
              <Row
                label={
                  <button
                    type="button"
                    className="w-full truncate px-2 text-left text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ paddingLeft: 8 + lane.depth * 12 }}
                    onClick={() => {
                      const parent = parentOf(page.elements, lane.element.id);
                      useUiStore.getState().enterGroup(parent?.id ?? null, [lane.element.id]);
                    }}
                    title="Select on the page"
                  >
                    {lane.depth > 0 && <span aria-hidden="true">↳ </span>}
                    {lane.element.name}
                  </button>
                }
                width={totalWidth}
                onDoubleClick={(e) => {
                  const box = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - box.left;
                  const g = groupAt(x);
                  addCustomMove(lane.element.id, g, xToTime(x, g));
                }}
                testId="timeline-lane"
              >
                {lane.bars.map((bar) => renderBar(bar, lane.element.name))}
              </Row>
              {lane.idle && (
                <Row
                  label={
                    <span className="truncate pl-5 text-[11px] text-muted-foreground">Idle</span>
                  }
                  width={totalWidth}
                >
                  {model.groups.map((g, gi) => (
                    <div
                      key={gi}
                      className="absolute top-2 bottom-2 rounded bg-[repeating-linear-gradient(90deg,var(--muted)_0_10px,transparent_10px_14px)] px-2 text-[10px] leading-4 text-muted-foreground"
                      style={{
                        left: offsets[gi],
                        width: (groupSpan(durations[gi] ?? g.duration) - 200) * pxPerMs,
                      }}
                    >
                      {lane.idle!.label} (loops)
                    </div>
                  ))}
                </Row>
              )}
              {selectedBar && selectedTracks && selectedBar.step.elementId === lane.element.id && (
                <>
                  {keyframeRows(selectedTracks, selectedBar)}
                  {unusedProperties.length > 0 && (
                    <Row
                      label={
                        <Select
                          value=""
                          onValueChange={(p) =>
                            addKeyframeAt(
                              selectedBar.step.id,
                              selectedTracks,
                              p as TrackProperty,
                              Math.min(
                                1,
                                Math.max(
                                  0,
                                  (playhead.ms - selectedBar.start) /
                                    Math.max(1, selectedBar.step.duration),
                                ),
                              ),
                            )
                          }
                        >
                          <SelectTrigger
                            className="ml-4 h-6 w-36 text-[11px]"
                            aria-label="Animate another property"
                          >
                            <SelectValue placeholder="+ Animate…" />
                          </SelectTrigger>
                          <SelectContent>
                            {unusedProperties.map((p) => (
                              <SelectItem key={p} value={p}>
                                {PROPERTY_LABELS[p]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      }
                      width={totalWidth}
                    />
                  )}
                </>
              )}
            </div>
          ))}

          {model.interaction.length > 0 && (
            <>
              <div
                className="sticky left-0 border-y bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground"
                style={{ width: LABEL_W }}
              >
                Plays when tapped
              </div>
              {model.interaction.map((bar) => {
                const name = findElement(page.elements, bar.step.elementId)?.name ?? '';
                return (
                  <Row
                    key={bar.step.id}
                    label={<span className="truncate px-2 text-xs">{name}</span>}
                    width={totalWidth}
                  >
                    {renderBar({ ...bar, group: 0 }, name)}
                  </Row>
                );
              })}
            </>
          )}

          <AudioLanes
            page={page}
            lanes={audioLanes}
            offsets={offsets}
            pxPerMs={pxPerMs}
            totalWidth={totalWidth}
            groupWidths={durations.map((d) => (groupSpan(d) - 200) * pxPerMs)}
            snapTargets={audioSnapTargets}
          />

          {/* Playhead */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-signal"
            style={{ left: LABEL_W + (offsets[playhead.group] ?? 0) + playhead.ms * pxPerMs }}
          >
            <span className="absolute -top-0 -left-1.5 size-3 rotate-45 bg-signal" />
          </div>
          {snapLine !== null && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-7 bottom-0 z-10 w-px border-l border-dashed border-primary"
              style={{ left: LABEL_W + snapLine }}
            />
          )}
        </div>
      </div>
    </section>
  );
}
