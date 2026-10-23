import { useEffect, useRef, useState } from 'react';
import { CONFIG, compareHands, createRevolver, dealRound, drawCard, fireRevolver, handScore, handTotal } from './game';
import type { Card, GamePhase, HandWinner, Revolver, Round } from './game';
import { chooseDialogue, roundDialogueCategory } from './dialogue';
import type { DialogueCategory } from './dialogue';
import { tableAudio } from './audio';
import { breakdownCategory, chooseRoundEvent, chooseTell, cosmeticRandom, freshAbilities } from './tension';
import type { AbilityState, EventPlan, OpponentTell, RoundEvent, Side } from './tension';

export type Session = {
  phase: GamePhase; round: Round | null; roundNumber: number; folds: number;
  revolver: Revolver; dialogue: string; dialogueCategory: DialogueCategory; dialogueDanger: boolean;
  dialogueChambersFired: number; revealed: boolean; result: HandWinner | null;
  message: string; suspense: boolean; awaitingTrigger: boolean; hasHit: boolean;
  dead: Side | null; shotEffect: 'click' | 'shot' | null;
  abilities: AbilityState; tell: OpponentTell | null;
  triggerHeld: boolean; triggerProgress: number;
  spinning: Side | null; spinSerial: number;
  peekActor: Side | null; peekSerial: number; peekedCard: Card | null;
  event: RoundEvent | null;
};
const initial = (): Session => ({
  phase: 'START', round: null, roundNumber: 0, folds: CONFIG.MAX_FOLDS,
  revolver: createRevolver(), dialogue: chooseDialogue('intro'), dialogueCategory: 'intro', dialogueDanger: false,
  dialogueChambersFired: 0, revealed: false, result: null,
  message: '', suspense: false, awaitingTrigger: false, hasHit: false, dead: null, shotEffect: null,
  abilities: freshAbilities(), tell: null, triggerHeld: false, triggerProgress: 0,
  spinning: null, spinSerial: 0, peekActor: null, peekSerial: 0, peekedCard: null, event: null,
});
type Timer = ReturnType<typeof setTimeout>;

