// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useGame } from './useGame';
import { CONFIG, createDeck, createRevolver, dealRound, handTotal, type Card, type Round } from './game';
import { DIALOGUE } from './dialogue';
import { tableAudio } from './audio';
import { createVoicePlan } from './voice';
import { chooseRoundEvent, cosmeticRandom } from './tension';

vi.mock('./audio', () => ({ tableAudio: { init: vi.fn(), play: vi.fn(), mute: vi.fn(), startVoice: vi.fn(), stopVoice: vi.fn(), getVoiceLevel: vi.fn(() => 0), setHeartbeat: vi.fn(), setEvent: vi.fn(), getHeartbeatLevel: vi.fn(() => 0) } }));
vi.mock('./tension', async importOriginal => {
  const actual = await importOriginal<typeof import('./tension')>();
  return { ...actual, chooseRoundEvent: vi.fn(() => null), cosmeticRandom: vi.fn(() => .5) };
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
const DEALER_BUST_MS = 950 + 650 + 2 * (CONFIG.DEAL_SPEED + 200);
const AI_INITIAL_HESITATION = 2000;

let latest!: ReturnType<typeof useGame>;
function Harness() { latest = useGame(); return null; }
let container: HTMLDivElement, root: Root, rootMounted: boolean;
function mount(element: ReactNode = <Harness/>) { act(() => root.render(element)); }
function advance(milliseconds: number) { act(() => vi.advanceTimersByTime(milliseconds)); }
function startDecision() { mount(); act(() => latest.start()); advance(DEAL_COMPLETE); expect(latest.game.phase).toBe('PLAYER_DECISION'); }
function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(node => node.textContent?.includes(text));
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}
function click(text: string) { act(() => button(text).click()); }
function holdTrigger() { act(() => latest.beginTriggerHold()); advance(CONFIG.TRIGGER_HOLD_MS); }
function startPlayerShot() {
  vi.mocked(dealRound).mockImplementation(() => copy(playerLoses)); startDecision();
  act(() => latest.stand()); advance(950 + 1500);
  expect(latest.game.phase).toBe('PLAYER_SHOOTING');
}
function nextDecisionAfterEmptyShot() { advance(3400 + 700 + DEAL_COMPLETE); expect(latest.game.phase).toBe('PLAYER_DECISION'); }

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  vi.mocked(chooseRoundEvent).mockReturnValue(null);
  vi.mocked(cosmeticRandom).mockReturnValue(.5);
  vi.mocked(createRevolver).mockImplementation(() => ({ bulletChamber: 6, currentChamber: 1 }));
  vi.mocked(dealRound).mockImplementation(() => copy(playerWins));
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container); rootMounted = true;
});
afterEach(() => { if (rootMounted) act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('blackjack dealing and input locks', () => {
  it('cancels all pending deal and transition timers on unmount', () => {
    mount(); act(() => latest.start()); expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => root.unmount()); rootMounted = false;
    expect(vi.getTimerCount()).toBe(0); advance(10000); expect(dealRound).toHaveBeenCalledTimes(1);
  });

  it('shuffles, then deals P / Stranger up / P / Stranger hole one at a time with a sound each', () => {
    mount(); act(() => latest.start());
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
    expect(DIALOGUE.player_busts).toContain(latest.game.dialogue);
    advance(950 + 1500); expect(latest.game.phase).toBe('PLAYER_SHOOTING');
    advance(30000); expect(latest.game.awaitingTrigger).toBe(true);
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
    expect(DIALOGUE.ai_busts).toContain(latest.game.dialogue);
    advance(1500); expect(latest.game.phase).toBe('AI_SHOOTING'); expect(latest.game.awaitingTrigger).toBe(false);
    advance(AI_INITIAL_HESITATION); expect(latest.game.revolver.currentChamber).toBe(2); expect(latest.game.shotEffect).toBe('click');
  });

  it('a PUSH skips shooting without consuming a fold or a chamber, then sweeps before dealing again', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(tied)); startDecision();
    act(() => latest.stand()); advance(950);
    expect(latest.game.result).toBe('tie'); expect(latest.game.message).toMatch(/push/i);
    expect(latest.game.folds).toBe(3); expect(latest.game.revolver.currentChamber).toBe(1);
    expect(DIALOGUE.push).toContain(latest.game.dialogue);
    advance(2000); expect(latest.game.phase).toBe('SWEEPING');
    advance(700 + DEAL_COMPLETE); expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.roundNumber).toBe(2);
    expect(latest.game.folds).toBe(3); expect(latest.game.revolver.currentChamber).toBe(1);
    expect(tableAudio.play).not.toHaveBeenCalledWith('tension');
  });
});

