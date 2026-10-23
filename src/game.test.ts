import { describe, expect, it } from 'vitest';
import {
  CONFIG, cardValue, compareHands, createDeck, createRevolver,
  dealRound, drawCard, fireRevolver, handScore, handTotal, shuffleDeck, type Card,
} from './game';
import { DIALOGUE, chooseDialogue, roundDialogueCategory, type DialogueCategory } from './dialogue';

const card = (rank: string): Card => ({ suit: 'spades', rank, id: `spades-${rank}` });

describe('fresh standard deck and blackjack dealing', () => {
  it('has precisely the 52 distinct suit/rank combinations', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(c => c.id)).size).toBe(52);
    for (const suit of ['spades', 'hearts', 'diamonds', 'clubs']) expect(deck.filter(c => c.suit === suit)).toHaveLength(13);
  });

  it('shuffles a copy without changing cards or the original order', () => {
    const deck = createDeck();
    const original = deck.map(c => c.id);
    const shuffled = shuffleDeck(deck, () => 0);
    expect(deck.map(c => c.id)).toEqual(original);
    expect(shuffled.map(c => c.id)).not.toEqual(original);
    expect([...shuffled.map(c => c.id)].sort()).toEqual([...original].sort());
  });

  it('freshly shuffles all 52 cards each round and keeps the remaining 48', () => {
    for (let round = 0; round < 100; round += 1) {
      let calls = 0;
      const hands = dealRound(() => { calls += 1; return Math.random(); });
      expect(calls).toBe(51);
      expect(hands.player).toHaveLength(2);
      expect(hands.ai).toHaveLength(2);
      expect(hands.deck).toHaveLength(48);
      expect(new Set([...hands.player, ...hands.ai, ...hands.deck].map(c => c.id)).size).toBe(52);
    }
    const first = dealRound(() => .5);
    first.player.pop(); first.deck.pop();
    expect(dealRound(() => .5).player).toHaveLength(2);
    expect(dealRound(() => .5).deck).toHaveLength(48);
  });

  it('deals player, Stranger up, player, then Stranger hole card', () => {
    const deck = createDeck();
    const round = dealRound(() => .999999);
    expect(round.player).toEqual([deck[0], deck[2]]);
    expect(round.ai).toEqual([deck[1], deck[3]]);
    expect(round.deck).toEqual(deck.slice(4));
  });

  it('draws every hit from the same deck without mutating previous round state', () => {
    const original = dealRound(() => .3);
    let round = original;
    for (let draw = 0; draw < 48; draw++) {
      const before = round;
      const target = draw % 2 === 0 ? 'player' : 'ai';
      const next = before.deck[0];
      round = drawCard(before, target);
      expect(round[target].at(-1)).toEqual(next);
      expect(before.deck).toHaveLength(48 - draw);
      expect(round.deck).toHaveLength(47 - draw);
      const all = [...round.player, ...round.ai, ...round.deck];
      expect(all).toHaveLength(52);
      expect(new Set(all.map(c => c.id)).size).toBe(52);
    }
    expect(original.player).toHaveLength(2);
    expect(original.ai).toHaveLength(2);
    expect(original.deck).toHaveLength(48);
    expect(() => drawCard(round, 'player')).toThrow();
  });
});

describe('blackjack hand values and loser selection', () => {
  it.each([
    { rank: 'A', value: 11 }, { rank: '2', value: 2 }, { rank: '9', value: 9 },
    { rank: '10', value: 10 }, { rank: 'J', value: 10 },
    { rank: 'Q', value: 10 }, { rank: 'K', value: 10 },
  ])('$rank has its blackjack value $value', ({ rank, value }) => expect(cardValue(card(rank))).toBe(value));

  it.each([
    { ranks: ['A', '6'], total: 17, soft: true, bust: false },
    { ranks: ['A', '6', '10'], total: 17, soft: false, bust: false },
    { ranks: ['A', 'A'], total: 12, soft: true, bust: false },
    { ranks: ['A', 'A', 'A', '8'], total: 21, soft: true, bust: false },
    { ranks: ['A', 'A', 'A', '9'], total: 12, soft: false, bust: false },
    { ranks: ['A', 'K'], total: 21, soft: true, bust: false },
    { ranks: ['K', 'Q', '2'], total: 22, soft: false, bust: true },
  ])('$ranks totals $total with soft=$soft and bust=$bust', ({ ranks, total, soft, bust }) => {
    expect(handScore(ranks.map(card))).toEqual({ total, soft, bust });
    expect(handTotal(ranks.map(card))).toBe(total);
  });

  it('compares valid hands, pushes equal totals, and makes a bust lose immediately', () => {
    expect(compareHands([card('K'), card('Q')], [card('A'), card('2')])).toBe('player');
    expect(compareHands([card('A'), card('2')], [card('K'), card('Q')])).toBe('ai');
    expect(compareHands([card('K'), card('7')], [card('9'), card('8')])).toBe('tie');
    expect(compareHands([card('K'), card('Q'), card('2')], [card('2'), card('3')])).toBe('ai');
    expect(compareHands([card('2'), card('3')], [card('K'), card('Q'), card('2')])).toBe('player');
  });
});

describe('one shared six-chamber revolver', () => {
  it('loads exactly one hidden random chamber and resets the pointer', () => {
    expect(createRevolver(() => 0)).toEqual({ bulletChamber: 1, currentChamber: 1 });
    expect(createRevolver(() => .999999)).toEqual({ bulletChamber: 6, currentChamber: 1 });
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
  it('contains the new blackjack categories and at least four nonempty unique lines in every category', () => {
    expect(Object.keys(DIALOGUE)).toEqual(expect.arrayContaining([
      'intro', 'confident', 'nervous', 'bluff', 'player_folds', 'player_goes',
      'ai_survives_click', 'player_survives_click', 'danger', 'ai_loses_hand',
      'player_hits', 'player_stands', 'player_busts', 'ai_hits', 'ai_busts', 'push',
    ]));
    for (const lines of Object.values(DIALOGUE)) {
      expect(lines.length).toBeGreaterThanOrEqual(4);
      expect(lines.every(line => line.trim().length > 0)).toBe(true);
      expect(new Set(lines).size).toBe(lines.length);
    }
  });

  it('always produces a line and excludes the previous line even with the same RNG', () => {
    for (const category of Object.keys(DIALOGUE) as DialogueCategory[]) {
      let previous = '';
      for (let i = 0; i < 30; i++) {
        const next = chooseDialogue(category, previous, () => 0);
        expect(next.length).toBeGreaterThan(0);
        expect(next).not.toBe(previous);
        previous = next;
      }
    }
  });

  it('uses seventeen for confident openings and a forty-percent bluff threshold below seventeen', () => {
    for (const chamber of [1, 4, 6]) {
      expect(roundDialogueCategory(17, chamber, () => 0)).toBe('confident');
      expect(roundDialogueCategory(16, chamber, () => .399)).toBe('bluff');
      expect(roundDialogueCategory(16, chamber, () => .4)).toBe('nervous');
    }
  });
});
