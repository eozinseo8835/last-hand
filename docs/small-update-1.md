# Small Update 1

This update starts from the completed `pose-wip` skeleton checkpoint (`87bd30c`, following `566bf51`). Gameplay, the campaign, dialogue, HUD and pixel rendering remain in place.

- Forced shots retain the actual table revolver and unit scale. The muzzle is staged at the left edge of the seated camera, while its cylinder, frame, grip, Host palm and full sleeve are hidden from that camera. The surveillance view retains the physical model. The Host stays 0.9m left and 0.2m behind the eye, with a bent, fixed-length arm. Other meshes inside 0.35m are hidden.
- At contact (1.1 seconds), a synthesized metallic touch accompanies a small rightward head push, localized edge blur, a tighter vignette and louder heartbeat. The hammer sounds at 2.1 seconds; the unchanged chamber resolves at 3.5 seconds.
- Empty hands lower into a relaxed position; the card-holding thumb no longer protrudes upward from an empty fist. Host speech gestures use curved fingers and return to idle after 1.5 seconds. Every rig clamps anatomical finger curl to 0–90 degrees, using negative local X for flexion toward the palm. Thumbs rotate inward.
- The procedural hood is a broad rounded sack with a sagged crown, woven texture, fabric folds and a neck cord. Three morph targets plus its resting shape blend during removal. The guard grips the crown and follows its rise; the captive briefly tilts its head. Feed silhouettes and transition hoods use the sack presentation too.

The development viewer adds `hood-on`, `hood-mid-removal`, `hood-off`, `player-empty-hand` and `host-open-hand`, alongside `host-forced-shot`. Only these poses and the affected PEEK/dealing poses were photographed from the front/side with pixel rendering off/on. No pose exceeded two correction/recheck cycles. Final visual checks pass for all eight inspected cases.

Targeted Chromium gameplay checks pass for PEEK and the next HIT card, mouse drag, WASD, recenter, timeout enforcement, forbidden close meshes and console errors. Regression tests also cover gun delivery/return, dealer motion, reachable hood removal, finger limits, gesture return and contact/cock/shot timing.

Validation: the full suite ran once, with **378 tests across 26 files passing**; `npm run build` succeeds. After final review, empty-hand relaxation was restricted to unbound hands to preserve the arrival restraints, and both related restraint/rest tests passed. Targeted browser checks and all inspected pose captures reported no console errors.
