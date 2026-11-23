/**
 * Turns the server's view of your table into the same props the story-mode 3D scene uses, with the same staging:
 * the revolver slides to the loser, is raised during a held trigger, spins, is set down and pushed back after a click,
 * and the Host steps in for a shooter who stalls. You are always "the player"; your opponent sits in the captive's chair.
 */
import type { Card } from '../game';
import type { SceneProps } from '../Scene';
import { GUN_SET_DOWN_MS } from '../gunTransfer';
import { GUN_SLIDE_MS, SPIN_MS, isHidden, type RoomView, type ViewCard } from './protocol';

/** A face-down stand-in: the scene never draws a face for a card it has not been told to reveal. */
const faceDown = (card: ViewCard): Card => (isHidden(card) ? { suit: 'spades', rank: '?', id: card.id } : card);

export type LocalTrigger = { held: boolean; progress: number };
type Props = Omit<SceneProps, 'recenterToken'>;

export function onlineSceneProps(view: RoomView | null, clockOffset: number, local: LocalTrigger, now = Date.now()): Props {
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
  /** Server time → this browser's clock. */
  const local2 = (serverTime: number) => serverTime - clockOffset;
  const startedAt = local2(t.phaseStartedAt);
  const round = { player: t.myCards, ai: t.opponentCards.map(faceDown), deck: [] };
  const roundNumber = view.bracketRoom * 1000 + t.id * 100 + t.round;
  const chambersFired = Math.max(0, t.currentChamber - 1);
  const shooterSide = t.shooter === null ? null : t.shooter === t.me ? 'player' as const : 'ai' as const;
  const common = { ...base, round, roundNumber, chambersFired, danger: t.currentChamber >= 4 };
  const spinActive = t.spin && now < local2(t.spin.at) + SPIN_MS;
  const spinning = spinActive ? (t.spin!.seat === t.me ? 'player' as const : 'ai' as const) : null;
  const spinSerial = t.spin ? t.spin.at : 0;
  const slide = (side: 'player' | 'ai') => now < startedAt + GUN_SLIDE_MS
    ? { stage: 'to-shooter' as const, side, owner: side, startedAt, duration: GUN_SLIDE_MS } : null;
  switch (t.phase) {
    case 'dealing': return { ...common, phase: 'DEALING' };
    case 'deciding': return { ...common, phase: 'PLAYER_DECISION' };
    case 'reveal': return { ...common, phase: 'REVEAL', revealed: true, suspense: true };
    case 'shooting': {
      if (shooterSide === 'player') {
        return { ...common, phase: 'PLAYER_SHOOTING', revealed: true, suspense: true, gunTransfer: slide('player'),
          triggerHeld: local.held, triggerProgress: local.progress, spinning, spinSerial };
      }
      // The opponent's raise to the temple follows their real trigger hold (or a computer guest's hesitation).
      const hold = t.hold && t.hold.seat !== t.me ? t.hold : null;
      return { ...common, phase: 'AI_SHOOTING', revealed: true, suspense: true, gunTransfer: slide('ai'), spinning, spinSerial,
        aiShotStartedAt: hold ? local2(hold.startedAt) : null, aiShotDurationMs: hold ? hold.duration : undefined };
    }
    case 'forced':
      return { ...common, phase: 'HOST_FORCE_SHOT', revealed: true, suspense: true,
        forceShotAt: t.forcedAt !== null ? local2(t.forcedAt) : startedAt, forceTarget: shooterSide ?? 'player' };
    case 'result': case 'over': {
      const shot = t.shot;
      const dead = shot?.fired ? (shot.seat === t.me ? 'player' as const : 'ai' as const) : null;
      // After a click (or the Host's shot) the revolver is set down and pushed back to the middle, as in story mode.
      const returnAt = shot ? local2(shot.at) + GUN_SET_DOWN_MS : 0;
      const side = shot ? (shot.seat === t.me ? 'player' as const : 'ai' as const) : null;
      const gunTransfer = shot && side && (!shot.fired || shot.forced) && now >= returnAt && now < returnAt + GUN_SLIDE_MS
        ? { stage: 'return' as const, side, owner: shot.forced ? 'host' as const : side, startedAt: returnAt, duration: GUN_SLIDE_MS } : null;
      return { ...common, phase: 'ROUND_RESULT', revealed: t.outcome !== 'fold', shotEffect: shot ? (shot.fired ? 'shot' : 'click') : null, dead,
        triggerProgress: shot && side === 'player' && !shot.forced ? 1 : 0, gunTransfer,
        forceShotAt: shot?.forced && t.forcedAt !== null ? local2(t.forcedAt) : null, forceTarget: shot?.forced ? side : null };
    }
  }
}
