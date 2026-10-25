import { GUN_SLIDE_MS, GUN_SET_DOWN_MS } from './gunTransfer';
import { planAttention } from './attention';
// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useGame } from './useGame';
import { CONFIG, createDeck, createRevolver, dealRound, handTotal, type Card, type Round } from './game';
import { HOST, OPPONENTS, opponentAction } from './campaign';
import { HOST_DIALOGUE, OPENING_LINES, OPPONENT_DIALOGUE, SHORT_INTRO, shouldExchange } from './campaignDialogue';
import type { DialogueCategory } from './dialogue';
import { tableAudio } from './audio';
import { createVoicePlan } from './voice';
import { chooseRoundEvent, cosmeticRandom } from './tension';
import { OPENING_STAGES, stageDurationMs, type CinematicStage } from './cinematics';
import { DISTANT_SHOT_GAP_MS } from './roomLife';

vi.mock('./Scene', () => ({ default: () => null }));
vi.mock('./attention', async importOriginal => { const actual = await importOriginal<typeof import('./attention')>(); return { ...actual, planAttention: vi.fn(actual.planAttention) }; });
vi.mock('./audio', () => ({ tableAudio: { init: vi.fn(), play: vi.fn(), mute: vi.fn(), startVoice: vi.fn(), stopVoice: vi.fn(), getVoiceLevel: vi.fn(() => 0), setHeartbeat: vi.fn(), setEvent: vi.fn(), playStory: vi.fn(), getHeartbeatLevel: vi.fn(() => 0), playShot: vi.fn(() => true), setHooded: vi.fn(), playContact: vi.fn(), playAmbient: vi.fn() } }));
vi.mock('./tension', async importOriginal => {
  const actual = await importOriginal<typeof import('./tension')>();
  return { ...actual, chooseRoundEvent: vi.fn(() => null), cosmeticRandom: vi.fn(() => .5) };
});
vi.mock('./campaignDialogue', async importOriginal => {
  const actual = await importOriginal<typeof import('./campaignDialogue')>();
  return { ...actual, shouldExchange: vi.fn(() => false) };
});
vi.mock('./game', async importOriginal => {
  const actual = await importOriginal<typeof import('./game')>();
  return { ...actual, createRevolver: vi.fn(), dealRound: vi.fn() };
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const card = (rank: string, suit: Card['suit']): Card => ({ rank, suit, id: `${suit}-${rank}` });
function fixture(player: Card[], ai: Card[], next: Card[] = []): Round {
  const used = new Set([...player, ...ai, ...next].map(card => card.id));
  return { player, ai, deck: [...next, ...createDeck().filter(card => !used.has(card.id))] };
}
function copy(round: Round): Round { return { player: [...round.player], ai: [...round.ai], deck: [...round.deck] }; }
const playerWins = fixture([card('K', 'spades'), card('Q', 'hearts')], [card('9', 'clubs'), card('8', 'diamonds')]);
const playerLoses = fixture([card('7', 'spades'), card('8', 'hearts')], [card('K', 'clubs'), card('Q', 'diamonds')]);
const tied = fixture([card('K', 'spades'), card('7', 'hearts')], [card('9', 'clubs'), card('8', 'diamonds')]);
const playerBusts = fixture([card('10', 'spades'), card('9', 'hearts')], [card('2', 'clubs'), card('3', 'diamonds')], [card('5', 'spades')]);
// A safe PEEK is spent at 12; the later unprotected draw busts at 24.
const dealerBusts = fixture([card('9', 'spades'), card('8', 'hearts')], [card('K', 'clubs'), card('2', 'diamonds')], [card('2', 'hearts'), card('K', 'hearts')]);
const safeHits = fixture([card('2', 'spades'), card('3', 'hearts')], [card('9', 'clubs'), card('8', 'diamonds')], [card('4', 'clubs'), card('5', 'diamonds'), card('6', 'clubs'), card('2', 'diamonds')]);
const DEAL_COMPLETE = 500 + 4 * 650 + 600;
const FOLD_TO_DECISION = 700 + DEAL_COMPLETE;
const DEALER_BUST_MS = 950 + CONFIG.PEEK_DURATION_MS + 2 * (CONFIG.DEAL_SPEED + 200);
const AI_INITIAL_HESITATION = 2000;
const GUARD_TO_RULES = OPENING_STAGES.slice(0, OPENING_STAGES.indexOf('rules')).reduce((sum, stage) => sum + stageDurationMs(stage), 0);
const CUT_TO_DEAL = stageDurationMs('cut-opponent') + stageDurationMs('cut-player') + stageDurationMs('rub-wrists');

let latest!: ReturnType<typeof useGame>;
function Harness() { latest = useGame(); return null; }
let container: HTMLDivElement, root: Root, rootMounted: boolean;
function mount(element: ReactNode = <Harness/>) { act(() => root.render(element)); }
function advance(milliseconds: number) { act(() => vi.advanceTimersByTime(milliseconds)); }
function startDecision() { mount(); startMatch(); advance(DEAL_COMPLETE); expect(latest.game.phase).toBe('PLAYER_DECISION'); }
function waitPeekWindow() {
  for (let elapsed=0;elapsed<10000&&!latest.game.attention.window;elapsed+=50) advance(50);
  expect(latest.game.attention.window).toBe(true);
}
function peekSuccessfully() {
  waitPeekWindow(); act(() => latest.peek()); advance(CONFIG.PEEK_DURATION_MS);
  expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.peekedCard).not.toBeNull();
}
function prepareUnseenPeek() { waitPeekWindow(); act(() => latest.setOpponentInView(false)); }
function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(node => node.textContent?.includes(text));
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}
function clickRaw(text: string) { act(() => button(text).click()); }
function click(text: string) {
  clickRaw(text);
  if (text === 'Sit down') clickRaw('Skip introduction');
}
function startMatch() { act(() => { latest.start(); latest.skipOpening(); }); }
function allSpeech() { return [...(latest.game.speech ? [latest.game.speech] : []), ...latest.game.speechQueue]; }
function assertCaptiveLine(category: DialogueCategory) {
  const line = [...allSpeech()].reverse().find(item => item.speaker === 'captive' && item.category === category);
  expect(line).toBeTruthy(); expect(OPPONENT_DIALOGUE[latest.game.roomNumber][category]).toContain(line?.text);
  return line!;
}
function advanceStoryUntil(predicate: () => boolean, maxMs = 60000) {
  const deadline = Date.now() + maxMs;
  while (!predicate() && Date.now() < deadline) {
    if (latest.game.phase === 'OPENING') act(() => latest.skipOpening());
    else if (latest.game.speech) act(() => latest.finishSpeech());
    advance(100);
  }
  expect(predicate()).toBe(true);
}
function finishQueuedSpeech() {
  for (let i = 0; i < 40 && (latest.game.speech || latest.game.speechQueue.length || latest.game.gunTransfer?.stage === 'to-shooter'); i++) {
    if (latest.game.speech) act(() => latest.finishSpeech());
    advance(100);
  }
}
function showAppCaptiveLine(category: DialogueCategory) {
  for (let i = 0; i < 30; i++) {
    const line = container.querySelector('.dialogue')?.getAttribute('aria-label')?.replace(/ Click to finish dialogue\.$/, '');
    if (line && OPPONENT_DIALOGUE[1][category].includes(line)) return line;
    const dialogue = container.querySelector<HTMLButtonElement>('.dialogue');
    if (dialogue) act(() => dialogue.click());
    advance(100);
  }
  throw new Error(`No visible captive ${category} line`);
}
const localShots = () => vi.mocked(tableAudio.playShot).mock.calls.filter(([shot]) => shot.kind === 'local');
const distantShots = () => vi.mocked(tableAudio.playShot).mock.calls.filter(([shot]) => shot.kind === 'distant');
function holdTrigger() { act(() => latest.beginTriggerHold()); advance(CONFIG.TRIGGER_HOLD_MS); }
function startPlayerShot() {
  vi.mocked(dealRound).mockImplementation(() => copy(playerLoses)); startDecision();
  act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS);
  expect(latest.game.phase).toBe('PLAYER_SHOOTING');
}
function nextDecisionAfterEmptyShot() { advance(3400 + 700 + DEAL_COMPLETE); expect(latest.game.phase).toBe('PLAYER_DECISION'); }

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  vi.mocked(chooseRoundEvent).mockReturnValue(null);
  vi.mocked(cosmeticRandom).mockReturnValue(.5);
  vi.mocked(shouldExchange).mockReturnValue(false);
  vi.mocked(createRevolver).mockImplementation(() => ({ bulletChamber: 6, currentChamber: 1 }));
  vi.mocked(dealRound).mockImplementation(() => copy(playerWins));
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container); rootMounted = true;
});
afterEach(() => { if (rootMounted) act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('blackjack dealing and input locks', () => {
  it('cancels all pending deal and transition timers on unmount', () => {
    mount(); startMatch(); expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => root.unmount()); rootMounted = false;
    expect(vi.getTimerCount()).toBe(0); advance(10000); expect(dealRound).toHaveBeenCalledTimes(1);
  });

  it('shuffles, then deals P / Stranger up / P / Stranger hole one at a time with a sound each', () => {
    mount(); startMatch();
    expect(latest.game.phase).toBe('SHUFFLING');
    expect(latest.game.round?.player).toHaveLength(0); expect(latest.game.round?.ai).toHaveLength(0);
    act(() => { latest.hit(); latest.stand(); latest.fold(); latest.pullTrigger(); });
    expect(latest.game.phase).toBe('SHUFFLING'); expect(latest.game.folds).toBe(3);
    advance(500);
    expect(latest.game.phase).toBe('DEALING');
    expect(latest.game.round?.player).toEqual([playerWins.player[0]]); expect(latest.game.round?.ai).toHaveLength(0);
    advance(CONFIG.DEAL_SPEED);
    expect(latest.game.round?.ai).toEqual([playerWins.ai[0]]); expect(latest.game.round?.player).toHaveLength(1);
    advance(CONFIG.DEAL_SPEED);
    expect(latest.game.round?.player).toEqual(playerWins.player); expect(latest.game.round?.ai).toHaveLength(1);
    advance(CONFIG.DEAL_SPEED);
    expect(latest.game.round?.ai).toEqual(playerWins.ai); expect(latest.game.round?.deck).toHaveLength(48);
    expect(vi.mocked(tableAudio.play).mock.calls.filter(([sound]) => sound === 'card')).toHaveLength(4);
    advance(CONFIG.DEAL_SPEED); expect(latest.game.phase).toBe('PEEKING');
    expect(latest.game.revealed).toBe(false);
    advance(600); expect(latest.game.phase).toBe('PLAYER_DECISION');
    expect(latest.game.dialogue).toBeTruthy();
  });

  it('allows exactly three folds, never shoots for a fold, and rejects double actions', () => {
    startDecision();
    for (let remaining = 2; remaining >= 0; remaining--) {
      act(() => { latest.fold(); latest.fold(); latest.hit(); latest.stand(); latest.pullTrigger(); });
      expect(latest.game.phase).toBe('SWEEPING'); expect(latest.game.folds).toBe(remaining);
      expect(latest.game.revolver.currentChamber).toBe(1); advance(FOLD_TO_DECISION);
      expect(latest.game.phase).toBe('PLAYER_DECISION');
    }
    act(() => latest.fold());
    expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.folds).toBe(0); expect(latest.game.roundNumber).toBe(4);
    expect(tableAudio.play).not.toHaveBeenCalledWith('tension'); expect(tableAudio.play).not.toHaveBeenCalledWith('click');
  });

  it('locks HIT animations, disables folding after the first hit, and permits repeated safe hits', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(safeHits)); startDecision();
    for (let hits = 1; hits <= 3; hits++) {
      const before = latest.game.round!;
      act(() => { latest.hit(); latest.hit(); latest.fold(); latest.stand(); latest.pullTrigger(); });
      expect(latest.game.phase).toBe('HITTING'); expect(latest.game.hasHit).toBe(true);
      expect(latest.game.round?.player).toHaveLength(2 + hits); expect(latest.game.round?.deck).toHaveLength(48 - hits);
      expect(before.player).toHaveLength(1 + hits); expect(latest.game.folds).toBe(3);
      advance(CONFIG.DEAL_SPEED); expect(latest.game.phase).toBe('PLAYER_DECISION');
      act(() => latest.fold()); expect(latest.game.phase).toBe('PLAYER_DECISION');
    }
    expect(handTotal(latest.game.round!.player)).toBe(20);
    const all = [...latest.game.round!.player, ...latest.game.round!.ai, ...latest.game.round!.deck];
    expect(new Set(all.map(card => card.id)).size).toBe(52);
  });

  it('locks duplicate STAND and all actions throughout reveal', () => {
    startDecision();
    act(() => { latest.stand(); latest.stand(); latest.hit(); latest.fold(); latest.pullTrigger(); });
    expect(latest.game.phase).toBe('REVEAL'); expect(latest.game.revealed).toBe(true); expect(latest.game.folds).toBe(3);
    advance(950); expect(latest.game.result).toBe('player'); expect(latest.game.revolver.currentChamber).toBe(1);
    expect(dealRound).toHaveBeenCalledTimes(1);
  });
});

