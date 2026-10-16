export const MUSIC_PREFERENCE_KEY = 'flappy-music-enabled';
export const MASTER_MUSIC_VOLUME = 0.28;

// "Skyline Skip" — an original 32-step C-major WebAudio loop composed for this game.
const MELODY = [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 79, 83, 81, 79, 77, 74,
  69, 72, 76, 72, 71, 74, 77, 74, 69, 72, 76, 79, 77, 76, 74, 71];
const BASS = [48, 48, 53, 53, 45, 45, 55, 55];
const STEP_SECONDS = 60 / 148 / 2;
const LOOK_AHEAD_SECONDS = 0.28;

function midiToHz(note) {
  return 440 * (2 ** ((note - 69) / 12));
}

export function loadMusicPreference(storage) {
  try {
    return storage?.getItem(MUSIC_PREFERENCE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveMusicPreference(storage, enabled) {
  try {
    storage?.setItem(MUSIC_PREFERENCE_KEY, enabled ? 'on' : 'off');
    return true;
  } catch {
    return false;
  }
}

export class Music {
  constructor(options = {}) {
    this.createContext = options.createContext || (() => {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      return AudioContext ? new AudioContext() : null;
    });
    this.setInterval = options.setInterval || globalThis.setInterval.bind(globalThis);
    this.clearInterval = options.clearInterval || globalThis.clearInterval.bind(globalThis);
    this.storage = options.storage || null;
    this.enabled = options.enabled ?? loadMusicPreference(this.storage);
    this.context = null;
    this.master = null;
    this.timer = null;
    this.started = false;
    this.interacted = false;
    this.step = 0;
    this.nextStepAt = 0;
  }

  async startFromInteraction() {
    this.interacted = true;
    if (!this.enabled) return false;
    if (this.context?.state === 'closed') {
      this.context = null;
      this.master = null;
      this.started = false;
    }
    if (!this.context && !this.createAudioGraph()) return false;
    try {
      await this.context.resume?.();
      this.master.gain.setValueAtTime(this.enabled ? MASTER_MUSIC_VOLUME : 0, this.context.currentTime);
    } catch { return false; }
    if (!this.safeSchedule()) return false;
    if (this.timer === null) this.timer = this.setInterval(() => this.safeSchedule(), 50);
    this.started = true;
    return true;
  }

  safeSchedule() {
    try {
      this.schedule();
      return true;
    } catch {
      this.started = false;
      return false;
    }
  }

  async setEnabled(enabled) {
    this.interacted = true;
    this.enabled = Boolean(enabled);
    saveMusicPreference(this.storage, this.enabled);
    if (this.master && this.context) {
      this.master.gain.setValueAtTime(this.enabled ? MASTER_MUSIC_VOLUME : 0, this.context.currentTime);
    }
    if (this.enabled && this.interacted) return this.startFromInteraction();
    return this.enabled;
  }

  async handleVisibility(hidden) {
    if (!this.context || !this.interacted) return false;
    try {
      if (hidden) {
        await this.context.suspend?.();
        return true;
      }
      if (this.enabled) return this.startFromInteraction();
    } catch {
      return false;
    }
    return false;
  }

  createAudioGraph() {
    try {
      this.context = this.createContext();
      if (!this.context) return false;
      this.master = this.context.createGain();
      this.master.gain.setValueAtTime(this.enabled ? MASTER_MUSIC_VOLUME : 0, this.context.currentTime);
      this.master.connect(this.context.destination);
      this.nextStepAt = this.context.currentTime + 0.03;
      return true;
    } catch {
      this.context = null;
      this.master = null;
      return false;
    }
  }

  playNote(note, at, length, volume, type = 'triangle') {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(midiToHz(note), at);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(volume, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
  }

  schedule() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    if (this.nextStepAt < now) {
      const missedSteps = Math.ceil((now - this.nextStepAt) / STEP_SECONDS);
      this.step = (this.step + missedSteps) % MELODY.length;
      this.nextStepAt += missedSteps * STEP_SECONDS;
    }
    const horizon = now + LOOK_AHEAD_SECONDS;
    while (this.nextStepAt < horizon) {
      const melodyNote = MELODY[this.step % MELODY.length];
      this.playNote(melodyNote, this.nextStepAt, STEP_SECONDS * 0.72, 0.34);
      if (this.step % 4 === 0) {
        const bassNote = BASS[Math.floor(this.step / 4) % BASS.length];
        this.playNote(bassNote, this.nextStepAt, STEP_SECONDS * 3.1, 0.2, 'sine');
      }
      if (this.step % 8 === 6) {
        this.playNote(melodyNote + 12, this.nextStepAt, STEP_SECONDS * 0.42, 0.1, 'sine');
      }
      this.step = (this.step + 1) % MELODY.length;
      this.nextStepAt += STEP_SECONDS;
    }
  }
}
