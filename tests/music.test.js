import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Music, MUSIC_PREFERENCE_KEY, loadMusicPreference, saveMusicPreference } from '../src/music.js';

function audioHarness() {
  const timers = new Map();
  let timerId = 0;
  const contexts = [];
  const makeParam = () => ({
    value: 0,
    setValueAtTime: vi.fn(function setValueAtTime(value) { this.value = value; }),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  class FakeAudioContext {
    constructor() {
      this.currentTime = 12;
      this.state = 'suspended';
      this.destination = {};
      this.resume = vi.fn(async () => { this.state = 'running'; });
      this.suspend = vi.fn(async () => { this.state = 'suspended'; });
      this.createGain = vi.fn(() => ({ gain: makeParam(), connect: vi.fn() }));
      this.createOscillator = vi.fn(() => ({
        frequency: makeParam(), type: 'sine', connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
      }));
      contexts.push(this);
    }
  }
  return {
    contexts,
    createContext: () => new FakeAudioContext(),
    setInterval: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearInterval: id => timers.delete(id),
    timers,
  };
}

describe('music preference', () => {
  it('defaults on and restores only an explicit off preference', () => {
    expect(loadMusicPreference(null)).toBe(true);
    expect(loadMusicPreference({ getItem: () => null })).toBe(true);
    expect(loadMusicPreference({ getItem: () => 'off' })).toBe(false);
    expect(loadMusicPreference({ getItem: () => 'on' })).toBe(true);
    expect(loadMusicPreference({ getItem: () => { throw new Error('blocked'); } })).toBe(true);
  });

  it('stores the stable music preference without leaking storage errors', () => {
    const writes = [];
    expect(saveMusicPreference({ setItem: (key, value) => writes.push([key, value]) }, false)).toBe(true);
    expect(writes).toEqual([[MUSIC_PREFERENCE_KEY, 'off']]);
    expect(saveMusicPreference({ setItem: () => { throw new Error('full'); } }, true)).toBe(false);
  });
});

describe('music lifecycle', () => {
  it('creates and schedules one composition after the first interaction only', async () => {
    const harness = audioHarness();
    const music = new Music(harness);

    expect(harness.contexts).toHaveLength(0);
    await music.startFromInteraction();
    await music.startFromInteraction();

    expect(harness.contexts).toHaveLength(1);
    expect(harness.timers.size).toBe(1);
    expect(harness.contexts[0].resume).toHaveBeenCalledTimes(2);
    expect(harness.contexts[0].createOscillator).toHaveBeenCalled();
    expect(music.started).toBe(true);
  });

  it('mutes and restores the same running loop while persisting the choice', async () => {
    const harness = audioHarness();
    const writes = [];
    const music = new Music({ ...harness, storage: { setItem: (key, value) => writes.push([key, value]) } });
    await music.startFromInteraction();
    const context = music.context;
    const timer = music.timer;
    const position = context.currentTime;

    await music.setEnabled(false);
    expect(music.master.gain.value).toBe(0);
    expect(music.context).toBe(context);
    expect(music.timer).toBe(timer);
    expect(context.currentTime).toBe(position);

    await music.setEnabled(true);
    expect(music.master.gain.value).toBe(0.16);
    expect(music.context).toBe(context);
    expect(harness.contexts).toHaveLength(1);
    expect(writes).toEqual([
      [MUSIC_PREFERENCE_KEY, 'off'],
      [MUSIC_PREFERENCE_KEY, 'on'],
    ]);
  });

  it('suspends for visibility loss and resumes the same context when visible', async () => {
    const harness = audioHarness();
    const music = new Music(harness);
    await music.startFromInteraction();
    const context = music.context;

    await music.handleVisibility(true);
    expect(context.suspend).toHaveBeenCalledTimes(1);
    await music.handleVisibility(false);
    expect(context.resume).toHaveBeenCalledTimes(2);
    expect(music.context).toBe(context);
    expect(harness.contexts).toHaveLength(1);

    await music.setEnabled(false);
    await music.handleVisibility(false);
    expect(context.resume).toHaveBeenCalledTimes(2);
  });

  it('recovers a closed audio context without duplicating the scheduler or restarting the phrase', async () => {
    const harness = audioHarness();
    const music = new Music(harness);
    await music.startFromInteraction();
    const phraseStep = music.step;
    music.context.state = 'closed';

    await music.startFromInteraction();

    expect(harness.contexts).toHaveLength(2);
    expect(harness.timers.size).toBe(1);
    expect(music.step).toBeGreaterThanOrEqual(phraseStep);
    expect(music.started).toBe(true);
  });

  it('contains partial WebAudio failures instead of rejecting the player interaction', async () => {
    const harness = audioHarness();
    harness.createContext = () => {
      const context = {
        currentTime: 0,
        state: 'suspended',
        destination: {},
        resume: vi.fn(async () => { context.state = 'running'; }),
        createGain: vi.fn(() => ({ gain: { value: 0, setValueAtTime(value) { this.value = value; } }, connect: vi.fn() })),
        createOscillator: vi.fn(() => { throw new Error('device lost'); }),
      };
      harness.contexts.push(context);
      return context;
    };
    const music = new Music(harness);

    await expect(music.startFromInteraction()).resolves.toBe(false);
    expect(music.started).toBe(false);
    expect(harness.timers.size).toBe(0);
  });
});

describe('sound design boundary', () => {
  it('keeps gameplay free of the former event sound effects', () => {
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(main).not.toMatch(/class Sounds|sounds\.play|createOscillator/);
    expect(main).not.toMatch(/['"](?:flap|point|hit|start)['"]/);
  });
});
