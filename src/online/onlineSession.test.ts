import { describe, expect, it } from 'vitest';
import { buildSession } from './useOnlineGame';
import { createRoom, joinRoom, startGame, tick, viewFor, act } from './room';
import { DEAL_CARD_MS, GUN_SLIDE_MS, REVEAL_MS, SHUFFLE_MS, DEAL_MS, ONLINE_TRIGGER_MS, FORCED_SHOT_MS, TRIGGER_HOLD_MS } from './protocol';
import type { Card } from '../game';

function seeded(seed = 7) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const card = (rank: string): Card => ({ rank, suit: 'hearts', id: `${rank}${Math.random()}` });
const extra = { speech: null, log: [], reaction: null, opponentName: 'GUEST 02', shooting: false, spinBusy: false, gunArriving: false };
const idle = { held: false, progress: 0, heldAt: null, pulled: false };
function setup() {
  let n = 0; const room = createRoom('ABCD'), random = seeded(3);
  joinRoom(room, 'Me', undefined, () => `t${++n}`); joinRoom(room, 'You', undefined, () => `t${++n}`);
  startGame(room, 0, 0, random);
  const table = room.tables.find(t => t.seats.includes(0))!;
  for (const s of table.seats) { room.seats[s].kind = 'human'; room.seats[s].connected = true; }
  const session = (now: number, local = idle, more = {}) => { const v = viewFor(room, 0, now); return buildSession(v, v.table, 0, local, now, { ...extra, ...more }); };
  return { room, table, random, session, me: 0, other: table.seats.find(s => s !== 0)! };
}

describe('online play in the story-mode HUD', () => {
  it('stages the deal like story mode: shuffle, four cards one by one, then the hole-card check', () => {
    const { session } = setup();
    expect(session(100).phase).toBe('SHUFFLING'); expect(session(100).round).toMatchObject({ player: [], ai: [] });
    const first = session(SHUFFLE_MS + 10); expect(first.phase).toBe('DEALING'); expect(first.round!.player).toHaveLength(1); expect(first.round!.ai).toHaveLength(0);
    const third = session(SHUFFLE_MS + 2 * DEAL_CARD_MS + 10); expect(third.round!.player).toHaveLength(2); expect(third.round!.ai).toHaveLength(1);
    expect(session(SHUFFLE_MS + 4 * DEAL_CARD_MS + 10).phase).toBe('PEEKING');
  });
  it("the opponent's hidden card is a face-down stand-in, and the decision clock stops once you stand", () => {
    const { room, random, session, me } = setup();
    tick(room, DEAL_MS, random);
    const deciding = session(DEAL_MS);
    expect(deciding.phase).toBe('PLAYER_DECISION'); expect(deciding.revealed).toBe(false); expect(deciding.decisionDeadline).not.toBeNull();
    act(room, me, 'stand', DEAL_MS + 10, random);
    expect(session(DEAL_MS + 20).decisionDeadline).toBeNull();
  });
  it('your shot: the revolver slides over first, then the trigger waits; the Host stages a forced shot', () => {
    const { room, table, random, session, me, other } = setup();
    let now = DEAL_MS; tick(room, now, random);
    table.hands[me] = [card('10'), card('5')]; table.hands[other] = [card('10'), card('9')];
    act(room, me, 'stand', now, random); act(room, other, 'stand', now, random); now += REVEAL_MS; tick(room, now, random);
    const sliding = session(now, idle, { gunArriving: true });
    expect(sliding.phase).toBe('PLAYER_SHOOTING'); expect(sliding.gunTransfer).toMatchObject({ stage: 'to-shooter', side: 'player' }); expect(sliding.awaitingTrigger).toBe(false);
    const ready = session(now + GUN_SLIDE_MS); expect(ready.gunTransfer).toBeNull(); expect(ready.awaitingTrigger).toBe(true);
    now += GUN_SLIDE_MS + ONLINE_TRIGGER_MS; tick(room, now, random);
    const forced = session(now); expect(forced.phase).toBe('HOST_FORCE_SHOT'); expect(forced.forceTarget).toBe('player'); expect(forced.forceShotAt).toBe(now);
    now += FORCED_SHOT_MS; tick(room, now, random);
    const after = session(now); expect(after.phase).toBe('ROUND_RESULT'); expect(after.shotEffect).not.toBeNull();
  });
  it("the opponent's raise follows their held trigger, and an empty click pushes the revolver back", () => {
    const { room, table, random, session, me, other } = setup();
    let now = DEAL_MS; tick(room, now, random);
    table.hands[me] = [card('10'), card('9')]; table.hands[other] = [card('10'), card('5')];
    act(room, me, 'stand', now, random); act(room, other, 'stand', now, random); now += REVEAL_MS; tick(room, now, random);
    now += GUN_SLIDE_MS; table.revolver = { bulletChamber: 6, currentChamber: 1 };
    act(room, other, 'hold', now, random);
    expect(session(now + 100)).toMatchObject({ phase: 'AI_SHOOTING', aiShotStartedAt: now, aiShotDurationMs: TRIGGER_HOLD_MS });
    act(room, other, 'pull', now + TRIGGER_HOLD_MS, random);
    const click = session(now + TRIGGER_HOLD_MS + 400);
    expect(click.shotEffect).toBe('click'); expect(click.gunTransfer).toMatchObject({ stage: 'return', side: 'ai' });
  });
});
