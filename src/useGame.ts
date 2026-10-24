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
import { FINAL_HOST_LINE, OPENING_LINES, ROOM_ARRIVAL, SHORT_INTRO, chooseBeggingLine, chooseExchange, chooseHostLine, chooseOpponentLine, shouldExchange } from './campaignDialogue';
import type { HostCategory, SpeechLine } from './campaignDialogue';
import { createVoicePlan } from './voice';
import { OPENING_STAGES, TRANSFER_STAGES, stageDurationMs, tiesForStage, type CinematicMode, type CinematicStage, type CinematicState } from './cinematics';
import { DISTANT_SHOT_GAP_MS, createAmbientEvent, nextAmbientDelay, type AmbientEvent, type DistantShot } from './roomLife';

export type Session = {
  phase: GamePhase; round: Round | null; roundNumber: number; folds: number;
  roomNumber: RoomNumber; guestsRemaining: number; feedDeaths: number[]; feedDeathSerial: number;
  speech: SpeechLine | null; speechQueue: SpeechLine[];
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
};
const initial = (): Session => ({
  phase: 'START', round: null, roundNumber: 0, folds: CONFIG.MAX_FOLDS,
  roomNumber: 1, guestsRemaining: 8, feedDeaths: [], feedDeathSerial: 0,
  speech: null, speechQueue: [], introIndex: 0, introShort: false, storyStage: 'table', stats: freshRunStats(),
  revolver: createRevolver(), dialogue: chooseDialogue('intro'), dialogueCategory: 'intro', dialogueDanger: false,
  dialogueChambersFired: 0, revealed: false, result: null,
  message: '', suspense: false, awaitingTrigger: false, hasHit: false, dead: null, shotEffect: null,
  abilities: freshAbilities(), tell: null, triggerHeld: false, triggerProgress: 0,
  spinning: null, spinSerial: 0, peekActor: null, peekSerial: 0, peekedCard: null, event: null,
  cinematic: null, tiesCut: { player: true, ai: true }, distantShot: null, ambientEvent: null, shotId: null,
  aiShotStartedAt: null, aiShotDurationMs: null,
});
type Timer = ReturnType<typeof setTimeout>;
type SpeechEntry = { line: SpeechLine; reactive: boolean };
type PendingDeath = { id: string; room: RoomNumber; table: number; announce: boolean };
let engineInstances = 0;

