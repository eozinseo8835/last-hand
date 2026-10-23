// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CONFIG, type Card, type Round } from '../game';
import { createActors, type ActorState } from './actors';

const TABLE_Y = .8865;
const card = (rank: string, suit: Card['suit']): Card => ({ rank, suit, id: `${suit}-${rank}` });
const opening = (): Round => ({
  player: [card('A', 'spades'), card('6', 'hearts')],
  ai: [card('9', 'clubs'), card('7', 'diamonds')],
  deck: [],
});
const empty = (): Round => ({ player: [], ai: [], deck: [] });

type Cast = ReturnType<typeof createActors>;
type Slot = Cast['cardSlots'][number];
let scene: THREE.Scene, camera: THREE.PerspectiveCamera, actors: Cast;
let state: ActorState, now: number;

function tick(seconds: number, patch: Partial<ActorState> = {}) {
  state = { ...state, ...patch }; now += seconds;
  actors.update(now, seconds, state); scene.updateMatrixWorld(true);
}
function advance(seconds: number, patch: Partial<ActorState> = {}) {
  const count = Math.ceil(seconds / .01);
  for (let i = 0; i < count; i++) tick(seconds / count, patch);
}
function position(slot: Slot) { return slot.front.getWorldPosition(new THREE.Vector3()); }
function faceNormal(slot: Slot) { return new THREE.Vector3(0, 0, 1).transformDirection(slot.front.matrixWorld); }
function activePlayerCards() { return actors.cardSlots.filter(slot => slot.owner === 'player' && slot.active && slot.group.visible); }
function assertNoPlayerFacesOnFelt() {
  for (const slot of activePlayerCards()) {
    const onFelt = Math.abs(position(slot).y - TABLE_Y) < .05;
    expect(onFelt && faceNormal(slot).y > .7, `${slot.group.name} exposes its face on the table`).toBe(false);
  }
}
function settleOpening() {
  const round = opening(); actors.setCards(round, false);
  advance(CONFIG.DEAL_SPEED / 1000 + .25, { phase: 'PLAYER_DECISION' });
  return round;
}

beforeEach(() => {
  // Textures remain procedural CanvasTextures; only the unavailable jsdom rasterizer is stubbed.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    fillRect() {}, strokeRect() {}, fillText() {}, save() {}, restore() {}, translate() {}, rotate() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  } as unknown as CanvasRenderingContext2D));
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(58, 16 / 9, .055, 28);
  camera.position.set(0, 1.85, 2.65); camera.rotation.x = -.173; scene.add(camera);
  actors = createActors(scene, camera); now = 0;
  state = { phase: 'SHUFFLING', suspense: false, dead: null, shotEffect: null, roundNumber: 1, revealed: false };
  actors.setCards(empty(), false); tick(0);
});

afterEach(() => {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>(), geometries = new Set<THREE.BufferGeometry>();
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  textures.forEach(texture => texture.dispose()); materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
  vi.restoreAllMocks();
});

