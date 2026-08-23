# WebRunner Parkour

A 3D web-based parkour game where you swing between buildings in a procedurally generated city. Built with Three.js, React, and Supabase Realtime for multiplayer.

## Features

- **3D City Environment** — Procedurally generated skyline with buildings of varying heights
- **Web-Swinging Mechanics** — Shoot webs, swing from anchors, build combos for higher scores
- **Multiple Game Modes**
  - **Solo** — Timed run, collect tokens, beat your best score
  - **Free** — No timer, no pressure, just swing around
  - **Versus** — Real-time multiplayer via Supabase (share a room code with friends)
- **HUD** — Score, combo multiplier, speed, altitude, anchor indicator
- **Sound Effects** — Procedural audio via Web Audio API
- **Persistent High Scores** — Best score saved to localStorage

## Tech Stack

- **React 18** + **TypeScript** — UI and game state
- **Three.js** — 3D rendering and physics
- **Vite** — Build tool
- **Tailwind CSS v4** — HUD and menu styling
- **Supabase Realtime** — Multiplayer networking
- **Web Audio API** — Sound effects

## Getting Started

```bash
npm install
npm run dev
```

The dev server starts on `http://localhost:3000`.

## Build

```bash
npm run build
```

Output goes to `dist/`. The base path is set to `/websling-parkour/` in `vite.config.js` for this repository.

## Deploy to GitHub Pages

Pushes to `main` deploy automatically through `.github/workflows/deploy-pages.yml`. In the repository settings, open **Pages** and set **Source** to **GitHub Actions**.

## Controls

- **Mouse** — Look around (pointer lock)
- **Left Click** — Shoot web / swing (hold to stay attached)
- **Right Click** — Brake / slow down
- **WASD** — Movement
- **Space** — Shoot web (alternative)
- **Shift** — Sprint
- **Esc** — Pause

## Multiplayer

1. Select **Versus** mode
2. Share the 4-letter room code with friends
3. Everyone enters the code and a display name
4. Host clicks **Start** when ready

Uses Supabase Realtime channels for peer-to-peer state sync (~12 Hz).

## Project Structure

```
src/
├── game/
│   ├── engine.ts    — Game loop, physics, rendering
│   ├── world.ts     — Procedural city generation
│   ├── audio.ts     — Web Audio sound effects
│   └── net.ts       — Supabase Realtime networking
├── components/
│   └── ui.tsx       — React HUD, menus, screens
├── App.tsx          — Root component
└── main.tsx         — Entry point
```

## License

MIT
