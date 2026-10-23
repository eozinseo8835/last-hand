// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useGame } from './useGame';
import { CONFIG, createDeck, createRevolver, dealRound, handTotal, type Card, type Round } from './game';
import { DIALOGUE } from './dialogue';
import { tableAudio } from './audio';

vi.mock('./audio', () => ({ tableAudio: { init: vi.fn(), play: vi.fn(), mute: vi.fn(), startVoice: vi.fn(), stopVoice: vi.fn(), getVoiceLevel: vi.fn(() => 0) } }));
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
const dealerBusts = fixture([card('9', 'spades'), card('8', 'hearts')], [card('K', 'clubs'), card('6', 'diamonds')], [card('Q', 'hearts')]);
const safeHits = fixture([card('2', 'spades'), card('3', 'hearts')], [card('9', 'clubs'), card('8', 'diamonds')], [card('4', 'clubs'), card('5', 'diamonds'), card('6', 'clubs'), card('2', 'diamonds')]);
const DEAL_COMPLETE = 500 + 4 * 650 + 600;
const FOLD_TO_DECISION = 700 + DEAL_COMPLETE;

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

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(.5);
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
    act(() => latest.stand()); advance(950 + CONFIG.DEAL_SPEED + 200);
    expect(latest.game.result).toBe('player'); expect(handTotal(latest.game.round!.ai)).toBe(26);
    expect(DIALOGUE.ai_busts).toContain(latest.game.dialogue);
    advance(1500); expect(latest.game.phase).toBe('AI_SHOOTING'); expect(latest.game.awaitingTrigger).toBe(false);
    advance(900 + 2000); expect(latest.game.revolver.currentChamber).toBe(2); expect(latest.game.shotEffect).toBe('click');
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

describe('unchanged shared revolver, forced trigger, and replay', () => {
  it('waits indefinitely for a losing player to click and fires only once on double click', () => {
    vi.mocked(dealRound).mockImplementation(() => copy(playerLoses)); startDecision();
    act(() => latest.stand()); advance(950 + 1500);
    expect(latest.game.phase).toBe('PLAYER_SHOOTING'); expect(latest.game.awaitingTrigger).toBe(true);
    advance(30000); expect(latest.game.awaitingTrigger).toBe(true); expect(latest.game.revolver.currentChamber).toBe(1);
    act(() => { latest.pullTrigger(); latest.pullTrigger(); latest.hit(); latest.stand(); latest.fold(); });
    expect(latest.game.suspense).toBe(true); expect(latest.game.awaitingTrigger).toBe(false);
    expect(vi.mocked(tableAudio.play).mock.calls.filter(([sound]) => sound === 'tension')).toHaveLength(1);
    advance(2000); expect(latest.game.shotEffect).toBe('click'); expect(latest.game.revolver.currentChamber).toBe(2);
    expect(latest.game.dead).toBeNull(); expect(latest.game.folds).toBe(3);
    advance(3400 + 700 + DEAL_COMPLETE); expect(latest.game.phase).toBe('PLAYER_DECISION');
  });

  it('automatically makes only a losing Stranger shoot and advances the same cylinder', () => {
    startDecision(); act(() => latest.stand()); advance(950 + 1500);
    expect(latest.game.result).toBe('player'); expect(latest.game.phase).toBe('AI_SHOOTING');
    expect(latest.game.awaitingTrigger).toBe(false); act(() => latest.pullTrigger()); expect(latest.game.suspense).toBe(false);
    advance(900); expect(latest.game.suspense).toBe(true);
    advance(2000); expect(latest.game.revolver.currentChamber).toBe(2); expect(latest.game.shotEffect).toBe('click'); expect(latest.game.dead).toBeNull();
  });

  it('keeps the same chamber pointer when the shooter changes across rounds', () => {
    startDecision(); act(() => latest.stand()); advance(950 + 1500 + 900 + 2000);
    expect(latest.game.revolver.currentChamber).toBe(2);
    vi.mocked(dealRound).mockImplementation(() => copy(playerLoses));
    advance(3400 + 700 + DEAL_COMPLETE);
    expect(latest.game.phase).toBe('PLAYER_DECISION'); expect(latest.game.roundNumber).toBe(2);
    expect(latest.game.revolver.currentChamber).toBe(2);
    act(() => latest.stand()); advance(950 + 1500);
    expect(latest.game.phase).toBe('PLAYER_SHOOTING');
    act(() => latest.pullTrigger()); advance(2000);
    expect(latest.game.revolver.currentChamber).toBe(3); expect(latest.game.shotEffect).toBe('click');
  });

  it.each(['player', 'ai'] as const)('ends with %s dead only when that loser fires the loaded chamber', dead => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 });
    vi.mocked(dealRound).mockImplementation(() => copy(dead === 'player' ? playerLoses : playerWins));
    startDecision(); act(() => latest.stand()); advance(950 + 1500);
    if (dead === 'player') act(() => latest.pullTrigger()); else advance(900);
    advance(2000); expect(latest.game.dead).toBe(dead); expect(latest.game.shotEffect).toBe('shot');
    expect(latest.game.revolver.currentChamber).toBe(2); advance(2400); expect(latest.game.phase).toBe('GAME_OVER');
    act(() => { latest.hit(); latest.stand(); latest.fold(); latest.pullTrigger(); }); expect(latest.game.phase).toBe('GAME_OVER');
  });

  it('Play Again resets all round, hit, fold, revolver, and death state', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 }); startDecision();
    vi.mocked(dealRound).mockImplementation(() => copy(playerBusts)); act(() => latest.fold()); advance(FOLD_TO_DECISION);
    act(() => latest.hit()); advance(CONFIG.DEAL_SPEED + 950 + 1500); act(() => latest.pullTrigger()); advance(2000 + 2400);
    expect(latest.game.phase).toBe('GAME_OVER'); expect(latest.game.hasHit).toBe(true); expect(latest.game.folds).toBe(2);
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 4, currentChamber: 1 });
    act(() => latest.start());
    expect(latest.game.phase).toBe('SHUFFLING'); expect(latest.game.roundNumber).toBe(1);
    expect(latest.game.revolver).toEqual({ bulletChamber: 4, currentChamber: 1 }); expect(latest.game.folds).toBe(3);
    expect(latest.game.hasHit).toBe(false); expect(latest.game.dead).toBeNull(); expect(latest.game.shotEffect).toBeNull();
    expect(latest.game.suspense).toBe(false); expect(latest.game.revealed).toBe(false); expect(latest.game.awaitingTrigger).toBe(false); expect(latest.game.result).toBeNull();
    expect(latest.game.round!.player).toHaveLength(0); expect(latest.game.round!.ai).toHaveLength(0);
  });
});

describe('rendered blackjack controls and hidden information', () => {
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
});
