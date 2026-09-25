import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceClip } from '../core/schema';
import type { VoiceCue } from '../core/voice/cues';
import { loadAudioPrefs, saveAudioPrefs } from './audio-prefs';
import { CueClock, VoicePlayer } from './voice';
import { AudioClock } from './audio-clock';

const clip = (id: string, duration = 1): VoiceClip => ({
  id,
  kind: 'voice',
  mime: 'audio/mpeg',
  bytes: 1,
  duration,
});

let played: string[] = [];
let refuse = false;

beforeEach(() => {
  played = [];
  refuse = false;
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    if (refuse) return Promise.reject(new DOMException('no', 'NotAllowedError'));
    played.push(this.getAttribute('src') ?? '');
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const make = () => {
  const host = document.createElement('div');
  const player = new VoicePlayer((id) => `src:${id}`, host);
  const idle = vi.fn();
  player.onIdle = idle;
  const end = () => player.el.dispatchEvent(new Event('ended'));
  return { player, idle, end };
};

describe('the voice: one line at a time', () => {
  it('queues lines, and says the next when one ends; idle at the end', () => {
    const { player, idle, end } = make();
    player.say(clip('page'), 'queue');
    player.say(clip('bubble'), 'queue');
    expect(played).toEqual(['src:page']);
    end();
    expect(played).toEqual(['src:page', 'src:bubble']);
    expect(idle).not.toHaveBeenCalled();
    end();
    expect(idle).toHaveBeenCalledTimes(1);
    expect(player.busy).toBe(false);
  });

  it('a tap interrupts: the queue is dropped and its line plays now', () => {
    const { player, end, idle } = make();
    player.say(clip('page'), 'queue');
    player.say(clip('bubble'), 'queue');
    player.say(clip('tap'), 'interrupt');
    expect(played).toEqual(['src:page', 'src:tap']);
    end();
    expect(played).toHaveLength(2);
    expect(idle).toHaveBeenCalledTimes(1);
  });

  it('carry-over keeps the current line and drops what was waiting', () => {
    const { player, end } = make();
    player.say(clip('tap'), 'queue');
    player.say(clip('old'), 'queue');
    player.clearQueue();
    player.say(clip('newPage'), 'queue');
    end();
    expect(played).toEqual(['src:tap', 'src:newPage']);
  });

  it('a line that never ends is skipped by the watchdog', () => {
    const { player } = make();
    player.say(clip('stuck', 1), 'queue');
    player.say(clip('next'), 'queue');
    vi.advanceTimersByTime(2999);
    expect(played).toEqual(['src:stuck']);
    vi.advanceTimersByTime(2);
    expect(played).toEqual(['src:stuck', 'src:next']);
  });

  it('a refused line waits for the next tap, then plays', async () => {
    const { player } = make();
    const blocked = vi.fn();
    player.onBlocked = blocked;
    refuse = true;
    player.say(clip('page'), 'queue');
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(blocked).toHaveBeenCalled();
    expect(player.isBlocked).toBe(true);
    refuse = false;
    player.resumeBlocked();
    expect(played).toEqual(['src:page']);
  });
});

describe('bubble cues', () => {
  it('fire at their times when their group plays, all at once when it finishes early', () => {
    const fired: string[] = [];
    const clock = new CueClock((c) => fired.push(c.elementId));
    const cue = (elementId: string, group: number, at: number): VoiceCue => ({
      elementId,
      group,
      at,
      line: {},
    });
    const cues = [cue('a', 0, 100), cue('b', 0, 300), cue('c', 1, 50)];
    clock.schedule(cues, 0);
    vi.advanceTimersByTime(150);
    expect(fired).toEqual(['a']);
    clock.flush(0);
    expect(fired).toEqual(['a', 'b']);
    clock.schedule(cues, 1);
    clock.clear();
    vi.advanceTimersByTime(1000);
    expect(fired).toEqual(['a', 'b']);
  });
});

describe('remembered choices', () => {
  it('round-trip per book, move old voice choices over, and ignore junk', () => {
    saveAudioPrefs('bk_1', { lang: 'tl', readToMe: true, music: false, musicVolume: 0.4 });
    expect(loadAudioPrefs('bk_1')).toEqual({
      lang: 'tl',
      readToMe: true,
      music: false,
      musicVolume: 0.4,
    });
    expect(loadAudioPrefs('bk_2')).toBeNull();
    localStorage.setItem('folio:voice:bk_3', '{"lang":"en","readToMe":true}');
    expect(loadAudioPrefs('bk_3')).toEqual({
      lang: 'en',
      readToMe: true,
      music: true,
      musicVolume: 1,
    });
    expect(localStorage.getItem('folio:voice:bk_3')).toBeNull();
    expect(localStorage.getItem('folio:audio:bk_3')).not.toBeNull();
    localStorage.setItem('folio:audio:bk_4', 'not json');
    expect(loadAudioPrefs('bk_4')).toBeNull();
  });
});

describe('timed audio clock', () => {
  it('fires at the times of the group that plays; skipping ahead keeps voice, drops sounds', () => {
    const fired: string[] = [];
    const clock = new AudioClock<{
      id: string;
      group: number | null;
      at: number;
      voice: boolean;
      stepId?: string;
    }>((i) => fired.push(i.id));
    const items = [
      { id: 'pop', group: 0, at: 100, voice: false },
      { id: 'line', group: 0, at: 500, voice: true },
      { id: 'birds', group: 0, at: 800, voice: false },
      { id: 'tap', group: null, at: 0, voice: false, stepId: 'st' },
    ];
    clock.schedule(items, 0);
    vi.advanceTimersByTime(150);
    expect(fired).toEqual(['pop']);
    expect(clock.pending((i) => i.voice)).toBe(true);
    clock.flush(0, (i) => i.voice);
    expect(fired).toEqual(['pop', 'line']);
    vi.advanceTimersByTime(2000);
    expect(fired).toEqual(['pop', 'line']);
    clock.fireStep(items, 'st');
    expect(fired).toEqual(['pop', 'line', 'tap']);
  });
});
