# Big Update 3: sound, tension and gaze

The update keeps the campaign, blackjack/shared-cylinder rules, dialogue banks and procedural pixel room. Audio remains generated locally with Web Audio; no audio files or services were added.

## Audio

- Table bangs combine a 2ms attack broadband crack, a downward 120–50Hz pressure body, filtered 13/26/39ms early reflections, and a generated 2-second dark room response. Text-independent event seeds vary their pressure pitch, noise and tone. A brief hammer fall precedes the report and a metallic cylinder resonance follows it. Distant report synthesis retains its original pressure/filter/tail parameters.
- Effects, voice and ambience buses pass through a hearing filter, master volume, compressor and a bounded final waveshaper limiter. Native offline renders at maximum bus settings measured peaks of approximately **0.556** for one bang and **0.729** for three simultaneous bangs; neither reaches 0 dBFS. Muted output measured zero.
- Ambience, monitor/event sound and the drone fade progressively during shooting. Above 85% of the player hold, or in the last second of Host/opponent hesitation, those buses are near silent. An empty click keeps that silence for one second, plays a shaky exhale, then restores the room over roughly 2–3 seconds.
- A table bang adds a wavering 4.8kHz tinnitus oscillator fading over five seconds. Other audio drops through a 650Hz lowpass and recovers to 19kHz over five seconds. Distant bangs never start that tinnitus or hearing automation. The local scene response adds a stronger shake, brief flash and falling procedural dust.
- Close breathing accelerates with fired chambers and stops during the player's active hold. During passive Host/opponent waits it remains audible with the deep two-part heartbeat. The view follows the same audio-clock beat envelope with a small pulse.
- Opponent stress produces front-positioned shaky breath/sniffle noise, nervous teeth chatter and a short unintelligible prayer before its shot. Existing felt scratching and chair-contact cues now come from the front. The drone rises in level, pitch and beating dissonance with public fired chambers; SPIN and room resets return it to its initial settings. Speech ducks its level.
- Real HRTF panners place Host speech/steps left, the captive in front, guards/door behind and distant reports at the walls. The listener follows seated look/lean; the current voice follows the actual character head. The final rear Host line retains its rear placement.
- The start screen displays **“Headphones recommended. Gunshots are loud.”** and a master slider. Header audio settings expose master/effects/voice controls. Mute gates the master, including reverb and tinnitus. No AudioContext is constructed until the existing click unlock.

## Gaze

`src/scene/gaze.ts` uses world targets with a 0.3–0.5-second settling motion. Neck/head yaw is bounded to 70 degrees and pitch to 30 degrees, with a small upper-chest assist. The mask retains the head's forward axis.

The Host stands about 1.59m from the default camera, farther along the left table end, with its head and torso inside the view. It addresses the player during rules, looks toward the deck while dealing, follows the captive during its turns/speech, and uses a monitor target for public distractions. Captives follow the player, their cards/revolver, loud sounds and existing public glance targets. Exchange lines carry presentation-only addressee metadata so each character can face the other without changing text or queue behavior.

The dev viewer includes `host-speaking` and `host-dealing`. Eight front/side × clear/pixel screenshots were reviewed, plus the actual rules scene. No pose correction cycle was needed. The actual-game angle between Host face and camera measured **7.25°**, below the required 15°; automated geometry checks also cover mask alignment, joint limits and default-camera framing.

## Validation

- Related audio, gaze, presentation and engine regressions passed during work.
- Native Chromium Web Audio offline renders checked report peaks, mute and local/distant late ringing. Interactive Chromium checks exercised the real effects/voice sliders and mute with active sources; no console errors were observed.
- The full suite ran once: **383 tests across 28 files passed**.
- The TypeScript/Vite production build ran once and passed.

Browser scene checks use software WebGL in this environment. The peak measurements describe digital output, not physical headphone sound pressure.
