# LAST HAND

A single-player psychological card duel for desktop browsers. Two strangers, two cards each, six shared chambers, one bullet. All interface and dialogue text is in English.

## Develop

Requires Node.js 22+ and npm.

```sh
npm ci --cache /tmp/last-hand-npm-cache
npm run dev -- --port 5173
```

Open the development server in a desktop browser. Click **Sit down** to begin; **How to play** explains the rules. Sound starts with your first interaction and can be muted at any time.

```sh
npm test
npm run build
npm run preview -- --port 4173
```

## Structure

- `src/game.ts`: pure deck, scoring, and shared revolver rules; all gameplay tuning in `CONFIG`.
- `src/useGame.ts`: guarded game state machine and pacing, with timer cleanup on replay/unmount.
- `src/dialogue.ts`: authored dialogue and nonrepeating selection; no live AI or API.
- `src/Scene.tsx`: original SVG room, opponent, hands, and revolver.
- `src/audio.ts`: Web Audio synthesis and master mute.
- `src/App.tsx`, `src/styles.css`: interface, 3D card reveal, responsive 16:9 layout, and effects.

Set `CONFIG.GORE_LEVEL` to `"low"` to remove stylized blood. Fonts are bundled. No external image/audio assets, backend, accounts, credentials, or runtime network calls are needed.

## Validation

`npm test` runs 35 engine and React integration tests covering deck integrity, values, ties, all six bullet positions, folding limits, hidden information, action locks, forced player trigger, both death paths, replay, dialogue, audio mute, and timer cleanup. The interface was also exercised in Chromium through a complete game and replay, with viewport checks at 1280×720 and 1920×1080.