/** The state machine owns gameplay and cancelable time; the scene only presents its public state. */
export function useGame() {
  const [game, setGame] = useState<Session>(initial);
  const [instanceId] = useState(() => `${Date.now()}:${++engineInstances}`);
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
    if (phase !== 'PLAYER_DECISION') {
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
    storyTimers.current.clear();
    eventStart.current = eventEnd.current = impatient.current = speechTimer.current = speechGap.current = distantTimer.current = ambientTimer.current = null;
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimers(); tableAudio.playAmbient(null); tableAudio.setHooded(false); };
  }, []);

  function voiceFired(room: RoomNumber, fired: number) {
    return fired + 1 >= OPPONENTS[room].breakdownStart ? fired : 0;
  }
  function line(speaker: 'host' | 'captive', category: HostCategory | DialogueCategory, text: string): SpeechLine {
    const fired = Math.max(0, current.current.revolver.currentChamber - 1);
    return { id: ++speechId.current, speaker, category, text,
      danger: speaker === 'captive' && current.current.revolver.currentChamber >= CONFIG.DANGER_CHAMBER,
      chambersFired: speaker === 'host' ? 0 : voiceFired(current.current.roomNumber, fired) };
  }
  function publishSpeech(next: SpeechLine | null) {
    update({ speech: next, ...(next ? { dialogue: next.text,
      dialogueCategory: next.speaker === 'captive' ? next.category as DialogueCategory : 'intro',
      dialogueDanger: next.danger, dialogueChambersFired: next.chambersFired } : {}) });
  }
  function maybeSpeechIdle() {
    if (!current.current.speech && !speechEntries.current.length && speechGap.current === null) speechIdle.current?.();
  }
  function pumpSpeech() {
    if (current.current.speech || speechGap.current !== null || current.current.phase === 'OPENING') return;
    const entry = speechEntries.current.shift();
    update({ speechQueue: speechEntries.current.map(item => item.line) });
    if (!entry) { maybeSpeechIdle(); return; }
    publishSpeech(entry.line);
    const profile = entry.line.speaker === 'host' ? HOST.voice : OPPONENTS[current.current.roomNumber].voice;
    const plan = createVoicePlan(entry.line.text, entry.line.category, entry.line.danger, entry.line.chambersFired, profile);
    speechTimer.current = later(() => {
      speechTimer.current = null;
      if (current.current.speech?.id === entry.line.id) finishSpeech();
    }, plan.duration + 500);
  }
  function enqueue(entries: SpeechEntry[], replaceReactive = false) {
    if (replaceReactive) speechEntries.current = speechEntries.current.filter(entry => !entry.reactive);
    speechEntries.current.push(...entries);
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
    const next = line('host', category, text ?? chooseHostLine(category, current.current.dialogue));
    if (urgent) {
      cancel(speechTimer.current); cancel(speechGap.current); speechTimer.current = null;
      tableAudio.stopVoice(); publishSpeech(null);
      speechEntries.current = [{ line: next, reactive: false }, ...speechEntries.current.filter(entry => !entry.reactive && entry.line.category !== 'waiting_for_trigger')];
      update({ speechQueue: speechEntries.current.map(entry => entry.line) });
      speechGap.current = later(() => { speechGap.current = null; pumpSpeech(); }, 100);
    } else enqueue([{ line: next, reactive: false }]);
  }
  function say(requested: DialogueCategory, preserve = false) {
    const fired = Math.max(0, current.current.revolver.currentChamber - 1);
    const category = opponentBreakdownCategory(current.current.roomNumber, requested, fired);
    const begging = current.current.roomNumber === 1 && requested === 'ai_loses_hand' && category === requested && cosmeticRandom() < .4;
    const text = begging ? chooseBeggingLine(current.current.dialogue) : chooseOpponentLine(current.current.roomNumber, category, current.current.dialogue);
    enqueue([{ line: line('captive', category, text), reactive: !preserve }], true);
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
    const distantShot: DistantShot = { id: pending.id, table: pending.table, startedAt: Date.now(), duration: 3000, direction };
    lastDistantAt.current = distantShot.startedAt;
    update({ feedDeaths: [...state.feedDeaths, pending.table], feedDeathSerial: state.feedDeathSerial + 1,
      guestsRemaining: state.guestsRemaining - 1, distantShot });
    tableAudio.playShot({ id: pending.id, kind: 'distant', roomId: pending.table, direction });
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
      later(() => tableAudio.playStory('gasp'), duration * .65, storyTimers.current);
    }
    if (stage === 'guard-exit') later(() => tableAudio.playStory('door-slam'), duration - 100, storyTimers.current);
    if (stage === 'rules') { showOpeningLine(0); return; }
    if (stage === 'cut-opponent') {
      const speech = line('host', 'cut_ties', chooseHostLine('cut_ties', current.current.dialogue));
      publishSpeech(speech);
      const plan = createVoicePlan(speech.text, speech.category, false, 0, HOST.voice);
      speechTimer.current = later(() => { speechTimer.current = null; if (current.current.speech?.id === speech.id) finishSpeech(); }, plan.duration + 500);
    }
    if (stage === 'cut-opponent' || stage === 'cut-player') later(() => tableAudio.playStory('snip'), duration * .6, storyTimers.current);
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
      if (next >= openingLines().length) runOpeningStage('cut-opponent', mode); else showOpeningLine(next);
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
    update({ roomNumber, round: null, roundNumber: 0, folds: CONFIG.MAX_FOLDS,
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
      phase: 'SHUFFLING', revealed: false, result: null, message: 'The Host shuffles.',
      suspense: false, awaitingTrigger: false, hasHit: false, shotEffect: null, shotId: null, aiShotStartedAt: null, aiShotDurationMs: null,
      triggerHeld: false, triggerProgress: 0, spinning: null, peekActor: null, peekedCard: null,
      storyStage: 'table', tell: opponentTell(current.current.roomNumber, handTotal(opening.ai)),
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
            enqueue([{ line: line('captive', 'nervous', exchange.captive), reactive: false },
              { line: line('host', 'deal', exchange.host), reactive: false }]);
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
    clearTimers(); tableAudio.init(); tableAudio.stopVoice(); tableAudio.playAmbient(null);
    pendingDeaths.current = []; queuedDeaths.current.clear(); lastDistantAt.current = -Infinity; localShotUntil.current = 0;
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
    if (current.current.phase !== (shooter === 'ai' ? 'AI_SHOOTING' : 'PLAYER_SHOOTING')) return;
    cancel(impatient.current); impatient.current = null;
    clearGroup(holdTimers.current); clearGroup(drainTimers.current);
    const state = current.current;
    const fired = fireRevolver(state.revolver);
    const shotId = `${instanceId}:${runSerial.current}:local:${++localShotSerial.current}`;
    localShotUntil.current = Date.now() + (fired.fired ? 2400 : 1000);
    const guestsRemaining = state.guestsRemaining - (fired.fired ? 1 : 0);
    update({ guestsRemaining, stats: { ...state.stats,
      highestChamber: Math.max(state.stats.highestChamber, fired.fired ? state.revolver.currentChamber : Math.min(CONFIG.NUM_CHAMBERS, fired.revolver.currentChamber)),
      roomsCleared: state.stats.roomsCleared + (fired.fired && shooter === 'ai' ? 1 : 0),
      guestsRemainingWhenFell: fired.fired && shooter === 'player' ? guestsRemaining : state.stats.guestsRemainingWhenFell } });
    update({ revolver: fired.revolver, suspense: false, awaitingTrigger: false, triggerHeld: false,
      triggerProgress: shooter === 'player' ? 1 : 0, spinning: null,
      shotEffect: fired.fired ? 'shot' : 'click', shotId, phase: 'ROUND_RESULT', dead: fired.fired ? shooter : null,
      aiShotStartedAt: null, aiShotDurationMs: null,
      message: fired.fired ? '' : 'Click. An empty chamber.' });
    if (fired.fired) tableAudio.playShot({ id: shotId, kind: 'local', roomId: state.roomNumber });
    else tableAudio.play('click');
    completeRound();
    if (fired.fired) {
      speechEntries.current = speechEntries.current.filter(entry => entry.line.speaker === 'host');
      update({ speechQueue: speechEntries.current.map(entry => entry.line) });
      if (shooter === 'ai' && current.current.speech?.speaker === 'captive') finishSpeech();
      if (shooter === 'player') endingDeath();
      else later(() => current.current.roomNumber < 3 ? transitionRoom() : endingWin(), 2400, storyTimers.current);
    }
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
      if (!current.current.triggerHeld && !current.current.spinning) hostSay('waiting_for_trigger', undefined, true);
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
      revolver: createRevolver(), spinning: side, spinSerial: serial, message: 'The cylinder turns. Six chambers again.',
      stats: recordAbility(state.stats, side, 'spin') });
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
    update({ phase: 'AI_SHOOTING', suspense: true, awaitingTrigger: false, triggerHeld: false, triggerProgress: 0, aiShotStartedAt: null, aiShotDurationMs: null });
    say('ai_loses_hand', true);
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
        if (current.current.phase === 'AI_SHOOTING') callback();
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
    update({ stats: recordHand(current.current.stats, result) });
    const playerBust = handScore(round.player).bust, aiBust = handScore(round.ai).bust;
    update({ phase: 'ROUND_RESULT', result, message: result === 'tie' ? 'PUSH — nobody shoots' : playerBust ? 'BUST — you lose the hand' : aiBust ? 'Opponent BUST — you win the hand' : result === 'player' ? 'You win the hand' : 'You lose the hand' });
    hostSay('round_result');
    if (result === 'tie') { say('push'); later(() => { completeRound(); sweep(); }, 2000); }
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
    update({ phase: 'DEALER_TURN', peekActor: null, round: drawCard(current.current.round!, 'ai'), message: `${OPPONENTS[current.current.roomNumber].name} draws.` });
    tableAudio.play('card');
    later(dealerTurn, CONFIG.DEAL_SPEED + 200);
  }
  function dealerTurn() {
    const state = current.current, round = state.round!, score = handScore(round.ai);
    if (score.bust) { say('ai_busts', true); settleResult('player'); return; }
    if (round.deck.length === 0 || opponentAction(state.roomNumber, round.ai) === 'stand') { settleResult(); return; }
    if (score.total >= OPPONENTS[state.roomNumber].peekMin && score.total <= OPPONENTS[state.roomNumber].peekMax && state.abilities.ai.peek) {
      const serial = state.peekSerial + 1;
      update({ phase: 'DEALER_PEEKING', abilities: { ...state.abilities, ai: { ...state.abilities.ai, peek: false } }, peekActor: 'ai', peekSerial: serial, message: 'The opponent checks the next card.', stats: recordAbility(state.stats, 'ai', 'peek') });
      say('opp_peeks');
      const avoidsBust = handScore([...round.ai, round.deck[0]]).bust;
      later(() => {
        if (current.current.phase !== 'DEALER_PEEKING' || current.current.peekSerial !== serial) return;
        update({ peekActor: null });
        if (avoidsBust) { update({ message: `${OPPONENTS[current.current.roomNumber].name} refuses the next card and stands.` }); settleResult(); }
        else drawForOpponent();
      }, 650);
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
    if (state.phase !== 'PLAYER_DECISION' || !state.round?.deck[0] || !state.abilities.player.peek) return;
    const serial = state.peekSerial + 1;
    update({ abilities: { ...state.abilities, player: { ...state.abilities.player, peek: false } },
      peekedCard: state.round.deck[0], peekActor: 'player', peekSerial: serial, message: 'You look beneath the next card.', stats: recordAbility(state.stats, 'player', 'peek') });
    say('player_peeks');
    later(() => { if (current.current.peekActor === 'player' && current.current.peekSerial === serial) update({ peekActor: null }); }, 650);
  }
  return { game, start, fold, hit, stand, pullTrigger, beginTriggerHold, endTriggerHold, spinCylinder, peek, finishSpeech, advanceOpening, skipOpening };
}
