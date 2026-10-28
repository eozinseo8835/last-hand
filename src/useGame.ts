import {DialogueMemory,openingWords,readingHold,type TextSpeed} from './readability';
import type {Reaction,ReactionKind} from './reactions';
import { GUN_SLIDE_MS, GUN_SET_DOWN_MS, SPIN_MS, SPIN_SWIPE_MS, type GunTransfer } from './gunTransfer';
import { attentionAt, canOpponentPeek, planAttention, type Attention, type AttentionPlan } from './attention';
import { approachStress, stressTarget } from './bodyLanguage';
import { useEffect, useRef, useState } from 'react';
import { CONFIG, compareHands, createRevolver, dealRound, drawCard, fireRevolver, handScore, handTotal } from './game';
import type { Card, GamePhase, HandWinner, Revolver, Round } from './game';
import { chooseDialogue } from './dialogue';
import type { DialogueCategory } from './dialogue';
import { tableAudio } from './audio';
import { chooseRoundEvent, cosmeticRandom, freshAbilities } from './tension';
import type { AbilityState, EventPlan, OpponentTell, RoundEvent, Side } from './tension';
import { HOST, OPPONENTS, feedKillsForRound, feedsForRoom, finishRunStats, freshRunStats, opponentAction, opponentBreakdownCategory, opponentOpeningCategory, opponentTell, recordAbility, recordHand } from './campaign';
import type { RoomNumber, RunStats } from './campaign';
import { HOST_DIALOGUE,OPPONENT_DIALOGUE,NERVOUS_BEGGING,FINAL_HOST_LINE, OPENING_LINES, ROOM_ARRIVAL, SHORT_INTRO, chooseExchange, chooseHostLine, shouldExchange } from './campaignDialogue';
import type { HostCategory, SpeechLine } from './campaignDialogue';
import { createVoicePlan } from './voice';
import { OPENING_STAGES, TRANSFER_STAGES, stageDurationMs, tiesForStage, type CinematicMode, type CinematicStage, type CinematicState } from './cinematics';
import { DISTANT_SHOT_GAP_MS, createAmbientEvent, nextAmbientDelay, type AmbientEvent, type DistantShot } from './roomLife';

export type Session = {
  phase: GamePhase; round: Round | null; roundNumber: number; folds: number;
  roomNumber: RoomNumber; guestsRemaining: number; feedDeaths: number[]; feedDeathSerial: number;
  speech: SpeechLine | null; speechQueue: SpeechLine[];
  dialogueLog:Array<SpeechLine & {name:string}>;reaction:Reaction|null;
  introIndex: number; introShort: boolean; storyStage: string; stats: RunStats;
  revolver: Revolver; dialogue: string; dialogueCategory: DialogueCategory; dialogueDanger: boolean;
  dialogueChambersFired: number; revealed: boolean; result: HandWinner | null;
  message: string; suspense: boolean; awaitingTrigger: boolean; hasHit: boolean;
  dead: Side | null; shotEffect: 'click' | 'shot' | null;
  abilities: AbilityState; tell: OpponentTell | null;
  triggerHeld: boolean; triggerProgress: number;
  spinning: Side | null; spinSerial: number;
  peekActor: Side | null; peekSerial: number; peekedCard: Card | null;
  event: RoundEvent | null;
  cinematic: CinematicState | null; tiesCut: { player: boolean; ai: boolean };
  distantShot: DistantShot | null; ambientEvent: AmbientEvent | null; shotId: string | null;
  aiShotStartedAt: number | null; aiShotDurationMs: number | null;
  attention: Attention; peekStartedAt: number | null; caught: 'host' | 'captive' | 'ai' | null;
  triggerDeadline: number | null; triggerRemainingMs: number | null; forceShotAt: number | null; forceTarget: Side | null;
  stress: number; lossStreak: number; gunTransfer: GunTransfer | null;
};
const initial = (): Session => ({
  phase: 'START', round: null, roundNumber: 0, folds: CONFIG.MAX_FOLDS,
  roomNumber: 1, guestsRemaining: 8, feedDeaths: [], feedDeathSerial: 0,
  speech: null, speechQueue: [],dialogueLog:[],reaction:null, introIndex: 0, introShort: false, storyStage: 'table', stats: freshRunStats(),
  revolver: createRevolver(), dialogue: chooseDialogue('intro'), dialogueCategory: 'intro', dialogueDanger: false,
  dialogueChambersFired: 0, revealed: false, result: null,
  message: '', suspense: false, awaitingTrigger: false, hasHit: false, dead: null, shotEffect: null,
  abilities: freshAbilities(), tell: null, triggerHeld: false, triggerProgress: 0,
  spinning: null, spinSerial: 0, peekActor: null, peekSerial: 0, peekedCard: null, event: null,
  cinematic: null, tiesCut: { player: true, ai: true }, distantShot: null, ambientEvent: null, shotId: null,
  aiShotStartedAt: null, aiShotDurationMs: null,
  attention: attentionAt(null, Date.now()), peekStartedAt: null, caught: null,
  triggerDeadline: null, triggerRemainingMs: null, forceShotAt: null, forceTarget: null, stress: .22, lossStreak: 0, gunTransfer: null,
});
type Timer = ReturnType<typeof setTimeout>;
type SpeechEntry = { line: SpeechLine; reactive: boolean };
type PendingDeath = { id: string; room: RoomNumber; table: number; announce: boolean };
let engineInstances = 0;

