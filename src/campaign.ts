import { handScore, type Card, type HandWinner, type RandomSource } from './game';
import type { DialogueCategory } from './dialogue';
import { cosmeticRandom, type OpponentTell, type Side } from './tension';

export type RoomNumber = 1 | 2 | 3;
export type Speaker = 'host' | 'captive';
export type VoiceProfile = { pitch: number; speed: number; wobble: number; calm?: boolean };
export type OpponentConfig = {
  id: 'nervous' | 'gambler' | 'survivor'; name: string;
  standOn: number; hitSoft17: boolean; mistakeChance: number; bluffChance: number;
  peekMin: number; peekMax: number; spinRemaining: number;
  tellAccuracy: number; breakdownStart: number; brokenAt: number; voice: VoiceProfile;
};

export const HOST: { name: string; voice: VoiceProfile } = {
  name: 'THE HOST', voice: { pitch: 72, speed: .62, wobble: .25, calm: true },
};

export const OPPONENTS: Record<RoomNumber, OpponentConfig> = {
  1: {
    id: 'nervous', name: 'THE NERVOUS MAN', standOn: 15, hitSoft17: false,
    mistakeChance: .25, bluffChance: .4, tellAccuracy: .85,
    peekMin: 12, peekMax: 16, spinRemaining: 3,
    breakdownStart: 2, brokenAt: 4, voice: { pitch: 122, speed: 1.15, wobble: 3.4 },
  },
  2: {
    id: 'gambler', name: 'THE GAMBLER', standOn: 17, hitSoft17: true,
    mistakeChance: 0, bluffChance: .5, tellAccuracy: .6,
    peekMin: 12, peekMax: 16, spinRemaining: 3,
    breakdownStart: 4, brokenAt: 6, voice: { pitch: 100, speed: .98, wobble: 1 },
  },
  3: {
    id: 'survivor', name: 'THE SURVIVOR', standOn: 17, hitSoft17: false,
    mistakeChance: 0, bluffChance: .4, tellAccuracy: .5,
    peekMin: 12, peekMax: 16, spinRemaining: 3,
    breakdownStart: 5, brokenAt: 6, voice: { pitch: 84, speed: .92, wobble: .9 },
  },
};

/** Mistakes are rolled only where the Nervous Man's specified wrong actions exist. */
export function opponentAction(room: RoomNumber, cards: readonly Card[], random: RandomSource = Math.random): 'hit' | 'stand' {
  const config = OPPONENTS[room], score = handScore(cards);
  if (score.bust || score.total >= 21) return 'stand';
  if (config.mistakeChance > 0 && [12, 13, 17, 18].includes(score.total) && random() < config.mistakeChance) {
    return score.total >= 17 ? 'hit' : 'stand';
  }
  if (config.hitSoft17 && score.total === 17 && score.soft) return 'hit';
  return score.total >= config.standOn ? 'stand' : 'hit';
}

export function opponentOpeningCategory(room: RoomNumber, total: number, random: RandomSource = Math.random): DialogueCategory {
  if (total >= 17) return 'confident';
  return random() < OPPONENTS[room].bluffChance ? 'bluff' : 'nervous';
}

export function opponentTell(room: RoomNumber, total: number, random: RandomSource = cosmeticRandom): OpponentTell {
  const strong = total >= 17, matches = random() < OPPONENTS[room].tellAccuracy;
  const calm = matches ? strong : !strong;
  const pool: OpponentTell['kind'][] = calm ? ['still', 'steady', 'breathing'] : ['tap', 'avert', 'touch', 'twitch'];
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  return { disposition: calm ? 'calm' : 'nervous', kind: pool[index] };
}

/** Personality thresholds use cylinder pressure, never hidden cards. */
export function opponentBreakdownCategory(room: RoomNumber, category: DialogueCategory, fired: number): DialogueCategory {
  const chamber = Math.max(0, Math.floor(fired)) + 1, config = OPPONENTS[room];
  return chamber >= config.brokenAt ? 'broken' : chamber >= config.breakdownStart ? 'short' : category;
}

export type AbilityUseStats = Record<Side, { spin: number; peek: number }>;
export type RunStats = {
  roomsCleared: number; roundsPlayed: number; handsWon: number; handsLost: number; handsPushed: number;
  hits: number; busts: number; foldsUsed: number; highestChamber: number;
  abilitiesUsed: AbilityUseStats; guestsRemainingWhenFell: number | null;
  startedAt: number; endedAt: number | null; totalTimeMs: number;
};

export function freshRunStats(now = Date.now()): RunStats {
  return {
    roomsCleared: 0, roundsPlayed: 0, handsWon: 0, handsLost: 0, handsPushed: 0,
    hits: 0, busts: 0, foldsUsed: 0, highestChamber: 1,
    abilitiesUsed: { player: { spin: 0, peek: 0 }, ai: { spin: 0, peek: 0 } },
    guestsRemainingWhenFell: null, startedAt: now, endedAt: null, totalTimeMs: 0,
  };
}

export function recordHand(stats: RunStats, result: HandWinner): RunStats {
  if (result === 'tie') return { ...stats, handsPushed: stats.handsPushed + 1 };
  return result === 'player' ? { ...stats, handsWon: stats.handsWon + 1 } : { ...stats, handsLost: stats.handsLost + 1 };
}

export function recordAbility(stats: RunStats, side: Side, ability: 'spin' | 'peek'): RunStats {
  return { ...stats, abilitiesUsed: { ...stats.abilitiesUsed, [side]: { ...stats.abilitiesUsed[side], [ability]: stats.abilitiesUsed[side][ability] + 1 } } };
}

export function finishRunStats(stats: RunStats, guestsRemainingWhenFell: number | null, now = Date.now()): RunStats {
  return { ...stats, guestsRemainingWhenFell, endedAt: now, totalTimeMs: Math.max(0, now - stats.startedAt) };
}

/** Table numbers identify the other tables within the current bracket stage. */
export function feedsForRoom(room: RoomNumber): number[] {
  return room === 1 ? [2, 3, 4] : room === 2 ? [2] : [];
}

export function feedKillsForRound(room: RoomNumber, roundNumber: number): number[] {
  if (room === 1) return [2, 3, 4].filter((_, index) => roundNumber >= [1, 3, 5][index]);
  return room === 2 && roundNumber >= 2 ? [2] : [];
}

export function guestsAfterRoom(room: RoomNumber): number { return room === 1 ? 4 : room === 2 ? 2 : 1; }
export function guestsAtRoomStart(room: RoomNumber): number { return room === 1 ? 8 : room === 2 ? 4 : 2; }

/** Captive labels are the only cross-room story information present on the feeds. */
export function feedSurvivor(room: RoomNumber, table: number): string | null {
  return room === 1 && table === 3 ? OPPONENTS[2].name : room === 2 && table === 2 ? OPPONENTS[3].name : null;
}