describe('shared revolver, continuous trigger hold, and replay', () => {
  it('waits indefinitely, ignores a click, and fires once only after a complete hold', () => {
    startPlayerShot();
    advance(30000); expect(latest.game.awaitingTrigger).toBe(true); expect(latest.game.revolver.currentChamber).toBe(1);
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
    startDecision(); act(() => latest.stand()); advance(950 + 1500);
    expect(latest.game.result).toBe('player'); expect(latest.game.phase).toBe('AI_SHOOTING');
    expect(latest.game.awaitingTrigger).toBe(false); act(() => latest.beginTriggerHold());
    expect(latest.game.triggerHeld).toBe(false); expect(latest.game.suspense).toBe(true);
    advance(1499); expect(latest.game.revolver.currentChamber).toBe(1);
    advance(AI_INITIAL_HESITATION - 1499);
    expect(latest.game.revolver.currentChamber).toBe(2); expect(latest.game.shotEffect).toBe('click'); expect(latest.game.dead).toBeNull();
  });

  it('keeps the same chamber pointer when the shooter changes across rounds', () => {
    startDecision(); act(() => latest.stand()); advance(950 + 1500 + AI_INITIAL_HESITATION);
    expect(latest.game.revolver.currentChamber).toBe(2);
    vi.mocked(dealRound).mockImplementation(() => copy(playerLoses)); nextDecisionAfterEmptyShot();
    expect(latest.game.roundNumber).toBe(2); expect(latest.game.revolver.currentChamber).toBe(2);
    act(() => latest.stand()); advance(950 + 1500); holdTrigger();
    expect(latest.game.revolver.currentChamber).toBe(3); expect(latest.game.shotEffect).toBe('click');
  });

  it.each(['player', 'ai'] as const)('ends with %s dead only when that loser fires the loaded chamber', dead => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 });
    vi.mocked(dealRound).mockImplementation(() => copy(dead === 'player' ? playerLoses : playerWins));
    startDecision(); act(() => latest.stand()); advance(950 + 1500);
    if (dead === 'player') holdTrigger(); else advance(AI_INITIAL_HESITATION);
    expect(latest.game.dead).toBe(dead); expect(latest.game.shotEffect).toBe('shot');
    expect(latest.game.revolver.currentChamber).toBe(2); advance(2400); expect(latest.game.phase).toBe('GAME_OVER');
    act(() => { latest.hit(); latest.stand(); latest.fold(); latest.beginTriggerHold(); latest.pullTrigger(); });
    expect(latest.game.phase).toBe('GAME_OVER');
  });

  it('Play Again resets abilities, hold progress, folds, revolver, and death state', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 }); startDecision();
    act(() => latest.peek());
    vi.mocked(dealRound).mockImplementation(() => copy(playerBusts)); act(() => latest.fold()); advance(FOLD_TO_DECISION);
    act(() => latest.hit()); advance(CONFIG.DEAL_SPEED + 950 + 1500);
    act(() => latest.spinCylinder()); advance(800); holdTrigger(); advance(2400);
    expect(latest.game.phase).toBe('GAME_OVER'); expect(latest.game.hasHit).toBe(true); expect(latest.game.folds).toBe(2);
    expect(latest.game.abilities.player).toEqual({ spin: false, peek: false });
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 4, currentChamber: 1 }); act(() => latest.start());
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
    mount(<App/>); click('Sit down'); advance(DEAL_COMPLETE); click('STAND'); advance(950 + 1500);
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
    mount(<App/>); click('Sit down'); advance(DEAL_COMPLETE); click('STAND'); advance(950 + 1500);
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(down, { button: 0, pointerId: 1, isPrimary: true });
    act(() => button('HOLD TO PULL').dispatchEvent(down)); advance(1000);
    expect(button('HOLD TO PULL').getAttribute('aria-pressed')).toBe('true');
    expect(Number(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    act(() => root.unmount()); rootMounted = false;
    expect(vi.getTimerCount()).toBe(0); advance(10000);
    expect(tableAudio.play).not.toHaveBeenCalledWith('click');
    expect(tableAudio.play).not.toHaveBeenCalledWith('shot');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the hole card and Stranger total hidden until STAND and locks actions during reveal', () => {
    mount(<App/>); click('Sit down'); advance(DEAL_COMPLETE);
    const hidden = container.querySelector('.opponent-cards .card-hidden');
    expect(hidden?.getAttribute('aria-label')).toBe('Face-down card');
    expect(hidden?.querySelector('.card-front')?.textContent ?? '').toBe('');
    expect(container.querySelector('.opponent-caption')?.textContent).toContain('??');
    expect(container.querySelector('.opponent-cards [aria-label="8 of diamonds"]')).toBeNull();
    click('STAND'); expect(container.querySelector('.opponent-cards .card-hidden')).toBeNull();
    expect(container.querySelector('.opponent-cards [aria-label="8 of diamonds"]')).not.toBeNull();
    expect(container.querySelector('.opponent-caption')?.textContent).toContain('17');
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
    expect(container.querySelector('.opponent-caption')?.textContent).toContain('??');
  });

  it('shows no bullet position in the cylinder and routes mute/unmute to the audio master', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 5, currentChamber: 1 }); mount(<App/>); click('Sit down');
    const cylinder = container.querySelector('.cylinder'); expect(cylinder?.getAttribute('aria-label')).toContain('Bullet position unknown');
    expect(cylinder?.outerHTML).not.toContain('bulletChamber');
    const mute = container.querySelector<HTMLButtonElement>('[aria-label="Mute sound"]'); act(() => mute?.click());
    expect(tableAudio.mute).toHaveBeenLastCalledWith(true); expect(container.querySelector('[aria-label="Unmute sound"]')?.getAttribute('aria-pressed')).toBe('true');
    const unmute = container.querySelector<HTMLButtonElement>('[aria-label="Unmute sound"]'); act(() => unmute?.click()); expect(tableAudio.mute).toHaveBeenLastCalledWith(false);
  });

  it('waits for Sit down before starting audio, then voices the intro and opening subtitle', () => {
    mount(<App/>); advance(1000);
    expect(tableAudio.init).not.toHaveBeenCalled();
    expect(tableAudio.startVoice).not.toHaveBeenCalled();
    click('Sit down');
    expect(tableAudio.init).toHaveBeenCalledTimes(1);
    expect(tableAudio.startVoice).toHaveBeenCalledTimes(1);
    const introVoice = vi.mocked(tableAudio.startVoice).mock.calls[0][0];
    advance(DEAL_COMPLETE);
    expect(tableAudio.startVoice).toHaveBeenCalledTimes(2);
    const openingVoice = vi.mocked(tableAudio.startVoice).mock.calls[1][0];
    expect(introVoice.parameters.pitch).toBeLessThan(openingVoice.parameters.pitch);
    const beforeSkip = vi.mocked(tableAudio.stopVoice).mock.calls.length;
    act(() => container.querySelector<HTMLButtonElement>('.dialogue')!.click());
    expect(tableAudio.stopVoice).toHaveBeenCalledTimes(beforeSkip + 1);
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
    const previousVoiceCount = vi.mocked(tableAudio.startVoice).mock.calls.length;
    const previousVoiceOrder = vi.mocked(tableAudio.startVoice).mock.invocationCallOrder.at(-1)!;
    click(action);
    if (delay > 0) advance(delay);

    const subtitle = container.querySelector('.dialogue')?.getAttribute('aria-label')?.replace(/ Click to finish dialogue\.$/, '');
    expect(subtitle).toBeTruthy();
    expect(DIALOGUE[category]).toContain(subtitle);
    expect(vi.mocked(tableAudio.startVoice).mock.calls.length).toBeGreaterThan(previousVoiceCount);
    expect(tableAudio.startVoice).toHaveBeenLastCalledWith(createVoicePlan(subtitle!, category, false));
    const stoppedVoiceOrder = vi.mocked(tableAudio.stopVoice).mock.invocationCallOrder.at(-1)!;
    const replacementVoiceOrder = vi.mocked(tableAudio.startVoice).mock.invocationCallOrder.at(-1)!;
    expect(stoppedVoiceOrder).toBeGreaterThan(previousVoiceOrder);
    expect(stoppedVoiceOrder).toBeLessThan(replacementVoiceOrder);
  });
});

