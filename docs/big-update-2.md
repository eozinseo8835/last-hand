# Big Update 2 implementation and verification

The resumption audit started at `bdf2750` on `pixel-3d`: Phase B and revolver polish were committed, but none of Big Update 2 was committed. The interrupted working files contained partial sections 1–7. Those were completed, checked, and pushed as `ee9e531` before work continued on 8–11. The second checkpoint includes sections 8–11 and physical scene refinements.

| Section | Completed implementation | Main verification |
| --- | --- | --- |
| 1. Bodies | Fixed-length two-bone arms/legs, articulated finger joints, seated shoes/chairs, standing Host and guards, sleeved player arms | IK mesh lengths across animation states; real ray clearance below the opaque front rail |
| 2. Grip | Revolver is a child of the gripping palm; reach/grip/lift/cock/hesitation/squeeze, temple contact, empty return and fatal drop | Sparse-frame centered player aim; palm parenting; temple contact and return tests |
| 3. Hoods | Guard removes player hood first, glare/focus recovery, captive hood, pocketed cloths, door exit, ordered tie cutting and wrist release; two-guard transfers; Skip | Engine stage/lock/cancellation tests, monitor synchronization, hood shader and pocket geometry tests |
| 4. Shots | Unique shot IDs and one composite bang; synchronized monitor death/count/audio transaction; at least 3 seconds between distant bangs; deferred during local suspense | Audio graph/deduplication tests; queue spacing and count invariants |
| 5. Room life | Masked dealing Host and two active captives per simulated feed; 15-second activity cycles; 15–30-second room ambience; 0.6 round event chance | Monitor, ambient safety and timing tests |
| 6. Cards | Per-card identity textures, bold ranks/suits, separated rows and side gun, actual-card HUD, bounded wheel lean | Texture/rank/suit tests; eleven-card zone checks; hidden-card privacy and camera tests |
| 7. HUD | Safe margins, actual captive names and wrapping text, hint separate from actions | Chromium at 1280×720, 1440×900 and 1920×1080 |
| 8. PEEK | Shared distraction window, returning-head warning, physical hinged triangle only, delayed private note, exact next HIT, both penalties, observed captive catches | Engine eligibility/catch/deck tests; attached-corner geometry; live browser PEEK/HIT check |
| 9. Body language | Smooth public stress, non-repeating lattice movement, personality thresholds, tremor/bounce/fidgets and contact sounds; shot restrictions | Public-only model tests, personality/crack thresholds, no short noise cycle, fixed-limb animation checks |
| 10. Timeout | Absolute 15-second deadline, 10/5-second warnings, no reset on release, active hold finishes, Host enforcement without SPIN, same chamber, forced-shot statistics | Exact fake-clock boundaries, both death/click outcomes, caught-penalty continuation; live browser palm/weapon checks |
| 11. Bust check | 10,000 fresh-deck stand rounds for each actual policy, with observed captive PEEK blocked | Nervous Man 21.89%, Gambler 28.62%, Survivor 28.29% |

The Nervous Man's former stand-at-15 policy produced a 15.26% bust rate. His threshold is now 16, retaining his specified 25% mistakes and earlier stopping than the other captives, to meet this update's requested range. The simulation never rejects cards or modifies the deck; its player is watching, so the new PEEK eligibility rule denies an unseen cheat.

Final automated validation: **344 tests in 21 files pass**, `npm run build` passes, and `git diff --check` passes. Tests include all retained revolver, blackjack, voice, scene, campaign, and replay checks.

Browser verification covers the guard arrival/Skip, held faces staying off the table, wheel lean, three desktop HUD sizes, successful corner PEEK followed by its exact HIT, trigger release, Host enforcement using the current chamber, forced-shot statistics, all three campaign rooms, the 8→4→2→1 bracket, the real ceiling feed, both endings, replay, and Host/captive positional voice routing. No console errors were recorded. Walking routes additionally have table-clearance tests. The existing pixel rendering, room light settings, gore configuration, voice profiles, and six-chamber probability logic remain in place.

Run locally from this checkout or a freshly extracted source archive:

```sh
npm ci
npm test
npm run build
npm run dev
```

Stop any older server using port 5173 before starting this copy. The source archive contains every tracked source and lockfile; generated `dist` and `node_modules` are rebuilt locally.
