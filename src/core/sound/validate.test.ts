import { describe, expect, it } from 'vitest';
import { checkSoundFile, checkVoiceFile } from './validate';

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

describe('checkVoiceFile', () => {
  it('takes real File objects, allows up to 10 MB and says what to do beyond', () => {
    const file = new File([new Uint8Array(3 * 1024 * 1024)], 'page-01-tl.mp3', {
      type: 'audio/mpeg',
    });
    expect(checkVoiceFile(file)).toEqual({ ok: true, mime: 'audio/mpeg' });
    expect(checkVoiceFile({ name: 'x.m4a', type: '', size: 11 * 1024 * 1024 })).toEqual({
      ok: false,
      message: expect.stringContaining('10 MB'),
    });
    expect(checkVoiceFile({ name: 'x.flac', type: 'audio/flac', size: 10 })).toMatchObject({
      ok: false,
    });
    expect(checkVoiceFile({ name: 'x.wav', type: 'audio/wav', size: 0 })).toMatchObject({
      ok: false,
    });
  });
});
