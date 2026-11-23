/**
 * Online mode through the story-mode presentation: this hook turns the server's view of your table into the same
 * `game` state (and the same actions) that useGame provides, so the 3D scene, the HUD, the cylinder, the decision
 * clock, the trigger, the dialogue box and the heartbeat all behave exactly as in story mode.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG, handScore, type Card, type GamePhase } from '../game';
import { tableAudio } from '../audio';
import { attentionAt } from '../attention';
import { HOST, OPPONENTS, freshRunStats, type RoomNumber } from '../campaign';
import { HOST_DIALOGUE, OPPONENT_DIALOGUE, type HostCategory, type SpeechLine } from '../campaignDialogue';
import type { DialogueCategory } from '../dialogue';
import { readingHold } from '../readability';
import { freshAbilities } from '../tension';
import { GUN_SET_DOWN_MS, SPIN_SWIPE_MS, type GunTransfer } from '../gunTransfer';
import type { Reaction, ReactionKind } from '../reactions';
import type { Session } from '../useGame';
import { useOnline } from './useOnline';
import { DEAL_CARD_MS, GUN_SLIDE_MS, HOLE_CHECK_MS, SHUFFLE_MS, SPIN_MS, TRIGGER_HOLD_MS, isHidden, type RoomView, type TableView, type ViewCard } from './protocol';

/** A face-down stand-in (a valid card so totals can be computed; the HUD and the scene never show an unrevealed face). */
const faceDown = (card: ViewCard): Card => (isHidden(card) ? { suit: 'spades', rank: '2', id: card.id } : card);
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
/** Lines with {placeholders} need story-mode context; online uses the plain ones. */
const plain = (list: readonly string[] | undefined) => (list ?? []).filter(text => !text.includes('{'));

type Local = { held: boolean; progress: number; heldAt: number | null; pulled: boolean };

