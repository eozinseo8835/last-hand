import type {WorldPosition} from './worldSound';
import type { GamePhase, RandomSource } from './game';
import { cosmeticRandom } from './tension';
export type DistantShot = { id: string; table: number; startedAt: number; duration: number; direction: number; position?:WorldPosition };
export const AMBIENT_KINDS = ['bulb', 'pipe', 'drip', 'footsteps', 'handle', 'guard', 'speaker'] as const;
export type AmbientKind = typeof AMBIENT_KINDS[number];
export type AmbientEvent = { id: string; kind: AmbientKind; startedAt: number; duration: number; loud: boolean; direction: number; seed: number; position?:WorldPosition };
export const DISTANT_SHOT_GAP_MS = 4000;
export function shotSequenceActive(phase: GamePhase, suspense = false): boolean {
  return suspense || ['AI_SHOOTING', 'PLAYER_SHOOTING', 'HOST_FORCE_SHOT', 'REVEAL', 'DEALER_TURN', 'DEALER_PEEKING', 'ENDING_DEATH', 'ENDING_WIN', 'GAME_OVER'].includes(phase);
}
export const nextAmbientDelay = (random: RandomSource = cosmeticRandom) => 15000 + Math.floor(random() * 15001);
export function createAmbientEvent(id: string, now: number, random: RandomSource = cosmeticRandom): AmbientEvent {
  const kind = AMBIENT_KINDS[Math.min(AMBIENT_KINDS.length - 1, Math.floor(random() * AMBIENT_KINDS.length))];
  const positions:Record<AmbientKind,WorldPosition>={bulb:[0,2.4,0],pipe:[-3,1.7,-1],drip:[-2,.3,-2],footsteps:[2.7,.2,-4.4],handle:[2.7,1,-3.7],guard:[1.1,1.2,1.05],speaker:[-3,1.4,-1.2]};
  return { position:positions[kind],id, kind, startedAt: now, duration: kind === 'footsteps' ? 4000 : kind === 'guard' ? 2800 : 2000,
    loud: kind === 'pipe' || kind === 'handle' || kind === 'speaker', direction: random() < .5 ? -1 : 1,
    seed: Math.floor(random() * 0xffffffff) };
}
export function reactionLevel(event: DistantShot | AmbientEvent | null | undefined, now: number, host = false): number {
  if (!event || ('kind' in event && host && !event.loud)) return 0;
  const age = (now - event.startedAt) / 1000;
  if (age < 0 || age > 1.6) return 0;
  const attack = host ? .55 : .12, hold = host ? 1.2 : 1.0;
  return age < attack ? age / attack : age < hold ? 1 : Math.max(0, 1 - (age - hold) / (1.6 - hold));
}
/** A single deterministic feed gets an unmistakable event every 12–18 seconds. */
export function monitorActivityAt(table: number, time: number): { kind: 'deal' | 'flinch' | 'beg' | 'slam' | 'hide' | 'glitch'; progress: number; serial: number } {
  const serial = Math.floor(Math.max(0, time) / 15), age = Math.max(0, time) % 15;
  const kinds = ['flinch', 'beg', 'slam', 'hide', 'glitch'] as const;
  return age < 3 ? { kind: kinds[(serial + table) % kinds.length], progress: age / 3, serial }
    : { kind: 'deal', progress: ((age - 3) % 4) / 4, serial };
}
