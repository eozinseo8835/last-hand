import { describe, expect, it } from 'vitest';
import { opponentCardReadout } from './presentation';
import type { Card } from './game';
const card = (rank: string, suit: Card['suit']): Card => ({ rank, suit, id: `${rank}-${suit}` });
describe('readable opponent cards without leaking the hole card', () => {
  it('shows only the upright up-card index before the reveal', () => {
    expect(opponentCardReadout([card('7', 'hearts'), card('4', 'spades')], false)).toBe('SHOWS: 7♥');
  });
  it('shows every rank and suit and the correct evolving total after reveal', () => {
    expect(opponentCardReadout([card('7', 'hearts'), card('4', 'spades'), card('9', 'clubs')], true)).toBe('7♥ 4♠ 9♣ = 20');
    expect(opponentCardReadout([card('A', 'hearts'), card('6', 'clubs')], true)).toBe('A♥ 6♣ = Soft 17');
  });
});
