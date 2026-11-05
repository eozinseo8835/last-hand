# Graphics Update: cinematic look

LAST HAND now has two graphics modes, chosen in **Settings → Graphics** and remembered in the browser:

- **Cinematic** (default): full resolution with a film look.
- **Classic pixel**: the original 360-line pixel look, unchanged.

Changing the setting remounts the 3D scene; the game state is not affected.

## What Cinematic adds (all generated in code, no downloaded assets)

- A real-time light shaft and dust under the hanging bulb, a darker room and soft shadows.
- Procedural felt, varnished wood and stained concrete textures.
- Film post-processing: bloom, chromatic fringe, teal/warm grade, vignette and film grain.
- Autofocus depth of field. Focus follows the centre of the screen but never goes past the table. Your hands and the cards on your side of the table are always sharp, so tells and totals stay readable.
- A machined revolver: blued steel with reflections, walnut grip, a fluted cylinder with six chambers and cartridge rims, a ribbed barrel with under-lug and ramp sight. It keeps the same pivots (cylinder, hammer, trigger, muzzle, grip), so every pose and animation is unchanged.
- The gunshot: a 70 ms muzzle flash that lights the room, a flash at the cylinder gap, sparks, and smoke that drifts for a few seconds.
- Every existing screen effect still works in Cinematic: the burlap hood, trigger darkening, the heartbeat vignette, glare and squint after unhooding, and the monitor and no-signal screens.

## Code

- `src/scene/cinematic.ts`: textures, `applyCinematicLook`, the revolver upgrade, `GunshotFX` and `FilmPipeline`.
- `src/Scene.tsx`: the `graphics` prop. In Cinematic it renders through `FilmPipeline` and fires `GunshotFX` on every real shot.
- `src/App.tsx`: the Settings select; the choice is saved as `last-hand-graphics` in localStorage.
- `CONFIG.CINEMATIC_MAX_PIXELS` caps the render size at about 1600×900 pixels for steady laptop frame rates.

## Tests

`src/scene/cinematic.test.ts` checks:

- The revolver pivots and muzzle stay where the rig expects them.
- The machined parts move with their pivots, and a chamber lines up with the bore.
- The flash is short and starts at the real muzzle, and the smoke clears.
- Repeated shots do not pile up objects.
- The room conversion is safe to apply twice.
- Every classic screen effect exists in the film shader.
- The focus rules hold: never past the table, and your own side always sharp.

`src/App.test.tsx` checks that the Settings select switches the mode and remembers it.

## Character polish (cinematic only)

Characters now match the cinematic room. All joints, sizes and poses are unchanged, and Classic pixel mode is untouched.

- **Rounded shapes:** every box, cylinder and sphere on the captive, Host, guards and your own arms is rebuilt with rounded edges and more detail. The fitting reuses each part's exact transform, so nothing moves.
- **Texture:** skin gets subtle mottling and pores; clothing gets a woven fabric texture with wear; gloves look like leather.
- **Faces:**
  - Eyes are eyeballs with an iris. The gaze code rotates the same mesh, so the iris visibly follows where the opponent looks.
  - The nose is a rounded bridge, the mouth a lip, and sweat is translucent.
- **Surveillance body:** new eye parts stay on their face's camera layer, so the surveillance-only body never shows up in your view.
- **Tests:** `src/scene/cinematic.test.ts` checks that:
  - no joint moves
  - finger sizes stay the same
  - the revolver is untouched
  - applying the polish twice is safe
  - the iris follows gaze
  - the layer rule holds

## Outfits, hair and the bomb vest

