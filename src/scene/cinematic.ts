import * as THREE from 'three';
import { MUZZLE_LOCAL } from './revolver';

/* Cinematic graphics mode for LAST HAND.
 * Everything here is generated in code (no downloaded models, textures or sounds).
 * The classic pixel mode never calls into this file. */

/* ------------------------------------------------------------------ */
/* Procedural textures (no downloaded assets: everything is generated) */
/* ------------------------------------------------------------------ */
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number, r: () => number) => void, seed = 1, srgb = true) {
  const cv = typeof document === 'undefined' ? null : document.createElement('canvas');
  const c = cv?.getContext?.('2d') as CanvasRenderingContext2D | null | undefined;
  if (!cv || !c) { const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); t.needsUpdate = true; return t as unknown as THREE.CanvasTexture; }
  cv.width = cv.height = size;
  try { draw(c, size, rng(seed)); } catch { /* partial canvas implementations (tests) */ }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(c: CanvasRenderingContext2D, s: number, r: () => number, n: number, alpha: number, light: string, dark: string, size = 1.2) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = r() < .5 ? light : dark; c.globalAlpha = alpha * r();
    const w = size * (.5 + r()); c.fillRect(r() * s, r() * s, w, w);
  }
  c.globalAlpha = 1;
}

function blotches(c: CanvasRenderingContext2D, s: number, r: () => number, n: number, color: string, alpha: number, rad: number) {
  for (let i = 0; i < n; i++) {
    const x = r() * s, y = r() * s, R = rad * (.4 + r());
    const g = c.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = alpha * r(); c.fillStyle = g; c.fillRect(x - R, y - R, R * 2, R * 2);
  }
  c.globalAlpha = 1;
}

const feltColor = () => canvasTex(1024, (c, s, r) => {
  c.fillStyle = '#1d4a34'; c.fillRect(0, 0, s, s);
  blotches(c, s, r, 60, 'rgba(10,30,20,1)', .5, 160);          // worn, darker patches
  blotches(c, s, r, 30, 'rgba(60,95,70,1)', .25, 120);          // rubbed lighter areas
  speckle(c, s, r, 90000, .35, '#3f6e55', '#0e2419', 1.1);      // fibres
  c.strokeStyle = 'rgba(120,150,120,0.08)';
  for (let i = 0; i < 1600; i++) { c.lineWidth = .6; c.beginPath(); const x = r() * s, y = r() * s, a = r() * 6.28; c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); c.stroke(); }
  blotches(c, s, r, 6, 'rgba(25,20,10,1)', .35, 50);            // old drink stains
}, 11);
const feltBump = () => canvasTex(512, (c, s, r) => { c.fillStyle = '#808080'; c.fillRect(0, 0, s, s); speckle(c, s, r, 70000, .6, '#b0b0b0', '#505050', 1); }, 12, false);

const woodColor = () => canvasTex(1024, (c, s, r) => {
  const g = c.createLinearGradient(0, 0, 0, s); g.addColorStop(0, '#3a2414'); g.addColorStop(1, '#2a180c');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  for (let i = 0; i < 260; i++) {
    const y0 = r() * s, amp = 4 + r() * 14, f = .004 + r() * .01, ph = r() * 6.28;
    c.strokeStyle = r() < .5 ? 'rgba(90,55,28,0.45)' : 'rgba(18,10,5,0.5)'; c.lineWidth = .6 + r() * 2.2;
    c.beginPath(); for (let x = 0; x <= s; x += 8) { const y = y0 + Math.sin(x * f + ph) * amp; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
  }
  blotches(c, s, r, 20, 'rgba(120,80,40,1)', .12, 140);          // varnish glow
  speckle(c, s, r, 20000, .25, '#5a3a20', '#120a05', 1);
  c.strokeStyle = 'rgba(200,170,130,0.10)'; for (let i = 0; i < 120; i++) { c.lineWidth = .5; c.beginPath(); const x = r() * s, y = r() * s; c.moveTo(x, y); c.lineTo(x + (r() - .5) * 60, y + (r() - .5) * 8); c.stroke(); } // scratches
}, 21);
const woodBump = () => canvasTex(512, (c, s, r) => { c.fillStyle = '#808080'; c.fillRect(0, 0, s, s); for (let i = 0; i < 160; i++) { c.strokeStyle = r() < .5 ? '#9a9a9a' : '#666'; c.lineWidth = 1 + r() * 2; c.beginPath(); const y0 = r() * s; for (let x = 0; x <= s; x += 8) { const y = y0 + Math.sin(x * .01 + i) * 6; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); } }, 22, false);

const concreteColor = () => canvasTex(1024, (c, s, r) => {
  c.fillStyle = '#5d5d55'; c.fillRect(0, 0, s, s);
  blotches(c, s, r, 120, 'rgba(30,32,28,1)', .45, 180);
  blotches(c, s, r, 60, 'rgba(120,118,105,1)', .2, 140);
  for (let i = 0; i < 40; i++) { const x = r() * s, w = 6 + r() * 30; const g = c.createLinearGradient(0, 0, 0, s); g.addColorStop(0, 'rgba(20,22,18,0)'); g.addColorStop(.3 + r() * .4, 'rgba(20,22,18,.35)'); g.addColorStop(1, 'rgba(20,22,18,0)'); c.fillStyle = g; c.fillRect(x, 0, w, s); } // water streaks
  speckle(c, s, r, 120000, .4, '#8a897c', '#232420', 1.3);
}, 31);
const concreteBump = () => canvasTex(512, (c, s, r) => { c.fillStyle = '#808080'; c.fillRect(0, 0, s, s); speckle(c, s, r, 60000, .7, '#b5b5b5', '#4a4a4a', 1.6); blotches(c, s, r, 50, 'rgba(60,60,60,1)', .5, 60); }, 32, false);

/* ------------------------------------------------------------------ */
/* Material upgrade                                                    */
/* ------------------------------------------------------------------ */
export function upgradeMaterials(world: THREE.Object3D) {
  const felt = { map: feltColor(), bump: feltBump() }; felt.map.repeat.set(.6, .6); felt.map.offset.set(.5, .5); felt.bump.repeat.set(4, 4);
  const wood = { map: woodColor(), bump: woodBump() };
  const conc = { map: concreteColor(), bump: concreteBump() }; conc.map.repeat.set(3, 1.5); conc.bump.repeat.set(6, 3);
  const seen = new Set<THREE.Material>();
  world.traverse(o => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (!(mat instanceof THREE.MeshStandardMaterial) || seen.has(mat)) continue; seen.add(mat);
      const hex = mat.color.getHex();
      mat.flatShading = false;
      if (mat.map) { mat.map.minFilter = THREE.LinearMipmapLinearFilter; mat.map.magFilter = THREE.LinearFilter; mat.map.anisotropy = 8; mat.map.needsUpdate = true; }
      if (hex === 0xb5ba93) { mat.map = felt.map; mat.bumpMap = felt.bump; mat.bumpScale = 1.2; mat.color.set(0xffffff); mat.roughness = 1; }
      else if (hex === 0xb49a77 || hex === 0x5c4c35) { mat.map = wood.map; mat.bumpMap = wood.bump; mat.bumpScale = .8; mat.color.set(hex === 0x5c4c35 ? 0x9a8a78 : 0xffffff); mat.roughness = .42; }
      else if (hex === 0xaaa99a || hex === 0x8a8977) { mat.map = conc.map; mat.bumpMap = conc.bump; mat.bumpScale = 2; mat.color.set(hex === 0x8a8977 ? 0x8f8f86 : 0xb0b0a6); mat.roughness = .95; }
      else if (mat.metalness > .3) { mat.roughness = Math.min(mat.roughness, .5); }
      mat.needsUpdate = true;
    }
    (o as THREE.Mesh).castShadow = (o as THREE.Mesh).castShadow || (o as any).isSkinnedMesh;
  });
}