describe('physical blackjack cards and dealer scene', () => {
  it('adds only a slight syllable-envelope head bob and returns exactly to the idle pose', () => {
    settleOpening();
    const time = now;
    actors.update(time, 0, { ...state, voiceLevel: 0 });
    const idlePosition = actors.head.position.clone(), idleRotation = actors.head.rotation.clone();
    actors.update(time, 0, { ...state, voiceLevel: 1 });
    expect(actors.head.position.y - idlePosition.y).toBeCloseTo(.0025);
    expect(actors.head.rotation.x - idleRotation.x).toBeCloseTo(.010);
    expect(actors.head.rotation.y).toBe(idleRotation.y);
    expect(actors.head.rotation.z).toBe(idleRotation.z);
    actors.update(time, 0, { ...state, voiceLevel: .5 });
    expect(actors.head.position.y - idlePosition.y).toBeCloseTo(.00125);
    actors.update(time, 0, { ...state, voiceLevel: 0 });
    expect(actors.head.position.equals(idlePosition)).toBe(true);
    expect(actors.head.rotation.equals(idleRotation)).toBe(true);
  });

  it('reduces the voice bob for reduced motion and suppresses it on the dead Stranger', () => {
    settleOpening();
    const time = now;
    actors.update(time, 0, { ...state, voiceLevel: 0 });
    const idleY = actors.head.position.y, idleX = actors.head.rotation.x;
    actors.update(time, 0, { ...state, voiceLevel: 1, reducedMotion: true });
    expect(actors.head.position.y - idleY).toBeCloseTo(.0025 * .25);
    expect(actors.head.rotation.x - idleX).toBeCloseTo(.010 * .25);
    actors.update(time, 0, { ...state, voiceLevel: 1, dead: 'ai' });
    expect(actors.head.position.y).toBe(idleY);
    expect(actors.head.rotation.x).toBe(idleX);
  });

  it('keeps every player face off the felt during the opening deliveries, pickup, and later hits', () => {
    const live = empty(), round = opening();
    const deliveries: Array<['player' | 'ai', Card]> = [
      ['player', round.player[0]], ['ai', round.ai[0]], ['player', round.player[1]], ['ai', round.ai[1]],
      ['player', card('4', 'clubs')], ['player', card('2', 'diamonds')],
    ];
    for (const [owner, next] of deliveries) {
      live[owner] = [...live[owner], next]; actors.setCards({ ...live }, false);
      for (let step = 0; step < 66; step++) {
        tick(.01, { phase: live.player.length > 2 ? 'HITTING' : 'DEALING' });
        assertNoPlayerFacesOnFelt();
      }
    }
    advance(.25, { phase: 'PLAYER_DECISION' });
    expect(activePlayerCards()).toHaveLength(4);
    expect(activePlayerCards().every(slot => slot.group.parent === actors.heldRig)).toBe(true);
  });

  it('holds a separated readable fan in the camera rig, with only backs facing the Stranger', () => {
    settleOpening();
    expect(actors.heldRig.parent).toBe(camera);
    const slots = activePlayerCards(); expect(slots).toHaveLength(2);
    expect(slots[0].group.position.x).toBeLessThan(slots[1].group.position.x);
    const eye = camera.getWorldPosition(new THREE.Vector3()), stranger = actors.head.getWorldPosition(new THREE.Vector3());
    for (const slot of slots) {
      expect(slot.group.parent).toBe(actors.heldRig);
      expect(slot.group.scale.x).toBeCloseTo(.54, 2);
      const normal = faceNormal(slot), center = position(slot);
      expect(normal.dot(eye.clone().sub(center).normalize())).toBeGreaterThan(.95);
      expect(normal.dot(stranger.clone().sub(center).normalize())).toBeLessThan(0);
    }
    camera.rotation.set(-.173 - .4, .8, 0); tick(.016);
    expect(slots.every(slot => slot.group.parent === actors.heldRig)).toBe(true);
    for (const slot of slots) expect(faceNormal(slot).dot(camera.getWorldPosition(new THREE.Vector3()).sub(position(slot)).normalize())).toBeGreaterThan(.95);
  });

  it('keeps a large legal fan clear of the bottom action area', () => {
    const cards = [card('A','spades'),card('A','hearts'),card('A','diamonds'),card('A','clubs'),
      card('2','spades'),card('2','hearts'),card('2','diamonds'),card('2','clubs'),
      card('3','spades'),card('3','hearts'),card('3','diamonds')];
    for (const count of [2, 4, 11]) {
      actors.setCards({ player: cards.slice(0, count), ai: opening().ai, deck: [] }, false);
      advance(1.1, { phase: 'PLAYER_DECISION' });
      camera.updateProjectionMatrix(); scene.updateMatrixWorld(true);
      for (const slot of activePlayerCards()) for (const x of [-.235,.235]) for (const y of [-.33,.33]) {
        const corner = slot.front.localToWorld(new THREE.Vector3(x,y,0)).project(camera);
        // Action buttons begin at scene y=714/810; leave their rectangle clear.
        expect(corner.y).toBeGreaterThan(1 - 2 * 710 / 810);
        expect(Math.abs(corner.x)).toBeLessThan(1);
      }
    }
  });

  it('lays the held cards face-up on the actual table before the 950ms showdown result, even after a sparse frame', () => {
    const round = settleOpening(); actors.setCards(round, true);
    // This one large elapsed-time step catches animations accidentally tied only to capped frame dt.
    tick(.90, { phase: 'REVEAL', revealed: true });
    const slots = activePlayerCards(); expect(slots).toHaveLength(2);
    for (const slot of slots) {
      expect(slot.group.parent).toBe(scene);
      expect(position(slot).y).toBeGreaterThan(TABLE_Y);
      expect(position(slot).y).toBeLessThan(TABLE_Y + .025);
      expect(faceNormal(slot).y).toBeGreaterThan(.99);
      expect(slot.group.scale.x).toBeCloseTo(1);
    }
  });

  it('finishes pickup and the hole-card flip by their deadlines even when frames are sparse', () => {
    const round = opening();
    actors.setCards(round, false);
    tick(CONFIG.DEAL_SPEED / 1000, { phase: 'PLAYER_DECISION' });
    for (const slot of activePlayerCards()) {
      expect(slot.group.parent).toBe(actors.heldRig);
      expect(slot.group.scale.x).toBeCloseTo(.54);
      expect(slot.group.position.z).toBeLessThan(-1);
    }
    actors.setCards(round, true);
    tick(.90, { phase: 'REVEAL', revealed: true });
    const hole = actors.cardSlots.find(slot => slot.owner === 'ai' && slot.index === 1)!;
    expect(faceNormal(hole).y).toBeGreaterThan(.99);
    expect(position(hole).y).toBeLessThan(TABLE_Y + .025);
  });

  it('never assigns the hole-card face texture while peeking and reveals it only at showdown', () => {
    const round = settleOpening();
    const hole = actors.cardSlots.find(slot => slot.owner === 'ai' && slot.index === 1)!;
    const material = hole.front.material as THREE.MeshStandardMaterial;
    expect(material.map).toBeNull();
    for (let i = 0; i < 60; i++) {
      tick(.01, { phase: 'PEEKING' }); expect(material.map).toBeNull();
    }
    actors.setCards(round, true); advance(.90, { phase: 'REVEAL', revealed: true });
    expect(material.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(faceNormal(hole).y).toBeGreaterThan(.99);
  });

  it('sweeps all cards off the scene and starts the next round without retaining old held cards', () => {
    settleOpening();
    tick(.01, { phase: 'SWEEPING' }); advance(.62);
    expect(actors.cardSlots.filter(slot => slot.group.visible)).toHaveLength(0);
    actors.setCards(empty(), false); tick(.01, { phase: 'SHUFFLING', roundNumber: 2 });
    expect(actors.cardSlots.filter(slot => slot.group.visible)).toHaveLength(0);
    const next = { player: [card('K', 'diamonds')], ai: [], deck: [] };
    actors.setCards(next, false); advance(CONFIG.DEAL_SPEED / 1000 + .2, { phase: 'DEALING' });
    expect(activePlayerCards()).toHaveLength(1);
    expect(activePlayerCards()[0].group.parent).toBe(actors.heldRig);
    expect(activePlayerCards()[0].front.userData.identity).toBe('diamonds-K');
    assertNoPlayerFacesOnFelt();
  });

  it('resets a fatal first-hand replay to an upright Stranger, resting revolver, empty hands, and hidden hole texture', () => {
    const round = settleOpening(); actors.setCards(round, true);
    advance(1.5, { phase: 'AI_SHOOTING', suspense: true, revealed: true });
    advance(1.5, { phase: 'GAME_OVER', suspense: false, dead: 'ai', shotEffect: 'shot' });
    expect(actors.stranger.rotation.x).toBeGreaterThan(1.2);
    actors.setCards(empty(), false);
    tick(.016, { phase: 'SHUFFLING', roundNumber: 1, revealed: false, suspense: false, dead: null, shotEffect: null });
    expect(actors.stranger.rotation.x).toBe(0);
    expect(actors.gun.position.toArray()).toEqual([.12, .962, .02]);
    expect(actors.cardSlots.filter(slot => slot.group.visible)).toHaveLength(0);
    const hole = actors.cardSlots.find(slot => slot.owner === 'ai' && slot.index === 1)!;
    expect((hole.front.material as THREE.MeshStandardMaterial).map).toBeNull();
  });
});
