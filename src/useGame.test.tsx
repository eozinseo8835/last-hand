// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useGame } from './useGame';
import { createRevolver, dealRound, type Card, type Round } from './game';
import { tableAudio } from './audio';

vi.mock('./audio', () => ({
  tableAudio: { init: vi.fn(), play: vi.fn(), mute: vi.fn() },
}));
vi.mock('./game', async importOriginal => {
  const actual = await importOriginal<typeof import('./game')>();
  return { ...actual, createRevolver: vi.fn(), dealRound: vi.fn() };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const card = (rank: string, suit: Card['suit']): Card => ({ rank, suit, id: `${suit}-${rank}` });
const playerLoses: Round = {
  player: [card('A', 'spades'), card('2', 'hearts')],
  ai: [card('K', 'clubs'), card('Q', 'diamonds')],
};
const playerWins: Round = {
  player: [card('K', 'spades'), card('Q', 'hearts')],
  ai: [card('2', 'clubs'), card('A', 'diamonds')],
};
const tied: Round = {
  player: [card('K', 'spades'), card('A', 'hearts')],
  ai: [card('5', 'clubs'), card('6', 'diamonds')],
};

let latest!: ReturnType<typeof useGame>;
function Harness() { latest = useGame(); return null; }
let container: HTMLDivElement;
let root: Root;
let rootMounted: boolean;

function mount(element: ReactNode = <Harness/>) {
  act(() => root.render(element));
}
function advance(milliseconds: number) {
  act(() => vi.advanceTimersByTime(milliseconds));
}
function startDecision() {
  mount();
  act(() => latest.start());
  advance(950);
  expect(latest.game.phase).toBe('PLAYER_DECISION');
}
function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(node => node.textContent?.includes(text));
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}
function click(text: string) {
  act(() => button(text).click());
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.mocked(createRevolver).mockImplementation(() => ({ bulletChamber: 6, currentChamber: 1 }));
  vi.mocked(dealRound).mockImplementation(() => playerWins);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  rootMounted = true;
});

afterEach(() => {
  if (rootMounted) act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('game state machine and action locks', () => {
  it('cancels all pending deal and transition timers on unmount', () => {
    mount();
    act(() => latest.start());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => root.unmount());
    rootMounted = false;
    expect(vi.getTimerCount()).toBe(0);
    advance(10000);
    expect(dealRound).toHaveBeenCalledTimes(1);
  });

  it('allows exactly three folds, never shoots for a fold, and rejects double actions', () => {
    startDecision();
    for (let remaining = 2; remaining >= 0; remaining -= 1) {
      act(() => { latest.fold(); latest.fold(); latest.go(); latest.pullTrigger(); });
      expect(latest.game.phase).toBe('ROUND_RESULT');
      expect(latest.game.folds).toBe(remaining);
      expect(latest.game.revolver.currentChamber).toBe(1);
      advance(2850);
      expect(latest.game.phase).toBe('PLAYER_DECISION');
    }
    act(() => latest.fold());
    expect(latest.game.phase).toBe('PLAYER_DECISION');
    expect(latest.game.folds).toBe(0);
    expect(latest.game.roundNumber).toBe(4);
    expect(tableAudio.play).not.toHaveBeenCalledWith('tension');
    expect(tableAudio.play).not.toHaveBeenCalledWith('click');
  });

  it('rejects go, fold, and trigger while dealing and duplicate go during reveal', () => {
    mount();
    act(() => latest.start());
    expect(latest.game.phase).toBe('DEALING');
    act(() => { latest.go(); latest.fold(); latest.pullTrigger(); });
    expect(latest.game.phase).toBe('DEALING');
    expect(latest.game.revealed).toBe(false);
    expect(latest.game.folds).toBe(3);
    advance(950);
    act(() => { latest.go(); latest.go(); latest.fold(); latest.pullTrigger(); });
    expect(latest.game.phase).toBe('REVEAL');
    expect(latest.game.revealed).toBe(true);
    expect(latest.game.folds).toBe(3);
    expect(dealRound).toHaveBeenCalledTimes(1);
    advance(1200);
    expect(latest.game.result).toBe('player');
    expect(latest.game.revolver.currentChamber).toBe(1);
  });

  it('a tie skips shooting without consuming a fold or a chamber', () => {
    vi.mocked(dealRound).mockReturnValue(tied);
    startDecision();
    act(() => latest.go());
    advance(1200);
    expect(latest.game.result).toBe('tie');
    expect(latest.game.message).toBe('Tie — nobody shoots');
    advance(2950);
    expect(latest.game.phase).toBe('PLAYER_DECISION');
    expect(latest.game.roundNumber).toBe(2);
    expect(latest.game.folds).toBe(3);
    expect(latest.game.revolver.currentChamber).toBe(1);
    expect(tableAudio.play).not.toHaveBeenCalledWith('tension');
  });

  it('waits indefinitely for a losing player to click and fires only once on double click', () => {
    vi.mocked(dealRound).mockReturnValue(playerLoses);
    startDecision();
    act(() => latest.go());
    advance(2700);
    expect(latest.game.phase).toBe('PLAYER_SHOOTING');
    expect(latest.game.awaitingTrigger).toBe(true);
    advance(30000);
    expect(latest.game.awaitingTrigger).toBe(true);
    expect(latest.game.revolver.currentChamber).toBe(1);
    act(() => { latest.pullTrigger(); latest.pullTrigger(); latest.go(); latest.fold(); });
    expect(latest.game.suspense).toBe(true);
    expect(latest.game.awaitingTrigger).toBe(false);
    expect(tableAudio.play).toHaveBeenCalledWith('tension');
    expect(vi.mocked(tableAudio.play).mock.calls.filter(([sound]) => sound === 'tension')).toHaveLength(1);
    advance(2000);
    expect(latest.game.shotEffect).toBe('click');
    expect(latest.game.revolver.currentChamber).toBe(2);
    expect(latest.game.dead).toBeNull();
    expect(latest.game.folds).toBe(3);
    advance(4350);
    expect(latest.game.phase).toBe('PLAYER_DECISION');
  });

  it('automatically makes only a losing AI shoot and advances the same cylinder', () => {
    startDecision();
    act(() => latest.go());
    advance(2700);
    expect(latest.game.result).toBe('player');
    expect(latest.game.phase).toBe('AI_SHOOTING');
    expect(latest.game.awaitingTrigger).toBe(false);
    act(() => latest.pullTrigger());
    expect(latest.game.suspense).toBe(false);
    advance(900);
    expect(latest.game.suspense).toBe(true);
    advance(2000);
    expect(latest.game.revolver.currentChamber).toBe(2);
    expect(latest.game.shotEffect).toBe('click');
    expect(latest.game.dead).toBeNull();
  });

  it.each(['player', 'ai'] as const)('ends with %s dead only when that loser fires the loaded chamber', dead => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 });
    vi.mocked(dealRound).mockReturnValue(dead === 'player' ? playerLoses : playerWins);
    startDecision();
    act(() => latest.go());
    advance(2700);
    if (dead === 'player') act(() => latest.pullTrigger());
    else advance(900);
    advance(2000);
    expect(latest.game.dead).toBe(dead);
    expect(latest.game.shotEffect).toBe('shot');
    expect(latest.game.revolver.currentChamber).toBe(2);
    advance(2400);
    expect(latest.game.phase).toBe('GAME_OVER');
    act(() => { latest.go(); latest.fold(); latest.pullTrigger(); });
    expect(latest.game.phase).toBe('GAME_OVER');
  });

  it('Play Again resets cards, folds, bullet chamber, pointer, effects, and the opponent', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 1, currentChamber: 1 });
    startDecision();
    act(() => latest.fold());
    advance(2850);
    act(() => latest.go());
    advance(8000);
    expect(latest.game.phase).toBe('GAME_OVER');
    expect(latest.game.dead).toBe('ai');
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 4, currentChamber: 1 });
    act(() => latest.start());
    expect(latest.game.phase).toBe('DEALING');
    expect(latest.game.roundNumber).toBe(1);
    expect(latest.game.revolver).toEqual({ bulletChamber: 4, currentChamber: 1 });
    expect(latest.game.folds).toBe(3);
    expect(latest.game.dead).toBeNull();
    expect(latest.game.shotEffect).toBeNull();
    expect(latest.game.suspense).toBe(false);
    expect(latest.game.revealed).toBe(false);
    expect(latest.game.awaitingTrigger).toBe(false);
    expect(latest.game.result).toBeNull();
  });
});