describe('blackjack outcomes and dealer rules', () => {
  it('player BUST ends the hand immediately without any Stranger draw', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(playerBusts)); startDecision();
    act(() => latest.hit()); advance(CONFIG.DEAL_SPEED);
    expect(latest.game.phase).toBe('REVEAL'); expect(latest.game.revealed).toBe(true);
    expect(handTotal(latest.game.round!.player)).toBe(24);
    expect(latest.game.round!.ai).toEqual(playerBusts.ai); expect(latest.game.round!.deck).toHaveLength(47);
    assertCaptiveLine('player_busts');
    advance(950 + 1500 + GUN_SLIDE_MS); expect(latest.game.phase).toBe('PLAYER_SHOOTING');
    advance(1000); expect(latest.game.awaitingTrigger).toBe(true);
    expect(latest.game.round!.ai).toEqual(playerBusts.ai); expect(latest.game.revolver.currentChamber).toBe(1);
  });

  it('draws sequentially from the remaining deck until the Stranger reaches seventeen', () => {
    const drawing = fixture([card('10', 'spades'), card('8', 'hearts')], [card('2', 'clubs'), card('3', 'diamonds')], [card('4', 'spades'), card('8', 'diamonds')]);
    vi.mocked(dealRound).mockImplementation(() => copy(drawing)); startDecision();
    act(() => latest.stand()); advance(950);
    expect(latest.game.phase).toBe('DEALER_TURN'); expect(handTotal(latest.game.round!.ai)).toBe(9);
    expect(latest.game.round!.ai).toHaveLength(3);
    advance(CONFIG.DEAL_SPEED + 200); expect(handTotal(latest.game.round!.ai)).toBe(17); expect(latest.game.round!.ai).toHaveLength(4);
    advance(CONFIG.DEAL_SPEED + 200); expect(latest.game.phase).toBe('ROUND_RESULT'); expect(latest.game.result).toBe('player');
    expect(latest.game.round!.deck).toHaveLength(46);
    const all = [...latest.game.round!.player, ...latest.game.round!.ai, ...latest.game.round!.deck];
    expect(new Set(all.map(card => card.id)).size).toBe(52);
  });

  it('stands on Soft 17 and does not draw another card', () => {
    const softDealer = fixture(playerWins.player, [card('A', 'clubs'), card('6', 'diamonds')]);
    vi.mocked(dealRound).mockImplementation(() => copy(softDealer)); startDecision();
    act(() => latest.stand()); advance(950);
    expect(latest.game.phase).toBe('ROUND_RESULT'); expect(latest.game.round!.ai).toHaveLength(2);
    expect(latest.game.result).toBe('player');
  });

  it('makes a busting Stranger lose and automatically shoot', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(dealerBusts)); startDecision();
    act(() => latest.stand()); advance(DEALER_BUST_MS);
    expect(latest.game.result).toBe('player'); expect(handTotal(latest.game.round!.ai)).toBe(24);
    assertCaptiveLine('ai_busts');
    advance(1500); expect(latest.game.phase).toBe('AI_SHOOTING'); expect(latest.game.awaitingTrigger).toBe(false);
    finishQueuedSpeech(); advance(AI_INITIAL_HESITATION); expect(latest.game.revolver.currentChamber).toBe(2); expect(latest.game.shotEffect).toBe('click');
  });

  it('a PUSH skips shooting without consuming a fold or a chamber, then sweeps before dealing again', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(tied)); startDecision();
    act(() => latest.stand()); advance(950);
    expect(latest.game.result).toBe('tie'); expect(latest.game.message).toMatch(/push/i);
    expect(latest.game.folds).toBe(3); expect(latest.game.revolver.currentChamber).toBe(1);
    assertCaptiveLine('push');
    advance(2000); expect(latest.game.phase).toBe('SWEEPING');
    advance(700 + DEAL_COMPLETE); expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.roundNumber).toBe(2);
    expect(latest.game.folds).toBe(3); expect(latest.game.revolver.currentChamber).toBe(1);
    expect(tableAudio.play).not.toHaveBeenCalledWith('tension');
  });
});

describe('shared revolver, continuous trigger hold, and replay', () => {
  it('ignores a click before the deadline and fires once only after a complete hold', () => {
    startPlayerShot();
    advance(1000); expect(latest.game.awaitingTrigger).toBe(true); expect(latest.game.revolver.currentChamber).toBe(1);
    act(() => latest.pullTrigger()); advance(3000);
    expect(latest.game.phase).toBe('PLAYER_SHOOTING'); expect(latest.game.shotEffect).toBeNull();
    act(() => { latest.beginTriggerHold(); latest.beginTriggerHold(); latest.hit(); latest.stand(); latest.fold(); });
    expect(latest.game.triggerHeld).toBe(true); expect(latest.game.suspense).toBe(true);
    advance(CONFIG.TRIGGER_HOLD_MS - 1);
    expect(latest.game.revolver.currentChamber).toBe(1); expect(latest.game.shotEffect).toBeNull();
    advance(1); expect(latest.game.shotEffect).toBe('click'); expect(latest.game.revolver.currentChamber).toBe(2);
    act(() => { latest.beginTriggerHold(); latest.endTriggerHold(); latest.pullTrigger(); });
    expect(latest.game.revolver.currentChamber).toBe(2);
    expect(latest.game.dead).toBeNull(); expect(latest.game.folds).toBe(3);
    nextDecisionAfterEmptyShot();
  });

  it('automatically makes only a losing Stranger shoot after a visible hesitation', () => {
    startDecision(); act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS);
    expect(latest.game.result).toBe('player'); expect(latest.game.phase).toBe('AI_SHOOTING');
    expect(latest.game.awaitingTrigger).toBe(false); act(() => latest.beginTriggerHold());
    expect(latest.game.triggerHeld).toBe(false); expect(latest.game.suspense).toBe(true);
    finishQueuedSpeech(); advance(1499); expect(latest.game.revolver.currentChamber).toBe(1);
    advance(AI_INITIAL_HESITATION - 1499);
    expect(latest.game.revolver.currentChamber).toBe(2); expect(latest.game.shotEffect).toBe('click'); expect(latest.game.dead).toBeNull();
  });

  it('keeps the same chamber pointer when the shooter changes across rounds', () => {
    startDecision(); act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS); finishQueuedSpeech(); advance(AI_INITIAL_HESITATION);
    expect(latest.game.revolver.currentChamber).toBe(2);
    vi.mocked(dealRound).mockImplementation(() => copy(playerLoses)); nextDecisionAfterEmptyShot();
    expect(latest.game.roundNumber).toBe(2); expect(latest.game.revolver.currentChamber).toBe(2);
    act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS); holdTrigger();
    expect(latest.game.revolver.currentChamber).toBe(3); expect(latest.game.shotEffect).toBe('click');
  });

  it.each(['player', 'ai'] as const)('ends with %s dead only when that loser fires the loaded chamber', dead => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 });
    vi.mocked(dealRound).mockImplementation(() => copy(dead === 'player' ? playerLoses : playerWins));
    startDecision(); act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS);
    if (dead === 'player') holdTrigger(); else { finishQueuedSpeech(); advance(AI_INITIAL_HESITATION); }
    expect(latest.game.dead).toBe(dead); expect(latest.game.shotEffect).toBe('shot');
    expect(latest.game.revolver.currentChamber).toBe(2); advance(2400); expect(latest.game.phase).toBe(dead === 'player' ? 'ENDING_DEATH' : 'TRANSITION');
    const phase = latest.game.phase;
    act(() => { latest.hit(); latest.stand(); latest.fold(); latest.beginTriggerHold(); latest.pullTrigger(); });
    expect(latest.game.phase).toBe(phase);
  });

  it('Play Again resets abilities, hold progress, folds, revolver, and death state', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 }); startDecision();
    peekSuccessfully();
    vi.mocked(dealRound).mockImplementation(() => copy(playerBusts)); act(() => latest.fold()); advance(FOLD_TO_DECISION);
    act(() => latest.hit()); advance(CONFIG.DEAL_SPEED + 950 + 1500 + GUN_SLIDE_MS);
    act(() => latest.spinCylinder()); advance(800); holdTrigger(); advanceStoryUntil(() => latest.game.phase === 'GAME_OVER');
    expect(latest.game.phase).toBe('GAME_OVER'); expect(latest.game.hasHit).toBe(true); expect(latest.game.folds).toBe(2);
    expect(latest.game.abilities.player).toEqual({ spin: false, peek: false });
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 4, currentChamber: 1 }); startMatch();
    expect(latest.game.phase).toBe('SHUFFLING'); expect(latest.game.roundNumber).toBe(1);
    expect(latest.game.revolver).toEqual({ bulletChamber: 4, currentChamber: 1 }); expect(latest.game.folds).toBe(3);
    expect(latest.game.hasHit).toBe(false); expect(latest.game.dead).toBeNull(); expect(latest.game.shotEffect).toBeNull();
    expect(latest.game.suspense).toBe(false); expect(latest.game.awaitingTrigger).toBe(false); expect(latest.game.result).toBeNull();
    expect(latest.game.triggerProgress).toBe(0); expect(latest.game.triggerHeld).toBe(false);
    expect(latest.game.abilities).toEqual({ player: { spin: true, peek: true }, ai: { spin: true, peek: true } });
    expect(latest.game.peekedCard).toBeNull(); expect(latest.game.event).toBeNull();
    expect(latest.game.round!.player).toHaveLength(0); expect(latest.game.round!.ai).toHaveLength(0);
  });
});

