# Crusor

Crusor is a mobile-first arcade game prototype. Drag to steer your ship, collect
falling stars for points, and dodge meteors before your shields run out.

## Tech stack

- Vite
- TypeScript
- HTML Canvas
- CSS optimized for mobile safe areas and touch input

## Getting started

Install dependencies:

```bash
npm install
```

Run the local dev server:

```bash
npm run dev
```

Build a production bundle:

```bash
npm run build
```

Preview the production bundle:

```bash
npm run preview
```

## Game loop

- Drag anywhere on the screen to move the ship.
- Collect stars to add 10 points.
- Avoid meteors. Each hit removes one shield.
- The run ends when shields reach zero.
- The best score is saved in local browser storage.

## Next gameplay ideas

- Add sound effects and haptics.
- Introduce power-ups such as magnet, slow motion, and shield refill.
- Add levels, missions, and unlockable ships.
- Package the web build for app stores with Capacitor or a similar wrapper.
