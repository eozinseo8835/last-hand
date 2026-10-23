// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createRoom, decisionEvent, isExitStage, type BunkerRoom } from './room';
import type { GamePhase } from '../game';
import type { RoundEvent } from '../tension';

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