/** The state machine owns gameplay and cancelable time; the scene only presents its public state. */
export function useGame() {
  const [game, setGame] = useState<Session>(initial);
  const current = useRef(game), mounted = useRef(true);
  const timers = useRef(new Set<Timer>()), holdTimers = useRef(new Set<Timer>()), drainTimers = useRef(new Set<Timer>());
  const eventStart = useRef<Timer | null>(null), eventEnd = useRef<Timer | null>(null), impatient = useRef<Timer | null>(null);
  const pendingEvent = useRef<EventPlan | null>(null), eventUsed = useRef(false);

  function cancel(timer: Timer | null) {
    if (timer === null) return;
    clearTimeout(timer); timers.current.delete(timer); holdTimers.current.delete(timer); drainTimers.current.delete(timer);
  }
  function clearGroup(group: Set<Timer>) { group.forEach(cancel); group.clear(); }
  function update(patch: Partial<Session>) {
    const phase = patch.phase ?? current.current.phase;
    if (phase !== 'PLAYER_DECISION') {
      cancel(eventStart.current); cancel(eventEnd.current);
      eventStart.current = eventEnd.current = null;
      patch.event = null;
    }
    current.current = { ...current.current, ...patch };
    if (mounted.current) setGame(current.current);
  }
  function later(callback: () => void, delay: number, group?: Set<Timer>) {
    if (!mounted.current) return null;
    const timer = setTimeout(() => {
      timers.current.delete(timer); group?.delete(timer);
      if (mounted.current) callback();
    }, delay);
    timers.current.add(timer); group?.add(timer);
    return timer;
  }
  function clearTimers() {
    timers.current.forEach(clearTimeout); timers.current.clear(); holdTimers.current.clear(); drainTimers.current.clear();
    eventStart.current = eventEnd.current = impatient.current = null;
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimers(); };
  }, []);

  function say(requested: DialogueCategory) {
    const fired = Math.max(0, current.current.revolver.currentChamber - 1);
    const category = breakdownCategory(requested, fired);
    update({ dialogue: chooseDialogue(category, current.current.dialogue), dialogueCategory: category,
      dialogueDanger: current.current.revolver.currentChamber >= CONFIG.DANGER_CHAMBER, dialogueChambersFired: fired });
  }
  function enterDecision(message: string) {
    update({ phase: 'PLAYER_DECISION', message });
    if (!pendingEvent.current || eventUsed.current || eventStart.current !== null) return;
    const roundNumber = current.current.roundNumber;
    eventStart.current = later(() => {
      eventStart.current = null;
      if (current.current.phase !== 'PLAYER_DECISION' || current.current.roundNumber !== roundNumber || eventUsed.current || !pendingEvent.current) return;
      const event: RoundEvent = { ...pendingEvent.current, startedAt: Date.now() };
      eventUsed.current = true;
      update({ event });
      eventEnd.current = later(() => {
        eventEnd.current = null;
        if (current.current.event === event) update({ event: null });
      }, event.duration);
    }, 1200);
  }

  function nextRound() {
    const opening = dealRound();
    const deck = [opening.player[0], opening.ai[0], opening.player[1], opening.ai[1], ...opening.deck];
    pendingEvent.current = chooseRoundEvent(); eventUsed.current = false;
    cancel(impatient.current); impatient.current = null;
    update({ round: { player: [], ai: [], deck }, roundNumber: current.current.roundNumber + 1,
      phase: 'SHUFFLING', revealed: false, result: null, message: 'The Stranger shuffles.',
      suspense: false, awaitingTrigger: false, hasHit: false, shotEffect: null,
      triggerHeld: false, triggerProgress: 0, spinning: null, peekActor: null, peekedCard: null,
      tell: chooseTell(handTotal(opening.ai)) });
    const order = ['player', 'ai', 'player', 'ai'] as const;
    function dealOpening(index: number) {
      if (index === order.length) {
        update({ phase: 'PEEKING', message: 'The Stranger checks the hole card.' });
        later(() => {
          say(roundDialogueCategory(handTotal(current.current.round!.ai), current.current.revolver.currentChamber));
          enterDecision('Your move. Hit, stand, or fold.');
        }, 600);
        return;
      }
      update({ phase: 'DEALING', round: drawCard(current.current.round!, order[index]), message: 'Dealing a fresh hand…' });
      tableAudio.play('card');
      later(() => dealOpening(index + 1), CONFIG.DEAL_SPEED);
    }
    later(() => dealOpening(0), 500);
  }
  function sweep() {
    cancel(impatient.current); impatient.current = null;
    clearGroup(holdTimers.current); clearGroup(drainTimers.current);
    update({ phase: 'SWEEPING', suspense: false, awaitingTrigger: false, triggerHeld: false, triggerProgress: 0, peekActor: null, peekedCard: null });
    later(nextRound, 700);
  }
  function start() {
    clearTimers(); tableAudio.init();
    const fresh = initial(); current.current = fresh; setGame(fresh); nextRound();
  }
  function fold() {
    const state = current.current;
    if (state.phase !== 'PLAYER_DECISION' || state.hasHit || state.folds <= 0) return;
    update({ folds: state.folds - 1, message: 'You folded. The chamber waits.', peekActor: null, peekedCard: null });
    say('player_folds'); sweep();
  }

  function resolveShot(shooter: Side) {
    cancel(impatient.current); impatient.current = null;
    clearGroup(holdTimers.current); clearGroup(drainTimers.current);
    const fired = fireRevolver(current.current.revolver);
    update({ revolver: fired.revolver, suspense: false, awaitingTrigger: false, triggerHeld: false,
      triggerProgress: shooter === 'player' ? 1 : 0, spinning: null,
      shotEffect: fired.fired ? 'shot' : 'click', phase: 'ROUND_RESULT', dead: fired.fired ? shooter : null,
      message: fired.fired ? '' : 'Click. An empty chamber.' });
    tableAudio.play(fired.fired ? 'shot' : 'click');
    if (fired.fired) later(() => update({ phase: 'GAME_OVER' }), 2400);
    else {
      later(() => say(current.current.revolver.currentChamber >= CONFIG.DANGER_CHAMBER ? 'danger' : shooter === 'ai' ? 'ai_survives_click' : 'player_survives_click'), 1000);
      later(sweep, 3400);
    }
  }
  function scheduleImpatient(delay = 10000) {
    cancel(impatient.current);
    impatient.current = later(() => {
      impatient.current = null;
      if (current.current.phase !== 'PLAYER_SHOOTING' || !current.current.awaitingTrigger) return;
      if (!current.current.triggerHeld && !current.current.spinning) say('impatient');
      scheduleImpatient(4000);
    }, delay);
  }
  function beginTriggerHold() {
    const state = current.current;
    if (state.phase !== 'PLAYER_SHOOTING' || !state.awaitingTrigger || state.triggerHeld || state.spinning) return;
    clearGroup(drainTimers.current); clearGroup(holdTimers.current);
    const started = Date.now();
    update({ triggerHeld: true, triggerProgress: 0, suspense: true, message: 'Keep holding. Do not let go.' });
    function progress() {
      if (!current.current.triggerHeld || current.current.phase !== 'PLAYER_SHOOTING') return;
      update({ triggerProgress: Math.min(1, (Date.now() - started) / CONFIG.TRIGGER_HOLD_MS) });
      later(progress, 25, holdTimers.current);
    }
    later(progress, 25, holdTimers.current);
    later(() => { if (current.current.triggerHeld) tableAudio.play('hammer'); }, CONFIG.TRIGGER_HOLD_MS / 3, holdTimers.current);
    later(() => { if (current.current.triggerHeld) tableAudio.play('clack'); }, CONFIG.TRIGGER_HOLD_MS * 2 / 3, holdTimers.current);
    later(() => {
      if (current.current.phase === 'PLAYER_SHOOTING' && current.current.triggerHeld) resolveShot('player');
    }, CONFIG.TRIGGER_HOLD_MS, holdTimers.current);
  }
  function endTriggerHold() {
    if (!mounted.current) return;
    const state = current.current;
    if (state.phase !== 'PLAYER_SHOOTING' || !state.triggerHeld) return;
    clearGroup(holdTimers.current); clearGroup(drainTimers.current);
    const from = state.triggerProgress, started = Date.now();
    update({ triggerHeld: false, suspense: false, message: 'Released. Hold continuously to pull.' });
    function drain() {
      if (current.current.phase !== 'PLAYER_SHOOTING' || current.current.triggerHeld) return;
      const fraction = Math.min(1, (Date.now() - started) / 600);
      update({ triggerProgress: from * (1 - fraction) });
      if (fraction < 1) later(drain, 25, drainTimers.current);
    }
    later(drain, 25, drainTimers.current);
  }
  // Kept for old integrations: a click is deliberately incapable of firing.
  function pullTrigger() {}

  function performSpin(side: Side, after?: () => void) {
    const state = current.current;
    const serial = state.spinSerial + 1;
    update({ abilities: { ...state.abilities, [side]: { ...state.abilities[side], spin: false } },
      revolver: createRevolver(), spinning: side, spinSerial: serial, message: 'The cylinder turns. Six chambers again.' });
    tableAudio.play('spin'); say(side === 'player' ? 'player_spins' : 'opp_spins');
    later(() => {
      if (current.current.spinSerial !== serial || current.current.spinning !== side) return;
      update({ spinning: null }); after?.();
    }, 800);
  }
  function spinCylinder() {
    const state = current.current;
    if (state.phase !== 'PLAYER_SHOOTING' || !state.awaitingTrigger || state.triggerHeld || state.triggerProgress > 0 || state.spinning || !state.abilities.player.spin) return;
    performSpin('player');
  }
  function opponentShot() {
    update({ phase: 'AI_SHOOTING', suspense: true, awaitingTrigger: false, triggerHeld: false, triggerProgress: 0 });
    say('ai_loses_hand');
    function hesitate() {
      tableAudio.play('tension');
      const fired = Math.max(0, current.current.revolver.currentChamber - 1);
      const delay = Math.min(4000, 1500 + fired * 300 + cosmeticRandom() * 1000);
      later(() => { if (current.current.phase === 'AI_SHOOTING' && !current.current.spinning) resolveShot('ai'); }, delay);
    }
    if (current.current.abilities.ai.spin && CONFIG.NUM_CHAMBERS - current.current.revolver.currentChamber + 1 <= 3) performSpin('ai', hesitate);
    else hesitate();
  }

  function settleResult(forced?: HandWinner) {
    const round = current.current.round!;
    const result = forced ?? compareHands(round.player, round.ai);
    const playerBust = handScore(round.player).bust, aiBust = handScore(round.ai).bust;
    update({ phase: 'ROUND_RESULT', result, message: result === 'tie' ? 'PUSH — nobody shoots' : playerBust ? 'BUST — you lose the hand' : aiBust ? 'Stranger BUST — you win the hand' : result === 'player' ? 'You win the hand' : 'You lose the hand' });
    if (result === 'tie') { say('push'); later(sweep, 2000); }
    else later(() => {
      if (result === 'player') opponentShot();
      else {
        update({ phase: 'PLAYER_SHOOTING', awaitingTrigger: true, triggerHeld: false, triggerProgress: 0, message: 'Your hand lost. Hold to face the chamber.' });
        scheduleImpatient();
      }
    }, 1500);
  }
  function drawForOpponent() {
    say('ai_hits');
    update({ phase: 'DEALER_TURN', peekActor: null, round: drawCard(current.current.round!, 'ai'), message: 'The Stranger draws.' });
    tableAudio.play('card');
    later(dealerTurn, CONFIG.DEAL_SPEED + 200);
  }
  function dealerTurn() {
    const state = current.current, round = state.round!, score = handScore(round.ai);
    if (score.bust) { say('ai_busts'); settleResult('player'); return; }
    if (score.total >= CONFIG.DEALER_STANDS_ON || round.deck.length === 0) { settleResult(); return; }
    if (score.total >= 12 && score.total <= 16 && state.abilities.ai.peek) {
      const serial = state.peekSerial + 1;
      update({ phase: 'DEALER_PEEKING', abilities: { ...state.abilities, ai: { ...state.abilities.ai, peek: false } }, peekActor: 'ai', peekSerial: serial, message: 'The Stranger checks the next card.' });
      say('opp_peeks');
      const avoidsBust = handScore([...round.ai, round.deck[0]]).bust;
      later(() => {
        if (current.current.phase !== 'DEALER_PEEKING' || current.current.peekSerial !== serial) return;
        update({ peekActor: null });
        if (avoidsBust) { update({ message: 'The Stranger refuses the next card and stands.' }); settleResult(); }
        else drawForOpponent();
      }, 650);
      return;
    }
    drawForOpponent();
  }
  function stand() {
    if (current.current.phase !== 'PLAYER_DECISION' || !current.current.round) return;
    update({ phase: 'REVEAL', revealed: true, peekActor: null, peekedCard: null, message: 'You stand. The Stranger reveals.' });
    say('player_stands'); later(dealerTurn, 950);
  }
  function hit() {
    const state = current.current;
    if (state.phase !== 'PLAYER_DECISION' || !state.round || state.round.deck.length === 0) return;
    update({ phase: 'HITTING', hasHit: true, peekActor: null, peekedCard: null, round: drawCard(state.round, 'player'), message: 'One more card.' });
    say('player_hits'); tableAudio.play('card');
    later(() => {
      if (handScore(current.current.round!.player).bust) {
        update({ phase: 'REVEAL', revealed: true, message: 'BUST — lay down your hand.' });
        say('player_busts'); later(() => settleResult('ai'), 950);
      } else enterDecision('Your move. Hit or stand.');
    }, CONFIG.DEAL_SPEED);
  }
  function peek() {
    const state = current.current;
    if (state.phase !== 'PLAYER_DECISION' || !state.round?.deck[0] || !state.abilities.player.peek) return;
    const serial = state.peekSerial + 1;
    update({ abilities: { ...state.abilities, player: { ...state.abilities.player, peek: false } },
      peekedCard: state.round.deck[0], peekActor: 'player', peekSerial: serial, message: 'You look beneath the next card.' });
    say('player_peeks');
    later(() => { if (current.current.peekActor === 'player' && current.current.peekSerial === serial) update({ peekActor: null }); }, 650);
  }
  return { game, start, fold, hit, stand, pullTrigger, beginTriggerHold, endTriggerHold, spinCylinder, peek };
}
