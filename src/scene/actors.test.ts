// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CONFIG, type Card, type Round } from '../game';
import { createActors, type ActorState } from './actors';
import { GUN_REST, CARD_WIDTH, CARD_HEIGHT } from '../tableLayout';

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

  it('plays tells only during decisions and gives calm tells steady hands and a facing head', () => {
    settleOpening();
    const time = now;
    actors.update(time, 0, { ...state, tell: null });
    const baseYaw = actors.head.rotation.y;
    actors.update(time, 0, { ...state, tell: { kind: 'avert', disposition: 'nervous' } });
    expect(actors.head.rotation.y - baseYaw).toBeGreaterThan(.1);
    actors.update(time, 0, { ...state, phase: 'REVEAL', tell: { kind: 'avert', disposition: 'nervous' } });
    const revealYaw = actors.head.rotation.y;
    actors.update(time, 0, { ...state, phase: 'REVEAL', tell: null });
    expect(actors.head.rotation.y).toBe(revealYaw);
    const fingers = actors.leftHand.children.filter(child => child instanceof THREE.Group && typeof child.userData.fingerIndex === 'number' && child.userData.fingerIndex < 4);
    for (const sample of [.3, .7, 1.1]) {
      actors.update(sample, 0, { ...state, tell: { kind: 'still', disposition: 'calm' } });
      expect(actors.head.rotation.y).toBe(0); expect(actors.head.rotation.z).toBe(0);
      for (const finger of fingers) expect(finger.rotation.x).toBeCloseTo(-.07);
    }
    actors.update(.15, 0, { ...state, tell: { kind: 'tap', disposition: 'nervous' } });
    expect(fingers.some(finger => finger.rotation.x < -.25)).toBe(true);
  });

  it('raises and cocks progressively, advances the visible cylinder, and eases down after release', () => {
    settleOpening();
    advance(.7, { phase: 'PLAYER_SHOOTING', triggerHeld: true, triggerProgress: .2, chambersFired: 2 });
    const low = actors.gun.getWorldPosition(new THREE.Vector3()).y, lowHammer = actors.hammer.rotation.z;
    advance(.5, { triggerProgress: .85 });
    expect(actors.gun.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(low + .2);
    expect(actors.hammer.rotation.z).toBeLessThan(lowHammer - .3);
    expect(actors.cylinder.rotation.x).toBeGreaterThan(.8);
    advance(.8, { triggerHeld: false, triggerProgress: 0 });
    expect(actors.gun.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(.962, 2);
    expect(actors.hammer.rotation.z).toBeCloseTo(-.6, 2);
    expect(actors.cylinder.rotation.x).toBeCloseTo(0, 2);
  });

  it('aims the raised player barrel directly at the eye through the center of every desktop view', () => {
    settleOpening();
    advance(2, { phase: 'PLAYER_SHOOTING', triggerHeld: true, triggerProgress: 1, chambersFired: 3 });
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
      camera.aspect = width / height; camera.updateProjectionMatrix();
      scene.updateMatrixWorld(true);
      const muzzle = actors.gun.localToWorld(new THREE.Vector3(.315, .09, 0));
      const screen = muzzle.clone().project(camera);
      const barrelDirection = new THREE.Vector3(1, 0, 0).transformDirection(actors.gun.matrixWorld);
      const towardEye = camera.getWorldPosition(new THREE.Vector3()).sub(muzzle).normalize();
      expect(Math.abs(screen.x), `${width} muzzle x`).toBeLessThan(.02);
      expect(Math.abs(screen.y), `${height} muzzle y`).toBeLessThan(.02);
      expect(barrelDirection.dot(towardEye)).toBeGreaterThan(.9999);
      expect(screen.z).toBeGreaterThan(-1); expect(screen.z).toBeLessThan(1);
    }
  });

  it('uses the actual camera pose for centered aim while leaving the opponent shooting pose intact', () => {
    settleOpening();
    camera.position.set(.04, 1.88, 2.67); camera.rotation.set(-.12, .08, .01);
    advance(2, { phase: 'PLAYER_SHOOTING', triggerHeld: true, triggerProgress: 1 });
    const muzzle = actors.gun.localToWorld(new THREE.Vector3(.315, .09, 0));
    const screen = muzzle.clone().project(camera);
    expect(Math.abs(screen.x)).toBeLessThan(.002); expect(Math.abs(screen.y)).toBeLessThan(.002);
    advance(2, { phase: 'AI_SHOOTING', triggerHeld: false, triggerProgress: 0 });
    const muzzleAtTemple = actors.gun.localToWorld(new THREE.Vector3(.315,.09,0));
    expect(muzzleAtTemple.distanceTo(new THREE.Vector3(...actors.gun.userData.temple))).toBeLessThan(.025);
    expect(actors.gun.parent).toBe(actors.rightHand);
  });

  it('finishes centering before the continuous hold fires, rather than only at completed progress', () => {
    settleOpening();
    const holdSeconds = CONFIG.TRIGGER_HOLD_MS / 1000;
    const frames = Math.floor(holdSeconds * .95 / .01);
    for (let frame = 1; frame <= frames; frame++) {
      tick(.01, { phase: 'PLAYER_SHOOTING', triggerHeld: true,
        triggerProgress: frame * .01 / holdSeconds, chambersFired: 3 });
    }
    expect(state.triggerProgress).toBeLessThan(1); expect(state.triggerProgress).toBeGreaterThan(.94);
    const muzzle = actors.gun.localToWorld(new THREE.Vector3(.315, .09, 0));
    const screen = muzzle.clone().project(camera);
    const barrelDirection = new THREE.Vector3(1, 0, 0).transformDirection(actors.gun.matrixWorld);
    const towardEye = camera.getWorldPosition(new THREE.Vector3()).sub(muzzle).normalize();
    expect(Math.abs(screen.x)).toBeLessThan(.02); expect(Math.abs(screen.y)).toBeLessThan(.02);
    expect(barrelDirection.dot(towardEye)).toBeGreaterThan(.9999);
  });

  it('keeps the three-second hold centered before firing even with only seven rendered frames', () => {
    settleOpening();
    let elapsed = 0;
    for (const frameTime of [.4, .4, .4, .4, .4, .4, .3]) {
      elapsed += frameTime;
      tick(frameTime, { phase: 'PLAYER_SHOOTING', triggerHeld: true,
        triggerProgress: elapsed / 3, chambersFired: 3 });
    }
    expect(state.triggerProgress).toBeCloseTo(.9);
    const muzzle = actors.gun.localToWorld(new THREE.Vector3(.315, .09, 0));
    const screen = muzzle.clone().project(camera);
    const barrelDirection = new THREE.Vector3(1, 0, 0).transformDirection(actors.gun.matrixWorld);
    const towardEye = camera.getWorldPosition(new THREE.Vector3()).sub(muzzle).normalize();
    expect(Math.abs(screen.x)).toBeLessThan(.02); expect(Math.abs(screen.y)).toBeLessThan(.02);
    expect(barrelDirection.dot(towardEye)).toBeGreaterThan(.9999);
  });

  it('keeps the right palm and curled fingers attached to the raised revolver grip at sparse frame rates', () => {
    settleOpening();
    const hand = actors.playerHands.getObjectByName('Player right gripping hand')!;
    expect(hand).toBeDefined();
    let elapsed = 0;
    for (const frameTime of [.4, .4, .4, .4, .4, .4, .3]) {
      elapsed += frameTime;
      tick(frameTime, { phase: 'PLAYER_SHOOTING', triggerHeld: true,
        triggerProgress: elapsed / 3, chambersFired: 3 });
      const grip = actors.gun.localToWorld(new THREE.Vector3(-.14, -.13, 0));
      const palm = hand.localToWorld(new THREE.Vector3(0, 0, .055));
      expect(palm.distanceTo(grip)).toBeLessThan(.09);
    }
    const fingers = hand.children.filter(child => child instanceof THREE.Group && typeof child.userData.fingerIndex === 'number' && child.userData.fingerIndex < 4);
    expect(fingers).toHaveLength(4);
    expect(fingers.every(finger => finger.rotation.x <= -.5)).toBe(true);
    const muzzle = actors.gun.localToWorld(new THREE.Vector3(.315, .09, 0)).project(camera);
    expect(Math.abs(muzzle.x)).toBeLessThan(.02); expect(Math.abs(muzzle.y)).toBeLessThan(.02);
    advance(.8, { triggerHeld: false, triggerProgress: 0 });
    expect(fingers.every(finger => finger.rotation.x === 0)).toBe(true);
  });

  it('restores the original hand poses through release, SPIN, another hold, and replay', () => {
    settleOpening();
    const hand = actors.playerHands.getObjectByName('Player right gripping hand')!;
    const idle = hand.quaternion.clone(), idlePosition = hand.position.clone();
    const fingers = hand.children.filter(child => child instanceof THREE.Group && typeof child.userData.fingerIndex === 'number' && child.userData.fingerIndex < 4);
    const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.8, Math.PI + .17, .6));
    advance(.5, { phase: 'PLAYER_SHOOTING', triggerHeld: true, triggerProgress: .9 });
    advance(1.8, { triggerHeld: false, triggerProgress: 0 });
    expect(hand.quaternion.angleTo(idle)).toBeLessThan(.001);
    expect(hand.rotation.y).toBe(Math.PI + .17);
    expect(hand.position.distanceTo(idlePosition)).toBeLessThan(.001);
    expect(fingers.every(finger => finger.rotation.x === 0)).toBe(true);

    advance(1.2, { spinning: 'player', spinSerial: 1 });
    expect(hand.quaternion.angleTo(spin)).toBeLessThan(.001);
    expect(fingers.every(finger => finger.rotation.x === 0)).toBe(true);
    advance(1.8, { spinning: null });
    expect(hand.quaternion.angleTo(idle)).toBeLessThan(.001);
    expect(hand.rotation.y).toBe(Math.PI + .17);

    tick(.4, { triggerHeld: true, triggerProgress: .9 });
    const grip = actors.gun.localToWorld(new THREE.Vector3(-.14, -.13, 0));
    expect(hand.localToWorld(new THREE.Vector3(0, 0, .055)).distanceTo(grip)).toBeLessThan(.09);
    actors.setCards(empty(), false);
    advance(.8, { phase: 'SHUFFLING', roundNumber: 1, dead: null, shotEffect: null,
      triggerHeld: false, triggerProgress: 0, spinning: null, spinSerial: 0 });
    expect(hand.quaternion.angleTo(idle)).toBeLessThan(.001);
    expect(hand.rotation.y).toBe(Math.PI + .17);
    expect(hand.position.distanceTo(idlePosition)).toBeLessThan(.001);
    expect(fingers.every(finger => finger.rotation.x === 0)).toBe(true);
  });

  it('spins the actual cylinder and finishes without an unwanted reverse spin', () => {
    settleOpening();
    tick(.01, { phase: 'PLAYER_SHOOTING', spinning: 'player', spinSerial: 1, triggerProgress: 0 });
    advance(.4); expect(actors.cylinder.rotation.x).toBeGreaterThan(Math.PI * 4);
    advance(.4); expect(actors.cylinder.rotation.x).toBeCloseTo(Math.PI * 6);
    tick(.01, { spinning: null }); expect(actors.cylinder.rotation.x).toBe(0);
    advance(.3); expect(actors.cylinder.rotation.x).toBe(0);
  });

  it('exposes only a hinged corner attached to the deck and clears its face on completion', () => {
    settleOpening(); const next = card('Q','hearts');
    tick(.01,{phase:'PLAYER_PEEKING',peekActor:'player',peekSerial:1,peekedCard:next}); advance(.4);
    expect(actors.deckCorner.visible).toBe(true);
    expect(actors.deckCorner.userData.attachedToDeck).toBe(true);
    expect(actors.peekFront.parent).toBe(actors.deckCorner);
    expect(actors.peekFront.geometry.attributes.position.count).toBe(3);
    expect(actors.deckCorner.parent).toBe(scene); // No card face in the camera rig.
    const bounds = new THREE.Box3().setFromObject(actors.deckCorner);
    expect(bounds.max.y-bounds.min.y).toBeLessThan(.19);
    expect(actors.rightPlayerArm.pose.root.distanceTo(actors.rightPlayerArm.pose.joint)).toBeCloseTo(.42);
    tick(.01,{phase:'PLAYER_DECISION',peekActor:null});
    expect(actors.deckCorner.visible).toBe(false);
    expect((actors.peekFront.material as THREE.MeshStandardMaterial).map).toBeNull();
  });

  it('bases fear and hand tremble on fired chambers, reduces it for motion preferences, and amplifies it while pulling', () => {
    const round = settleOpening(); const time = now;
    actors.update(time, 0, { ...state, chambersFired: 0 }); const calm = actors.heldRig.position.length();
    actors.update(time, 0, { ...state, chambersFired: 5 }); const scared = actors.heldRig.position.length(), fearPitch = actors.head.rotation.x;
    expect(scared).toBeGreaterThan(calm * 5);
    actors.setCards({ ...round, ai: [card('2', 'clubs'), card('3', 'diamonds')] }, false);
    actors.update(time, 0, { ...state, chambersFired: 5 });
    expect(actors.heldRig.position.length()).toBe(scared); expect(actors.head.rotation.x).toBe(fearPitch);
    actors.update(time, 0, { ...state, chambersFired: 5, reducedMotion: true });
    expect(actors.heldRig.position.length()).toBeCloseTo(scared * .25);
    actors.update(time, 0, { ...state, phase: 'PLAYER_SHOOTING', chambersFired: 5, triggerProgress: 1, triggerHeld: true });
    expect(actors.heldRig.position.length()).toBeGreaterThan(scared * 1.5);
  });

  it('dims the self-lit held faces during blackout and flinches on the same door pulse only during decisions', () => {
    settleOpening();
    const material = activePlayerCards()[0].front.material as THREE.MeshStandardMaterial;
    const event = { kind: 'blackout' as const, startedAt: Date.now(), duration: 4000, seed: 1 };
    tick(.01, { event }); expect(material.emissiveIntensity).toBeCloseTo(.70 * .055);
    tick(.01, { phase: 'HITTING' }); expect(material.emissiveIntensity).toBe(.70);
    const time = now;
    actors.update(time, 0, { ...state, phase: 'PLAYER_DECISION', event: null }); const quietPitch = actors.head.rotation.x;
    const door = { ...event, kind: 'door' as const, startedAt: Date.now() - 120 };
    actors.update(time, 0, { ...state, phase: 'PLAYER_DECISION', event: door });
    expect(actors.head.rotation.x).toBeLessThan(quietPitch - .07);
    expect(actors.stranger.position.z).toBeLessThan(-1.37);
    actors.update(time, 0, { ...state, phase: 'HITTING', event: door });
    expect(actors.head.rotation.x).toBe(quietPitch); expect(actors.stranger.position.z).toBe(-1.35);
  });

  it('has exactly one Host, one captive and the player, with a separate human face for each room', () => {
    settleOpening();
    const roles: string[] = []; scene.traverse(object => { if (object.userData.actorRole && object.visible) roles.push(object.userData.actorRole); });
    expect(roles.sort()).toEqual(['captive', 'host', 'player']);
    expect(actors.stranger).toBe(actors.captive); expect(actors.head).toBe(actors.captiveHead);
    expect(actors.host.position.x).toBeLessThan(-1.8); expect(actors.captive.position.x).toBe(0);
    expect(actors.deck.userData.owner).toBe('host');
    const faces: string[] = [];
    for (const room of [1, 2, 3] as const) {
      tick(.01, { roomNumber: room });
      const visibleFaces = actors.captiveHead.children.filter(child => child.visible);
      expect(visibleFaces).toHaveLength(1); faces.push(visibleFaces[0].name);
      let maskOnCaptive = false;
      visibleFaces[0].traverse(object => {
        if (object instanceof THREE.Mesh && (object.material as THREE.MeshStandardMaterial).color?.getHex() === 0xd1ccb2) maskOnCaptive = true;
      });
      expect(maskOnCaptive).toBe(false);
    }
    expect(new Set(faces).size).toBe(3);
    let hostMask = false;
    actors.hostHead.traverse(object => {
      if (object instanceof THREE.Mesh && (object.material as THREE.MeshStandardMaterial).color?.getHex() === 0xd1ccb2) hostMask = true;
    });
    expect(hostMask).toBe(true);
  });

  it('keeps the Host upright and away from the shooting hand while the captive shoots and dies', () => {
    settleOpening();
    advance(.8, { phase: 'AI_SHOOTING', suspense: true });
    expect(actors.rightHand.getWorldPosition(new THREE.Vector3()).distanceTo(actors.gun.getWorldPosition(new THREE.Vector3()))).toBeLessThan(.3);
    expect(actors.hostRightHand.getWorldPosition(new THREE.Vector3()).distanceTo(actors.gun.getWorldPosition(new THREE.Vector3()))).toBeGreaterThan(1);
    advance(1.2, { phase: 'GAME_OVER', dead: 'ai', suspense: false, shotEffect: 'shot' });
    expect(actors.captive.rotation.x).toBeGreaterThan(1.2);
    expect(actors.host.rotation.x).toBe(0); expect(actors.host.rotation.z).toBe(0);
    expect(actors.host.position.y).toBe(.86);
    expect(actors.host.userData.canShoot).toBe(true); expect(actors.host.userData.canDie).toBe(false);
  });

  it('bobs only the active speaker even when both voice buses report levels', () => {
    settleOpening(); const time = now;
    actors.update(time, 0, { ...state, speaker: null, hostVoiceLevel: 1, captiveVoiceLevel: 1 });
    const hostBase = actors.hostHead.position.y, captiveBase = actors.head.position.y;
    actors.update(time, 0, { ...state, speaker: 'host', hostVoiceLevel: 1, captiveVoiceLevel: 1 });
    expect(actors.hostHead.position.y - hostBase).toBeCloseTo(.0025);
    expect(actors.head.position.y).toBe(captiveBase);
    actors.update(time, 0, { ...state, speaker: 'captive', hostVoiceLevel: 1, captiveVoiceLevel: .5 });
    expect(actors.hostHead.position.y).toBe(hostBase);
    expect(actors.head.position.y - captiveBase).toBeCloseTo(.00125);
  });

  it('slides deliveries from the Host deck and moves Host hands rather than the captive hands', () => {
    settleOpening();
    const captiveRest = actors.rightHand.position.clone(), hostRest = actors.hostRightHand.position.clone();
    actors.setCards({ player: [card('5', 'clubs')], ai: [], deck: [] }, false);
    tick(0, { phase: 'DEALING' });
    const first = activePlayerCards()[0];
    // Reusing the existing slot may preserve its fan position; use a fresh second slot delivery.
    actors.setCards(empty(), false);
    actors.setCards({ player: [card('5', 'clubs')], ai: [], deck: [] }, false);
    tick(0, { phase: 'DEALING' });
    expect(first.group.position.x).toBeCloseTo(actors.deck.position.x);
    expect(first.group.position.z).toBeCloseTo(actors.deck.position.z);
    advance(.25);
    expect(actors.hostRightHand.position.distanceTo(hostRest)).toBeGreaterThan(.04);
    expect(actors.rightHand.position.distanceTo(captiveRest)).toBeLessThan(.02);
  });

  it('uses personality breakdown thresholds without making the Host nervous', () => {
    settleOpening(); const time = now;
    actors.update(time, 0, { ...state, roomNumber: 1, chambersFired: 2 }); const nervousPitch = actors.head.rotation.x;
    actors.update(time, 0, { ...state, roomNumber: 2, chambersFired: 2 }); const gamblerPitch = actors.head.rotation.x;
    actors.update(time, 0, { ...state, roomNumber: 3, chambersFired: 2 }); const survivorPitch = actors.head.rotation.x;
    expect(nervousPitch).not.toBe(gamblerPitch); expect(gamblerPitch).toBe(survivorPitch);
    const hostRotation = actors.hostHead.rotation.clone();
    actors.update(time, 0, { ...state, roomNumber: 2, chambersFired: 3 });
    expect(actors.head.rotation.x).not.toBe(gamblerPitch);
    expect(actors.hostHead.rotation.equals(hostRotation)).toBe(true);
  });

  it('lifts the captive hood during opening and keeps defeated bodies unhooded during departure', () => {
    settleOpening();
    const phase = 'OPENING' as ActorState['phase'];
    tick(.01, { phase, storyStage: 'hooded' }); expect(actors.captiveHood.visible).toBe(true);
    const coveredY = actors.captiveHood.position.y;
    tick(.01, { storyStage: 'unhood' }); advance(.4);
    expect(actors.captiveHood.visible).toBe(true); expect(actors.captiveHood.position.y).toBeGreaterThan(coveredY + .3);
    advance(.41); expect(actors.captiveHood.visible).toBe(false);
    tick(.01, { phase: 'TRANSITION' as ActorState['phase'], storyStage: 'departure', dead: 'ai' }); advance(1.3);
    expect(actors.captiveHood.visible).toBe(false); expect(actors.captive.rotation.x).toBeGreaterThan(1.2);
    expect(actors.host.rotation.x).toBe(0);
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
      expect(slot.group.scale.x).toBeCloseTo(.80, 2);
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
      for (const slot of activePlayerCards()) for (const x of [-CARD_WIDTH / 2,CARD_WIDTH / 2]) for (const y of [-CARD_HEIGHT / 2,CARD_HEIGHT / 2]) {
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
      expect(slot.group.scale.x).toBeCloseTo(.80);
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
    expect(actors.gun.position.toArray()).toEqual([...GUN_REST]);
    expect(actors.cardSlots.filter(slot => slot.group.visible)).toHaveLength(0);
    const hole = actors.cardSlots.find(slot => slot.owner === 'ai' && slot.index === 1)!;
    expect((hole.front.material as THREE.MeshStandardMaterial).map).toBeNull();
  });
});