describe('rendered blackjack controls and hidden information', () => {
  it('keeps an actual pointer hold active through progress rerenders and cancels an early release', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(playerLoses));
    mount(<App/>); click('Sit down'); advance(DEAL_COMPLETE); click('STAND'); advance(950 + 1500 + GUN_SLIDE_MS);
    function pointer(type: 'pointerdown' | 'pointerup') {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { button: 0, pointerId: 1, isPrimary: true });
      act(() => button('HOLD TO PULL').dispatchEvent(event));
    }
    pointer('pointerdown'); advance(CONFIG.TRIGGER_HOLD_MS / 2);
    expect(button('HOLD TO PULL').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
    expect(container.querySelector('.cylinder')?.getAttribute('aria-label')).toContain('0 trigger pulls used');
    pointer('pointerup');
    expect(button('HOLD TO PULL').getAttribute('aria-pressed')).toBe('false');
    advance(CONFIG.TRIGGER_HOLD_MS);
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');
    expect(container.querySelector('.cylinder')?.getAttribute('aria-label')).toContain('0 trigger pulls used');
    pointer('pointerdown'); advance(CONFIG.TRIGGER_HOLD_MS);
    expect(container.querySelector('.cylinder')?.getAttribute('aria-label')).toContain('1 trigger pulls used');
    expect(vi.mocked(tableAudio.play).mock.calls.filter(([sound]) => sound === 'click')).toHaveLength(1);
  });

  it('unmounts an App with an active pointer hold without recreating drain timers or firing', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(playerLoses));
    mount(<App/>); click('Sit down'); advance(DEAL_COMPLETE); click('STAND'); advance(950 + 1500 + GUN_SLIDE_MS);
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(down, { button: 0, pointerId: 1, isPrimary: true });
    act(() => button('HOLD TO PULL').dispatchEvent(down)); advance(1000);
    expect(button('HOLD TO PULL').getAttribute('aria-pressed')).toBe('true');
    expect(Number(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    act(() => root.unmount()); rootMounted = false;
    expect(vi.getTimerCount()).toBe(0); advance(10000);
    expect(tableAudio.play).not.toHaveBeenCalledWith('click');
    expect(localShots()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the hole card and Stranger total hidden until STAND and locks actions during reveal', () => {
    mount(<App/>); click('Sit down'); advance(DEAL_COMPLETE);
    const hidden = container.querySelector('.opponent-cards .card-hidden');
    expect(hidden?.getAttribute('aria-label')).toBe('Face-down card');
    expect(hidden?.querySelector('.card-front')?.textContent ?? '').toBe('');
    expect(container.querySelector('.opponent-readout')?.textContent).toContain('??');
    expect(container.querySelector('.opponent-cards [aria-label="8 of diamonds"]')).toBeNull();
    click('STAND'); expect(container.querySelector('.opponent-cards .card-hidden')).toBeNull();
    expect(container.querySelector('.opponent-cards [aria-label="8 of diamonds"]')).not.toBeNull();
    expect(container.querySelector('.opponent-readout')?.textContent).toContain('17');
    expect(button('STAND').disabled).toBe(true); expect(button('HIT').disabled).toBe(true); expect(button('FOLD').disabled).toBe(true);
  });

  it('disables the rendered FOLD button after three uses', () => {
    mount(<App/>); click('Sit down'); advance(DEAL_COMPLETE);
    for (let fold = 0; fold < 3; fold++) { expect(button('FOLD').disabled).toBe(false); click('FOLD'); expect(button('FOLD').disabled).toBe(true); advance(FOLD_TO_DECISION); }
    expect(button('FOLD').disabled).toBe(true); expect(button('STAND').disabled).toBe(false); expect(button('HIT').disabled).toBe(false);
    expect(container.querySelector('.fold-indicators')?.textContent).toContain('0 / 3'); expect(container.querySelectorAll('.fold-indicators .full')).toHaveLength(0);
  });

  it('disables FOLD after a safe HIT while keeping HIT and STAND available', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(safeHits)); mount(<App/>); click('Sit down'); advance(DEAL_COMPLETE);
    click('HIT'); advance(CONFIG.DEAL_SPEED);
    expect(button('FOLD').disabled).toBe(true); expect(button('STAND').disabled).toBe(false); expect(button('HIT').disabled).toBe(false);
    expect(container.querySelector('.fold-indicators')?.textContent).toContain('3 / 3');
  });

  it('labels soft player totals and retains a hidden Stranger total before reveal', () => {
    vi.mocked(dealRound).mockImplementation(() => fixture([card('A', 'spades'), card('6', 'hearts')], playerWins.ai));
    mount(<App/>); click('Sit down'); advance(DEAL_COMPLETE);
    expect(container.querySelector('.player-total')?.textContent).toMatch(/soft\s*17|17\s*soft/i);
    expect(container.querySelector('.opponent-readout')?.textContent).toContain('??');
  });

  it('shows no bullet position in the cylinder and routes mute/unmute to the audio master', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 5, currentChamber: 1 }); mount(<App/>); click('Sit down');
    const cylinder = container.querySelector('.cylinder'); expect(cylinder?.getAttribute('aria-label')).toContain('Bullet position unknown');
    expect(cylinder?.outerHTML).not.toContain('bulletChamber');
    const mute = container.querySelector<HTMLButtonElement>('[aria-label="Mute sound"]'); act(() => mute?.click());
    expect(tableAudio.mute).toHaveBeenLastCalledWith(true); expect(container.querySelector('[aria-label="Unmute sound"]')?.getAttribute('aria-pressed')).toBe('true');
    const unmute = container.querySelector<HTMLButtonElement>('[aria-label="Unmute sound"]'); act(() => unmute?.click()); expect(tableAudio.mute).toHaveBeenLastCalledWith(false);
  });

  it('waits for Sit down before starting audio, then voices Host rules and the captive opening', () => {
    mount(<App/>); advance(1000);
    expect(tableAudio.init).not.toHaveBeenCalled(); expect(tableAudio.startVoice).not.toHaveBeenCalled();
    clickRaw('Sit down'); expect(tableAudio.init).toHaveBeenCalledTimes(1);
    advance(GUARD_TO_RULES);
    expect(tableAudio.startVoice).toHaveBeenLastCalledWith(createVoicePlan(OPENING_LINES[0], 'intro_rules', false, 0, HOST.voice), 'host');
    const introVoice = vi.mocked(tableAudio.startVoice).mock.calls.at(-1)![0];
    clickRaw('Skip introduction'); advance(DEAL_COMPLETE);
    const subtitle = showAppCaptiveLine('confident');
    expect(tableAudio.startVoice).toHaveBeenLastCalledWith(createVoicePlan(subtitle, 'confident', false, 0, OPPONENTS[1].voice), 'captive');
    const openingVoice = vi.mocked(tableAudio.startVoice).mock.calls.at(-1)![0];
    expect(introVoice.parameters.pitch).toBeLessThan(openingVoice.parameters.pitch);
    const beforeSkip = vi.mocked(tableAudio.stopVoice).mock.calls.length;
    act(() => container.querySelector<HTMLButtonElement>('.dialogue')!.click());
    expect(vi.mocked(tableAudio.stopVoice).mock.calls.length).toBeGreaterThan(beforeSkip);
    expect(container.querySelector('.dialogue .typing')).toBeNull();
  });

  it.each([
    ['player_hits', safeHits, 'HIT', 0],
    ['player_stands', playerWins, 'STAND', 0],
    ['player_busts', playerBusts, 'HIT', CONFIG.DEAL_SPEED],
    ['ai_hits', dealerBusts, 'STAND', 950 + 650],
    ['ai_busts', dealerBusts, 'STAND', DEALER_BUST_MS],
    ['push', tied, 'STAND', 950],
  ] as const)('voices the %s subtitle with its matching dialogue category', (category, round, action, delay) => {
    vi.mocked(dealRound).mockImplementation(() => copy(round));
    mount(<App/>); click('Sit down'); advance(DEAL_COMPLETE);
    showAppCaptiveLine(handTotal(round.ai) >= 17 ? 'confident' : 'nervous');
    const previousVoiceCount = vi.mocked(tableAudio.startVoice).mock.calls.length;
    const previousVoiceOrder = vi.mocked(tableAudio.startVoice).mock.invocationCallOrder.at(-1)!;
    click(action);
    if (delay > 0) advance(delay);
    const subtitle = showAppCaptiveLine(category);
    expect(OPPONENT_DIALOGUE[1][category]).toContain(subtitle);
    expect(vi.mocked(tableAudio.startVoice).mock.calls.length).toBeGreaterThan(previousVoiceCount);
    expect(tableAudio.startVoice).toHaveBeenLastCalledWith(createVoicePlan(subtitle, category, false, 0, OPPONENTS[1].voice), 'captive');
    const stoppedVoiceOrder = vi.mocked(tableAudio.stopVoice).mock.invocationCallOrder.at(-1)!;
    const replacementVoiceOrder = vi.mocked(tableAudio.startVoice).mock.invocationCallOrder.at(-1)!;
    expect(stoppedVoiceOrder).toBeGreaterThan(previousVoiceOrder);
    expect(stoppedVoiceOrder).toBeLessThan(replacementVoiceOrder);
  });
});

describe('trigger commitment and hesitation', () => {
  it('loses all accumulated hold time on release and drains the visible progress over 600ms', () => {
    startPlayerShot(); act(() => latest.beginTriggerHold()); advance(CONFIG.TRIGGER_HOLD_MS * .72);
    const progress = latest.game.triggerProgress;
    expect(progress).toBeGreaterThan(.6); expect(progress).toBeLessThan(1);
    act(() => latest.endTriggerHold());
    expect(latest.game.triggerHeld).toBe(false); expect(latest.game.suspense).toBe(false);
    advance(300); expect(latest.game.triggerProgress).toBeGreaterThan(0); expect(latest.game.triggerProgress).toBeLessThan(progress);
    advance(300); expect(latest.game.triggerProgress).toBe(0);
    advance(CONFIG.TRIGGER_HOLD_MS); expect(latest.game.revolver.currentChamber).toBe(1);
    act(() => latest.beginTriggerHold()); advance(CONFIG.TRIGGER_HOLD_MS - 1);
    expect(latest.game.revolver.currentChamber).toBe(1);
    advance(1); expect(latest.game.revolver.currentChamber).toBe(2);
  });

  it('a new hold during drain starts from zero rather than resuming the previous attempt', () => {
    startPlayerShot(); act(() => latest.beginTriggerHold()); advance(2000);
    act(() => latest.endTriggerHold()); advance(100);
    expect(latest.game.triggerProgress).toBeGreaterThan(0);
    act(() => latest.beginTriggerHold()); expect(latest.game.triggerProgress).toBe(0);
    advance(1000); expect(latest.game.revolver.currentChamber).toBe(1);
    act(() => latest.endTriggerHold()); advance(5000);
    expect(latest.game.phase).toBe('PLAYER_SHOOTING'); expect(latest.game.shotEffect).toBeNull();
  });

  it('cocks the hammer and rotates the cylinder once per continuous attempt before firing', () => {
    startPlayerShot(); act(() => latest.beginTriggerHold());
    advance(Math.ceil(CONFIG.TRIGGER_HOLD_MS / 3));
    expect(tableAudio.play).toHaveBeenCalledWith('hammer');
    expect(tableAudio.play).not.toHaveBeenCalledWith('clack');
    advance(Math.ceil(CONFIG.TRIGGER_HOLD_MS / 3));
    expect(tableAudio.play).toHaveBeenCalledWith('clack');
    expect(latest.game.revolver.currentChamber).toBe(1);
    advance(CONFIG.TRIGGER_HOLD_MS);
    expect(vi.mocked(tableAudio.play).mock.calls.filter(([sound]) => sound === 'hammer')).toHaveLength(1);
    expect(vi.mocked(tableAudio.play).mock.calls.filter(([sound]) => sound === 'clack')).toHaveLength(1);
    expect(vi.mocked(tableAudio.play).mock.calls.filter(([sound]) => sound === 'click')).toHaveLength(1);
  });

  it('cancels hold, drain, and impatient timers when unmounted', () => {
    startPlayerShot(); act(() => latest.beginTriggerHold()); advance(1800); act(() => latest.endTriggerHold());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => root.unmount()); rootMounted = false;
    expect(vi.getTimerCount()).toBe(0); advance(30000);
    expect(tableAudio.play).not.toHaveBeenCalledWith('click'); expect(localShots()).toHaveLength(0);
  });

  it('warns at ten and five seconds remaining with a voice fade gap', () => {
    startPlayerShot();
    advance(4999); expect(allSpeech().some(line=>line.category==='trigger_warning')).toBe(false);
    advance(1); expect(latest.game.speech).toBeNull();
    advance(100); expect(latest.game.speech?.speaker).toBe('host');
    expect(latest.game.speech?.text).toBe('Ten seconds.');
    advance(4900); expect(latest.game.speech).toBeNull();
    advance(100); expect(latest.game.speech?.text).toBe('Last chance to do it yourself.');
    expect(latest.game.revolver.currentChamber).toBe(1);
  });

  it('makes the opponent hesitate longer after more fired chambers, without using a hidden card total', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 6, currentChamber: 3 });
    startDecision(); act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS);
    expect(latest.game.phase).toBe('AI_SHOOTING');
    finishQueuedSpeech(); advance(AI_INITIAL_HESITATION); expect(latest.game.revolver.currentChamber).toBe(3);
    advance(600); expect(latest.game.revolver.currentChamber).toBe(4);
  });
});