describe('trigger commitment and hesitation', () => {
  it('loses all accumulated hold time on release and drains the visible progress over 600ms', () => {
    startPlayerShot(); act(() => latest.beginTriggerHold()); advance(1800);
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
    expect(tableAudio.play).not.toHaveBeenCalledWith('click'); expect(tableAudio.play).not.toHaveBeenCalledWith('shot');
  });

  it('taunts an idle player after ten seconds and repeats without ever auto-firing', () => {
    startPlayerShot(); const opening = latest.game.dialogue;
    advance(9999); expect(latest.game.dialogue).toBe(opening);
    advance(1); expect(DIALOGUE.impatient).toContain(latest.game.dialogue);
    const impatient = latest.game.dialogue; advance(4000);
    expect(DIALOGUE.impatient).toContain(latest.game.dialogue); expect(latest.game.dialogue).not.toBe(impatient);
    expect(latest.game.phase).toBe('PLAYER_SHOOTING'); expect(latest.game.revolver.currentChamber).toBe(1);
    expect(latest.game.awaitingTrigger).toBe(true); expect(latest.game.shotEffect).toBeNull();
  });

  it('makes the opponent hesitate longer after more fired chambers, without using a hidden card total', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 6, currentChamber: 3 });
    startDecision(); act(() => latest.stand()); advance(950 + 1500);
    expect(latest.game.phase).toBe('AI_SHOOTING');
    advance(AI_INITIAL_HESITATION); expect(latest.game.revolver.currentChamber).toBe(3);
    advance(600); expect(latest.game.revolver.currentChamber).toBe(4);
  });
});

