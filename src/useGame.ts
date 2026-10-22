import { useEffect, useRef, useState } from 'react';
import { CONFIG, compareHands, createRevolver, dealRound, fireRevolver, handTotal } from './game';
import type { GamePhase, HandWinner, Revolver, Round } from './game';
import { chooseDialogue, roundDialogueCategory } from './dialogue';
import type { DialogueCategory } from './dialogue';
import { tableAudio } from './audio';

type Session = {
 phase: GamePhase; round: Round | null; roundNumber: number; folds: number;
 revolver: Revolver; dialogue: string; revealed: boolean; result: HandWinner | null;
 message: string; suspense: boolean; awaitingTrigger: boolean;
 dead: 'player' | 'ai' | null; shotEffect: 'click' | 'shot' | null;
};
const initial = (): Session => ({ phase:'START', round:null, roundNumber:0, folds:CONFIG.MAX_FOLDS,
 revolver:createRevolver(), dialogue:chooseDialogue('intro'), revealed:false, result:null, message:'', suspense:false, awaitingTrigger:false, dead:null, shotEffect:null });

/** All transitions and pacing are kept outside the scene and UI components. */
export function useGame() {
 const [game, setGame] = useState<Session>(initial);
 const current = useRef(game), timers = useRef<ReturnType<typeof setTimeout>[]>([]);
 function update(patch: Partial<Session>) { current.current = { ...current.current, ...patch }; setGame(current.current); }
 function later(callback: () => void, delay: number) { timers.current.push(setTimeout(callback, delay)); }
 function clearTimers() { timers.current.forEach(clearTimeout); timers.current = []; }
 useEffect(() => () => clearTimers(), []);
 function say(category: DialogueCategory) { update({ dialogue:chooseDialogue(category, current.current.dialogue) }); }
 function nextRound() {
  const round = dealRound();
  update({ round, roundNumber:current.current.roundNumber + 1, phase:'DEALING', revealed:false, result:null, message:'Dealing a fresh hand…', suspense:false, awaitingTrigger:false, shotEffect:null });
  tableAudio.play('card'); later(() => tableAudio.play('card'), 200);
  later(() => { say(roundDialogueCategory(handTotal(round.ai), current.current.revolver.currentChamber)); update({phase:'PLAYER_DECISION', message:'Your move. Trust the cards, or trust your instinct.'}); }, 950);
 }
 function start() {
  clearTimers(); tableAudio.init();
  const fresh = initial(); current.current = fresh; setGame(fresh); nextRound();
 }
 function fold() {
  if (current.current.phase !== 'PLAYER_DECISION' || current.current.folds <= 0) return;
  update({phase:'ROUND_RESULT', folds:current.current.folds - 1, message:'You folded. The chamber waits.'});
  say('player_folds'); tableAudio.play('card'); later(nextRound, 1900);
 }
 function takeShot(shooter: 'player' | 'ai') {
  update({ suspense:true, awaitingTrigger:false, message:'Hold your breath.' }); tableAudio.play('tension');
  const wait = CONFIG.SUSPENSE_MIN_MS + Math.random() * (CONFIG.SUSPENSE_MAX_MS - CONFIG.SUSPENSE_MIN_MS);
  later(() => {
   const fired = fireRevolver(current.current.revolver);
   update({revolver:fired.revolver, suspense:false, shotEffect:fired.fired ? 'shot' : 'click', phase:'ROUND_RESULT', dead:fired.fired ? shooter : null,
    message:fired.fired ? '' : 'Click. An empty chamber.'});
   tableAudio.play(fired.fired ? 'shot' : 'click');
   if (fired.fired) later(() => update({phase:'GAME_OVER'}), 2400);
   else { later(() => say(shooter === 'ai' ? 'ai_survives_click' : 'player_survives_click'), 1000); later(nextRound, 3400); }
  }, wait);
 }
 function go() {
  if (current.current.phase !== 'PLAYER_DECISION' || !current.current.round) return;
  update({phase:'REVEAL', revealed:true, message:'The cards have spoken.'}); say('player_goes'); tableAudio.play('card');
  later(() => {
   const round = current.current.round!; const result = compareHands(round.player, round.ai);
   update({phase:'ROUND_RESULT', result, message:result === 'tie' ? 'Tie — nobody shoots' : result === 'player' ? 'You win the hand' : 'You lose the hand'});
   if (result === 'tie') later(nextRound, 2000);
   else later(() => {
    if (result === 'player') {
     update({phase:'AI_SHOOTING'}); say('ai_loses_hand'); later(() => takeShot('ai'), 900);
    } else update({phase:'PLAYER_SHOOTING', awaitingTrigger:true, message:'Your hand lost. The next move is yours.'});
   }, 1500);
  }, 1200);
 }
 function pullTrigger() {
  if (current.current.phase !== 'PLAYER_SHOOTING' || !current.current.awaitingTrigger) return;
  takeShot('player');
 }
 return { game, start, fold, go, pullTrigger };
}