/* ------------------------------------------------------------------ */
/* Volumetric light shaft + dust motes                                 */
/* ------------------------------------------------------------------ */
const noiseGLSL = `
  float h3(vec3 p){ p = fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
    return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=.5; } return s; }
`;

export function addLightShaft(world: THREE.Scene, apexY = 2.62, baseY = .752, baseR = .78) {
  const group = new THREE.Group(); group.name = 'cinematic-light-shaft';
  const make = (radius: number, strength: number) => {
    const h = apexY - baseY;
    const geo = new THREE.ConeGeometry(radius, h, 64, 24, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, strength: { value: strength }, height: { value: h } },
      vertexShader: `varying vec3 vW; varying vec3 vN; varying float vT; uniform float height;
        void main(){ vT = (position.y + height*.5)/height; vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: noiseGLSL + `varying vec3 vW; varying vec3 vN; varying float vT; uniform float time; uniform float strength;
        void main(){ vec3 V = normalize(cameraPosition - vW); float facing = pow(abs(dot(normalize(vN), V)), 2.2);
          float smoke = fbm(vW*vec3(3.2,1.6,3.2) + vec3(time*.03, -time*.05, time*.02));
          float wisps = smoothstep(.35,.85, fbm(vW*vec3(1.4,.7,1.4) + vec3(0., time*.02, 0.)));
          float along = mix(.25, 1., pow(vT, .8)) * smoothstep(0., .12, vT) ;
          float a = facing * along * (.35 + 1.2*smoke*wisps) * strength;
          gl_FragColor = vec4(vec3(1., .86, .62)*a, 1.); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat); m.position.y = (apexY + baseY) / 2; m.renderOrder = 10; group.add(m); return mat;
  };
  const mats = [make(baseR, .075), make(baseR * .55, .085)];
  // floating dust motes caught in the light
  const N = 260, pos = new Float32Array(N * 3), seed = rng(77), sizes = new Float32Array(N);
  for (let i = 0; i < N; i++) { const t = seed(), y = baseY + .05 + t * (apexY - baseY - .2), rr = (1 - (y - baseY) / (apexY - baseY)) * baseR * Math.sqrt(seed()); const a = seed() * 6.283; pos.set([Math.cos(a) * rr, y, Math.sin(a) * rr], i * 3); sizes[i] = .5 + seed() * 1.5; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, scale: { value: 900 } },
    vertexShader: `attribute float size; uniform float time; uniform float scale; varying float vA;
      void main(){ vec3 p = position + vec3(sin(time*.3+position.y*7.)*.02, sin(time*.2+position.x*9.)*.015, cos(time*.25+position.z*8.)*.02);
        vec4 mv = modelViewMatrix*vec4(p,1.); gl_PointSize = max(1.5, size * scale * .0016 / -mv.z); vA = clamp(1.2 - length(p.xz)/1.1, 0., 1.); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-.5); float a = smoothstep(.5,.0,d); gl_FragColor = vec4(vec3(1.,.9,.7)*a*.30*vA,1.); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(g, dustMat); dust.renderOrder = 11; group.add(dust);
  world.add(group);
  return { update(t: number, H: number) { for (const m of mats) m.uniforms.time.value = t; dustMat.uniforms.time.value = t; dustMat.uniforms.scale.value = H; } };
}

/* ------------------------------------------------------------------ */
/* Realistic revolver: blued steel, polished edges, varnished walnut   */
/* ------------------------------------------------------------------ */
function brushed() {
  return canvasTex(512, (c, s, r) => {
    c.fillStyle = '#5a5a5a'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 3000; i++) { c.strokeStyle = r() < .5 ? 'rgba(140,140,140,.35)' : 'rgba(30,30,30,.35)'; c.lineWidth = .5 + r(); const y = r() * s; c.beginPath(); c.moveTo(0, y); c.lineTo(s, y + (r() - .5) * 2); c.stroke(); }
    blotches(c, s, r, 25, 'rgba(160,160,160,1)', .25, 60);   // wear / fingerprints
  }, 51, false);
}
const walnut = () => canvasTex(512, (c, s, r) => {
  c.fillStyle = '#3d2414'; c.fillRect(0, 0, s, s);
  for (let i = 0; i < 140; i++) { const y0 = r() * s; c.strokeStyle = r() < .5 ? 'rgba(92,56,30,.45)' : 'rgba(25,12,5,.55)'; c.lineWidth = .8 + r() * 2.5;
    c.beginPath(); for (let x = 0; x <= s; x += 6) { const y = y0 + Math.sin(x * .02 + i) * 5 + Math.sin(x * .07) * 2; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
  c.strokeStyle = 'rgba(15,8,3,.5)'; c.lineWidth = 1.2;                               // checkering diamonds
  for (let k = -s; k < s * 2; k += 9) { c.beginPath(); c.moveTo(k, s * .25); c.lineTo(k + s * .5, s * .75); c.stroke(); c.beginPath(); c.moveTo(k + s * .5, s * .25); c.lineTo(k, s * .75); c.stroke(); }
}, 52);

function envFor(renderer: THREE.WebGLRenderer) {
  // A tiny "photo studio" of the bunker: warm bulb overhead, dim green walls, a red emergency glow.
  const env = new THREE.Scene(); env.background = new THREE.Color('#050606');
  const panel = (color: string, w: number, h: number, pos: [number, number, number], rot: [number, number, number], strength = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); env.add(m);
  };
  panel('#ffd9a0', 1.6, 1.6, [0, 3, 0], [Math.PI / 2, 0, 0], 10); panel('#c8d8d0', 2, .5, [-3, 1.5, 1], [0, Math.PI / 2, 0], 1.5);
  panel('#1a2a22', 8, 3, [0, 1, -4], [0, 0, 0], 1);
  panel('#1a2a22', 8, 3, [0, 1, 4], [0, Math.PI, 0], .6);
  panel('#7a1e14', 1, 1, [3, 2, -3], [0, -.7, 0], 2);
  panel('#22382c', 8, 8, [0, -1, 0], [-Math.PI / 2, 0, 0], .5);
  const pm = new THREE.PMREMGenerator(renderer); const rt = pm.fromScene(env, .02); pm.dispose(); return rt.texture;
}

export function upgradeRevolver(world: THREE.Object3D, renderer: THREE.WebGLRenderer | null) {
  const gun = world.getObjectByName('Shared six-chamber revolver') ?? (world.name === 'Shared six-chamber revolver' ? world : null); if (!gun) return false;
  const envMap = renderer ? envFor(renderer) : null, rough = brushed(), grain = walnut();
  const blued = new THREE.MeshPhysicalMaterial({ color: 0x4a5359, metalness: 1, roughness: .26, roughnessMap: rough, envMap, envMapIntensity: 3.2, clearcoat: .3, clearcoatRoughness: .25 });
  const polished = new THREE.MeshPhysicalMaterial({ color: 0xb8bec4, metalness: 1, roughness: .16, envMap, envMapIntensity: 3 });
  const cylSteel = new THREE.MeshPhysicalMaterial({ color: 0x565f66, metalness: 1, roughness: .22, roughnessMap: rough, envMap, envMapIntensity: 3.2, clearcoat: .4 });
  const black = new THREE.MeshStandardMaterial({ color: 0x050505, metalness: .5, roughness: .7 });
  const wood = new THREE.MeshPhysicalMaterial({ map: grain, color: 0xffffff, roughness: .45, metalness: 0, clearcoat: .7, clearcoatRoughness: .3, envMap, envMapIntensity: .6 });
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xb08a3e, metalness: 1, roughness: .3, envMap, envMapIntensity: 1.2 });
  const smooth = (m: THREE.Mesh, sides: number) => {
    const g = m.geometry as THREE.CylinderGeometry; const p = g.parameters; if (!p) return;
    const ng = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, sides, 1, p.openEnded); ng.rotateZ(-Math.PI / 2); m.geometry = ng;
  };
  gun.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return; const n = m.name;
    if (/grip/i.test(n) && /wood/i.test(n)) m.material = wood;
    else if (/checkering/i.test(n)) m.visible = false;                         // the texture carries the checkering now
    else if (/bore|Recessed|flute|trigger/i.test(n)) m.material = black;
    else if (/rim|crown|highlight|hub|screw/i.test(n)) m.material = polished;
    else if (/cylinder|Ejector/i.test(n)) m.material = cylSteel;
    else m.material = blued;
    if (/cylinder body/i.test(n)) smooth(m, 48);
    if (/Hollow .38 barrel/.test(n)) smooth(m, 32);
    if (/Rear chamber \d bore/.test(n)) m.material = brass;                  // cartridge rims visible from behind
    m.castShadow = m.receiveShadow = true;
  });
  gun.userData.cinematic = true; return true;
}

/* ------------------------------------------------------------------ */
/* Gunshot: muzzle flash, cylinder-gap flash, sparks, lingering smoke  */
/* ------------------------------------------------------------------ */
const flashTex = () => canvasTex(256, (c, s, r) => {
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(.12, 'rgba(255,235,160,1)'); g.addColorStop(.35, 'rgba(255,150,40,.7)'); g.addColorStop(1, 'rgba(120,30,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + r() * .3, L = s * (.25 + r() * .25);
    c.save(); c.translate(s / 2, s / 2); c.rotate(a); const sg = c.createLinearGradient(0, 0, L, 0); sg.addColorStop(0, 'rgba(255,230,150,.9)'); sg.addColorStop(1, 'rgba(255,120,20,0)');
    c.fillStyle = sg; c.beginPath(); c.moveTo(0, -s * .03); c.lineTo(L, 0); c.lineTo(0, s * .03); c.fill(); c.restore(); }
}, 61);
const plumeTex = () => canvasTex(256, (c, s, r) => {          // side view of the flame cone, base at left
  for (let i = 0; i < 26; i++) { const x = s * (.05 + r() * .6), y = s / 2 + (r() - .5) * s * .25 * (x / s + .3), R = s * (.08 + r() * .14) * (1 - x / s * .6);
    const g = c.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, 'rgba(255,240,190,.9)'); g.addColorStop(.5, 'rgba(255,150,40,.45)'); g.addColorStop(1, 'rgba(255,80,0,0)');
    c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(x - R, y - R, R * 2, R * 2); }
}, 62);
const puffTex = () => canvasTex(256, (c, s, r) => {
  for (let i = 0; i < 160; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * s * .32, x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d, R = s * (.02 + r() * .07);
    const g = c.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x - R, y - R, R * 2, R * 2); }
  c.strokeStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 30; i++) { c.lineWidth = 1 + r() * 3; c.beginPath(); let x = s / 2, y = s / 2; c.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - .5) * 40; y += (r() - .5) * 40; c.lineTo(x, y); } c.stroke(); }
  const fade = c.createRadialGradient(s / 2, s / 2, s * .2, s / 2, s / 2, s * .5); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  c.globalCompositeOperation = 'destination-out'; c.fillStyle = fade; c.fillRect(0, 0, s, s);
}, 63);

export class GunshotFX {
  group = new THREE.Group(); light = new THREE.PointLight(0xffc070, 0, 6, 2);
  flash: THREE.Sprite; plumes: THREE.Mesh[] = []; gaps: THREE.Sprite[] = []; sparks: THREE.Points; smoke: { s: THREE.Sprite, v: THREE.Vector3, life: number, max: number, grow: number }[] = [];
  age = 99; puff = puffTex(); sparkVel: THREE.Vector3[] = [];
  constructor(public world: THREE.Scene) {
    this.group.name = 'gunshot-fx'; world.add(this.group); this.group.add(this.light);
    const add = THREE.AdditiveBlending;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex(), blending: add, depthWrite: false, transparent: true, toneMapped: false }));
    this.group.add(this.flash);
    const pm = new THREE.MeshBasicMaterial({ map: plumeTex(), blending: add, depthWrite: false, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    for (let i = 0; i < 3; i++) { const g = new THREE.PlaneGeometry(1, .5); g.translate(.5, 0, 0); const m = new THREE.Mesh(g, pm); this.plumes.push(m); this.group.add(m); }
    for (let i = 0; i < 2; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex(), blending: add, depthWrite: false, transparent: true, toneMapped: false })); this.gaps.push(s); this.group.add(s); }
    const sp = new Float32Array(40 * 3); const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffb050, size: .006, blending: add, transparent: true, depthWrite: false, toneMapped: false }));
    this.group.add(this.sparks);
    this.hide();
  }
  /** Fire from the revolver's real muzzle, along its barrel. */
  fireFromGun(gun: THREE.Object3D) {
    gun.updateWorldMatrix(true, false);
    const q = gun.getWorldQuaternion(new THREE.Quaternion());
    const muzzle = gun.localToWorld(new THREE.Vector3(...MUZZLE_LOCAL));
    const gap = gun.localToWorld(new THREE.Vector3(.041, MUZZLE_LOCAL[1], 0));
    this.fire(muzzle, new THREE.Vector3(1, 0, 0).applyQuaternion(q), gap, new THREE.Vector3(0, 1, 0).applyQuaternion(q));
  }
  /** True while any flash, spark or smoke is still on screen. */
  get active() { return this.flash.visible || this.sparks.visible || this.smoke.length > 0; }
  get smokeCount() { return this.smoke.length; }
  dispose() {
    for (const p of this.smoke) p.s.material.dispose();
    this.smoke = []; this.puff.dispose(); this.flash.material.map?.dispose(); this.flash.material.dispose();
    for (const g of this.gaps) g.material.dispose();
    for (const p of this.plumes) p.geometry.dispose();
    this.sparks.geometry.dispose(); (this.sparks.material as THREE.Material).dispose();
    this.world.remove(this.group);
  }
  hide() { this.flash.visible = false; this.plumes.forEach(p => p.visible = false); this.gaps.forEach(g => g.visible = false); this.sparks.visible = false; this.light.intensity = 0; }
  fire(muzzle: THREE.Vector3, dir: THREE.Vector3, cylFront: THREE.Vector3, up: THREE.Vector3) {
    this.age = 0; this.muzzle = muzzle.clone(); this.dir = dir.clone().normalize(); this.cyl = cylFront.clone(); this.up = up.clone();
    this.light.position.copy(muzzle).addScaledVector(this.dir, .05);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.dir);
    this.plumes.forEach((p, i) => { p.position.copy(muzzle); p.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), i * Math.PI / 3)); });
    const pos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute; this.sparkVel = [];
    const r = rng(Math.floor(Math.random() * 1e9));
    for (let i = 0; i < pos.count; i++) { pos.setXYZ(i, muzzle.x, muzzle.y, muzzle.z);
      const v = this.dir.clone().multiplyScalar(2 + r() * 4).add(new THREE.Vector3(r() - .5, r() - .5, r() - .5).multiplyScalar(1.6)); this.sparkVel.push(v); }
    pos.needsUpdate = true;
    for (let i = 0; i < 60; i++) {                                                   // smoke: from muzzle and cylinder gap
      const fromGap = i < 14; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puff, color: 0xb8b2a6, transparent: true, depthWrite: false, opacity: 0 }));
      s.position.copy(fromGap ? cylFront : muzzle); this.group.add(s);
      const v = fromGap ? new THREE.Vector3(r() - .5, r() * .6, r() - .5).multiplyScalar(.25) : this.dir.clone().multiplyScalar(.15 + r() * .6).add(new THREE.Vector3(r() - .5, r() * .5, r() - .5).multiplyScalar(.18));
      this.smoke.push({ s, v, life: 0, max: 1.8 + r() * 2.2, grow: .05 + r() * .12 });
    }
  }
  muzzle = new THREE.Vector3(); dir = new THREE.Vector3(1, 0, 0); cyl = new THREE.Vector3(); up = new THREE.Vector3(0, 1, 0);
  update(dt: number) {
    this.age += dt; const a = this.age;
    const f = a < .07 ? 1 - a / .07 : 0;                          // flash lasts ~70 ms
    this.flash.visible = f > 0; this.plumes.forEach(p => p.visible = f > 0); this.gaps.forEach(g => g.visible = f > 0);
    if (f > 0) {
      this.flash.position.copy(this.muzzle).addScaledVector(this.dir, .02); this.flash.scale.setScalar(.08 + .07 * f); this.flash.material.rotation = a * 40;
      this.plumes.forEach(p => p.scale.set(.16 * (.7 + f * .5), .08 * (.8 + f * .4), 1));
      const side = new THREE.Vector3().crossVectors(this.dir, this.up).normalize();
      this.gaps.forEach((g, i) => { g.position.copy(this.cyl).addScaledVector(side, i ? .03 : -.03); g.scale.setScalar(.035 * f); });
    }
    this.light.intensity = f * f * 7;
    const pos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.sparks.visible = a < .35;
    if (this.sparks.visible) { for (let i = 0; i < pos.count; i++) { const v = this.sparkVel[i]; v.y -= 9.8 * dt; pos.setXYZ(i, pos.getX(i) + v.x * dt, pos.getY(i) + v.y * dt, pos.getZ(i) + v.z * dt); } pos.needsUpdate = true;
      (this.sparks.material as THREE.PointsMaterial).opacity = 1 - a / .35; }
    this.smoke = this.smoke.filter(p => { if (p.life > p.max) { this.group.remove(p.s); p.s.material.dispose(); return false; } return true; });
    for (const p of this.smoke) {
      p.life += dt; const t = p.life / p.max; if (t > 1) { p.s.visible = false; continue; }
      p.v.multiplyScalar(Math.pow(.15, dt)); p.v.y += .05 * dt;                     // drag + slow rise
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(.012 + p.grow * Math.sqrt(p.life) * .7);
      p.s.material.opacity = Math.min(1, p.life * 8) * (1 - t) * (1 - t) * .16; p.s.material.rotation += dt * .2;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Detailed revolver geometry (keeps the game's pivot groups)          */
/* ------------------------------------------------------------------ */
function rounded(shape: THREE.Shape | THREE.Path, x0: number, y0: number, x1: number, y1: number, r: number) {
  shape.moveTo(x0 + r, y0); shape.lineTo(x1 - r, y0); shape.quadraticCurveTo(x1, y0, x1, y0 + r);
  shape.lineTo(x1, y1 - r); shape.quadraticCurveTo(x1, y1, x1 - r, y1); shape.lineTo(x0 + r, y1);
  shape.quadraticCurveTo(x0, y1, x0, y1 - r); shape.lineTo(x0, y0 + r); shape.quadraticCurveTo(x0, y0, x0 + r, y0);
}
function extrudeXY(shape: THREE.Shape, depth: number, bevel = .0012, seg = 3) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg, curveSegments: 16 });
  g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g;
}
export function detailRevolver(world: THREE.Object3D) {
  const gun = world.getObjectByName('Shared six-chamber revolver') ?? (world.name === 'Shared six-chamber revolver' ? world : null); if (!gun) return false;
  const cyl = gun.getObjectByName('Revolver cylinder')!, hammer = gun.getObjectByName('Revolver hammer')!, trigger = gun.getObjectByName('Revolver trigger')!;
  // borrow the upgraded materials from the original parts
  const find = (re: RegExp) => { let m: THREE.Material | null = null; gun.traverse(o => { if (!m && (o as THREE.Mesh).isMesh && re.test(o.name)) m = (o as THREE.Mesh).material as THREE.Material; }); return m!; };
  const blued = find(/Frame rear strap/), cylSteel = find(/Six chamber cylinder body/), polished = find(/Muzzle steel crown/), black = find(/Recessed muzzle bore/), wood = find(/Curved wooden grip/), brass = find(/Rear chamber 1 bore/);
  for (const parent of [gun, cyl, hammer, trigger]) for (const c of [...parent.children]) if ((c as THREE.Mesh).isMesh && !/wooden grip/i.test(c.name)) c.visible = false;
  const add = (parent: THREE.Object3D, name: string, g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number] = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(g, m); mesh.name = 'HD ' + name; mesh.position.set(...p); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh; };

  // Frame: side silhouette with the cylinder window cut out
  const f = new THREE.Shape();
  f.moveTo(-.060, .061); f.lineTo(.058, .061); f.quadraticCurveTo(.064, .061, .064, .055); f.lineTo(.064, .030);
  f.quadraticCurveTo(.062, .010, .052, .000); f.lineTo(.046, -.006); f.lineTo(-.006, -.006);
  f.quadraticCurveTo(-.030, -.006, -.046, -.012); f.lineTo(-.060, -.016); f.quadraticCurveTo(-.074, .010, -.072, .040);
  f.quadraticCurveTo(-.071, .058, -.060, .061);
  const win = new THREE.Path(); rounded(win, -.033, -.0035, .042, .0545, .004); f.holes.push(win);
  add(gun, 'frame', extrudeXY(f, .024, .0016), blued);
  add(gun, 'rear sight groove', new THREE.BoxGeometry(.05, .0012, .003), black, [-.030, .0628, 0]);
  // Barrel, top rib, full under-lug, ramp front sight, crown
  const barrel = new THREE.CylinderGeometry(.0092, .0092, .089, 40, 1, false); barrel.rotateZ(-Math.PI / 2);
  add(gun, 'barrel', barrel, blued, [.1065, .042, 0]);
  const rib = new THREE.Shape(); rounded(rib, .062, .049, .150, .0545, .0015); add(gun, 'barrel rib', extrudeXY(rib, .0055, .0008), blued);
  const lug = new THREE.Shape(); lug.moveTo(.062, .036); lug.lineTo(.146, .036); lug.quadraticCurveTo(.150, .036, .150, .032); lug.lineTo(.150, .026);
  lug.quadraticCurveTo(.150, .022, .146, .022); lug.lineTo(.074, .022); lug.quadraticCurveTo(.066, .022, .062, .028); lug.closePath();
  add(gun, 'under-lug', extrudeXY(lug, .0115, .0014), blued);
  const sight = new THREE.Shape(); sight.moveTo(.126, .0545); sight.lineTo(.148, .0545); sight.lineTo(.148, .0625); sight.quadraticCurveTo(.140, .061, .126, .0545);
  add(gun, 'ramp front sight', extrudeXY(sight, .0028, .0005), blued);
  const crown = new THREE.TorusGeometry(.0075, .0016, 10, 40); crown.rotateY(Math.PI / 2); add(gun, 'crown', crown, polished, [.1512, .042, 0]);
  const bore = new THREE.CylinderGeometry(.0048, .0048, .03, 24); bore.rotateZ(-Math.PI / 2); add(gun, 'bore', bore, black, [.138, .042, 0]);
  // Ejector rod under the barrel
  const rod = new THREE.CylinderGeometry(.0028, .0028, .08, 16); rod.rotateZ(-Math.PI / 2); add(gun, 'ejector rod', rod, polished, [.098, .026, 0]);
  // Side plate screws
  for (const [x, y] of [[-.050, .030], [-.020, .002], [.050, .015]]) for (const z of [-1, 1]) { const s = new THREE.CylinderGeometry(.0026, .0026, .0012, 20); s.rotateX(Math.PI / 2); add(gun, 'screw', s, polished, [x, y, z * .0128]); }

  // Fluted cylinder with six through-bored chambers (extruded along the barrel axis)
  const cs = new THREE.Shape(); const R = .0278, flutes = 6;
  for (let i = 0; i <= 240; i++) { const a = i / 240 * Math.PI * 2; let r = R;
    for (let k = 0; k < flutes; k++) { const fa = (k + .5) * Math.PI / 3; let d = Math.atan2(Math.sin(a - fa), Math.cos(a - fa)); r -= .0032 * Math.max(0, 1 - (d / .26) ** 2); }
    const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? cs.lineTo(x, y) : cs.moveTo(x, y); }
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const h = new THREE.Path(); h.absarc(Math.cos(a) * .0175, Math.sin(a) * .0175, .0047, 0, Math.PI * 2, true); cs.holes.push(h); }
  const cg = new THREE.ExtrudeGeometry(cs, { depth: .068, bevelEnabled: true, bevelThickness: .0015, bevelSize: .0012, bevelSegments: 3, curveSegments: 24 });
  cg.translate(0, 0, -.034); cg.rotateY(Math.PI / 2); cg.computeVertexNormals();
  const body = add(cyl, 'fluted cylinder', cg, cylSteel); body.rotation.x = Math.PI / 2;   // chamber at the top lines up with the bore
  // the original flutes sit between chambers: rotate shape so a chamber points +Y
  body.rotation.x = 0; body.rotation.x = Math.PI / 2;
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const y = Math.cos(a) * .0175, z = Math.sin(a) * .0175;
    const rim = new THREE.CylinderGeometry(.0052, .0052, .0018, 24); rim.rotateZ(-Math.PI / 2); add(cyl, 'cartridge rim', rim, brass, [-.0345, y, z]);
    const primer = new THREE.CylinderGeometry(.0016, .0016, .0008, 16); primer.rotateZ(-Math.PI / 2); add(cyl, 'primer', primer, polished, [-.0357, y, z]); }
  const hub = new THREE.CylinderGeometry(.0055, .0055, .074, 20); hub.rotateZ(-Math.PI / 2); add(cyl, 'cylinder axle', hub, polished);

  // Hammer with a checkered spur; curved trigger; guard
  const hs = new THREE.Shape(); hs.moveTo(-.006, -.006); hs.lineTo(.003, -.004); hs.lineTo(.004, .014); hs.quadraticCurveTo(-.004, .022, -.012, .028);
  hs.quadraticCurveTo(-.022, .030, -.024, .024); hs.quadraticCurveTo(-.016, .016, -.010, .006); hs.closePath();
  add(hammer, 'hammer', extrudeXY(hs, .007, .0008), blued);
  for (let i = 0; i < 4; i++) add(hammer, 'spur line', new THREE.BoxGeometry(.0007, .004, .0075), black, [-.012 - i * .0026, .0262 - i * .0006, 0]).rotation.z = .5;
  const ts = new THREE.Shape(); ts.moveTo(-.002, .001); ts.quadraticCurveTo(.010, -.010, .002, -.026); ts.lineTo(-.002, -.025); ts.quadraticCurveTo(.004, -.010, -.006, .000); ts.closePath();
  add(trigger, 'trigger', extrudeXY(ts, .005, .0007), polished);
  const guard = new THREE.TorusGeometry(.0195, .0026, 14, 48, Math.PI * 1.25); guard.scale(1.15, .95, 1); guard.rotateZ(Math.PI * .95); add(gun, 'trigger guard', guard, blued, [-.016, -.022, 0]);
  gun.userData.detailed = true; return true;
}

/* ------------------------------------------------------------------ */
/* Film pipeline: HDR scene → bloom → DoF/grade/grain + game effects   */
/* ------------------------------------------------------------------ */
const quadVS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
export const filmFragment = `
  uniform sampler2D tex; uniform sampler2D depth; uniform sampler2D bloom;
  uniform float useDepth, bloomStrength, time, near, far, aperture, exposure;
  uniform float triggerDarkening, heartbeatPulse, forcedContact, hoodCovered, hoodLift, hoodDrop, focusBlur, glare, squint;
  uniform vec2 res; varying vec2 vUv;
  float lin(float d){ float z = d*2.-1.; return 2.*near*far/(far+near-z*(far-near)); }
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time*7.1) * 43758.5453); }
  vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
  void main(){
    vec2 px = 1./res;
    // Autofocus on what the player is looking at (screen centre), so faces and tells stay sharp.
    float focus = (lin(texture2D(depth,vec2(.5,.5)).r) + lin(texture2D(depth,vec2(.46,.5)).r) + lin(texture2D(depth,vec2(.54,.5)).r)
                 + lin(texture2D(depth,vec2(.5,.45)).r) + lin(texture2D(depth,vec2(.5,.56)).r)) / 5.;
    focus = clamp(focus, .3, 1.9);   // never focus past the table: faces stay readable
    float d = lin(texture2D(depth, vUv).r);
    float coc = useDepth * clamp(abs(d - focus)/max(d,.05) * aperture * .6, 0., 1.) * 4.;
    coc *= smoothstep(.85, 1.15, d);  // your hands and the cards on your side of the table are always sharp
    coc += focusBlur * 9. + hoodCovered * 10. + forcedContact * (1. - smoothstep(0., .12, vUv.x)) * 3.;
    vec2 off = vUv - .5; float ca = dot(off,off) * .006;
    vec3 c = vec3(texture2D(tex, vUv + off*ca).r, texture2D(tex, vUv).g, texture2D(tex, vUv - off*ca).b);
    if (coc > .6) { vec3 acc = c; float wsum = 1.;
      for (int i = 0; i < 16; i++) { float a = float(i)*2.39996; float r = sqrt(float(i)+.5)/4.; vec2 o = vec2(cos(a),sin(a))*r*coc*px*2.;
        float w = 1.; if (useDepth > .5) { float dd = lin(texture2D(depth, vUv+o).r); w = dd > d - .2 ? 1. : .3; }
        acc += texture2D(tex, vUv+o).rgb*w; wsum += w; }
      c = acc/wsum; }
    c += texture2D(bloom, vUv).rgb * bloomStrength;
    c *= exposure;
    c = aces(c);
    float l = dot(c, vec3(.299,.587,.114));
    c = mix(c, c*vec3(.86,1.0,1.04) + vec3(0.,.008,.012), 1.-smoothstep(.0,.45,l));   // teal shadows
    c = mix(c, c*vec3(1.07,1.0,.88), smoothstep(.35,1.,l));                            // warm highlights
    c = mix(vec3(l), c, .9);
    vec2 uv = off * vec2(1.12, 1.);
    float v = mix(.18, 1., 1. - smoothstep(.28, .95, length(off*vec2(1.15,1.))));
    v *= 1. - smoothstep(.03, .72, length(uv)) * triggerDarkening * (.30 + heartbeatPulse * .12);
    v *= 1. - smoothstep(.10, .66, length(uv)) * squint;
    c *= v;
    c = pow(max(c, vec3(0.)), vec3(1./2.2));
    c += vec3(1.3, 1.2, 1.03) * glare * .85;
    c += (h(gl_FragCoord.xy) - .5) * .045;
    // Burlap hood over the eyes (same behaviour as the classic mode).
    float breath = sin(time * 1.65) * .009 + sin(time * .83) * .004;
    vec2 clothUV = (vUv - .5) * (1. + breath) + .5;
    clothUV.y += hoodLift * .95; clothUV.x += sin(vUv.y * 8.) * hoodLift * .035;
    vec2 weave = fract(clothUV * vec2(112., 78.));
    float gap = smoothstep(.36, .47, weave.x) * (1. - smoothstep(.53, .64, weave.x));
    gap *= smoothstep(.32, .45, weave.y) * (1. - smoothstep(.55, .68, weave.y));
    float strands = .72 + sin(clothUV.x * 704.) * .12 + cos(clothUV.y * 490.) * .10;
    vec3 cloth = vec3(.021, .017, .011) * strands + min(c, vec3(1.)) * (.007 + gap * .11);
    float lifted = hoodLift < .001 ? 1. : smoothstep(hoodLift - .035, hoodLift + .035, vUv.y);
    float dropped = hoodDrop > .999 ? 1. : hoodDrop < .001 ? 0. : smoothstep(1. - hoodDrop - .035, 1. - hoodDrop + .035, vUv.y);
    c = mix(c, cloth, hoodCovered * lifted * dropped);
    gl_FragColor = vec4(max(c, vec3(0.)), 1.);
  }`;

export const FILM_EFFECT_UNIFORMS = ['time', 'triggerDarkening', 'heartbeatPulse', 'forcedContact', 'hoodCovered', 'hoodLift', 'hoodDrop', 'focusBlur', 'glare', 'squint'] as const;

export class FilmPipeline {
  scene: THREE.WebGLRenderTarget; bright: THREE.WebGLRenderTarget; blurA: THREE.WebGLRenderTarget; blurB: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh; private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); private qs = new THREE.Scene();
  private brightMat: THREE.ShaderMaterial; private blurMat: THREE.ShaderMaterial; finalMat: THREE.ShaderMaterial;
  constructor(public renderer: THREE.WebGLRenderer, width = 1280, height = 720) {
    const depth = new THREE.DepthTexture(width, height); depth.type = THREE.UnsignedIntType;
    this.scene = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4, depthTexture: depth });
    const bw = Math.max(1, Math.round(width / 4)), bh = Math.max(1, Math.round(height / 4));
    this.bright = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
    this.blurA = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
    this.blurB = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
    this.brightMat = new THREE.ShaderMaterial({ uniforms: { tex: { value: null } }, vertexShader: quadVS, depthTest: false, depthWrite: false,
      fragmentShader: 'uniform sampler2D tex; varying vec2 vUv; void main(){ vec3 c = texture2D(tex,vUv).rgb; float l = dot(c, vec3(.2126,.7152,.0722)); gl_FragColor = vec4(c*smoothstep(1.4,3.5,l),1.); }' });
    this.blurMat = new THREE.ShaderMaterial({ uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: quadVS, depthTest: false, depthWrite: false,
      fragmentShader: 'uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 s = texture2D(tex,vUv).rgb*.227; s += (texture2D(tex,vUv+dir*1.38).rgb + texture2D(tex,vUv-dir*1.38).rgb)*.316; s += (texture2D(tex,vUv+dir*3.23).rgb + texture2D(tex,vUv-dir*3.23).rgb)*.070; gl_FragColor=vec4(s,1.); }' });
    this.finalMat = new THREE.ShaderMaterial({ vertexShader: quadVS, fragmentShader: filmFragment, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { tex: { value: null }, depth: { value: depth }, bloom: { value: null }, useDepth: { value: 1 }, bloomStrength: { value: .9 }, time: { value: 0 },
        near: { value: .055 }, far: { value: 28 }, aperture: { value: .7 }, exposure: { value: 1.25 }, res: { value: new THREE.Vector2(width, height) },
        triggerDarkening: { value: 0 }, heartbeatPulse: { value: 0 }, forcedContact: { value: 0 }, hoodCovered: { value: 0 }, hoodLift: { value: 0 }, hoodDrop: { value: 1 },
        focusBlur: { value: 0 }, glare: { value: 0 }, squint: { value: 0 } } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.brightMat); this.qs.add(this.quad);
  }
  setSize(width: number, height: number) {
    width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
    this.scene.setSize(width, height);
    const bw = Math.max(1, Math.round(width / 4)), bh = Math.max(1, Math.round(height / 4));
    this.bright.setSize(bw, bh); this.blurA.setSize(bw, bh); this.blurB.setSize(bw, bh);
    (this.finalMat.uniforms.res.value as THREE.Vector2).set(width, height);
  }
  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.qs, this.cam); }
  /** Renders the world into the HDR target (call once per frame, before present). */
  renderScene(world: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer.setRenderTarget(this.scene); this.renderer.render(world, camera);
    this.brightMat.uniforms.tex.value = this.scene.texture; this.pass(this.brightMat, this.bright);
    let src = this.bright;
    for (let i = 0; i < 3; i++) {
      this.blurMat.uniforms.tex.value = src.texture; (this.blurMat.uniforms.dir.value as THREE.Vector2).set((1 + i) / this.bright.width, 0); this.pass(this.blurMat, this.blurA);
      this.blurMat.uniforms.tex.value = this.blurA.texture; (this.blurMat.uniforms.dir.value as THREE.Vector2).set(0, (1 + i) / this.bright.height); this.pass(this.blurMat, this.blurB);
      src = this.blurB;
    }
    const u = this.finalMat.uniforms; u.near.value = camera.near; u.far.value = camera.far;
  }
  /** Presents to the screen. `override` shows another texture (a monitor feed) through the same film look. */
  present(override: THREE.Texture | null = null) {
    const u = this.finalMat.uniforms;
    u.tex.value = override ?? this.scene.texture; u.bloom.value = this.blurB.texture;
    u.useDepth.value = override ? 0 : 1; u.bloomStrength.value = override ? 0 : .9;
    this.pass(this.finalMat, null);
  }
  dispose() {
    for (const t of [this.scene, this.bright, this.blurA, this.blurB]) t.dispose();
    this.scene.depthTexture?.dispose(); this.quad.geometry.dispose();
    this.brightMat.dispose(); this.blurMat.dispose(); this.finalMat.dispose();
  }
}

/** One call that turns a built bunker into the cinematic version. */
export function applyCinematicLook(world: THREE.Scene, renderer: THREE.WebGLRenderer | null) {
  upgradeMaterials(world);
  upgradeRevolver(world, renderer); detailRevolver(world);
  const shaft = addLightShaft(world);
  world.fog = new THREE.FogExp2('#07090a', .12); world.background = new THREE.Color('#030404');
  const ambient = world.getObjectByName('ambient-room-light') as THREE.HemisphereLight | undefined; if (ambient) ambient.intensity = .06;
  const haze = world.getObjectByName('lamp-haze'); if (haze) haze.visible = false;
  world.traverse(object => {
    const light = object as THREE.PointLight;
    if (light.isPointLight && light.castShadow && !light.userData.cinematic) {
      light.userData.cinematic = true; light.intensity *= 1.6; light.shadow.mapSize.set(2048, 2048); light.shadow.radius = 4;
    }
  });
  const fx = new GunshotFX(world);
  return { shaft, fx };
}