/** The state machine owns gameplay and cancelable time; the scene only presents its public state. */
export function useGame(textSpeed:TextSpeed='Normal') {
  const [game, setGame] = useState<Session>(initial);
  const [instanceId] = useState(() => `${Date.now()}:${++engineInstances}`);
  const currentTextSpeed=useRef(textSpeed);currentTextSpeed.current=textSpeed;
  const dialogueMemory=useRef(new DialogueMemory()),typedAt=useRef(0),reactionSerial=useRef(0),lastSpokenOpening=useRef('');
  const current = useRef(game), mounted = useRef(true);
  const timers = useRef(new Set<Timer>()), holdTimers = useRef(new Set<Timer>()), drainTimers = useRef(new Set<Timer>());
  const eventStart = useRef<Timer | null>(null), eventEnd = useRef<Timer | null>(null), impatient = useRef<Timer | null>(null);
  const pendingEvent = useRef<EventPlan | null>(null), eventUsed = useRef(false);
  const storyTimers = useRef(new Set<Timer>()), speechTimer = useRef<Timer | null>(null), speechGap = useRef<Timer | null>(null);
  const speechEntries = useRef<SpeechEntry[]>([]), speechId = useRef(0), speechIdle = useRef<(() => void) | null>(null);
  const runSerial = useRef(0), localShotSerial = useRef(0), ambientSerial = useRef(0);
  const pendingDeaths = useRef<PendingDeath[]>([]), queuedDeaths = useRef(new Set<string>());
  const distantTimer = useRef<Timer | null>(null), ambientTimer = useRef<Timer | null>(null);
  const lastDistantAt = useRef(-Infinity), localShotUntil = useRef(0), ambientDueAt = useRef(Infinity);
  const attentionPlan = useRef<AttentionPlan | null>(null), opponentInView = useRef(true);
  const localPending = useRef<Timer|null>(null);
  const aiDeadline = useRef<number | null>(null);
  const penaltyShot = useRef(false), timeoutTimers = useRef(new Set<Timer>()), gunTimers = useRef(new Set<Timer>());
  const stressClock = useRef(Date.now()), loudAt = useRef(-Infinity), reliefAt = useRef(-Infinity);
  const seenLoud = useRef(new Set<string>()), glanced = useRef(false);
  const openingSeen = useRef(false), completedRounds = useRef(new Set<string>()), recordedHands = useRef(new Set<string>());

  function cancel(timer: Timer | null) {
    if (timer === null) return;
    clearTimeout(timer); timers.current.delete(timer); holdTimers.current.delete(timer); drainTimers.current.delete(timer);
  }
  function clearGroup(group: Set<Timer>) { group.forEach(cancel); group.clear(); }
  function update(patch: Partial<Session>) {
    const phase = patch.phase ?? current.current.phase;
    if (phase === 'GAME_OVER') {
      ambientDueAt.current = Infinity; cancel(ambientTimer.current); ambientTimer.current = null;
    }
    if (phase !== 'PLAYER_DECISION' && phase !== 'PLAYER_PEEKING') {
      cancel(eventStart.current); cancel(eventEnd.current);
      eventStart.current = eventEnd.current = null;
      patch.event = null;
      if (current.current.ambientEvent) { patch.ambientEvent = null; tableAudio.playAmbient(null); }
    }
    current.current = { ...current.current, ...patch };
    if (mounted.current) { setGame(current.current); wakeDistantShots(); wakeAmbient(); }
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
    storyTimers.current.clear(); timeoutTimers.current.clear(); gunTimers.current.clear();
    localPending.current=null;
    eventStart.current = eventEnd.current = impatient.current = speechTimer.current = speechGap.current = distantTimer.current = ambientTimer.current = null;
  }
  useEffect(() => {
    mounted.current = true;
    const systems = setInterval(tickSystems, 50);
    return () => { clearInterval(systems); mounted.current = false; clearTimers(); tableAudio.playAmbient(null); tableAudio.setHooded(false); };
  }, []);


  function currentAttention() {
    const state = current.current;
    return attentionAt(attentionPlan.current, Date.now(), { event: state.event, distantShot: state.distantShot,
      ambientEvent: state.ambientEvent, tell: ['PLAYER_DECISION','PLAYER_PEEKING'].includes(state.phase) ? state.tell : null });
  }
  function tickSystems() {
    const state = current.current;
    if (['START','GAME_OVER','OPENING','TRANSITION'].includes(state.phase)) { stressClock.current = Date.now(); return; }
    const now = Date.now(), attention = currentAttention();
    const delta = Math.min(1, Math.max(0, (now - stressClock.current) / 1000)); stressClock.current = now;
    const event = state.distantShot ?? state.ambientEvent;
    const loudId = event?.id ?? (state.event ? `${state.roundNumber}:${state.event.startedAt}` : null);
    if (loudId && !seenLoud.current.has(loudId)) { seenLoud.current.add(loudId); loudAt.current = now; }
    const target = stressTarget(state.roomNumber, { chambersFired: Math.max(0, state.revolver.currentChamber - 1),
      nextShooter: state.phase === 'AI_SHOOTING', lossStreak: state.lossStreak,
      loudness: Math.max(0, 1 - (now - loudAt.current) / 10000), clickRelief: Math.max(0, 1 - (now - reliefAt.current) / 8000) });
    update({ attention, stress: approachStress(state.stress, target, delta),
      ...(state.triggerDeadline !== null ? { triggerRemainingMs: Math.max(0, state.triggerDeadline - now) } : {}) });
    if (state.phase === 'PLAYER_PEEKING' && (!attention.host.away || !attention.captive.away)) {
      catchPlayer(!attention.host.away ? 'host' : 'captive'); return;
    }
    if (state.phase === 'DEALER_PEEKING' && (!attention.host.away || opponentInView.current)) { catchOpponent(opponentInView.current); return; }
    if (!glanced.current && state.phase === 'PLAYER_DECISION' && attention.captive.away) { glanced.current = true; say('glance_away'); }
  }
  function setOpponentInView(inView: boolean) {
    opponentInView.current = inView;
    if (inView && current.current.phase === 'DEALER_PEEKING') catchOpponent();
  }
  function catchOpponent(seenByPlayer = true) {
    if (current.current.phase !== 'DEALER_PEEKING') return;
    update({ phase: 'DEALER_TURN', peekActor: null, peekStartedAt: null, caught: seenByPlayer ? 'ai' : null, message: seenByPlayer ? 'CAUGHT — the captive withdraws its hand.' : 'The captive withdraws its hand.' });
    if (seenByPlayer) say('caught_by_player', true);
    else hostSay('deal', 'Keep your hands clear.');
    later(() => { if (current.current.phase === 'DEALER_TURN') drawForOpponent(); }, 400);
  }
  function catchPlayer(catcher: 'host' | 'captive') {
    if (current.current.phase !== 'PLAYER_PEEKING') return;
    update({ peekActor: null, peekStartedAt: null, peekedCard: null, caught: catcher });
    later(() => { if (current.current.caught === catcher) update({ caught: null }); }, 2200);
    tableAudio.play('sting');
    if (catcher === 'host') hostSay('host_caught_player', undefined, true); else say('opp_caught_player', true);
    if (CONFIG.PEEK_CAUGHT_PENALTY === 'folds') {
      update({ phase: 'PLAYER_DECISION', folds: 0, message: 'CAUGHT — all remaining folds forfeited.' });
    } else { penaltyShot.current = true; beginPlayerShot('CAUGHT — face the chamber.'); }
  }
  function slideGun(side: Side, stage: GunTransfer['stage'], after?: () => void) {
    clearGroup(gunTimers.current);
    const gunTransfer: GunTransfer = { stage, side, startedAt: Date.now(), duration: stage==='to-shooter'&&side==='ai'?(current.current.roomNumber===1?1500:1450):GUN_SLIDE_MS,owner:current.current.forceShotAt!=null?'host':side };
    update({ gunTransfer });
    // The gun stays at center; the shooter reaches it instead of receiving a slide.
    later(() => {
      if (current.current.gunTransfer !== gunTransfer) return;
      update({ gunTransfer: null });
      after?.();
    }, gunTransfer.duration, gunTimers.current);
  }
  function beginPlayerShot(message: string) {
    clearGroup(timeoutTimers.current);
    update({ phase: 'PLAYER_SHOOTING', awaitingTrigger: false, triggerHeld: false, triggerProgress: 0,
      triggerDeadline: null, triggerRemainingMs: null, forceShotAt: null, forceTarget: null, message });
    slideGun('player', 'to-shooter', () => {
      if (current.current.phase === 'PLAYER_SHOOTING') startTriggerCountdown(message);
    });
  }
  function startTriggerCountdown(message: string) {
    const deadline = Date.now() + CONFIG.TRIGGER_TIMEOUT_MS;
    update({ awaitingTrigger: true, triggerDeadline: deadline, triggerRemainingMs: CONFIG.TRIGGER_TIMEOUT_MS, message });
    for (const [remaining, text] of [[10000, 'Ten seconds.'], [5000, 'Last chance to do it yourself.']] as const) {
      later(() => {
        if (current.current.phase === 'PLAYER_SHOOTING' && current.current.triggerDeadline === deadline) hostSay('trigger_warning', text, true);
      }, Math.max(0, CONFIG.TRIGGER_TIMEOUT_MS - remaining), timeoutTimers.current);
    }
    later(() => {
      if (current.current.phase !== 'PLAYER_SHOOTING' || current.current.triggerDeadline !== deadline) return;
      update({ triggerRemainingMs: 0 });
      forceShot();
    }, CONFIG.TRIGGER_TIMEOUT_MS, timeoutTimers.current);
  }
  /** The Host enforces this exact chamber; it never spins or compares the hand. */
  function forceShot() {
    const state = current.current;
    if (state.phase !== 'PLAYER_SHOOTING' || !state.awaitingTrigger || state.triggerDeadline === null || Date.now() < state.triggerDeadline) return;
    clearGroup(holdTimers.current); clearGroup(drainTimers.current); clearGroup(timeoutTimers.current);
    update({ phase: 'HOST_FORCE_SHOT', forceShotAt: Date.now(), forceTarget: 'player', awaitingTrigger: false, suspense: true,
      spinning: null, triggerHeld: false, triggerProgress: 0, triggerRemainingMs: 0,
      stats: { ...state.stats, forcedShots: state.stats.forcedShots + 1 }, message: 'The Host will complete the procedure.' });
    hostSay('forced_shot', 'Your time has elapsed.', true);
    later(() => { if (current.current.phase === 'HOST_FORCE_SHOT') tableAudio.playContact('metal',1); }, 2200, timeoutTimers.current);
    later(() => { if (current.current.phase === 'HOST_FORCE_SHOT') tableAudio.play('hammer'); }, 2800, timeoutTimers.current);
    later(() => { if (current.current.phase === 'HOST_FORCE_SHOT') resolveShot('player'); }, 4200, timeoutTimers.current);
  }

  /** The captive took too long: the Host interrupts, takes the revolver back and completes the captive's pull. */
  function forceAiShot(deadline: number) {
    const state = current.current;
    if (state.phase !== 'AI_SHOOTING' || aiDeadline.current !== deadline || state.dead) return;
    clearGroup(timeoutTimers.current); clearGroup(gunTimers.current); speechIdle.current = null;
    update({ phase: 'HOST_FORCE_SHOT', forceShotAt: Date.now(), forceTarget: 'ai', suspense: true, spinning: null, gunTransfer: null,
      aiShotStartedAt: null, aiShotDurationMs: null, message: 'The Host will complete the procedure.' });
    if (current.current.speech?.speaker === 'captive') finishSpeech();
    hostSay('forced_shot', 'Time.', true);
    later(() => { if (current.current.phase === 'HOST_FORCE_SHOT') tableAudio.playContact('metal',1); }, 2200, timeoutTimers.current);
    later(() => { if (current.current.phase === 'HOST_FORCE_SHOT') tableAudio.play('hammer'); }, 2800, timeoutTimers.current);
    later(() => { if (current.current.phase === 'HOST_FORCE_SHOT') resolveShot('ai'); }, 4200, timeoutTimers.current);
  }
  function startAiDeadline() {
    const deadline = Date.now() + CONFIG.AI_TRIGGER_TIMEOUT_MS; aiDeadline.current = deadline;
    later(() => forceAiShot(deadline), CONFIG.AI_TRIGGER_TIMEOUT_MS, timeoutTimers.current);
  }

  function voiceFired(room: RoomNumber, fired: number) {
    return fired + 1 >= OPPONENTS[room].breakdownStart ? fired : 0;
  }
  function contextualText(text:string){
    const state=current.current;
    if(text.includes('{playerTotal}')&&!state.revealed)return '';
    return text.replaceAll('{pulls}',String(Math.max(0,state.revolver.currentChamber-1)))
      .replaceAll('{folds}',String(state.folds)).replaceAll('{playerTotal}',String(state.round?handTotal(state.round.player):0))
      .replaceAll('{upcard}',state.round?.ai[0]?.rank??'card');
  }
  function selectText(pool:readonly string[]){
    const available=pool.map(contextualText).filter(t=>dialogueMemory.current.available(t));
    return available.length?available[Math.min(available.length-1,Math.floor(cosmeticRandom()*available.length))]:'';
  }
  function line(speaker: 'host' | 'captive', category: HostCategory | DialogueCategory, text: string): SpeechLine {
    const fired = Math.max(0, current.current.revolver.currentChamber - 1);
    let candidate=contextualText(text);
    if(!dialogueMemory.current.available(candidate))candidate=selectText(speaker==='host'?HOST_DIALOGUE[category as HostCategory]??[]:OPPONENT_DIALOGUE[current.current.roomNumber][category as DialogueCategory]??[]);
    if(candidate)dialogueMemory.current.reserve(candidate);
    return { id: ++speechId.current, speaker, category, text:candidate,
      danger: speaker === 'captive' && current.current.revolver.currentChamber >= CONFIG.DANGER_CHAMBER,
      chambersFired: speaker === 'host' ? 0 : voiceFired(current.current.roomNumber, fired) };
  }
  function publishSpeech(next: SpeechLine | null) {
    if(next&&!next.text)return;
    if(next&&openingWords(next.text)===lastSpokenOpening.current){const pool=next.speaker==='host'?HOST_DIALOGUE[next.category as HostCategory]:OPPONENT_DIALOGUE[current.current.roomNumber][next.category as DialogueCategory];const replacement=selectText((pool??[]).filter(text=>openingWords(contextualText(text))!==lastSpokenOpening.current));if(replacement){dialogueMemory.current.reserve(replacement);next={...next,text:replacement};}else return;}
    if(next)lastSpokenOpening.current=openingWords(next.text);
    const speech=next?{...next,textSpeed:currentTextSpeed.current}:null;
    update({ speech, ...(speech ? { dialogue: speech.text,
      dialogueCategory: speech.speaker === 'captive' ? speech.category as DialogueCategory : 'intro',
      dialogueDanger: speech.danger, dialogueChambersFired: speech.chambersFired,
      dialogueLog:[...current.current.dialogueLog,{...speech,name:speech.speaker==='host'?HOST.name:OPPONENTS[current.current.roomNumber].name}].slice(-20) } : {}) });
    if(speech){const profile=speech.speaker==='host'?HOST.voice:OPPONENTS[current.current.roomNumber].voice;
      const plan=createVoicePlan(speech.text,speech.category,speech.danger,speech.chambersFired,profile,speech.textSpeed);
      typedAt.current=Date.now()+plan.duration;scheduleReadingEnd(speech);
    }
  }
  function scheduleReadingEnd(speech:SpeechLine){
    cancel(speechTimer.current);speechTimer.current=null;
    if(current.current.phase==='OPENING'&&current.current.storyStage==='rules')return;
    speechTimer.current=later(()=>{speechTimer.current=null;if(current.current.speech?.id===speech.id)finishSpeech();},Math.max(0,typedAt.current-Date.now())+readingHold(speech.text));
  }
  function finishTyping(skipped:boolean){const speech=current.current.speech;if(!speech)return;if(skipped)typedAt.current=Date.now();scheduleReadingEnd(speech);}
  function react(kind:ReactionKind,duration=1500){
    const state=current.current;if(state.dead||state.suspense||state.gunTransfer||['AI_SHOOTING','PLAYER_SHOOTING','HOST_FORCE_SHOT'].includes(state.phase))return;
    update({reaction:{id:++reactionSerial.current,kind,room:state.roomNumber,startedAt:Date.now(),duration}});
  }
  function maybeSpeechIdle() {
    if (!current.current.speech && !speechEntries.current.length && speechGap.current === null) speechIdle.current?.();
  }
  function pumpSpeech() {
    if (current.current.speech || speechGap.current !== null || current.current.phase === 'OPENING') return;
    const entry = speechEntries.current.shift();
    update({ speechQueue: speechEntries.current.map(item => item.line) });
    if (!entry) { maybeSpeechIdle(); return; }
    publishSpeech(entry.line);if(!current.current.speech)pumpSpeech();
  }

  function enqueue(entries: SpeechEntry[], replaceReactive = false) {
    if (replaceReactive) speechEntries.current = speechEntries.current.filter(entry => !entry.reactive);
    speechEntries.current.push(...entries.filter(entry=>entry.line.text));
    update({ speechQueue: speechEntries.current.map(entry => entry.line) });
    pumpSpeech();
  }
  function finishSpeech() {
    if (current.current.phase === 'OPENING' && current.current.storyStage === 'rules') { advanceOpening(); return; }
    if (!current.current.speech) return;
    cancel(speechTimer.current); speechTimer.current = null;
    tableAudio.stopVoice(); publishSpeech(null);
    cancel(speechGap.current);
    speechGap.current = later(() => { speechGap.current = null; pumpSpeech(); }, 100);
  }
  function clearSpeech() {
    cancel(speechTimer.current); cancel(speechGap.current);
    speechTimer.current = speechGap.current = null; speechEntries.current = []; speechIdle.current = null;
    tableAudio.stopVoice(); publishSpeech(null); update({ speechQueue: [] });
  }
  function hostSay(category: HostCategory, text?: string, urgent = false) {
    const next = line('host', category, text ?? selectText(HOST_DIALOGUE[category]));
    if(!next.text)return;
    if(urgent){speechEntries.current=[{line:next,reactive:false},...speechEntries.current.filter(entry=>!entry.reactive&&entry.line.category!=='waiting_for_trigger')];update({speechQueue:speechEntries.current.map(entry=>entry.line)});pumpSpeech();}
    else enqueue([{line:next,reactive:false}]);
  }
  function say(requested: DialogueCategory, preserve = false) {
    const fired = Math.max(0, current.current.revolver.currentChamber - 1);
    const category = ['opp_caught_player','caught_by_player','glance_away','distant_shot','player_loses_hand'].includes(requested) ? requested : opponentBreakdownCategory(current.current.roomNumber, requested, fired);
    const begging = current.current.roomNumber === 1 && requested === 'ai_loses_hand' && category === requested && cosmeticRandom() < .4;
    const text=selectText(begging?NERVOUS_BEGGING:OPPONENT_DIALOGUE[current.current.roomNumber][category]);
    if(text)enqueue([{line:line('captive',category,text),reactive:!preserve}],true);
  }

  function distantIsSafe() {
    const state = current.current;
    if (state.suspense || Date.now() < localShotUntil.current) return false;
    if (state.phase === 'PLAYER_DECISION' || state.phase === 'SWEEPING') return true;
    if (state.phase === 'ROUND_RESULT') return state.result === 'tie' || state.shotEffect !== null;
    return state.phase === 'TRANSITION' && state.storyStage === 'departure' ||
      state.phase === 'ENDING_DEATH' && state.storyStage !== 'fall';
  }
  function wakeDistantShots() {
    if (!pendingDeaths.current.length || distantTimer.current !== null || !mounted.current) return;
    const delay = distantIsSafe() ? Math.max(0, lastDistantAt.current + DISTANT_SHOT_GAP_MS - Date.now()) : 100;
    distantTimer.current = later(() => { distantTimer.current = null; pumpDistantShots(); }, delay);
  }
  /** One transaction owns a monitor death, its bang, and the guest-count change. */
  function playDistantRoomShot(pending: PendingDeath) {
    const state = current.current;
    if (state.roomNumber !== pending.room || state.feedDeaths.includes(pending.table)) return;
    const direction = pending.table === 2 ? -1 : pending.table === 3 ? .6 : 1;
    const distantShot: DistantShot = { id: pending.id, table: pending.table, startedAt: Date.now(), duration: 1800, direction,position:[direction*3,1.2,-1.5] };
    lastDistantAt.current = distantShot.startedAt;
    update({ feedDeaths: [...state.feedDeaths, pending.table], feedDeathSerial: state.feedDeathSerial + 1,
      guestsRemaining: state.guestsRemaining - 1, distantShot });
    tableAudio.playShot({ id: pending.id, kind: 'distant', roomId: pending.table, direction,position:distantShot.position });
    if (pending.announce && state.phase !== 'ENDING_DEATH' && state.phase !== 'ENDING_WIN' && state.phase !== 'GAME_OVER') {
      hostSay('other_room_death', `Table ${['zero', 'one', 'two', 'three', 'four'][pending.table]}. ${chooseHostLine('other_room_death', current.current.dialogue)}`);
      if (!state.dead) say('distant_shot');
    }
    later(() => { if (current.current.distantShot?.id === pending.id) update({ distantShot: null }); }, distantShot.duration, storyTimers.current);
  }
  function pumpDistantShots() {
    if (!pendingDeaths.current.length) { maybeSpeechIdle(); return; }
    if (!distantIsSafe() || Date.now() < lastDistantAt.current + DISTANT_SHOT_GAP_MS) { wakeDistantShots(); return; }
    const pending = pendingDeaths.current.shift()!;
    playDistantRoomShot(pending);
    wakeDistantShots(); maybeSpeechIdle();
  }
  function recordFeedDeath(table: number, announce = true) {
    const state = current.current;
    const id = `${instanceId}:${runSerial.current}:room:${state.roomNumber}:table:${table}`;
    if (!feedsForRoom(state.roomNumber).includes(table) || state.feedDeaths.includes(table) || queuedDeaths.current.has(id)) return;
    queuedDeaths.current.add(id);
    pendingDeaths.current.push({ id, room: state.roomNumber, table, announce });
    wakeDistantShots();
  }
  function wakeAmbient() {
    if (!Number.isFinite(ambientDueAt.current) || ambientTimer.current !== null || !mounted.current) return;
    const delay = Math.max(0, ambientDueAt.current - Date.now());
    ambientTimer.current = later(() => { ambientTimer.current = null; startAmbient(); }, delay || 100);
  }
  function startAmbient() {
    const state = current.current;
    if (state.phase !== 'PLAYER_DECISION' || state.suspense || state.spinning || state.event || state.distantShot || state.ambientEvent) {
      ambientTimer.current = later(() => { ambientTimer.current = null; startAmbient(); }, 500);
      return;
    }
    const event = createAmbientEvent(`${instanceId}:${runSerial.current}:ambient:${++ambientSerial.current}`, Date.now());
    ambientDueAt.current = Date.now() + nextAmbientDelay();
    update({ ambientEvent: event }); tableAudio.playAmbient(event);
    later(() => {
      if (current.current.ambientEvent?.id === event.id) { tableAudio.playAmbient(null); update({ ambientEvent: null }); }
    }, event.duration);
  }
  function completeRound() {
    const state = current.current, key = `${state.roomNumber}:${state.roundNumber}`;
    if (completedRounds.current.has(key)) return;
    completedRounds.current.add(key);
    const room = state.roomNumber;
    feedKillsForRound(room, state.roundNumber).filter(table => !state.feedDeaths.includes(table)).forEach((table, index) => {
      later(() => { if (current.current.roomNumber === room) recordFeedDeath(table); }, 350 + index * 350, storyTimers.current);
    });
  }
  function openingLines() {
    const mode = current.current.cinematic?.mode;
    return mode === 'arrival' ? [ROOM_ARRIVAL[current.current.roomNumber]] : current.current.introShort ? [SHORT_INTRO] : OPENING_LINES;
  }
  function showOpeningLine(index: number) {
    const mode = current.current.cinematic?.mode ?? (current.current.introShort ? 'short' : 'full');
    update({ storyStage: 'rules', cinematic: { stage: 'rules', startedAt: Date.now(), mode }, introIndex: index });
    publishSpeech(line('host', 'intro_rules', openingLines()[index]));
  }
  function runOpeningStage(stage: CinematicStage, mode: CinematicMode) {
    const cinematic: CinematicState = { stage, startedAt: Date.now(), mode };
    update({ phase: 'OPENING', storyStage: stage, cinematic, tiesCut: tiesForStage(cinematic) });
    const duration = stageDurationMs(stage);
    if (stage === 'hooded') { tableAudio.setHooded(true); tableAudio.playStory('hood'); tableAudio.playStory('sob'); }
    if (stage === 'door-open') tableAudio.playStory('door-creak');
    if (stage === 'guard-approach' || stage === 'guard-exit') tableAudio.playStory('boots');
    if (stage === 'player-unhood') tableAudio.playStory('burlap-tug');
    if (stage === 'player-focus') tableAudio.setHooded(false);
    if (stage === 'opponent-unhood') {
      tableAudio.playStory('burlap-tug');
      later(() => tableAudio.playStory('gasp'), duration * .93, storyTimers.current);
    }
    if (stage === 'guard-exit') later(() => tableAudio.playStory('door-slam'), duration - 100, storyTimers.current);
    if (stage === 'rules') { showOpeningLine(0); return; }
    if (stage === 'cut-opponent') {
      const speech = line('host', 'cut_ties', chooseHostLine('cut_ties', current.current.dialogue));
      publishSpeech(speech);

    }
    if (stage === 'cut-opponent' || stage === 'cut-player') later(() => tableAudio.playStory('snip'), duration * .94, storyTimers.current);
    if (stage === 'complete') {
      update({ cinematic: null, tiesCut: { player: true, ai: true }, storyStage: 'table' });
      nextRound(); return;
    }
    const index = OPENING_STAGES.indexOf(stage as typeof OPENING_STAGES[number]);
    if (index >= 0) later(() => runOpeningStage(OPENING_STAGES[index + 1], mode), duration, storyTimers.current);
  }
  function advanceOpening() {
    if (current.current.phase !== 'OPENING' || current.current.storyStage !== 'rules' || speechGap.current !== null) return;
    const mode = current.current.cinematic?.mode ?? 'full';
    const next = current.current.introIndex + 1;
    tableAudio.stopVoice(); publishSpeech(null);
    speechGap.current = later(() => {
      speechGap.current = null;
      if (next >= openingLines().length) runOpeningStage('complete', mode); else showOpeningLine(next);
    }, 100);
  }
  function skipOpening() {
    if (current.current.phase !== 'OPENING') return;
    clearGroup(storyTimers.current); clearSpeech(); tableAudio.setHooded(false);
    update({ cinematic: null, tiesCut: { player: true, ai: true }, storyStage: 'table' });
    speechGap.current = later(() => { speechGap.current = null; pumpSpeech(); }, 100);
    nextRound();
  }
  function beginMatch(roomNumber: RoomNumber, arrival: boolean) {
    clearGroup(holdTimers.current); clearGroup(drainTimers.current);
    cancel(impatient.current); impatient.current = null;
    const state = current.current;
    attentionPlan.current = null; clearGroup(timeoutTimers.current); clearGroup(gunTimers.current);
    update({ gunTransfer: null, roomNumber, stress: OPPONENTS[roomNumber].behavior.baseStress, lossStreak: 0, triggerDeadline: null, triggerRemainingMs: null, forceShotAt: null, forceTarget: null, peekStartedAt: null, caught: null, round: null, roundNumber: 0, folds: CONFIG.MAX_FOLDS,
      revolver: roomNumber === 1 && state.stats.roundsPlayed === 0 ? state.revolver : createRevolver(),
      abilities: freshAbilities(), tell: null, feedDeaths: [], revealed: false, result: null,
      suspense: false, awaitingTrigger: false, hasHit: false, dead: null, shotEffect: null, shotId: null,
      triggerHeld: false, triggerProgress: 0, spinning: null, peekActor: null, peekedCard: null,
      distantShot: null, ambientEvent: null, aiShotStartedAt: null, aiShotDurationMs: null,
      phase: 'OPENING', tiesCut: { player: false, ai: false } });
    runOpeningStage('hooded', arrival ? 'arrival' : state.introShort ? 'short' : 'full');
  }
  function runTransferStage(index: number, leavingRoom: RoomNumber) {
    const stage = TRANSFER_STAGES[index];
    const cinematic: CinematicState = { stage, startedAt: Date.now(), mode: 'transfer' };
    update({ phase: 'TRANSITION', storyStage: stage, cinematic });
    if (stage === 'guards-enter') { tableAudio.playStory('door-creak'); tableAudio.playStory('boots'); }
    if (stage === 'transfer-hood') { tableAudio.playStory('hood-cinch'); tableAudio.setHooded(true); }
    if (stage === 'dragging') { tableAudio.playStory('drag'); tableAudio.playStory('boots'); }
    if (stage === 'door') tableAudio.playStory('door-slam');
    later(() => {
      if (index + 1 < TRANSFER_STAGES.length) runTransferStage(index + 1, leavingRoom);
      else beginMatch((leavingRoom + 1) as RoomNumber, true);
    }, stageDurationMs(stage), storyTimers.current);
  }
  function transitionRoom() {
    const leavingRoom = current.current.roomNumber;
    update({ phase: 'TRANSITION', storyStage: 'departure', cinematic: null, suspense: false, awaitingTrigger: false });
    hostSay('transition');
    for (const table of feedsForRoom(leavingRoom)) recordFeedDeath(table);
    speechIdle.current = () => {
      if (pendingDeaths.current.some(pending => pending.room === leavingRoom)) return;
      speechIdle.current = null; runTransferStage(0, leavingRoom);
    };
    maybeSpeechIdle();
  }
  function finishRun() {
    const finish = () => {
      if (pendingDeaths.current.length) return;
      speechIdle.current = null;
      update({ phase: 'GAME_OVER', stats: finishRunStats(current.current.stats, current.current.stats.guestsRemainingWhenFell) });
    };
    speechIdle.current = finish; maybeSpeechIdle();
  }
  function endingWin() {
    update({ phase: 'ENDING_WIN', storyStage: 'departure' });
    speechIdle.current = () => {
      speechIdle.current = null;
      hostSay('ending_win', 'The exit has been made available.');
      speechIdle.current = () => {
        speechIdle.current = null;
        update({ storyStage: 'door' }); tableAudio.playStory('escape');
        later(() => { update({ storyStage: 'stairs' }); hostSay('ending_win', FINAL_HOST_LINE); }, 1800, storyTimers.current);
        later(() => update({ storyStage: 'viewers' }), 5800, storyTimers.current);
        later(() => update({ storyStage: 'title' }), 7300, storyTimers.current);
        later(finishRun, 9100, storyTimers.current);
      };
      maybeSpeechIdle();
    };
    maybeSpeechIdle();
  }
  function endingDeath() {
    update({ phase: 'ENDING_DEATH', storyStage: 'fall' });
    later(() => { update({ storyStage: 'monitor' }); hostSay('ending_death'); }, 2400, storyTimers.current);
    later(() => update({ storyStage: 'no-signal' }), 4600, storyTimers.current);
    later(finishRun, 6100, storyTimers.current);
  }
  function enterDecision(message: string) {
    if (!attentionPlan.current) attentionPlan.current = planAttention(Date.now());
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
    attentionPlan.current = null; glanced.current = false; penaltyShot.current = false;
    clearGroup(timeoutTimers.current); clearGroup(gunTimers.current);
    const opening = dealRound();
    const deck = [opening.player[0], opening.ai[0], opening.player[1], opening.ai[1], ...opening.deck];
    pendingEvent.current = chooseRoundEvent(); eventUsed.current = false;
    cancel(impatient.current); impatient.current = null;
    update({ round: { player: [], ai: [], deck }, roundNumber: current.current.roundNumber + 1,
      phase: 'SHUFFLING', revealed: false, result: null, message: 'The Host shuffles.',
      suspense: false, awaitingTrigger: false, hasHit: false, shotEffect: null, shotId: null, aiShotStartedAt: null, aiShotDurationMs: null,
      triggerHeld: false, triggerProgress: 0, spinning: null, peekActor: null, peekedCard: null,
      triggerDeadline: null, triggerRemainingMs: null, forceShotAt: null, forceTarget: null, peekStartedAt: null, caught: null,
      gunTransfer: null, storyStage: 'table', tell: opponentTell(current.current.roomNumber, handTotal(opening.ai)),
      stats: { ...current.current.stats, roundsPlayed: current.current.stats.roundsPlayed + 1 } });
    hostSay('deal');
    const order = ['player', 'ai', 'player', 'ai'] as const;
    function dealOpening(index: number) {
      if (index === order.length) {
        update({ phase: 'PEEKING', message: `${OPPONENTS[current.current.roomNumber].name} checks the hole card.` });
        later(() => {
          say(opponentOpeningCategory(current.current.roomNumber, handTotal(current.current.round!.ai)), true);
          if (shouldExchange()) {
            const exchange = chooseExchange(current.current.roomNumber);
            enqueue([{ line: {...line('captive', 'nervous', exchange.captive),addressedTo:'host'}, reactive: false },
              { line: {...line('host', 'deal', exchange.host),addressedTo:'captive'}, reactive: false }]);
          }
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
    attentionPlan.current = null; penaltyShot.current = false; opponentInView.current = true;
    seenLoud.current.clear(); loudAt.current = reliefAt.current = -Infinity;
    clearTimers(); tableAudio.init(); tableAudio.stopVoice(); tableAudio.playAmbient(null);
    pendingDeaths.current = []; queuedDeaths.current.clear(); lastDistantAt.current = -Infinity; localShotUntil.current = 0;
    dialogueMemory.current.reset();lastSpokenOpening.current='';
    runSerial.current++; localShotSerial.current = ambientSerial.current = 0;
    ambientDueAt.current = Date.now() + nextAmbientDelay();
    speechEntries.current = []; speechIdle.current = null; completedRounds.current.clear(); recordedHands.current.clear();
    const fresh = initial();
    fresh.introShort = openingSeen.current; openingSeen.current = true;
    current.current = fresh; setGame(fresh);
    beginMatch(1, false);
  }
  function fold() {
    const state = current.current;
    if (state.phase !== 'PLAYER_DECISION' || state.hasHit || state.folds <= 0) return;
    update({ folds: state.folds - 1, message: 'You folded. The chamber waits.', peekActor: null, peekedCard: null,
      stats: { ...state.stats, foldsUsed: state.stats.foldsUsed + 1 } });
    say('player_folds'); completeRound(); sweep();
  }

  function resolveShot(shooter: Side) {
    const forcedTarget = current.current.phase === 'HOST_FORCE_SHOT' ? current.current.forceTarget ?? 'player' : null;
    if (shooter === 'ai' ? current.current.phase !== 'AI_SHOOTING' && forcedTarget !== 'ai' : current.current.phase !== 'PLAYER_SHOOTING' && forcedTarget !== 'player') return;
    const wait=lastDistantAt.current+4000-Date.now();if(wait>0){if(localPending.current===null){clearGroup(holdTimers.current);clearGroup(timeoutTimers.current);update({awaitingTrigger:false,triggerHeld:false,triggerProgress:1});localPending.current=later(()=>{localPending.current=null;resolveShot(shooter);},wait);}return;}
    cancel(impatient.current); impatient.current = null;
    clearGroup(holdTimers.current); clearGroup(drainTimers.current);
    const state = current.current;
    clearGroup(gunTimers.current);
    const wasForced = state.phase === 'HOST_FORCE_SHOT';
    clearGroup(timeoutTimers.current);
    const fired = fireRevolver(state.revolver);
    const shotId = `${instanceId}:${runSerial.current}:local:${++localShotSerial.current}`;
    localShotUntil.current = Date.now() + (fired.fired ? 4000 : 1000);
    const guestsRemaining = state.guestsRemaining - (fired.fired ? 1 : 0);
    update({ guestsRemaining, stats: { ...state.stats,
      highestChamber: Math.max(state.stats.highestChamber, fired.fired ? state.revolver.currentChamber : Math.min(CONFIG.NUM_CHAMBERS, fired.revolver.currentChamber)),
      roomsCleared: state.stats.roomsCleared + (fired.fired && shooter === 'ai' ? 1 : 0),
      guestsRemainingWhenFell: fired.fired && shooter === 'player' ? guestsRemaining : state.stats.guestsRemainingWhenFell } });
    update({ revolver: fired.revolver, suspense: false, awaitingTrigger: false, triggerHeld: false,
      triggerProgress: shooter === 'player' ? 1 : 0, spinning: null,
      shotEffect: fired.fired ? 'shot' : 'click', shotId, gunTransfer: null, phase: 'ROUND_RESULT', dead: fired.fired ? shooter : null,
      aiShotStartedAt: null, aiShotDurationMs: null, triggerDeadline: null, triggerRemainingMs: null,
      message: fired.fired ? '' : 'Click. An empty chamber.' });
    // An empty click is set down and pushed back. A fatal shot drops the revolver where it falls, unless the Host fired it: then the Host sets it down.
    if(!fired.fired||wasForced)later(()=>{if(current.current.shotId===shotId)slideGun(shooter,'return');},GUN_SET_DOWN_MS,gunTimers.current);
    if (fired.fired) tableAudio.playShot({ id: shotId, kind: 'local', roomId: state.roomNumber });
    else { tableAudio.play('click'); if(shooter==='ai') tableAudio.playStory('gasp'); }
    if (!penaltyShot.current) completeRound();
    if (fired.fired) loudAt.current = Date.now(); else reliefAt.current = Date.now();
    if (fired.fired) {
      speechEntries.current = speechEntries.current.filter(entry => entry.line.speaker === 'host');
      update({ speechQueue: speechEntries.current.map(entry => entry.line) });
      if (shooter === 'ai' && current.current.speech?.speaker === 'captive') finishSpeech();
      if (shooter === 'player') endingDeath();
      else later(() => current.current.roomNumber < 3 ? transitionRoom() : endingWin(), 2400, storyTimers.current);
    }
    else {
      later(() => {react(shooter==='ai'?'survive':'player-click');wasForced?hostSay('forced_shot'):say(shooter==='ai'?'ai_survives_click':'player_survives_click',true);},GUN_SET_DOWN_MS+GUN_SLIDE_MS+50);
      later(() => {
        update({ forceShotAt: null, forceTarget: null });
        if (penaltyShot.current) { penaltyShot.current = false; update({ shotEffect: null, shotId: null }); enterDecision('The penalty is complete. Your hand continues.'); }
        else sweep();
      }, 3400);
    }
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
    if (state.triggerDeadline !== null && Date.now() >= state.triggerDeadline) { forceShot(); return; }
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
      revolver: createRevolver(), spinning: side, spinSerial: serial, message: 'The cylinder turns. Six chambers again.',
      stats: recordAbility(state.stats, side, 'spin') });
    say(side === 'player' ? 'player_spins' : 'opp_spins');
    // The ratchet sounds when the hand actually swipes the cylinder, not when the button is pressed.
    later(() => { if (current.current.spinSerial === serial && current.current.spinning === side) tableAudio.play('spin'); }, SPIN_SWIPE_MS);
    later(() => {
      if (current.current.spinSerial !== serial || current.current.spinning !== side) return;
      update({ spinning: null }); after?.();
    }, SPIN_MS);
  }
  function spinCylinder() {
    const state = current.current;
    if (state.phase !== 'PLAYER_SHOOTING' || !state.awaitingTrigger || state.triggerHeld || state.triggerProgress > 0 || state.spinning || !state.abilities.player.spin) return;
    performSpin('player');
  }
  function opponentShot() {
    update({ phase: 'AI_SHOOTING', suspense: true, awaitingTrigger: false, triggerHeld: false, triggerProgress: 0, aiShotStartedAt: null, aiShotDurationMs: null });
    slideGun('ai', 'to-shooter');
    // The 10 second limit starts once the revolver has reached the captive's hand.
    later(() => { if (current.current.phase === 'AI_SHOOTING') startAiDeadline(); }, current.current.gunTransfer?.duration ?? GUN_SLIDE_MS, gunTimers.current);
    if(current.current.roomNumber!==3)say('ai_loses_hand', true);
    function hesitate() {
      tableAudio.play('tension');
      const fired = Math.max(0, current.current.revolver.currentChamber - 1);
      const delay = Math.min(4000, 1500 + fired * 300 + cosmeticRandom() * 1000);
      const startedAt = Date.now();
      update({ aiShotStartedAt: startedAt, aiShotDurationMs: delay });
      later(() => { if (current.current.phase === 'AI_SHOOTING' && current.current.aiShotStartedAt === startedAt && !current.current.spinning) tableAudio.play('hammer'); }, Math.min(900, delay * .55));
      later(() => { if (current.current.phase === 'AI_SHOOTING' && !current.current.spinning) resolveShot('ai'); }, delay);
    }
    function whenQuiet(callback: () => void) {
      speechIdle.current = () => {
        speechIdle.current = null;
        if (current.current.phase !== 'AI_SHOOTING') return;
        const transfer = current.current.gunTransfer;
        if (transfer?.stage === 'to-shooter') {
          later(() => { if (current.current.phase === 'AI_SHOOTING') callback(); },
            Math.max(0, transfer.startedAt + transfer.duration - Date.now()), gunTimers.current);
        } else callback();
      };
      maybeSpeechIdle();
    }
    // The captive must finish its pre-pull reaction before the mechanical pause.
    // The engine's subtitle clock also advances this queue when sound is muted.
    whenQuiet(() => {
      const state = current.current;
      if (state.abilities.ai.spin && CONFIG.NUM_CHAMBERS - state.revolver.currentChamber + 1 <= OPPONENTS[state.roomNumber].spinRemaining) {
        performSpin('ai', () => whenQuiet(hesitate));
      } else hesitate();
    });
  }

  function settleResult(forced?: HandWinner) {
    const round = current.current.round!;
    const result = forced ?? compareHands(round.player, round.ai);
    const key = `${current.current.roomNumber}:${current.current.roundNumber}`;
    if (recordedHands.current.has(key)) return;
    recordedHands.current.add(key);
    update({ stats: recordHand(current.current.stats, result), lossStreak: result === 'player' ? current.current.lossStreak + 1 : result === 'ai' ? 0 : current.current.lossStreak });
    const playerBust = handScore(round.player).bust, aiBust = handScore(round.ai).bust;
    update({ phase: 'ROUND_RESULT', result, message: result === 'tie' ? 'PUSH — nobody shoots' : playerBust ? 'BUST — you lose the hand' : aiBust ? `${OPPONENTS[current.current.roomNumber].name} BUST — you win the hand` : result === 'player' ? 'You win the hand' : 'You lose the hand' });
    hostSay('round_result');
    if(result==='player')react('loss');
    else if(result==='ai'){react('relief');if(!playerBust)say('player_loses_hand',true);}
    if (result === 'tie') { say('push'); later(() => { completeRound(); sweep(); }, 2000); }
    else later(() => {
      if (result === 'player') opponentShot();
      else {
        beginPlayerShot('Your hand lost. Hold to face the chamber.');
      }
    }, 1500);
  }
  function drawForOpponent() {
    say('ai_hits');
    update({ phase: 'DEALER_TURN', peekActor: null, round: drawCard(current.current.round!, 'ai'), message: `${OPPONENTS[current.current.roomNumber].name} draws.` });
    tableAudio.play('card');
    later(dealerTurn, CONFIG.DEAL_SPEED + 200);
  }
  function dealerTurn() {
    const state = current.current, round = state.round!, score = handScore(round.ai);
    if (score.bust) { say('ai_busts', true); settleResult('player'); return; }
    if (round.deck.length === 0 || opponentAction(state.roomNumber, round.ai) === 'stand') { settleResult(); return; }
    if (score.total >= OPPONENTS[state.roomNumber].peekMin && score.total <= OPPONENTS[state.roomNumber].peekMax && state.abilities.ai.peek && canOpponentPeek(currentAttention(), opponentInView.current)) {
      const serial = state.peekSerial + 1;
      update({ phase: 'DEALER_PEEKING', abilities: { ...state.abilities, ai: { ...state.abilities.ai, peek: false } }, peekActor: 'ai', peekStartedAt: Date.now(), peekSerial: serial, message: 'The opponent checks the next card.', stats: recordAbility(state.stats, 'ai', 'peek') });
      say('opp_peeks');
      const avoidsBust = handScore([...round.ai, round.deck[0]]).bust;
      later(() => {
        if (current.current.phase !== 'DEALER_PEEKING' || current.current.peekSerial !== serial) return;
        update({ peekActor: null });
        if (avoidsBust) { update({ message: `${OPPONENTS[current.current.roomNumber].name} refuses the next card and stands.` }); settleResult(); }
        else drawForOpponent();
      }, CONFIG.PEEK_DURATION_MS);
      return;
    }
    drawForOpponent();
  }
  function stand() {
    if (current.current.phase !== 'PLAYER_DECISION' || !current.current.round) return;
    update({ phase: 'REVEAL', revealed: true, peekActor: null, peekedCard: null, message: 'You stand. The Host reveals both hands.' });
    say('player_stands'); later(dealerTurn, 950);
  }
  function hit() {
    const state = current.current;
    if (state.phase !== 'PLAYER_DECISION' || !state.round || state.round.deck.length === 0) return;
    update({ phase: 'HITTING', hasHit: true, peekActor: null, peekedCard: null, round: drawCard(state.round, 'player'), message: 'One more card.', stats: { ...state.stats, hits: state.stats.hits + 1 } });
    say('player_hits'); tableAudio.play('card');
    later(() => {
      if (handScore(current.current.round!.player).bust) {
        update({ phase: 'REVEAL', revealed: true, message: 'BUST — lay down your hand.', stats: { ...current.current.stats, busts: current.current.stats.busts + 1 } });
        say('player_busts', true); later(() => settleResult('ai'), 950);
      } else enterDecision('Your move. Hit or stand.');
    }, CONFIG.DEAL_SPEED);
  }
  function peek() {
    const state = current.current;
    if (state.phase !== 'PLAYER_DECISION' || !state.round?.deck[0] || !state.abilities.player.peek || !currentAttention().window) return;
    const serial = state.peekSerial + 1;
    update({ phase: 'PLAYER_PEEKING', abilities: { ...state.abilities, player: { ...state.abilities.player, peek: false } },
      peekedCard: null, peekActor: 'player', peekStartedAt: Date.now(), peekSerial: serial,
      message: 'Keep your hand low.', stats: recordAbility(state.stats, 'player', 'peek') });
    later(() => {
      if (current.current.phase !== 'PLAYER_PEEKING' || current.current.peekSerial !== serial) return;
      const attention = currentAttention();
      if (!attention.window) { catchPlayer(!attention.host.away ? 'host' : 'captive'); return; }
      update({ phase: 'PLAYER_DECISION', peekedCard: current.current.round!.deck[0], peekActor: null, peekStartedAt: null, message: 'You saw the corner. Remember it.' });
      say('player_peeks');
    }, CONFIG.PEEK_DURATION_MS);
  }

  return { game, finishTyping, start, fold, hit, stand, pullTrigger, beginTriggerHold, endTriggerHold, spinCylinder, peek, finishSpeech, advanceOpening, skipOpening, setOpponentInView, forceShot };
}
