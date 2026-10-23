import { useEffect, useRef, useState } from 'react';
import { CONFIG, compareHands, createRevolver, dealRound, drawCard, fireRevolver, handScore, handTotal } from './game';
import type { GamePhase, HandWinner, Revolver, Round } from './game';
import { chooseDialogue, roundDialogueCategory } from './dialogue';
import type { DialogueCategory } from './dialogue';
import { tableAudio } from './audio';

export type Session = {
  phase: GamePhase; round: Round | null; roundNumber: number; folds: number;
  revolver: Revolver; dialogue: string; dialogueCategory: DialogueCategory; dialogueDanger: boolean;
  revealed: boolean; result: HandWinner | null;
  message: string; suspense: boolean; awaitingTrigger: boolean; hasHit: boolean;
  dead: 'player' | 'ai' | null; shotEffect: 'click' | 'shot' | null;
};
const initial = (): Session => ({
  phase: 'START', round: null, roundNumber: 0, folds: CONFIG.MAX_FOLDS,
  revolver: createRevolver(), dialogue: chooseDialogue('intro'), dialogueCategory: 'intro', dialogueDanger: false,
  revealed: false, result: null,
  message: '', suspense: false, awaitingTrigger: false, hasHit: false, dead: null, shotEffect: null,
});

/** The state machine owns card order and pacing; presentation only animates its public state. */
export function useGame() {
  const [game, setGame] = useState<Session>(initial);
  const current = useRef(game), timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  function update(patch: Partial<Session>) {
    current.current = { ...current.current, ...patch };
    setGame(current.current);
  }
  function later(callback: () => void, delay: number) {
    const timer = setTimeout(() => { timers.current.delete(timer); callback(); }, delay);
    timers.current.add(timer);
  }
  function clearTimers() { timers.current.forEach(clearTimeout); timers.current.clear(); }
  useEffect(() => () => clearTimers(), []);
  function say(category: DialogueCategory) {
    update({ dialogue: chooseDialogue(category, current.current.dialogue), dialogueCategory: category,
      dialogueDanger: current.current.revolver.currentChamber >= CONFIG.DANGER_CHAMBER });
  }

  function nextRound() {
    const opening = dealRound();
    // The initial four cards are reserved in blackjack order, then consumed just like every hit.
    const deck = [opening.player[0], opening.ai[0], opening.player[1], opening.ai[1], ...opening.deck];
    update({ round: { player: [], ai: [], deck }, roundNumber: current.current.roundNumber + 1,
      phase: 'SHUFFLING', revealed: false, result: null, message: 'The Stranger shuffles.',
      suspense: false, awaitingTrigger: false, hasHit: false, shotEffect: null });
    const order = ['player', 'ai', 'player', 'ai'] as const;
    function dealOpening(index: number) {
      if (index === order.length) {
        update({ phase: 'PEEKING', message: 'The Stranger checks the hole card.' });
        later(() => {
          const round = current.current.round!;
          say(roundDialogueCategory(handTotal(round.ai), current.current.revolver.currentChamber));
          update({ phase: 'PLAYER_DECISION', message: 'Your move. Hit, stand, or fold.' });
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
    update({ phase: 'SWEEPING', suspense: false, awaitingTrigger: false });
    later(nextRound, 700);
  }

  function start() {
    clearTimers(); tableAudio.init();
    const fresh = initial(); current.current = fresh; setGame(fresh); nextRound();
  }

  function fold() {
    const state = current.current;
    if (state.phase !== 'PLAYER_DECISION' || state.hasHit || state.folds <= 0) return;
    update({ folds: state.folds - 1, message: 'You folded. The chamber waits.' });
    say('player_folds'); sweep();
  }

  function takeShot(shooter: 'player' | 'ai') {
    update({ suspense: true, awaitingTrigger: false, message: 'Hold your breath.' });
    tableAudio.play('tension');
    const wait = CONFIG.SUSPENSE_MIN_MS + Math.random() * (CONFIG.SUSPENSE_MAX_MS - CONFIG.SUSPENSE_MIN_MS);
    later(() => {
      const fired = fireRevolver(current.current.revolver);
      update({ revolver: fired.revolver, suspense: false, shotEffect: fired.fired ? 'shot' : 'click',
        phase: 'ROUND_RESULT', dead: fired.fired ? shooter : null, message: fired.fired ? '' : 'Click. An empty chamber.' });
      tableAudio.play(fired.fired ? 'shot' : 'click');
      if (fired.fired) later(() => update({ phase: 'GAME_OVER' }), 2400);
      else {
        later(() => say(current.current.revolver.currentChamber >= CONFIG.DANGER_CHAMBER ? 'danger' : shooter === 'ai' ? 'ai_survives_click' : 'player_survives_click'), 1000);
        later(sweep, 3400);
      }
    }, wait);
  }

  function settleResult(forced?: HandWinner) {
    const round = current.current.round!;
    const result = forced ?? compareHands(round.player, round.ai);
    const playerBust = handScore(round.player).bust, aiBust = handScore(round.ai).bust;
    update({ phase: 'ROUND_RESULT', result, message: result === 'tie' ? 'PUSH — nobody shoots' : playerBust ? 'BUST — you lose the hand' : aiBust ? 'Stranger BUST — you win the hand' : result === 'player' ? 'You win the hand' : 'You lose the hand' });
    if (result === 'tie') { say('push'); later(sweep, 2000); }
    else later(() => {
      if (result === 'player') {
        update({ phase: 'AI_SHOOTING' }); say('ai_loses_hand'); later(() => takeShot('ai'), 900);
      } else update({ phase: 'PLAYER_SHOOTING', awaitingTrigger: true, message: 'Your hand lost. The next move is yours.' });
    }, 1500);
  }

  function dealerTurn() {
    const round = current.current.round!;
    const score = handScore(round.ai);
    if (score.bust) { say('ai_busts'); settleResult('player'); return; }
    if (score.total >= CONFIG.DEALER_STANDS_ON || round.deck.length === 0) { settleResult(); return; }
    say('ai_hits');
    update({ phase: 'DEALER_TURN', round: drawCard(round, 'ai'), message: 'The Stranger draws.' });
    tableAudio.play('card');
    later(dealerTurn, CONFIG.DEAL_SPEED + 200);
  }

  function stand() {
    if (current.current.phase !== 'PLAYER_DECISION' || !current.current.round) return;
    update({ phase: 'REVEAL', revealed: true, message: 'You stand. The Stranger reveals.' });
    say('player_stands');
    later(dealerTurn, 950);
  }

  function hit() {
    const state = current.current;
    if (state.phase !== 'PLAYER_DECISION' || !state.round || state.round.deck.length === 0) return;
    update({ phase: 'HITTING', hasHit: true, round: drawCard(state.round, 'player'), message: 'One more card.' });
    say('player_hits'); tableAudio.play('card');
    later(() => {
      if (handScore(current.current.round!.player).bust) {
        update({ phase: 'REVEAL', revealed: true, message: 'BUST — lay down your hand.' });
        say('player_busts');
        later(() => settleResult('ai'), 950);
      } else update({ phase: 'PLAYER_DECISION', message: 'Your move. Hit or stand.' });
    }, CONFIG.DEAL_SPEED);
  }

  function pullTrigger() {
    if (current.current.phase !== 'PLAYER_SHOOTING' || !current.current.awaitingTrigger) return;
    takeShot('player');
  }
  return { game, start, fold, hit, stand, pullTrigger };
}
