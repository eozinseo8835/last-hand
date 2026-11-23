/**
 * LAST HAND room server (Cloudflare Workers + Durable Objects).
 *
 *   GET  /api/new           → { code }  a fresh 4-character room code
 *   GET  /api/room/<CODE>   → WebSocket into that room (one Durable Object per code)
 *   GET  /api/queue         → WebSocket into the matchmaking queue (one global Durable Object)
 *
 * The Durable Object keeps the whole room (src/online/room.ts) and is the only place that knows
 * the deck, both hands and the bullet chamber. Every browser gets a view made for its own seat.
 */
import { act, createRoom, disconnect, joinRoom, nextWakeAt, prepareMatch, startGame, tick, viewFor, type Room } from '../../src/online/room';
import { MATCH_JOIN_WAIT_MS, cleanPlayerName, normalizeRoomCode, randomRoomCode, type ClientMessage, type QueueClientMessage, type QueueServerMessage, type ServerMessage } from '../../src/online/protocol';
import { canStartAlone, decideMatch, type Waiting } from '../../src/online/queue';
import type { DurableObjectNamespace, DurableObjectState, WebSocketWithAttachment } from './cf';

export interface Env { ROOMS: DurableObjectNamespace; MATCHMAKER: DurableObjectNamespace; ALLOWED_ORIGINS?: string }

const MAX_MESSAGE_BYTES = 1024;

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return allowed.length === 0 || allowed.some(pattern => originMatches(pattern, origin)) ? origin : null;
}
/** An allowed origin may use * for one name part, e.g. https://last-hand*.pages.dev or https://*.last-hand.pages.dev. */
export function originMatches(pattern: string, origin: string) {
  if (!pattern.includes('*')) return pattern === origin;
  const regex = new RegExp('^' + pattern.split('*').map(part => part.replace(/[.+?^${}()|[\]\\/]/g, '\\$&')).join('[a-z0-9-]*') + '$');
  return regex.test(origin);
}
function cors(origin: string | null): Record<string, string> {
  return origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' } : {};
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url), origin = allowedOrigin(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.headers.get('Origin') && !origin) return new Response('Origin not allowed', { status: 403 });
    if (url.pathname === '/api/new') {
      return Response.json({ code: randomRoomCode() }, { headers: { ...cors(origin), 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/queue') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426, headers: cors(origin) });
      return env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global')).fetch(request);
    }
    const match = url.pathname.match(/^\/api\/room\/([A-Za-z0-9]+)$/);
    if (match) {
      const code = normalizeRoomCode(match[1]);
      if (!code) return new Response('Bad room code', { status: 400, headers: cors(origin) });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426, headers: cors(origin) });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const forward = new URL(request.url); forward.searchParams.set('code', code);
      return stub.fetch(new Request(forward.toString(), request));
    }
    return new Response('LAST HAND room server', { headers: { 'Content-Type': 'text/plain' } });
  },
};

export class LastHandRoom {
  private room: Room | null = null;
  constructor(private state: DurableObjectState, private env: Env) {
    void this.env;
    // The room survives the object going to sleep between messages.
    state.blockConcurrencyWhile(async () => { this.room = (await state.storage.get<Room>('room')) ?? null; });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url), code = url.searchParams.get('code') ?? 'XXXX';
    if (url.pathname === '/init') {
      // Only the matchmaker calls this (the public routes never forward here): open a fresh room that starts by itself.
      if (this.room && this.room.stage !== 'finished' && this.room.seats.some(s => s.kind !== 'empty')) return new Response('busy', { status: 409 });
      const now = Date.now();
      this.room = createRoom(code); prepareMatch(this.room, Math.max(1, Number(url.searchParams.get('expected')) || 1), now, MATCH_JOIN_WAIT_MS);
      await this.save(); await this.state.storage.setAlarm(this.room.autoStartAt!);
      return new Response('ok');
    }
    if (!this.room) { this.room = createRoom(code); await this.save(); }
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocketWithAttachment, data: string | ArrayBuffer) {
    if (!this.room) return;
    if (typeof data !== 'string' || data.length > MAX_MESSAGE_BYTES) return;
    let message: ClientMessage;
    try { message = JSON.parse(data); } catch { return; }
    const now = Date.now(), seat = (ws.deserializeAttachment() as { seat?: number } | null)?.seat;
    const send = (m: ServerMessage) => { try { ws.send(JSON.stringify(m)); } catch { /* closed */ } };
    const room = this.room;
    if (message.t === 'join') {
      const joined = joinRoom(room, message.name, typeof message.token === 'string' ? message.token : undefined, () => crypto.randomUUID());
      if ('error' in joined) { send({ t: 'error', message: joined.error }); return; }
      ws.serializeAttachment({ seat: joined.seat });
      send({ t: 'welcome', seat: joined.seat, token: joined.token, code: room.code });
    } else if (seat === undefined) {
      send({ t: 'error', message: 'Join the room first.' }); return;
    } else if (message.t === 'start') {
      const error = startGame(room, seat, now, Math.random); if (error) send({ t: 'error', message: error });
    } else if (message.t === 'act') {
      tick(room, now, Math.random);
      const error = act(room, seat, message.action, now, Math.random); if (error) send({ t: 'error', message: error });
    } else if (message.t === 'leave') {
      disconnect(room, seat); ws.serializeAttachment({}); ws.close(1000, 'left');
    }
    await this.settle(now);
  }

  async webSocketClose(ws: WebSocketWithAttachment) { await this.dropped(ws); }
  async webSocketError(ws: WebSocketWithAttachment) { await this.dropped(ws); }

  private async dropped(ws: WebSocketWithAttachment) {
    if (!this.room) return;
    const seat = (ws.deserializeAttachment() as { seat?: number } | null)?.seat;
    if (seat === undefined) return;
    // Another tab of the same player may still be connected to that seat.
    const stillHere = this.state.getWebSockets().some(other => other !== ws && (other.deserializeAttachment() as { seat?: number } | null)?.seat === seat);
    if (!stillHere) disconnect(this.room, seat);
    await this.settle(Date.now());
  }

  async alarm() { await this.settle(Date.now()); }

  /** Advance the clock, save, wake up again when something is due, and send everyone their view. */
  private async settle(now: number) {
    const room = this.room!; tick(room, now, Math.random);
    await this.save();
    const wake = nextWakeAt(room);
    if (wake !== null) await this.state.storage.setAlarm(Math.max(now + 50, wake)); else await this.state.storage.deleteAlarm();
    for (const ws of this.state.getWebSockets()) {
      const seat = (ws.deserializeAttachment() as { seat?: number } | null)?.seat;
      if (seat === undefined) continue;
      try { ws.send(JSON.stringify({ t: 'state', view: viewFor(room, seat, now) } satisfies ServerMessage)); } catch { /* closed */ }
    }
  }
  private save() { return this.state.storage.put('room', this.room); }
}

