# LAST HAND

A single-player psychological blackjack duel in a procedural pixelated 3D bunker. Face the Stranger, play one shared deck each round, and avoid losing a hand: the loser faces the shared six-chamber revolver. All interface and dialogue text is in English.

## Develop

Requires Node.js 22+, npm, and a current desktop Chrome with WebGL 2 / hardware acceleration.

```sh
npm ci --cache /tmp/last-hand-npm-cache
npm run dev
```

Open the development server in a desktop browser and click **Sit down**. **How to play** explains the rules. Sound starts after **Sit down** unlocks the browser's AudioContext and can be muted at any time.

```sh
npm test
npm run build
npm run preview -- --port 4173
```

The development server uses port 5173 and reports an error if that port is occupied, so a second copy cannot silently open on 5174 while the browser keeps showing an older game.

If you still see **GO**, you are viewing an older version. Stop the running server with **Ctrl+C**. For a Git checkout, update the game folder before restarting:

```sh
git fetch origin
git switch pixel-3d
git pull --ff-only origin pixel-3d
npm ci
npm run dev
```

For a ZIP download, use the [pixel-3d branch archive](https://github.com/eozinseo8835/last-hand/archive/refs/heads/pixel-3d.zip), extract it into a new folder, and run `npm ci` followed by `npm run dev` from the folder containing `package.json`. Open the URL printed by that terminal. Phase A has **FOLD / PEEK / HIT / STAND**, **SPIN 1 · PEEK 1** readouts, and **HOLD TO PULL** when the player loses. If port 5173 is occupied, stop its existing server before restarting.

## Blackjack and controls

- **HIT** takes another card from the current round's deck. **STAND** lays down your held cards and reveals the Stranger's hole card; the Stranger draws until 17 or more and stands on soft 17, with the one-time PEEK exception below.
- Face cards count as 10. An Ace counts as 11 unless it must count as 1 to avoid busting. The HUD labels soft totals.
- A player bust loses immediately, with no dealer draws. A dealer bust loses to the player. Equal totals are a **PUSH**: neither a shot nor a fold is used.
- **FOLD** is available only before the first HIT of a round, up to three times per game.
- The loser shoots. Hold **HOLD TO PULL** continuously for 3 seconds; a click never fires. Releasing cancels the pull and drains progress over 0.6 seconds. The hammer cocks at one third, the cylinder turns at two thirds, and the existing click/bang resolves at completion. Losing focus or opening the rules cancels the hold too.
- During the hold, the revolver rises until its barrel points straight at the player's eye through the center of the view. The final part of the hold keeps that aim, with the existing hand tremble.
- The Stranger hesitates for 1.5–4 seconds before its own shot, longer as the current cylinder empties. Waiting more than ten seconds for the player's hold prompts impatient dialogue, without firing automatically.
- Empty shots advance the shared cylinder. SPIN resets its pointer and bullet; after the final SPIN, the game ends within six further trigger pulls.
- Hold the left mouse button and drag, or hold **A / D** to look left/right and **W / S** to look up/down. Looking turns the seated head without walking, within ±100° yaw and ±35° pitch. Key motion accelerates and releases smoothly.
- **Recenter** faces the table. Deals, reveals, dealer draws, and shooting automatically recenter the camera and ignore keyboard look.

The Stranger shuffles and deals player / Stranger up / player / Stranger hole one card at a time. Your cards slide back-up to your low-poly left hand and form a camera-facing fan. They are only laid face-up on the table at showdown. The Stranger peeks without exposing its hole card and sweeps the cards before each new round.

## Phase A tension systems

A match is the full duel against this opponent. Each side has one **SPIN** and one **PEEK** per match; replay resets both inventories and the three folds. Remaining abilities share the existing HUD readouts.

- **SPIN CYLINDER** is available only to the shooter before holding the trigger. It moves the bullet to a fresh random chamber among all six, clears the fired marks, and resets the pointer to one. The Stranger uses its SPIN when it must shoot with three or fewer unfired chambers left. The cylinder visibly spins with a ratchet sound.
- **PEEK** privately shows the next undealt card until the player's next action; HIT receives exactly that card. The Stranger uses its PEEK before drawing at 12–16 and stands if that card would bust it. Otherwise, it draws the peeked card normally.

During player decisions, the Stranger loops one physical tell chosen from calm or nervous gestures. A real opening total of 17 or more is strong. The tell matches that strength 70% of the time and misleads otherwise, independently of dialogue bluff selection. Watch the Stranger. Its body may give it away, or lie.

Heartbeat plays during decisions and shooting suspense. Its base is 60 BPM plus 15 for every fired chamber in the current cylinder, and it becomes faster and louder during the player's hold. Heartbeat ducks beneath speech. Hands tremble more as chambers are fired; holding strengthens the tremble and darkens the vignette with the audio-clock pulse. Reduced motion lowers tremble, shaking, and pulsing.

Each round has a 35% chance of one decision-phase event: a 3–5 second blackout, three to five door bangs with a small camera shake and flinch, or the existing CRT showing static and “WE ARE WATCHING.” The HUD remains readable. Events stop when play leaves the decision phase and never consume cards, move the cylinder, or advance gameplay randomness.

Breakdown depends only on fired chambers in the current cylinder. From chamber three, dialogue becomes short; from chamber five, it becomes mostly silence or breath. Breathing, fidgeting, and voice wobble increase with that same chamber count. SPIN resets the cylinder's danger count along with its pointer.

`CONFIG.TELL_ACCURACY`, `HEARTBEAT_BASE_BPM`, `TRIGGER_HOLD_MS`, and `RANDOM_EVENT_CHANCE` tune these systems. Defaults are `0.7`, `60`, `3000` milliseconds, and `0.35`.

## Scene and implementation

The `pixel-3d` branch retains its existing Three.js bunker, baseline lighting, Stranger design, gore level, procedural textures, palette, dithering, film grain, and vignette. Event lighting and the hold vignette are temporary. The scene renders at a 360-pixel internal height with nearest-neighbor scaling. HUD text and controls remain crisp HTML, inside a safe margin.

- `src/game.ts`: deck operations, soft/hard blackjack totals, hand comparison, unchanged revolver rules, and tuning in `CONFIG`.
- `src/useGame.ts`: timed, guarded game state machine; one shared deck per round; continuous trigger hold, abilities, events, and complete replay reset.
- `src/tension.ts`: independent cosmetic randomness, tell selection, event plans, heartbeat pacing, and chamber-only breakdown.
- `src/dialogue.ts`: authored dialogue, bluff selection, and nonrepeating delivery; no live AI or API.
- `src/Scene.tsx`: WebGL rendering, postprocessing, mouse/WASD input, and scene lifecycle.
- `src/scene/room.ts`: procedural room, props, and existing lighting.
- `src/scene/actors.ts`: character, hands, revolver, dealer deck, held fan, and per-card animations.
- `src/scene/camera.ts`, `merge.ts`: constrained look controls and static geometry batching.
- `src/audio.ts`: existing effects and voice, synthesized heartbeat/mechanisms/events, ducking, and master mute.
- `src/HoldTrigger.tsx`: pointer/keyboard hold input, progress ring, and cancellation on release or lost focus.
- `src/App.tsx`, `src/styles.css`: interface, soft totals, actions, and HUD layout.

`CONFIG.LOOK_KEY_SPEED` is keyboard angular speed in radians per second; `DEAL_SPEED` is milliseconds per dealt card; `DEALER_STANDS_ON` defaults to 17. `LOOK_SENSITIVITY`, `PIXEL_HEIGHT`, and `GORE_LEVEL` retain their existing defaults. Set `GORE_LEVEL` to `"low"` to remove blood effects.

Geometry and textures are code-generated, and fonts are bundled. No external model/image/audio assets, backend, accounts, credentials, or runtime API services are required. Static geometry batching and one 512px shadow light reduce rendering cost. Physical MacBook Air 60fps performance has not been measured in this cloud environment.

Revolver audio is generated locally: steel hammer and cylinder impacts, a slowing ratchet, a dry empty strike, and a layered gunshot with a sharp pressure crack, low body, and short concrete-room reflections. Sound randomness is independent of the deck and bullet position. No audio files are needed.

## Stranger voice

The Stranger's unintelligible murmur is synthesized with low sawtooth/pulse oscillators, vowel formants, breath noise, mild distortion, a muffled mask filter, and a short generated room response. Text-seeded syllables share the subtitle's typewriter timeline, including punctuation pauses. Click the dialogue to finish the text and fade the voice within 100ms. The mask bobs very slightly with each syllable; reduced motion makes this smaller.

Confident and bluff lines use identical voice settings. Nervous lines are slightly faster and less steady; the opening and danger lines are slower and deeper. The existing suspense tone ducks slightly under speech. The sound toggle mutes the voice alongside the existing effects. No audio files or speech service are used.

Tune `CONFIG.VOICE_ENABLED` (default `true`), `VOICE_PITCH` (96 Hz), `VOICE_SPEED` (1), and `VOICE_VOLUME` (0.28) in `src/game.ts`.

## Validation

`npm test` covers soft/hard Aces, exact deal order and sounds, same-deck hits without duplicates, bust paths, dealer 17 / soft 17, push safety, fold restrictions, the existing shared revolver, guarded animations, explicit trigger, dialogue, mute, sweep/replay, keyboard bounds and auto-recenter, and actual card mesh orientations before and after showdown. Voice tests also cover deterministic syllables, confident/bluff parity, punctuation sync, skip/cleanup, mute/disable behavior, user-click activation, ducking, and subtle head motion.

Phase A tests add statistical tell accuracy, independent cosmetic RNG, heartbeat pacing/mute/ducking, continuous hold and every cancellation path, hammer/cylinder milestones, one-use shooter-only SPIN, exact-card PEEK and the dealer exception, match termination after the last SPIN, decision-only one-per-round events, chamber-only breakdown, reduced motion, room restoration, and active-hold unmount cleanup.

The interface is also checked in Chromium for held-card readability, dealer animations, keyboard and mouse controls, bust / push / dealer draws, and safe HUD bounds at 1280×720, 1440×900, and 1920×1080. Cloud browser checks use software WebGL rather than a physical Mac GPU.

Chromium voice checks confirm no AudioContext before Sit down, a generated audio signal afterward, silence within 100ms of stopping (including the room tail), mute/disabled behavior, seeded patterns, and no console errors.

Phase A Chromium checks exercise private PEEK and same-card HIT, click/release/focus-loss safety, hold progress and one-shot completion, impatience, SPIN, both opponent PEEK paths, all three room events, and safe HUD bounds at all three desktop sizes. No console errors were reported.
