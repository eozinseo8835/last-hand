/**
 * Matchmaking rules (pure, so they can be tested): who leaves the queue together for a new room.
 * Eight waiting → go now. Two or more, and the longest has waited QUEUE_FILL_WAIT_MS → go with everyone here.
 * Anyone who chose "start now" → go with everyone here (computer guests fill the rest).
 */
import { MAX_SEATS, QUEUE_FILL_WAIT_MS, QUEUE_SOLO_OFFER_MS } from './protocol';

export type Waiting = { id: string; name: string; since: number; startNow?: boolean };

export function decideMatch(waiting: readonly Waiting[], now: number): Waiting[] | null {
  const queue = [...waiting].sort((a, b) => a.since - b.since);
  if (queue.length >= MAX_SEATS) return queue.slice(0, MAX_SEATS);
  if (queue.length === 0) return null;
  if (queue.some(w => w.startNow)) return queue.slice(0, MAX_SEATS);
  if (queue.length >= 2 && now - queue[0].since >= QUEUE_FILL_WAIT_MS) return queue.slice(0, MAX_SEATS);
  return null;
}
/** Alone in the queue long enough to be offered a game with computer guests. */
export const canStartAlone = (waiting: readonly Waiting[], self: Waiting, now: number) =>
  waiting.length === 1 && now - self.since >= QUEUE_SOLO_OFFER_MS;
