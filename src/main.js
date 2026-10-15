import { Game, CONFIG, loadHighScore, saveHighScore } from './engine.js';

const app = document.querySelector('#app');
const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const scoreEl = document.querySelector('#score');
const bestEl = document.querySelector('#best');
const titleEl = document.querySelector('#message-title');
const copyEl = document.querySelector('#message-copy');
const actionButton = document.querySelector('#start-button');
const pauseButton = document.querySelector('#pause-button');
const soundButton = document.querySelector('#sound-button');
const countdownEl = document.querySelector('#countdown');

class Sounds {
  constructor() { this.enabled = true; this.context = null; }
  unlock() {
    if (!this.enabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext && !this.context) this.context = new AudioContext();
      const resumed = this.context?.resume?.();
      resumed?.catch?.(() => {});
    } catch { this.context = null; }
  }
  play(type) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.context) return;
    try {
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const notes = { flap: [520, .055], point: [880, .1], hit: [145, .2], start: [390, .08] };
      const [frequency, length] = notes[type] || notes.flap;
      oscillator.type = type === 'hit' ? 'sawtooth' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      if (type === 'point') oscillator.frequency.exponentialRampToValueAtTime(1250, now + length);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.13, now + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, now + length);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now); oscillator.stop(now + length + .01);
    } catch { this.context = null; }
  }
}

const sounds = new Sounds();
function getStorage() { try { return window.localStorage; } catch { return null; } }
const storage = getStorage();
const game = new Game({
  highScore: loadHighScore(storage),
  onHighScore: value => saveHighScore(storage, value),
});
const testMode = new URLSearchParams(location.search).get('test') === '1';
let visualTime = 0;
let cssWidth = CONFIG.width;
let cssHeight = CONFIG.height;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  cssWidth = rect.width; cssHeight = rect.height;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
}

new ResizeObserver(resizeCanvas).observe(canvas);
resizeCanvas();

function roundRect(x, y, width, height, radius) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
}

function drawCloud(x, y, scale = 1, alpha = .8) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = '#e9fbff';
  ctx.beginPath();
  ctx.arc(x, y, 17 * scale, Math.PI, 0); ctx.arc(x + 21 * scale, y - 9 * scale, 23 * scale, Math.PI, 0);
  ctx.arc(x + 48 * scale, y, 17 * scale, Math.PI, 0); ctx.lineTo(x + 65 * scale, y + 12 * scale); ctx.lineTo(x - 17 * scale, y + 12 * scale); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.groundY);
  gradient.addColorStop(0, '#62d2ed'); gradient.addColorStop(.57, '#b6ecdd'); gradient.addColorStop(1, '#f8e3a4');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
  ctx.fillStyle = '#fff4ae'; ctx.beginPath(); ctx.arc(285, 114, 38, 0, Math.PI * 2); ctx.fill();
  const cloudOffset = (visualTime * 7) % 440;
  drawCloud(35 - cloudOffset, 142, .75, .7); drawCloud(475 - cloudOffset, 142, .75, .7);
  drawCloud(265 - (cloudOffset * .55), 210, .52, .5); drawCloud(705 - (cloudOffset * .55), 210, .52, .5);

  const far = (visualTime * 10) % 120;
  ctx.fillStyle = '#76b7a7';
  for (let x = -far - 120; x < 480; x += 120) { ctx.beginPath(); ctx.moveTo(x, 505); ctx.lineTo(x + 62, 355); ctx.lineTo(x + 125, 505); ctx.fill(); }
  ctx.fillStyle = '#4e927e';
  const near = (visualTime * 17) % 90;
  for (let x = -near - 90; x < 450; x += 90) { ctx.beginPath(); ctx.moveTo(x, 525); ctx.lineTo(x + 48, 410); ctx.lineTo(x + 98, 525); ctx.fill(); }
  ctx.fillStyle = '#327465'; ctx.fillRect(0, 508, CONFIG.width, 72);
  ctx.fillStyle = '#3f836d';
  for (let x = -((visualTime * 28) % 34); x < CONFIG.width + 34; x += 34) { ctx.beginPath(); ctx.arc(x, 514, 26, Math.PI, 0); ctx.fill(); }
  ctx.fillStyle = '#d9c36d'; ctx.fillRect(0, CONFIG.groundY, CONFIG.width, CONFIG.height - CONFIG.groundY);
  ctx.fillStyle = '#f4e797'; ctx.fillRect(0, CONFIG.groundY, CONFIG.width, 8);
  ctx.fillStyle = '#b49b4f';
  const groundOffset = (visualTime * 90) % 28;
  for (let x = -groundOffset; x < CONFIG.width; x += 28) { ctx.beginPath(); ctx.moveTo(x, 595); ctx.lineTo(x + 14, 580); ctx.lineTo(x + 21, 580); ctx.lineTo(x + 7, 595); ctx.fill(); }
}

