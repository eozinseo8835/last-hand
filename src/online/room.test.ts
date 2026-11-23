import { describe, expect, it } from 'vitest';
import { act, createRoom, disconnect, handWinner, joinRoom, nextWakeAt, startGame, tick, viewFor, type Room } from './room';
import { DEAL_MS, GUN_SLIDE_MS, ONLINE_DECISION_MS, ONLINE_TRIGGER_MS, RESULT_MS, REVEAL_MS, isHidden, normalizeRoomCode, randomRoomCode } from './protocol';
import type { Card } from '../game';

/** A seeded random source so every run deals the same cards. */
function seeded(seed = 7) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
let tokens = 0;
const token = () => `t${++tokens}`;
function lobby(humans = 2) {
  const room = createRoom('KQ7X');
  const joined = Array.from({ length: humans }, (_, i) => joinRoom(room, `Player ${i + 1}`, undefined, token) as { seat: number; token: string });
  return { room, joined };
}
const card = (rank: string, suit: Card['suit'] = 'spades'): Card => ({ rank, suit, id: `${rank}${suit}${Math.random()}` });
/** Runs the clock forward in small steps, as the server's alarms would. */
function run(room: Room, from: number, ms: number, random: () => number, step = 250) {
  let now = from; for (; now <= from + ms; now += step) tick(room, now, random); return now;
}

describe('room codes and names', () => {
  it('makes four-character codes without look-alike letters and reads them back case-insensitively', () => {
    const code = randomRoomCode(seeded());
    expect(code).toHaveLength(4); expect(normalizeRoomCode(code.toLowerCase())).toBe(code);
    expect(normalizeRoomCode('O0I1')).toBeNull(); expect(normalizeRoomCode('ABC')).toBeNull();
  });
});

describe('lobby', () => {
  it('seats up to eight humans, the first is host, names are cleaned, and the ninth is refused', () => {
    const room = createRoom('KQ7X');
    const first = joinRoom(room, '  Austin <script>', undefined, token) as { seat: number };
    expect(first.seat).toBe(0); expect(room.host).toBe(0); expect(room.seats[0].name).toBe('Austin script');
    for (let i = 1; i < 8; i++) joinRoom(room, `P${i}`, undefined, token);
    expect(joinRoom(room, 'late', undefined, token)).toMatchObject({ error: 'This table is full (8 guests).' });
  });
  it('rejoins the same seat with its token and frees a lobby seat on disconnect (host passes on)', () => {
    const { room, joined } = lobby(2);
    expect(joinRoom(room, 'whoever', joined[1].token, token)).toMatchObject({ seat: 1 });
    disconnect(room, 0);
    expect(room.seats[0].kind).toBe('empty'); expect(room.host).toBe(1);
  });
  it('only the host can start; empty seats become computer guests; eight guests sit at four tables', () => {
    const { room } = lobby(2), random = seeded();
    expect(startGame(room, 1, 0, random)).toBe('Only the host can start the game.');
    expect(startGame(room, 0, 0, random)).toBeNull();
    expect(room.seats.filter(s => s.kind === 'ai')).toHaveLength(6);
    expect(room.tables).toHaveLength(4);
    expect(new Set(room.tables.flatMap(t => t.seats)).size).toBe(8);
    expect(joinRoom(room, 'late', undefined, token)).toMatchObject({ error: 'This game has already started.' });
  });
});

