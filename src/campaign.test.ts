import { describe, expect, it } from 'vitest';
import { type Card } from './game';
import { createTensionRandom } from './tension';
import {
  HOST, OPPONENTS, feedKillsForRound, feedSurvivor, feedsForRoom, finishRunStats,
  freshRunStats, guestsAfterRoom, guestsAtRoomStart, opponentAction, opponentBreakdownCategory,
  opponentOpeningCategory, opponentTell, recordAbility, recordHand, type RoomNumber,
} from './campaign';

const cards = (...ranks: string[]): Card[] => ranks.map((rank, index) => ({ rank, suit: 'spades', id: `test-${rank}-${index}` }));
const rooms: RoomNumber[] = [1, 2, 3];

describe('three captive policies', () => {
  it('gives the Nervous Man the prescribed mistakes at approximately 25% on each eligible total', () => {
    for (const [hand, wrong] of [[cards('10', '2'), 'stand'], [cards('10', '3'), 'stand'], [cards('10', '7'), 'hit'], [cards('10', '8'), 'hit']] as const) {
      const random = createTensionRandom(8917), trials = 20000;
      let mistakes = 0;
      for (let trial = 0; trial < trials; trial++) if (opponentAction(1, hand, random) === wrong) mistakes++;
      expect(Math.abs(mistakes / trials - .25)).toBeLessThan(.012);
    }
    expect(opponentAction(1, cards('10', '4'), () => 0)).toBe('hit');
    expect(opponentAction(1, cards('10', '5'), () => 0)).toBe('stand');
    expect(opponentAction(1, cards('10', '6'), () => 0)).toBe('stand');
    expect(opponentAction(1, cards('10', '9'), () => 0)).toBe('stand');
    expect(opponentAction(1, cards('10', '7'), () => .25)).toBe('stand');
  });

  it('makes the Gambler hit soft 17 while standing on hard 17 and higher', () => {
    expect(opponentAction(2, cards('A', '6'))).toBe('hit');
    expect(opponentAction(2, cards('10', '7'))).toBe('stand');
    expect(opponentAction(2, cards('A', '6', '10'))).toBe('stand');
    expect(opponentAction(2, cards('A', '7'))).toBe('stand');
    expect(opponentAction(2, cards('10', '6'))).toBe('hit');
  });

  it('makes the Survivor stand on all seventeen totals, and never hits a bust or twenty-one', () => {
    expect(opponentAction(3, cards('A', '6'))).toBe('stand');
    expect(opponentAction(3, cards('10', '7'))).toBe('stand');
    expect(opponentAction(3, cards('10', '6'))).toBe('hit');
    for (const room of rooms) {
      expect(opponentAction(room, cards('10', '10', '2'), () => 0)).toBe('stand');
      expect(opponentAction(room, cards('A', 'K'), () => 0)).toBe('stand');
    }
  });

  it('uses individual bluff chances below seventeen and confident openings at seventeen', () => {
    for (const room of rooms) {
      const threshold = OPPONENTS[room].bluffChance;
      expect(opponentOpeningCategory(room, 16, () => threshold - .0001)).toBe('bluff');
      expect(opponentOpeningCategory(room, 16, () => threshold)).toBe('nervous');
      expect(opponentOpeningCategory(room, 17, () => 0)).toBe('confident');
    }
    expect(OPPONENTS[2].bluffChance).toBe(.5);
  });

  it('matches each personality tell accuracy over strong and weak opening hands', () => {
    for (const room of rooms) for (const total of [13, 19]) {
      const random = createTensionRandom(7624 + room * total), trials = 20000;
      let matches = 0;
      for (let trial = 0; trial < trials; trial++) {
        const tell = opponentTell(room, total, random);
        if ((tell.disposition === 'calm') === (total >= 17)) matches++;
      }
      expect(Math.abs(matches / trials - OPPONENTS[room].tellAccuracy)).toBeLessThan(.012);
    }
  });

  it('keeps breakdown thresholds individual and independent of hand information', () => {
    for (const room of rooms) {
      const { breakdownStart, brokenAt } = OPPONENTS[room];
      expect(opponentBreakdownCategory(room, 'confident', breakdownStart - 2)).toBe('confident');
      expect(opponentBreakdownCategory(room, 'nervous', breakdownStart - 1)).toBe('short');
      expect(opponentBreakdownCategory(room, 'bluff', brokenAt - 1)).toBe('broken');
    }
    expect(OPPONENTS[2].breakdownStart).toBe(4); expect(OPPONENTS[3].breakdownStart).toBe(5);
    for (const config of Object.values(OPPONENTS)) {
      expect(config.voice.pitch).toBeGreaterThan(HOST.voice.pitch);
      expect(config.voice.speed * .78).toBeGreaterThan(HOST.voice.speed);
      expect(config.voice.wobble).toBeGreaterThan(HOST.voice.wobble);
    }
    expect(HOST.voice.calm).toBe(true);
  });
});

