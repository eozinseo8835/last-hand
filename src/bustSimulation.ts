import { dealRound, drawCard, handScore, type RandomSource } from './game';
import { opponentAction, type RoomNumber } from './campaign';
import { createTensionRandom } from './tension';

/** Reproduce the real draw policy while the seated player watches the captive.
 * No unseen PEEK is permitted under observation. No deck or policy is adjusted.
 */
export function simulateStandRounds(room: RoomNumber, rounds = 10000, random: RandomSource = createTensionRandom(0x51a7 + room)) {
  let busts = 0, draws = 0;
  for (let index = 0; index < rounds; index++) {
    let round = dealRound(random);
    while (!handScore(round.ai).bust && opponentAction(room, round.ai, random) === 'hit') {
      round = drawCard(round, 'ai'); draws++;
    }
    if (handScore(round.ai).bust) busts++;
  }
  return { room, rounds, busts, draws, bustRate: busts / rounds };
}
