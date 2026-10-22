import * as THREE from 'three';
import type { Card, GamePhase, Round } from '../game';
import { mergeStaticMeshes } from './merge';

export type ActorState = {
  phase: GamePhase;
  suspense: boolean;
  dead: 'player' | 'ai' | null;
  shotEffect: 'click' | 'shot' | null;
  roundNumber: number;
  revealed: boolean;
};

type CardSlot = { group: THREE.Group; front: THREE.Mesh; back: THREE.Mesh };
const SUITS = { spades: '♠', clubs: '♣', hearts: '♥', diamonds: '♦' };
const TABLE_Y = .8865;
const demo: Round = {
  player: [{ suit: 'spades', rank: '8', id: 'demo-spade' }, { suit: 'hearts', rank: 'K', id: 'demo-king' }],
  ai: [{ suit: 'clubs', rank: 'A', id: 'demo-ace' }, { suit: 'diamonds', rank: '7', id: 'demo-hidden' }],
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
  const chamber = cylinder(gun, .073, .115, [-.018, .072, 0], steel, 10);
  chamber.rotation.z = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const groove = cylinder(gun, .010, .082, [-.014, .072 + Math.cos(a) * .068, Math.sin(a) * .068], dark, 5);
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
  hammer.rotation.z = -.6;
  mergeStaticMeshes(gun);
  return gun;
}

