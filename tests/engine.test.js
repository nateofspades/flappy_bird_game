import { describe, it, expect } from 'vitest';
import { Game, CONFIG, loadHighScore, saveHighScore } from '../src/engine.js';

const active = (options = {}) => { const g = new Game(options); g.start(); g.advance(3); return g; };

describe('flight', () => {
  it('counts down before gravity and gives an upward flap impulse', () => {
    const g = new Game(); expect(g.state).toBe('ready');
    g.start(); const y = g.bird.y; g.advance(1); expect(g.bird.y).toBe(y);
    g.advance(2); expect(g.state).toBe('playing');
    g.advance(0.1); expect(g.bird.y).toBeGreaterThan(y);
    g.flap(); expect(g.bird.vy).toBeLessThan(0);
    const before = g.bird.y; g.advance(0.1); expect(g.bird.y).toBeLessThan(before);
  });
  it('integrates identical fixed steps across frame partitions', () => {
    const a = active(), b = active(); a.flap(); b.flap();
    for (let i = 0; i < 30; i++) a.advance(1 / 60);
    for (let i = 0; i < 10; i++) b.advance(1 / 20);
    expect(a.bird.y).toBeCloseTo(b.bird.y, 8);
    expect(a.bird.vy).toBeCloseTo(b.bird.vy, 8);
  });
});

describe('pipes and challenge', () => {
  it('creates randomized gaps inside achievable bounds', () => {
    const low = active({ random: () => 0 }); low.spawnPipe();
    const high = active({ random: () => 1 }); high.spawnPipe();
    expect(low.pipes[0].gapY).toBeGreaterThanOrEqual(105);
    expect(high.pipes[0].gapY + high.pipes[0].gap).toBeLessThanOrEqual(CONFIG.groundY - 65);
    expect(low.pipes[0].gapY).not.toBe(high.pipes[0].gapY);
  });
  it('increases speed and narrows gaps while respecting limits', () => {
    const g = active();
    const early = g.difficulty(); g.score = 100; const late = g.difficulty();
    expect(late.speed).toBeGreaterThan(early.speed);
    expect(late.gap).toBeLessThan(early.gap);
    expect(late.gap).toBeGreaterThanOrEqual(CONFIG.minGap);
  });
  it('awards each passed pipe exactly once', () => {
    const g = active();
    g.pipes = [{ x: g.bird.x - CONFIG.pipeWidth - 1, gapY: 100, gap: 300, scored: false }];
    g.updateScore(); g.updateScore();
    expect(g.score).toBe(1);
    expect(g.pipes[0].scored).toBe(true);
  });
});

describe('collisions and lifecycle', () => {
  it('ends on ceiling and ground bounds', () => {
    const top = active(); top.bird.y = top.bird.radius - 1; top.update(1 / 120); expect(top.state).toBe('gameover');
    const bottom = active(); bottom.bird.y = CONFIG.groundY - bottom.bird.radius + 1; bottom.update(1 / 120); expect(bottom.state).toBe('gameover');
  });
  it('hits pipe bodies but safely traverses the gap', () => {
    const hit = active(); hit.pipes = [{ x: hit.bird.x - 10, gapY: 230, gap: 130, scored: false }]; hit.bird.y = 150; hit.update(1 / 120); expect(hit.state).toBe('gameover');
    const safe = active(); safe.pipes = [{ x: safe.bird.x - 10, gapY: 230, gap: 130, scored: false }]; safe.bird.y = 290; safe.bird.vy = 0; safe.update(1 / 120); expect(safe.state).toBe('playing');
  });
  it('pauses, resumes, and ignores simulation while paused', () => {
    const g = active(); g.pause(); const y = g.bird.y; g.advance(2); expect(g.bird.y).toBe(y); expect(g.state).toBe('paused');
    g.resume(); expect(g.state).toBe('playing'); g.advance(0.1); expect(g.bird.y).not.toBe(y);
  });
  it('restart clears run data and starts a fresh countdown', () => {
    const g = active(); g.score = 9; g.pipes.push({}); g.gameOver(); g.restart();
    expect(g.state).toBe('countdown'); expect(g.score).toBe(0); expect(g.pipes).toEqual([]); expect(g.countdown).toBe(3);
  });
  it('game over is idempotent and preserves the best score', () => {
    const writes = []; const g = active({ highScore: 2, onHighScore: value => writes.push(value) });
    g.score = 7; g.gameOver(); g.gameOver();
    expect(g.state).toBe('gameover'); expect(g.highScore).toBe(7); expect(writes).toEqual([7]);
  });
});

describe('persistence', () => {
  it('reads valid scores and survives unavailable or corrupt storage', () => {
    expect(loadHighScore({ getItem: () => '12' })).toBe(12);
    expect(loadHighScore({ getItem: () => 'oops' })).toBe(0);
    expect(loadHighScore({ getItem: () => { throw Error('blocked'); } })).toBe(0);
  });
  it('writes safely without leaking storage errors', () => {
    const values = []; expect(saveHighScore({ setItem: (k, v) => values.push([k, v]) }, 8)).toBe(true);
    expect(values).toEqual([['flappy-high-score', '8']]);
    expect(saveHighScore({ setItem: () => { throw Error('full'); } }, 8)).toBe(false);
  });
});
