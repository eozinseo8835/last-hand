import { CONFIG, type RandomSource } from './game';
import type { DialogueCategory } from './dialogue';

export type Side = 'player' | 'ai';
export type OpponentTell = {
  kind: 'tap' | 'avert' | 'touch' | 'twitch' | 'still' | 'steady' | 'breathing';
  disposition: 'nervous' | 'calm';
};
export type RoundEvent = {
  kind: 'blackout' | 'door' | 'tv';
  startedAt: number;
  duration: number;
  seed: number;
};
export type EventPlan = Omit<RoundEvent, 'startedAt'>;
/** True means this side still has its one use for the current match. */
export type AbilityState = Record<Side, { spin: boolean; peek: boolean }>;

/** Presentation randomness never advances the deck, cylinder, or dialogue RNG. */
export function createTensionRandom(seed: number): RandomSource {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = Math.imul(value ^ value >>> 15, 1 | value);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function presentationSeed() {
  try {
    if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  } catch { /* A clock seed also keeps cosmetic choices separate from gameplay. */ }
  return (Date.now() ^ 0xa511e9b3) >>> 0;
}

export const tensionRandom = createTensionRandom(presentationSeed());
export const cosmeticRandom = tensionRandom;
const unit = (random: RandomSource) => Math.min(1 - Number.EPSILON, Math.max(0, random()));
const firedCount = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export function freshAbilities(): AbilityState {
  return { player: { spin: true, peek: true }, ai: { spin: true, peek: true } };
}

/** Only the tell distribution uses the hidden opening total; events and fear do not. */
export function chooseTell(realTwoCardTotal: number, random: RandomSource = tensionRandom): OpponentTell {
  const strong = realTwoCardTotal >= 17;
  const matches = unit(random) < Math.max(0, Math.min(1, CONFIG.TELL_ACCURACY));
  const calm = matches ? strong : !strong;
  const pool: OpponentTell['kind'][] = calm ? ['still', 'steady', 'breathing'] : ['tap', 'avert', 'touch', 'twitch'];
  return { kind: pool[Math.floor(unit(random) * pool.length)], disposition: calm ? 'calm' : 'nervous' };
}

/** The engine starts this plan only in PLAYER_DECISION and owns its cancellation. */
export function chooseRoundEvent(random: RandomSource = tensionRandom): EventPlan | null {
  if (unit(random) >= Math.max(0, Math.min(1, CONFIG.RANDOM_EVENT_CHANCE))) return null;
  const kinds = ['blackout', 'door', 'tv'] as const;
  return {
    kind: kinds[Math.floor(unit(random) * kinds.length)],
    duration: 3000 + unit(random) * 2000,
    seed: Math.floor(unit(random) * 4294967296),
  };
}

/** Epoch time is assigned at event start; returned offsets are milliseconds. */
export function eventBangOffsets(event: Pick<RoundEvent, 'kind' | 'duration' | 'seed'>): number[] {
  if (event.kind !== 'door') return [];
  const random = createTensionRandom(event.seed ^ 0x51ed270b);
  const count = 3 + Math.floor(unit(random) * 3);
  const available = Math.max(0, event.duration - 500);
  return Array.from({ length: count }, (_, index) => Math.round(120 + index * available / Math.max(1, count - 1)));
}

/** Shared envelope keeps door sound, camera shake, and the flinch on the same beat. */
export function eventDoorPulse(event: RoundEvent | null | undefined, now: number): number {
  if (!event || event.kind !== 'door') return 0;
  const elapsed = now - event.startedAt;
  if (elapsed < 0 || elapsed >= event.duration) return 0;
  let pulse = 0;
  for (const offset of eventBangOffsets(event)) {
    const age = elapsed - offset;
    if (age >= 0 && age < 500) pulse = Math.max(pulse, Math.exp(-age / 105));
  }
  return pulse;
}

export function heartbeatSettings(chambersFired: number, pulling = false, urgency = 0): { bpm: number; volume: number } {
  const fired = firedCount(chambersFired);
  return {
    bpm: CONFIG.HEARTBEAT_BASE_BPM + 15 * fired + (pulling ? 25 : 0) + Math.max(0, Math.min(1, urgency)) * 35,
    volume: (.09 + Math.min(6, fired) * .012) * (pulling ? 1.55 : 1),
  };
}

export function breakdownLevel(chambersFired: number): 'calm' | 'short' | 'broken' {
  const fired = firedCount(chambersFired);
  return fired >= 4 ? 'broken' : fired >= 2 ? 'short' : 'calm';
}

/** Card values are deliberately absent: fear never exposes the current hand. */
export function breakdownCategory(category: DialogueCategory, chambersFired: number): DialogueCategory {
  const level = breakdownLevel(chambersFired);
  return level === 'calm' ? category : level;
}