describe('campaign bracket and in-memory run statistics', () => {
  it('accounts for exactly eight, four, two, and one guests across the bracket', () => {
    expect(rooms.map(guestsAtRoomStart)).toEqual([8, 4, 2]);
    expect(rooms.map(guestsAfterRoom)).toEqual([4, 2, 1]);
    for (const room of rooms) {
      expect(new Set(feedsForRoom(room)).size).toBe(feedsForRoom(room).length);
      expect(guestsAtRoomStart(room) - feedsForRoom(room).length - 1).toBe(guestsAfterRoom(room));
    }
  });

  it('schedules other-table deaths after completed rounds and identifies the next captives', () => {
    expect(feedKillsForRound(1, 0)).toEqual([]);
    expect(feedKillsForRound(1, 1)).toEqual([2]);
    expect(feedKillsForRound(1, 2)).toEqual([2]);
    expect(feedKillsForRound(1, 3)).toEqual([2, 3]);
    expect(feedKillsForRound(1, 5)).toEqual([2, 3, 4]);
    expect(feedKillsForRound(2, 1)).toEqual([]);
    expect(feedKillsForRound(2, 2)).toEqual([2]);
    expect(feedKillsForRound(3, 100)).toEqual([]);
    expect(feedSurvivor(1, 3)).toBe('THE GAMBLER');
    expect(feedSurvivor(2, 2)).toBe('THE SURVIVOR');
    expect(feedSurvivor(1, 2)).toBeNull();
  });

  it('resets every run counter and keeps nested ability inventories independent', () => {
    const first = freshRunStats(1000);
    const played = recordAbility(recordAbility(recordHand(recordHand(recordHand(first, 'player'), 'ai'), 'tie'), 'player', 'spin'), 'ai', 'peek');
    expect(played).toMatchObject({ handsWon: 1, handsLost: 1, handsPushed: 1, abilitiesUsed: { player: { spin: 1, peek: 0 }, ai: { spin: 0, peek: 1 } } });
    expect(first.handsWon).toBe(0); expect(first.abilitiesUsed.player.spin).toBe(0);
    const ended = finishRunStats(played, 3, 8500);
    expect(ended.totalTimeMs).toBe(7500); expect(ended.endedAt).toBe(8500); expect(ended.guestsRemainingWhenFell).toBe(3);
    expect(played.endedAt).toBeNull();
    expect(freshRunStats(9000)).toMatchObject({ roomsCleared: 0, roundsPlayed: 0, handsWon: 0, handsLost: 0, handsPushed: 0, hits: 0, busts: 0, foldsUsed: 0, highestChamber: 1, startedAt: 9000, endedAt: null, totalTimeMs: 0, guestsRemainingWhenFell: null });
    expect(finishRunStats(first, null, 0).totalTimeMs).toBe(0);
  });
});
