// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createRoom, decisionEvent, isExitStage, type BunkerRoom } from './room';
import type { GamePhase } from '../game';
import type { RoundEvent } from '../tension';
import { stageDurationMs } from '../cinematics';

let scene: THREE.Scene, room: BunkerRoom;
let fillText: ReturnType<typeof vi.fn>;
const event = (kind: RoundEvent['kind']): RoundEvent => ({ kind, startedAt: 1000, duration: 4000, seed: 73 });
const ambient = () => scene.getObjectByName('ambient-room-light') as THREE.HemisphereLight;
const screen = () => scene.getObjectByName('watched-crt-screen') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

beforeEach(() => {
  fillText = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    createRadialGradient: () => ({ addColorStop() {} }),
    putImageData() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    bezierCurveTo() {}, stroke() {}, ellipse() {}, fill() {}, fillText,
  } as unknown as CanvasRenderingContext2D));
  scene = new THREE.Scene(); room = createRoom(scene);
});

afterEach(() => {
  room.reset(); room.dispose();
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

describe('temporary room tension events', () => {
  it('retains the original room lights and screens when no event is active', () => {
    const originalScreen = screen().material;
    room.update(.5, .016, false, false, 0);
    expect(room.bulbLight.intensity).toBe(20);
    expect(ambient().intensity).toBe(.32);
    expect(screen().material).toBe(originalScreen);
    expect((scene.getObjectByName('watched-crt-glow') as THREE.PointLight).intensity).toBeCloseTo(1.45);
    expect(scene.getObjectByName('lamp-filament')?.visible).toBe(true);
  });

  it('cuts only the bulb and ambient light in a blackout, leaving emergency and CRT glow, then restores them immediately on cancellation', () => {
    room.update(.5, .016, false, false, 0, event('blackout'), 1500);
    expect(room.bulbLight.intensity).toBe(0);
    expect(ambient().intensity).toBe(0);
    expect(scene.getObjectByName('lamp-filament')?.visible).toBe(false);
    expect((scene.getObjectByName('lamp-haze') as THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>).material.opacity).toBe(0);
    expect((scene.getObjectByName('emergency-light') as THREE.PointLight).intensity).toBeGreaterThan(1);
    expect((scene.getObjectByName('watched-crt-glow') as THREE.PointLight).intensity).toBeCloseTo(1.45);
    room.update(.6, .016, false, false, 0, null, 1600);
    expect(room.bulbLight.intensity).toBe(20);
    expect(ambient().intensity).toBe(.32);
    expect(scene.getObjectByName('lamp-filament')?.visible).toBe(true);
  });

  it('briefly puts a generated watching message on the existing CRT and restores its original material and glow without adding scene objects', () => {
    const original = screen().material, originalMap = original.map;
    let before = 0; scene.traverse(() => before++);
    room.update(.8, .016, false, false, 0, event('tv'), 1800);
    expect(screen().material).not.toBe(original);
    expect(screen().material.map).not.toBe(originalMap);
    expect(fillText).toHaveBeenCalledWith('WE ARE', 32, 18);
    expect(fillText).toHaveBeenCalledWith('WATCHING', 32, 30);
    expect((scene.getObjectByName('watched-crt-glow') as THREE.PointLight).intensity).toBeGreaterThan(1.45);
    room.update(.9, .016, false, false, 0, event('tv'), 5000);
    expect(screen().material).toBe(original);
    expect(screen().material.map).toBe(originalMap);
    expect((scene.getObjectByName('watched-crt-glow') as THREE.PointLight).intensity).toBeCloseTo(1.45);
    let after = 0; scene.traverse(() => after++); expect(after).toBe(before);
  });

  it('rejects events outside the player decision phase, before their start, or after expiration', () => {
    const phases: GamePhase[] = ['START', 'SHUFFLING', 'DEALING', 'PEEKING', 'HITTING', 'REVEAL', 'DEALER_TURN', 'DEALER_PEEKING', 'SWEEPING', 'AI_SHOOTING', 'PLAYER_SHOOTING', 'ROUND_RESULT', 'GAME_OVER'];
    for (const phase of phases) expect(decisionEvent(phase, event('blackout'), 1500)).toBeNull();
    expect(decisionEvent('PLAYER_DECISION', event('blackout'), 999)).toBeNull();
    expect(decisionEvent('PLAYER_DECISION', event('blackout'), 5000)).toBeNull();
    const active = event('door'); expect(decisionEvent('PLAYER_DECISION', active, 1500)).toBe(active);
  });

  it('reset restores light, fixture, and CRT state even when replay interrupts an event', () => {
    const original = screen().material;
    room.update(.5, .016, false, false, 0, event('tv'), 1500);
    room.update(.6, .016, false, false, 0, event('blackout'), 1600);
    room.reset();
    expect(room.bulbLight.intensity).toBe(20);
    expect(ambient().intensity).toBe(.32);
    expect(screen().material).toBe(original);
    expect(scene.getObjectByName('lamp-filament')?.visible).toBe(true);
    expect(room.lamp.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(scene.getObjectByName('procedural-bunker')?.userData.event).toBeNull();
  });

  it('gives the three campaign rooms distinct green, harsh red, and weak-bulb lighting while preserving the same room geometry', () => {
    let before = 0; scene.traverse(() => before++);
    room.update(.5, .016, false, false, 0, null, 1500, { roomNumber: 1 });
    const green = room.bulbLight.color.clone();
    expect(green.g).toBeGreaterThan(green.r);
    expect(room.bulbLight.intensity).toBe(20);
    room.update(.6, .016, false, false, 0, null, 1600, { roomNumber: 2 });
    expect(room.bulbLight.color.r).toBeGreaterThan(room.bulbLight.color.g * 2);
    expect(room.bulbLight.intensity).toBe(26);
    room.update(.7, .016, false, false, 0, null, 1700, { roomNumber: 3 });
    expect(room.bulbLight.intensity).toBeLessThan(6);
    expect(ambient().intensity).toBeLessThan(.04);
    let after = 0; scene.traverse(() => after++); expect(after).toBe(before);
  });

  it('opens the actual exit door and lights a staircase only during the final win, then shows a rising viewers counter', () => {
    const stairs = scene.getObjectByName('exit-stairwell')!, hinge = scene.getObjectByName('exit-door-hinge')!;
    expect(stairs.visible).toBe(false); expect(hinge.rotation.y).toBe(0);
    room.update(.5, .016, false, false, 0, null, 1500, { roomNumber: 3, phase: 'ENDING_WIN', storyStage: 'door', stageElapsed: 1.8 });
    expect(stairs.visible).toBe(true); expect(hinge.rotation.y).toBeGreaterThan(1.5);
    expect(scene.getObjectByName('exit-doorway')?.visible).toBe(true);
    room.update(.6, .016, false, false, 0, null, 1700, { roomNumber: 3, phase: 'ENDING_WIN', storyStage: 'viewers', stageElapsed: .5 });
    const first = scene.getObjectByName('viewers-counter')?.userData.viewers;
    room.update(.7, .016, false, false, 0, null, 1900, { roomNumber: 3, phase: 'ENDING_WIN', storyStage: 'viewers', stageElapsed: 1.5 });
    expect(scene.getObjectByName('viewers-counter')?.userData.viewers).toBeGreaterThan(first);
    expect(fillText).toHaveBeenCalledWith('12,408', 48, 48);
    room.reset(); expect(stairs.visible).toBe(false); expect(hinge.rotation.y).toBe(0);
  });

  it('keeps the exit closed and the player at the table until the Host finishes the win announcement', () => {
    const stairs = scene.getObjectByName('exit-stairwell')!, hinge = scene.getObjectByName('exit-door-hinge')!;
    room.update(.5, .016, false, false, 0, null, 1500, { roomNumber: 3, phase: 'ENDING_WIN', storyStage: 'departure', stageElapsed: 20 });
    expect(isExitStage('ENDING_WIN', 'departure')).toBe(false);
    expect(stairs.visible).toBe(false); expect(hinge.rotation.y).toBe(0);
    expect(scene.getObjectByName('exit-doorway')?.visible).toBe(false);
    expect(scene.getObjectByName('procedural-bunker')?.userData.exitOpen).toBe(false);
    room.update(.6, .016, false, false, 0, null, 1600, { roomNumber: 3, phase: 'ENDING_WIN', storyStage: 'door', stageElapsed: 0 });
    expect(isExitStage('ENDING_WIN', 'door')).toBe(true);
    expect(stairs.visible).toBe(true); expect(hinge.rotation.y).toBe(0);
    room.update(.7, .016, false, false, 0, null, 1700, { roomNumber: 3, phase: 'ENDING_WIN', storyStage: 'stairs', stageElapsed: 0 });
    expect(hinge.rotation.y).toBeGreaterThan(1.5);
  });
});


describe('guard access and noticeable room life', () => {
  it('opens the real door for the guard, leaves it open for both unhoodings, then closes before rules and play', () => {
    const hinge = scene.getObjectByName('exit-door-hinge')!;
    const update = (stage: import('../cinematics').CinematicStage, elapsed: number, mode: import('../cinematics').CinematicMode = 'full') => {
      room.update(1, .016, false, false, 0, null, 1000 + elapsed,
        { phase: mode === 'transfer' ? 'TRANSITION' : 'OPENING', cinematic: { stage, startedAt: 1000, mode } });
    };
    update('hooded', 400); expect(hinge.rotation.y).toBe(0);
    update('door-open', 800); expect(hinge.rotation.y).toBeGreaterThan(1.6);
    for (const stage of ['guard-approach', 'player-unhood', 'player-focus', 'opponent-unhood'] as const) {
      update(stage, 400); expect(hinge.rotation.y).toBeGreaterThan(1.6);
    }
    update('guard-exit', stageDurationMs('guard-exit')); expect(hinge.rotation.y).toBe(0);
    update('rules', 500); expect(hinge.rotation.y).toBe(0);
    update('transfer-hood', 500, 'transfer'); expect(hinge.rotation.y).toBeGreaterThan(1.6);
    expect(scene.getObjectByName('exit-stairwell')?.visible).toBe(false);
    update('door', 700, 'transfer'); expect(hinge.rotation.y).toBe(0);
  });
  it('sways the bulb and drops bounded dust for one distant event without adding meshes or consuming gameplay RNG', () => {
    let objects = 0; scene.traverse(() => objects++);
    const shot = { id: 'run1:room1:table2', table: 2, startedAt: 1000, duration: 3000, direction: -1 };
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Room life consumed gameplay randomness'); });
    room.update(1, .016, false, false, 0, null, 1100, { phase: 'PLAYER_DECISION', distantShot: shot });
    const dust = scene.getObjectByName('distant-shot-dust') as THREE.Points;
    expect(dust.visible).toBe(true); expect(dust.geometry.getAttribute('position').count).toBe(48);
    const first = dust.geometry.getAttribute('position').getY(0);
    expect(Math.abs(room.lamp.rotation.x) + Math.abs(room.lamp.rotation.z)).toBeGreaterThan(.01);
    room.update(1.5, .016, false, false, 0, null, 1600, { phase: 'PLAYER_DECISION', distantShot: shot });
    expect(dust.geometry.getAttribute('position').getY(0)).toBeLessThan(first);
    room.update(4, .016, false, false, 0, null, 4100, { phase: 'PLAYER_DECISION', distantShot: shot });
    expect(dust.visible).toBe(false); expect(random).not.toHaveBeenCalled();
    let after = 0; scene.traverse(() => after++); expect(after).toBe(objects);
    room.reset(); expect(dust.visible).toBe(false);
  });
  it('shows eyes in the slot and a rattling handle only while their ambient events are active, with no shot-time events', () => {
    const eyes = scene.getObjectByName('guard-window-eyes')!, handle = scene.getObjectByName('door-handle')!;
    const ambientEvent = { id: 'ambient1', kind: 'guard' as const, startedAt: 1000, duration: 2800, loud: false, direction: 1, seed: 31 };
    room.update(1, .016, false, false, 0, null, 1600, { phase: 'PLAYER_DECISION', ambientEvent });
    expect(eyes.visible).toBe(true);
    room.update(1.2, .016, false, false, 0, null, 1800, { phase: 'PLAYER_SHOOTING', ambientEvent });
    expect(eyes.visible).toBe(false);
    room.update(1.3, .016, false, false, 0, null, 1900, { phase: 'PLAYER_DECISION', ambientEvent: { ...ambientEvent, kind: 'handle', loud: true } });
    expect(Math.abs(handle.rotation.z)).toBeGreaterThan(.05);
    room.update(4, .016, false, false, 0, null, 4100, { phase: 'PLAYER_DECISION', ambientEvent });
    expect(eyes.visible).toBe(false); expect(handle.rotation.z).toBe(0);
    expect(scene.getObjectByName('procedural-bunker')?.userData.ambientEvent).toBeNull();
  });
});

it('keeps the opaque felt and an actual clear view of captive shoes below the front rail', () => {
  scene.updateMatrixWorld(true);
  const eye=new THREE.Vector3(0,1.45,2.65);
  for (const x of [-.17,.17]) {
    const foot=new THREE.Vector3(x,.055,-.83), direction=foot.clone().sub(eye);
    const ray=new THREE.Raycaster(eye,direction.clone().normalize(),0,direction.length()-.03);
    const hits=ray.intersectObjects(scene.children,true).filter(hit=>hit.object instanceof THREE.Mesh&&hit.object.visible&&!(hit.object.material as THREE.Material).transparent);
    expect(hits.map(hit=>hit.object.name)).toEqual([]);
  }
});

it('keeps the current blackout visible during the one-second player PEEK',()=>{
 const blackout=event('blackout');
 expect(decisionEvent('PLAYER_PEEKING',blackout,1500)).toBe(blackout);
 expect(decisionEvent('PLAYER_PEEKING',blackout,6000)).toBeNull();
});
