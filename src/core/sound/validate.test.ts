import { describe, expect, it } from 'vitest';
import { checkSoundFile } from './validate';

describe('checkSoundFile', () => {
  it('accepts the four formats, using the extension when the type is missing', () => {
    expect(checkSoundFile({ name: 'a.mp3', type: 'audio/mpeg', size: 10 })).toEqual({
      ok: true,
      mime: 'audio/mpeg',
    });
    expect(checkSoundFile({ name: 'a.ogg', type: '', size: 10 })).toMatchObject({
      mime: 'audio/ogg',
    });
    expect(checkSoundFile({ name: 'A.WAV', type: '', size: 10 })).toMatchObject({
      mime: 'audio/wav',
    });
    expect(checkSoundFile({ name: 'a.m4a', type: 'audio/x-m4a', size: 10 })).toMatchObject({
      mime: 'audio/x-m4a',
    });
  });

  it('rejects other files, empty files and anything over 2 MB', () => {
    expect(checkSoundFile({ name: 'a.flac', type: 'audio/flac', size: 10 }).ok).toBe(false);
    expect(checkSoundFile({ name: 'a.png', type: 'image/png', size: 10 }).ok).toBe(false);
    expect(checkSoundFile({ name: 'a.mp3', type: 'audio/mpeg', size: 0 }).ok).toBe(false);
    const big = checkSoundFile({ name: 'a.mp3', type: 'audio/mpeg', size: 2 * 1024 * 1024 + 1 });
    expect(big).toEqual({ ok: false, message: expect.stringMatching(/2 MB/) });
  });
});