describe('rendered controls and hidden information', () => {
  it('keeps the AI hidden card face and total out of the rendered UI until GO', () => {
    mount(<App/>);
    click('Sit down');
    advance(950);
    const hidden = container.querySelector('.opponent-cards .card-hidden');
    expect(hidden?.getAttribute('aria-label')).toBe('Face-down card');
    expect(hidden?.querySelector('.card-front')?.textContent ?? '').toBe('');
    expect(container.querySelector('.opponent-caption')?.textContent).toContain('??');
    expect(container.querySelector('.opponent-cards [aria-label="A of diamonds"]')).toBeNull();
    click('GO');
    expect(container.querySelector('.opponent-cards .card-hidden')).toBeNull();
    expect(container.querySelector('.opponent-cards [aria-label="A of diamonds"]')).not.toBeNull();
    expect(container.querySelector('.opponent-caption')?.textContent).toContain('3');
    expect(button('GO').disabled).toBe(true);
    expect(button('FOLD').disabled).toBe(true);
  });

  it('disables the rendered FOLD button after exactly three uses', () => {
    mount(<App/>);
    click('Sit down');
    advance(950);
    for (let fold = 0; fold < 3; fold += 1) {
      expect(button('FOLD').disabled).toBe(false);
      click('FOLD');
      expect(button('FOLD').disabled).toBe(true);
      advance(2850);
    }
    expect(button('FOLD').disabled).toBe(true);
    expect(button('GO').disabled).toBe(false);
    expect(container.querySelector('.fold-indicators')?.textContent).toContain('0 / 3');
    expect(container.querySelectorAll('.fold-indicators .full')).toHaveLength(0);
  });

  it('shows no bullet position in the cylinder and routes mute/unmute to the audio master', () => {
    vi.mocked(createRevolver).mockReturnValue({ bulletChamber: 5, currentChamber: 1 });
    mount(<App/>);
    click('Sit down');
    const cylinder = container.querySelector('.cylinder');
    expect(cylinder?.getAttribute('aria-label')).toContain('Bullet position unknown');
    expect(cylinder?.outerHTML).not.toContain('bulletChamber');
    const mute = container.querySelector<HTMLButtonElement>('[aria-label="Mute sound"]');
    act(() => mute?.click());
    expect(tableAudio.mute).toHaveBeenLastCalledWith(true);
    expect(container.querySelector('[aria-label="Unmute sound"]')?.getAttribute('aria-pressed')).toBe('true');
    const unmute = container.querySelector<HTMLButtonElement>('[aria-label="Unmute sound"]');
    act(() => unmute?.click());
    expect(tableAudio.mute).toHaveBeenLastCalledWith(false);
  });
});