- Each captive now wears a clearly different colour that never matches their skin: a heather-grey hoodie (room 1), a burgundy shirt under the waistcoat (room 2) and an olive work jacket (room 3). This applies to both graphics modes.
- In cinematic mode the hair is no longer a smooth cap. It has a strand texture, uneven volume at the sides and back, and the messy fringe of the room 1 captive is made of tapered locks.
- Captives (and the player's body) wear a bomb vest: four taped charges, red and blue wires, and a receiver with a red light. The light blinks slowly and speeds up as chambers are spent and while a trigger is in play. The escape rule that the vest enforces is not in the game yet.

## Live feeds from the other tables

- The monitor wall now shows the other tables as real 3D rooms filmed by a ceiling security camera: the masked Host dealing, two captives in bomb vests reacting, and from time to time one of them holding the revolver to their temple, the same ritual as at the player's table. Each table has its own camera corner and different people.
- The feeds update at a choppy CCTV rate (about 12 renders a second shared between the screens) with scanlines, a blinking REC light and the table label.
- When a shot is heard from another table, that screen cuts instantly to static and then shows NO SIGNAL for the rest of the room. Nobody is shown dying.
- Looking up at the monitors lets the cinematic camera refocus on them; looking back down returns focus to the table.
- Room 3 still uses the real ceiling camera of the player's own room.

## The Gambler and riskier opponents

- The Gambler (room 2) is now a Black man with deep brown skin and a close-cropped haircut, wearing a cobalt suit jacket over a dark waistcoat with a red tie and his gold ring. The same face appears at table 3 on the monitor wall.
- Opponents still follow their own house rules and never look at your cards. They now sometimes crack and chase 21 past the safe line: the Gambler draws at hard 17 about 30% of the time and at 18 about 10%; the Survivor draws at 17 about 8% of the time. The Nervous Man already does this through his panic mistakes at 17 and 18.

## Horror tension 1 (no sound yet)

- **The Host watches you.** While you choose, its mask turns onto you slowly instead of snapping. Hesitate for more than about six seconds and it starts to lean in and tilt its head. While you hold the trigger it leans closer with every bit of pull.
- **The light reacts to danger.** The bulb flickers more often and drifts more as chambers are spent. While anyone holds a trigger the filament strains in an uneven brownout that deepens with every spent chamber. While you are choosing cards the light stays steady, so faces and tells remain readable.
- **Losses stay in the room.** Between rooms, one empty chair per dead guest is set out behind the opponent, each with its owner's burlap hood hung over the backrest like a head. There are 4 chairs in room 2 and 6 in room 3. They never pop in during a hand.
- **Room 3 is harsher.** The power supply sags hard every few seconds (never during your decision), the bulb's wire keeps moving, and the red emergency light pulses more strongly.
- Fix: the empty chairs were baked into the room's static geometry, so all of them showed from room 1. They now stay hidden until a guest has actually died.

## Decision time limit and the trigger close-up

- **Every decision has 30 seconds.** A ring above the HIT / STAND buttons empties. With 10 seconds left it turns red and pulses and the Host says "Ten seconds." When it runs out the Host says "You took too long." and slides the revolver to you: you must face the chamber (or the Host does it for you as before). If the chamber is empty, your hand continues with a fresh 30 seconds. Each HIT starts a fresh clock. Opening How to play pauses the clock.
- **Pulling the trigger narrows the world onto the revolver.** The field of view tightens with the pull (on top of the existing hammer, cylinder turn and darkening) and eases back afterwards; it is gentler with reduced motion. A captive's pull narrows it about half as much.

## Holding and spinning the revolver like a person

- **Self-facing two-hand hold.** When the revolver reaches you, you pick it up with a normal grip and, over about a second, turn it round in your hand on the way up. The left hand joins on the grip and both thumbs sit at the trigger, with the muzzle on your own face. Holding to pull brings the bore up into the centre of view. The forearms come from your own side, so there is no impossible wrist angle. Setting it down after an empty click (or when the Host takes over) reverses the motion.
- **A real cylinder spin.** The revolver has a swing-out crane. SPIN raises the gun upright in the shooting hand with its left side toward the viewer. The free thumb pushes the cylinder out, the free palm sweeps it into a spin, and a wrist flick snaps it shut. The revolver then goes back to your face (or to the captive's temple). The captives spin the same way.
- Fixes: the free hand now works the cylinder from underneath, so it no longer fills the screen during SPIN, and the revolver is held a little further away. The trigger pull no longer stutters. The CCTV feeds slow to 3 renders a second during any trigger pull, skip rendering while the monitor wall is off screen, and run at 8 a second otherwise. The hand IK refreshes only the moving character instead of the whole room.