describe('Big Update 2 physical cast', () => {
  it('keeps authored limb lengths in every reach, hold, guard and seated pose', () => {
    settleOpening();
    for (const phase of ['DEALING','PLAYER_DECISION','REVEAL','AI_SHOOTING','PLAYER_SHOOTING','OPENING','TRANSITION'] as const) {
      advance(.2, { phase, triggerProgress: .8, cinematic: phase === 'OPENING' ? { stage: 'opponent-unhood', startedAt: Date.now() - 1000, mode: 'full' } : null });
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !object.userData.anatomyBone) return;
        const length = object.userData.restLength;
        const bottom = object.localToWorld(new THREE.Vector3(0, -length / 2, 0));
        const top = object.localToWorld(new THREE.Vector3(0, length / 2, 0));
        expect(bottom.distanceTo(top), object.name).toBeCloseTo(length, 6);
        expect(object.scale.toArray()).toEqual([1,1,1]);
      });
    }
    expect(actors.captiveLegs.feet.every(foot => foot.getWorldPosition(new THREE.Vector3()).y < .15)).toBe(true);
    expect(actors.chair.visible).toBe(true);
  });
  it('parents the captive gun to its palm, touches the temple, and releases after a click', () => {
    settleOpening(); advance(2, { phase: 'AI_SHOOTING' });
    expect(actors.gun.parent).toBe(actors.rightHand);
    const muzzle = actors.gun.localToWorld(new THREE.Vector3(.315,.09,0));
    expect(muzzle.distanceTo(new THREE.Vector3(...actors.gun.userData.temple))).toBeLessThan(.025);
    advance(1.1, { phase: 'ROUND_RESULT', shotEffect: 'click' });
    expect(actors.gun.parent).toBe(scene);
    expect(actors.gun.position.distanceTo(new THREE.Vector3(...GUN_REST))).toBeLessThan(.01);
  });
  it('uses distinct rank/suit textures, flat upright captive cards and a separate gun zone', () => {
    settleOpening(); actors.setCards(opening(), true); advance(1, { phase: 'REVEAL', revealed: true });
    for (const slot of actors.cardSlots.filter(slot => slot.active)) {
      const texture = (slot.front.material as THREE.MeshStandardMaterial).map!;
      const expected = opening()[slot.owner][slot.index];
      expect(texture.userData.rank).toBe(expected.rank); expect(texture.userData.suit).toBe(expected.suit);
      expect(slot.group.position.x).toBeLessThan(1.1); expect(faceNormal(slot).y).toBeGreaterThan(.99);
    }
  });
});

