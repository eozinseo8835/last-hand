/**
 * The few Cloudflare Workers types this server uses, declared here so the project needs no extra type package.
 * (WebSocketPair and the `webSocket` response option exist at runtime in Workers.)
 */
export interface WebSocketWithAttachment extends WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
export interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  setAlarm(time: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}
export interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile(fn: () => Promise<void>): Promise<void>;
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(): WebSocketWithAttachment[];
}
export interface DurableObjectStub { fetch(request: Request): Promise<Response> }
export interface DurableObjectNamespace { idFromName(name: string): unknown; get(id: unknown): DurableObjectStub }
declare global {
  const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } };
  interface ResponseInit { webSocket?: WebSocket }
}