type QueueAttachment = Waiting | Record<string, never>;
/** The matchmaking queue: one object for everyone. Each waiting player is a socket; its attachment holds their place. */
export class Matchmaker {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(): Promise<Response> {
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocketWithAttachment, data: string | ArrayBuffer) {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE_BYTES) return;
    let message: QueueClientMessage; try { message = JSON.parse(data); } catch { return; }
    const now = Date.now(), place = ws.deserializeAttachment() as QueueAttachment | null;
    if (message.t === 'queue' && !(place && 'id' in place)) ws.serializeAttachment({ id: crypto.randomUUID(), name: cleanPlayerName(message.name, 'GUEST'), since: now } satisfies Waiting);
    else if (message.t === 'start-now' && place && 'id' in place) {
      const waiting = this.waiting();
      if (waiting.length > 1 || canStartAlone(waiting.map(w => w.place), place as Waiting, now)) ws.serializeAttachment({ ...(place as Waiting), startNow: true });
    } else if (message.t === 'cancel') { ws.serializeAttachment({}); ws.close(1000, 'cancelled'); }
    await this.settle(now);
  }
  async webSocketClose(ws: WebSocketWithAttachment) { ws.serializeAttachment({}); await this.settle(Date.now()); }
  async webSocketError(ws: WebSocketWithAttachment) { ws.serializeAttachment({}); await this.settle(Date.now()); }
  async alarm() { await this.settle(Date.now()); }

  private waiting() {
    return this.state.getWebSockets().map(ws => ({ ws, place: ws.deserializeAttachment() as Waiting | null })).filter((w): w is { ws: WebSocketWithAttachment; place: Waiting } => !!w.place && 'id' in w.place);
  }

  /** Match whoever should leave together, tell everyone else how the queue looks, and check again in a second. */
  private async settle(now: number) {
    let waiting = this.waiting();
    const group = decideMatch(waiting.map(w => w.place), now);
    if (group) {
      const code = await this.openRoom(group.length);
      if (code) {
        for (const member of group) {
          const entry = waiting.find(w => w.place.id === member.id)!;
          send(entry.ws, { t: 'matched', code }); entry.ws.serializeAttachment({}); try { entry.ws.close(1000, 'matched'); } catch { /* gone */ }
        }
        waiting = this.waiting();
      }
    }
    const places = waiting.map(w => w.place);
    for (const w of waiting) send(w.ws, { t: 'waiting', players: waiting.length, since: w.place.since, serverNow: now, canStartAlone: canStartAlone(places, w.place, now) });
    if (waiting.length) await this.state.storage.setAlarm(now + 1000); else await this.state.storage.deleteAlarm();
  }

  private async openRoom(expected: number): Promise<string | null> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = randomRoomCode();
      const response = await this.env.ROOMS.get(this.env.ROOMS.idFromName(code)).fetch(new Request(`https://room/init?code=${code}&expected=${expected}`, { method: 'POST' }));
      if (response.ok) return code;
    }
    return null;
  }
}
function send(ws: WebSocket, message: QueueServerMessage) { try { ws.send(JSON.stringify(message)); } catch { /* closed */ } }