describe('one-time SPIN per side and match', () => {
  it('rejects non-shooters, consumes one player spin, resets the pointer, and still requires a full hold', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 6, currentChamber: 4 });
    vi.mocked(dealRound).mockImplementation(() => copy(playerLoses)); startDecision();
    act(() => latest.spinCylinder());
    expect(latest.game.revolver.currentChamber).toBe(4); expect(latest.game.abilities.player.spin).toBe(true);
    act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS);
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 3, currentChamber: 1 });
    act(() => latest.spinCylinder());
    expect(latest.game.spinning).toBe('player'); expect(latest.game.abilities.player.spin).toBe(false);
    expect(latest.game.abilities.ai.spin).toBe(true); expect(latest.game.revolver).toEqual({ bulletChamber: 3, currentChamber: 1 });
    expect(tableAudio.play).toHaveBeenCalledWith('spin');
    act(() => { latest.spinCylinder(); latest.beginTriggerHold(); });
    expect(latest.game.triggerHeld).toBe(false); expect(latest.game.spinSerial).toBe(1);
    advance(800); expect(latest.game.spinning).toBeNull(); expect(latest.game.phase).toBe('PLAYER_SHOOTING');
    expect(latest.game.awaitingTrigger).toBe(true); expect(latest.game.shotEffect).toBeNull();
    act(() => latest.spinCylinder()); expect(latest.game.spinSerial).toBe(1);
    holdTrigger(); expect(latest.game.revolver.currentChamber).toBe(2);
  });

  it('does not allow SPIN during a hold or while the trigger progress drains', () => {
    startPlayerShot(); act(() => latest.beginTriggerHold()); advance(900);
    act(() => latest.spinCylinder()); expect(latest.game.abilities.player.spin).toBe(true);
    act(() => latest.endTriggerHold()); advance(300);
    act(() => latest.spinCylinder()); expect(latest.game.abilities.player.spin).toBe(true);
    advance(300); act(() => latest.spinCylinder()); expect(latest.game.abilities.player.spin).toBe(false);
  });

  it.each([3, 4])('opponent SPIN threshold at chamber %i is three remaining chambers', chamber => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 6, currentChamber: chamber }); startDecision();
    act(() => latest.stand()); advance(950);
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 5, currentChamber: 1 }); advance(1500); finishQueuedSpeech();
    if (chamber === 3) {
      expect(latest.game.spinning).toBeNull(); expect(latest.game.abilities.ai.spin).toBe(true);
      expect(latest.game.revolver.currentChamber).toBe(3);
    } else {
      expect(latest.game.spinning).toBe('ai'); expect(latest.game.abilities.ai.spin).toBe(false);
      expect(latest.game.revolver).toEqual({ bulletChamber: 5, currentChamber: 1 });
      expect(latest.game.abilities.player.spin).toBe(true);
      advance(800 + AI_INITIAL_HESITATION); expect(latest.game.revolver.currentChamber).toBe(2);
    }
  });

  it('ends the match within six trigger pulls after its last SPIN', () => {
    startPlayerShot(); act(() => latest.spinCylinder()); advance(800);
    expect(latest.game.abilities.player.spin).toBe(false);
    for (let pull = 1; pull <= CONFIG.NUM_CHAMBERS; pull++) {
      holdTrigger(); expect(latest.game.revolver.currentChamber).toBe(pull + 1);
      if (pull < CONFIG.NUM_CHAMBERS) {
        expect(latest.game.dead).toBeNull(); nextDecisionAfterEmptyShot();
        act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS);
        act(() => latest.spinCylinder()); expect(latest.game.abilities.player.spin).toBe(false);
      }
    }
    expect(latest.game.dead).toBe('player'); advanceStoryUntil(() => latest.game.phase === 'GAME_OVER'); expect(latest.game.phase).toBe('GAME_OVER');
    expect(latest.game.abilities.ai.spin).toBe(true);
  });

  it('keeps the opponent SPIN spent when later rounds return to three remaining chambers', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 6, currentChamber: 4 }); startDecision();
    act(() => latest.stand()); advance(950);
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 6, currentChamber: 1 }); advance(1500); finishQueuedSpeech();
    expect(latest.game.spinning).toBe('ai'); advance(800 + AI_INITIAL_HESITATION);
    expect(latest.game.revolver.currentChamber).toBe(2); expect(latest.game.abilities.ai.spin).toBe(false);
    const creations = vi.mocked(createRevolver).mock.calls.length;
    for (let chamber = 2; chamber <= 4; chamber++) {
      nextDecisionAfterEmptyShot(); act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS);
      expect(latest.game.phase).toBe('AI_SHOOTING'); expect(latest.game.spinning).toBeNull();
      expect(latest.game.revolver.currentChamber).toBe(chamber);
      finishQueuedSpeech(); advance(AI_INITIAL_HESITATION + (chamber - 1) * 300);
      expect(latest.game.revolver.currentChamber).toBe(chamber + 1);
    }
    expect(createRevolver).toHaveBeenCalledTimes(creations);
    expect(vi.mocked(tableAudio.play).mock.calls.filter(([sound]) => sound === 'spin')).toHaveLength(1);
  });
});

describe('one-time PEEK without changing the deck', () => {
  it('privately previews the next card once, then HIT receives exactly that card', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(safeHits)); startDecision();
    const before = latest.game.round!, next = before.deck[0];
    waitPeekWindow(); act(() => latest.peek());
    expect(latest.game.peekedCard).toBeNull(); expect(latest.game.peekActor).toBe('player');
    expect(latest.game.abilities.player.peek).toBe(false); expect(latest.game.abilities.ai.peek).toBe(true);
    expect(latest.game.round).toBe(before); const serial = latest.game.peekSerial;
    act(() => latest.peek()); expect(latest.game.peekSerial).toBe(serial);
    act(() => latest.hit()); expect(latest.game.round).toBe(before);
    advance(CONFIG.PEEK_DURATION_MS); expect(latest.game.peekedCard).toEqual(next);
    act(() => latest.hit()); expect(latest.game.round!.player.at(-1)).toEqual(next);
    expect(latest.game.round!.deck[0]).toEqual(before.deck[1]); expect(latest.game.peekedCard).toBeNull();
    advance(CONFIG.DEAL_SPEED); act(() => latest.peek()); expect(latest.game.peekedCard).toBeNull();
  });

  it.each(['fold', 'stand'] as const)('clears a private preview on %s and keeps it spent next round', action => {
    startDecision(); peekSuccessfully();
    act(() => latest[action]()); expect(latest.game.peekedCard).toBeNull();
    if (action === 'fold') {
      advance(FOLD_TO_DECISION); expect(latest.game.abilities.player.peek).toBe(false);
      act(() => latest.peek()); expect(latest.game.peekedCard).toBeNull();
    }
  });

  it('rejects PEEK outside the decision phase and preserves the hidden hole card', () => {
    mount(); startMatch(); act(() => latest.peek());
    expect(latest.game.abilities.player.peek).toBe(true); expect(latest.game.peekedCard).toBeNull();
    advance(DEAL_COMPLETE); act(() => latest.peek()); expect(latest.game.revealed).toBe(false);
    act(() => latest.stand()); act(() => latest.peek()); expect(latest.game.peekedCard).toBeNull();
  });

  it('lets the opponent break its normal draw rule once when the peeked card would bust it', () => {
    const cautious = fixture(playerWins.player, [card('K', 'clubs'), card('4', 'diamonds')], [card('Q', 'hearts')]);
    vi.mocked(dealRound).mockImplementation(() => copy(cautious)); startDecision();
    prepareUnseenPeek(); const deck = [...latest.game.round!.deck]; act(() => latest.stand()); advance(950);
    expect(latest.game.phase).toBe('DEALER_PEEKING'); expect(latest.game.peekActor).toBe('ai');
    expect(latest.game.peekedCard).toBeNull(); assertCaptiveLine('opp_peeks');
    expect(latest.game.abilities.ai.peek).toBe(false); expect(latest.game.round!.deck).toEqual(deck);
    advance(CONFIG.PEEK_DURATION_MS); expect(latest.game.phase).toBe('ROUND_RESULT'); expect(latest.game.result).toBe('player');
    expect(latest.game.round!.ai).toHaveLength(2); expect(latest.game.round!.deck).toEqual(deck);
  });

  it('draws its safe peeked card exactly once, then follows normal draws after PEEK is spent', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(dealerBusts)); startDecision();
    const first = latest.game.round!.deck[0], second = latest.game.round!.deck[1];
    prepareUnseenPeek(); act(() => latest.stand()); advance(950 + CONFIG.PEEK_DURATION_MS);
    expect(latest.game.round!.ai.at(-1)).toEqual(first); expect(handTotal(latest.game.round!.ai)).toBe(14);
    expect(latest.game.abilities.ai.peek).toBe(false); const serial = latest.game.peekSerial;
    advance(CONFIG.DEAL_SPEED + 200);
    expect(latest.game.round!.ai.at(-1)).toEqual(second); expect(handTotal(latest.game.round!.ai)).toBe(24);
    expect(latest.game.peekSerial).toBe(serial);
    advance(CONFIG.DEAL_SPEED + 200); expect(latest.game.result).toBe('player');
  });
});

