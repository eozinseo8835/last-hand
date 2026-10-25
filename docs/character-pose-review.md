# Character skeleton and pose rebuild

The production cast now uses a shared procedural `Object3D` skeleton, including the three captive appearances, Host, guards, first-person arms, and surveillance body. The pose viewer uses these same production rigs and revolver.

## Implementation

- Fixed bone offsets and metre-scale geometry: 0.30m upper arms, 0.27m forearms, 0.18m hands, 0.45m thighs/shins, 0.25m shoes, a 0.45m seat and 0.75m table. Animation rotates joints and moves the character root; it never stretches meshes or changes bone lengths.
- Numeric poses live in `src/scene/poses.ts`. Analytic two-bone IK uses downward/backward elbow poles, bounded wrists and elbows, and at most 25 degrees of torso lean. Unreachable requests are reported rather than hidden by scaling. Authored contact targets fit within 90% of the 0.57m arm length (0.513m).
- Resting captive elbows measure about 104.2 degrees, below the shoulders and 6.6cm outside the torso. Palms rest 20cm apart on the felt. Knees bend over the actual chair and the shoes sit flat on the floor.
- One 0.27m revolver has a hollow barrel, sights, a six-chamber cylinder, frame, trigger/guard, hammer and curved wooden grip. It keeps unit scale on the table and at every wrist socket. Its delivery path avoids both card areas. The 900ms delivery finishes before pickup or trigger input; an empty shot gets a 700ms set-down and 900ms return slide.
- The card fan uses the real articulated left hand, with lit skin, fingertips behind the cards and the thumb in front at the lower-left edge. The right-hand hold ends with the barrel facing the player's eye at the center of the view.
- The pack itself moves within reach before the player lifts its attached corner during PEEK. Camera focus follows that same pack position. The concealed card identity and PEEK rules are unchanged.
- The opening still follows hooded arrival, guard approach, player unhood, captive unhood, guard exit, Host rules, tie cutting and first deal. Cards are hidden until the ties are cut, including stale cards from an earlier room. Guard bodies stay at least 0.7m from the eye.
- Forced-shot enforcement keeps the Host root 0.9m left and 0.2m behind the camera. Its bent right forearm, hand and revolver are the only Host meshes permitted in the main camera. Other meshes within 0.35m are hidden from that camera; the surveillance layer retains the physical room. Near-plane protection also applies to normal play.

The table and camera framing accommodate these real proportions. The existing pixel shader, 360px internal render height, room lighting, palette, voices, dialogue, gore, campaign and shared-cylinder rules remain in use.

## Reproduce the visual check

Run `npm ci` and `npm run dev`, then open `http://localhost:5173/?debug=poses`. Choose the character/pose, front or side view, and pixel effect off or on. The viewer is development-only and is removed from the production bundle.

The completed review covers **21 character/pose cases × 2 views × 2 pixel settings = 84 screenshots**. All three captives were checked separately for the first five poses. The screenshots were reviewed visually as well as measured; the first pass exposed a neck gap, a displaced debug chair and the wrong first-person hand orientation. Those were corrected and the full screenshot matrix was recaptured and reviewed.

| Pose | Cast checked | Result |
| --- | --- | --- |
| Seated resting | Nervous Man, Gambler, Survivor | PASS |
| Talking | Nervous Man, Gambler, Survivor | PASS |
| Reaching for cards | Nervous Man, Gambler, Survivor | PASS |
| Holding the revolver | Nervous Man, Gambler, Survivor | PASS |
| Self-shot at the temple | Nervous Man, Gambler, Survivor | PASS |
| Host idle | Host | PASS |
| Host dealing | Host | PASS |
| Host sliding the revolver | Host | PASS |
| Guard walking | Guard | PASS |
| Player card hand | Player | PASS |
| Player hold-to-pull | Player | PASS |

Every captured case has constant measured segment lengths, unit scales, reachable authored targets and readable skin materials. Actual game-browser checks additionally cover hood/state order, no pre-deal cards, held-card presentation in Rooms 1 and 3, and the forced-shot camera view. No browser console errors were observed. Browser rendering uses Chromium software WebGL in this environment.

Final automated test/build results are recorded after the end-of-task validation.
