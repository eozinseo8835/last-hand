// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import Scene from './Scene';
import { useGame } from './useGame';
import { tableAudio } from './audio';
import { HOST, OPPONENTS, freshRunStats, type RoomNumber } from './campaign';
import { freshAbilities } from './tension';
import { createVoicePlan } from './voice';

vi.mock('./useGame', () => ({ useGame: vi.fn() }));
vi.mock('./Scene', () => ({ default: vi.fn(() => null) }));
vi.mock('./audio', () => ({ tableAudio: {
  init: vi.fn(), play: vi.fn(), mute: vi.fn(), startVoice: vi.fn(), stopVoice: vi.fn(),
  setHeartbeat: vi.fn(), setEvent: vi.fn(), getVoiceLevel: vi.fn(() => 0), getVoiceSpeaker: vi.fn(() => null),
} }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const actions = {
  start: vi.fn(), fold: vi.fn(), hit: vi.fn(), stand: vi.fn(), pullTrigger: vi.fn(),
  beginTriggerHold: vi.fn(), endTriggerHold: vi.fn(), spinCylinder: vi.fn(), peek: vi.fn(),
  finishSpeech: vi.fn(), advanceOpening: vi.fn(), skipOpening: vi.fn(),
};
function fixture(roomNumber: RoomNumber = 1) {
  return {
    phase: 'PLAYER_DECISION', roomNumber, roundNumber: 1,
    round: { player: [], ai: [], deck: [] }, folds: 3,
    revolver: { bulletChamber: 6, currentChamber: 1 }, revealed: false, result: null,
    message: 'Your move. Hit, stand, or fold.', suspense: false, awaitingTrigger: false, hasHit: false,
    dead: null as 'player' | 'ai' | null, shotEffect: null, abilities: freshAbilities(), tell: null,
    triggerHeld: false, triggerProgress: 0, spinning: null, spinSerial: 0,
    peekActor: null, peekSerial: 0, peekedCard: null, event: null,
    speech: { id: 1, speaker: 'captive' as 'host' | 'captive', text: 'I would rather stay here.', category: 'nervous', danger: false, chambersFired: 0 },
    dialogue: '', dialogueCategory: 'nervous', dialogueDanger: false, dialogueChambersFired: 0,
    guestsRemaining: roomNumber === 1 ? 8 : roomNumber === 2 ? 4 : 2,
    feedDeaths: [], feedDeathSerial: 0, storyStage: 'none', introShort: false, introIndex: 0,
    stats: freshRunStats(1000),
  };
}
let game: ReturnType<typeof fixture>, container: HTMLDivElement, root: Root;
function render() { act(() => root.render(<App/>)); }
function button(text: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.includes(text));
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}
function sceneSpeaker() {
  return (vi.mocked(Scene).mock.calls.at(-1)![0] as unknown as { speaker: 'host' | 'captive' | null }).speaker;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); game = fixture();
  vi.mocked(useGame).mockImplementation(() => ({ game, ...actions } as unknown as ReturnType<typeof useGame>));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('campaign speaker presentation', () => {
  it.each([1, 2, 3] as const)('keeps the room %s caption, voice profile and scene speaker on the same character', room => {
    game = fixture(room); render();
    expect(container.querySelectorAll('.stranger-transmission')).toHaveLength(1);
    expect(container.querySelectorAll('.dialogue')).toHaveLength(1);
    expect(container.querySelector('.speaker-captive .speaker-label')?.textContent).toBe(OPPONENTS[room].name);
    expect(sceneSpeaker()).toBe('captive');
    expect(tableAudio.startVoice).toHaveBeenLastCalledWith(createVoicePlan(game.speech.text, game.speech.category, false, 0, OPPONENTS[room].voice), 'captive');

    const stops = vi.mocked(tableAudio.stopVoice).mock.calls.length;
    game = { ...game, speech: { ...game.speech, id: 2, speaker: 'host', category: 'round_result', text: 'The table has made its choice.' } };
    render();
    expect(container.querySelectorAll('.dialogue')).toHaveLength(1);
    expect(container.querySelector('.speaker-host .speaker-label')?.textContent).toBe(HOST.name);
    expect(container.querySelector('.speaker-captive')).toBeNull(); expect(sceneSpeaker()).toBe('host');
    expect(tableAudio.stopVoice).toHaveBeenCalledTimes(stops + 1);
    expect(tableAudio.startVoice).toHaveBeenLastCalledWith(createVoicePlan(game.speech.text, game.speech.category, false, 0, HOST.voice), 'host');
  });

  it('routes a subtitle skip through the engine without starting a second speaker', () => {
    render(); act(() => container.querySelector<HTMLButtonElement>('.dialogue')!.click());
    expect(actions.finishSpeech).toHaveBeenCalledTimes(1);
    expect(tableAudio.stopVoice).toHaveBeenCalled();
    expect(tableAudio.startVoice).toHaveBeenCalledTimes(1); expect(container.querySelectorAll('.dialogue')).toHaveLength(1);
  });

  it('keeps Skip available during the hooded opening and connects both opening controls', () => {
    game = { ...game, phase: 'OPENING', storyStage: 'hooded', speech: { ...game.speech, speaker: 'host', category: 'intro_rules', text: 'Eight guests. Four tables. One door.' } };
    render();
    expect(container.querySelector('.story-hooded')).not.toBeNull();
    expect(button('Skip introduction').disabled).toBe(false);
    expect(button('Continue').disabled).toBe(true);
    game = { ...game, storyStage: 'rules' }; render();
    act(() => button('Continue').click()); expect(actions.advanceOpening).toHaveBeenCalledTimes(1);
    act(() => button('Skip introduction').click()); expect(actions.skipOpening).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.speaker-host .speaker-label')?.textContent).toBe(HOST.name);
    game = { ...game, introShort: true }; render(); expect(container.querySelector('.opening-controls')?.textContent).toContain('WELCOME BACK.');
  });

  it.each([{ room: 2, win: false }, { room: 3, win: false }, { room: 3, win: true }] as const)('shows every run statistic at room $room ending (survived=$win)', ({ room, win }) => {
    game = fixture(room);
    game = { ...game, phase: 'GAME_OVER', dead: win ? 'ai' : 'player', guestsRemaining: room === 2 ? 3 : 1,
      stats: { ...freshRunStats(1000), roomsCleared: win ? 3 : room - 1, roundsPlayed: 12,
        handsWon: 7, handsLost: 4, handsPushed: 1, hits: 9, busts: 2, foldsUsed: 5, highestChamber: 6,
        abilitiesUsed: { player: { spin: 2, peek: 3 }, ai: { spin: 1, peek: 2 } },
        guestsRemainingWhenFell: win ? null : room === 2 ? 3 : 1, totalTimeMs: 125000 } };
    render();
    const entries = Object.fromEntries([...container.querySelectorAll('.run-stats > div')].map(node => [node.querySelector('dt')?.textContent, node.querySelector('dd')?.textContent]));
    expect(entries).toEqual({
      'ROOMS CLEARED': `${win ? 3 : room - 1} / 3`, 'ROUNDS PLAYED': '12',
      'HANDS WON / LOST / PUSHED': '7 / 4 / 1', 'HITS / BUSTS': '9 / 2', 'FOLDS USED': '5',
      'HIGHEST CHAMBER': '6', 'FORCED SHOTS': '0', 'YOUR SPIN / PEEK': '2 / 3', 'OPPONENT SPIN / PEEK': '1 / 2',
      [win ? 'GUESTS REMAINING' : 'GUESTS WHEN YOU FELL']: room === 2 ? '3' : '1', 'TOTAL TIME': '2:05',
    });
    expect(container.querySelector('.end-content h2')?.textContent).toContain(win ? 'SURVIVED' : 'YOU DIED');
    expect(container.querySelectorAll('.dialogue')).toHaveLength(0); expect(tableAudio.startVoice).not.toHaveBeenCalled();
    act(() => button('Play Again').click()); expect(actions.start).toHaveBeenCalledTimes(1);
  });
});

describe('Big Update 2 decision and trigger HUD', () => {
  it('lights PEEK only for a shared attention window and shows the successful corner note', () => {
    Object.assign(game,{attention:{window:false}}); render(); expect(button('PEEK').disabled).toBe(true);
    Object.assign(game,{attention:{window:true}}); render(); expect(button('PEEK').disabled).toBe(false);
    expect(button('PEEK').classList.contains('peek-window')).toBe(true);
    Object.assign(game,{peekedCard:{rank:'2',suit:'hearts',id:'hearts-2'}}); render();
    expect(container.querySelector('.peek-note')?.textContent).toBe('You saw: 2♥');
  });
  it('shows a red countdown under five seconds and removes every shooting control during Host enforcement', () => {
    Object.assign(game,{phase:'PLAYER_SHOOTING',awaitingTrigger:true,triggerRemainingMs:4999}); render();
    expect(container.querySelector('.trigger-countdown.urgent')?.textContent).toBe('5s');
    expect(button('HOLD TO PULL').disabled).toBe(false);
    Object.assign(game,{phase:'HOST_FORCE_SHOT',awaitingTrigger:false}); render();
    expect(container.querySelector('.host-enforcement')).not.toBeNull();
    expect(container.querySelector('.spin-button')).toBeNull(); expect(container.querySelector('.trigger-countdown')).toBeNull();
  });
});