describe('cosmetic events and chamber-only breakdown', () => {
  it('starts at most one event per round in decision time without changing any game state', () => {
    vi.mocked(chooseRoundEvent).mockReturnValue({ kind: 'blackout', duration: 4000, seed: 123 });
    startDecision(); const round = latest.game.round, revolver = latest.game.revolver;
    expect(latest.game.event).toBeNull(); advance(1199); expect(latest.game.event).toBeNull();
    advance(1); expect(latest.game.event).toMatchObject({ kind: 'blackout', duration: 4000, seed: 123 });
    expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.round).toBe(round);
    expect(latest.game.revolver).toBe(revolver); expect(latest.game.folds).toBe(3);
    expect(latest.game.hasHit).toBe(false);
    advance(4000); expect(latest.game.event).toBeNull(); advance(10000); expect(latest.game.event).toBeNull();
    expect(chooseRoundEvent).toHaveBeenCalledTimes(1);
    act(() => latest.stand()); advance(950); expect(latest.game.result).toBe('player');
  });

  it('cancels pending starts outside decision time and only starts after a fresh eligible pause', () => {
    vi.mocked(chooseRoundEvent).mockReturnValue({ kind: 'door', duration: 3500, seed: 77 });
    vi.mocked(dealRound).mockImplementation(() => copy(safeHits)); startDecision();
    act(() => latest.hit()); advance(CONFIG.DEAL_SPEED);
    expect(latest.game.phase).toBe('PLAYER_DECISION'); advance(550); expect(latest.game.event).toBeNull();
    advance(650); expect(latest.game.event?.kind).toBe('door');
    act(() => latest.hit()); expect(latest.game.event).toBeNull(); advance(CONFIG.DEAL_SPEED + 5000);
    expect(latest.game.event).toBeNull(); expect(chooseRoundEvent).toHaveBeenCalledTimes(1);
  });

  it('never starts an event while dealing, revealing, or waiting for the player to shoot', () => {
    vi.mocked(chooseRoundEvent).mockReturnValue({ kind: 'tv', duration: 3000, seed: 6 });
    vi.mocked(dealRound).mockImplementation(() => copy(playerLoses));
    mount(); startMatch(); advance(DEAL_COMPLETE - 1); expect(latest.game.event).toBeNull();
    advance(1); act(() => latest.stand()); expect(latest.game.event).toBeNull();
    advance(950 + 1500 + GUN_SLIDE_MS); expect(latest.game.phase).toBe('PLAYER_SHOOTING');
    advance(14000); expect(latest.game.event).toBeNull(); expect(latest.game.revolver.currentChamber).toBe(1);
  });

  it('selects one tell for the round and keeps it stable through hits and events', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(safeHits));
    vi.mocked(chooseRoundEvent).mockReturnValue({ kind: 'blackout', duration: 4000, seed: 1 });
    startDecision(); const tell = latest.game.tell; expect(tell).not.toBeNull();
    advance(1200); expect(latest.game.tell).toBe(tell);
    act(() => latest.hit()); advance(CONFIG.DEAL_SPEED); expect(latest.game.tell).toBe(tell);
  });

  it.each([
    [1, playerWins, 'confident', 0], [1, playerBusts, 'nervous', 0],
    [3, playerWins, 'short', 2], [3, playerBusts, 'short', 2],
    [5, playerWins, 'broken', 4], [5, playerBusts, 'broken', 4],
  ] as const)('uses chamber %i breakdown for either opening hand strength', (chamber, round, category, fired) => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 6, currentChamber: chamber });
    vi.mocked(dealRound).mockImplementation(() => copy(round)); startDecision();
    const line = assertCaptiveLine(category); expect(line.chambersFired).toBe(fired);
  });
});

function winCurrentRoom() {
  const room = latest.game.roomNumber;
  act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS);
  expect(latest.game.phase).toBe('AI_SHOOTING');
  finishQueuedSpeech(); advance(AI_INITIAL_HESITATION);
  expect(latest.game.dead).toBe('ai');
  if (room < 3) advanceStoryUntil(() => latest.game.roomNumber === room + 1 && latest.game.phase === 'PLAYER_DECISION');
  else advanceStoryUntil(() => latest.game.phase === 'GAME_OVER');
}
function enterRoom(room: 1 | 2 | 3) {
  vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 }); startDecision();
  while (latest.game.roomNumber < room) winCurrentRoom();
}

describe('three-room campaign, bracket, and run statistics', () => {
  it('progresses through exactly three opponents and accounts for every death in 8 → 4 → 2 → 1', () => {
    enterRoom(1);
    expect(latest.game.guestsRemaining).toBe(8);
    for (const room of [1, 2, 3] as const) {
      expect(latest.game.roomNumber).toBe(room); expect(latest.game.roundNumber).toBe(1);
      expect(latest.game.revolver.currentChamber).toBe(1);
      winCurrentRoom();
      expect(latest.game.guestsRemaining).toBe(room === 1 ? 4 : room === 2 ? 2 : 1);
    }
    expect(latest.game.stats).toMatchObject({ roomsCleared: 3, roundsPlayed: 3, handsWon: 3,
      handsLost: 0, handsPushed: 0, hits: 0, busts: 0, foldsUsed: 0, highestChamber: 1,
      guestsRemainingWhenFell: null });
    expect(latest.game.stats.endedAt).toBe(Date.now()); expect(latest.game.stats.totalTimeMs).toBeGreaterThan(0);
    expect(localShots()).toHaveLength(3);
    expect(latest.game.dead).toBe('ai');
  });

  it('resets revolver, folds, player abilities and opponent PEEK when the next room begins', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 2, currentChamber: 1 });
    vi.mocked(dealRound).mockImplementation(() => copy(playerLoses)); startDecision();
    peekSuccessfully(); act(() => latest.fold()); advance(FOLD_TO_DECISION);
    expect(latest.game.folds).toBe(2); expect(latest.game.abilities.player.peek).toBe(false);
    act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS);
    act(() => latest.spinCylinder()); advance(800); holdTrigger();
    expect(latest.game.revolver.currentChamber).toBe(2); expect(latest.game.abilities.player.spin).toBe(false);
    expect(latest.game.stats.highestChamber).toBe(2);
    vi.mocked(dealRound).mockImplementation(() => copy(dealerBusts)); nextDecisionAfterEmptyShot();
    prepareUnseenPeek(); act(() => latest.stand()); advance(DEALER_BUST_MS + 1500);
    expect(latest.game.abilities.ai.peek).toBe(false);
    finishQueuedSpeech(); advance(AI_INITIAL_HESITATION + 300);
    expect(latest.game.dead).toBe('ai');
    advanceStoryUntil(() => latest.game.roomNumber === 2 && latest.game.phase === 'PLAYER_DECISION');
    expect(latest.game.folds).toBe(3); expect(latest.game.revolver.currentChamber).toBe(1);
    expect(latest.game.dead).toBeNull(); expect(latest.game.feedDeaths).toEqual([]);
    expect(latest.game.abilities).toEqual({ player: { spin: true, peek: true }, ai: { spin: true, peek: true } });
    expect(latest.game.stats).toMatchObject({ roomsCleared: 1, foldsUsed: 1, handsLost: 1, handsWon: 1,
      abilitiesUsed: { player: { spin: 1, peek: 1 }, ai: { spin: 0, peek: 1 } } });
  });

  it('resets an opponent SPIN at the next table while retaining its usage in run stats', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 6, currentChamber: 4 }); startDecision();
    act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS);
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 }); finishQueuedSpeech();
    expect(latest.game.spinning).toBe('ai'); expect(latest.game.abilities.ai.spin).toBe(false);
    advance(800 + AI_INITIAL_HESITATION); expect(latest.game.dead).toBe('ai');
    advanceStoryUntil(() => latest.game.roomNumber === 2 && latest.game.phase === 'PLAYER_DECISION');
    expect(latest.game.abilities.ai.spin).toBe(true); expect(latest.game.stats.abilitiesUsed.ai.spin).toBe(1);
  });

  it('stages the other three first-round table deaths after rounds 1, 3, and 5 without duplicates', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(tied)); startDecision();
    for (let round = 1; round <= 5; round++) {
      act(() => latest.stand()); advance(950 + 2000 + 351);
      expect(latest.game.feedDeaths).toEqual(round < 3 ? [2] : round < 5 ? [2, 3] : [2, 3, 4]);
      expect(latest.game.guestsRemaining).toBe(round < 3 ? 7 : round < 5 ? 6 : 5);
      expect(latest.game.feedDeathSerial).toBe(latest.game.feedDeaths.length);
      advance(350 + DEAL_COMPLETE); expect(latest.game.phase).toBe('PLAYER_DECISION');
    }
    expect(latest.game.stats.handsPushed).toBe(5); expect(latest.game.stats.foldsUsed).toBe(0);
    expect(localShots()).toHaveLength(0); expect(tableAudio.play).not.toHaveBeenCalledWith('click');
    expect(distantShots()).toHaveLength(3);
  });

  it('resolves the other semifinal during Room 2 and does not count it twice on transition', () => {
    enterRoom(2); expect(latest.game.guestsRemaining).toBe(4);
    vi.mocked(dealRound).mockImplementation(() => copy(tied));
    act(() => latest.fold()); advance(FOLD_TO_DECISION); expect(latest.game.guestsRemaining).toBe(4);
    act(() => latest.stand()); advance(950 + 2000 + 351);
    expect(latest.game.feedDeaths).toEqual([2]); expect(latest.game.guestsRemaining).toBe(3);
    vi.mocked(dealRound).mockImplementation(() => copy(playerWins)); advance(350 + DEAL_COMPLETE);
    winCurrentRoom(); expect(latest.game.roomNumber).toBe(3); expect(latest.game.guestsRemaining).toBe(2);
  });

  it.each([2, 3] as const)('death in Room %i shows correct stats and Play Again fully restarts Room 1', room => {
    enterRoom(room);
    act(() => latest.hit()); advance(CONFIG.DEAL_SPEED);
    act(() => latest.hit()); advance(CONFIG.DEAL_SPEED + 950 + 1500 + GUN_SLIDE_MS);
    expect(latest.game.phase).toBe('PLAYER_SHOOTING'); holdTrigger();
    expect(latest.game.phase).toBe('ENDING_DEATH'); expect(latest.game.storyStage).toBe('fall');
    expect(latest.game.stats.guestsRemainingWhenFell).toBe(room === 2 ? 3 : 1);
    advance(2400); expect(latest.game.storyStage).toBe('monitor');
    advance(2200); expect(latest.game.storyStage).toBe('no-signal');
    advanceStoryUntil(() => latest.game.phase === 'GAME_OVER');
    expect(latest.game.stats).toMatchObject({ roomsCleared: room - 1, handsLost: 1, hits: 2, busts: 1 });
    expect(latest.game.stats.endedAt).not.toBeNull();
    act(() => latest.start());
    expect(latest.game).toMatchObject({ phase: 'OPENING', roomNumber: 1, introShort: true,
      guestsRemaining: 8, dead: null, folds: 3, roundNumber: 0, feedDeaths: [] });
    expect(latest.game.stats).toMatchObject({ roomsCleared: 0, roundsPlayed: 0, handsWon: 0,
      handsLost: 0, hits: 0, busts: 0, highestChamber: 1, guestsRemainingWhenFell: null, endedAt: null, totalTimeMs: 0 });
    expect(latest.game.abilities).toEqual({ player: { spin: true, peek: true }, ai: { spin: true, peek: true } });
    act(() => latest.skipOpening()); advance(DEAL_COMPLETE);
    expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.roomNumber).toBe(1);
    expect(latest.game.stats.roundsPlayed).toBe(1); expect(latest.game.revolver.currentChamber).toBe(1);
  });
});

