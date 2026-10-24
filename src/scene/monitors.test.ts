// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createCeilingFeed, createMonitorWall } from './monitors';
import { stageDurationMs } from '../cinematics';

let scene: THREE.Scene, monitors: ReturnType<typeof createMonitorWall>;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    fillRect() {}, beginPath() {}, ellipse() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, fillText() {},
  } as unknown as CanvasRenderingContext2D));
  scene = new THREE.Scene(); monitors = createMonitorWall(scene);
});

describe('real ceiling-camera feed', () => {
  function renderer(current: THREE.WebGLRenderTarget | null = null) {
    return {
      setRenderTarget: vi.fn((target: THREE.WebGLRenderTarget | null) => { current = target; }),
      getRenderTarget: vi.fn(() => current),
      render: vi.fn((_scene: THREE.Object3D, _camera: THREE.Camera) => {}),
    };
  }

  it('renders the actual room scene from the ceiling into a shared 96x72 target without recursive monitor feedback', () => {
    const feed = createCeilingFeed(scene, monitors.group), previous = new THREE.WebGLRenderTarget(8, 8);
    const gpu = renderer(previous);
    gpu.render.mockImplementation((renderedScene, camera) => {
      expect(renderedScene).toBe(scene); expect(camera).toBe(feed.camera);
      expect(gpu.getRenderTarget()).toBe(feed.target);
      expect(monitors.group.visible).toBe(false);
    });
    expect(feed.target.width).toBe(96); expect(feed.target.height).toBe(72);
    expect(feed.target.texture.minFilter).toBe(THREE.NearestFilter);
    expect(feed.camera.parent).toBe(scene);
    expect(feed.camera.position.toArray()).toEqual([1.75, 3.65, 1.65]);
    const overheadPlayer = new THREE.Object3D(); overheadPlayer.layers.set(1);
    const seatedCamera = new THREE.PerspectiveCamera();
    expect(feed.camera.layers.test(overheadPlayer.layers)).toBe(true);
    expect(seatedCamera.layers.test(overheadPlayer.layers)).toBe(false);
    expect(feed.render(gpu, 0, true)).toBe(true);
    expect(feed.frames).toBe(1); expect(monitors.group.visible).toBe(true);
    expect(gpu.getRenderTarget()).toBe(previous);
    expect(gpu.render).toHaveBeenCalledTimes(1);
    feed.dispose(); previous.dispose();
  });

  it('bounds real scene renders to 10 Hz and resumes without a backlog', () => {
    const feed = createCeilingFeed(scene, monitors.group), gpu = renderer();
    for (let frame = 0; frame < 400; frame++) feed.render(gpu, frame / 400, true);
    expect(feed.frames).toBe(10);
    expect(feed.render(gpu, 10, false)).toBe(false);
    expect(feed.render(gpu, 20, true)).toBe(true);
    expect(feed.frames).toBe(11);
    expect(feed.render(gpu, 20.001, true)).toBe(false);
    feed.reset(); expect(feed.frames).toBe(0);
    expect(feed.render(gpu, 20.002, true)).toBe(true);
    feed.dispose();
  });

  it('frames all three seats from the ceiling without the hanging lamp blocking the table', () => {
    const feed = createCeilingFeed(scene, monitors.group);
    feed.camera.updateMatrixWorld(true);
    for (const position of [[-1.95, 2.05, -.45], [0, 2.05, -1.65], [0, 1.85, 1.8]]) {
      const head = new THREE.Vector3(...position).project(feed.camera);
      expect(Math.abs(head.x)).toBeLessThan(.9);
      expect(Math.abs(head.y)).toBeLessThan(.9);
      expect(head.z).toBeGreaterThan(-1); expect(head.z).toBeLessThan(1);
    }
    const table = new THREE.Vector3(0, .89, 0), eye = feed.camera.position;
    const sightline = new THREE.Line3(eye, table);
    const closest = sightline.closestPointToPoint(new THREE.Vector3(0, 2.76, .02), true, new THREE.Vector3());
    expect(closest.distanceTo(new THREE.Vector3(0, 2.76, .02))).toBeGreaterThan(.4);
    feed.dispose();
  });

  it('restores the original render target and visibility even if the GPU render throws', () => {
    const feed = createCeilingFeed(scene, monitors.group), previous = new THREE.WebGLRenderTarget(8, 8);
    const gpu = renderer(previous);
    monitors.group.visible = false;
    gpu.render.mockImplementationOnce(() => { throw new Error('Lost context'); });
    expect(() => feed.render(gpu, 0, true)).toThrow('Lost context');
    expect(monitors.group.visible).toBe(false);
    expect(gpu.getRenderTarget()).toBe(previous);
    expect(feed.frames).toBe(0);
    feed.dispose(); previous.dispose();
  });

  it('removes the camera and disposes its target only once', () => {
    const feed = createCeilingFeed(scene, monitors.group), gpu = renderer();
    const disposed = vi.spyOn(feed.target, 'dispose');
    feed.dispose(); feed.dispose();
    expect(feed.camera.parent).toBeNull(); expect(disposed).toHaveBeenCalledTimes(1);
    expect(feed.render(gpu, 1, true)).toBe(false);
    expect(gpu.render).not.toHaveBeenCalled();
  });
});
afterEach(() => { monitors.dispose(); vi.restoreAllMocks(); });

