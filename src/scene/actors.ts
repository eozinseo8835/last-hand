import * as THREE from 'three';
import { CONFIG, type Card, type GamePhase, type Round } from '../game';
import { mergeStaticMeshes } from './merge';
import { eventDoorPulse, type OpponentTell, type RoundEvent, type Side } from '../tension';
import { OPPONENTS } from '../campaign';

export type ActorState = {
  phase: GamePhase;
  suspense: boolean;
  dead: 'player' | 'ai' | null;
  shotEffect: 'click' | 'shot' | null;
  roundNumber: number;
  revealed: boolean;
  voiceLevel?: number;
  reducedMotion?: boolean;
  chambersFired?: number;
  tell?: OpponentTell | null;
  triggerHeld?: boolean;
  triggerProgress?: number;
  spinning?: Side | null;
  spinSerial?: number;
  peekActor?: Side | null;
  peekSerial?: number;
  peekedCard?: Card | null;
  event?: RoundEvent | null;
  roomNumber?: 1 | 2 | 3;
  speaker?: 'host' | 'captive' | null;
  hostVoiceLevel?: number;
  captiveVoiceLevel?: number;
  storyStage?: string;
};

type CardSlot = {
  group: THREE.Group; front: THREE.Mesh; back: THREE.Mesh;
  owner: 'player' | 'ai'; index: number; active: boolean; age: number;
  born: number; serial: number; identity: string; flip: number;
  fromPosition: THREE.Vector3; fromQuaternion: THREE.Quaternion; fromScale: number;
};
const SUITS = { spades: '♠', clubs: '♣', hearts: '♥', diamonds: '♦' };
const TABLE_Y = .8865;
const demo: Round = {
  player: [{ suit: 'spades', rank: '8', id: 'demo-spade' }, { suit: 'hearts', rank: 'K', id: 'demo-king' }],
  ai: [{ suit: 'clubs', rank: 'A', id: 'demo-ace' }, { suit: 'diamonds', rank: '7', id: 'demo-hidden' }],
  deck: [],
};

function surface(color: number, metalness = 0, roughness = .9) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
}
function box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(parent: THREE.Object3D, radius: number, length: number, position: [number, number, number], material: THREE.Material, sides = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, sides), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function polygon(parent: THREE.Object3D, vertices: number[], material: THREE.Material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeHand(material: THREE.Material) {
  const group = new THREE.Group();
  const palm = box(group, [.17, .055, .16], [0, 0, .055], material);
  palm.rotation.z = .025;
  const fingers: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Group();
    finger.position.set((i - 1.5) * .044, -.004, .12);
    const length = [ .098, .13, .12, .09 ][i];
    box(finger, [.034, .036, length * .58], [0, 0, length * .23], material);
    const tip = box(finger, [.03, .032, length * .5], [0, -.008, length * .73], material);
    tip.rotation.x = -.16;
    finger.rotation.y = (i - 1.5) * -.035;
    group.add(finger);
    fingers.push(finger);
    mergeStaticMeshes(finger);
  }
  const thumb = box(group, [.052, .045, .105], [-.099, -.008, .035], material);
  thumb.rotation.y = -.6;
  mergeStaticMeshes(group, mesh => mesh.parent === group);
  return { group, fingers };
}

/** Card faces are drawn locally; the unrevealed face never receives its secret texture. */
function cardTexture(card: Card) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 224;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#e8e2cb';
  context.fillRect(0, 0, 160, 224);
  context.strokeStyle = '#a9a58f';
  context.lineWidth = 3;
  context.strokeRect(4, 4, 152, 216);
  context.fillStyle = card.suit === 'hearts' || card.suit === 'diamonds' ? '#9d241f' : '#14271f';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.font = 'bold 40px monospace';
  context.fillText(card.rank, 11, 9);
  context.font = '32px Georgia, serif';
  context.fillText(SUITS[card.suit], 12, 48);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = 'bold 77px Georgia, serif';
  context.fillText(SUITS[card.suit], 84, 132);
  context.save();
  context.translate(160, 224);
  context.rotate(Math.PI);
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.font = 'bold 36px monospace';
  context.fillText(card.rank, 11, 9);
  context.restore();
  // A few restrained dirt marks keep the cards within the room's palette.
  context.fillStyle = '#2b251309';
  for (let i = 0; i < 55; i++) {
    const x = (i * 47 + 13) % 160, y = (i * 71 + 29) % 224;
    context.fillRect(x, y, 2 + i % 4, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}
function cardBackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 224;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#172d26';
  context.fillRect(0, 0, 160, 224);
  context.strokeStyle = '#6e7860';
  context.lineWidth = 3;
  context.strokeRect(6, 6, 148, 212);
  context.lineWidth = 1;
  context.strokeRect(12, 12, 136, 200);
  context.strokeStyle = '#737f613d';
  for (let d = -224; d < 384; d += 12) {
    context.beginPath(); context.moveTo(d, 0); context.lineTo(d + 224, 224); context.stroke();
    context.beginPath(); context.moveTo(d, 224); context.lineTo(d + 224, 0); context.stroke();
  }
  context.fillStyle = '#203a2d';
  context.fillRect(44, 66, 72, 92);
  context.strokeStyle = '#a1a183';
  context.strokeRect(44, 66, 72, 92);
  context.fillStyle = '#beb79b';
  context.font = '29px monospace';
  context.textAlign = 'center';
  context.fillText('LH', 80, 109);
  context.font = '31px Georgia';
  context.fillText('✦', 80, 143);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function makeRevolver() {
  const gun = new THREE.Group();
  gun.name = 'Shared six-chamber revolver';
  const steel = surface(0x777d75, .7, .45);
  const dark = surface(0x202923, .8, .4);
  const edge = surface(0xb3ae96, .65, .5);
  const wood = surface(0x624431, .1, .85);
  const woodDark = surface(0x38291d);
  box(gun, [.2, .115, .087], [-.06, .045, 0], steel);
  const barrel = cylinder(gun, .031, .30, [.16, .09, 0], steel, 8);
  barrel.rotation.z = Math.PI / 2;
  const barrelOpening = cylinder(gun, .019, .004, [.313, .09, 0], dark, 8);
  barrelOpening.rotation.z = Math.PI / 2;
  box(gun, [.31, .018, .047], [.15, .119, 0], edge);
  box(gun, [.028, .027, .025], [.28, .142, 0], dark);
  const revolverCylinder = new THREE.Group();
  revolverCylinder.name = 'Revolver cylinder';
  revolverCylinder.position.set(-.018, .072, 0); gun.add(revolverCylinder);
  const chamber = cylinder(revolverCylinder, .073, .115, [0, 0, 0], steel, 10);
  chamber.rotation.z = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const groove = cylinder(revolverCylinder, .010, .082, [.004, Math.cos(a) * .068, Math.sin(a) * .068], dark, 5);
    groove.rotation.z = Math.PI / 2;
  }
  const grip = box(gun, [.088, .18, .081], [-.133, -.102, 0], wood);
  grip.rotation.z = -.32;
  const gripCap = box(gun, [.103, .018, .085], [-.158, -.189, 0], dark);
  gripCap.rotation.z = -.32;
  for (let i = 0; i < 5; i++) {
    const line = box(gun, [.079, .006, .084], [-.128 - i * .004, -.06 - i * .022, 0], woodDark);
    line.rotation.z = -.32;
  }
  for (const z of [-.044, .044]) {
    const screw = cylinder(gun, .008, .003, [-.143, -.115, z], edge, 6);
    screw.rotation.x = Math.PI / 2;
  }
  const guard = new THREE.Mesh(new THREE.TorusGeometry(.057, .008, 4, 12), steel);
  guard.position.set(-.012, -.07, 0);
  guard.scale.set(1.15, .85, .7);
  guard.castShadow = guard.receiveShadow = true;
  gun.add(guard);
  const trigger = box(gun, [.013, .053, .012], [-.005, -.063, 0], dark);
  trigger.rotation.z = -.25;
  const hammer = box(gun, [.035, .065, .025], [-.15, .126, 0], steel);
  hammer.name = 'Revolver hammer';
  hammer.rotation.z = -.6;
  mergeStaticMeshes(revolverCylinder);
  mergeStaticMeshes(gun, mesh => mesh.parent === gun && mesh !== hammer);
  return { gun, hammer, revolverCylinder };
}

