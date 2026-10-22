/** All gameplay tuning lives here. Chambers are numbered 1 through 6. */
export const CONFIG = {
  NUM_CHAMBERS: 6,
  NUM_BULLETS: 1,
  MAX_FOLDS: 3,
  BLUFF_CHANCE: 0.4,
  CONFIDENT_THRESHOLD: 14,
  SUSPENSE_MIN_MS: 1500,
  SUSPENSE_MAX_MS: 2500,
  DANGER_CHAMBER: 4,
  GORE_LEVEL: 'medium' as 'low' | 'medium',
};

export type GamePhase =
  | 'START'
  | 'DEALING'
  | 'PLAYER_DECISION'
  | 'REVEAL'
  | 'AI_SHOOTING'
  | 'PLAYER_SHOOTING'
  | 'ROUND_RESULT'
  | 'GAME_OVER';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Card = { suit: Suit; rank: string; id: string };
export type RandomSource = () => number;
export type Round = { player: Card[]; ai: Card[] };
export type HandWinner = 'player' | 'ai' | 'tie';
export type Revolver = { bulletChamber: number; currentChamber: number };

const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(): Card[] {
  return SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank, id: `${suit}-${rank}` })));
}

/** Fisher–Yates produces a fresh array and never mutates its input. */
export function shuffleDeck(deck: readonly Card[], random: RandomSource = Math.random): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Every round starts with all 52 cards, dealt alternately to the two hands. */
export function dealRound(random: RandomSource = Math.random): Round {
  const deck = shuffleDeck(createDeck(), random);
  return { player: [deck[0], deck[2]], ai: [deck[1], deck[3]] };
}

export function cardValue(card: Card): number {
  if (card.rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  const value = Number(card.rank);
  if (!Number.isInteger(value) || value < 2 || value > 10) {
    throw new RangeError(`Invalid card rank: ${card.rank}`);
  }
  return value;
}

export function handTotal(cards: readonly Card[]): number {
  return cards.reduce((total, card) => total + cardValue(card), 0);
}

export function compareHands(player: readonly Card[], ai: readonly Card[]): HandWinner {
  const difference = handTotal(player) - handTotal(ai);
  return difference === 0 ? 'tie' : difference > 0 ? 'player' : 'ai';
}

export function createRevolver(random: RandomSource = Math.random): Revolver {
  return {
    bulletChamber: Math.floor(random() * CONFIG.NUM_CHAMBERS) + 1,
    currentChamber: 1,
  };
}

/** Only a trigger pull advances the shared pointer, including a fatal pull. */
export function fireRevolver(revolver: Readonly<Revolver>): { fired: boolean; revolver: Revolver } {
  const { currentChamber, bulletChamber } = revolver;
  if (currentChamber < 1 || currentChamber > CONFIG.NUM_CHAMBERS ||
      bulletChamber < 1 || bulletChamber > CONFIG.NUM_CHAMBERS ||
      !Number.isInteger(currentChamber) || !Number.isInteger(bulletChamber)) {
    throw new RangeError('The revolver has no playable chamber.');
  }
  return {
    fired: currentChamber === bulletChamber,
    revolver: { bulletChamber, currentChamber: currentChamber + 1 },
  };
}
