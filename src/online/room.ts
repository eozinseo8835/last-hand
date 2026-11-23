/**
 * The online room, run by the server: eight seats, a bracket of three rooms (8 → 4 → 2 → 1 guests),
 * and a 1v1 table for every pair. Pure data and functions (no network, no timers), so it can be tested
 * and so the server can save it between messages. Time is always passed in as `now` (ms).
 */
import { createDeck, createRevolver, fireRevolver, handScore, shuffleDeck, type Card, type RandomSource, type Revolver } from '../game';
import { opponentAction, type RoomNumber } from '../campaign';
import {
  DEAL_MS, GUN_SLIDE_MS, MAX_SEATS, ONLINE_DECISION_MS, ONLINE_TRIGGER_MS, RESULT_MS, REVEAL_MS,
  cleanPlayerName, type Action, type FeedView, type RoomStage, type RoomView, type SeatKind, type TablePhase, type TableView, type ViewCard,
} from './protocol';

export type Seat = { name: string; kind: SeatKind; token: string | null; connected: boolean; alive: boolean; table: number | null };
export type Shot = { seat: number; fired: boolean; forced: boolean; at: number };
export type Table = {
  id: number; seats: [number, number]; phase: TablePhase; phaseStartedAt: number; phaseEndsAt: number; round: number;
  deck: Card[]; hands: Record<number, Card[]>; done: Record<number, boolean>; hit: Record<number, boolean>;
  folds: Record<number, number>; spinUsed: Record<number, boolean>; revolver: Revolver;
  shooter: number | null; shot: Shot | null; outcome: { winner: number | null; fold: number | null } | null;
  dead: number | null; winner: number | null; aiNextAt: Record<number, number>;
};
export type Room = {
  code: string; stage: RoomStage; bracketRoom: number; seats: Seat[]; host: number | null; tables: Table[]; winner: number | null;
  /** Rooms made by the matchmaker start by themselves: when every matched player has joined, or at this time. */
  autoStartAt?: number | null; expectedHumans?: number;
};

export const MAX_FOLDS_ONLINE = 3;
const AI_NAMES = ['GUEST 01', 'GUEST 02', 'GUEST 03', 'GUEST 04', 'GUEST 05', 'GUEST 06', 'GUEST 07', 'GUEST 08'];

export function createRoom(code: string): Room {
  return { code, stage: 'lobby', bracketRoom: 1, host: null, tables: [], winner: null,
    seats: Array.from({ length: MAX_SEATS }, () => ({ name: '', kind: 'empty' as SeatKind, token: null, connected: false, alive: true, table: null })) };
}

/** Joins (or rejoins, with the token from an earlier welcome) and returns the seat, or an error for the player. */
export function joinRoom(room: Room, rawName: unknown, token: string | undefined, newToken: () => string): { seat: number; token: string } | { error: string } {
  if (token) {
    const seat = room.seats.findIndex(s => s.token === token);
    if (seat >= 0) { room.seats[seat].connected = true; if (room.seats[seat].kind === 'ai' && room.seats[seat].token) room.seats[seat].kind = 'human'; return { seat, token }; }
  }
  if (room.stage !== 'lobby') return { error: 'This game has already started.' };
  const seat = room.seats.findIndex(s => s.kind === 'empty');
  if (seat < 0) return { error: 'This table is full (8 guests).' };
  const fresh = newToken();
  room.seats[seat] = { name: cleanPlayerName(rawName, `GUEST ${String(seat + 1).padStart(2, '0')}`), kind: 'human', token: fresh, connected: true, alive: true, table: null };
  if (room.host === null || room.seats[room.host].kind !== 'human') room.host = seat;
  return { seat, token: fresh };
}

/** A dropped connection: in the lobby the seat is freed; in a game the computer plays it until they return. */
export function disconnect(room: Room, seat: number) {
  const s = room.seats[seat]; if (!s) return;
  s.connected = false;
  if (room.stage === 'lobby') { room.seats[seat] = { name: '', kind: 'empty', token: null, connected: false, alive: true, table: null }; }
  if (room.host === seat) { const next = room.seats.findIndex(other => other.kind === 'human' && other.connected); room.host = next >= 0 ? next : null; }
}

