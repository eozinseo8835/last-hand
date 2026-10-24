import { OPPONENTS, type RoomNumber } from './campaign';
import type { GamePhase } from './game';
import { createTensionRandom } from './tension';
export type Behavior = { baseTremor: number; baseStress: number; bounceThreshold: number; fidgetSeconds: number; hunch: number; crackChamber: number; fidgets: readonly string[] };
export type PublicStress = { chambersFired: number; nextShooter: boolean; lossStreak: number; loudness: number; clickRelief: number };
export function stressTarget(room: RoomNumber, facts: PublicStress): number {
  const behavior = OPPONENTS[room].behavior;
  return Math.max(0, Math.min(1, behavior.baseStress + facts.chambersFired * .105 + Number(facts.nextShooter) * .22 + facts.lossStreak * .07 + facts.loudness * .24 - facts.clickRelief * .24));
}
export function approachStress(current: number, target: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, delta) / 2.2));
}
/** Smooth seeded lattice noise has no short repeating sine-wave cycle. */
export function smoothNoise(time: number, seed: number): number {
  const i = Math.floor(time), f = time - i, blend = f * f * (3 - 2 * f);
  const a = createTensionRandom((i * 374761393) ^ seed)() * 2 - 1;
  const b = createTensionRandom(((i + 1) * 374761393) ^ seed)() * 2 - 1;
  return a + (b - a) * blend;
}
export function shotBodyOnly(phase: GamePhase): boolean {
  return ['AI_SHOOTING','PLAYER_SHOOTING','HOST_FORCE_SHOT','REVEAL','ROUND_RESULT','ENDING_DEATH'].includes(phase);
}
export function bodyLanguage(room: RoomNumber, stress: number, time: number, chamber: number, phase: GamePhase, calm = false) {
  const b = OPPONENTS[room].behavior, cracked = chamber >= b.crackChamber;
  const tremor = b.baseTremor + stress * stress * .012 + (cracked ? .008 : 0);
  const serial = Math.floor(time / Math.max(2.5, b.fidgetSeconds * (1 - stress * .55)));
  const random = createTensionRandom(serial ^ (room * 4781));
  const pool=room===2&&!cracked?b.fidgets.filter(kind=>kind!=='sweat'):b.fidgets;
  const fidget = pool[Math.floor(random() * pool.length)];
  const cycle = time / Math.max(2.5, b.fidgetSeconds * (1 - stress * .55)) - serial;
  const envelope = Math.sin(Math.min(1, cycle / .34) * Math.PI);
  const limited = shotBodyOnly(phase);
  return { tremor: calm ? 0 : tremor, breath: calm ? 0 : Math.sin(time * (1.6 + stress * 2.2) + smoothNoise(time * .2, room) * .4) * (.007 - stress * .003),
    shift: calm || limited ? 0 : smoothNoise(time * .17, room * 521) * .016,
    head: calm || limited ? 0 : smoothNoise(time * .31, room * 991) * .035,
    bounce: calm || limited || stress < b.bounceThreshold ? 0 : Math.max(0, Math.sin(time * Math.PI * 2 * (4 + stress * 2))) * .025 * stress,
    hunch: b.hunch + stress * .12, fidget: calm || limited ? null : fidget,
    fidgetAmount: calm || limited ? 0 : envelope, serial, cracked };
}
