import { describe, expect, it } from 'vitest';
import {
  CONFIG, cardValue, compareHands, createDeck, createRevolver,
  dealRound, fireRevolver, handTotal, shuffleDeck, type Card,
} from './game';
import { DIALOGUE, chooseDialogue, roundDialogueCategory, type DialogueCategory } from './dialogue';

const card = (rank: string): Card => ({ suit: 'spades', rank, id: `spades-${rank}` });

describe('fresh standard deck and fair dealing', () => {
  it('has precisely the 52 distinct suit/rank combinations', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(c => c.id)).size).toBe(52);
    for (const suit of ['spades', 'hearts', 'diamonds', 'clubs']) {
      expect(deck.filter(c => c.suit === suit)).toHaveLength(13);
    }
  });

  it('shuffles a copy without changing cards or the original order', () => {
    const deck = createDeck();
    const original = deck.map(c => c.id);
    const shuffled = shuffleDeck(deck, () => 0);
    expect(deck.map(c => c.id)).toEqual(original);
    expect(shuffled.map(c => c.id)).not.toEqual(original);
    expect([...shuffled.map(c => c.id)].sort()).toEqual([...original].sort());
  });

  it('freshly shuffles all 52 cards each round and deals no duplicate', () => {
    for (let round = 0; round < 100; round += 1) {
      let calls = 0;
      const hands = dealRound(() => { calls += 1; return Math.random(); });
      expect(calls).toBe(51);
      expect(hands.player).toHaveLength(2);
      expect(hands.ai).toHaveLength(2);
      expect(new Set([...hands.player, ...hands.ai].map(c => c.id)).size).toBe(4);
    }
    const first = dealRound(() => 0.5);
    first.player.pop();
    expect(dealRound(() => 0.5).player).toHaveLength(2);
  });
});

describe('hand values and loser selection', () => {
  it.each([
    { rank: 'A', value: 1 }, { rank: '2', value: 2 }, { rank: '9', value: 9 },
    { rank: '10', value: 10 }, { rank: 'J', value: 10 },
    { rank: 'Q', value: 10 }, { rank: 'K', value: 10 },
  ])(
    '$rank is worth $value', ({ rank, value }) => expect(cardValue(card(rank))).toBe(value),
  );

  it('sums both cards and treats aces as one, never eleven', () => {
    expect(handTotal([card('A'), card('K')])).toBe(11);
    expect(handTotal([card('A'), card('A')])).toBe(2);
    expect(handTotal([card('J'), card('Q')])).toBe(20);
  });

  it('compares totals and reports ties independently from either shooter', () => {
    expect(compareHands([card('K'), card('Q')], [card('A'), card('2')])).toBe('player');
    expect(compareHands([card('A'), card('2')], [card('K'), card('Q')])).toBe('ai');
    expect(compareHands([card('K'), card('A')], [card('5'), card('6')])).toBe('tie');
  });
});

describe('one shared six-chamber revolver', () => {
  it('loads exactly one hidden random chamber and resets the pointer', () => {
    expect(createRevolver(() => 0)).toEqual({ bulletChamber: 1, currentChamber: 1 });
    expect(createRevolver(() => 0.999999)).toEqual({ bulletChamber: 6, currentChamber: 1 });
    expect(CONFIG.NUM_BULLETS).toBe(1);
  });

  it.each([1, 2, 3, 4, 5, 6])('ends exactly on chamber %i and always by the sixth pull', bulletChamber => {
    let revolver = { bulletChamber, currentChamber: 1 };
    let pulls = 0;
    while (pulls < CONFIG.NUM_CHAMBERS) {
      const before = { ...revolver };
      const result = fireRevolver(revolver);
      pulls += 1;
      expect(revolver).toEqual(before);
      expect(result.revolver.currentChamber).toBe(before.currentChamber + 1);
      expect(result.fired).toBe(pulls === bulletChamber);
      revolver = result.revolver;
      if (result.fired) break;
    }
    expect(pulls).toBe(bulletChamber);
  });

  it('rejects a seventh trigger pull rather than wrapping to a safe chamber', () => {
    expect(() => fireRevolver({ bulletChamber: 6, currentChamber: 7 })).toThrow(RangeError);
  });
});

describe('authored dialogue', () => {
  it('contains at least four nonempty unique lines in every required category', () => {
    expect(Object.keys(DIALOGUE)).toHaveLength(10);
    for (const lines of Object.values(DIALOGUE)) {
      expect(lines.length).toBeGreaterThanOrEqual(4);
      expect(lines.every(line => line.trim().length > 0)).toBe(true);
      expect(new Set(lines).size).toBe(lines.length);
    }
  });

  it('always produces a line and excludes the previous line even with the same RNG', () => {
    for (const category of Object.keys(DIALOGUE) as DialogueCategory[]) {
      let previous = '';
      for (let i = 0; i < 30; i += 1) {
        const next = chooseDialogue(category, previous, () => 0);
        expect(next.length).toBeGreaterThan(0);
        expect(next).not.toBe(previous);
        previous = next;
      }
    }
  });

  it('bluffs below fourteen with a forty percent threshold and overrides for danger', () => {
    expect(roundDialogueCategory(14, 1, () => 0)).toBe('confident');
    expect(roundDialogueCategory(13, 1, () => 0.399)).toBe('bluff');
    expect(roundDialogueCategory(13, 1, () => 0.4)).toBe('nervous');
    expect(roundDialogueCategory(20, 4, () => 0)).toBe('danger');
    expect(roundDialogueCategory(2, 6, () => 0)).toBe('danger');
  });
});
