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
