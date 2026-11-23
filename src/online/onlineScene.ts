/**
 * Turns the server's view of your table into the same props the story-mode 3D scene already understands:
 * you are always "the player", your opponent sits in the captive's chair.
 */
import type { Card } from '../game';
import type { SceneProps } from '../Scene';
import { GUN_SLIDE_MS, isHidden, type RoomView, type ViewCard } from './protocol';

/** A face-down stand-in: the scene never draws a face for a card it has not been told to reveal. */
const faceDown = (card: ViewCard): Card => (isHidden(card) ? { suit: 'spades', rank: '?', id: card.id } : card);

export type LocalTrigger = { held: boolean; progress: number; spinningUntil: number; spinSerial: number };

export function onlineSceneProps(view: RoomView | null, clockOffset: number, local: LocalTrigger, now = Date.now()): Omit<SceneProps, 'recenterToken'> {
  const base = {
    round: null, roundNumber: 0, revealed: false, suspense: false, dead: null, shotEffect: null, danger: false,
    roomNumber: (Math.min(3, Math.max(1, view?.bracketRoom ?? 1)) as 1 | 2 | 3), guestsRemaining: view?.guestsRemaining ?? 8,
    storyStage: 'table', cinematic: null, tiesCut: { player: true, ai: true },
  } as const;
  const t = view?.table;
  if (!view || view.stage === 'lobby' || !t) {
    const out = view?.stage === 'playing' || view?.stage === 'finished';
    const meAlive = view ? view.seats[view.you]?.alive : true;
    return { ...base, phase: view?.stage === 'lobby' || !view ? 'START' : 'SHUFFLING', dead: out && !meAlive ? 'player' : null };
  }
  const local2server = (serverTime: number) => serverTime - clockOffset;
  const startedAt = local2server(t.phaseStartedAt), age = now - startedAt;
  const round = { player: t.myCards, ai: t.opponentCards.map(faceDown), deck: [] };
  const roundNumber = view.bracketRoom * 1000 + t.id * 100 + t.round;
  const chambersFired = Math.max(0, t.currentChamber - 1);
  const common = { ...base, round, roundNumber, chambersFired, danger: t.currentChamber >= 4 };
  const spinning = now < local.spinningUntil ? 'player' as const : null;
  switch (t.phase) {
    case 'dealing': return { ...common, phase: 'DEALING' };
    case 'deciding': return { ...common, phase: 'PLAYER_DECISION' };
    case 'reveal': return { ...common, phase: 'REVEAL', revealed: true, suspense: true };
    case 'shooting': {
      const mine = t.shooter === t.me;
      const gunTransfer = age < GUN_SLIDE_MS ? { stage: 'to-shooter' as const, side: mine ? 'player' as const : 'ai' as const, owner: mine ? 'player' as const : 'ai' as const, startedAt, duration: GUN_SLIDE_MS } : null;
      return mine
        ? { ...common, phase: 'PLAYER_SHOOTING', revealed: true, suspense: true, gunTransfer, triggerHeld: local.held, triggerProgress: local.progress, spinning, spinSerial: local.spinSerial }
        : { ...common, phase: 'AI_SHOOTING', revealed: true, suspense: true, gunTransfer, aiShotStartedAt: startedAt + GUN_SLIDE_MS, aiShotDurationMs: Math.max(2500, t.phaseEndsAt - t.phaseStartedAt - GUN_SLIDE_MS) };
    }
    case 'result': case 'over': {
      const shot = t.shot;
      const dead = shot?.fired ? (shot.seat === t.me ? 'player' as const : 'ai' as const) : null;
      return { ...common, phase: 'ROUND_RESULT', revealed: t.outcome !== 'fold', shotEffect: shot ? (shot.fired ? 'shot' : 'click') : null, dead };
    }
  }
}
