# LAST HAND

A single-player psychological blackjack duel in a procedural pixelated 3D bunker. Face the Stranger, play one shared deck each round, and avoid losing a hand: the loser faces the shared six-chamber revolver. All interface and dialogue text is in English.

## Develop

Requires Node.js 22+, npm, and a current desktop Chrome with WebGL 2 / hardware acceleration.

```sh
npm ci --cache /tmp/last-hand-npm-cache
npm run dev
```

Open the development server in a desktop browser and click **Sit down**. **How to play** explains the rules. Sound begins with your first interaction and can be muted at any time.

```sh
npm test
npm run build
npm run preview -- --port 4173
```

## Blackjack and controls

- **HIT** takes another card from the current round's deck. **STAND** lays down your held cards and reveals the Stranger's hole card; the Stranger draws until 17 or more and stands on soft 17.
- Face cards count as 10. An Ace counts as 11 unless it must count as 1 to avoid busting. The HUD labels soft totals.
- A player bust loses immediately, with no dealer draws. A dealer bust loses to the player. Equal totals are a **PUSH**: neither a shot nor a fold is used.
- **FOLD** is available only before the first HIT of a round, up to three times per game.
- The loser shoots. The player must click **PULL THE TRIGGER**; the Stranger shoots automatically. Empty chambers advance the same shared cylinder. The single bullet ends the game by the sixth pull.
- Hold the left mouse button and drag, or hold **A / D** to look left/right and **W / S** to look up/down. Looking turns the seated head without walking, within ±100° yaw and ±35° pitch. Key motion accelerates and releases smoothly.
- **Recenter** faces the table. Deals, reveals, dealer draws, and shooting automatically recenter the camera and ignore keyboard look.

The Stranger shuffles and deals player / Stranger up / player / Stranger hole one card at a time. Your cards slide back-up to your low-poly left hand and form a camera-facing fan. They are only laid face-up on the table at showdown. The Stranger peeks without exposing its hole card and sweeps the cards before each new round.

## Scene and implementation

The `pixel-3d` branch retains its existing Three.js bunker, lighting, Stranger design, gore level, procedural textures, palette, dithering, film grain, and vignette. The scene renders at a 360-pixel internal height with nearest-neighbor scaling. HUD text and controls remain crisp HTML, inside a safe margin.

- `src/game.ts`: deck operations, soft/hard blackjack totals, hand comparison, unchanged revolver rules, and tuning in `CONFIG`.
- `src/useGame.ts`: timed, guarded game state machine; one shared deck per round; explicit player trigger and complete replay reset.
- `src/dialogue.ts`: authored dialogue, bluff selection, and nonrepeating delivery; no live AI or API.
- `src/Scene.tsx`: WebGL rendering, postprocessing, mouse/WASD input, and scene lifecycle.
- `src/scene/room.ts`: procedural room, props, and existing lighting.
- `src/scene/actors.ts`: character, hands, revolver, dealer deck, held fan, and per-card animations.
- `src/scene/camera.ts`, `merge.ts`: constrained look controls and static geometry batching.
- `src/audio.ts`: existing Web Audio synthesis and master mute.
- `src/App.tsx`, `src/styles.css`: interface, soft totals, actions, and HUD layout.

`CONFIG.LOOK_KEY_SPEED` is keyboard angular speed in radians per second; `DEAL_SPEED` is milliseconds per dealt card; `DEALER_STANDS_ON` defaults to 17. `LOOK_SENSITIVITY`, `PIXEL_HEIGHT`, and `GORE_LEVEL` retain their existing defaults. Set `GORE_LEVEL` to `"low"` to remove blood effects.

Geometry and textures are code-generated, and fonts are bundled. No external model/image/audio assets, backend, accounts, credentials, or runtime API services are required. Static geometry batching and one 512px shadow light reduce rendering cost. Physical MacBook Air 60fps performance has not been measured in this cloud environment.

## Validation

`npm test` runs 79 engine, React integration, camera, and geometry tests. These cover soft/hard Aces, exact deal order and sounds, same-deck hits without duplicates, bust paths, dealer 17 / soft 17, push safety, fold restrictions, the existing shared revolver, guarded animations, explicit trigger, dialogue, mute, sweep/replay, keyboard bounds and auto-recenter, and actual card mesh orientations before and after showdown.

The interface is also checked in Chromium for held-card readability, dealer animations, keyboard and mouse controls, bust / push / dealer draws, and safe HUD bounds at 1280×720, 1440×900, and 1920×1080. Cloud browser checks use software WebGL rather than a physical Mac GPU.
