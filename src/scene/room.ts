import * as THREE from 'three';
import { mergeStaticMeshes } from './merge';
import type { GamePhase } from '../game';
import { createTensionRandom, type RoundEvent } from '../tension';
import { cinematicProgress, type CinematicState } from '../cinematics';
import { shotSequenceActive, type AmbientEvent, type DistantShot } from '../roomLife';

export function guardDoorProgress(cinematic: CinematicState | null | undefined, now = Date.now()): number {
  if (!cinematic) return 0;
  const stage = cinematic.stage, progress = cinematicProgress(cinematic, now);
  if (stage === 'door-open' || stage === 'guards-enter') return Math.min(1, progress * 1.5);
  if (stage === 'guard-exit') return 1 - THREE.MathUtils.smoothstep(progress, .6, 1);
  if (cinematic.mode === 'transfer') return stage === 'door' ? 1 - progress : ['transfer-hood', 'lift', 'dragging'].includes(stage) ? 1 : 0;
  return ['guard-approach', 'player-unhood', 'player-focus', 'opponent-unhood'].includes(stage) ? 1 : 0;
}

/** Presentation rejects a stale event as soon as play leaves the decision phase. */
export function decisionEvent(phase: GamePhase, event: RoundEvent | null | undefined, now = Date.now()): RoundEvent | null {
  if (phase !== 'PLAYER_DECISION' && phase !== 'PLAYER_PEEKING' || !event || now < event.startedAt || now >= event.startedAt + event.duration) return null;
  return event;
}