describe('a 1v1 table', () => {
  it('hides the opponent\'s cards except the first, and never sends the bullet chamber', () => {
    const { room } = lobby(2), random = seeded(); startGame(room, 0, 0, random);
    const view = viewFor(room, 0, 0), t = view.table!;
    expect(t.myCards).toHaveLength(2);
    expect(isHidden(t.opponentCards[0])).toBe(false); expect(isHidden(t.opponentCards[1])).toBe(true);
    expect(JSON.stringify(view)).not.toContain('bulletChamber');
    expect(JSON.stringify(view.feeds)).not.toContain('"rank"');
  });
  it('deals, lets both decide at once, reveals, and hands the revolver to the loser', () => {
    const { room } = lobby(2), random = seeded(3); startGame(room, 0, 0, random);
    const table = room.tables.find(t => t.seats.includes(0))!, [a, b] = table.seats;
    expect(act(room, a, 'stand', 100, random)).toBe('Wait for the deal.');
    tick(room, DEAL_MS, random); expect(table.phase).toBe('deciding');
    table.hands[a] = [card('10'), card('9')]; table.hands[b] = [card('10'), card('7')];
    room.seats[a].kind = room.seats[b].kind = 'human'; room.seats[a].connected = room.seats[b].connected = true;
    expect(act(room, a, 'stand', DEAL_MS + 10, random)).toBeNull();
    expect(act(room, a, 'hit', DEAL_MS + 20, random)).toBe('You have already finished this hand.');
    expect(act(room, b, 'stand', DEAL_MS + 30, random)).toBeNull();
    expect(table.phase).toBe('reveal');
    expect(viewFor(room, a, DEAL_MS + 30).table!.opponentCards.some(isHidden)).toBe(false);
    tick(room, DEAL_MS + 30 + REVEAL_MS, random);
    expect(table.phase).toBe('shooting'); expect(table.shooter).toBe(b);
    expect(act(room, a, 'pull', DEAL_MS + REVEAL_MS + 2000, random)).toBe('It is not your turn with the revolver.');
    expect(act(room, b, 'pull', DEAL_MS + REVEAL_MS + 100, random)).toBe('The revolver is still on its way to you.');
  });
  it('a pull on the bullet kills the shooter and ends the table; an empty pull deals the next hand', () => {
    const { room } = lobby(2), random = seeded(5); startGame(room, 0, 0, random);
    const table = room.tables.find(t => t.seats.includes(0))!, [a, b] = table.seats;
    for (const s of [a, b]) { room.seats[s].kind = 'human'; room.seats[s].connected = true; }
    let now = DEAL_MS; tick(room, now, random);
    table.hands[a] = [card('10'), card('9')]; table.hands[b] = [card('10'), card('5')];
    act(room, a, 'stand', now, random); act(room, b, 'stand', now, random); now += REVEAL_MS; tick(room, now, random);
    table.revolver = { bulletChamber: 2, currentChamber: 1 };
    now += GUN_SLIDE_MS; expect(act(room, b, 'pull', now, random)).toBeNull();
    expect(table.shot).toMatchObject({ seat: b, fired: false, forced: false }); expect(table.phase).toBe('result');
    now += RESULT_MS; tick(room, now, random); expect(table.phase).toBe('dealing'); expect(table.round).toBe(2);
    now += DEAL_MS; tick(room, now, random);
    table.hands[a] = [card('10'), card('5')]; table.hands[b] = [card('10'), card('9')];
    act(room, a, 'stand', now, random); act(room, b, 'stand', now, random); now += REVEAL_MS; tick(room, now, random);
    expect(table.shooter).toBe(a);
    now += GUN_SLIDE_MS + 10; act(room, a, 'pull', now, random);
    expect(table.shot).toMatchObject({ seat: a, fired: true }); expect(room.seats[a].alive).toBe(false); expect(table.winner).toBe(b);
    now += RESULT_MS; tick(room, now, random); expect(table.phase).toBe('over');
  });
  it('the Host takes the shot when the loser stalls past the trigger clock', () => {
    const { room } = lobby(2), random = seeded(9); startGame(room, 0, 0, random);
    const table = room.tables.find(t => t.seats.includes(0))!, [a, b] = table.seats;
    for (const s of [a, b]) { room.seats[s].kind = 'human'; room.seats[s].connected = true; }
    let now = DEAL_MS; tick(room, now, random);
    table.hands[a] = [card('10'), card('9')]; table.hands[b] = [card('10'), card('5')];
    act(room, a, 'stand', now, random); act(room, b, 'stand', now, random); now += REVEAL_MS; tick(room, now, random);
    table.revolver = { bulletChamber: 6, currentChamber: 1 };
    now += GUN_SLIDE_MS + ONLINE_TRIGGER_MS; tick(room, now, random);
    expect(table.shot).toMatchObject({ seat: b, forced: true, fired: false });
  });
  it('a decision clock that runs out stands for the player', () => {
    const { room } = lobby(2), random = seeded(11); startGame(room, 0, 0, random);
    const table = room.tables.find(t => t.seats.includes(0))!;
    for (const s of table.seats) { room.seats[s].kind = 'human'; room.seats[s].connected = true; }
    tick(room, DEAL_MS, random); tick(room, DEAL_MS + ONLINE_DECISION_MS, random);
    expect(table.phase === 'reveal' || table.phase === 'shooting' || table.phase === 'result').toBe(true);
  });
  it('fold ends the hand with no shot, only before a hit, three times per room', () => {
    const { room } = lobby(2), random = seeded(13); startGame(room, 0, 0, random);
    const table = room.tables.find(t => t.seats.includes(0))!, [a] = table.seats;
    for (const s of table.seats) { room.seats[s].kind = 'human'; room.seats[s].connected = true; }
    let now = DEAL_MS; tick(room, now, random);
    expect(act(room, a, 'fold', now, random)).toBeNull(); expect(table.phase).toBe('result'); expect(table.shot).toBeNull();
    expect(viewFor(room, a, now).table!.outcome).toBe('fold');
    now += RESULT_MS; tick(room, now, random); now += DEAL_MS; tick(room, now, random);
    table.hands[a] = [card('2'), card('3')]; act(room, a, 'hit', now, random);
    expect(act(room, a, 'fold', now, random)).toBe('You can only fold before you hit.');
  });
  it('spin re-loads the cylinder once per room, only for the shooter', () => {
    const { room } = lobby(2), random = seeded(17); startGame(room, 0, 0, random);
    const table = room.tables.find(t => t.seats.includes(0))!, [a, b] = table.seats;
    for (const s of [a, b]) { room.seats[s].kind = 'human'; room.seats[s].connected = true; }
    let now = DEAL_MS; tick(room, now, random);
    table.hands[a] = [card('10'), card('9')]; table.hands[b] = [card('10'), card('5')];
    act(room, a, 'stand', now, random); act(room, b, 'stand', now, random); now += REVEAL_MS; tick(room, now, random);
    now += GUN_SLIDE_MS;
    table.revolver = { bulletChamber: 3, currentChamber: 2 };
    expect(act(room, b, 'spin', now, random)).toBeNull(); expect(table.revolver.currentChamber).toBe(1);
    expect(act(room, b, 'spin', now, random)).toBe('You have already spun the cylinder in this room.');
  });
  it('both busting is a tie with no shot', () => {
    const { room } = lobby(2); startGame(room, 0, 0, seeded());
    const table = room.tables[0]; const [a, b] = table.seats;
    table.hands[a] = [card('K'), card('Q'), card('5')]; table.hands[b] = [card('K'), card('Q'), card('9')];
    expect(handWinner(table)).toBeNull();
  });
});

