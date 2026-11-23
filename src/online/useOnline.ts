/**
 * The browser side of an online room: one WebSocket to the room server, the latest view for this seat,
 * and automatic rejoin (same seat) if the connection drops.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeRoomCode, type Action, type ClientMessage, type RoomView, type ServerMessage } from './protocol';

/** Set at build time in .env.production as VITE_SERVER_URL, e.g. https://last-hand-server.<you>.workers.dev */
export const SERVER_URL: string = (import.meta.env?.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const onlineAvailable = () => SERVER_URL.startsWith('https://') || SERVER_URL.startsWith('http://localhost') || SERVER_URL.startsWith('http://127.0.0.1');

export type OnlineStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
export type OnlineState = { status: OnlineStatus; code: string | null; view: RoomView | null; error: string | null; clockOffset: number };

const tokenKey = (code: string) => `last-hand-seat-${code}`;
function readToken(code: string) { try { return sessionStorage.getItem(tokenKey(code)) ?? undefined; } catch { return undefined; } }
function saveToken(code: string, token: string) { try { sessionStorage.setItem(tokenKey(code), token); } catch { /* private mode */ } }

export function useOnline(playerName: string) {
  const [state, setState] = useState<OnlineState>({ status: 'idle', code: null, view: null, error: null, clockOffset: 0 });
  const socket = useRef<WebSocket | null>(null), wanted = useRef<string | null>(null), retries = useRef(0), retryTimer = useRef<number | null>(null);
  const nameRef = useRef(playerName); nameRef.current = playerName;

  const send = useCallback((message: ClientMessage) => {
    const ws = socket.current; if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  const open = useCallback((code: string) => {
    wanted.current = code;
    const url = `${SERVER_URL.replace(/^http/, 'ws')}/api/room/${code}`;
    setState(s => ({ ...s, status: retries.current ? 'reconnecting' : 'connecting', code, error: null }));
    const ws = new WebSocket(url); socket.current = ws;
    ws.onopen = () => { retries.current = 0; ws.send(JSON.stringify({ t: 'join', name: nameRef.current, token: readToken(code) } satisfies ClientMessage)); };
    ws.onmessage = event => {
      let message: ServerMessage; try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.t === 'welcome') { saveToken(code, message.token); setState(s => ({ ...s, status: 'open' })); }
      else if (message.t === 'state') setState(s => ({ ...s, status: 'open', view: message.view, clockOffset: message.view.serverNow - Date.now() }));
      else if (message.t === 'error') setState(s => ({ ...s, error: message.message }));
    };
    ws.onclose = () => {
      if (socket.current !== ws) return;
      socket.current = null;
      if (wanted.current !== code || retries.current >= 6) { setState(s => ({ ...s, status: 'closed' })); return; }
      retries.current++;
      setState(s => ({ ...s, status: 'reconnecting' }));
      retryTimer.current = window.setTimeout(() => open(code), Math.min(8000, 600 * 2 ** retries.current));
    };
  }, []);

  /** Ask the server for a fresh room code, then open it. */
  const create = useCallback(async () => {
    setState(s => ({ ...s, status: 'connecting', error: null }));
    try {
      const response = await fetch(`${SERVER_URL}/api/new`, { cache: 'no-store' });
      const { code } = await response.json() as { code: string };
      const valid = normalizeRoomCode(code); if (!valid) throw new Error('bad code');
      retries.current = 0; open(valid);
    } catch { setState(s => ({ ...s, status: 'idle', error: 'Could not reach the server. Check your connection and try again.' })); }
  }, [open]);

  const join = useCallback((raw: string) => {
    const code = normalizeRoomCode(raw);
    if (!code) { setState(s => ({ ...s, error: 'Room codes are 4 letters or numbers.' })); return; }
    retries.current = 0; open(code);
  }, [open]);

  const leave = useCallback(() => {
    wanted.current = null; if (retryTimer.current) clearTimeout(retryTimer.current);
    send({ t: 'leave' }); socket.current?.close(); socket.current = null;
    setState({ status: 'idle', code: null, view: null, error: null, clockOffset: 0 });
  }, [send]);

  const start = useCallback(() => send({ t: 'start' }), [send]);
  const act = useCallback((action: Action) => send({ t: 'act', action }), [send]);
  const clearError = useCallback(() => setState(s => ({ ...s, error: null })), []);

  useEffect(() => () => { wanted.current = null; if (retryTimer.current) clearTimeout(retryTimer.current); socket.current?.close(); }, []);
  return { ...state, create, join, leave, start, act, clearError };
}