const aiControlled = (room: Room, seat: number) => room.seats[seat].kind !== 'human' || !room.seats[seat].connected;

/** A matchmade room: nobody presses start; it begins when the matched players are seated (or after `waitMs`). */
export function prepareMatch(room: Room, expectedHumans: number, now: number, waitMs: number) {
  room.expectedHumans = expectedHumans; room.autoStartAt = now + waitMs;
}
/** The host starts: empty seats are filled by computer guests and the eight are paired at random. */
export function startGame(room: Room, by: number, now: number, random: RandomSource): string | null {
  if (room.stage !== 'lobby') return 'The game has already started.';
  if (by !== room.host) return 'Only the host can start the game.';
  return beginGame(room, now, random);
}
function beginGame(room: Room, now: number, random: RandomSource): string | null {
  room.autoStartAt = null;
  room.seats.forEach((s, i) => { if (s.kind === 'empty') room.seats[i] = { name: AI_NAMES[i], kind: 'ai', token: null, connected: false, alive: true, table: null }; });
  room.stage = 'playing'; room.bracketRoom = 1;
  seatTables(room, room.seats.map((_, i) => i), now, random);
  return null;
}

function seatTables(room: Room, alive: number[], now: number, random: RandomSource) {
  const order = shuffleDeck(alive.map(seat => ({ suit: 'spades' as const, rank: String(seat), id: String(seat) })), random).map(c => Number(c.rank));
  room.tables = [];
  for (let i = 0; i + 1 < order.length; i += 2) {
    const seats: [number, number] = [order[i], order[i + 1]];
    const table: Table = { id: room.tables.length, seats, phase: 'dealing', phaseStartedAt: now, phaseEndsAt: now, round: 0, deck: [], hands: {}, done: {}, hit: {},
      folds: { [seats[0]]: MAX_FOLDS_ONLINE, [seats[1]]: MAX_FOLDS_ONLINE }, spinUsed: {}, revolver: createRevolver(random),
      shooter: null, shot: null, outcome: null, dead: null, winner: null, aiNextAt: {} };
    room.tables.push(table); seats.forEach(s => { room.seats[s].table = table.id; });
    newHand(table, now, random);
  }
}

function setPhase(table: Table, phase: TablePhase, now: number, duration: number) {
  table.phase = phase; table.phaseStartedAt = now; table.phaseEndsAt = now + duration;
}

function newHand(table: Table, now: number, random: RandomSource) {
  table.deck = shuffleDeck(createDeck(), random); table.round++;
  for (const s of table.seats) { table.hands[s] = [table.deck.pop()!, table.deck.pop()!]; table.done[s] = false; table.hit[s] = false; }
  table.shooter = null; table.shot = null; table.outcome = null; table.aiNextAt = {};
  setPhase(table, 'dealing', now, DEAL_MS);
}

const finished = (cards: Card[]) => { const score = handScore(cards); return score.bust || score.total >= 21; };

/** Both hands compared the same way from either chair; both bust is a tie. */
export function handWinner(table: Table): number | null {
  const [a, b] = table.seats, sa = handScore(table.hands[a]), sb = handScore(table.hands[b]);
  if (sa.bust && sb.bust) return null;
  if (sa.bust) return b; if (sb.bust) return a;
  return sa.total === sb.total ? null : sa.total > sb.total ? a : b;
}

/** A player's action. Returns an error for that player, or null when it was applied. */
export function act(room: Room, seat: number, action: Action, now: number, random: RandomSource): string | null {
  if (room.stage !== 'playing') return 'The game is not running.';
  const table = room.tables.find(t => t.seats.includes(seat));
  if (!table || !room.seats[seat].alive) return 'You are not at a table.';
  return applyAction(room, table, seat, action, now, random);
}