describe('campaign rules, personality policies, and serialized speakers', () => {
  it('presents six manual Host rules on the first run, handles repeated clicks safely, and uses one later line', () => {
    mount(); act(() => latest.start()); expect(latest.game.storyStage).toBe('hooded');
    expect(latest.game.speech).toBeNull(); advance(stageDurationMs('hooded')); expect(latest.game.storyStage).toBe('door-open');
    advance(GUARD_TO_RULES - stageDurationMs('hooded')); expect(latest.game.storyStage).toBe('rules'); expect(latest.game.introShort).toBe(false);
    for (let index = 0; index < OPENING_LINES.length; index++) {
      expect(latest.game.speech).toMatchObject({ speaker: 'host', category: 'intro_rules', text: OPENING_LINES[index], danger: false, chambersFired: 0 });
      advance(10000); expect(latest.game.introIndex).toBe(index); // no automatic advance
      act(() => { latest.advanceOpening(); latest.advanceOpening(); });
      expect(latest.game.speech).toBeNull(); advance(99); expect(latest.game.speech).toBeNull(); advance(1);
    }
    expect(latest.game.storyStage).toBe('cut-opponent'); expect(latest.game.stats.roundsPlayed).toBe(0);
    advance(CUT_TO_DEAL); expect(latest.game.phase).toBe('SHUFFLING');
    act(() => latest.start()); advance(GUARD_TO_RULES);
    expect(latest.game.introShort).toBe(true); expect(latest.game.speech?.text).toBe(SHORT_INTRO);
    act(() => latest.advanceOpening()); advance(100 + CUT_TO_DEAL); expect(latest.game.phase).toBe('SHUFFLING');
  });

  it('can skip during the hood and cancels all old opening callbacks', () => {
    mount(); act(() => latest.start()); act(() => latest.skipOpening());
    expect(latest.game.phase).toBe('SHUFFLING'); advance(1250);
    expect(latest.game.storyStage).toBe('table'); expect(latest.game.phase).toBe('DEALING');
    advance(DEAL_COMPLETE - 1250); expect(latest.game.phase).toBe('PLAYER_DECISION');
    expect(latest.game.round?.player).toHaveLength(2); expect(latest.game.round?.ai).toHaveLength(2);
  });

  it('serializes ordinary reactions without interrupting the current speaker and leaves a 100ms fade gap', () => {
    startDecision(); const currentLine = latest.game.speech!; expect(currentLine).not.toBeNull();
    const stops = vi.mocked(tableAudio.stopVoice).mock.calls.length;
    act(() => latest.peek()); act(() => latest.hit());
    expect(latest.game.speech?.id).toBe(currentLine.id); expect(tableAudio.stopVoice).toHaveBeenCalledTimes(stops);
    expect(allSpeech().some(line => line.category === 'player_hits' && line.speaker === 'captive')).toBe(true);
    act(() => latest.finishSpeech()); expect(latest.game.speech).toBeNull();
    advance(99); expect(latest.game.speech).toBeNull(); advance(1);
    expect(latest.game.speech?.id).not.toBe(currentLine.id); expect(latest.game.speech?.speaker).toBe('captive');
  });

  it('keeps the confident/nervous opening and exchange intact even when the player immediately HITs', () => {
    vi.mocked(shouldExchange).mockReturnValue(true); startDecision();
    const protectedLines = allSpeech().filter(line => line.speaker === 'captive' || line.speaker === 'host' && line.category === 'deal');
    expect(protectedLines.some(line => line.category === 'confident')).toBe(true);
    const question = protectedLines.find(line => line.speaker === 'captive' && line.category === 'nervous');
    const answer = protectedLines.filter(line => line.speaker === 'host').at(-1);
    expect(question).toBeTruthy(); expect(answer).toBeTruthy();
    act(() => latest.hit());
    const ids = allSpeech().map(line => line.id);
    expect(ids).toContain(question!.id); expect(ids).toContain(answer!.id);
    expect(ids.indexOf(question!.id)).toBeLessThan(ids.indexOf(answer!.id));
    expect(allSpeech().some(line => line.category === 'confident')).toBe(true);
  });

  it('does not fire an opponent shot until its protected pre-pull line has played and hesitation completes', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 }); startDecision();
    act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS);
    expect(latest.game.phase).toBe('AI_SHOOTING'); expect(latest.game.dead).toBeNull();
    advanceStoryUntil(() => latest.game.speech?.category === 'ai_loses_hand');
    const line = latest.game.speech!;
    expect(line.speaker).toBe('captive');
    const duration = createVoicePlan(line.text, line.category, line.danger, line.chambersFired, OPPONENTS[1].voice).duration;
    advance(duration + 499); expect(latest.game.dead).toBeNull(); expect(latest.game.speech?.id).toBe(line.id);
    advance(1 + 100); expect(latest.game.speech).toBeNull();
    advance(AI_INITIAL_HESITATION - 1); expect(latest.game.dead).toBeNull();
    advance(1); expect(latest.game.dead).toBe('ai'); expect(latest.game.shotEffect).toBe('shot');
  });

  it('delivers the last Host line during the stairs, after earlier speech has cleared', () => {
    enterRoom(3); act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS); finishQueuedSpeech(); advance(AI_INITIAL_HESITATION + 2400);
    expect(latest.game.phase).toBe('ENDING_WIN');
    advanceStoryUntil(() => latest.game.storyStage === 'door');
    expect(latest.game.speech).toBeNull(); expect(latest.game.speechQueue).toEqual([]);
    advance(1800); expect(latest.game.storyStage).toBe('stairs');
    expect(latest.game.speech).toMatchObject({ speaker: 'host', category: 'ending_win', text: 'See you next season.', danger: false, chambersFired: 0 });
    advance(4000); expect(latest.game.storyStage).toBe('viewers');
    advance(1500); expect(latest.game.storyStage).toBe('title');
    advanceStoryUntil(() => latest.game.phase === 'GAME_OVER'); expect(latest.game.stats.roomsCleared).toBe(3);
  });

  it.each([.1, .5])('lets the Nervous Man make its configured wrong HIT at 17 only on a mistake roll (%s)', random => {
    vi.mocked(Math.random).mockReturnValue(random); startDecision();
    act(() => latest.stand()); advance(950);
    expect(latest.game.round!.ai.length).toBe(random < .25 ? 3 : 2);
    expect(latest.game.phase).toBe(random < .25 ? 'DEALER_TURN' : 'ROUND_RESULT');
  });

  it.each([2, 3] as const)('uses Room %i policy for soft 17 after the player stands', room => {
    enterRoom(room);
    const soft = fixture(playerWins.player, [card('A', 'clubs'), card('6', 'diamonds')], [card('2', 'hearts')]);
    vi.mocked(dealRound).mockImplementation(() => copy(soft)); act(() => latest.fold()); advance(FOLD_TO_DECISION);
    expect(latest.game.round!.ai).toHaveLength(2); expect(latest.game.revealed).toBe(false);
    act(() => latest.stand()); advance(950);
    expect(latest.game.round!.ai).toHaveLength(room === 2 ? 3 : 2);
    expect(latest.game.phase).toBe(room === 2 ? 'DEALER_TURN' : 'ROUND_RESULT');
  });

  it('uses configured PEEK and SPIN thresholds rather than hardcoded dealer limits', () => {
    const config = { ...OPPONENTS[1] };
    try {
      OPPONENTS[1].peekMin = OPPONENTS[1].peekMax = 10; OPPONENTS[1].spinRemaining = 5;
      const ten = fixture([card('A', 'spades'), card('Q', 'hearts')], [card('6', 'clubs'), card('4', 'diamonds')], [card('K', 'hearts')]);
      vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 6, currentChamber: 2 });
      vi.mocked(dealRound).mockImplementation(() => copy(ten)); startDecision();
      prepareUnseenPeek(); act(() => latest.stand()); advance(950);
      expect(latest.game.phase).toBe('DEALER_PEEKING'); expect(latest.game.abilities.ai.peek).toBe(false);
      advance(CONFIG.PEEK_DURATION_MS + CONFIG.DEAL_SPEED + 200 + 1500); expect(latest.game.phase).toBe('AI_SHOOTING');
      finishQueuedSpeech(); expect(latest.game.spinning).toBe('ai'); expect(latest.game.abilities.ai.spin).toBe(false);
    } finally { Object.assign(OPPONENTS[1], config); }
  });
});

function advanceOpeningTo(stage: CinematicStage) {
  for (let index = 0; index < 50; index++) {
    const cinematic = latest.game.cinematic;
    if (cinematic?.stage === stage) return;
    expect(latest.game.phase).toBe('OPENING');
    expect(cinematic).not.toBeNull();
    if (cinematic!.stage === 'rules') {
      act(() => latest.advanceOpening()); advance(100);
    } else advance(stageDurationMs(cinematic!.stage));
  }
  throw new Error(`Opening did not reach ${stage}`);
}

describe('guard hoods, restraints, and safe room arrivals', () => {
  it('removes the player hood before the captive hood and keeps every game action locked until both ties are cut', () => {
    mount(); act(() => latest.start());
    const stages = OPENING_STAGES.slice(0, OPENING_STAGES.indexOf('rules'));
    expect(latest.game.tiesCut).toEqual({ player: false, ai: false });
    for (const stage of stages) {
      expect(latest.game.phase).toBe('OPENING');
      expect(latest.game.cinematic).toMatchObject({ stage, mode: 'full', startedAt: Date.now() });
      expect(latest.game.tiesCut).toEqual({ player: false, ai: false });
      act(() => { latest.hit(); latest.stand(); latest.fold(); latest.peek(); latest.spinCylinder(); latest.beginTriggerHold(); });
      expect(latest.game.round).toBeNull(); expect(latest.game.folds).toBe(3);
      expect(latest.game.abilities.player).toEqual({ spin: true, peek: true });
      advance(stageDurationMs(stage) - 1); expect(latest.game.cinematic?.stage).toBe(stage);
      advance(1);
    }
    expect(latest.game.cinematic?.stage).toBe('rules');
    expect(tableAudio.setHooded).toHaveBeenCalledWith(true);
    expect(tableAudio.setHooded).toHaveBeenLastCalledWith(false);
    const cues = vi.mocked(tableAudio.playStory).mock.calls.map(([cue]) => cue);
    expect(cues.indexOf('door-creak')).toBeLessThan(cues.indexOf('burlap-tug'));
    expect(cues.filter(cue => cue === 'burlap-tug')).toHaveLength(2);
    expect(cues).toContain('gasp'); expect(cues).toContain('door-slam');
    advanceOpeningTo('cut-opponent');
    expect(latest.game.tiesCut).toEqual({ player: false, ai: false });
    expect(latest.game.round).toBeNull();
    advance(stageDurationMs('cut-opponent'));
    expect(latest.game.cinematic?.stage).toBe('cut-player');
    expect(latest.game.tiesCut).toEqual({ player: false, ai: true });
    act(() => latest.hit()); expect(latest.game.round).toBeNull();
    advance(stageDurationMs('cut-player'));
    expect(latest.game.cinematic?.stage).toBe('rub-wrists');
    expect(latest.game.tiesCut).toEqual({ player: true, ai: true });
    expect(latest.game.phase).toBe('OPENING');
    advance(stageDurationMs('rub-wrists'));
    expect(latest.game.phase).toBe('SHUFFLING'); expect(latest.game.roundNumber).toBe(1);
    expect(vi.mocked(tableAudio.playStory).mock.calls.filter(([cue]) => cue === 'snip')).toHaveLength(2);
    advance(DEAL_COMPLETE); expect(latest.game.phase).toBe('PLAYER_DECISION');
  });

  it.each(['player-unhood', 'opponent-unhood', 'guard-exit', 'cut-player'] as const)('Skip cancels pending hood and cutter callbacks during %s and goes directly to a cut state', stage => {
    mount(); act(() => latest.start()); advanceOpeningTo(stage);
    act(() => latest.skipOpening());
    expect(latest.game.phase).toBe('SHUFFLING'); expect(latest.game.tiesCut).toEqual({ player: true, ai: true });
    expect(tableAudio.setHooded).toHaveBeenLastCalledWith(false);
    const snips = vi.mocked(tableAudio.playStory).mock.calls.filter(([cue]) => cue === 'snip').length;
    advance(DEAL_COMPLETE);
    expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.storyStage).toBe('table');
    expect(latest.game.round?.player).toHaveLength(2); expect(latest.game.round?.ai).toHaveLength(2);
    expect(vi.mocked(tableAudio.playStory).mock.calls.filter(([cue]) => cue === 'snip')).toHaveLength(snips);
    expect(latest.game.tiesCut).toEqual({ player: true, ai: true });
  });

  it('runs a fresh guard and restraint opening in both later rooms rather than dealing into an uncovered arrival', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 }); startDecision();
    for (const room of [2, 3] as const) {
      act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS); finishQueuedSpeech(); advance(AI_INITIAL_HESITATION);
      expect(latest.game.dead).toBe('ai');
      advanceStoryUntil(() => latest.game.roomNumber === room && latest.game.phase === 'OPENING');
      expect(latest.game.cinematic).toMatchObject({ mode: 'arrival', stage: 'hooded' });
      expect(latest.game.tiesCut).toEqual({ player: false, ai: false });
      expect(latest.game.round).toBeNull(); expect(latest.game.roundNumber).toBe(0);
      advanceOpeningTo('rules');
      expect(latest.game.speech?.speaker).toBe('host');
      act(() => latest.advanceOpening()); advance(100);
      expect(latest.game.cinematic?.stage).toBe('cut-opponent');
      advance(CUT_TO_DEAL + DEAL_COMPLETE);
      expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.roomNumber).toBe(room);
      expect(latest.game.tiesCut).toEqual({ player: true, ai: true });
    }
  });

  it('cancels every guard, tie, and ambience timer when unmounted under the hood', () => {
    mount(); act(() => latest.start()); advanceOpeningTo('player-unhood');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => root.unmount()); rootMounted = false;
    expect(vi.getTimerCount()).toBe(0);
    const calls = vi.mocked(tableAudio.playStory).mock.calls.length;
    advance(120000);
    expect(tableAudio.playStory).toHaveBeenCalledTimes(calls);
    expect(tableAudio.playShot).not.toHaveBeenCalled();
  });
});

