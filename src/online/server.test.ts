import { describe, expect, it } from 'vitest';
import { LastHandRoom } from '../../server/src/worker';
import type { RoomView, ServerMessage } from './protocol';

/** A stand-in for the Durable Object runtime: storage, alarms and hibernatable sockets. */
function fakeState() {
  const store = new Map<string, unknown>(); let alarm: number | null = null;
  const sockets: FakeSocket[] = [];
  return {
    sockets, get alarm() { return alarm; },
    storage: { get: async (k: string) => store.get(k), put: async (k: string, v: unknown) => { store.set(k, JSON.parse(JSON.stringify(v))); },
      setAlarm: async (t: number) => { alarm = t; }, deleteAlarm: async () => { alarm = null; } },
    blockConcurrencyWhile: async (fn: () => Promise<void>) => { await fn(); },
    acceptWebSocket: (ws: FakeSocket) => { sockets.push(ws); },
    getWebSockets: () => sockets.filter(s => !s.closed),
  };
}
class FakeSocket {
  sent: ServerMessage[] = []; closed = false; private attachment: unknown = null;
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
  serializeAttachment(v: unknown) { this.attachment = v; }
  deserializeAttachment() { return this.attachment; }
  last<T extends ServerMessage['t']>(t: T) { return [...this.sent].reverse().find(m => m.t === t) as Extract<ServerMessage, { t: T }> | undefined; }
  view(): RoomView { return this.last('state')!.view; }
}
async function setup() {
  const state = fakeState();
  const room = new LastHandRoom(state as never, {} as never);
  await Promise.resolve();
  // Open the room the way fetch() would, without a real WebSocketPair.
  (room as unknown as { room: unknown }).room = (await import('./room')).createRoom('KQ7X');
  const connect = () => { const ws = new FakeSocket(); state.acceptWebSocket(ws); return ws; };
  const say = (ws: FakeSocket, message: unknown) => room.webSocketMessage(ws as never, JSON.stringify(message));
  return { state, room, connect, say };
}

describe('room server', () => {
  it('welcomes each player with a seat and a rejoin token, and sends everyone the lobby', async () => {
    const { connect, say } = await setup();
    const a = connect(), b = connect();
    await say(a, { t: 'join', name: 'Austin' }); await say(b, { t: 'join', name: 'Minji' });
    expect(a.last('welcome')).toMatchObject({ seat: 0, code: 'KQ7X' }); expect(b.last('welcome')).toMatchObject({ seat: 1 });
    expect(a.view().seats.filter(s => s.kind === 'human').map(s => s.name)).toEqual(['Austin', 'Minji']);
    expect(a.view().seats[0].host).toBe(true);
  });
  it('refuses actions before joining, ignores junk, and only the host can start', async () => {
    const { connect, say, room } = await setup();
    const a = connect(), b = connect();
    await say(a, { t: 'start' }); expect(a.last('error')?.message).toBe('Join the room first.');
    await room.webSocketMessage(a as never, 'not json'); await room.webSocketMessage(a as never, 'x'.repeat(5000));
    await say(a, { t: 'join', name: 'A' }); await say(b, { t: 'join', name: 'B' });
    await say(b, { t: 'start' }); expect(b.last('error')?.message).toBe('Only the host can start the game.');
    await say(a, { t: 'start' });
    expect(a.view().stage).toBe('playing'); expect(a.view().table).not.toBeNull();
  });
  it('sets an alarm for the next deadline once the game runs, and each player only sees their own cards', async () => {
    const { connect, say, state } = await setup();
    const a = connect(), b = connect();
    await say(a, { t: 'join', name: 'A' }); await say(b, { t: 'join', name: 'B' }); await say(a, { t: 'start' });
    expect(state.alarm).not.toBeNull();
    const va = a.view(), vb = b.view();
    if (va.table!.opponent === 1) {   // seated together: each sees the other's hidden card as hidden
      expect(va.table!.opponentCards.filter(c => 'hidden' in c)).toHaveLength(1);
      expect(vb.table!.myCards[1].id).toBe(va.table!.opponentCards[1].id);
    }
    expect(JSON.stringify(a.sent)).not.toContain('bulletChamber');
  });
  it('a closed connection hands the seat to the computer and a token brings the player back', async () => {
    const { connect, say, room } = await setup();
    const a = connect(), b = connect();
    await say(a, { t: 'join', name: 'A' }); await say(b, { t: 'join', name: 'B' }); await say(a, { t: 'start' });
    const token = b.last('welcome')!.token;
    b.closed = true; await room.webSocketClose(b as never);
    expect(a.view().seats[1].connected).toBe(false);
    const b2 = connect(); await say(b2, { t: 'join', name: 'B', token });
    expect(b2.last('welcome')?.seat).toBe(1); expect(a.view().seats[1].connected).toBe(true);
  });
});

describe('allowed sites', () => {
  it('accepts the game on Cloudflare Pages and its preview links, and nothing else', async () => {
    const { originMatches } = await import('../../server/src/worker');
    expect(originMatches('https://last-hand*.pages.dev', 'https://last-hand.pages.dev')).toBe(true);
    expect(originMatches('https://last-hand*.pages.dev', 'https://last-hand-3xk.pages.dev')).toBe(true);
    expect(originMatches('https://*.last-hand*.pages.dev', 'https://a1b2c3.last-hand.pages.dev')).toBe(true);
    expect(originMatches('https://last-hand*.pages.dev', 'https://evil.pages.dev')).toBe(false);
    expect(originMatches('https://last-hand*.pages.dev', 'https://last-hand.pages.dev.evil.com')).toBe(false);
    expect(originMatches('https://*.last-hand*.pages.dev', 'https://x.y.last-hand.pages.dev')).toBe(false);
    expect(originMatches('http://localhost:5173', 'http://localhost:5173')).toBe(true);
  });
});