describe('computer guests, dropped players and the bracket', () => {
  it('computer guests play whole tables by themselves, and a dropped human is played for them', () => {
    const { room } = lobby(2), random = seeded(21); startGame(room, 0, 0, random);
    disconnect(room, 1);
    expect(room.seats[1].kind).toBe('human'); expect(room.seats[1].connected).toBe(false);
    expect(nextWakeAt(room)).toBe(DEAL_MS);
    run(room, 0, 10 * 60_000, random);
    expect(room.stage).toBe('finished');
  });
  it('eight guests become four, then two, then one survivor across three rooms', () => {
    const { room } = lobby(1), random = seeded(31); startGame(room, 0, 0, random);
    disconnect(room, 0);   // let the computer play every seat
    let now = 0; const rooms: number[] = [];
    while (room.stage === 'playing' && now < 30 * 60_000) { tick(room, now, random); if (rooms.at(-1) !== room.bracketRoom) rooms.push(room.bracketRoom); now += 250; }
    expect(rooms).toEqual([1, 2, 3]);
    expect(room.seats.filter(s => s.alive)).toHaveLength(1); expect(room.winner).toBe(room.seats.findIndex(s => s.alive));
    expect(viewFor(room, 0, now).guestsRemaining).toBe(1);
  });
  it('the next wake-up is the earliest deadline or computer move', () => {
    const { room } = lobby(2), random = seeded(41); startGame(room, 0, 1000, random);
    expect(nextWakeAt(room)).toBe(1000 + DEAL_MS);
    tick(room, 1000 + DEAL_MS, random);
    const wake = nextWakeAt(room)!;
    expect(wake).toBeGreaterThan(1000 + DEAL_MS); expect(wake).toBeLessThanOrEqual(1000 + DEAL_MS + ONLINE_DECISION_MS);
  });
});
