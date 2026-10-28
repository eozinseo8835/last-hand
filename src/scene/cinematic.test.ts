// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createRevolverModel, MUZZLE_LOCAL } from './revolver';
import { createRoom } from './room';
import { addLightShaft, applyCinematicLook, detailRevolver, FILM_EFFECT_UNIFORMS, FilmPipeline, filmFragment, GunshotFX, upgradeRevolver } from './cinematic';
import { retroFragment } from '../Scene';

function revolverInScene() {
  const scene = new THREE.Scene(); const model = createRevolverModel(); scene.add(model.gun); return { scene, ...model };
}

describe('cinematic revolver', () => {
  it('keeps every pivot the game animates and the muzzle where the rig expects it', () => {
    const { scene, gun, hammer, cylinder, trigger, muzzlePoint } = revolverInScene();
    const muzzleBefore = muzzlePoint.position.clone();
    expect(upgradeRevolver(scene, null)).toBe(true);
    expect(detailRevolver(scene)).toBe(true);
    expect(gun.getObjectByName('Revolver cylinder')).toBe(cylinder);
    expect(gun.getObjectByName('Revolver hammer')).toBe(hammer);
    expect(gun.getObjectByName('Revolver trigger')).toBe(trigger);
    expect(muzzlePoint.position.equals(muzzleBefore)).toBe(true);
    expect(muzzlePoint.position.toArray()).toEqual([...MUZZLE_LOCAL]);
  });
  it('replaces the boxy parts with machined ones that still move with their pivots', () => {
    const { scene, gun, hammer, cylinder, trigger } = revolverInScene();
    upgradeRevolver(scene, null); detailRevolver(scene);
    expect(gun.getObjectByName('Frame rear strap')!.visible).toBe(false);
    expect(gun.getObjectByName('HD frame')!.visible).toBe(true);
    expect(cylinder.getObjectByName('HD fluted cylinder')).toBeDefined();
    expect(cylinder.children.filter(c => c.name === 'HD cartridge rim')).toHaveLength(6);
    expect(hammer.getObjectByName('HD hammer')).toBeDefined();
    expect(trigger.getObjectByName('HD trigger')).toBeDefined();
    // the wooden grip is kept (it is what the hands are posed around)
    expect(gun.getObjectByName('Curved wooden grip')!.visible).toBe(true);
    const size = new THREE.Box3().setFromObject(gun).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(.26); expect(size.x).toBeLessThan(.30);
  });
  it('lines a chamber up with the bore at rest', () => {
    const { scene, cylinder } = revolverInScene();
    upgradeRevolver(scene, null); detailRevolver(scene);
    const rims = cylinder.children.filter(c => c.name === 'HD cartridge rim');
    const top = rims.reduce((a, b) => (b.position.y > a.position.y ? b : a));
    expect(top.position.y + cylinder.position.y).toBeCloseTo(MUZZLE_LOCAL[1], 2);
    expect(Math.abs(top.position.z)).toBeLessThan(1e-6);
  });
});

describe('gunshot effect', () => {
  it('flashes for a split second at the real muzzle, then leaves smoke that clears', () => {
    const { scene, gun } = revolverInScene(); gun.position.set(.2, 1.1, .3); gun.rotation.set(.3, -.8, .1);
    const fx = new GunshotFX(scene);
    expect(fx.active).toBe(false);
    fx.fireFromGun(gun); fx.update(1 / 120);
    const muzzle = gun.localToWorld(new THREE.Vector3(...MUZZLE_LOCAL));
    expect(fx.flash.visible).toBe(true);
    expect(fx.flash.position.distanceTo(muzzle)).toBeLessThan(.03);
    expect(fx.light.intensity).toBeGreaterThan(0);
    for (let t = 0; t < .12; t += 1 / 120) fx.update(1 / 120);
    expect(fx.flash.visible).toBe(false); expect(fx.light.intensity).toBe(0);
    expect(fx.smokeCount).toBeGreaterThan(0);
    for (let t = 0; t < 6; t += 1 / 30) fx.update(1 / 30);
    expect(fx.smokeCount).toBe(0); expect(fx.active).toBe(false);
  });
  it('does not pile up objects over many shots', () => {
    const { scene, gun } = revolverInScene(); const fx = new GunshotFX(scene);
    const base = fx.group.children.length;
    for (let shot = 0; shot < 5; shot++) { fx.fireFromGun(gun); for (let t = 0; t < 6; t += 1 / 30) fx.update(1 / 30); }
    expect(fx.group.children.length).toBe(base);
    fx.dispose(); expect(scene.getObjectByName('gunshot-fx')).toBeUndefined();
  });
});