function applyAction(room: Room, table: Table, seat: number, action: Action, now: number, random: RandomSource): string | null {
  if (action === 'hit' || action === 'stand' || action === 'fold') {
    if (table.phase !== 'deciding') return 'Wait for the deal.';
    if (table.done[seat]) return 'You have already finished this hand.';
    if (action === 'hit') { table.hands[seat].push(table.deck.pop()!); table.hit[seat] = true; if (finished(table.hands[seat])) table.done[seat] = true; }
    else if (action === 'stand') table.done[seat] = true;
    else {
      if (table.hit[seat]) return 'You can only fold before you hit.';
      if (table.folds[seat] <= 0) return 'No folds left.';
      table.folds[seat]--; table.outcome = { winner: null, fold: seat }; setPhase(table, 'result', now, RESULT_MS); return null;
    }
    if (table.seats.every(s => table.done[s])) setPhase(table, 'reveal', now, REVEAL_MS);
    return null;
  }
  if (table.phase !== 'shooting' || table.shooter !== seat || table.shot) return 'It is not your turn with the revolver.';
  if (now < table.phaseStartedAt + GUN_SLIDE_MS) return 'The revolver is still on its way to you.';
  if (action === 'spin') {
    if (table.spinUsed[seat]) return 'You have already spun the cylinder in this room.';
    table.spinUsed[seat] = true; table.revolver = createRevolver(random); return null;
  }
  fire(room, table, seat, false, now); return null;
}

function fire(room: Room, table: Table, seat: number, forced: boolean, now: number) {
  const result = fireRevolver(table.revolver);
  table.revolver = result.revolver; table.shot = { seat, fired: result.fired, forced, at: now };
  if (result.fired) { table.dead = seat; room.seats[seat].alive = false; table.winner = table.seats.find(s => s !== seat)!; }
  setPhase(table, 'result', now, RESULT_MS);
}

/** Moves every table along by the clock and plays the computer-controlled seats. Call on every message and alarm. */
export function tick(room: Room, now: number, random: RandomSource) {
  if (room.stage === 'lobby' && room.autoStartAt) {
    const seated = room.seats.filter(s => s.kind === 'human').length;
    if (seated > 0 && (now >= room.autoStartAt || seated >= (room.expectedHumans ?? MAX_SEATS))) beginGame(room, now, random);
    else if (seated === 0 && now >= room.autoStartAt + 60_000) room.autoStartAt = null;   // nobody came
  }
  if (room.stage !== 'playing') return;
  for (const table of room.tables) {
    for (let guard = 0; guard < 8 && table.phase !== 'over'; guard++) { if (!stepTable(room, table, now, random)) break; }
  }
  if (room.tables.every(t => t.phase === 'over')) {
    const alive = room.seats.map((s, i) => (s.alive ? i : -1)).filter(i => i >= 0);
    if (alive.length <= 1) { room.stage = 'finished'; room.winner = alive[0] ?? null; return; }
    room.bracketRoom++;
    room.seats.forEach(s => { s.table = null; });
    seatTables(room, alive, now, random);
  }
}

