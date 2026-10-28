# Bug Update 3

Built on Small Update 2 (`b72b90a`). Gameplay rules, chamber logic, dialogue and audio are otherwise unchanged.

| Change | Detail |
| --- | --- |
| Opening order | The guard removes both hoods, cuts both restraints, steps back and only then leaves (`OPENING_STAGES`). It walks continuously between those positions and never vanishes or reappears. The Host's rules follow with everyone free; the last rule goes straight to the table. |
| Sloped shoulders | The box chest and flat clavicle slab are replaced by one lofted torso (`TORSO_PROFILE`): waist, chest, rounded shoulders, trapezius slope, neck base. Shoulder caps sit inside the shoulder line. Joint positions are unchanged. |
| SPIN by hand | `SPIN_MS` 1400 ms. The shooter raises the revolver side-on, the free hand swipes the cylinder (ratchet at `SPIN_SWIPE_MS` 600 ms, the cylinder starts turning then), and the revolver returns: to the felt grip for the player, to the temple for the captive. |
| Captive time limit | `CONFIG.AI_TRIGGER_TIMEOUT_MS` 10 s from the moment the revolver reaches the captive's hand. If it has not pulled by then, the Host interrupts ("Time."), the captive sets the revolver down and pushes it back, and the seated Host takes it and fires the current chamber at the captive (`forceTarget: 'ai'`). A live round kills the captive without a drop; the Host sets the revolver down. |
| Distinct characters | Nervous Man: messy fringe, sweat beads, dark under-eyes, worried brows, faded grey hoodie with drawstrings and pocket. Gambler: dark slicked hair with a side parting, stubble, smirk, raised brow, waistcoat over shirt sleeves, gold ring. Survivor: receding grey hair, grey beard and moustache, cheek scar, brown work jacket with collar, zip and elbow patches. Guards: tactical vest with pouches. |

Validation: the full suite runs green (scene, layout, skeleton, game state and React tests), with new regression tests for the opening order, the torso/shoulder line, the hand SPIN for both shooters, and the captive time limit (forced click, forced live round, no force when the captive pulls in time).
