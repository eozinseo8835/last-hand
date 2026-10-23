/** All gameplay tuning lives here. Chambers are numbered 1 through 6. */
export const CONFIG = {
  NUM_CHAMBERS: 6,
  NUM_BULLETS: 1,
  MAX_FOLDS: 3,
  BLUFF_CHANCE: 0.4,
  CONFIDENT_THRESHOLD: 17,
  SUSPENSE_MIN_MS: 1500,
  SUSPENSE_MAX_MS: 2500,
  DANGER_CHAMBER: 4,
  GORE_LEVEL: 'medium' as 'low' | 'medium',
  LOOK_SENSITIVITY: 0.0035,
  PIXEL_HEIGHT: 360,
  LOOK_KEY_SPEED: 1.25,
  DEAL_SPEED: 650,
  DEALER_STANDS_ON: 17,
  VOICE_ENABLED: true,
  VOICE_PITCH: 96,
  VOICE_SPEED: 1,
  VOICE_VOLUME: .28,
};

export type GamePhase =
  | 'START'
  | 'SHUFFLING'
  | 'DEALING'
  | 'PEEKING'
  | 'HITTING'
  | 'DEALER_TURN'
  | 'SWEEPING'
  | 'PLAYER_DECISION'
  | 'REVEAL'
  | 'AI_SHOOTING'
  | 'PLAYER_SHOOTING'
  | 'ROUND_RESULT'
  | 'GAME_OVER';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Card = { suit: Suit; rank: string; id: string };
export type RandomSource = () => number;
export type Round = { player: Card[]; ai: Card[]; deck: Card[] };
export type HandScore = { total: number; soft: boolean; bust: boolean };
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
  return { player: [deck[0], deck[2]], ai: [deck[1], deck[3]], deck: deck.slice(4) };
}

/** A hit always consumes the next card from this round, without mutating either hand. */
export function drawCard(round: Readonly<Round>, target: 'player' | 'ai'): Round {
  const [card, ...deck] = round.deck;
  if (!card) throw new RangeError('The round has no undealt cards.');
  return { player: target === 'player' ? [...round.player, card] : [...round.player],
    ai: target === 'ai' ? [...round.ai, card] : [...round.ai], deck };
}

export function cardValue(card: Card): number {
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  const value = Number(card.rank);
  if (!Number.isInteger(value) || value < 2 || value > 10) {
    throw new RangeError(`Invalid card rank: ${card.rank}`);
  }
  return value;
}

/** Count aces high while possible, lowering only as many as needed to avoid a bust. */
export function handScore(cards: readonly Card[]): HandScore {
  let total = 0, highAces = 0;
  for (const card of cards) { total += cardValue(card); if (card.rank === 'A') highAces++; }
  while (total > 21 && highAces > 0) { total -= 10; highAces--; }
  return { total, soft: highAces > 0, bust: total > 21 };
}

export function handTotal(cards: readonly Card[]): number {
  return handScore(cards).total;
}

export function compareHands(player: readonly Card[], ai: readonly Card[]): HandWinner {
  const playerScore = handScore(player), aiScore = handScore(ai);
  if (playerScore.bust) return 'ai';
  if (aiScore.bust) return 'player';
  const difference = playerScore.total - aiScore.total;
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