describe('single-id shots, synchronized monitor deaths, and ambient room life', () => {
  it('sends one unique local bang per fatal pull, including after a fresh run, and never advances twice', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 });
    vi.mocked(dealRound).mockImplementation(() => copy(playerBusts)); startDecision();
    for (let run = 0; run < 2; run++) {
      act(() => latest.hit()); advance(CONFIG.DEAL_SPEED + 950 + 1500 + GUN_SLIDE_MS);
      act(() => { latest.beginTriggerHold(); latest.beginTriggerHold(); }); advance(CONFIG.TRIGGER_HOLD_MS);
      const id = latest.game.shotId;
      expect(id).toBeTruthy(); expect(latest.game.revolver.currentChamber).toBe(2);
      expect(localShots().filter(([shot]) => shot.id === id)).toHaveLength(1);
      act(() => { latest.beginTriggerHold(); latest.pullTrigger(); latest.endTriggerHold(); }); advance(100);
      expect(latest.game.revolver.currentChamber).toBe(2);
      if (run === 0) { startMatch(); advance(DEAL_COMPLETE); }
    }
    const ids = localShots().map(([shot]) => shot.id);
    expect(ids).toHaveLength(2); expect(new Set(ids).size).toBe(2);
    expect(tableAudio.play).not.toHaveBeenCalledWith('shot');
  });

  it('flushes three other-table deaths with one matching bang each, at least three seconds apart and after the local shot', () => {
    const played: { id: string; kind: 'local' | 'distant'; at: number }[] = [];
    vi.mocked(tableAudio.playShot).mockImplementation(shot => { played.push({ id: shot.id, kind: shot.kind, at: Date.now() }); return true; });
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 }); startDecision();
    act(() => latest.stand()); advance(950 + 1500 + GUN_SLIDE_MS);
    expect(latest.game.phase).toBe('AI_SHOOTING');
    expect(distantShots()).toHaveLength(0); // protected local suspense
    finishQueuedSpeech();
    const untilPull = latest.game.aiShotDurationMs!;
    expect(latest.game.aiShotStartedAt).toBe(Date.now()); expect(untilPull).toBeGreaterThanOrEqual(1500);
    advance(untilPull); expect(latest.game.dead).toBe('ai');
    expect(localShots()).toHaveLength(1); expect(distantShots()).toHaveLength(0);
    advance(3999); expect(distantShots()).toHaveLength(0);
    advanceStoryUntil(() => latest.game.roomNumber === 2 && latest.game.phase === 'OPENING');
    const distant = played.filter(shot => shot.kind === 'distant'), local = played.find(shot => shot.kind === 'local')!;
    expect(distant).toHaveLength(3); expect(new Set(distant.map(shot => shot.id)).size).toBe(3);
    expect(distant[0].at - local.at).toBeGreaterThanOrEqual(4000);
    for (let index = 1; index < distant.length; index++) expect(distant[index].at - distant[index - 1].at).toBeGreaterThanOrEqual(DISTANT_SHOT_GAP_MS);
    expect(latest.game.guestsRemaining).toBe(4);
    expect(vi.mocked(tableAudio.playStory).mock.calls.filter(([cue]) => cue === 'feed-shot')).toHaveLength(0);
  });

  it('publishes the feed death, guest count, reaction event, and sound id together', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(tied)); startDecision();
    act(() => latest.stand()); advance(950 + 2000 + 351);
    const event = latest.game.distantShot;
    expect(event).toMatchObject({ table: 2, startedAt: Date.now(), duration: 1800 });
    expect(latest.game.feedDeaths).toEqual([2]); expect(latest.game.feedDeathSerial).toBe(1);
    expect(latest.game.guestsRemaining).toBe(7);
    expect(distantShots()).toHaveLength(1);
    expect(distantShots()[0][0]).toMatchObject({ id: event!.id, kind: 'distant', roomId: 2, direction: event!.direction });
    expect(allSpeech().some(line => line.speaker === 'host' && line.category === 'other_room_death')).toBe(true);
    expect(allSpeech().some(line => line.speaker === 'captive' && line.category === 'distant_shot')).toBe(true);
    advance(100); expect(distantShots()).toHaveLength(1); expect(latest.game.guestsRemaining).toBe(7);
  });

  it('does not reuse distant shot ids when a new game hook mounts against the persistent audio service', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(tied)); startDecision();
    act(() => latest.stand()); advance(950 + 2000 + 351);
    const first = latest.game.distantShot!.id;
    act(() => root.unmount()); rootMounted = false;
    root = createRoot(container); rootMounted = true;
    startDecision(); act(() => latest.stand()); advance(950 + 2000 + 351);
    const second = latest.game.distantShot!.id;
    expect(first).not.toBe(second);
    expect(distantShots().map(([shot]) => shot.id)).toEqual([first, second]);
    expect(latest.game.guestsRemaining).toBe(7);
  });

  it('starts ambient life after its cosmetic 15–30 second delay without consuming cards, chambers, folds, or gameplay RNG', () => {
    startDecision(); const round = latest.game.round, revolver = latest.game.revolver;
    const randomCalls = vi.mocked(Math.random).mock.calls.length;
    advance(22500 - DEAL_COMPLETE - 1); expect(latest.game.ambientEvent).toBeNull();
    advance(1);
    expect(latest.game.ambientEvent).toMatchObject({ startedAt: Date.now() });
    expect(tableAudio.playAmbient).toHaveBeenLastCalledWith(latest.game.ambientEvent);
    expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.round).toBe(round);
    expect(latest.game.revolver).toBe(revolver); expect(latest.game.folds).toBe(3);
    expect(vi.mocked(Math.random).mock.calls.length).toBe(randomCalls);
    act(() => latest.stand());
    expect(latest.game.ambientEvent).toBeNull(); expect(tableAudio.playAmbient).toHaveBeenLastCalledWith(null);
  });

  it('defers overdue ambient events throughout a player shot and resumes them only in safe decision time', () => {
    startPlayerShot(); advance(CONFIG.TRIGGER_TIMEOUT_MS + 4199);
    expect(latest.game.phase).toBe('HOST_FORCE_SHOT'); expect(latest.game.ambientEvent).toBeNull();
    expect(vi.mocked(tableAudio.playAmbient).mock.calls.filter(([event]) => event !== null)).toHaveLength(0);
    advance(1); expect(latest.game.shotEffect).toBe('click');
    advance(1000); expect(latest.game.ambientEvent).toBeNull();
    advanceStoryUntil(() => latest.game.ambientEvent !== null);
    expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.ambientEvent!.startedAt).toBeGreaterThan(22500);
    expect(latest.game.roundNumber).toBe(2); expect(latest.game.revolver.currentChamber).toBe(2);
  });
});

function timedGazes(hostEnd = 5000, captiveEnd = 5000) {
  vi.mocked(planAttention).mockImplementationOnce(now => ({
    host: [{ start: now+1000, end: now+hostEnd, direction:-1 }],
    captive: [{ start: now+1000, end: now+captiveEnd, direction:1 }],
  }));
}

