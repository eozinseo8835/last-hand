import { handScore, type Card } from './game';
const SUIT = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
export function opponentCardReadout(cards: readonly Card[], revealed: boolean): string {
  if (!cards.length) return 'SHOWS: —';
  const symbols = (revealed ? cards : cards.slice(0, 1)).map(card => `${card.rank}${SUIT[card.suit]}`).join(' ');
  if (!revealed) return `SHOWS: ${symbols}`;
  const score = handScore(cards);
  return `${symbols} = ${score.soft ? 'Soft ' : ''}${score.total}${score.bust ? ' · BUST' : ''}`;
}