function drawPipe(pipe) {
  const w = CONFIG.pipeWidth;
  const lip = 8;
  const drawBody = (x, y, width, height) => {
    const grad = ctx.createLinearGradient(x, 0, x + width, 0);
    grad.addColorStop(0, '#2b873c'); grad.addColorStop(.25, '#8be05a'); grad.addColorStop(.52, '#55bb45'); grad.addColorStop(1, '#176932');
    ctx.fillStyle = grad; roundRect(x, y, width, height, 4);
    ctx.fillStyle = '#b4f37a88'; ctx.fillRect(x + 9, y + 2, 6, Math.max(0, height - 4));
    ctx.strokeStyle = '#16552d'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, width - 3, Math.max(0, height - 3));
  };
  drawBody(pipe.x, -8, w, pipe.gapY - 12);
  drawBody(pipe.x - lip, pipe.gapY - 28, w + lip * 2, 28);
  drawBody(pipe.x - lip, pipe.gapY + pipe.gap, w + lip * 2, 28);
  drawBody(pipe.x, pipe.gapY + pipe.gap + 28, w, CONFIG.groundY - pipe.gapY - pipe.gap - 20);
}

function drawBird() {
  const b = game.bird;
  const flap = Math.sin(visualTime * 21) * .55;
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rotation);
  ctx.fillStyle = '#b87718'; ctx.beginPath(); ctx.ellipse(-11, 4, 12, 8, -.5 + flap, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#573710'; ctx.lineWidth = 2;
  const body = ctx.createRadialGradient(-5, -8, 2, 0, 0, 22); body.addColorStop(0, '#fff56b'); body.addColorStop(1, '#efa927');
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, 19, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(9, -8, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#172434'; ctx.beginPath(); ctx.arc(12, -8, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f06a27'; ctx.beginPath(); ctx.moveTo(14, -1); ctx.lineTo(29, 4); ctx.lineTo(14, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function draw() {
  const sx = canvas.width / CONFIG.width, sy = canvas.height / CONFIG.height;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
  drawBackground();
  for (const pipe of game.pipes) drawPipe(pipe);
  drawBird();
}

function updateUi() {
  app.dataset.state = game.state;
  scoreEl.textContent = game.score;
  bestEl.textContent = game.highScore;
  countdownEl.textContent = game.state === 'countdown' ? Math.max(1, Math.ceil(game.countdown)) : '';
  if (game.state === 'ready') {
    titleEl.textContent = 'Ready?'; copyEl.textContent = 'Thread the gaps and chase the skyline.';
    actionButton.textContent = 'Start flight'; actionButton.setAttribute('aria-label', 'Start game');
  } else if (game.state === 'paused') {
    titleEl.textContent = 'Paused'; copyEl.textContent = 'Take a breath. The skyline can wait.';
    actionButton.textContent = 'Resume'; actionButton.setAttribute('aria-label', 'Resume game');
  } else if (game.state === 'gameover') {
    titleEl.textContent = 'Game Over'; copyEl.textContent = `Score ${game.score} · Best ${game.highScore}`;
    actionButton.textContent = 'Fly again'; actionButton.setAttribute('aria-label', 'Restart game');
  }
  pauseButton.textContent = game.state === 'paused' ? '▶' : 'Ⅱ';
  pauseButton.setAttribute('aria-label', game.state === 'paused' ? 'Resume game' : 'Pause game');
}

function render() { draw(); updateUi(); }

function begin() {
  sounds.unlock(); sounds.play('start');
  if (game.state === 'paused') game.resume();
  else if (game.state === 'gameover') game.restart();
  else game.start();
  if (new URLSearchParams(location.search).get('fixture') === 'loss') game.gameOver();
  render();
}

function flapOrStart() {
  sounds.unlock();
  if (game.state === 'playing') { game.flap(); sounds.play('flap'); }
  else if (game.state === 'ready' || game.state === 'gameover') begin();
}

actionButton.addEventListener('click', begin);
pauseButton.addEventListener('click', () => { game.state === 'paused' ? game.resume() : game.pause(); render(); });
soundButton.addEventListener('click', () => {
  sounds.enabled = !sounds.enabled; if (sounds.enabled) sounds.unlock();
  soundButton.textContent = sounds.enabled ? '♪' : '×';
  soundButton.setAttribute('aria-pressed', String(sounds.enabled));
  soundButton.setAttribute('aria-label', sounds.enabled ? 'Mute sound' : 'Enable sound');
});
canvas.addEventListener('pointerdown', event => { event.preventDefault(); flapOrStart(); });
window.addEventListener('keydown', event => {
  if (event.code === 'Space') { event.preventDefault(); flapOrStart(); }
  if (event.code === 'KeyP' && (game.state === 'playing' || game.state === 'paused')) { game.state === 'paused' ? game.resume() : game.pause(); render(); }
});
function handleVisibility(forceHidden = document.hidden) { if (forceHidden && (game.state === 'playing' || game.state === 'countdown')) { game.pause(); render(); } }
document.addEventListener('visibilitychange', () => handleVisibility());

let previous = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - previous) / 1000); previous = now;
  if (!testMode && (game.state === 'playing' || game.state === 'countdown')) {
    visualTime += dt;
    const beforeState = game.state, beforeScore = game.score;
    game.advance(dt);
    if (game.score > beforeScore) sounds.play('point');
    if (game.state === 'gameover' && beforeState !== 'gameover') sounds.play('hit');
    render();
  }
  requestAnimationFrame(frame);
}

window.__flappy = { game, render, handleVisibility, get dimensions() { return { cssWidth, cssHeight }; } };
render(); requestAnimationFrame(frame);