describe('Big Update 2 sneaky PEEK and readable catches', () => {
  it('blocks player PEEK while either face is watching, spends one use only when started, and delays the secret until completion', () => {
    timedGazes(); startDecision(); const round=latest.game.round;
    act(()=>latest.peek()); expect(latest.game.abilities.player.peek).toBe(true);
    advance(1000); expect(latest.game.attention.window).toBe(true);
    act(()=>latest.peek()); expect(latest.game.phase).toBe('PLAYER_PEEKING'); expect(latest.game.peekedCard).toBeNull();
    act(()=>{latest.hit(); latest.stand(); latest.fold();}); expect(latest.game.round).toBe(round);
    advance(CONFIG.PEEK_DURATION_MS-1); expect(latest.game.peekedCard).toBeNull();
    advance(1); expect(latest.game.peekedCard).toEqual(round!.deck[0]);
    expect(latest.game.abilities.player.peek).toBe(false);
  });
  it.each(['host','captive'] as const)('catches the player when %s returns and uses one immediate penalty shot without comparing cards', catcher=>{
    timedGazes(catcher==='host'?1500:5000,catcher==='captive'?1500:5000); startDecision();
    const before=latest.game.round, handStats={won:latest.game.stats.handsWon,lost:latest.game.stats.handsLost};
    advance(1000); act(()=>latest.peek()); advance(500);
    expect(latest.game.caught).toBe(catcher); expect(latest.game.phase).toBe('PLAYER_SHOOTING');
    expect(latest.game.peekedCard).toBeNull(); expect(latest.game.peekActor).toBeNull();
    expect(latest.game.awaitingTrigger).toBe(false); expect(latest.game.triggerRemainingMs).toBeNull();
    expect(tableAudio.play).toHaveBeenCalledWith('sting');
    advance(GUN_SLIDE_MS); expect(latest.game.triggerRemainingMs).toBe(CONFIG.TRIGGER_TIMEOUT_MS);
    const category=catcher==='host'?'host_caught_player':'opp_caught_player';
    advance(100); expect(allSpeech().some(l=>l.category===category&&l.speaker===catcher)).toBe(true);
    holdTrigger(); expect(latest.game.revolver.currentChamber).toBe(2);
    expect(latest.game.result).toBeNull(); advance(3400);
    expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.round).toBe(before);
    expect(latest.game.stats.handsWon).toBe(handStats.won); expect(latest.game.stats.handsLost).toBe(handStats.lost);
    expect(latest.game.abilities.player.peek).toBe(false); expect(latest.game.folds).toBe(3);
  });
  it('applies the folds penalty without a shot or a hand comparison', ()=>{
    const penalty=CONFIG.PEEK_CAUGHT_PENALTY;
    try { CONFIG.PEEK_CAUGHT_PENALTY='folds'; timedGazes(1500,5000); startDecision(); advance(1000); act(()=>latest.peek()); advance(500);
      expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.folds).toBe(0);
      expect(latest.game.revolver.currentChamber).toBe(1); expect(latest.game.awaitingTrigger).toBe(false);
      expect(latest.game.stats.handsLost).toBe(0); expect(latest.game.peekedCard).toBeNull();
    } finally { CONFIG.PEEK_CAUGHT_PENALTY=penalty; }
  });
  it.each([true,false])('rejects captive PEEK with observed=%s unless both eligibility conditions hold', watched=>{
    timedGazes(watched?5000:500,5000);
    vi.mocked(dealRound).mockImplementation(()=>copy(dealerBusts)); startDecision(); advance(1000);
    act(()=>latest.setOpponentInView(watched)); act(()=>latest.stand()); advance(950);
    expect(latest.game.phase).toBe('DEALER_TURN'); expect(latest.game.abilities.ai.peek).toBe(true);
    expect(latest.game.round!.ai.at(-1)).toEqual(dealerBusts.deck[0]);
  });
  it('catches a captive mid-peek when the player looks back and prevents it using bust information', ()=>{
    const cautious=fixture(playerWins.player,[card('K','clubs'),card('4','diamonds')],[card('Q','hearts')]);
    timedGazes(); vi.mocked(dealRound).mockImplementation(()=>copy(cautious)); startDecision(); advance(1000);
    act(()=>{latest.setOpponentInView(false); latest.stand();}); advance(950);
    expect(latest.game.phase).toBe('DEALER_PEEKING'); advance(350);
    act(()=>latest.setOpponentInView(true)); expect(latest.game.caught).toBe('ai');
    expect(latest.game.abilities.ai.peek).toBe(false); assertCaptiveLine('caught_by_player');
    advance(400+CONFIG.DEAL_SPEED+200);
    expect(handTotal(latest.game.round!.ai)).toBe(24); expect(latest.game.result).toBe('player');
    expect(latest.game.round!.ai.at(-1)).toEqual(cautious.deck[0]);
  });
  it('aborts a captive peek when the Host returns without using the secret', ()=>{
    timedGazes(2400,5000); vi.mocked(dealRound).mockImplementation(()=>copy(dealerBusts)); startDecision(); advance(1000);
    act(()=>{latest.setOpponentInView(false); latest.stand();}); advance(950);
    expect(latest.game.phase).toBe('DEALER_PEEKING'); advance(450);
    expect(latest.game.peekActor).toBeNull(); expect(latest.game.abilities.ai.peek).toBe(false);
    advance(400); expect(latest.game.round!.ai.at(-1)).toEqual(dealerBusts.deck[0]);
  });
});

describe('Big Update 2 Host trigger deadline', () => {
  it('starts enforcement at exactly the deadline, disables SPIN, and fires the existing chamber after the cocking pause', ()=>{
    vi.mocked(createRevolver).mockReturnValue({bulletChamber:6,currentChamber:3}); startPlayerShot();
    const deadline=latest.game.triggerDeadline, calls=vi.mocked(createRevolver).mock.calls.length;
    advance(CONFIG.TRIGGER_TIMEOUT_MS-1); expect(latest.game.phase).toBe('PLAYER_SHOOTING');
    advance(1); expect(latest.game.phase).toBe('HOST_FORCE_SHOT'); expect(latest.game.forceShotAt).toBe(deadline);
    expect(latest.game.stats.forcedShots).toBe(1); expect(latest.game.awaitingTrigger).toBe(false);
    act(()=>{latest.spinCylinder(); latest.beginTriggerHold(); latest.forceShot();});
    expect(vi.mocked(createRevolver).mock.calls).toHaveLength(calls); expect(latest.game.stats.forcedShots).toBe(1);
    vi.mocked(tableAudio.playContact).mockClear();vi.mocked(tableAudio.play).mockClear();
    advance(2199);expect(tableAudio.playContact).not.toHaveBeenCalled();
    advance(1);expect(tableAudio.playContact).toHaveBeenCalledWith('metal',1);
    advance(599);expect(tableAudio.play).not.toHaveBeenCalledWith('hammer');
    advance(1);expect(tableAudio.play).toHaveBeenCalledWith('hammer');
    advance(1399); expect(latest.game.revolver.currentChamber).toBe(3);
    advance(1); expect(latest.game.revolver.currentChamber).toBe(4); expect(latest.game.shotEffect).toBe('click');
    advance(1000); expect(allSpeech().some(l=>l.speaker==='host'&&l.category==='forced_shot')).toBe(true);
  });
  it('never resets the deadline when the player releases and drains a partial hold', ()=>{
    startPlayerShot(); const deadline=latest.game.triggerDeadline;
    advance(9000); act(()=>latest.beginTriggerHold()); advance(1000); act(()=>latest.endTriggerHold());
    expect(latest.game.triggerDeadline).toBe(deadline); advance(4999); expect(latest.game.phase).toBe('PLAYER_SHOOTING');
    advance(1); expect(latest.game.phase).toBe('HOST_FORCE_SHOT');
  });
  it('locks input at zero even during an unfinished hold', ()=>{
    startPlayerShot(); advance(CONFIG.TRIGGER_TIMEOUT_MS-1000); act(()=>latest.beginTriggerHold());
    advance(1000); expect(latest.game.phase).toBe('HOST_FORCE_SHOT');expect(latest.game.triggerHeld).toBe(false);
    act(()=>{latest.beginTriggerHold();latest.pullTrigger();});advance(4199);expect(latest.game.shotEffect).toBeNull();
    advance(1);expect(latest.game.shotEffect).toBe('click');expect(latest.game.revolver.currentChamber).toBe(2);expect(latest.game.stats.forcedShots).toBe(1);
  });
  it('enforces immediately if a hold is released after zero instead of granting a fresh timer', ()=>{
    startPlayerShot(); advance(CONFIG.TRIGGER_TIMEOUT_MS-500); act(()=>latest.beginTriggerHold()); advance(1000);
    act(()=>latest.endTriggerHold()); expect(latest.game.phase).toBe('HOST_FORCE_SHOT'); expect(latest.game.stats.forcedShots).toBe(1);
  });
  it('uses the normal player death sequence when enforcement reaches the loaded chamber', ()=>{
    vi.mocked(createRevolver).mockReturnValue({bulletChamber:1,currentChamber:1}); startPlayerShot();
    advance(CONFIG.TRIGGER_TIMEOUT_MS+4200);
    expect(latest.game.dead).toBe('player'); expect(latest.game.phase).toBe('ENDING_DEATH');
    expect(latest.game.stats.forcedShots).toBe(1); expect(localShots()).toHaveLength(1);
  });
  it('applies the same timeout to a caught PEEK penalty and resumes that hand after an empty forced shot', ()=>{
    timedGazes(1500,5000); startDecision(); const hand=latest.game.round; advance(1000); act(()=>latest.peek()); advance(500);
    advance(GUN_SLIDE_MS + CONFIG.TRIGGER_TIMEOUT_MS); expect(latest.game.phase).toBe('HOST_FORCE_SHOT');
    advance(4200+3400); expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.round).toBe(hand);
    expect(latest.game.stats.forcedShots).toBe(1); expect(latest.game.stats.handsLost).toBe(0);
  });
});

describe('shared centered revolver pickup and controlled return', () => {
  it('finishes pickup before enabling either player input or the absolute deadline', () => {
    vi.mocked(dealRound).mockImplementation(()=>copy(playerLoses)); startDecision();
    act(()=>latest.stand()); advance(950+1500);
    const transfer=latest.game.gunTransfer;
    expect(transfer).toMatchObject({stage:'to-shooter',side:'player',startedAt:Date.now(),duration:GUN_SLIDE_MS});
    expect(latest.game.awaitingTrigger).toBe(false); expect(latest.game.triggerDeadline).toBeNull();
    const chamber=latest.game.revolver, randomCalls=vi.mocked(Math.random).mock.calls.length;
    act(()=>{latest.beginTriggerHold(); latest.spinCylinder(); latest.pullTrigger();});
    expect(latest.game.triggerHeld).toBe(false); expect(latest.game.abilities.player.spin).toBe(true);
    advance(GUN_SLIDE_MS-1); expect(latest.game.awaitingTrigger).toBe(false);
    advance(1); expect(latest.game.gunTransfer).toBeNull(); expect(latest.game.awaitingTrigger).toBe(true);
    expect(latest.game.triggerDeadline).toBe(Date.now()+CONFIG.TRIGGER_TIMEOUT_MS);
    expect(latest.game.revolver).toBe(chamber); expect(vi.mocked(Math.random).mock.calls).toHaveLength(randomCalls);
    expect(vi.mocked(tableAudio.play).mock.calls.filter(([sound])=>sound==='slide')).toHaveLength(0);
  });
  it('waits for the entire pickup even if the captive finishes its pre-shot line immediately', () => {
    startDecision(); act(()=>latest.stand()); advance(950+1500);
    const started=latest.game.gunTransfer!.startedAt;
    for(let i=0;i<20&&(latest.game.speech||latest.game.speechQueue.length);i++) {
      if(latest.game.speech) act(()=>latest.finishSpeech());
      advance(100);
    }
    expect(Date.now()-started).toBeLessThan(GUN_SLIDE_MS);
    expect(latest.game.aiShotStartedAt).toBeNull();
    advance(started+GUN_SLIDE_MS-Date.now()-1); expect(latest.game.aiShotStartedAt).toBeNull();
    advance(1); expect(latest.game.aiShotStartedAt).toBe(Date.now());
    expect(latest.game.revolver.currentChamber).toBe(1);
  });
  it('starts a controlled return after 200ms, without advancing a second chamber or delaying the next round', () => {
    startPlayerShot(); holdTrigger(); const shotAt=Date.now(), chamber=latest.game.revolver;
    expect(latest.game.gunTransfer).toBeNull();
    advance(GUN_SET_DOWN_MS-1); expect(latest.game.gunTransfer).toBeNull();
    advance(1); expect(latest.game.gunTransfer).toMatchObject({stage:'return',side:'player',startedAt:Date.now(),duration:GUN_SLIDE_MS});
    advance(GUN_SLIDE_MS); expect(latest.game.gunTransfer).toBeNull(); expect(latest.game.revolver).toBe(chamber);
    expect(vi.mocked(tableAudio.play).mock.calls.filter(([sound])=>sound==='slide')).toHaveLength(0);
    advance(shotAt+3400-Date.now()); expect(latest.game.phase).toBe('SWEEPING');
  });
  it('cancels an in-flight delivery on replay and never enables an old trigger or consumes the fresh cylinder', () => {
    vi.mocked(dealRound).mockImplementation(()=>copy(playerLoses)); startDecision(); act(()=>latest.stand()); advance(950+1500);
    expect(latest.game.gunTransfer?.stage).toBe('to-shooter'); advance(300);
    startMatch(); const revolver=latest.game.revolver;
    expect(latest.game.gunTransfer).toBeNull(); advance(GUN_SLIDE_MS);
    expect(latest.game.phase).toBe('DEALING'); expect(latest.game.awaitingTrigger).toBe(false);
    expect(latest.game.triggerDeadline).toBeNull(); expect(latest.game.revolver).toBe(revolver);
  });
});