export function useOnlineGame(playerName: string, enabled: boolean) {
  const online = useOnline(playerName);
  const { view, clockOffset } = online;
  const [now, setNow] = useState(() => Date.now());
  const [trigger, setTrigger] = useState<Local>({ held: false, progress: 0, heldAt: null, pulled: false });
  const [speech, setSpeech] = useState<SpeechLine | null>(null);
  const [log, setLog] = useState<Array<SpeechLine & { name: string }>>([]);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const queue = useRef<SpeechLine[]>([]), speechTimer = useRef<number | null>(null), speechId = useRef(0), reactionId = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, Math.max(0, ms))); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); if (speechTimer.current) clearTimeout(speechTimer.current); }, []);
  // A fast clock while at a table (cards deal one by one, rings count down); slower in the lobby.
  useEffect(() => { if (!enabled) return; const id = setInterval(() => setNow(Date.now()), view?.table ? 50 : 250); return () => clearInterval(id); }, [enabled, !!view?.table]);

  const table = view?.table ?? null;
  const toLocal = (serverTime: number) => serverTime - clockOffset;
  const room = (Math.min(3, Math.max(1, view?.bracketRoom ?? 1)) as RoomNumber);
  const opponentSeat = table && view ? view.seats[table.opponent] : null;
  const opponentName = opponentSeat?.name ?? OPPONENTS[room].name;
  /** Computer guests (and dropped players the computer is playing) talk like the story-mode captives. */
  const opponentTalks = !!opponentSeat && (opponentSeat.kind === 'ai' || !opponentSeat.connected);
  const shooting = table?.phase === 'shooting' && table.shooter === table.me;
  const spinBusy = !!table?.spin && now < toLocal(table.spin.at) + SPIN_MS;
  const gunArriving = !!table && table.phase === 'shooting' && now < toLocal(table.phaseStartedAt) + GUN_SLIDE_MS;

  // ---- Dialogue: the same box and voices as story mode ----
  function publish(next: SpeechLine | null) {
    if (speechTimer.current) clearTimeout(speechTimer.current);
    setSpeech(next);
    if (!next) { tableAudio.stopVoice(); later(() => { const following = queue.current.shift(); if (following) publish(following); }, 120); return; }
    setLog(entries => [...entries, { ...next, name: next.speaker === 'host' ? HOST.name : opponentName }].slice(-20));
    speechTimer.current = window.setTimeout(() => finishSpeech(), readingHold(next.text) + next.text.length * 45);
  }
  function enqueue(line: SpeechLine | null, urgent = false) {
    if (!line || !line.text) return;
    if (urgent) { queue.current = [line, ...queue.current.filter(l => l.speaker === 'host' && l.category !== 'deal')]; if (speech) { tableAudio.stopVoice(); publish(null); return; } }
    else queue.current.push(line);
    if (!speech) publish(queue.current.shift()!);
  }
  function hostSay(category: HostCategory, text?: string, urgent = false) {
    const words = text ?? pick(plain(HOST_DIALOGUE[category]));
    if (words) enqueue({ id: ++speechId.current, speaker: 'host', category, text: words, danger: false, chambersFired: 0 }, urgent);
  }
  function opponentSay(category: DialogueCategory, urgent = false) {
    if (!opponentTalks) return;
    const words = pick(plain(OPPONENT_DIALOGUE[room][category]));
    const fired = table ? table.currentChamber - 1 : 0;
    if (words) enqueue({ id: ++speechId.current, speaker: 'captive', category, text: words, danger: !!table && table.currentChamber >= CONFIG.DANGER_CHAMBER, chambersFired: fired, addressedTo: 'player' }, urgent);
  }
  function finishSpeech() { if (speechTimer.current) clearTimeout(speechTimer.current); tableAudio.stopVoice(); publish(null); }
  function react(kind: ReactionKind) { if (opponentTalks || kind === 'player-click') setReaction({ id: ++reactionId.current, kind, room, startedAt: Date.now(), duration: 1500 }); }

  // ---- What happens at the table → sounds, lines and reactions (once per event) ----
  const heard = useRef(new Set<string>());
  const once = (key: string, fn: () => void) => { if (heard.current.has(key)) return; heard.current.add(key); if (heard.current.size > 600) heard.current.clear(); fn(); };
  const handKey = table && view ? `${view.code}:${view.bracketRoom}:${table.id}:${table.round}` : '';
  useEffect(() => {
    if (!enabled || !table || !view) return;
    const start = toLocal(table.phaseStartedAt);
    if (table.phase === 'dealing') once(`deal:${handKey}`, () => {
      hostSay('deal');
      for (let i = 0; i < 4; i++) later(() => tableAudio.play('card'), start + SHUFFLE_MS + i * DEAL_CARD_MS - Date.now());
      later(() => opponentSay(room === 1 ? 'nervous' : pick(['confident', 'nervous'] as const)), start + SHUFFLE_MS + 4 * DEAL_CARD_MS + HOLE_CHECK_MS - Date.now());
    });
    if (table.phase === 'reveal') once(`reveal:${handKey}`, () => tableAudio.play('card'));
    if ((table.phase === 'shooting' || table.phase === 'result') && table.outcome) once(`outcome:${handKey}`, () => {
      if (table.outcome === 'tie') { hostSay('round_result'); opponentSay('push'); }
      else if (table.outcome === 'win') { hostSay('round_result'); react('loss'); opponentSay('ai_loses_hand'); }
      else if (table.outcome === 'lose') { hostSay('round_result'); react('relief'); if (!handScore(table.myCards).bust) opponentSay('player_loses_hand'); }
      else if (table.outcome === 'fold') opponentSay('player_folds');
    });
    if (table.phase === 'shooting' && table.shooter === table.me) {
      const deadline = toLocal(table.phaseEndsAt);
      once(`warn10:${handKey}`, () => later(() => { if (current.current?.phase === 'shooting') hostSay('trigger_warning', 'Ten seconds.', true); }, deadline - 10000 - Date.now()));
      once(`warn5:${handKey}`, () => later(() => { if (current.current?.phase === 'shooting') hostSay('trigger_warning', 'Last chance to do it yourself.', true); }, deadline - 5000 - Date.now()));
    }
    if (table.phase === 'shooting' && table.shooter !== table.me && table.hold) {
      const hold = table.hold;
      once(`hold:${handKey}:${hold.startedAt}`, () => { tableAudio.play('tension'); later(() => tableAudio.play('hammer'), Math.min(900, hold.duration * .55)); });
    }
    if (table.spin) {
      const spin = table.spin;
      once(`spin:${handKey}:${spin.at}`, () => { later(() => tableAudio.play('spin'), toLocal(spin.at) + SPIN_SWIPE_MS - Date.now()); if (spin.seat !== table.me) opponentSay('opp_spins'); });
    }
    if (table.phase === 'forced' && table.forcedAt !== null) once(`forced:${handKey}`, () => {
      const at = toLocal(table.forcedAt!);
      hostSay('forced_shot', table.shooter === table.me ? 'Your time has elapsed.' : 'Time.', true);
      later(() => tableAudio.playContact('metal', 1), at + 2200 - Date.now());
      later(() => tableAudio.play('hammer'), at + 2800 - Date.now());
    });
    if (table.shot) {
      const shot = table.shot;
      once(`shot:${handKey}:${shot.at}`, () => {
        if (shot.fired) { tableAudio.playShot({ id: `online:${handKey}:${shot.at}`, kind: 'local', roomId: room }); queue.current = queue.current.filter(l => l.speaker === 'host'); if (speech?.speaker === 'captive' && shot.seat !== table.me) finishSpeech(); return; }
        tableAudio.play('click');
        if (shot.seat !== table.me) tableAudio.playStory('gasp');
        later(() => {
          if (shot.forced) hostSay('forced_shot');
          else if (shot.seat !== table.me) { react('survive'); opponentSay('ai_survives_click', true); }
          else { react('player-click'); opponentSay('player_survives_click', true); }
        }, GUN_SET_DOWN_MS + GUN_SLIDE_MS + 50);
      });
    }
  }, [enabled, handKey, table?.phase, table?.outcome, table?.hold?.startedAt, table?.spin?.at, table?.shot?.at]);
  const current = useRef<TableView | null>(null); current.current = table;
  // My own new cards (hits) and the opponent's hits during the decision.
  const lastCounts = useRef({ key: '', mine: 0, theirs: 0 });
  useEffect(() => {
    if (!table) return;
    const c = lastCounts.current;
    if (c.key !== handKey) { lastCounts.current = { key: handKey, mine: table.myCards.length, theirs: table.opponentCards.length }; return; }
    if (table.myCards.length > c.mine) { tableAudio.play('card'); opponentSay(handScore(table.myCards).bust ? 'player_busts' : 'player_hits'); }
    if (table.opponentCards.length > c.theirs) { tableAudio.play('card'); if (opponentTalks) opponentSay('ai_hits'); }
    lastCounts.current = { key: handKey, mine: table.myCards.length, theirs: table.opponentCards.length };
  }, [handKey, table?.myCards.length, table?.opponentCards.length]);
  useEffect(() => { if (table?.phase === 'deciding' && table.myDone && table.myCards.length === 2) once(`stand:${handKey}`, () => opponentSay('player_stands')); }, [table?.myDone]);

  // ---- The trigger: a 3-second hold, hammer at a third, clack at two thirds; release eases back ----
  useEffect(() => {
    if (!trigger.held || trigger.heldAt === null) return;
    const started = trigger.heldAt; let frame = 0;
    const step = () => {
      const progress = Math.min(1, (Date.now() - started) / TRIGGER_HOLD_MS);
      setTrigger(t => (t.heldAt === started ? { ...t, progress } : t));
      if (progress >= 1) { setTrigger(t => ({ ...t, pulled: true })); online.act('pull'); return; }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [trigger.held, trigger.heldAt]);
  useEffect(() => {
    if (trigger.held || trigger.progress <= 0 || trigger.pulled) return;
    const from = trigger.progress, started = Date.now(); let frame = 0;
    const drain = () => { const f = Math.min(1, (Date.now() - started) / 600); setTrigger(t => (t.held || t.pulled ? t : { ...t, progress: from * (1 - f) })); if (f < 1) frame = requestAnimationFrame(drain); };
    frame = requestAnimationFrame(drain); return () => cancelAnimationFrame(frame);
  }, [trigger.held]);
  useEffect(() => { if (!shooting) setTrigger({ held: false, progress: 0, heldAt: null, pulled: false }); }, [shooting, handKey]);
  function beginTriggerHold() {
    if (!shooting || spinBusy || gunArriving || trigger.held || trigger.pulled) return;
    const at = Date.now(); setTrigger({ held: true, progress: 0, heldAt: at, pulled: false }); online.act('hold');
    later(() => { if (heldRef.current === at) tableAudio.play('hammer'); }, TRIGGER_HOLD_MS / 3);
    later(() => { if (heldRef.current === at) tableAudio.play('clack'); }, TRIGGER_HOLD_MS * 2 / 3);
  }
  const heldRef = useRef<number | null>(null); heldRef.current = trigger.held ? trigger.heldAt : null;
  function endTriggerHold() {
    if (!trigger.held || trigger.pulled) return;
    setTrigger(t => ({ ...t, held: false, heldAt: null })); online.act('release');
  }

  // ---- The story-mode game state ----
  const built: Session = useMemo(() => buildSession(view, table, clockOffset, trigger, now, { speech, log, reaction, opponentName, shooting, spinBusy, gunArriving }),
    [view, clockOffset, trigger, now, speech, log, reaction, opponentName]);
  // The scene re-deals whenever the round object changes, so keep the same object while the cards are the same.
  const lastRound = useRef<Session['round']>(null);
  const roundKey = (r: Session['round']) => (r ? `${r.player.map(c => c.id + c.rank).join(',')}|${r.ai.map(c => c.id + c.rank).join(',')}` : '');
  if (roundKey(built.round) !== roundKey(lastRound.current)) lastRound.current = built.round;
  const game: Session = built.round === lastRound.current ? built : { ...built, round: lastRound.current };

  const act = (a: Parameters<typeof online.act>[0]) => { if (enabled) online.act(a); };
  return {
    game, online, opponentName, now, displayRound: table?.round ?? 0, decided: !!table && table.phase === 'deciding' && table.myDone,
    hit: () => act('hit'), stand: () => act('stand'), fold: () => act('fold'),
    spinCylinder: () => { if (shooting && !trigger.held && trigger.progress === 0 && !spinBusy && !gunArriving) act('spin'); },
    beginTriggerHold, endTriggerHold, finishSpeech,
    finishTyping: (_skipped?: boolean) => undefined, peek: () => undefined, pullTrigger: () => undefined, start: () => undefined,
    advanceOpening: () => undefined, skipOpening: () => undefined, setOpponentInView: () => undefined, pauseDecisionClock: () => undefined,
  };
}

export function buildSession(view: RoomView | null, t: TableView | null, clockOffset: number, trigger: Local, now: number,
  extra: { speech: SpeechLine | null; log: Array<SpeechLine & { name: string }>; reaction: Reaction | null; opponentName: string; shooting: boolean; spinBusy: boolean; gunArriving: boolean }): Session {
  const toLocal = (serverTime: number) => serverTime - clockOffset;
  const room = (Math.min(3, Math.max(1, view?.bracketRoom ?? 1)) as RoomNumber);
  const abilities = freshAbilities(); abilities.player.peek = false; abilities.ai.peek = false;
  if (t?.spinUsed) abilities.player.spin = false;
  // The other tables on the CCTV wall: a table whose game ended goes to NO SIGNAL.
  const feedDeaths = (view?.feeds ?? []).map((f, i) => (f.phase === 'over' ? i + 2 : 0)).filter(Boolean);
  const base: Session = {
    phase: 'START', round: null, roundNumber: 0, folds: CONFIG.MAX_FOLDS, roomNumber: room, guestsRemaining: view?.guestsRemaining ?? 8,
    feedDeaths, feedDeathSerial: feedDeaths.length, speech: extra.speech, speechQueue: [], dialogueLog: extra.log, reaction: extra.reaction,
    introIndex: 0, introShort: false, storyStage: 'table', stats: freshRunStats(), revolver: { bulletChamber: 0, currentChamber: t?.currentChamber ?? 1 },
    dialogue: extra.speech?.text ?? '', dialogueCategory: 'intro', dialogueDanger: false, dialogueChambersFired: 0, revealed: false, result: null,
    message: '', suspense: false, awaitingTrigger: false, hasHit: false, dead: null, shotEffect: null, abilities, tell: null,
    triggerHeld: false, triggerProgress: 0, spinning: null, spinSerial: 0, peekActor: null, peekSerial: 0, peekedCard: null, event: null,
    cinematic: null, tiesCut: { player: true, ai: true }, distantShot: null, ambientEvent: null, shotId: null, aiShotStartedAt: null, aiShotDurationMs: null,
    attention: attentionAt(null, now), peekStartedAt: null, caught: null, triggerDeadline: null, triggerRemainingMs: null, forceShotAt: null, forceTarget: null,
    decisionDeadline: null, decisionPausedMs: null, stress: .22 + Math.max(0, (t?.currentChamber ?? 1) - 1) * .1, lossStreak: 0, gunTransfer: null,
  };
  if (!view || view.stage === 'lobby') return base;
  if (!t || t.phase === 'over') {
    const meAlive = view.seats[view.you]?.alive;
    const shot = t?.shot;
    return { ...base, phase: t ? 'ROUND_RESULT' : 'SHUFFLING', round: t ? { player: t.myCards, ai: t.opponentCards.map(faceDown), deck: [] } : null,
      roundNumber: t ? view.bracketRoom * 1000 + t.id * 100 + t.round : 0, revealed: !!t, dead: shot?.fired ? (shot.seat === t!.me ? 'player' : 'ai') : (meAlive ? null : 'player'),
      shotEffect: shot ? (shot.fired ? 'shot' : 'click') : null };
  }
  const start = toLocal(t.phaseStartedAt), end = toLocal(t.phaseEndsAt), age = now - start;
  const opponentCards = t.opponentCards.map(faceDown);
  const roundNumber = view.bracketRoom * 1000 + t.id * 100 + t.round;
  const shooterSide = t.shooter === null ? null : t.shooter === t.me ? 'player' as const : 'ai' as const;
  const spinActive = t.spin && now < toLocal(t.spin.at) + SPIN_MS;
  const spinning = spinActive ? (t.spin!.seat === t.me ? 'player' as const : 'ai' as const) : null;
  const winnerSide = t.outcome === 'win' ? 'player' as const : t.outcome === 'lose' ? 'ai' as const : t.outcome === 'tie' ? 'tie' as const : null;
  const common: Session = { ...base, roundNumber, folds: t.folds, hasHit: t.myCards.length > 2, spinning, spinSerial: t.spin?.at ?? 0,
    round: { player: t.myCards, ai: opponentCards, deck: [] }, result: winnerSide };
  const slide = (side: 'player' | 'ai'): GunTransfer | null => (now < start + GUN_SLIDE_MS ? { stage: 'to-shooter', side, owner: side, startedAt: start, duration: GUN_SLIDE_MS } : null);
  switch (t.phase) {
    case 'dealing': {
      // Shuffle, then the four cards one at a time (you, them, you, them), then the hole-card check.
      if (age < SHUFFLE_MS) return { ...common, phase: 'SHUFFLING', round: { player: [], ai: [], deck: [] }, message: 'The Host shuffles.' };
      const dealt = Math.min(4, 1 + Math.floor((age - SHUFFLE_MS) / DEAL_CARD_MS));
      const phase: GamePhase = age >= SHUFFLE_MS + 4 * DEAL_CARD_MS ? 'PEEKING' : 'DEALING';
      return { ...common, phase, round: { player: t.myCards.slice(0, Math.ceil(dealt / 2)), ai: opponentCards.slice(0, Math.floor(dealt / 2)), deck: [] },
        message: phase === 'PEEKING' ? `${extra.opponentName} checks the hole card.` : 'Dealing a fresh hand…' };
    }
    case 'deciding':
      return { ...common, phase: 'PLAYER_DECISION', decisionDeadline: t.myDone ? null : end,
        message: t.myDone ? (t.opponentDone ? 'Both hands are in.' : `Waiting for ${extra.opponentName}…`) : 'Your move. Hit, stand, or fold.' };
    case 'reveal':
      return { ...common, phase: 'REVEAL', revealed: true, suspense: true, message: 'Cards on the table.' };
    case 'shooting': {
      if (shooterSide === 'player') {
        const ready = !extra.gunArriving && !extra.spinBusy && !trigger.pulled;
        return { ...common, phase: 'PLAYER_SHOOTING', revealed: true, suspense: true, gunTransfer: slide('player'), awaitingTrigger: ready,
          triggerHeld: trigger.held, triggerProgress: trigger.pulled ? 1 : trigger.progress, triggerDeadline: end, triggerRemainingMs: extra.gunArriving ? null : Math.max(0, end - now),
          message: trigger.held ? 'Keep holding. Do not let go.' : extra.spinBusy ? 'The cylinder turns. Six chambers again.' : 'You lost the hand. Hold to pull the trigger.' };
      }
      const hold = t.hold && t.hold.seat !== t.me ? t.hold : null;
      return { ...common, phase: 'AI_SHOOTING', revealed: true, suspense: true, gunTransfer: slide('ai'),
        aiShotStartedAt: hold ? toLocal(hold.startedAt) : null, aiShotDurationMs: hold ? hold.duration : null,
        message: spinning === 'ai' ? 'The cylinder turns. Six chambers again.' : `${extra.opponentName} lost the hand.` };
    }
    case 'forced':
      return { ...common, phase: 'HOST_FORCE_SHOT', revealed: true, suspense: true, forceShotAt: t.forcedAt !== null ? toLocal(t.forcedAt) : start,
        forceTarget: shooterSide, message: 'The Host will complete the procedure.' };
    case 'result': {
      const shot = t.shot, side = shot ? (shot.seat === t.me ? 'player' as const : 'ai' as const) : null;
      const returnAt = shot ? toLocal(shot.at) + GUN_SET_DOWN_MS : 0;
      const gunTransfer: GunTransfer | null = shot && side && (!shot.fired || shot.forced) && now >= returnAt && now < returnAt + GUN_SLIDE_MS
        ? { stage: 'return', side, owner: shot.forced ? 'host' : side, startedAt: returnAt, duration: GUN_SLIDE_MS } : null;
      const message = t.outcome === 'fold' ? 'A fold. The chamber waits.' : t.outcome === 'tie' ? 'PUSH — nobody shoots'
        : shot ? (shot.fired ? '' : 'Click. An empty chamber.') : '';
      return { ...common, phase: 'ROUND_RESULT', revealed: t.outcome !== 'fold', shotEffect: shot ? (shot.fired ? 'shot' : 'click') : null,
        dead: shot?.fired ? side : null, triggerProgress: side === 'player' && !shot?.forced ? 1 : 0, gunTransfer,
        forceShotAt: shot?.forced && t.forcedAt !== null ? toLocal(t.forcedAt) : null, forceTarget: shot?.forced ? side : null, message,
        shotId: shot ? `online:${roundNumber}:${shot.at}` : null };
    }
  }
  return common;
}