export function createActors(scene: THREE.Scene, camera?: THREE.Camera) {
  const suit = surface(0x202622);
  const lapel = surface(0x343a31);
  const shirt = surface(0x706d58);
  const skin = surface(0x8e8a70);
  const skinShadow = surface(0x656b53);
  const black = surface(0x0f1713);
  const mask = surface(0xd1ccb2, .04, .77);
  const chairMaterial = surface(0x242a24, .45, .7);
  const seam = surface(0x47503f);

  // A chair remains upright when the figure slumps.
  const chair = new THREE.Group();
  chair.position.set(0, 0, -1.82);
  box(chair, [.88, .10, .64], [0, .63, 0], chairMaterial);
  box(chair, [.83, .9, .09], [0, 1.12, -.29], black);
  for (const x of [-.37, .37]) for (const z of [-.24, .25]) {
    const leg = cylinder(chair, .024, .65, [x, .315, z], chairMaterial, 6);
    leg.rotation.z = x * -.13;
  }
  mergeStaticMeshes(chair);
  scene.add(chair);

  const stranger = new THREE.Group();
  stranger.name = 'The Stranger';
  stranger.position.set(0, .86, -1.65);
  scene.add(stranger);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(.32, .38, .74, 6), suit);
  torso.position.set(0, .57, -.01);
  torso.scale.z = .63;
  torso.castShadow = true; torso.receiveShadow = true;
  stranger.add(torso);
  const shoulders = box(stranger, [.81, .20, .33], [0, .82, -.01], suit);
  shoulders.rotation.x = -.08;
  cylinder(stranger, .094, .17, [0, .97, 0], skinShadow, 7);
  polygon(stranger, [ -.13,.94,.17, 0,.4,.236, .13,.94,.17 ], shirt);
  polygon(stranger, [ -.12,.94,.19, -.28,.80,.20, -.16,.61,.245, -.16,.61,.245, -.25,.54,.22, 0,.22,.253 ], lapel);
  polygon(stranger, [ .12,.94,.19, 0,.22,.253, .25,.54,.22, .25,.54,.22, .16,.61,.245, .28,.80,.20 ], lapel);
  polygon(stranger, [ -.13,.94,.195, -.04,.79,.229, 0,.9,.228, 0,.9,.228, .04,.79,.229, .13,.94,.195 ], shirt);
  polygon(stranger, [ 0,.9,.237, -.035,.84,.243, 0,.78,.249, 0,.9,.237, 0,.78,.249, .035,.84,.243 ], black);
  polygon(stranger, [ 0,.80,.251, -.032,.46,.264, 0,.39,.265, 0,.80,.251, 0,.39,.265, .035,.46,.264 ], black);
  box(stranger, [.13, .012, .008], [-.22, .59, .231], seam);
  for (const y of [.20, .36]) {
    const button = cylinder(stranger, .012, .01, [.055, y, .24], black, 7);
    button.rotation.x = Math.PI / 2;
  }

  const head = new THREE.Group();
  head.position.set(0, 1.19, .025);
  stranger.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), black);
  skull.scale.set(.224, .306, .19);
  skull.castShadow = true; skull.receiveShadow = true;
  head.add(skull);
  const face = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 6, 0, Math.PI * 2, 0, Math.PI), mask);
  face.scale.set(.199, .275, .084);
  face.position.set(0, -.008, .157);
  face.castShadow = true; face.receiveShadow = true;
  head.add(face);
  // A plain, completely featureless shell: no eyes, symbols, mouth, or insignia.
  const maskStrap = box(head, [.455, .025, .04], [0, .015, -.07], black);
  maskStrap.rotation.x = .05;
  mergeStaticMeshes(head);

  const left = makeHand(skin), right = makeHand(skin);
  const leftHand = left.group, rightHand = right.group;
  stranger.add(leftHand, rightHand);
  leftHand.position.set(-.74, .055, .72);
  rightHand.position.set(.74, .055, .72);
  leftHand.rotation.y = -.14; rightHand.rotation.y = .14;
  // Opposite hands keep both thumbs on the inside of the resting palms.
  leftHand.scale.x = -1;
  const leftUpper = cylinder(stranger, .12, 1, [0, 0, 0], suit, 6);
  const leftLower = cylinder(stranger, .105, 1, [0, 0, 0], suit, 6);
  const rightUpper = cylinder(stranger, .12, 1, [0, 0, 0], suit, 6);
  const rightLower = cylinder(stranger, .105, 1, [0, 0, 0], suit, 6);
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  function segment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    direction.subVectors(b, a);
    mesh.position.copy(a).addScaledVector(direction, .5);
    mesh.scale.y = direction.length();
    mesh.quaternion.setFromUnitVectors(up, direction.normalize());
  }
  const leftShoulder = new THREE.Vector3(-.37, .79, 0);
  const rightShoulder = new THREE.Vector3(.37, .79, 0);
  const leftElbow = new THREE.Vector3(-.67, .19, .27);
  const rightElbow = new THREE.Vector3(.67, .19, .27);
  const animatedElbow = new THREE.Vector3();
  segment(leftUpper, leftShoulder, leftElbow);
  segment(leftLower, leftElbow, leftHand.position);
  segment(rightUpper, rightShoulder, rightElbow);
  segment(rightLower, rightElbow, rightHand.position);

  // Batch only immutable clothing directly under the figure. Body, hands and
  // arm bones retain their individual meshes because they animate each frame.
  const animated = new Set<THREE.Mesh>([torso, shoulders, leftUpper, leftLower, rightUpper, rightLower]);
  mergeStaticMeshes(stranger, mesh => mesh.parent === stranger && !animated.has(mesh));

  // Keep the original pale mask and suit intact for the non-playing Host.
  head.name = 'Cast head'; torso.name = 'Cast torso'; shoulders.name = 'Cast shoulders';
  leftHand.name = 'Cast left hand'; rightHand.name = 'Cast right hand';
  leftUpper.name = 'Cast left upper arm'; leftLower.name = 'Cast left forearm';
  rightUpper.name = 'Cast right upper arm'; rightLower.name = 'Cast right forearm';
  const host = stranger.clone(true); host.name = 'The Host';
  host.position.set(-1.95, .86, -.45); host.rotation.y = 1.0;
  host.userData = { actorRole: 'host', canShoot: false, canDie: false };
  scene.add(host);
  const hostHead = host.getObjectByName('Cast head') as THREE.Group;
  const hostTorso = host.getObjectByName('Cast torso') as THREE.Mesh;
  const hostShoulders = host.getObjectByName('Cast shoulders') as THREE.Mesh;
  const hostLeftHand = host.getObjectByName('Cast left hand') as THREE.Group;
  const hostRightHand = host.getObjectByName('Cast right hand') as THREE.Group;
  const hostLeftUpper = host.getObjectByName('Cast left upper arm') as THREE.Mesh;
  const hostLeftLower = host.getObjectByName('Cast left forearm') as THREE.Mesh;
  const hostRightUpper = host.getObjectByName('Cast right upper arm') as THREE.Mesh;
  const hostRightLower = host.getObjectByName('Cast right forearm') as THREE.Mesh;
  hostHead.name = 'Host masked head';
  const hostLegs = new THREE.Group(); hostLegs.name = 'Host standing legs'; host.add(hostLegs);
  const hostLegParts: THREE.Group[] = [];
  for (const x of [-.16, .16]) {
    const leg = new THREE.Group(); leg.position.set(x, .15, -.04); hostLegs.add(leg); hostLegParts.push(leg);
    cylinder(leg, .12, .94, [0, -.52, 0], suit, 6);
    box(leg, [.24, .12, .38], [0, -.95, .10], black); mergeStaticMeshes(leg);
  }
  box(hostLegs, [.49, .18, .29], [0, .15, -.03], suit);

  // The front seat is a fellow captive, never another masked dealer.
  const captive = stranger; captive.userData = { actorRole: 'captive', canShoot: true, canDie: true };
  const oldSuit = stranger.children.filter(object => object instanceof THREE.Mesh && !animated.has(object));
  oldSuit.forEach(object => { object.visible = false; });
  head.clear(); head.name = 'Captive head';
  const clothing = [surface(0x3b4841), surface(0x77796b), surface(0x414a42)];
  const flesh = [surface(0xb2a087), surface(0xa18b72), surface(0xa6a18b)];
  const captiveNames = [OPPONENTS[1].name, OPPONENTS[2].name, OPPONENTS[3].name];
  const heads: THREE.Group[] = [], costumes: THREE.Group[] = [];
  for (let room = 0; room < 3; room++) {
    const humanHead = new THREE.Group(); humanHead.name = `${captiveNames[room]} face`;
    const faceSkin = flesh[room], cloth = clothing[room], hair = surface(room === 2 ? 0x777c6e : room === 1 ? 0x302e25 : 0x242d25);
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), faceSkin);
    cranium.scale.set(room === 2 ? .167 : .194, room === 0 ? .255 : .266, .164);
    cranium.castShadow = cranium.receiveShadow = true; humanHead.add(cranium);
    for (const x of [-.19, .19]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(.045, 5, 4), faceSkin);
      ear.position.set(x * (room === 2 ? .88 : 1), -.005, 0); ear.scale.set(.55, 1, .6); humanHead.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.035, .105, 4), faceSkin);
    nose.rotation.x = Math.PI / 2; nose.position.set(0, -.005, .172); humanHead.add(nose);
    for (const x of [-.070, .070]) {
      const eye = box(humanHead, [room === 0 ? .041 : .037, room === 0 ? .028 : .016, .014], [x, .040, .153], black);
      eye.rotation.z = room === 1 ? x * .8 : 0;
      const brow = box(humanHead, [.060, .012, .014], [x, .090, .145], hair);
      brow.rotation.z = room === 0 ? -Math.sign(x) * .18 : room === 1 ? -.05 : Math.sign(x) * .06;
    }
    const mouth = box(humanHead, [room === 0 ? .072 : .106, .012, .015], [room === 1 ? .008 : 0, -.105, .143], black);
    mouth.rotation.z = room === 1 ? .14 : room === 0 ? -.025 : 0;
    if (room === 0) {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 4, 0, Math.PI * 2, 0, Math.PI * .49), hair);
      crown.scale.set(.202, .267, .17); crown.position.y = .015; humanHead.add(crown);
      const sweat = surface(0xbfc6b0, .1, .28);
      for (const [x, y] of [[.115, .115], [-.13, .015], [.09, -.05]]) {
        const bead = new THREE.Mesh(new THREE.ConeGeometry(.009, .030, 4), sweat);
        bead.rotation.z = Math.PI; bead.position.set(x, y, .150); humanHead.add(bead);
      }
    } else {
      for (const x of [-.135, .135]) box(humanHead, [.055, .155, .11], [x, .130, -.032], hair);
      if (room === 1) box(humanHead, [.20, .055, .12], [0, .222, -.03], hair);
      if (room === 2) {
        const wrinkles = surface(0x777c68);
        for (const y of [.128, .153]) box(humanHead, [.135, .006, .009], [0, y, .118], wrinkles);
        for (const x of [-.095, .095]) box(humanHead, [.059, .006, .010], [x, .006, .148], wrinkles);
      }
    }
    mergeStaticMeshes(humanHead); heads.push(humanHead); head.add(humanHead);
    const costume = new THREE.Group(); costume.name = `${captiveNames[room]} clothes`;
    cylinder(costume, .089, .17, [0, .97, 0], faceSkin, 7);
    if (room === 0) {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(.22, .078, 4, 8, Math.PI * 1.25), cloth);
      hood.rotation.x = -.28; hood.rotation.z = -.40; hood.position.set(0, 1.02, -.035); costume.add(hood);
      box(costume, [.012, .21, .012], [-.09, .80, .215], shirt);
      box(costume, [.012, .25, .012], [.09, .78, .215], shirt);
      polygon(costume, [-.28,.72,.18, -.17,.64,.221, -.25,.58,.221], surface(0x1b2620));
      polygon(costume, [.26,.39,.21, .16,.35,.241, .25,.29,.24], surface(0x26302a));
      box(costume, [.25, .11, .025], [0, .31, .242], surface(0x344039));
    } else if (room === 1) {
      polygon(costume, [-.13,.94,.20, -.045,.77,.241, .01,.89,.239], shirt);
      polygon(costume, [.13,.94,.20, .035,.77,.241, .01,.89,.239], shirt);
      polygon(costume, [.018,.77,.25, -.023,.71,.263, .025,.66,.268, .018,.77,.25, .025,.66,.268, .070,.70,.258], surface(0x403a2e));
      polygon(costume, [.026,.69,.268, -.001,.35,.267, .055,.29,.267, .026,.69,.268, .055,.29,.267, .082,.38,.267], surface(0x403a2e));
      for (const y of [.29,.46,.60]) box(costume, [.018,.018,.008], [-.047,y,.249], black);
    } else {
      polygon(costume, [-.11,.94,.19, 0,.81,.238, .11,.94,.19], surface(0x73796b));
      box(costume, [.018,.54,.012], [0,.53,.249], surface(0x29352c));
      for (const y of [.34,.53,.68]) box(costume, [.017,.017,.012], [0,y,.260], black);
    }
    mergeStaticMeshes(costume); costumes.push(costume); captive.add(costume);
  }
  const captiveHood = new THREE.Mesh(new THREE.ConeGeometry(.29, .67, 7, 1, true), surface(0x1d2721));
  captiveHood.name = 'Captive kidnapping hood'; captiveHood.position.set(0, 1.20, .015); captiveHood.visible = false; captive.add(captiveHood);
  let currentRoom = 0, lastStoryStage = '', storyStartedAt = 0;
  const hostHandTarget = new THREE.Vector3(), hostElbow = new THREE.Vector3(), hostPositionTarget = new THREE.Vector3();
  const hostDoorStart = new THREE.Vector3(), hostDoorWaypoint = new THREE.Vector3(-1.95, .86, -2.5), hostDoorFinish = new THREE.Vector3(2.05, .86, -3.5);

  const playerHands = new THREE.Group();
  playerHands.name = 'First-person hands and sleeves';
  playerHands.userData = { actorRole: 'player' };
  scene.add(playerHands);
  const heldRig = new THREE.Group();
  heldRig.name = 'Player left hand and held fan';
  if (camera) camera.add(heldRig);
  else {
    heldRig.position.set(0, 1.85, 2.65);
    heldRig.rotation.x = -.173;
    scene.add(heldRig);
  }
  const heldRigRestPosition = heldRig.position.clone();
  const playerLeft = makeHand(skinShadow), playerRight = makeHand(skinShadow);
  playerRight.group.name = 'Player right gripping hand';
  heldRig.add(playerLeft.group);
  playerHands.add(playerRight.group);
  playerLeft.group.position.set(-.10, -.40, -.88);
  playerLeft.group.rotation.set(-Math.PI / 2 + .20, 0, -.24);
  playerRight.group.position.set(.95, .925, 1.12);
  playerRight.group.rotation.y = Math.PI + .17;
  playerRight.group.scale.x = -1;
  const playerRightIdleQuaternion = playerRight.group.quaternion.clone();
  const playerRightSpinQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.8, Math.PI + .17, .6));
  const leftSleeve = cylinder(heldRig, .115, 1, [0, 0, 0], suit, 6);
  const rightSleeve = cylinder(playerHands, .115, 1, [0, 0, 0], suit, 6);
  const playerLeftStart = new THREE.Vector3(-.48, -.77, -.20);
  const playerRightStart = new THREE.Vector3(1.08, .72, 1.95);
  segment(leftSleeve, playerLeftStart, playerLeft.group.position);
  segment(rightSleeve, playerRightStart, playerRight.group.position);

  const { gun, hammer, revolverCylinder } = makeRevolver();
  gun.position.set(.12, .962, .02);
  gun.rotation.set(-Math.PI / 2, 0, -.13);
  scene.add(gun);
  const gunRest = new THREE.Vector3(.12, .962, .02);
  const gunAI = new THREE.Vector3(.47, 2.00, -1.48);
  const gunPlayer = new THREE.Vector3();
  const gunTarget = new THREE.Vector3();
  const gunMotionOffset = new THREE.Vector3();
  const gunRestQuaternion = gun.quaternion.clone();
  const gunAimQuaternion = new THREE.Quaternion(), gunPoseQuaternion = new THREE.Quaternion();
  const gripOffset = new THREE.Vector3(-.20, -.105, -.065);
  const gripRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0),
  ));
  const gripWorldQuaternion = new THREE.Quaternion(), handParentQuaternion = new THREE.Quaternion();
  const barrelToViewer = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  const aimOrigin = new THREE.Vector3(), aimCameraQuaternion = new THREE.Quaternion();
  const aimOffset = new THREE.Vector3(0, -.09, -1.165);
  const fallbackView = new THREE.Object3D();
  fallbackView.position.set(0, 1.85, 2.65); fallbackView.rotation.x = -.173;
  const handTarget = new THREE.Vector3();
  let gunBlend = 0;

  const cardSlots: CardSlot[] = [];
  const backTexture = cardBackTexture();
  const backMaterial = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 1, emissive: 0x253a2a, emissiveIntensity: .12 });
  const edgeMaterial = surface(0xa5a68c);
  const deck = new THREE.Group();
  deck.name = 'The Host’s deck';
  deck.userData.owner = 'host';
  deck.position.set(-1.27, TABLE_Y + .035, -.40);
  scene.add(deck);
  const lowerPack = new THREE.Group(), upperPack = new THREE.Group();
  deck.add(lowerPack, upperPack);
  upperPack.position.y = .045;
  for (const pack of [lowerPack, upperPack]) {
    box(pack, [.46, .043, .60], [0, 0, 0], edgeMaterial);
    for (let i = 0; i < 3; i++) box(pack, [.463, .002, .603], [0, -.015 + i * .012, 0], surface(0x656e57));
    const top = new THREE.Mesh(new THREE.PlaneGeometry(.454, .594), backMaterial);
    top.rotation.x = -Math.PI / 2; top.position.y = .023;
    top.receiveShadow = true; pack.add(top); mergeStaticMeshes(pack);
  }
  const deckStart = new THREE.Vector3(-1.27, TABLE_Y + .102, -.40);
  const pickup = new THREE.Vector3(-.20, TABLE_Y + .02, .78);
  // The lifted top card remains back-up. Only the camera's private inset gets its face.
  const deckCorner = new THREE.Group(); deckCorner.name = 'Lifted deck corner';
  deckCorner.position.set(deckStart.x - .227, deckStart.y + .003, deckStart.z - .297);
  const cornerBack = new THREE.Mesh(new THREE.PlaneGeometry(.454, .594), backMaterial);
  cornerBack.rotation.x = -Math.PI / 2; cornerBack.position.set(.227, 0, .297);
  deckCorner.add(cornerBack); deckCorner.visible = false; scene.add(deckCorner);
  const peekCard = new THREE.Group(); peekCard.name = 'Private next card'; peekCard.visible = false;
  peekCard.position.set(.58, -.12, -1.16); peekCard.scale.setScalar(.34); heldRig.add(peekCard);
  const peekMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: .65 });
  const peekFront = new THREE.Mesh(new THREE.PlaneGeometry(.47, .66), peekMaterial);
  const peekBack = new THREE.Mesh(new THREE.PlaneGeometry(.47, .66), backMaterial);
  peekFront.position.z = .0045; peekBack.position.z = -.0045; peekBack.rotation.y = Math.PI;
  box(peekCard, [.473, .663, .008], [0, 0, 0], edgeMaterial);
  peekCard.add(peekFront, peekBack);
  let peekIdentity = '', lastPeekSerial = 0, peekStartedAt = -1;
  let lastSpinSerial = 0, spinStartedAt = -1, spinFrom = 0;
  const targetPosition = new THREE.Vector3(), targetScale = new THREE.Vector3();
  const targetQuaternion = new THREE.Quaternion(), rigQuaternion = new THREE.Quaternion();
  const backQuaternion = new THREE.Quaternion();
  const angle = new THREE.Euler();
  let currentRound: Round | null = null, cardRevealed = false;
  let actorTime = 0, lastRound = 0, lastPhase: GamePhase = 'START';
  let elapsedShoot = 0, phaseStartedAt = 0, showdownStartedAt = -1, sweepStartedAt = -1;
  let serial = 0, newest: CardSlot | null = null, slump = 0;

  function makeSlot(owner: 'player' | 'ai', index: number): CardSlot {
    const group = new THREE.Group();
    group.name = `${owner === 'player' ? 'Player' : 'Captive'} card ${index + 1}`;
    group.userData = { owner, index, held: false, tableFaceUp: false };
    const frontMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: owner === 'player' ? 0xffffff : 0x655e41, emissiveIntensity: owner === 'player' ? .70 : .22 });
    const geometry = new THREE.PlaneGeometry(.47, .66);
    const front = new THREE.Mesh(geometry, frontMaterial), back = new THREE.Mesh(geometry, backMaterial);
    front.position.z = .0045; back.position.z = -.0045; back.rotation.y = Math.PI;
    front.receiveShadow = back.receiveShadow = true;
    box(group, [.473, .663, .008], [0, 0, 0], edgeMaterial);
    group.add(front, back); scene.add(group); group.visible = false;
    const slot: CardSlot = { group, front, back, owner, index, active: false, age: 0, born: 0, serial: 0, identity: '', flip: owner === 'ai' && index === 1 ? Math.PI : 0, fromPosition: new THREE.Vector3(), fromQuaternion: new THREE.Quaternion(), fromScale: 1 };
    cardSlots.push(slot); return slot;
  }
  // Retain the original four-slot order for scene inspection, then grow per hand.
  makeSlot('player', 0); makeSlot('player', 1); makeSlot('ai', 0); makeSlot('ai', 1);
  function slotFor(owner: 'player' | 'ai', index: number) {
    return cardSlots.find(slot => slot.owner === owner && slot.index === index) ?? makeSlot(owner, index);
  }
  function frontMap(slot: CardSlot, card: Card | null) {
    const identity = card?.id ?? 'unrevealed';
    if (slot.identity === identity) return;
    slot.identity = identity;
    slot.front.userData.identity = identity;
    const material = slot.front.material as THREE.MeshStandardMaterial;
    material.map?.dispose(); material.map = card ? cardTexture(card) : null;
    material.emissiveMap = slot.owner === 'player' ? material.map : null;
    material.color.setHex(card ? 0xffffff : 0xa8aa91); material.needsUpdate = true;
  }
  function rememberWorld(slot: CardSlot) {
    scene.attach(slot.group);
    slot.fromPosition.copy(slot.group.position);
    slot.fromQuaternion.copy(slot.group.quaternion);
    slot.fromScale = slot.group.scale.x;
  }
  function setCards(round: Round | null, revealed: boolean) {
    const previousReveal = cardRevealed;
    currentRound = round; cardRevealed = revealed;
    const dealt = round ?? demo;
    for (const slot of cardSlots) {
      const cards = slot.owner === 'player' ? dealt.player : dealt.ai;
      if (!cards[slot.index]) {
        slot.active = false; slot.group.visible = false;
        slot.group.userData.held = false; slot.group.userData.tableFaceUp = false;
        if (slot.owner === 'ai' && slot.index === 1 && !revealed) frontMap(slot, null);
      }
    }
    for (const owner of ['player', 'ai'] as const) {
      dealt[owner].forEach((card, index) => {
        const slot = slotFor(owner, index);
        const isNew = !slot.active;
        if (isNew) {
          slot.active = true; slot.born = round ? actorTime : actorTime - CONFIG.DEAL_SPEED / 1000 - 1;
          slot.age = 0; slot.serial = ++serial; newest = slot;
          scene.attach(slot.group); slot.group.position.copy(deckStart); slot.group.scale.setScalar(1);
          slot.flip = owner === 'ai' && index === 1 && !revealed ? Math.PI : 0;
          slot.group.rotation.set(-Math.PI / 2, owner === 'player' || slot.flip ? Math.PI : 0, 0);
          slot.group.userData.held = false; slot.group.userData.tableFaceUp = false;
        }
        const secret = owner === 'ai' && index === 1 && !revealed;
        frontMap(slot, secret ? null : card);
        slot.group.visible = true;
      });
    }
    if (revealed && !previousReveal) {
      showdownStartedAt = actorTime;
      cardSlots.filter(slot => slot.active && slot.owner === 'player').forEach(rememberWorld);
    }
    if (!revealed) showdownStartedAt = -1;
  }
  setCards(null, false);

  function tableHome(slot: CardSlot, out: THREE.Vector3) {
    const count = (currentRound ?? demo)[slot.owner].length;
    if (slot.owner === 'ai') {
      // Keep the public up-card clear of the player's foreground fan.
      const spacing = Math.min(.50, 1.30 / Math.max(1, count - 1));
      out.set(.95 - slot.index * spacing, TABLE_Y + .006 + slot.index * .0007, -.35);
    } else {
      const spacing = Math.min(.50, 1.9 / Math.max(1, count - 1));
      out.set((slot.index - (count - 1) / 2) * spacing, TABLE_Y + .006 + slot.index * .0007, .64);
    }
  }
  function fanHome(slot: CardSlot, out: THREE.Vector3) {
    const count = (currentRound ?? demo).player.length;
    const offset = slot.index - (count - 1) / 2;
    const spacing = Math.min(.13, .56 / Math.max(1, count - 1));
    const fanY = count < 4 ? -.22 - Math.abs(offset) * .008 : -.19 + Math.min(count - 4, 7) * .005 - Math.abs(offset) * .0025;
    out.set(offset * spacing, fanY, -1.04 + slot.index * .006);
    return offset;
  }
  function animateCards(time: number, dt: number, state: ActorState) {
    heldRig.updateWorldMatrix(true, false);
    heldRig.getWorldQuaternion(rigQuaternion);
    const sweepProgress = sweepStartedAt < 0 ? 0 : THREE.MathUtils.clamp((time - sweepStartedAt) / .60, 0, 1);
    const layProgress = showdownStartedAt < 0 ? 0 : THREE.MathUtils.clamp((time - showdownStartedAt) / .80, 0, 1);
    for (const slot of cardSlots) {
      if (!slot.active) { slot.group.visible = false; continue; }
      const group = slot.group;
      if (slot.owner === 'player') (slot.front.material as THREE.MeshStandardMaterial).emissiveIntensity = (cardRevealed ? THREE.MathUtils.lerp(.70, .12, layProgress) : .70) * (state.event?.kind === 'blackout' && state.phase === 'PLAYER_DECISION' ? .055 : 1);
      slot.age = Math.max(0, time - slot.born);
      group.visible = true;
      if (state.phase === 'SWEEPING') {
        const eased = 1 - Math.pow(1 - sweepProgress, 3);
        group.position.lerpVectors(slot.fromPosition, deckStart, eased);
        group.position.y += Math.sin(eased * Math.PI) * .12;
        backQuaternion.setFromEuler(angle.set(-Math.PI / 2, Math.PI, -.1));
        group.quaternion.slerpQuaternions(slot.fromQuaternion, backQuaternion, eased);
        group.scale.setScalar(THREE.MathUtils.lerp(slot.fromScale, 1, eased));
        group.visible = sweepProgress < .99;
        group.userData.held = false; group.userData.tableFaceUp = false;
        continue;
      }
      if (slot.owner === 'player' && cardRevealed) {
        tableHome(slot, targetPosition);
        const eased = 1 - Math.pow(1 - layProgress, 3);
        group.position.lerpVectors(slot.fromPosition, targetPosition, eased);
        group.position.y += Math.sin(layProgress * Math.PI) * .13;
        targetQuaternion.setFromEuler(angle.set(-Math.PI / 2, 0, slot.index % 2 ? -.035 : .035));
        group.quaternion.slerpQuaternions(slot.fromQuaternion, targetQuaternion, eased);
        group.scale.setScalar(THREE.MathUtils.lerp(slot.fromScale, 1, eased));
        group.userData.held = false; group.userData.tableFaceUp = layProgress >= .98;
        continue;
      }
      if (slot.owner === 'player') {
        const progress = THREE.MathUtils.clamp(slot.age / (CONFIG.DEAL_SPEED / 1000), 0, 1);
        const offset = fanHome(slot, targetPosition);
        targetQuaternion.setFromEuler(angle.set(-.08, offset * .018, THREE.MathUtils.clamp(-offset * .13, -.24, .24)));
        if (progress >= 1) {
          if (group.parent !== heldRig) {
            // Respect the deal deadline even if a slow frame skipped the pickup arc.
            heldRig.attach(group); group.position.copy(targetPosition);
            group.quaternion.copy(targetQuaternion); group.scale.setScalar(.54);
          } else {
            const amount = 1 - Math.exp(-dt * 18);
            group.position.lerp(targetPosition, amount); group.quaternion.slerp(targetQuaternion, amount);
            group.scale.lerp(targetScale.setScalar(.54), amount);
          }
          group.userData.held = true;
        } else {
          if (group.parent !== scene) scene.attach(group);
          const slide = THREE.MathUtils.clamp(progress / .55, 0, 1);
          const pick = THREE.MathUtils.clamp((progress - .55) / .45, 0, 1);
          backQuaternion.setFromEuler(angle.set(-Math.PI / 2, Math.PI, 0));
          if (pick === 0) {
            group.position.lerpVectors(deckStart, pickup, 1 - Math.pow(1 - slide, 3));
            group.position.y += Math.sin(slide * Math.PI) * .014;
            group.quaternion.copy(backQuaternion); group.scale.setScalar(1);
          } else {
            targetPosition.applyMatrix4(heldRig.matrixWorld);
            targetQuaternion.premultiply(rigQuaternion);
            const eased = pick * pick * (3 - 2 * pick);
            group.position.lerpVectors(pickup, targetPosition, eased);
            group.position.y += Math.sin(pick * Math.PI) * .13;
            group.quaternion.slerpQuaternions(backQuaternion, targetQuaternion, eased);
            group.scale.setScalar(THREE.MathUtils.lerp(1, .54, eased));
          }
          group.userData.held = false;
        }
        // Delivery stays back-up on the felt. A face appears only as it is lifted.
        group.userData.tableFaceUp = false;
      } else {
        const progress = THREE.MathUtils.clamp(slot.age / (CONFIG.DEAL_SPEED / 1000), 0, 1);
        tableHome(slot, targetPosition);
        group.position.lerpVectors(deckStart, targetPosition, 1 - Math.pow(1 - progress, 3));
        group.position.y += Math.sin(progress * Math.PI) * .025;
        const hidden = slot.index === 1 && !cardRevealed;
        const flipProgress = showdownStartedAt < 0 ? 0 : THREE.MathUtils.clamp((time - showdownStartedAt) / .65, 0, 1);
        slot.flip = hidden ? Math.PI : slot.index === 1 ? Math.PI * Math.pow(1 - flipProgress, 3) : 0;
        const peek = state.phase === 'PEEKING' && hidden ? Math.sin(Math.min(1, elapsedShoot / .60) * Math.PI) : 0;
        group.rotation.set(-Math.PI / 2 + peek * .13, slot.flip, (slot.index % 2 ? -.035 : .035) + peek * .08);
        group.position.y += Math.abs(Math.sin(slot.flip)) * .235 + peek * .045;
        group.userData.held = false; group.userData.tableFaceUp = !hidden && progress >= .98;
      }
    }
  }

  function update(time: number, delta: number, state: ActorState) {
    const dt = Math.min(delta, .05);
    const smoothing = 1 - Math.exp(-dt * 8);
    const motion = state.reducedMotion ? .25 : 1;
    const fired = Math.max(0, Math.min(6, state.chambersFired ?? 0));
    const alive = state.dead !== 'ai';
    const room = state.roomNumber ?? 1;
    if (room !== currentRoom) {
      currentRoom = room; const index = room - 1;
      heads.forEach((object, i) => { object.visible = i === index; });
      costumes.forEach((object, i) => { object.visible = i === index; });
      captive.name = captiveNames[index]; captive.userData.roomNumber = room;
      for (const mesh of [torso, shoulders, leftUpper, leftLower, rightUpper, rightLower]) mesh.material = clothing[index];
      for (const hand of [leftHand, rightHand]) hand.traverse(object => {
        if (object instanceof THREE.Mesh) object.material = flesh[index];
      });
      torso.scale.x = shoulders.scale.x = room === 3 ? .84 : 1;
      slump = 0; captive.rotation.set(0, 0, 0); captive.position.set(0, .86, -1.65);
    }
    const breakdownOnset = OPPONENTS[room].breakdownStart - 1;
    const pressure = fired >= breakdownOnset ? fired - breakdownOnset + 1 : 0;
    const fear = alive ? (pressure + (state.roomNumber === 1 ? .55 : 0)) * motion : 0;
    const tell = state.phase === 'PLAYER_DECISION' && alive ? state.tell : null;
    const calm = tell?.disposition === 'calm';
    const doorFlinch = alive && state.phase === 'PLAYER_DECISION' ? eventDoorPulse(state.event, Date.now()) * motion : 0;
    const playerPull = state.phase === 'PLAYER_SHOOTING' ? THREE.MathUtils.clamp(state.triggerProgress ?? (state.suspense ? 1 : 0), 0, 1) : 0;
    actorTime = time;
    const stage = state.storyStage ?? '';
    if (stage !== lastStoryStage) {
      lastStoryStage = stage; storyStartedAt = time;
      if (String(state.phase) === 'ENDING_WIN' && stage === 'door') hostDoorStart.copy(host.position);
    }
    const storyElapsed = Math.max(0, time - storyStartedAt);
    const unhooding = String(state.phase) === 'OPENING' && (stage === 'hooded' || stage === 'unhood');
    const atExit = String(state.phase) === 'ENDING_WIN' && ['door', 'stairs', 'viewers', 'title'].includes(stage);
    const doorWalk = atExit && stage === 'door' ? THREE.MathUtils.clamp(storyElapsed / 1.2, 0, 1) : atExit ? 1 : 0;
    const hoodLift = stage === 'unhood' ? THREE.MathUtils.clamp(storyElapsed / .8, 0, 1) : 0;
    captiveHood.visible = unhooding && hoodLift < .99;
    captiveHood.position.set(-hoodLift * .30, 1.20 + hoodLift * .85, .015 - hoodLift * .05);
    captiveHood.rotation.z = -hoodLift * .22;
    const enteringRound = state.roundNumber !== lastRound;
    const replay = state.roundNumber === 1 && state.phase === 'SHUFFLING' && lastPhase !== 'SHUFFLING';
    if (enteringRound || replay) {
      lastRound = state.roundNumber;
      sweepStartedAt = -1;
      showdownStartedAt = state.revealed ? time : -1;
      if (state.roundNumber === 1) {
        stranger.rotation.set(0, 0, 0); stranger.position.y = .86; head.rotation.set(0, 0, 0);
        rightHand.position.set(.74, .055, .72); rightHand.rotation.set(0, .14, 0);
        leftHand.position.set(-.74, .055, .72);
        playerRight.group.position.set(.95, .925, 1.12);
        playerRight.group.rotation.set(0, Math.PI + .17, 0);
        slump = 0; gunBlend = 0; gun.position.copy(gunRest); gunMotionOffset.set(0, 0, 0); gun.rotation.set(-Math.PI / 2, 0, -.13);
        hammer.rotation.z = -.6; revolverCylinder.rotation.x = 0;
        lastSpinSerial = 0; spinStartedAt = -1; spinFrom = 0;
        lastPeekSerial = 0; peekStartedAt = -1; peekCard.visible = deckCorner.visible = false;
        heldRig.position.copy(heldRigRestPosition); playerHands.position.set(0, 0, 0);
        upperPack.position.set(0, .045, 0); upperPack.rotation.set(0, 0, 0);
      }
    }
    if (state.phase !== lastPhase) {
      elapsedShoot = 0; phaseStartedAt = time;
      if (state.phase === 'SWEEPING') {
        sweepStartedAt = time;
        cardSlots.filter(slot => slot.active).forEach(rememberWorld);
      }
      lastPhase = state.phase;
    }
    elapsedShoot = time - phaseStartedAt;
    const shuffling = state.phase === 'SHUFFLING';
    const shuffle = shuffling ? Math.sin(Math.min(1, elapsedShoot / .50) * Math.PI * 2) : 0;
    upperPack.position.set(shuffle * .14, .045 + Math.abs(shuffle) * .045, 0);
    upperPack.rotation.y = shuffle * .22;
    const dealing = state.phase === 'DEALING' || state.phase === 'HITTING' || state.phase === 'DEALER_TURN';
    const dealerAction = dealing || shuffling || state.phase === 'PEEKING' || state.phase === 'DEALER_PEEKING' || state.phase === 'SWEEPING' || state.phase === 'REVEAL';
    const aiShoots = state.phase === 'AI_SHOOTING';
    // Finish raising before the hold completes, leaving a steady, centered aim
    // through the last second rather than reaching it only after the shot.
    const playerPose = Math.max(THREE.MathUtils.smoothstep(playerPull, 0, .65), state.spinning === 'player' ? .55 : 0);
    const playerShoots = playerPose > 0;
    const lifting = aiShoots || playerShoots;
    gunBlend += ((lifting ? 1 : 0) - gunBlend) * smoothing;
    if (aiShoots) {
      gunTarget.copy(gunAI);
      gunPoseQuaternion.setFromEuler(new THREE.Euler(0, Math.PI - .3, -.03));
    } else {
      const view = camera ?? fallbackView;
      view.getWorldPosition(aimOrigin); view.getWorldQuaternion(aimCameraQuaternion);
      // The barrel runs along local +X. Put its mouth on the view's center ray,
      // pointing back toward the eye, rather than presenting the gun side-on.
      gunPlayer.copy(aimOffset).applyQuaternion(aimCameraQuaternion).add(aimOrigin);
      gunAimQuaternion.copy(aimCameraQuaternion).multiply(barrelToViewer);
      gunTarget.lerpVectors(gunRest, gunPlayer, playerPose);
      gunPoseQuaternion.slerpQuaternions(gunRestQuaternion, gunAimQuaternion, playerPose);
    }
    // Sway is a presentation offset, never an accumulated shift of the aim pose.
    gun.position.sub(gunMotionOffset);
    if (state.phase === 'PLAYER_SHOOTING' && playerPull > 0) {
      // Hold progress already follows elapsed time, including the release drain.
      // Another frame-clamped lerp can miss the firing deadline on a slow GPU.
      gun.position.copy(gunTarget); gun.quaternion.copy(gunPoseQuaternion);
    } else {
      gun.position.lerp(gunTarget, smoothing); gun.quaternion.slerp(gunPoseQuaternion, smoothing);
    }
    gunMotionOffset.set(0, 0, 0);
    if (lifting) gunMotionOffset.y = Math.sin(time * 8) * .00045;
    const tensionActive = state.chambersFired !== undefined && state.phase !== 'START' && state.phase !== 'GAME_OVER';
    const handTremble = tensionActive ? (.00035 + fired * .00055 + playerPull * .0035) * motion : 0;
    heldRig.position.set(heldRigRestPosition.x + Math.sin(time * 29) * handTremble, heldRigRestPosition.y + Math.sin(time * 23 + 1) * handTremble * .8, heldRigRestPosition.z);
    playerHands.position.set(Math.sin(time * 27 + 1) * handTremble, Math.sin(time * 31) * handTremble * .8, 0);
    if (lifting && tensionActive) {
      gunMotionOffset.x += Math.sin(time * 29) * handTremble;
      gunMotionOffset.y += Math.sin(time * 23 + 1) * handTremble;
    }
    gun.position.add(gunMotionOffset);
    const cock = aiShoots ? .75 : THREE.MathUtils.smoothstep(playerPull, .33, .72);
    hammer.rotation.z += ((-.6 - cock * .55) - hammer.rotation.z) * smoothing;
    if ((state.spinSerial ?? 0) !== lastSpinSerial) {
      lastSpinSerial = state.spinSerial ?? 0; spinStartedAt = time; spinFrom = revolverCylinder.rotation.x;
    }
    if (state.spinning && spinStartedAt >= 0) {
      const progress = THREE.MathUtils.clamp((time - spinStartedAt) / .8, 0, 1);
      revolverCylinder.rotation.x = spinFrom + Math.PI * 6 * (1 - Math.pow(1 - progress, 3));
    } else {
      if (spinStartedAt >= 0) revolverCylinder.rotation.x = 0;
      spinStartedAt = -1;
      const notch = THREE.MathUtils.smoothstep(playerPull, .66, .84) * Math.PI / 3;
      revolverCylinder.rotation.x += (notch - revolverCylinder.rotation.x) * smoothing;
    }
    gun.userData.holdProgress = playerPull;
    gun.userData.tremble = handTremble;
    const peekSerial = state.peekSerial ?? 0;
    if (peekSerial !== lastPeekSerial) { lastPeekSerial = peekSerial; peekStartedAt = time; }
    const abilityPeek = !!state.peekActor && peekStartedAt >= 0;
    const peekAge = Math.max(0, time - peekStartedAt);
    const cornerLift = abilityPeek ? Math.sin(THREE.MathUtils.clamp(peekAge / .7, 0, 1) * Math.PI) : 0;
    deckCorner.visible = abilityPeek && cornerLift > .001;
    deckCorner.rotation.x = -.28 * cornerLift;
    const privateCard = state.phase === 'PLAYER_DECISION' ? state.peekedCard : null;
    peekCard.visible = !!privateCard;
    if (privateCard && peekIdentity !== privateCard.id) {
      peekIdentity = privateCard.id;
      peekMaterial.map?.dispose(); peekMaterial.map = cardTexture(privateCard);
      peekMaterial.emissiveMap = peekMaterial.map; peekMaterial.needsUpdate = true;
    } else if (!privateCard && peekIdentity) {
      peekIdentity = ''; peekMaterial.map?.dispose(); peekMaterial.map = peekMaterial.emissiveMap = null; peekMaterial.needsUpdate = true;
    }
    peekCard.userData.identity = privateCard?.id ?? null;
    peekMaterial.emissiveIntensity = state.event?.kind === 'blackout' ? .035 : .65;

    slump += ((state.dead === 'ai' ? 1 : 0) - slump) * (1 - Math.exp(-dt * (state.dead ? 2.5 : 12)));
    stranger.rotation.x = slump * 1.43;
    stranger.rotation.z = slump * -.13;
    stranger.position.y = .86 - slump * .045;
    const breathRate = (calm ? 1.02 : 1.3) + fear * .42;
    const breathAmplitude = (calm ? (tell?.kind === 'breathing' ? .013 : .006) : .008) * (1 + fear * .45);
    torso.scale.y = 1 + Math.sin(time * breathRate) * breathAmplitude * (1 - slump);
    const twitch = tell?.kind === 'twitch' ? Math.max(0, Math.sin(time * 2.9)) ** 20 * .024 * motion : 0;
    shoulders.position.y = .82 + Math.sin(time * breathRate) * breathAmplitude * .5 * (1 - slump) + twitch - doorFlinch * .022;
    head.rotation.z = (calm ? 0 : Math.sin(time * .37) * .043 * (1 - slump)) + Math.sin(time * 18) * fear * .002;
    head.rotation.y = (calm ? 0 : Math.sin(time * .23) * .055 * (1 - slump)) + (tell?.kind === 'avert' ? (.15 + Math.sin(time * .85) * .045) * motion : 0);
    const peekMotion = state.peekActor === 'ai' ? Math.sin(Math.min(1, peekAge / .70) * Math.PI) : 0;
    // Only the speaking character receives a syllable envelope.
    const activeSpeaker = state.speaker === undefined ? 'captive' : state.speaker;
    const captiveVoice = activeSpeaker === 'captive' ? state.captiveVoiceLevel ?? state.voiceLevel ?? 0 : 0;
    const voiceBob = state.dead === 'ai' ? 0 : THREE.MathUtils.clamp(captiveVoice, 0, 1) * motion;
    head.position.y = 1.19 + voiceBob * .0025;
    head.rotation.x = (calm ? 0 : Math.sin(time * .61) * .018) + peekMotion * .19 + voiceBob * .010 + Math.sin(time * 13) * fear * .0025 - doorFlinch * .09;
    stranger.position.z = -1.65 - doorFlinch * .025;
    if (room === 3 && alive && state.phase === 'PLAYER_DECISION') head.rotation.y -= Math.max(0, Math.sin(time * .31)) ** 12 * .19 * motion;
    const touch = tell?.kind === 'touch' ? Math.max(0, Math.sin(time * 1.6)) ** 4 * motion : 0;
    if (touch > .001) handTarget.set(THREE.MathUtils.lerp(-.74, .45, touch), .055 + touch * .065, THREE.MathUtils.lerp(.72, 1.30, touch));
    else handTarget.set(-.74, .055 + (calm ? 0 : Math.sin(time * 1.2) * .001), .72);
    handTarget.x += Math.sin(time * 19) * fear * .0017; handTarget.y += Math.sin(time * 23) * fear * .0015;
    leftHand.position.lerp(handTarget, smoothing);
    for (let i = 0; i < left.fingers.length; i++) {
      const tap = calm ? 0 : Math.max(0, Math.sin(time * (tell?.kind === 'tap' ? 10 : 3.2) + i * .5)) ** 10;
      left.fingers[i].rotation.x = -.07 - tap * (tell?.kind === 'tap' ? .36 : .22) * (1 - slump) * motion - Math.max(0, Math.sin(time * 12 + i)) * fear * .012;
      right.fingers[i].rotation.x = aiShoots ? -.65 : -.06;
    }
    if (aiShoots) {
      handTarget.copy(gun.position);
      handTarget.y -= .86 + .10;
      handTarget.z += 1.65;
      rightHand.position.lerp(handTarget, smoothing);
      rightHand.rotation.x += (-1.0 - rightHand.rotation.x) * smoothing;
      rightHand.rotation.z += (-.9 - rightHand.rotation.z) * smoothing;
    } else {
      handTarget.set(.74 + Math.sin(time * 17) * fear * .0017, .055 + Math.sin(time * 21) * fear * .0015, .72);
      rightHand.position.lerp(handTarget, smoothing);
      rightHand.rotation.x += (0 - rightHand.rotation.x) * smoothing;
      rightHand.rotation.z += (0 - rightHand.rotation.z) * smoothing;
    }
    animatedElbow.copy(rightElbow);
    animatedElbow.y += gunBlend * .28 * (aiShoots ? 1 : 0);
    animatedElbow.z -= gunBlend * .2 * (aiShoots ? 1 : 0);
    segment(rightUpper, rightShoulder, animatedElbow);
    segment(rightLower, animatedElbow, rightHand.position);
    segment(leftLower, leftElbow, leftHand.position);
    const heldCount = (currentRound ?? demo).player.length;
    const collecting = !!newest && newest.owner === 'player' && newest.age < CONFIG.DEAL_SPEED / 1000;
    const dip = collecting ? Math.sin(Math.min(1, newest!.age / (CONFIG.DEAL_SPEED / 1000)) * Math.PI) : 0;
    if (cardRevealed || !heldCount || state.phase === 'SWEEPING') handTarget.set(-.42, -.48, -1.12);
    else handTarget.set(-.10, -.45 - dip * .045, -.88 - dip * .10);
    playerLeft.group.position.lerp(handTarget, smoothing);
    playerLeft.group.rotation.x += ((cardRevealed ? -1.2 : -Math.PI / 2 + .20) - playerLeft.group.rotation.x) * smoothing;
    for (const finger of playerLeft.fingers) finger.rotation.x = heldCount && !cardRevealed ? -.95 : -.08;
    segment(leftSleeve, playerLeftStart, playerLeft.group.position);
    if (state.phase === 'PLAYER_SHOOTING' && playerPull > 0) {
      // Attach the palm beside the actual grip in gun space. Its pose follows
      // the same elapsed-time raise, even when only a few frames are rendered.
      gun.localToWorld(handTarget.copy(gripOffset));
      playerHands.worldToLocal(handTarget);
      playerRight.group.position.copy(handTarget);
      gun.getWorldQuaternion(gripWorldQuaternion).multiply(gripRotation);
      playerHands.getWorldQuaternion(handParentQuaternion).invert();
      playerRight.group.quaternion.copy(handParentQuaternion).multiply(gripWorldQuaternion);
    } else if (playerShoots) {
      handTarget.copy(gun.position);
      handTarget.y -= .14;
      handTarget.z += .05;
      playerRight.group.position.lerp(handTarget, smoothing);
      playerRight.group.quaternion.slerp(playerRightSpinQuaternion, smoothing);
    } else {
      handTarget.set(.95, .925, 1.12);
      playerRight.group.position.lerp(handTarget, smoothing);
      playerRight.group.quaternion.slerp(playerRightIdleQuaternion, smoothing);
      if (playerRight.group.quaternion.angleTo(playerRightIdleQuaternion) < .0001) {
        playerRight.group.rotation.set(0, Math.PI + .17, 0);
      }
    }
    for (let i = 0; i < playerRight.fingers.length; i++) {
      playerRight.fingers[i].rotation.x = state.phase === 'PLAYER_SHOOTING' && playerPull > 0 ? i === 0 ? -.5 : -1.15 : 0;
    }
    segment(rightSleeve, playerRightStart, playerRight.group.position);

    // Dealer gestures belong exclusively to the Host; captive hands only tell or shoot.
    host.rotation.x = host.rotation.z = 0;
    hostPositionTarget.set(unhooding ? -.78 : -1.95, .86, unhooding ? -1.35 : -.45);
    if (atExit) {
      if (doorWalk < .45) hostPositionTarget.lerpVectors(hostDoorStart, hostDoorWaypoint, doorWalk / .45);
      else hostPositionTarget.lerpVectors(hostDoorWaypoint, hostDoorFinish, (doorWalk - .45) / .55);
      host.position.copy(hostPositionTarget);
    } else host.position.lerp(hostPositionTarget, smoothing);
    host.rotation.y += ((atExit ? 2.2 : 1.0) - host.rotation.y) * smoothing;
    const walk = atExit && doorWalk < 1 ? 1 : 0;
    hostLegParts.forEach((leg, index) => { leg.rotation.x = Math.sin(time * 10 + index * Math.PI) * .23 * walk * motion; });
    host.position.y += Math.abs(Math.sin(time * 10)) * .012 * walk * motion;
    host.userData.openingDoor = atExit;
    const hostVoice = activeSpeaker === 'host' ? state.hostVoiceLevel ?? state.voiceLevel ?? 0 : 0;
    const hostBob = THREE.MathUtils.clamp(hostVoice, 0, 1) * motion;
    hostHead.position.y = 1.19 + hostBob * .0025;
    hostHead.rotation.set((unhooding ? -.12 : Math.sin(time * .35) * .010) + hostBob * .010, unhooding ? 0 : -.25, 0);
    hostTorso.scale.y = 1 + Math.sin(time * .98) * .006;
    hostShoulders.position.y = .82 + Math.sin(time * .98) * .003;
    host.updateWorldMatrix(true, false);
    hostHandTarget.set(deckStart.x - .12, TABLE_Y + .065 + Math.abs(shuffle) * .035, deckStart.z + .19);
    if (shuffling) hostHandTarget.x += shuffle * .09;
    host.worldToLocal(hostHandTarget);
    if (unhooding) hostHandTarget.set(-.34, .28, .44);
    if (atExit) hostHandTarget.set(-.32, .24, .35);
    hostLeftHand.position.lerp(hostHandTarget, smoothing);
    const stroke = dealing && newest ? Math.sin(Math.min(1, newest.age / (CONFIG.DEAL_SPEED / 1000)) * Math.PI) : 0;
    hostHandTarget.set(deckStart.x + .10 + stroke * .52, TABLE_Y + .12 + stroke * .055, deckStart.z + stroke * .30);
    if (atExit) {
      if (doorWalk > .75) hostHandTarget.set(2.70, 1.20, -4.0);
      else host.localToWorld(hostHandTarget.set(.35, .25 + Math.sin(time * 10) * .07, .4));
    } else if (unhooding) {
      hostHandTarget.set(-.13 - hoodLift * .30, 2.25 + hoodLift * .75, -1.57);
    } else if (state.phase === 'REVEAL' || state.phase === 'PEEKING') {
      hostHandTarget.set(-.40, TABLE_Y + .11 + Math.sin(Math.min(1, elapsedShoot / .65) * Math.PI) * .07, -.32);
    } else if (state.phase === 'SWEEPING') {
      const sweep = Math.sin(Math.min(1, elapsedShoot / .60) * Math.PI);
      hostHandTarget.set(deckStart.x + sweep * .72, TABLE_Y + .15, deckStart.z + sweep * .48);
    } else if (abilityPeek) hostHandTarget.set(deckStart.x + .12, TABLE_Y + .13 + cornerLift * .10, deckStart.z + .12);
    else if (!dealerAction) hostHandTarget.set(-1.22, TABLE_Y + .07, -.50);
    host.worldToLocal(hostHandTarget); hostRightHand.position.lerp(hostHandTarget, smoothing);
    hostLeftHand.rotation.set(-.02, -.14, 0); hostRightHand.rotation.set(dealerAction ? -.12 : 0, .14, dealerAction ? -.10 : 0);
    hostElbow.copy(leftElbow); hostElbow.y += dealerAction ? .06 : 0;
    segment(hostLeftUpper, leftShoulder, hostElbow); segment(hostLeftLower, hostElbow, hostLeftHand.position);
    hostElbow.copy(rightElbow); hostElbow.y += dealerAction ? .10 : 0;
    segment(hostRightUpper, rightShoulder, hostElbow); segment(hostRightLower, hostElbow, hostRightHand.position);
    for (const hand of [hostLeftHand, hostRightHand]) {
      for (const finger of hand.children) if (finger instanceof THREE.Group) finger.rotation.x = shuffling ? -.45 : dealing ? -.25 : -.08;
    }

    animateCards(time, dt, state);
  }
  return { stranger, captive, head, captiveHead: head, leftHand, rightHand, host, hostHead, hostLeftHand, hostRightHand, captiveHood, playerHands, heldRig, deck, gun, hammer, cylinder: revolverCylinder, peekCard, peekFront, deckCorner, cardSlots, setCards, update };
}
