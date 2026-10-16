import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  MASTER_MUSIC_VOLUME,
  Music,
  MUSIC_PREFERENCE_KEY,
  loadMusicPreference,
  saveMusicPreference,
} from '../src/music.js';

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
  it('creates the audio graph at the central master music volume', async () => {
    const harness = audioHarness();
    const music = new Music(harness);

    await music.startFromInteraction();

    expect(MASTER_MUSIC_VOLUME).toBe(0.50);
    expect(music.master.gain.value).toBe(MASTER_MUSIC_VOLUME);
  });

  it('treats enabling music from the toggle as the first audio interaction', async () => {
    const harness = audioHarness();
    const music = new Music({ ...harness, enabled: false });

    await music.setEnabled(true);

    expect(music.interacted).toBe(true);
    expect(music.started).toBe(true);
    expect(harness.contexts).toHaveLength(1);
  });

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
    expect(music.master.gain.value).toBe(MASTER_MUSIC_VOLUME);
    expect(music.context).toBe(context);
    expect(harness.contexts).toHaveLength(1);
    expect(writes).toEqual([
      [MUSIC_PREFERENCE_KEY, 'off'],
      [MUSIC_PREFERENCE_KEY, 'on'],
    ]);
  });

  it('pauses and resumes the same transport without changing the music preference', async () => {
    const harness = audioHarness();
    const writes = [];
    const music = new Music({ ...harness, storage: { setItem: (key, value) => writes.push([key, value]) } });
    await music.startFromInteraction();
    const context = music.context;
    const timer = music.timer;
    const position = context.currentTime;

    await music.setPaused(true);
    expect(context.state).toBe('suspended');
    expect(context.currentTime).toBe(position);

    await music.setPaused(false);
    expect(context.state).toBe('running');
    expect(music.context).toBe(context);
    expect(music.timer).toBe(timer);
    expect(harness.contexts).toHaveLength(1);
    expect(music.master.gain.value).toBe(MASTER_MUSIC_VOLUME);
    expect(writes).toEqual([]);
  });

  it('starts enabled music on resume when it was turned on during a pause', async () => {
    const harness = audioHarness();
    const music = new Music({ ...harness, enabled: false });
    await music.startFromInteraction();
    await music.setPaused(true);

    await music.setEnabled(true);
    expect(music.context).toBeNull();

    await music.setPaused(false);
    expect(harness.contexts).toHaveLength(1);
    expect(music.context.state).toBe('running');
    expect(music.master.gain.value).toBe(MASTER_MUSIC_VOLUME);
  });

  it('suspends for visibility loss and resumes the same context when visible', async () => {
    const harness = audioHarness();
    const music = new Music(harness);
    await music.startFromInteraction();
    const context = music.context;

    await music.handleVisibility(true);
    expect(context.suspend).toHaveBeenCalledTimes(1);
    music.master.gain.value = 0.01;
    await music.handleVisibility(false);
    expect(context.resume).toHaveBeenCalledTimes(2);
    expect(music.master.gain.value).toBe(MASTER_MUSIC_VOLUME);
    expect(music.context).toBe(context);
    expect(harness.contexts).toHaveLength(1);

    await music.setEnabled(false);
    await music.handleVisibility(false);
    expect(context.resume).toHaveBeenCalledTimes(2);
  });

  it('stays suspended when visibility returns while the game is paused', async () => {
    const harness = audioHarness();
    const music = new Music(harness);
    await music.startFromInteraction();

    await music.setPaused(true);
    await music.handleVisibility(true);
    await music.handleVisibility(false);

    expect(music.context.state).toBe('suspended');
    expect(music.context.resume).toHaveBeenCalledTimes(1);
  });

  it('does not restart audio from an interaction while the document is hidden', async () => {
    const harness = audioHarness();
    const music = new Music(harness);
    await music.startFromInteraction();
    await music.handleVisibility(true);

    const resumed = await music.startFromInteraction();

    expect(resumed).toBe(false);
    expect(music.context.state).toBe('suspended');
    expect(music.context.resume).toHaveBeenCalledTimes(1);
  });

  it('keeps the master muted when music is disabled during an audio resume', async () => {
    const harness = audioHarness();
    const music = new Music(harness);
    let finishResume;
    const resumePending = new Promise(resolve => { finishResume = resolve; });
    music.createAudioGraph();
    music.context.resume = vi.fn(() => resumePending);

    const start = music.startFromInteraction();
    await music.setEnabled(false);
    finishResume();
    await start;

    expect(music.enabled).toBe(false);
    expect(music.master.gain.value).toBe(0);
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
    expect(music.master.gain.value).toBe(MASTER_MUSIC_VOLUME);
    expect(music.step).toBeGreaterThanOrEqual(phraseStep);
    expect(music.started).toBe(true);
  });

  it('skips expired phrase steps after a long main-thread stall', async () => {
    const harness = audioHarness();
    const music = new Music(harness);
    await music.startFromInteraction();
    const context = music.context;
    const notesBeforeStall = context.createOscillator.mock.calls.length;

    context.currentTime += 30;
    music.safeSchedule();

    const notesAfterStall = context.createOscillator.mock.calls.length - notesBeforeStall;
    expect(notesAfterStall).toBeLessThanOrEqual(4);
    expect(music.nextStepAt).toBeGreaterThanOrEqual(context.currentTime);
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