describe('physical Host enforcement and attention', () => {
  it('keeps the Host gun in its wrapped palm with fixed bones and returns it after an empty forced shot', () => {
    settleOpening(); const epoch=50000; vi.spyOn(Date,'now').mockReturnValue(epoch);
    tick(.1,{phase:'HOST_FORCE_SHOT',forceShotAt:epoch-2800});
    expect(actors.gun.parent).toBe(actors.hostRightHand); expect(actors.gun.userData.holder).toBe('host');
    const muzzle=actors.gun.localToWorld(new THREE.Vector3(.315,.09,0));
    const target=camera.localToWorld(new THREE.Vector3(-.14,.015,-.12));
    expect(muzzle.distanceTo(target)).toBeLessThan(.05);
    expect(actors.hostRightArm.limb.pose.root.distanceTo(actors.hostRightArm.limb.pose.joint)).toBeCloseTo(.42);
    vi.mocked(Date.now).mockReturnValue(epoch+3500);
    advance(1,{phase:'ROUND_RESULT',shotEffect:'click'});
    expect(actors.gun.parent).toBe(scene); expect(actors.gun.position.distanceTo(new THREE.Vector3(...GUN_REST))).toBeLessThan(.02);
  });
  it('uses attention only on the matching character, visibly turning back in the final 400ms', () => {
    settleOpening(); const gaze={away:true,returning:false,amount:1,direction:-1};
    tick(.01,{attention:{host:gaze,captive:{...gaze,direction:1},window:true}});
    expect(actors.hostHead.rotation.y).toBeCloseTo(-.70); expect(actors.head.rotation.y).toBeCloseTo(.72);
    tick(.01,{attention:{host:{...gaze,returning:true,amount:.25},captive:{...gaze,direction:1,returning:true,amount:.25},window:true}});
    expect(Math.abs(actors.head.rotation.y)).toBeLessThan(.3); expect(Math.abs(actors.hostHead.rotation.y)).toBeLessThan(.3);
  });
});

it('covers the lowered human head with burlap, then sends both cloth hoods away in the guard pocket', () => {
  settleOpening(); const epoch=Date.now();
  tick(.1,{phase:'OPENING',cinematic:{stage:'hooded',startedAt:epoch,mode:'full'},tiesCut:{player:false,ai:false}});
  const cloth=new THREE.Box3().setFromObject(actors.captiveHood), face=actors.head.getWorldPosition(new THREE.Vector3());
  expect(cloth.min.y).toBeLessThan(face.y-.18); expect(cloth.max.y).toBeGreaterThan(face.y+.18);
  tick(.1,{cinematic:{stage:'guard-exit',startedAt:epoch,mode:'full'}});
  expect(actors.guards[0].foldedHoods.visible).toBe(true);
  expect(actors.guards[0].group.userData.hoodsCarried).toBe(2); expect(actors.captiveHood.visible).toBe(false);
  tick(.1,{cinematic:{stage:'rules',startedAt:epoch,mode:'full'}});
  expect(actors.guards.every(guard=>!guard.group.visible)).toBe(true);
});