/** Deterministic texture noise never consumes the game's random source. */
function randomGenerator(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

function texture(kind: 'concrete' | 'floor' | 'wood' | 'felt' | 'cardboard'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const random = randomGenerator(kind.length * 343 + 19);
  const base = { concrete: [73, 77, 65], floor: [46, 47, 37], wood: [77, 50, 31], felt: [35, 65, 45], cardboard: [106, 92, 60] }[kind];
  const pixels = ctx.createImageData(256, 256);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const variation = (random() - .5) * (kind === 'felt' ? 22 : 40);
    for (let c = 0; c < 3; c++) pixels.data[i + c] = base[c] + variation;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  if (kind === 'concrete' || kind === 'floor') {
    for (let i = 0; i < 43; i++) {
      const x = random() * 256, y = random() * 256, r = 4 + random() * 42;
      const stain = ctx.createRadialGradient(x, y, 1, x, y, r);
      stain.addColorStop(0, `rgba(12,19,10,${.1 + random() * .23})`); stain.addColorStop(1, 'rgba(12,19,10,0)');
      ctx.fillStyle = stain; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.strokeStyle = '#181e1766'; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      let x = random() * 256, y = random() * 256;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 7; j++) { x += (random() - .5) * 25; y += random() * 22; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    if (kind === 'concrete') {
      ctx.fillStyle = '#0c160e16';
      for (let i = 0; i < 23; i++) ctx.fillRect(random() * 256, 0, 1 + random() * 9, 50 + random() * 205);
      ctx.strokeStyle = '#151b1644'; ctx.strokeRect(0, 0, 255, 255);
    }
  } else if (kind === 'wood') {
    for (let i = 0; i < 180; i++) {
      ctx.strokeStyle = random() > .5 ? '#ab784b22' : '#080a0955'; ctx.lineWidth = random() * 2;
      ctx.beginPath(); const y = random() * 256; ctx.moveTo(0, y); ctx.bezierCurveTo(80, y - 8, 180, y + 4, 256, y - 3); ctx.stroke();
    }
    ctx.strokeStyle = '#c7a06c55';
    for (let i = 0; i < 20; i++) { const x = random() * 256, y = random() * 256; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3 + random() * 28, y - random() * 8); ctx.stroke(); }
  } else if (kind === 'felt') {
    ctx.strokeStyle = '#c6c39a18';
    for (let i = 0; i < 25; i++) { const x = random() * 256, y = random() * 256; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 23, y - random() * 7); ctx.stroke(); }
    for (let i = 0; i < 9; i++) {
      const x = random() * 256, y = random() * 256;
      ctx.fillStyle = '#12180eaa'; ctx.beginPath(); ctx.ellipse(x, y, 1.4 + random() * 2, 1.1 + random() * 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a6f3766'; ctx.stroke();
    }
    const stain = ctx.createRadialGradient(207, 80, 9, 207, 80, 26);
    stain.addColorStop(0, '#101b0b00'); stain.addColorStop(.7, '#101b0b33'); stain.addColorStop(.76, '#1a20095a'); stain.addColorStop(.9, '#101b0b00');
    ctx.fillStyle = stain; ctx.fillRect(170, 40, 75, 80);
  } else {
    ctx.fillStyle = '#baa97a33'; ctx.fillRect(109, 0, 28, 256);
    ctx.strokeStyle = '#211f1755'; ctx.strokeRect(16, 153, 53, 50);
    ctx.fillStyle = '#302d2266'; ctx.font = 'bold 12px monospace'; ctx.fillText('FRAGILE', 12, 148);
    ctx.font = '10px monospace'; ctx.fillText('↑ ↑', 28, 184);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  return map;
}

export type RoomCampaign = {
  roomNumber?: 1 | 2 | 3;
  phase?: GamePhase;
  storyStage?: string;
  stageElapsed?: number;
  cinematic?: CinematicState | null;
  distantShot?: DistantShot | null;
  ambientEvent?: AmbientEvent | null;
};

/** The exit sequence waits at the table while the Host finishes announcing it. */
export function isExitStage(phase?: string, stage?: string): boolean {
  return phase === 'ENDING_WIN' && ['door', 'stairs', 'viewers', 'title'].includes(stage ?? '');
}

export type BunkerRoom = {
  lamp: THREE.Group;
  bulbLight: THREE.PointLight;
  update: (time: number, delta: number, danger: boolean, suspense: boolean, impulse: number, event?: RoundEvent | null, now?: number, campaign?: RoomCampaign) => void;
  reset: () => void;
  dispose: () => void;
};

export function createRoom(scene: THREE.Scene): BunkerRoom {
  const root = new THREE.Group(); root.name = 'procedural-bunker'; scene.add(root);
  scene.fog ??= new THREE.FogExp2(0x080d0b, .135);
  const concreteMap = texture('concrete'), floorMap = texture('floor'), feltMap = texture('felt'), woodMap = texture('wood'), boxMap = texture('cardboard');
  concreteMap.repeat.set(4, 2); floorMap.repeat.set(4, 4);
  // Reuse identical materials so the static batching pass can combine matching props.
  const materialCache = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: THREE.ColorRepresentation, options: THREE.MeshStandardMaterialParameters = {}) => {
    const key = JSON.stringify([
      new THREE.Color(color).getHex(), options.roughness ?? .96, options.metalness ?? 0,
      options.map?.id ?? null, options.side ?? THREE.FrontSide, options.flatShading ?? true,
      options.transparent ?? false, options.opacity ?? 1,
    ]);
    let material = materialCache.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: .96, metalness: 0, flatShading: true, ...options });
      materialCache.set(key, material);
    }
    return material;
  };
  const concrete = mat(0xaaa99a, { map: concreteMap });
  const floor = mat(0x8a8977, { map: floorMap });
  const metal = mat(0x30392f, { metalness: .45, roughness: .85 });
  const rust = mat(0x544533, { metalness: .32 });
  const darkMetal = mat(0x171f1b, { metalness: .4 });
  const wood = mat(0xb49a77, { map: woodMap });
  const felt = mat(0xb5ba93, { map: feltMap });
  const cardboard = mat(0xc0b089, { map: boxMap });
  const black = mat(0x111914);
  const box = (width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Group | THREE.Scene = root, shadow = false) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z); mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const between = (a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material, parent: THREE.Group = root) => {
    const direction = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 6), material);
    mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); parent.add(mesh); return mesh;
  };

  // The envelope is deliberately close: the black fog consumes its corners.
  box(9, .2, 9, floor, 0, -.1, 0);
  box(9, 3.9, .18, concrete, 0, 1.85, -4.25);
  box(.18, 3.9, 8.6, concrete, -4.4, 1.85, 0);
  box(.18, 3.9, 8.6, concrete, 4.4, 1.85, 0);
  box(9, .16, 9, mat(0x151e17), 0, 3.83, 0);
  for (const x of [-4.2, -1.9, 1.9, 4.2]) box(.16, .22, 8.5, darkMetal, x, 3.66, 0);
  box(8.8, .16, .13, darkMetal, 0, .1, -4.12);
  for (const x of [-4.25, 4.25]) box(.13, .16, 8.5, darkMetal, x, .1, 0);
  // Rough horizontal pour seams and old wall formwork marks.
  const seam = mat(0x333d2f);
  for (const y of [.65, 1.9, 3.12]) box(8.7, .025, .012, seam, 0, y, -4.147);
  for (const x of [-3.05, -.65, 1.55]) {
    box(.019, 3.3, .012, seam, x, 1.65, -4.145);
    for (const y of [.5, 1.55, 2.7]) { const bolt = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .018, 6), metal); bolt.rotation.x = Math.PI / 2; bolt.position.set(x + .18, y, -4.13); root.add(bolt); }
  }

  // A broad fourteen-sided wooden table, with layered worn rails and taut dirty felt.
  const table = new THREE.Group(); table.name = 'card-table'; root.add(table);
  const tableLayer = (radiusX: number, radiusZ: number, height: number, y: number, material: THREE.Material) => {
    const geometry = new THREE.CylinderGeometry(1, 1, height, 16);
    geometry.rotateY(Math.PI / 16);
    const vertices = geometry.attributes.position;
    for (let index=0;index<vertices.count;index++) if (vertices.getZ(index)>0) vertices.setZ(index,vertices.getZ(index)*.74);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(radiusX, 1, radiusZ); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; table.add(mesh); return mesh;
  };
  // A thin front rail and open steel support leave a real sight line to the
  // captive's knees/shoes. Opaque felt and the original materials stay intact.
  tableLayer(1.8, 1.34, .035, .850, wood);
  tableLayer(1.77, 1.31, .035, .85, mat(0x5c4c35));
  tableLayer(1.69, 1.23, .025, .874, felt);
  const railPoints = Array.from({length:32},(_,i)=> {
    const angle=i/32*Math.PI*2,z=Math.sin(angle)*1.29;
    return new THREE.Vector3(Math.cos(angle)*1.75,.66,z>0?z*.74:z);
  });
  const underFrame = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPoints,true),32,.022,4,true),darkMetal);
  table.add(underFrame);
  for (const x of [-1.2, 1.2]) for (const z of [-.85, .85]) {
    const leg = box(.1, .68, .1, darkMetal, x, .33, z, table, true); leg.rotation.z = x > 0 ? -.055 : .055;
  }
  box(2.4, .06, .05, metal, 0, .29, -.85, table);
  box(2.4, .06, .05, metal, 0, .29, .85, table);
  // A few raised surface scars and tiny ash flecks catch the bulb's harsh light.
  const scuff = mat(0x879067), burn = mat(0x141d11);
  for (const [x, z, angle] of [[1.25, .44, .3], [-1.12, -.48, -.4], [.91, -.82, .6], [-.6, .98, .2]]) {
    const scar = box(.15, .0015, .003, scuff, x, .889, z, table); scar.rotation.y = angle;
  }
  for (const [x, z] of [[-1.24, .57], [1.31, -.19], [.75, -1.0]]) {
    const mark = new THREE.Mesh(new THREE.CircleGeometry(.025, 8), burn); mark.rotation.x = -Math.PI / 2; mark.position.set(x, .8905, z); table.add(mark);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.025, .032, 8), mat(0x65582e)); ring.rotation.x = -Math.PI / 2; ring.position.copy(mark.position); table.add(ring);
  }

  // Stranger's plain wooden chair: original angular joinery, without a recognizable costume motif.
  const chair = new THREE.Group(); chair.position.set(0, 0, -1.75); root.add(chair);
  box(.76, .11, .68, wood, 0, .56, 0, chair, true);
  for (const x of [-.3, .3]) {
    box(.06, 1.35, .065, darkMetal, x, .74, -.26, chair, true);
    box(.065, .55, .065, darkMetal, x, .27, .25, chair, true);
  }
  for (const y of [1.01, 1.22, 1.43]) box(.66, .12, .06, mat(0x2b3326, { map: woodMap }), 0, y, -.27, chair, true);

  // Back door, small hand-painted maintenance marks, and one failing emergency lamp.
  const door = new THREE.Group(); door.position.set(2.7, 0, -4.105); root.add(door);
  const doorHinge = new THREE.Group(); doorHinge.name = 'exit-door-hinge'; doorHinge.position.x = .675; door.add(doorHinge);
  const doorPanel = new THREE.Group(); doorPanel.position.x = -.675; doorHinge.add(doorPanel);
  box(1.35, 2.57, .12, darkMetal, 0, 1.285, 0, doorPanel);
  box(1.18, 2.43, .06, mat(0x3c453a, { metalness: .35 }), 0, 1.26, .09, doorPanel);
  for (const y of [.34, 1.05, 1.86, 2.27]) box(1.1, .035, .035, metal, 0, y, .139, doorPanel);
  box(.07, .27, .11, metal, -.4, 1.19, .2, doorPanel);
  const doorHandle = box(.23, .05, .07, rust, -.33, 1.27, .27, doorPanel); doorHandle.name = 'door-handle';
  const slot = box(.48, .11, .018, black, 0, 1.99, .151, doorPanel); slot.name = 'guard-window-slot';
  const guardEyes = new THREE.Group(); guardEyes.name = 'guard-window-eyes'; guardEyes.position.set(0, 1.99, .168); guardEyes.visible = false; doorPanel.add(guardEyes);
  for (const x of [-.068, .068]) box(.045, .020, .008, new THREE.MeshBasicMaterial({ color: 0xb5c0a3 }), x, 0, 0, guardEyes);
  for (const y of [.35, 1.3, 2.2]) box(.13, .15, .08, metal, .59, y, .14, doorPanel);
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 2.52), new THREE.MeshBasicMaterial({ color: 0x030504 }));
  doorway.name = 'exit-doorway'; doorway.position.set(0, 1.26, .08); doorway.visible = false; door.add(doorway);
  box(.56, .14, .1, darkMetal, 0, 2.89, .08, door);
  box(.44, .085, .06, new THREE.MeshBasicMaterial({ color: 0x9c2920 }), 0, 2.89, .145, door);
  const emergency = new THREE.PointLight(0xd53d22, 1.35, 3.1, 2); emergency.name = 'emergency-light'; emergency.position.set(2.7, 2.9, -3.8); root.add(emergency);

  // Exposed oxidized pipe runs and loose electrical cables sag beneath the ceiling.
  between(new THREE.Vector3(-4.08, 2.98, -3.9), new THREE.Vector3(3.9, 2.98, -3.9), .066, rust);
  between(new THREE.Vector3(-4.08, 2.98, -3.9), new THREE.Vector3(-4.08, .16, -3.9), .066, rust);
  between(new THREE.Vector3(-4.08, 2.76, -3.88), new THREE.Vector3(1.4, 2.76, -3.88), .038, metal);
  between(new THREE.Vector3(-4.1, 3.2, -3.7), new THREE.Vector3(-4.1, 3.2, 2.8), .056, rust);
  for (const x of [-3.3, -1.7, .4, 2.5]) {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(.083, .083, .11, 8), darkMetal); collar.rotation.z = Math.PI / 2; collar.position.set(x, 2.98, -3.9); root.add(collar);
    box(.1, .25, .065, darkMetal, x, 3.02, -4.05);
  }
  const valve = new THREE.Mesh(new THREE.TorusGeometry(.15, .02, 5, 8), mat(0x642d21)); valve.position.set(-3.17, 2.98, -3.78); root.add(valve);
  box(.3, .025, .02, rust, -3.17, 2.98, -3.78); box(.025, .3, .02, rust, -3.17, 2.98, -3.78);
  const cablePaths = [
    [new THREE.Vector3(-4.2, 3.55, -2.2), new THREE.Vector3(-2.6, 3.32, -2), new THREE.Vector3(-1.2, 3.42, -1.1), new THREE.Vector3(0, 3.72, 0)],
    [new THREE.Vector3(4.18, 3.47, -3.7), new THREE.Vector3(1.7, 3.22, -3.5), new THREE.Vector3(-1.4, 3.4, -3.55), new THREE.Vector3(-4.1, 3.52, -2.5)],
    [new THREE.Vector3(3.8, 3.5, -.7), new THREE.Vector3(4.1, 2.3, -.9), new THREE.Vector3(4.14, .2, -.5)],
  ];
  for (const points of cablePaths) { const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, .013, 4, false), black); root.add(cable); }

  // A battered speaker, two CRTs with generated static, and rough metal storage shelves.
  const speaker = new THREE.Group(); speaker.position.set(-3.03, 0, -2.25); speaker.rotation.y = .15; root.add(speaker);
  box(.94, 1.28, .69, mat(0x282c23, { map: woodMap }), 0, .64, 0, speaker, true);
  box(.86, 1.18, .025, darkMetal, 0, .64, .365, speaker);
  for (const [y, radius] of [[.4, .27], [.99, .15]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, .045, 12), mat(0x343c2d)); cone.rotation.x = Math.PI / 2; cone.position.set(0, y, .38); speaker.add(cone);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, .025, 4, 12), black); rim.position.set(0, y, .405); speaker.add(rim);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(radius * .27, 6, 4), mat(0x151e17)); cap.scale.z = .2; cap.position.set(0, y, .415); speaker.add(cap);
  }
  for (const x of [-.37, .37]) for (const y of [.12, 1.15]) box(.07, .08, .035, metal, x, y, .39, speaker);

  const staticCanvas = document.createElement('canvas'); staticCanvas.width = 64; staticCanvas.height = 48;
  const staticContext = staticCanvas.getContext('2d')!, staticPixels = staticContext.createImageData(64, 48);
  const staticTexture = new THREE.CanvasTexture(staticCanvas); staticTexture.magFilter = THREE.NearestFilter; staticTexture.minFilter = THREE.NearestFilter; staticTexture.colorSpace = THREE.SRGBColorSpace;
  const staticMaterial = new THREE.MeshBasicMaterial({ map: staticTexture, color: 0x7c9990, toneMapped: false });
  const tvScreens: THREE.Mesh[] = [], tvGlows: THREE.PointLight[] = [];
  const createTV = (x: number, y: number, z: number, yaw: number, scale: number) => {
    const tv = new THREE.Group(); tv.position.set(x, y, z); tv.rotation.y = yaw; tv.scale.setScalar(scale); root.add(tv);
    box(.83, .67, .68, mat(0x525445, { metalness: .05 }), 0, .34, 0, tv, true);
    box(.89, .59, .085, mat(0x1b251f), 0, .36, .36, tv);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.64, .43), staticMaterial); screen.position.set(-.045, .38, .408); tv.add(screen); tvScreens.push(screen);
    box(.035, .19, .019, metal, .37, .36, .42, tv);
    for (const dy of [.12, .23]) { const knob = new THREE.Mesh(new THREE.CylinderGeometry(.026, .026, .024, 6), darkMetal); knob.rotation.x = Math.PI / 2; knob.position.set(.37, dy, .427); tv.add(knob); }
    box(.57, .036, .5, darkMetal, 0, -.02, 0, tv);
    const glow = new THREE.PointLight(0x87b0a7, 1.45 * scale, 3.2, 2); glow.position.set(0, .4, .65); tv.add(glow); tvGlows.push(glow);
    between(new THREE.Vector3(-.16, .68, -.06), new THREE.Vector3(-.38, 1.04, -.2), .006, metal, tv);
    between(new THREE.Vector3(.16, .68, -.06), new THREE.Vector3(.37, .99, -.1), .006, metal, tv);
  };
  createTV(-3.03, 1.3, -2.25, .2, 1);
  createTV(3.18, .22, -.36, -.55, .8);
  // Use the existing CRT visible from the seated view so the event can be read.
  const watchedScreen = tvScreens[0], watchedGlow = tvGlows[0];
  watchedScreen.name = 'watched-crt-screen'; watchedGlow.name = 'watched-crt-glow';
  const watchedGlowRest = watchedGlow.intensity;
  const eventCanvas = document.createElement('canvas'); eventCanvas.width = 64; eventCanvas.height = 48;
  const eventContext = eventCanvas.getContext('2d')!, eventPixels = eventContext.createImageData(64, 48);
  const eventTexture = new THREE.CanvasTexture(eventCanvas);
  eventTexture.magFilter = eventTexture.minFilter = THREE.NearestFilter; eventTexture.colorSpace = THREE.SRGBColorSpace;
  const eventMaterial = new THREE.MeshBasicMaterial({ map: eventTexture, color: 0xb4d5ba, toneMapped: false });

  const shelves = new THREE.Group(); shelves.position.set(3.62, 0, -2.25); shelves.rotation.y = -.16; root.add(shelves);
  for (const x of [-.58, .58]) for (const z of [-.32, .32]) box(.045, 2.27, .045, metal, x, 1.13, z, shelves);
  for (const y of [.18, .85, 1.53, 2.18]) box(1.25, .055, .72, metal, 0, y, 0, shelves, true);
  const cartons = [ [-.29, .48, .03, .48, .53, .46], [.31, .39, .03, .47, .35, .47], [-.26, 1.09, -.02, .56, .41, .52], [.35, 1.08, -.02, .4, .4, .45], [.09, 1.82, .01, .67, .52, .51] ];
  for (const [x, y, z, w, h, d] of cartons) { const carton = box(w, h, d, cardboard, x, y, z, shelves, true); carton.rotation.y = (x + y) * .12; }
  box(.29, .17, .25, mat(0x6d6551), -.32, 2.29, .02, shelves);
  const tin = new THREE.Mesh(new THREE.CylinderGeometry(.1, .09, .24, 8), rust); tin.position.set(.35, 2.32, .04); shelves.add(tin);

  const brokenChair = new THREE.Group(); brokenChair.position.set(-2.66, 0, .32); brokenChair.rotation.y = .65; root.add(brokenChair);
  box(.6, .08, .61, wood, 0, .47, 0, brokenChair, true);
  for (const [x, z] of [[-.24, -.24], [.24, -.24], [.24, .24]]) box(.06, .47, .06, darkMetal, x, .24, z, brokenChair, true);
  for (const x of [-.25, .25]) box(.055, .62, .06, darkMetal, x, .8, -.26, brokenChair);
  box(.56, .2, .05, wood, 0, 1.06, -.26, brokenChair);
  const brokenSlat = box(.55, .09, .045, wood, -.24, .075, .63, brokenChair); brokenSlat.rotation.y = .52; brokenSlat.rotation.z = .09;
  const fallenLeg = box(.06, .04, .43, metal, -.51, .03, .12, brokenChair); fallenLeg.rotation.y = .7;
  // Unlabelled discarded crates and one original battered ashtray.
  const crate = box(.7, .42, .61, mat(0x5b5540, { map: woodMap }), -3.42, .22, .6); crate.rotation.y = -.17;
  for (const y of [.08, .23, .38]) box(.73, .02, .018, darkMetal, -3.42, y, .92);
  const ashtray = new THREE.Mesh(new THREE.CylinderGeometry(.095, .08, .025, 8), mat(0x4f5446, { metalness: .5 })); ashtray.position.set(-1.19, .909, -.35); root.add(ashtray);
  const ash = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .002, 8), mat(0x171d14)); ash.position.set(-1.19, .923, -.35); root.add(ash);
  const cigarette = box(.075, .008, .011, mat(0xb3aa7c), -1.16, .93, -.33); cigarette.rotation.y = .5;

  // Hanging fixture pivots at the ceiling: the bulb and its light swing as one.
  const lamp = new THREE.Group(); lamp.name = 'hanging-bulb'; lamp.position.set(0, 3.77, .02); root.add(lamp);
  between(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -.98, 0), .012, black, lamp);
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(.063, .057, .12, 8), metal); socket.position.y = -.99; lamp.add(socket);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(.245, .19, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x30372b, side: THREE.DoubleSide, roughness: .7, metalness: .45, flatShading: true })); shade.position.y = -.98; lamp.add(shade);
  const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffdfb0, toneMapped: false });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.085, 8, 5), bulbMaterial); bulb.name = 'lamp-bulb'; bulb.position.y = -1.13; bulb.scale.y = 1.35; lamp.add(bulb);
  const filament = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .085, 4), new THREE.MeshBasicMaterial({ color: 0xfff5c5, toneMapped: false })); filament.name = 'lamp-filament'; filament.position.y = -1.11; lamp.add(filament);
  const bulbLight = new THREE.PointLight(0xffdfb0, 20, 8.5, 2); bulbLight.position.set(0, -1.19, .025); bulbLight.castShadow = true;
  bulbLight.shadow.mapSize.set(512, 512); bulbLight.shadow.bias = -.002; bulbLight.shadow.normalBias = .025; bulbLight.shadow.camera.near = .12; bulbLight.shadow.camera.far = 9; lamp.add(bulbLight);
  const ambient = new THREE.HemisphereLight(0x7d8c72, 0x151d18, .32); ambient.name = 'ambient-room-light'; root.add(ambient);
  // Faint additive cone suggests airborne dust without an expensive postprocessing pass.
  const hazeMaterial = new THREE.MeshBasicMaterial({ color: 0xd4bc82, transparent: true, opacity: .003, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const haze = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.85, 16, 1, true), hazeMaterial); haze.name = 'lamp-haze'; haze.position.set(0, 1.725, .02); root.add(haze);

  // This exit exists beyond the old back wall, hidden until the last survivor leaves.
  const stairs = new THREE.Group(); stairs.name = 'exit-stairwell'; stairs.visible = false; scene.add(stairs);
  for (let index = 0; index < 8; index++) box(1.6, .35, .68, concrete, 2.7, .175 + index * .35, -5.2 - index * .65, stairs);
  box(.12, 5.3, 6.2, darkMetal, 1.83, 2.65, -7.75, stairs);
  box(.12, 5.3, 6.2, darkMetal, 3.57, 2.65, -7.75, stairs);
  box(1.8, .11, 6.2, black, 2.7, 5.35, -7.75, stairs);
  const daylight = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 2.2), new THREE.MeshBasicMaterial({ color: 0xdce9cd, toneMapped: false }));
  daylight.name = 'stairwell-daylight'; daylight.position.set(2.7, 3.9, -10.55); stairs.add(daylight);
  box(.13, 2.38, .1, darkMetal, 1.96, 3.9, -10.45, stairs);
  box(.13, 2.38, .1, darkMetal, 3.44, 3.9, -10.45, stairs);
  box(1.62, .13, .1, darkMetal, 2.7, 5.05, -10.45, stairs);
  const exitLight = new THREE.PointLight(0xe5edc5, 32, 8, 2); exitLight.position.set(2.7, 4.2, -10.2); stairs.add(exitLight);
  const viewersCanvas = document.createElement('canvas'); viewersCanvas.width = 96; viewersCanvas.height = 72;
  const viewersContext = viewersCanvas.getContext('2d')!;
  const viewersTexture = new THREE.CanvasTexture(viewersCanvas);
  viewersTexture.minFilter = viewersTexture.magFilter = THREE.NearestFilter; viewersTexture.colorSpace = THREE.SRGBColorSpace;
  const stairMonitor = new THREE.Group(); stairMonitor.name = 'stairwell-monitor'; stairMonitor.position.set(3.18, 3.35, -8.45); stairMonitor.rotation.y = Math.PI - .3; stairs.add(stairMonitor);
  box(.68, .52, .18, darkMetal, 0, 0, 0, stairMonitor);
  const viewersScreen = new THREE.Mesh(new THREE.PlaneGeometry(.56, .41), new THREE.MeshBasicMaterial({ map: viewersTexture, color: 0xb8cdb0, toneMapped: false }));
  viewersScreen.name = 'viewers-counter'; viewersScreen.position.z = .101; stairMonitor.add(viewersScreen);
  mergeStaticMeshes(stairs, mesh => mesh !== viewersScreen);
  mergeStaticMeshes(doorPanel, mesh => mesh !== doorHandle && mesh.parent !== guardEyes);

  // Only rigid room geometry is batched. Lamp descendants must retain their
  // local transforms for swinging, and the transparent haze keeps its own pass.
  mergeStaticMeshes(root, mesh => {
    if (mesh === haze || mesh === watchedScreen || mesh === brokenSlat || mesh === fallenLeg) return false;
    for (let parent = mesh.parent; parent; parent = parent.parent) if (parent === lamp || parent === door) return false;
    return true;
  });

  const dustGeometry = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(48 * 3), dustRest = new Float32Array(48 * 3);
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({ color: 0xb3b69a, size: .018, transparent: true, opacity: .55, depthWrite: false });
  const dust = new THREE.Points(dustGeometry, dustMaterial); dust.name = 'distant-shot-dust'; dust.visible = false; scene.add(dust);
  const drip = new THREE.Mesh(new THREE.SphereGeometry(.014, 4, 3), new THREE.MeshBasicMaterial({ color: 0x8faaa2 }));
  drip.name = 'pipe-water-drop'; drip.visible = false; scene.add(drip);
  let lastDistantId = '';
  const staticRandom = randomGenerator(1553);
  let nextStatic = 0, nextFlicker = 1.7, flickerUntil = 0, swing = 0, lastImpulse = 0, nextEventStatic = 0, nextViewers = 0;
  function restoreEvent() {
    watchedScreen.material = staticMaterial; watchedGlow.intensity = watchedGlowRest;
  }
  return {
    lamp,
    bulbLight,
    reset() {
      swing = 0; lastImpulse = 0;
      lamp.rotation.set(0, 0, 0);
      bulbLight.intensity = 20; bulbMaterial.color.setHex(0xffdfb0); filament.visible = true;
      ambient.intensity = .32; hazeMaterial.opacity = .003; restoreEvent(); root.userData.event = null;
      stairs.visible = doorway.visible = false; doorHinge.rotation.y = 0; root.userData.exitOpen = false;
      bulbLight.color.setHex(0xffdfb0); ambient.color.setHex(0x7d8c72);
      tvGlows[0].intensity = 1.45; tvGlows[1].intensity = 1.45 * .8;
      brokenSlat.position.z = .63; brokenSlat.rotation.y = .52; fallenLeg.position.x = -.51; fallenLeg.rotation.y = .7;
      lastDistantId = ''; dust.visible = drip.visible = guardEyes.visible = false; doorHandle.rotation.z = 0; root.userData.distantReaction = null; root.userData.ambientEvent = null;
    },
    dispose() { eventMaterial.dispose(); eventTexture.dispose(); dustGeometry.dispose(); dustMaterial.dispose(); dust.removeFromParent(); drip.geometry.dispose(); drip.material.dispose(); drip.removeFromParent(); },
    update(time, delta, danger, suspense, impulse, event = null, now = Date.now(), campaign = {}) {
      const active = event && now >= event.startedAt && now < event.startedAt + event.duration ? event : null;
      root.userData.event = active?.kind ?? null;
      const number = campaign.roomNumber;
      const mood = number === 2 ? { bulb: 0xf77c65, intensity: 26, sky: 0x994c3b, ambient: .25, glow: .8, emergency: 1 }
        : number === 3 ? { bulb: 0xd0bc8b, intensity: 5.8, sky: 0x343d37, ambient: .035, glow: .32, emergency: .3 }
        : number === 1 ? { bulb: 0xb8cfa2, intensity: 20, sky: 0x7d8c72, ambient: .32, glow: 1, emergency: 1 }
        : { bulb: 0xffdfb0, intensity: 20, sky: 0x7d8c72, ambient: .32, glow: 1, emergency: 1 };
      root.userData.roomNumber = number ?? 1;
      bulbLight.color.setHex(mood.bulb); ambient.color.setHex(mood.sky);
      tvGlows[0].intensity = 1.45 * mood.glow; tvGlows[1].intensity = 1.45 * .8 * mood.glow;
      brokenSlat.rotation.y = number === 2 ? .18 : number === 3 ? -.3 : .52;
      brokenSlat.position.z = number === 3 ? .82 : .63;
      fallenLeg.rotation.y = number === 2 ? -.4 : number === 3 ? 1.1 : .7;
      fallenLeg.position.x = number === 3 ? -.75 : -.51;
      const exiting = isExitStage(campaign.phase, campaign.storyStage);
      const stage = campaign.storyStage ?? '', elapsed = campaign.stageElapsed ?? 0;
      const guardOpening = guardDoorProgress(campaign.cinematic, now);
      stairs.visible = exiting; doorway.visible = exiting || guardOpening > .005;
      const doorProgress = exiting ? stage === 'door' ? THREE.MathUtils.smoothstep(elapsed / 1.5, 0, 1) : 1 : 0;
      doorHinge.rotation.y = Math.max(doorProgress, guardOpening) * 1.64;
      root.userData.exitOpen = doorProgress > .98;
      root.userData.guardDoorOpen = guardOpening > .98;
      if (exiting && now >= nextViewers) {
        const progress = stage === 'viewers' ? Math.min(1, elapsed / 1.5) : stage === 'title' ? 1 : 0;
        const count = Math.floor(11980 + progress * 428);
        viewersContext.fillStyle = '#050b07'; viewersContext.fillRect(0, 0, 96, 72);
        viewersContext.fillStyle = '#bed0b3'; viewersContext.font = 'bold 10px monospace'; viewersContext.textAlign = 'center';
        viewersContext.fillText('VIEWERS:', 48, 27); viewersContext.font = 'bold 14px monospace'; viewersContext.fillText(count.toLocaleString('en-US'), 48, 48);
        viewersTexture.needsUpdate = true; viewersScreen.userData.viewers = count; nextViewers = now + 100;
      }
      const distant = campaign.distantShot;
      const distantAge = distant ? (now - distant.startedAt) / 1000 : -1;
      if (distant && distant.id !== lastDistantId) {
        lastDistantId = distant.id; swing = Math.max(swing, .095);
        const random = randomGenerator(distant.table * 8191 + distant.startedAt % 65536);
        for (let index = 0; index < 48; index++) {
          dustRest[index * 3] = (random() - .5) * 4.2;
          dustRest[index * 3 + 1] = 2.3 + random() * .8;
          dustRest[index * 3 + 2] = -2.5 + random() * 3;
        }
        root.userData.distantReaction = distant.id;
      }
      dust.visible = distantAge >= 0 && distantAge < 2.8;
      if (dust.visible) {
        for (let index = 0; index < 48; index++) {
          dustPositions[index * 3] = dustRest[index * 3] + Math.sin(time * .7 + index) * .025;
          dustPositions[index * 3 + 1] = dustRest[index * 3 + 1] - distantAge * (.35 + index % 5 * .055);
          dustPositions[index * 3 + 2] = dustRest[index * 3 + 2];
        }
        dustGeometry.attributes.position.needsUpdate = true; dustMaterial.opacity = .55 * Math.min(1, (2.8 - distantAge) * 1.4);
      }
      const ambientEvent = campaign.ambientEvent;
      const ambientAge = ambientEvent ? (now - ambientEvent.startedAt) / 1000 : -1;
      const ambientActive = !!ambientEvent && ambientAge >= 0 && ambientAge * 1000 < ambientEvent.duration && !shotSequenceActive(campaign.phase ?? 'PLAYER_DECISION', suspense);
      root.userData.ambientEvent = ambientActive ? ambientEvent.kind : null;
      doorHandle.rotation.z = ambientActive && ambientEvent.kind === 'handle' ? Math.sin(ambientAge * 33) * .23 : 0;
      guardEyes.visible = ambientActive && ambientEvent.kind === 'guard' && ambientAge > .25 && ambientAge < 2.4;
      guardEyes.position.x = guardEyes.visible ? Math.sin(ambientAge * 1.3) * .025 : 0;
      drip.visible = ambientActive && ambientEvent.kind === 'drip';
      if (drip.visible) drip.position.set(-3.17, 2.75 - (ambientAge * 1.8 % 2.6), -3.4);
      if (time >= nextStatic) {
        for (let i = 0; i < staticPixels.data.length; i += 4) {
          const row = Math.floor(i / (64 * 4));
          const value = Math.floor(30 + staticRandom() * 115) * (row % 3 === 0 ? .62 : 1);
          staticPixels.data[i] = value * .78; staticPixels.data[i + 1] = value; staticPixels.data[i + 2] = value * .9; staticPixels.data[i + 3] = 255;
        }
        staticContext.putImageData(staticPixels, 0, 0); staticTexture.needsUpdate = true; nextStatic = time + .11;
      }
      if (time >= nextFlicker) {
        flickerUntil = time + .065 + staticRandom() * .12;
        nextFlicker = time + (danger ? .65 : 2.3) + staticRandom() * (danger ? 1.7 : 4.1);
      }
      if (impulse > lastImpulse) swing = Math.min(.16, swing + impulse * .035);
      lastImpulse = impulse;
      swing = Math.max(0, swing - delta * .009);
      lamp.rotation.z = Math.sin(time * 2.8) * (.007 + swing);
      lamp.rotation.x = Math.cos(time * 2.1) * swing * .45;
      let flicker = time < flickerUntil ? .4 + staticRandom() * .14 : 1;
      if (ambientActive && ambientEvent.kind === 'bulb') flicker *= Math.sin(ambientAge * 29) > .35 ? .13 : 1;
      const dim = suspense ? .65 : 1;
      let power = 1;
      if (active?.kind === 'blackout') {
        const remaining = active.startedAt + active.duration - now;
        // A few brief returning flashes close the outage without changing normal flicker.
        const returning = createTensionRandom(active.seed ^ Math.floor((now - active.startedAt) / 43));
        power = remaining < 280 && returning() > .58 ? .15 + returning() * .6 : 0;
      }
      bulbLight.intensity = mood.intensity * flicker * dim * power;
      bulbMaterial.color.setHex(mood.bulb).multiplyScalar(flicker * power);
      filament.visible = power > .1;
      ambient.intensity = mood.ambient * power;
      emergency.intensity = (1.2 + Math.sin(time * 1.4) * .12) * mood.emergency;
      hazeMaterial.opacity = .003 * flicker * dim * power;
      if (active?.kind === 'tv') {
        watchedScreen.material = eventMaterial;
        const elapsed = now - active.startedAt;
        const random = createTensionRandom(active.seed ^ Math.floor(elapsed / 75));
        const screenPower = elapsed < 220 || active.duration - elapsed < 200 ? (random() > .5 ? .3 : 1) : 1;
        watchedGlow.intensity = watchedGlowRest * mood.glow * (1.2 + screenPower);
        eventMaterial.color.setHex(0xb4d5ba).multiplyScalar(screenPower);
        if (now >= nextEventStatic) {
          for (let i = 0; i < eventPixels.data.length; i += 4) {
            const value = 15 + random() * 65;
            eventPixels.data[i] = value * .65; eventPixels.data[i + 1] = value; eventPixels.data[i + 2] = value * .75; eventPixels.data[i + 3] = 255;
          }
          eventContext.putImageData(eventPixels, 0, 0);
          if (elapsed > 220 && elapsed < active.duration - 200) {
            eventContext.fillStyle = '#111c15dc'; eventContext.fillRect(0, 10, 64, 27);
            eventContext.fillStyle = '#cedfc8'; eventContext.font = 'bold 9px monospace'; eventContext.textAlign = 'center'; eventContext.textBaseline = 'middle';
            eventContext.fillText('WE ARE', 32, 18); eventContext.fillText('WATCHING', 32, 30);
          }
          eventTexture.needsUpdate = true; nextEventStatic = now + 75;
        }
      } else { restoreEvent(); watchedGlow.intensity = watchedGlowRest * mood.glow; }
    },
  };
}
