# Flappy Bird

**Play now:** https://nateofspades.github.io/flappy_bird_game/

![Flappy Bird gameplay](assets/screenshots/gameplay.png)

A portrait, canvas-based skyline flight game built with static HTML, CSS, and vanilla JavaScript. It supports keyboard, mouse, and touch input, responsive high-DPI rendering, a three-second launch countdown, pause/resume, persistent best scores, and optional WebAudio effects.

## Controls

- **Space**, click, or tap: start / flap
- **P** or the pause button: pause / resume
- **Sound button**: mute / enable effects
- **Fly again**: restart after a collision

Fly through each pipe gap. Touching a pipe, the ceiling, or the ground ends the run. Pipe speed increases and gaps narrow as the score rises.

## Run locally

```bash
npm ci
npm run dev
```

Open the local URL printed by the development server.

## Test

```bash
npm test
npx playwright install chromium
npm run test:e2e
```

The Vitest suite covers deterministic game logic. Playwright verifies browser behavior, controls, touch, visibility pausing, error-free loading, and the required responsive viewports. Playwright uses port `4174`.