/** One step for one table; returns true if something changed (so the caller can step again). */
function stepTable(room: Room, table: Table, now: number, random: RandomSource): boolean {
  const due = now >= table.phaseEndsAt;
  switch (table.phase) {
    case 'dealing':
      if (!due) return false;
      setPhase(table, 'deciding', now, ONLINE_DECISION_MS);
      for (const s of table.seats) table.aiNextAt[s] = now + 1200 + random() * 1800;
      return true;
    case 'deciding': {
      let changed = false;
      for (const s of table.seats) {
        if (table.done[s] || !aiControlled(room, s) || now < (table.aiNextAt[s] ?? Infinity)) continue;
        const move = opponentAction(Math.min(3, room.bracketRoom) as RoomNumber, table.hands[s], random);
        applyAction(room, table, s, move, now, random); table.aiNextAt[s] = now + 900 + random() * 1200; changed = true;
        if (table.phase !== 'deciding') return true;
      }
      if (due) { for (const s of table.seats) table.done[s] = true; setPhase(table, 'reveal', now, REVEAL_MS); return true; }
      return changed;
    }
    case 'reveal': {
      if (!due) return false;
      const winner = handWinner(table);
      table.outcome = { winner, fold: null };
      if (winner === null) { setPhase(table, 'result', now, RESULT_MS); return true; }
      table.shooter = table.seats.find(s => s !== winner)!;
      setPhase(table, 'shooting', now, GUN_SLIDE_MS + ONLINE_TRIGGER_MS);
      table.aiNextAt[table.shooter] = now + GUN_SLIDE_MS + 1500 + random() * 2000;
      return true;
    }
    case 'shooting': {
      const shooter = table.shooter!;
      if (aiControlled(room, shooter) && now >= (table.aiNextAt[shooter] ?? Infinity)) { fire(room, table, shooter, false, now); return true; }
      if (due) { fire(room, table, shooter, true, now); return true; }   // the Host takes the shot for a player who stalls
      return false;
    }
    case 'result':
      if (!due) return false;
      if (table.dead !== null) { setPhase(table, 'over', now, 0); return true; }
      newHand(table, now, random); return true;
    default: return false;
  }
}

/** When the server should wake up next (the earliest phase deadline or computer move), or null when idle. */
export function nextWakeAt(room: Room): number | null {
  if (room.stage === 'lobby') return room.autoStartAt ?? null;
  if (room.stage !== 'playing') return null;
  let next = Infinity;
  for (const t of room.tables) {
    if (t.phase === 'over') continue;
    next = Math.min(next, t.phaseEndsAt);
    for (const s of t.seats) if (aiControlled(room, s) && t.aiNextAt[s] !== undefined && (t.phase === 'deciding' ? !t.done[s] : t.phase === 'shooting' && t.shooter === s)) next = Math.min(next, t.aiNextAt[s]);
  }
  return Number.isFinite(next) ? next : null;
}

/** Everything one player may see. Hidden cards travel as ids only; the bullet's chamber never travels. */
export function viewFor(room: Room, you: number, now: number): RoomView {
  const mine = room.tables.find(t => t.seats.includes(you)) ?? null;
  return {
    code: room.code, stage: room.stage, bracketRoom: room.bracketRoom, you, serverNow: now, winner: room.winner, autoStartAt: room.autoStartAt ?? null,
    guestsRemaining: room.seats.filter(s => s.kind !== 'empty' && s.alive).length,
    seats: room.seats.map((s, seat) => ({ seat, name: s.name, kind: s.kind, connected: s.kind === 'ai' || s.connected, alive: s.alive, table: s.table, host: seat === room.host })),
    table: mine ? tableView(mine, you) : null,
    feeds: room.tables.filter(t => t !== mine).map((t): FeedView => ({ id: t.id, seats: t.seats, phase: t.phase, shooter: t.shooter, currentChamber: t.revolver.currentChamber, dead: t.dead })),
  };
}

function tableView(t: Table, me: number): TableView {
  const opponent = t.seats.find(s => s !== me)!;
  const shown = t.phase === 'reveal' || t.phase === 'shooting' || t.phase === 'over' || (t.phase === 'result' && !t.outcome?.fold);
  const opponentCards: ViewCard[] = (t.hands[opponent] ?? []).map((card, i) => (shown || i === 0 ? card : { id: card.id, hidden: true as const }));
  const outcome = !t.outcome ? null : t.outcome.fold !== null ? 'fold' : t.outcome.winner === null ? 'tie' : t.outcome.winner === me ? 'win' : 'lose';
  return { id: t.id, phase: t.phase, phaseStartedAt: t.phaseStartedAt, phaseEndsAt: t.phaseEndsAt, round: t.round, me, opponent,
    myCards: [...(t.hands[me] ?? [])], opponentCards, myDone: !!t.done[me], opponentDone: !!t.done[opponent], folds: t.folds[me] ?? 0,
    spinUsed: !!t.spinUsed[me], currentChamber: t.revolver.currentChamber, shooter: t.shooter, shot: t.shot, outcome, winner: t.winner };
}