describe('campaign surveillance feeds', () => {
  it('shows three other tables in room 1, one in room 2, and labels their surviving future opponents', () => {
    monitors.update({ roomNumber: 1 }, 0);
    expect(monitors.screens.map(screen => screen.userData.tableId)).toEqual([2, 3, 4]);
    expect(monitors.screens.every(screen => screen.parent?.visible)).toBe(true);
    monitors.update({ roomNumber: 1, feedDeaths: [3] }, 1);
    expect(monitors.screens[1].userData.survivorLabel).toBe('GAMBLER');
    monitors.update({ roomNumber: 2, feedDeaths: [2] }, 2);
    expect(monitors.screens.map(screen => screen.parent?.visible)).toEqual([false, true, false]);
    expect(monitors.screens[1].userData.tableId).toBe(2);
    expect(monitors.screens[1].userData.survivorLabel).toBe('SURVIVOR');
    expect(monitors.group.userData.feedCount).toBe(1);
  });

  it('updates generated feeds at ten frames per second even when the main scene runs much faster', () => {
    for (let frame = 0; frame < 400; frame++) monitors.update({ roomNumber: 1 }, frame / 400);
    expect(monitors.group.userData.renderCount).toBe(10);
    const version = monitors.screens[0].material.map!.version;
    monitors.update({ roomNumber: 1 }, .999);
    expect(monitors.screens[0].material.map!.version).toBe(version);
    monitors.update({ roomNumber: 1 }, 1);
    expect(monitors.group.userData.renderCount).toBe(11);
    expect(monitors.screens[0].material.map!.version).toBe(version + 1);
  });

  it('flashes, slumps, then darkens only the dead seat and never restarts an already shown death', () => {
    monitors.update({ roomNumber: 1, feedDeaths: [] }, 0);
    monitors.update({ roomNumber: 1, feedDeaths: [2], feedDeathSerial: 1 }, .2);
    expect(monitors.screens[0].userData.status).toBe('flash');
    expect(monitors.screens[1].userData.status).toBe('live');
    monitors.update({ roomNumber: 1, feedDeaths: [2], feedDeathSerial: 1 }, .5);
    expect(monitors.screens[0].userData.status).toBe('slumping');
    monitors.update({ roomNumber: 1, feedDeaths: [2], feedDeathSerial: 1 }, .9);
    expect(monitors.screens[0].userData.status).toBe('seat-dark');
    monitors.update({ roomNumber: 1, feedDeaths: [2, 4], feedDeathSerial: 2 }, 1.1);
    expect(monitors.screens[0].userData.status).toBe('seat-dark');
    expect(monitors.screens[2].userData.status).toBe('flash');
  });

  it('shows hooded captives being uncovered during the opening', () => {
    monitors.update({ roomNumber: 1, phase: 'OPENING', storyStage: 'hooded' }, 4);
    expect(monitors.screens[0].userData.hoodProgress).toBe(0);
    monitors.update({ roomNumber: 1, phase: 'OPENING', storyStage: 'hooded' }, 4.3);
    expect(monitors.screens[0].userData.hoodProgress).toBe(0);
    monitors.update({ roomNumber: 1, phase: 'OPENING', storyStage: 'unhood' }, 4.45);
    monitors.update({ roomNumber: 1, phase: 'OPENING', storyStage: 'unhood' }, 4.85);
    expect(monitors.screens[0].userData.hoodProgress).toBeCloseTo(.5);
    monitors.update({ roomNumber: 1, phase: 'OPENING', storyStage: 'rules' }, 5.3);
    expect(monitors.screens[0].userData.hoodProgress).toBe(1);
  });

  it('uses the actual ceiling render texture in room 3 and replaces it with NO SIGNAL when cut', () => {
    const ceiling = new THREE.Texture();
    const externalDispose = vi.spyOn(ceiling, 'dispose');
    monitors.setCeilingTexture(ceiling);
    monitors.update({ roomNumber: 3 }, 0);
    expect(monitors.screens.every(screen => screen.material.map === ceiling)).toBe(true);
    expect(monitors.group.userData.mode).toBe('ceiling');
    monitors.setSignalLost(true); monitors.update({ roomNumber: 3 }, .1);
    expect(monitors.group.userData.mode).toBe('no-signal');
    expect(monitors.screens.every(screen => screen.material.map === monitors.signalTexture)).toBe(true);
    expect(monitors.screens.every(screen => screen.userData.status === 'no-signal')).toBe(true);
    monitors.setSignalLost(false); monitors.update({ roomNumber: 3 }, .2);
    expect(monitors.screens.every(screen => screen.material.map === ceiling)).toBe(true);
    monitors.dispose(); expect(externalDispose).not.toHaveBeenCalled(); ceiling.dispose();
  });

  it('resets old deaths on replay and disposes all owned screen resources without leaving wall geometry', () => {
    monitors.update({ roomNumber: 1, feedDeaths: [2, 3, 4] }, 0);
    monitors.reset(); monitors.update({ roomNumber: 1 }, 1);
    expect(monitors.screens.every(screen => screen.userData.status === 'live')).toBe(true);
    const maps = monitors.screens.map(screen => screen.material.map!);
    const mapDispose = maps.map(map => vi.spyOn(map, 'dispose'));
    const geometryDispose = vi.spyOn(monitors.screens[0].geometry, 'dispose');
    monitors.dispose();
    for (const dispose of mapDispose) expect(dispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(scene.getObjectByName('campaign-monitor-wall')).toBeUndefined();
    monitors.dispose();
    for (const dispose of mapDispose) expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('living tables on the monitor wall', () => {
  it('gives every generated table one pale masked Host who deals to two distinct captive seats', () => {
    monitors.update({ roomNumber: 1 }, 4);
    for (const screen of monitors.screens) {
      expect(screen.userData.hostVisible).toBe(true);
      expect(screen.userData.hostMasked).toBe(true);
      expect(screen.userData.captiveCount).toBe(2);
      expect(screen.userData.hostAction).toBe('deal');
      expect(screen.userData.activity).toBe('deal');
    }
    monitors.update({ roomNumber: 2 }, 4.2);
    const active = monitors.screens.filter(screen => screen.parent?.visible);
    expect(active).toHaveLength(1);
    expect(active[0].userData.hostAction).toBe('deal');
  });

  it('shows a conspicuous gesture or glitch at least every twenty seconds without using gameplay RNG', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Feed consumed deck randomness'); });
    for (const roomNumber of [1, 2] as const) {
      const events = new Map<number, number>(), kinds = new Set<string>();
      for (let time = 0; time < 180; time += .25) {
        monitors.update({ roomNumber }, time);
        for (const screen of monitors.screens.filter(screen => screen.parent?.visible)) {
          if (screen.userData.activity !== 'deal') {
            if (!events.has(screen.userData.activitySerial)) events.set(screen.userData.activitySerial, time);
            kinds.add(screen.userData.activity);
          }
        }
      }
      const starts = [...events.values()];
      expect(starts.length).toBeGreaterThan(10);
      for (let index = 1; index < starts.length; index++) expect(starts[index] - starts[index - 1]).toBeLessThanOrEqual(20);
      for (const kind of ['flinch', 'beg', 'slam', 'hide', 'glitch']) expect(kinds.has(kind)).toBe(true);
      monitors.reset();
    }
    expect(random).not.toHaveBeenCalled();
  });

  it('removes the player hood before the opponent hood, keeps tied wrists still, and sends both hoods out with the guard', () => {
    const cinematic = (stage: import('../cinematics').CinematicStage, startedAt = 1000) => ({ stage, startedAt, mode: 'arrival' as const });
    const state = { roomNumber: 1 as const, phase: 'OPENING', tiesCut: { player: false, ai: false } };
    monitors.update({ ...state, cinematic: cinematic('hooded') }, 0, 1000);
    expect(monitors.screens[0].userData).toMatchObject({ playerHoodProgress: 0, opponentHoodProgress: 0, playerTied: true, opponentTied: true });
    monitors.update({ ...state, cinematic: cinematic('player-unhood') }, 1, 1425);
    expect(monitors.screens[0].userData).toMatchObject({ playerHoodProgress: .5, opponentHoodProgress: 0, guardVisible: true });
    monitors.update({ ...state, cinematic: cinematic('player-focus') }, 2, 2000);
    expect(monitors.screens[0].userData).toMatchObject({ playerHoodProgress: 1, opponentHoodProgress: 0, guardVisible: true });
    monitors.update({ ...state, cinematic: cinematic('opponent-unhood') }, 3, 1000+stageDurationMs('opponent-unhood')*.4);
    expect(monitors.screens[0].userData.opponentHoodProgress).toBe(0);
    monitors.update({ ...state, cinematic: cinematic('opponent-unhood') }, 3.5, 1000+stageDurationMs('opponent-unhood')*.8);
    expect(monitors.screens[0].userData).toMatchObject({ playerHoodProgress: 1, guardVisible: true });
    expect(monitors.screens[0].userData.opponentHoodProgress).toBeGreaterThan(.5);
    expect(monitors.screens[0].userData.opponentHoodProgress).toBeLessThan(.6);
    monitors.update({ ...state, cinematic: cinematic('guard-exit') }, 4, 2000);
    expect(monitors.screens[0].userData).toMatchObject({ playerHoodProgress: 1, opponentHoodProgress: 1, guardVisible: true });
    monitors.update({ ...state, cinematic: cinematic('rules') }, 5, 2000);
    expect(monitors.screens[0].userData.guardVisible).toBe(false);
    monitors.update({ ...state, cinematic: cinematic('cut-opponent') }, 6, 2000);
    expect(monitors.screens[0].userData.hostAction).toBe('cut-ties');
    monitors.update({ ...state, tiesCut: { player: false, ai: true }, cinematic: cinematic('cut-player') }, 7, 2000);
    expect(monitors.screens[0].userData).toMatchObject({ playerTied: true, opponentTied: false, hostAction: 'cut-ties' });
    monitors.update({ ...state, tiesCut: { player: true, ai: true }, cinematic: cinematic('complete') }, 8, 2000);
    expect(monitors.screens[0].userData).toMatchObject({ playerTied: false, opponentTied: false, guardVisible: false });
  });

  it('keeps room-three activity on the real ceiling map rather than painting generated actors over it', () => {
    const ceiling = new THREE.Texture(); monitors.setCeilingTexture(ceiling);
    monitors.update({ roomNumber: 3 }, 45);
    expect(monitors.group.userData.mode).toBe('ceiling');
    for (const screen of monitors.screens) {
      expect(screen.material.map).toBe(ceiling);
      expect(screen.userData.status).toBe('ceiling');
    }
    ceiling.dispose();
  });
});