export function createActors(scene: THREE.Scene) {
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

  const playerHands = new THREE.Group();
  playerHands.name = 'First-person hands and sleeves';
  scene.add(playerHands);
  const playerLeft = makeHand(skinShadow), playerRight = makeHand(skinShadow);
  playerHands.add(playerLeft.group, playerRight.group);
  playerLeft.group.position.set(-.95, .925, 1.12);
  playerRight.group.position.set(.95, .925, 1.12);
  playerLeft.group.rotation.y = Math.PI - .17;
  playerRight.group.rotation.y = Math.PI + .17;
  playerRight.group.scale.x = -1;
  const leftSleeve = cylinder(playerHands, .115, 1, [0, 0, 0], suit, 6);
  const rightSleeve = cylinder(playerHands, .115, 1, [0, 0, 0], suit, 6);
  const playerLeftStart = new THREE.Vector3(-1.08, .72, 1.95);
  const playerRightStart = new THREE.Vector3(1.08, .72, 1.95);
  segment(leftSleeve, playerLeftStart, playerLeft.group.position);
  segment(rightSleeve, playerRightStart, playerRight.group.position);

  const gun = makeRevolver();
  gun.position.set(.12, .962, .02);
  gun.rotation.set(-Math.PI / 2, 0, -.13);
  scene.add(gun);
  const gunRest = new THREE.Vector3(.12, .962, .02);
  const gunAI = new THREE.Vector3(.47, 2.00, -1.48);
  const gunPlayer = new THREE.Vector3(.58, 1.50, 1.65);
  const gunTarget = new THREE.Vector3();
  const handTarget = new THREE.Vector3();
  let gunBlend = 0;

  const cardSlots: CardSlot[] = [];
  const backTexture = cardBackTexture();
  const cardHomes = [
    new THREE.Vector3(-.28, TABLE_Y + .005, .73),
    new THREE.Vector3(.28, TABLE_Y + .008, .73),
    new THREE.Vector3(-.25, TABLE_Y + .005, -.72),
    new THREE.Vector3(.25, TABLE_Y + .008, -.72),
  ];
  for (let i = 0; i < 4; i++) {
    const group = new THREE.Group();
    group.name = i < 2 ? `Player card ${i + 1}` : `Stranger card ${i - 1}`;
    group.rotation.x = -Math.PI / 2;
    const frontMaterial = new THREE.MeshStandardMaterial({color:0xffffff, roughness:1, emissive:0x655e41, emissiveIntensity:.22});
    const backMaterial = new THREE.MeshStandardMaterial({map:backTexture, roughness:1, emissive:0x253a2a, emissiveIntensity:.12});
    const geometry = new THREE.PlaneGeometry(.47, .66);
    const front = new THREE.Mesh(geometry, frontMaterial);
    const back = new THREE.Mesh(geometry, backMaterial);
    front.position.z = .0045;
    back.position.z = -.0045;
    back.rotation.y = Math.PI;
    front.receiveShadow = true;
    back.receiveShadow = true;
    box(group, [.473, .663, .008], [0, 0, 0], surface(0xa5a68c));
    group.add(front, back);
    group.position.copy(cardHomes[i]);
    scene.add(group);
    cardSlots.push({group, front, back});
  }
  let currentRound: Round | null = null;
  let cardRevealed = false;
  function setCards(round: Round | null, revealed: boolean) {
    currentRound = round;
    cardRevealed = revealed;
    const dealt = round ?? demo;
    const cards = [...dealt.player, ...dealt.ai];
    cardSlots.forEach((slot, i) => {
      const secret = i === 3 && !revealed;
      const identity = secret ? 'unrevealed' : cards[i].id;
      if (slot.front.userData.identity === identity) return;
      slot.front.userData.identity = identity;
      const material = slot.front.material as THREE.MeshStandardMaterial;
      material.map?.dispose();
      material.map = secret ? null : cardTexture(cards[i]);
      material.color.setHex(secret ? 0xa8aa91 : 0xffffff);
      material.needsUpdate = true;
    });
  }
  setCards(null, false);
  cardSlots[3].group.rotation.y = Math.PI;
  let lastRound = 0, dealTime = 10, lastPhase: GamePhase = 'START';
  let elapsedShoot = 0;
  let slump = 0;

  function update(time: number, delta: number, state: ActorState) {
    const dt = Math.min(delta, .05);
    const smoothing = 1 - Math.exp(-dt * 8);
    // A fatal first hand can replay directly from round 1 back to round 1.
    // Detect the new DEALING phase as well as a changed round number.
    const replay = state.phase === 'DEALING' && state.roundNumber === 1 && lastPhase !== 'DEALING';
    if (state.roundNumber !== lastRound || replay) {
      lastRound = state.roundNumber;
      dealTime = 0;
      if (state.roundNumber === 1) {
        stranger.rotation.set(0, 0, 0);
        stranger.position.y = .86;
        head.rotation.set(0, 0, 0);
        rightHand.position.set(.74, .055, .72);
        rightHand.rotation.set(0, .14, 0);
        playerRight.group.position.set(.95, .925, 1.12);
        playerRight.group.rotation.set(0, Math.PI + .17, 0);
        slump = 0;
        gunBlend = 0;
        gun.position.copy(gunRest);
        gun.rotation.set(-Math.PI / 2, 0, -.13);
        cardSlots.forEach((slot, index) => { slot.group.rotation.y = index === 3 && !state.revealed ? Math.PI : 0; });
      }
    }
    if (state.phase !== lastPhase) { elapsedShoot = 0; lastPhase = state.phase; }
    elapsedShoot += dt;
    dealTime += dt;
    const aiShoots = state.phase === 'AI_SHOOTING';
    const playerShoots = state.phase === 'PLAYER_SHOOTING' && state.suspense;
    const lifting = aiShoots || playerShoots;
    gunBlend += ((lifting ? 1 : 0) - gunBlend) * smoothing;
    gunTarget.copy(aiShoots ? gunAI : playerShoots ? gunPlayer : gunRest);
    gun.position.lerp(gunTarget, smoothing);
    const targetX = lifting ? 0 : -Math.PI / 2;
    const targetY = aiShoots ? Math.PI - .3 : playerShoots ? -2.08 : 0;
    const targetZ = aiShoots ? -.03 : playerShoots ? .17 : -.13;
    gun.rotation.x += (targetX - gun.rotation.x) * smoothing;
    gun.rotation.y += (targetY - gun.rotation.y) * smoothing;
    gun.rotation.z += (targetZ - gun.rotation.z) * smoothing;
    if (lifting) gun.position.y += Math.sin(time * 8) * .00045;

    slump += ((state.dead === 'ai' ? 1 : 0) - slump) * (1 - Math.exp(-dt * (state.dead ? 2.5 : 12)));
    stranger.rotation.x = slump * 1.43;
    stranger.rotation.z = slump * -.13;
    stranger.position.y = .86 - slump * .045;
    torso.scale.y = 1 + Math.sin(time * 1.3) * .008 * (1 - slump);
    shoulders.position.y = .82 + Math.sin(time * 1.3) * .004 * (1 - slump);
    head.rotation.z = Math.sin(time * .37) * .043 * (1 - slump);
    head.rotation.y = Math.sin(time * .23) * .055 * (1 - slump);
    head.rotation.x = Math.sin(time * .61) * .018;
    leftHand.position.y = .055 + Math.sin(time * 1.2) * .001;
    for (let i = 0; i < left.fingers.length; i++) {
      const tap = Math.max(0, Math.sin(time * 3.2 + i * .5)) ** 10;
      left.fingers[i].rotation.x = -.07 - tap * .22 * (1 - slump);
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
      handTarget.set(.74, .055, .72);
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
    if (playerShoots) {
      handTarget.copy(gun.position);
      handTarget.y -= .14;
      handTarget.z += .05;
      playerRight.group.position.lerp(handTarget, smoothing);
      playerRight.group.rotation.x += (-.8 - playerRight.group.rotation.x) * smoothing;
      playerRight.group.rotation.z += (.6 - playerRight.group.rotation.z) * smoothing;
    } else {
      handTarget.set(.95, .925, 1.12);
      playerRight.group.position.lerp(handTarget, smoothing);
      playerRight.group.rotation.x += (0 - playerRight.group.rotation.x) * smoothing;
      playerRight.group.rotation.z += (0 - playerRight.group.rotation.z) * smoothing;
    }
    segment(rightSleeve, playerRightStart, playerRight.group.position);

    cardSlots.forEach((slot, i) => {
      const home = cardHomes[i];
      const progress = THREE.MathUtils.clamp((dealTime - i * .085) / .58, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      slot.group.position.x = THREE.MathUtils.lerp(.34 + i * .025, home.x, eased);
      slot.group.position.z = THREE.MathUtils.lerp(-1.0, home.z, eased);
      const hidden = i === 3 && !cardRevealed;
      const target = hidden ? Math.PI : 0;
      slot.group.rotation.y += (target - slot.group.rotation.y) * (1 - Math.exp(-dt * 8));
      const flipLift = Math.abs(Math.sin(slot.group.rotation.y)) * .235;
      slot.group.position.y = home.y + Math.sin(progress * Math.PI) * .09 + flipLift;
      slot.group.rotation.z = (i % 2 ? -.045 : .045) + (1 - eased) * .17;
      slot.group.visible = currentRound !== null || state.phase === 'START';
    });
  }
  return { stranger, head, leftHand, rightHand, playerHands, gun, cardSlots, setCards, update };
}
