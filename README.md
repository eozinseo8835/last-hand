# LAST HAND

Big Update 3 adds layered concrete-room gunshots, a bounded master mix, shooting silence and recovery, tinnitus/muffling, close breathing, stress sounds, a rising drone and HRTF positioning. The start screen and header provide volume controls. Host/captive gaze now follows scene targets smoothly, and the Host stands farther back within view. See [the implementation and validation record](docs/big-update-3.md). Validation: **383 tests pass**, and the production build succeeds.

Small Update 1 adds the restrained left-edge temple-contact shot, relaxed empty hands and inward-curling fingers, and a rounded woven sack with smoothly deforming removal. The development pose viewer includes hood on/mid-removal/off, the empty resting hand and the Host gesture. See [the update and validation record](docs/small-update-1.md). Validation: 378 tests pass and the production build succeeds.

A single-player psychological blackjack campaign in a procedural pixelated 3D bunker. Eight kidnapped guests enter four tables; only one leaves. Survive three rooms against other captives while the masked Host deals. The loser of each hand faces one shared six-chamber revolver. All interface and dialogue text is in English.

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

For a ZIP download, use the [pixel-3d branch archive](https://github.com/eozinseo8835/last-hand/archive/refs/heads/pixel-3d.zip), extract it into a new folder, and run `npm ci` followed by `npm run dev` from the folder containing `package.json`. Open the URL printed by that terminal. Big Update 2 starts hooded and shows **ROOM 1 / 3** after the guard sequence. It shows **GUESTS REMAINING: 8**, a masked Host on the left, and a human captive across the table. It retains **FOLD / PEEK / HIT / STAND**, **SPIN 1 · PEEK 1**, and **HOLD TO PULL**. If these are missing, the running folder is an older copy. If port 5173 is occupied, stop its existing server before restarting.

## Blackjack and controls

- **HIT** takes another card from the current round's deck. **STAND** lays down your held cards and reveals the captive's hole card; the captive then follows its own policy below.
- Face cards count as 10. An Ace counts as 11 unless it must count as 1 to avoid busting. The HUD labels soft totals.
- A player bust loses immediately, with no opponent draws. An opponent bust loses to the player. Equal totals are a **PUSH**: neither a shot nor a fold is used.
- **FOLD** is available only before the first HIT of a round, up to three times per room.
- The loser shoots. Hold **HOLD TO PULL** continuously for 3 seconds; a click never fires. Releasing cancels the pull and drains progress over 0.6 seconds. The hammer cocks at one third, the cylinder turns at two thirds, and the existing click/bang resolves at completion. Losing focus or opening the rules cancels the hold too.
- During the hold, the revolver rises until its barrel points straight at the player's eye through the center of the view. The final part of the hold keeps that aim, with the existing hand tremble.
- The captive hesitates for 1.5–4 seconds before its own shot, longer as the current cylinder empties. A player shot has a 15-second deadline, with Host warnings at 10 and 5 seconds remaining. If no hold is active at zero, the Host takes the weapon and fires the current chamber after a cocking pause. Releasing never resets the deadline; a hold active at zero can finish normally. Forced shots are counted in run statistics.
- Empty shots advance the shared cylinder. SPIN resets its pointer and bullet; after the final SPIN, the match ends within six further trigger pulls.
- Hold the left mouse button and drag, or hold **A / D** to look left/right and **W / S** to look up/down. Looking turns the seated head without walking, within ±100° yaw and ±35° pitch. Key motion accelerates and releases smoothly.
- **Recenter** faces the table. Deals, reveals, player PEEK, and shooting automatically recenter the camera and ignore keyboard look. During captive draws and PEEK, you can look away or back to catch a cheat.

The Host shuffles and deals player / captive up / player / captive hole one card at a time. Your cards slide back-up to your low-poly left hand and form a camera-facing fan. They are only laid face-up on the table at showdown. The captive checks its hole card without exposing it. The Host sweeps the cards before each new round.

## Phase A tension systems

A match is one room. Each side has one **SPIN** and one **PEEK** per room. Advancing to a new room resets the revolver, both inventories, and all three folds. Play Again resets the entire campaign and all run statistics. Remaining abilities share the existing HUD readouts.

- **SPIN CYLINDER** is available only to the shooter before holding the trigger. It moves the bullet to a fresh random chamber among all six, clears the fired marks, and resets the pointer to one. The captive uses its SPIN when it must shoot with three or fewer unfired chambers left. The cylinder visibly spins with a ratchet sound.
- **PEEK** is a one-second cheat available only when both faces look away. Only the attached top-card corner bends; there is no floating card display. A successful peek leaves a “You saw” HUD note; HIT receives exactly that card. The note clears on HIT/STAND or a folded hand. Returning faces give a 400ms warning; being caught applies `CONFIG.PEEK_CAUGHT_PENALTY` (`trigger` by default, or `folds`). An empty penalty shot resumes the same hand without comparing cards. The captive can peek only while the Host looks away and it is outside the center 40% of your view. Look back mid-peek to catch it and deny its information; its one use is still spent.

During player decisions, the captive layers one physical tell chosen from calm or nervous gestures. A real opening total of 17 or more is strong. The tell matches that strength according to the opponent configuration below and misleads otherwise, independently of dialogue bluff selection. The Host has no tells and never hints at either hand.

Heartbeat plays during decisions and shooting suspense. Its base is 60 BPM plus 15 for every fired chamber in the current cylinder, and it becomes faster and louder during the player's hold. Heartbeat ducks beneath speech. Hands tremble more as chambers are fired; holding strengthens the tremble and darkens the vignette with the audio-clock pulse. Reduced motion lowers tremble, shaking, and pulsing.

Each round has a 60% chance of one decision-phase event: a 3–5 second blackout, three to five door bangs with a small camera shake and flinch, or the existing CRT showing static and “WE ARE WATCHING.” The HUD remains readable. Events stop when play leaves the decision phase and never consume cards, move the cylinder, or advance gameplay randomness.

Breakdown depends only on fired chambers in the current cylinder, with different thresholds per captive. SPIN resets the cylinder's danger count along with its pointer. The Host remains composed.

`CONFIG.TELL_ACCURACY`, `HEARTBEAT_BASE_BPM`, `TRIGGER_HOLD_MS`, and `RANDOM_EVENT_CHANCE` tune these systems. Defaults are `0.7`, `60`, `3000` milliseconds, and `0.6`.

## Phase B campaign

There are exactly three people at each table: the player, the masked **THE HOST** at the left, and one captive across the table. The Host deals and narrates; it never plays a hand or becomes a revolver target. It enforces an expired player trigger deadline.

| Room | Captive | Policy | Tell accuracy | Breakdown starts |
| --- | --- | --- | --- | --- |
| 1, dim green | THE NERVOUS MAN | Stands at 16; 25% mistakes at 12–13 and 17–18 | 85% | Chamber 2 |
| 2, harsh red | THE GAMBLER | Hard 17 stands; soft 17 hits; weak hands bluff 50% | 60% | Chamber 4 |
| 3, weak bulb | THE SURVIVOR | Stands at 17; uses PEEK and late SPIN | 50% | Chamber 5 |

The player always acts first. A player bust ends the hand immediately. The same fresh 52-card deck supplies every card in a round. Opponent configuration, including voice profiles and breakdown thresholds, lives in `src/campaign.ts` (`OPPONENTS` and `HOST`).

The first run begins under a hood and presents six click-through Host rules with an always-visible Skip button. Later runs in the same mounted browser session use one short rule line. Winning a room leaves the defeated captive slumped while the Host addresses you, then a hood, dragging footsteps, and a heavy door lead to the next opponent.

A wall of 96×72 CRT feeds updates at most ten times per second. Room 1 shows three other tables, with deaths after rounds 1, 3, and 5; unfinished feeds resolve during the transition. TABLE 3 labels the Gambler. Room 2 shows the other semifinal and the Survivor. Room 3 shows the actual room from a live ceiling camera. Each death removes one guest, including deaths at your table, so completed brackets leave **8 → 4 → 2 → 1** guests.

Death falls into the ceiling feed, which cuts to NO SIGNAL. The final win opens the metal door, climbs toward daylight, reveals the audience counter, and ends on LAST HAND. Both endings show rooms cleared, rounds, hand outcomes, hits, busts, folds, forced shots, highest live chamber reached (or the fatal chamber), abilities by side, guests when you fell, and total run time. Statistics are memory-only.

Dialogue is serialized through one queue. The speaker label, positional murmur, text tint, and speaking head all belong to the same current character: cold white Host on the left, warm amber captive in front. Host lines are procedural and independent of card strength. Captive lines carry personality, bluffing, reactions, and breakdown. Each opponent has complete category banks and six captive/Host exchanges, eligible in about 20% of rounds. Only urgent trigger urging may interrupt a captive, after a voice fade.

## Scene and implementation

The `pixel-3d` branch retains its existing Three.js bunker, masked Host design, gore level, procedural textures, palette, dithering, film grain, and vignette. Room lighting changes by campaign stage; event lighting and the hold vignette are temporary. The scene renders at a 360-pixel internal height with nearest-neighbor scaling. HUD text and controls remain crisp HTML, inside a safe margin.

- `src/game.ts`: deck operations, soft/hard blackjack totals, hand comparison, unchanged revolver rules, and tuning in `CONFIG`.
- `src/useGame.ts`: timed, guarded game state machine; one shared deck per round; continuous trigger hold, abilities, events, and complete replay reset.
- `src/tension.ts`: independent cosmetic randomness, tell selection, event plans, heartbeat pacing, and chamber-only breakdown.
- `src/campaign.ts`, `src/campaignDialogue.ts`: opponent policies, run statistics, bracket schedules, cast voices, and separate authored Host/captive banks.
- `src/dialogue.ts`: original dialogue categories and legacy default banks; no live AI or API.
- `src/Scene.tsx`: WebGL rendering, postprocessing, mouse/WASD input, and scene lifecycle.
- `src/scene/room.ts`, `src/scene/monitors.ts`: procedural rooms, props, lighting, and bounded low-resolution monitor feeds.
- `src/scene/actors.ts`: production cast choreography, dealer deck, held fan, and per-card animations.
- `src/scene/skeleton.ts`, `poses.ts`: shared hierarchical characters, fixed bone lengths, joint limits and numeric poses.
- `src/scene/revolver.ts`, `src/gunTransfer.ts`: one procedural revolver model, wrist socket and timed table delivery.
- `src/scene/camera.ts`, `merge.ts`: constrained look controls and static geometry batching.
- `src/audio.ts`: existing effects and voice, synthesized heartbeat/mechanisms/events, ducking, and master mute.
- `src/HoldTrigger.tsx`: pointer/keyboard hold input, progress ring, and cancellation on release or lost focus.
- `src/App.tsx`, `src/styles.css`: interface, soft totals, actions, and HUD layout.

`CONFIG.LOOK_KEY_SPEED` is keyboard angular speed in radians per second; `DEAL_SPEED` is milliseconds per dealt card; `DEALER_STANDS_ON` remains 17 for the original blackjack tuning; campaign opponents use `OPPONENTS` policies. `LOOK_SENSITIVITY`, `PIXEL_HEIGHT`, and `GORE_LEVEL` retain their existing defaults. Set `GORE_LEVEL` to `"low"` to remove blood effects.

Geometry and textures are code-generated, and fonts are bundled. No external model/image/audio assets, backend, accounts, credentials, or runtime API services are required. Static geometry batching and one 512px shadow light reduce rendering cost. Physical MacBook Air 60fps performance has not been measured in this cloud environment.

Revolver audio is generated locally: steel hammer and cylinder impacts, a slowing ratchet, a dry empty strike, and a single-ID gunshot with one sharp pressure crack, low body, and a continuous concrete-room tail. Sound randomness is independent of the deck and bullet position. No audio files are needed.

## Character voices

Each character's unintelligible murmur is synthesized with low sawtooth/pulse oscillators, vowel formants, breath noise, mild distortion, a muffled mask filter, and a short generated room response. Text-seeded syllables share the subtitle's typewriter timeline, including punctuation pauses. Click the dialogue to finish the text and fade the voice within 100ms. Only the speaking character bobs very slightly with each syllable; reduced motion makes this smaller.

Confident and bluff lines use identical voice settings for each captive. The Host has the deepest, slowest profile and stays calm in every situation. Nervous lines are slightly faster and less steady; the opening and danger lines are slower and deeper. The existing suspense tone ducks slightly under speech. The sound toggle mutes the voice alongside the existing effects. No audio files or speech service are used.

Tune `CONFIG.VOICE_ENABLED` (default `true`), `VOICE_PITCH` (96 Hz), `VOICE_SPEED` (1), and `VOICE_VOLUME` (0.28) in `src/game.ts`.

## Validation

`npm test` covers soft/hard Aces, exact deal order and sounds, same-deck hits without duplicates, bust paths, dealer 17 / soft 17, push safety, fold restrictions, the existing shared revolver, guarded animations, explicit trigger, dialogue, mute, sweep/replay, keyboard bounds and auto-recenter, and actual card mesh orientations before and after showdown. Voice tests also cover deterministic syllables, confident/bluff parity, punctuation sync, skip/cleanup, mute/disable behavior, user-click activation, ducking, and subtle head motion.

Phase A tests add statistical tell accuracy, independent cosmetic RNG, heartbeat pacing/mute/ducking, continuous hold and every cancellation path, hammer/cylinder milestones, one-use shooter-only SPIN, exact-card PEEK and the dealer exception, match termination after the last SPIN, decision-only one-per-round events, chamber-only breakdown, reduced motion, room restoration, and active-hold unmount cleanup.

The interface is also checked in Chromium for held-card readability, dealer animations, keyboard and mouse controls, bust / push / dealer draws, and safe HUD bounds at 1280×720, 1440×900, and 1920×1080. Cloud browser checks use software WebGL rather than a physical Mac GPU.

Chromium voice checks confirm no AudioContext before Sit down, a generated audio signal afterward, silence within 100ms of stopping (including the room tail), mute/disabled behavior, seeded patterns, and no console errors.

Phase A Chromium checks exercise private PEEK and same-card HIT, click/release/focus-loss safety, hold progress and one-shot completion, impatience, SPIN, both opponent PEEK paths, all three room events, and safe HUD bounds at all three desktop sizes. No console errors were reported.

Phase B adds campaign regressions for the 8 → 4 → 2 → 1 bracket, scheduled and transition-flushed feed deaths, fresh room resources, each captive's policy and ability thresholds, six-line/short/skip openings, deaths and complete replays from Rooms 2 and 3, both ending statistics, and serialized Host/captive speech. Presentation tests match the caption, voice profile, and animated actor across all three opponents. Ceiling-feed tests render the actual scene through its surveillance camera, restore renderer state, avoid feedback, and enforce the 10 Hz cap without a catch-up backlog. The final Host line uses rear HRTF positioning when available.

Big Update 2, sections 1–7: fixed-length two-bone arms and legs, articulated hands with a palm-mounted revolver, guard-led hood removal and zip-tie release in every room, shot IDs with synchronized queued distant deaths, active monitor feeds and room ambience, readable separated card zones, wheel lean, and safe HUD readouts. Controls unlock after the player's tie is cut; Skip releases both ties immediately. A wheel lean is bounded by `CONFIG.LEAN_DISTANCE` and returns automatically for shots. `RANDOM_EVENT_CHANCE` is 0.6.

Checkpoint validation: 310 tests pass; production build passes. Chromium checks cover the guard sequence, skipping, held cards, lean, trigger release, and HUD at 1280×720, 1440×900, and 1920×1080, with no console errors. Procedural Three.js assets retain the existing pixel rendering and room palette.


Big Update 2, sections 8–11: public gaze windows and caught penalties, captive-only smooth stress and personality fidgets, an absolute trigger deadline with hand-mounted Host enforcement, forced-shot statistics, and a reproducible fresh-deck bust simulation. New controls are `PEEK_DURATION_MS`, `PEEK_CAUGHT_PENALTY`, and `TRIGGER_TIMEOUT_MS` in `CONFIG`; personality settings live in `OPPONENTS[room].behavior`. Stress receives only fired chambers, upcoming shooter, public losses, audible events, and empty-click relief, never card values. The Host and guards do not use that stress/fidget model.

The Nervous Man now stands at 16 instead of 15 to meet this update's requested bust range while preserving his 25% wrong decisions at 12–13 and 17–18. In 10,000 seeded stand rounds per opponent under player observation (therefore no unseen PEEK), observed bust rates are Nervous Man **21.89%**, Gambler **28.62%**, Survivor **28.29%**. These are raw draws from the same fresh 52-card deck and the actual `opponentAction` policy; no cards are rejected or rewritten. Run `npm test -- src/big2Tension.test.ts` to reproduce the simulation.


The front table rail is thinner and the steel support is an open frame so the captive's articulated legs have an unobstructed sight line below the opaque felt. Card rows share `src/tableLayout.ts`; this keeps even an eleven-card hand within its assigned area and clear of the gun. Guard pocket meshes carry both removed hoods out of the room.

Final Big Update 2 verification: **344 tests across 21 files pass**, production build succeeds, and Chromium checks cover all three desktop HUD sizes, PEEK/HIT, Host enforcement, the complete campaign, both endings, replay, and positional voices without console errors. See [the section-by-section completion record](docs/big-update-2.md).

The character skeleton rebuild replaces the production cast with nested joints and fixed metre-scale limbs, articulated skin-tone hands, and one hand-sized revolver. The Host slides the weapon within reach before pickup. Forced shots show only its bent forearm, hand and gun from the left, with its body outside the view and close-mesh protection enabled.

For development inspection, open **`http://localhost:5173/?debug=poses`** after `npm run dev`. The viewer uses the actual production models, with front/side views and the pixel effect off/on. The [pose review record](docs/character-pose-review.md) lists all 11 pose categories and the 84-image review; this viewer is excluded from production builds.

Skeleton completion: forced-shot staging, PEEK visibility/reach, Host shuffle/dealing/gaze and look-around regressions pass. The viewer includes `?debug=poses&pose=host-forced-shot` (front uses the seated camera) and `?debug=poses&pose=player-peek`. Final validation passes **374 tests across 25 files** and the production build; targeted Chromium checks report no console errors. See the completion section of the pose review record for the limited rechecks after the WIP checkpoint.


Latest presentation update: the Host stays seated, every shooter picks the same revolver up from the table center, cards use supported hand grips, and positioned sounds drive context-aware gaze. See the [Bug Update 1 changes, gunshot diagnosis and verification record](docs/bug-update-1.md).
