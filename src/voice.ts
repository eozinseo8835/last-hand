import { CONFIG } from './game';
import type { DialogueCategory } from './dialogue';

export type VoiceParameters = { pitch: number; speed: number; wobble: number; volume: number };
export type VoiceSyllable = {
  pitch: number; endPitch: number; duration: number;
  formants: [number, number]; breath: number; seed: number;
};
export type VoiceStep = { at: number; count: number; syllable?: VoiceSyllable };
export type VoicePlan = { steps: VoiceStep[]; parameters: VoiceParameters; duration: number; seed: number };

/** A local PRNG keeps the murmur independent of the deck, cylinder, and bluff random rolls. */
export function voiceRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = Math.imul(value ^ value >>> 15, 1 | value);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function textSeed(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/** Confident and bluff deliberately share exactly the same acoustic parameters. */
export function voiceParameters(category: DialogueCategory, danger = false, chambersFired = 0): VoiceParameters {
  const slow = danger || category === 'danger' || category === 'intro';
  const nervous = !slow && category === 'nervous';
  const breakdown = Number.isFinite(chambersFired) ? Math.max(0, Math.min(6, Math.floor(chambersFired))) : 0;
  return {
    pitch: Math.max(40, CONFIG.VOICE_PITCH) * (slow ? .89 : 1),
    speed: Math.max(.25, CONFIG.VOICE_SPEED) * (slow ? .78 : nervous ? 1.16 : 1) * (1 + breakdown * .035),
    wobble: (nervous ? 3.4 : 1.4) + breakdown * .5,
    volume: Math.max(0, Math.min(1, CONFIG.VOICE_VOLUME)),
  };
}

const VOWELS: readonly [number, number][] = [[350, 900], [420, 780], [620, 1150], [250, 650]];

/** One clock drives both visible letters and nonverbal syllables; all times are milliseconds. */
export function createVoicePlan(text: string, category: DialogueCategory, danger = false, chambersFired = 0): VoicePlan {
  const seed = textSeed(text), random = voiceRandom(seed), parameters = voiceParameters(category, danger, chambersFired);
  const steps: VoiceStep[] = [];
  let at = 30 / parameters.speed, count = 0, letters = 0, group = 2 + Math.floor(random() * 2);
  let pitch = parameters.pitch;
  for (const character of text) {
    count += character.length;
    const step: VoiceStep = { at, count };
    if (/\p{L}|\p{N}/u.test(character)) {
      letters++;
      if (letters >= group) {
        letters = 0; group = 2 + Math.floor(random() * 2);
        pitch = parameters.pitch + (pitch - parameters.pitch) * .35 + (random() - .5) * parameters.wobble * 2;
        const vowel = VOWELS[Math.floor(random() * VOWELS.length)];
        step.syllable = {
          pitch, endPitch: pitch + (random() - .5) * parameters.wobble * 2,
          duration: 70 + random() * 45,
          formants: [vowel[0] * (.94 + random() * .12), vowel[1] * (.94 + random() * .12)],
          breath: .025 + random() * .025, seed: Math.floor(random() * 4294967296),
        };
      }
    }
    steps.push(step);
    let pause = 0;
    if (/[,;:]/.test(character)) pause = 140;
    // Treat an ellipsis as one long pause rather than pausing after every dot.
    if (/[.!?…]/.test(character) && text[count] !== '.') pause = character === '…' || text[count - 2] === '.' ? 360 : 280;
    at += (30 + pause) / parameters.speed;
  }
  const last = steps.at(-1);
  return { steps, parameters, duration: last ? Math.max(at, last.at + (last.syllable?.duration ?? 0)) : 0, seed };
}