describe('cinematic room', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
      createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }),
      putImageData() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      bezierCurveTo() {}, stroke() {}, ellipse() {}, fill() {}, fillText() {},
    } as unknown as CanvasRenderingContext2D));
  });
  afterEach(() => vi.restoreAllMocks());
  it('darkens the room around a light shaft without touching game objects, and is safe to apply twice', () => {
    const world = new THREE.Scene(); createRoom(world);
    const bulbBefore: number[] = []; world.traverse(o => { const l = o as THREE.PointLight; if (l.isPointLight && l.castShadow) bulbBefore.push(l.intensity); });
    applyCinematicLook(world, null); applyCinematicLook(world, null);
    expect(world.getObjectByName('lamp-haze')!.visible).toBe(false);
    expect((world.fog as THREE.FogExp2).density).toBeCloseTo(.12);
    expect((world.getObjectByName('ambient-room-light') as THREE.HemisphereLight).intensity).toBeCloseTo(.06);
    expect(world.getObjectByName('cinematic-light-shaft')).toBeDefined();
    const bulbAfter: number[] = []; world.traverse(o => { const l = o as THREE.PointLight; if (l.isPointLight && l.castShadow) bulbAfter.push(l.intensity); });
    expect(bulbAfter.map((v, i) => v / bulbBefore[i])).toEqual(bulbBefore.map(() => 1.6));
    expect(world.getObjectByName('hanging-bulb')).toBeDefined();
    expect(world.getObjectByName('card-table')).toBeDefined();
  });
});

describe('no invalid pixels (black blocks on Mac GPUs)', () => {
  it('never takes pow() of a value that can go negative in the light shaft, and clamps its output', () => {
    const world = new THREE.Scene(); addLightShaft(world);
    const shaders: string[] = []; world.getObjectByName('cinematic-light-shaft')!.traverse(o => { const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined; if (m?.fragmentShader) shaders.push(m.fragmentShader + m.vertexShader); });
    expect(shaders.length).toBeGreaterThanOrEqual(3);
    for (const code of shaders) expect(code).not.toMatch(/pow\(vT/);
    expect(shaders.join('')).toContain('clamp(vT, 0., 1.)');
    expect(shaders.join('')).toContain('clamp(a, 0., 4.)');
    expect(shaders.join('')).toContain('max(-mv.z, .05)');
  });
  it('scrubs NaN and Inf before blur and bloom can spread them', () => {
    expect(filmFragment).toContain('safeColor(texture2D(bloom, vUv).rgb)');
    expect(filmFragment).toContain('acc += safeColor(texture2D(tex, vUv+o).rgb)');
  });
});

describe('film pipeline', () => {
  it('carries every game screen effect from the classic shader (hood, trigger darkening, glare, squint)', () => {
    const film = new FilmPipeline({} as THREE.WebGLRenderer, 320, 180);
    for (const key of FILM_EFFECT_UNIFORMS) {
      expect(film.finalMat.uniforms[key]).toBeDefined();
      expect(retroFragment).toContain(`uniform float ${key};`);
      expect(filmFragment).toContain(key);
    }
    expect(film.finalMat.uniforms.hoodDrop.value).toBe(1);
    film.setSize(640, 360);
    expect((film.finalMat.uniforms.res.value as THREE.Vector2).toArray()).toEqual([640, 360]);
    expect(film.bright.width).toBe(160);
  });
  it('focuses on what the player looks at, never past the table, and never blurs your own cards', () => {
    expect(filmFragment).toContain('texture2D(depth,vec2(.5,.5))');
    expect(filmFragment).toContain('clamp(focus, .3, 1.9)');
    expect(filmFragment).toContain('coc *= smoothstep(.85, 1.15, d)');
  });
});