describe('one-time SPIN per side and match', () => {
  it('rejects non-shooters, consumes one player spin, resets the pointer, and still requires a full hold', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 6, currentChamber: 4 });
    vi.mocked(dealRound).mockImplementation(() => copy(playerLoses)); startDecision();
    act(() => latest.spinCylinder());
    expect(latest.game.revolver.currentChamber).toBe(4); expect(latest.game.abilities.player.spin).toBe(true);
    act(() => latest.stand()); advance(950 + 1500);
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
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 5, currentChamber: 1 }); advance(1500);
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
        act(() => latest.stand()); advance(950 + 1500);
        act(() => latest.spinCylinder()); expect(latest.game.abilities.player.spin).toBe(false);
      }
    }
    expect(latest.game.dead).toBe('player'); advance(2400); expect(latest.game.phase).toBe('GAME_OVER');
    expect(latest.game.abilities.ai.spin).toBe(true);
  });

  it('keeps the opponent SPIN spent when later rounds return to three remaining chambers', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 6, currentChamber: 4 }); startDecision();
    act(() => latest.stand()); advance(950);
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 6, currentChamber: 1 }); advance(1500);
    expect(latest.game.spinning).toBe('ai'); advance(800 + AI_INITIAL_HESITATION);
    expect(latest.game.revolver.currentChamber).toBe(2); expect(latest.game.abilities.ai.spin).toBe(false);
    const creations = vi.mocked(createRevolver).mock.calls.length;
    for (let chamber = 2; chamber <= 4; chamber++) {
      nextDecisionAfterEmptyShot(); act(() => latest.stand()); advance(950 + 1500);
      expect(latest.game.phase).toBe('AI_SHOOTING'); expect(latest.game.spinning).toBeNull();
      expect(latest.game.revolver.currentChamber).toBe(chamber);
      advance(AI_INITIAL_HESITATION + (chamber - 1) * 300);
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
    act(() => latest.peek());
    expect(latest.game.peekedCard).toEqual(next); expect(latest.game.peekActor).toBe('player');
    expect(latest.game.abilities.player.peek).toBe(false); expect(latest.game.abilities.ai.peek).toBe(true);
    expect(latest.game.round).toBe(before); const serial = latest.game.peekSerial;
    act(() => latest.peek()); expect(latest.game.peekSerial).toBe(serial);
    act(() => latest.hit()); expect(latest.game.round!.player.at(-1)).toEqual(next);
    expect(latest.game.round!.deck[0]).toEqual(before.deck[1]); expect(latest.game.peekedCard).toBeNull();
    advance(CONFIG.DEAL_SPEED); act(() => latest.peek()); expect(latest.game.peekedCard).toBeNull();
  });

  it.each(['fold', 'stand'] as const)('clears a private preview on %s and keeps it spent next round', action => {
    startDecision(); act(() => latest.peek()); expect(latest.game.peekedCard).not.toBeNull();
    act(() => latest[action]()); expect(latest.game.peekedCard).toBeNull();
    if (action === 'fold') {
      advance(FOLD_TO_DECISION); expect(latest.game.abilities.player.peek).toBe(false);
      act(() => latest.peek()); expect(latest.game.peekedCard).toBeNull();
    }
  });

  it('rejects PEEK outside the decision phase and preserves the hidden hole card', () => {
    mount(); act(() => latest.start()); act(() => latest.peek());
    expect(latest.game.abilities.player.peek).toBe(true); expect(latest.game.peekedCard).toBeNull();
    advance(DEAL_COMPLETE); act(() => latest.peek()); expect(latest.game.revealed).toBe(false);
    act(() => latest.stand()); act(() => latest.peek()); expect(latest.game.peekedCard).toBeNull();
  });

  it('lets the opponent break its normal draw rule once when the peeked card would bust it', () => {
    const cautious = fixture(playerWins.player, [card('K', 'clubs'), card('6', 'diamonds')], [card('Q', 'hearts')]);
    vi.mocked(dealRound).mockImplementation(() => copy(cautious)); startDecision();
    const deck = [...latest.game.round!.deck]; act(() => latest.stand()); advance(950);
    expect(latest.game.phase).toBe('DEALER_PEEKING'); expect(latest.game.peekActor).toBe('ai');
    expect(latest.game.peekedCard).toBeNull(); expect(DIALOGUE.opp_peeks).toContain(latest.game.dialogue);
    expect(latest.game.abilities.ai.peek).toBe(false); expect(latest.game.round!.deck).toEqual(deck);
    advance(650); expect(latest.game.phase).toBe('ROUND_RESULT'); expect(latest.game.result).toBe('player');
    expect(latest.game.round!.ai).toHaveLength(2); expect(latest.game.round!.deck).toEqual(deck);
  });

  it('draws its safe peeked card exactly once, then follows normal draws after PEEK is spent', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(dealerBusts)); startDecision();
    const first = latest.game.round!.deck[0], second = latest.game.round!.deck[1];
    act(() => latest.stand()); advance(950 + 650);
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
    mount(); act(() => latest.start()); advance(DEAL_COMPLETE - 1); expect(latest.game.event).toBeNull();
    advance(1); act(() => latest.stand()); expect(latest.game.event).toBeNull();
    advance(950 + 1500); expect(latest.game.phase).toBe('PLAYER_SHOOTING');
    advance(20000); expect(latest.game.event).toBeNull(); expect(latest.game.revolver.currentChamber).toBe(1);
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
    expect(latest.game.dialogueCategory).toBe(category); expect(DIALOGUE[category]).toContain(latest.game.dialogue);
    expect(latest.game.dialogueChambersFired).toBe(fired);
  });
});
