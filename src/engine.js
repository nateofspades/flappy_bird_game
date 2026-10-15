export const CONFIG = Object.freeze({
  width: 360, height: 640, groundY: 580, birdX: 92, birdRadius: 14,
  gravity: 1120, flapVelocity: -360, pipeWidth: 64, baseGap: 164,
  minGap: 118, baseSpeed: 112, maxSpeed: 190, pipeSpacing: 214,
  fixedStep: 1 / 120, gapTopMargin: 105, gapBottomMargin: 65,
});

const SCORE_KEY = 'flappy-high-score';

export function loadHighScore(storage) {
  try {
    const value = Number.parseInt(storage?.getItem(SCORE_KEY) ?? '', 10);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}

export function saveHighScore(storage, value) {
  const score = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  try { storage?.setItem(SCORE_KEY, String(score)); return true; }
  catch { return false; }
}

export class Game {
  constructor(options = {}) {
    this.config = { ...CONFIG, ...(options.config || {}) };
    this.random = options.random || Math.random;
    this.highScore = Math.max(0, Number(options.highScore) || 0);
    this.onHighScore = options.onHighScore || (() => {});
    this.reset();
  }

  reset() {
    this.state = 'ready';
    this.score = 0;
    this.elapsed = 0;
    this.countdown = 3;
    this.accumulator = 0;
    this.spawnDistance = 120;
    this.bird = { x: this.config.birdX, y: this.config.height * 0.42, vy: 0, radius: this.config.birdRadius, rotation: 0 };
    this.pipes = [];
  }

  start() {
    if (this.state === 'ready' || this.state === 'gameover') {
      this.reset();
      this.state = 'countdown';
    }
  }

  restart() { this.reset(); this.state = 'countdown'; }

  pause() {
    if (this.state === 'playing' || this.state === 'countdown') {
      this.resumeState = this.state;
      this.state = 'paused';
    }
  }

  resume() {
    if (this.state === 'paused') this.state = this.resumeState || 'playing';
  }

  flap() {
    if (this.state === 'playing') this.bird.vy = this.config.flapVelocity;
  }

  difficulty() {
    const level = Math.max(0, this.score);
    return {
      speed: Math.min(this.config.maxSpeed, this.config.baseSpeed + level * 2.8),
      gap: Math.max(this.config.minGap, this.config.baseGap - level * 1.45),
    };
  }

  spawnPipe() {
    const { gap } = this.difficulty();
    const min = this.config.gapTopMargin;
    const max = this.config.groundY - this.config.gapBottomMargin - gap;
    const gapY = min + Math.max(0, max - min) * Math.max(0, Math.min(1, this.random()));
    this.pipes.push({ x: this.config.width + 8, gapY, gap, scored: false });
  }

  advance(seconds) {
    let remaining = Math.max(0, Math.min(Number(seconds) || 0, 5));
    if (this.state === 'countdown') {
      const used = Math.min(remaining, this.countdown);
      this.countdown -= used;
      remaining -= used;
      if (this.countdown <= 1e-9) { this.countdown = 0; this.state = 'playing'; }
    }
    if (this.state !== 'playing' || remaining <= 0) return;
    this.accumulator += remaining;
    const step = this.config.fixedStep;
    while (this.accumulator + 1e-12 >= step && this.state === 'playing') {
      this.update(step);
      this.accumulator -= step;
    }
  }

  updateScore() {
    for (const pipe of this.pipes) {
      if (!pipe.scored && pipe.x + this.config.pipeWidth < this.bird.x) {
        pipe.scored = true;
        this.score += 1;
      }
    }
  }

  collides() {
    const b = this.bird;
    if (b.y - b.radius <= 0 || b.y + b.radius >= this.config.groundY) return true;
    return this.pipes.some(pipe => {
      const horizontal = b.x + b.radius > pipe.x && b.x - b.radius < pipe.x + this.config.pipeWidth;
      return horizontal && (b.y - b.radius < pipe.gapY || b.y + b.radius > pipe.gapY + pipe.gap);
    });
  }

  gameOver() {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.onHighScore(this.highScore);
    }
  }

  update(dt) {
    if (this.state !== 'playing') return;
    this.elapsed += dt;
    this.bird.vy += this.config.gravity * dt;
    this.bird.y += this.bird.vy * dt;
    this.bird.rotation = Math.max(-0.45, Math.min(1.15, this.bird.vy / 500));
    const { speed } = this.difficulty();
    this.spawnDistance -= speed * dt;
    if (this.spawnDistance <= 0) {
      this.spawnPipe();
      this.spawnDistance += this.config.pipeSpacing;
    }
    for (const pipe of this.pipes) pipe.x -= speed * dt;
    this.updateScore();
    this.pipes = this.pipes.filter(pipe => pipe.x + this.config.pipeWidth > -5);
    if (this.collides()) this.gameOver();
  }
}
