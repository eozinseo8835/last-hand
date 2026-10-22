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

## Pixel 3D scene

The `pixel-3d` branch replaces the original scene with a procedural Three.js bunker. The `work` branch retains the original SVG version. Game rules, state transitions, audio, and dialogue are unchanged.

- Hold the left mouse button on the scene and drag to look around; the seated view is limited to ±100° yaw and ±35° pitch.
- Click **Recenter** to face the table. Dealing, reveal, and shooting automatically recenter the camera.
- The scene renders at a 360-pixel internal height with nearest-neighbor scaling, ordered dithering, film grain, and a vignette. HTML controls and text remain crisp.
- Room props, The Stranger, cards, revolver, and hands are code-built geometry. Textures and TV static are generated with canvas. No external models, images, or API services are used.
- Requires WebGL 2 / hardware acceleration in a current desktop Chrome. Low resolution, batched static geometry, and one 512px shadow light are used to reduce GPU/CPU cost. A MacBook Air 60fps target has not been verified on physical hardware.

`CONFIG.LOOK_SENSITIVITY` and `CONFIG.PIXEL_HEIGHT` in `src/game.ts` tune the view without affecting gameplay. `CONFIG.GORE_LEVEL = "low"` removes blood effects.

## Structure

- `src/game.ts`: pure deck, scoring, and shared revolver rules; all gameplay tuning in `CONFIG`.
- `src/useGame.ts`: guarded game state machine and pacing, with timer cleanup on replay/unmount.
- `src/dialogue.ts`: authored dialogue and nonrepeating selection; no live AI or API.
- `src/Scene.tsx`: WebGL rendering, pixel postprocessing, camera input, and scene lifecycle.
- `src/scene/room.ts`, `actors.ts`: procedural bunker, props, animated character, hands, revolver, and card meshes.
- `src/scene/camera.ts`, `merge.ts`: constrained look controls and static geometry batching.
- `src/audio.ts`: Web Audio synthesis and master mute.
- `src/App.tsx`, `src/styles.css`: HTML interface, responsive 16:9 layout, and screen effects.

Set `CONFIG.GORE_LEVEL` to `"low"` to remove stylized blood. Fonts are bundled. No external image/audio assets, backend, accounts, credentials, or runtime network calls are needed.

## Validation

`npm test` runs 47 engine, React integration, camera, and geometry tests covering deck integrity, values, ties, all six bullet positions, folding limits, hidden information, action locks, forced player trigger, both death paths, replay, dialogue, audio mute, timer cleanup, camera bounds/recentering, and geometry batching. The 3D interface was also exercised in Chromium through six shared trigger pulls and replay, including drag/button separation, camera limits and recentering, hidden cards, folding limits, and viewport checks at 1280×720 and 1920×1080. Chromium reported no console errors. This cloud check used software WebGL; it is not a MacBook Air performance measurement.
