/**
 * LAST HAND online: the messages between a browser and the room server.
 * The server owns every hidden fact (the deck, both hands, the bullet chamber); a browser only
 * receives a view made for its own seat.
 */
import type { Card } from '../game';

export const MAX_SEATS = 8;
/** Seconds a human gets for each decision online (shorter than story mode, so other players never wait long). */
export const ONLINE_DECISION_MS = 20000;
export const ONLINE_TRIGGER_MS = 20000;
export const DEAL_MS = 2200, REVEAL_MS = 2600, RESULT_MS = 3400, GUN_SLIDE_MS = 1500;
/** Same staging as story mode: a 3-second trigger hold, a 1.4-second cylinder spin, and the Host's 4.2-second forced shot. */
export const TRIGGER_HOLD_MS = 3000, SPIN_MS = 1400, FORCED_SHOT_MS = 4200;
export const ROOM_CODE_LENGTH = 4;
/** Room codes avoid letters that are easy to misread (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type SeatKind = 'empty' | 'human' | 'ai';
export type TablePhase = 'dealing' | 'deciding' | 'reveal' | 'shooting' | 'forced' | 'result' | 'over';
/** hold/release: the shooter presses and lets go of the trigger (both players see it); pull: the 3-second hold completed. */
export type Action = 'hit' | 'stand' | 'fold' | 'spin' | 'hold' | 'release' | 'pull';

/** Matchmaking: wait a little for real players, then fill the rest of the eight seats with computer guests. */
export const QUEUE_FILL_WAIT_MS = 20000;     // two or more waiting this long → start with whoever is here
export const QUEUE_SOLO_OFFER_MS = 30000;    // alone this long → offer to start with computer guests
export const MATCH_JOIN_WAIT_MS = 12000;     // a matched room starts when everyone has joined, or after this
/** Browser → matchmaker. */
export type QueueClientMessage = { t: 'queue'; name: string } | { t: 'start-now' } | { t: 'cancel' };
/** Matchmaker → browser. */
export type QueueServerMessage = { t: 'waiting'; players: number; since: number; serverNow: number; canStartAlone: boolean } | { t: 'matched'; code: string };

/** Browser → server. */
export type ClientMessage =
  | { t: 'join'; name: string; token?: string }
  | { t: 'start' }
  | { t: 'act'; action: Action }
  | { t: 'leave' }
  | { t: 'ping' };

/** A card the viewer may not see yet: only its id travels. */
export type HiddenCard = { id: string; hidden: true };
export type ViewCard = Card | HiddenCard;
export const isHidden = (card: ViewCard): card is HiddenCard => 'hidden' in card;

export type SeatView = { seat: number; name: string; kind: SeatKind; connected: boolean; alive: boolean; table: number | null; host: boolean };

/** The viewer's own table, seen from the viewer's chair. */
export type TableView = {
  id: number;
  phase: TablePhase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  round: number;
  me: number;
  opponent: number;
  myCards: Card[];
  /** The opponent's first card is face up (as in blackjack); the rest stay hidden until the reveal. */
  opponentCards: ViewCard[];
  myDone: boolean;
  opponentDone: boolean;
  folds: number;
  spinUsed: boolean;
  /** Chambers already pulled at this table; the bullet's chamber is never sent. */
  currentChamber: number;
  /** Set during shooting and after: who holds the revolver. */
  shooter: number | null;
  /** The shooter is holding the trigger (raising the revolver): started at, and how long until it fires. */
  hold: { seat: number; startedAt: number; duration: number } | null;
  /** The last cylinder spin at this table (either player). */
  spin: { seat: number; at: number } | null;
  /** When the Host began a forced shot (phase 'forced'). */
  forcedAt: number | null;
  /** Set during the result: what the last pull did. */
  shot: { seat: number; fired: boolean; forced: boolean; at: number } | null;
  /** 'win' | 'lose' | 'tie' | 'fold' for the hand just revealed, from the viewer's side. */
  outcome: 'win' | 'lose' | 'tie' | 'fold' | null;
  winner: number | null;
};

/** Every other table, as the CCTV wall shows it: no cards, just the drama. */
export type FeedView = { id: number; seats: [number, number]; phase: TablePhase; shooter: number | null; currentChamber: number; dead: number | null };

export type RoomStage = 'lobby' | 'playing' | 'finished';
export type RoomView = {
  code: string;
  stage: RoomStage;
  /** 1–3: which room of the bracket (8 → 4 → 2 → 1 guests). */
  bracketRoom: number;
  you: number;
  seats: SeatView[];
  table: TableView | null;
  feeds: FeedView[];
  guestsRemaining: number;
  winner: number | null;
  serverNow: number;
  /** Matchmade rooms: when the game starts by itself (null for rooms started by a host). */
  autoStartAt: number | null;
};

/** Server → browser. */
export type ServerMessage =
  | { t: 'welcome'; seat: number; token: string; code: string }
  | { t: 'state'; view: RoomView }
  | { t: 'error'; message: string };

export function randomRoomCode(random: () => number = Math.random) {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  return code;
}
export function normalizeRoomCode(raw: string) {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === ROOM_CODE_LENGTH && [...code].every(ch => ROOM_CODE_ALPHABET.includes(ch)) ? code : null;
}
/** Same rules as the story-mode name box: letters, numbers, spaces, apostrophes, hyphens; 16 characters. */
export function cleanPlayerName(raw: unknown, fallback: string) {
  const name = typeof raw === 'string' ? raw.replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16) : '';
  return name || fallback;
}
