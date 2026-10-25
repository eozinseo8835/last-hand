import {lookAtTarget} from './gaze';
import { createBurlapHood } from './hood';
import { restoreNearCameraHiding, applyNearCameraHiding } from './visibility';
import * as THREE from 'three';
import { CONFIG, type Card, type GamePhase, type Round } from '../game';
import { mergeStaticMeshes } from './merge';
import { cinematicProgress, type CinematicState } from '../cinematics';
import { bodyLanguage } from '../bodyLanguage';
import { eventDoorPulse, type OpponentTell, type RoundEvent, type Side } from '../tension';
import { reactionLevel, type AmbientEvent, type DistantShot } from '../roomLife';
import type { Attention } from '../attention';
import { OPPONENTS } from '../campaign';
import { CARD_WIDTH, CARD_HEIGHT, DECK_POSITION, GUN_REST, GUN_PICKUP, tableCardPosition, playerPeekDeck } from '../tableLayout';
import { gunTransferProgress, type GunTransfer } from '../gunTransfer';
import { createCharacter } from './skeleton';
import { FORCED_SHOT, type PoseName, type DebugPoseName } from './poses';
import { createRevolverModel, MUZZLE_LOCAL, GRIP_SOCKET } from './revolver';
import { routePoint } from './choreography';
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
  addressedTo?: 'host'|'captive'|'player';
  speaker?: 'host' | 'captive' | null;
  hostVoiceLevel?: number;
  captiveVoiceLevel?: number;
  storyStage?: string;
  cinematic?: CinematicState | null;
  tiesCut?: { player: boolean; ai: boolean };
  distantShot?: DistantShot | null;
  ambientEvent?: AmbientEvent | null;
  aiShotStartedAt?: number | null;
  aiShotDurationMs?: number | null;
  attention?: Attention; stress?: number; caught?: 'host' | 'captive' | 'ai' | null;
  peekStartedAt?: number | null; forceShotAt?: number | null;
  gunTransfer?: GunTransfer | null;
};

type CardSlot = {
  group: THREE.Group; front: THREE.Mesh; back: THREE.Mesh;
  owner: 'player' | 'ai'; index: number; active: boolean; age: number;
  born: number; serial: number; identity: string; flip: number;
  fromPosition: THREE.Vector3; fromQuaternion: THREE.Quaternion; fromScale: number;
};
const SUITS = { spades: '♠', clubs: '♣', hearts: '♥', diamonds: '♦' };
const TABLE_Y = .75;
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
/** Card faces are drawn locally; the unrevealed face never receives its secret texture. */
function cardTexture(card: Card) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 224;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#f2edd7';
  context.fillRect(0, 0, 160, 224);
  context.strokeStyle = '#a9a58f';
  context.lineWidth = 3;
  context.strokeRect(4, 4, 152, 216);
  context.fillStyle = card.suit === 'hearts' || card.suit === 'diamonds' ? '#a01919' : '#08130e';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.font = 'bold 49px monospace';
  context.fillText(card.rank, 11, 9);
  context.font = 'bold 42px Georgia, serif';
  context.fillText(SUITS[card.suit], 11, 58);
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
  texture.userData.cardId = card.id;
  texture.userData.rank = card.rank; texture.userData.suit = card.suit;
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


/** The production scene and the dev pose viewer share these exact rigs and model. */
export function createActors(scene: THREE.Scene, camera?: THREE.Camera) {
  const view = camera ?? new THREE.PerspectiveCamera(68,16/9,.055,28);
  if(!camera) { view.position.set(0,1.20,1.05); view.rotation.x=-.12; scene.add(view); }
  const captiveRig=createCharacter('captive',1), hostRig=createCharacter('host',1), playerRig=createCharacter('player',1);
  const guardRigs=[createCharacter('guard',1),createCharacter('guard',1)];
  const captive=captiveRig.group, host=hostRig.group, playerHands=playerRig.group;
  captive.position.set(0,.45,-.90); host.position.set(-.70,.90,-.35);
  scene.add(captive,host); view.add(playerHands); playerHands.position.set(0,-.75,0);
  captive.userData={actorRole:'captive',canShoot:true,canDie:true};
  host.userData={actorRole:'host',canShoot:true,canDie:false}; playerHands.userData.actorRole='player';
  guardRigs.forEach((rig,index)=>{rig.group.visible=false;rig.group.name=`Silent guard ${index+1}`;rig.group.userData.actorRole='guard';scene.add(rig.group);});
  const head=captiveRig.head, hostHead=hostRig.head;
  const leftHand=captiveRig.arms.left.hand, rightHand=captiveRig.arms.right.hand;
  const hostLeftHand=hostRig.arms.left.hand, hostRightHand=hostRig.arms.right.hand;
  const playerLeft=playerRig.arms.left.hand,playerRight=playerRig.arms.right.hand;
  playerRight.name='Player right gripping hand';
  // The whole character hierarchy remains intact. First-person body/clothes are
  // hidden individually, so their shoulder bones continue to drive both arms.
  const armMeshes=new Set<THREE.Object3D>();
  for(const arm of [playerRig.arms.left,playerRig.arms.right]) arm.shoulder.traverse(object=>armMeshes.add(object));
  playerHands.traverse(object=>{if(object instanceof THREE.Mesh && !armMeshes.has(object))object.visible=false;});
  const heldRig=new THREE.Group(); heldRig.name='Hand-held player card fan'; view.add(heldRig);
  const chair=new THREE.Group();chair.name='Captive chair';chair.position.set(0,0,-.90);scene.add(chair);
  const chairMaterial=surface(0x252e26,.25,.8);
  box(chair,[.43,.045,.38],[0,.4275,0],chairMaterial);
  box(chair,[.43,.47,.035],[0,.71,-.18],chairMaterial);
  for(const x of [-.175,.175])for(const z of [-.15,.15]) box(chair,[.026,.43,.026],[x,.215,z],chairMaterial);
  mergeStaticMeshes(chair);
  const hoodMaterial=surface(0x514630,0,1);
  const hood=createBurlapHood(),captiveHood=hood.group;head.add(captiveHood);captiveHood.visible=false;
  const zipMaterial=surface(0xccc6a6);
  const captiveTie=new THREE.Mesh(new THREE.TorusGeometry(.036,.003,4,10),zipMaterial);captiveTie.visible=false;scene.add(captiveTie);
  const playerTie=captiveTie.clone();scene.add(playerTie);
  const cutter=new THREE.Group();cutter.name='Host tie cutter';
  box(cutter,[.015,.05,.018],[0,.015,.06],surface(0x343d35,.5));box(cutter,[.008,.025,.04],[0,.045,.08],surface(0x969b8d,.7));hostRightHand.add(cutter);cutter.visible=false;
  const guards=guardRigs.map(rig=>{
    const foldedHoods=new THREE.Group();foldedHoods.name='Pocketed burlap hoods';rig.pelvis.add(foldedHoods);foldedHoods.position.set(.13,.05,.09);
    for(let i=0;i<2;i++){const mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(.055,0),hoodMaterial);mesh.position.x=i*.055;foldedHoods.add(mesh);}foldedHoods.visible=false;
    return {group:rig.group,head:rig.head,foldedHoods,rig};
  });
  const model=createRevolverModel();const {gun,hammer}=model;const revolverCylinder=model.cylinder;
  scene.add(gun);gun.position.set(...GUN_REST);gun.rotation.x=-Math.PI/2;
  const gunRest=new THREE.Vector3(...GUN_REST),gunRestQuaternion=gun.quaternion.clone();
  const socketPosition=new THREE.Vector3(...GRIP_SOCKET.position),socketQuaternion=new THREE.Quaternion(...GRIP_SOCKET.quaternion);
  const muzzlePoint=new THREE.Vector3(...MUZZLE_LOCAL);
  let gunHolder:'player'|'ai'|'host'|null=null,latchedShooter:Side|null=null;
  let shotAt=-Infinity,dropAt=-Infinity,priorShotEffect:ActorState['shotEffect']=null;
  const shotPosition=new THREE.Vector3(),shotQuaternion=new THREE.Quaternion();
  let debugPose:DebugPoseName|null=null,debugRoom:1|2|3=1,currentRoom=1;
  let lastSpinSerial=0,spinStartedAt=-1,spinFrom=0,lastPeekSerial=0,peekStartedAt=-1,peekIdentity='';
  const cardSlots: CardSlot[] = [];
  const backTexture = cardBackTexture();
  const backMaterial = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 1, emissive: 0x253a2a, emissiveIntensity: .12 });
  const edgeMaterial = surface(0xa5a68c);
  const deck = new THREE.Group();
  deck.name = 'The Host’s deck';
  deck.userData.owner = 'host';
  deck.position.set(...DECK_POSITION);
  scene.add(deck);
  const lowerPack = new THREE.Group(), upperPack = new THREE.Group();
  upperPack.name='Shuffling upper pack';
  deck.add(lowerPack, upperPack);
  upperPack.position.y = .010;
  for (const pack of [lowerPack, upperPack]) {
    box(pack, [CARD_WIDTH,.016,CARD_HEIGHT], [0, 0, 0], edgeMaterial);
    for (let i = 0; i < 3; i++) box(pack, [CARD_WIDTH+.001,.001,CARD_HEIGHT+.001], [0, -.006 + i * .005, 0], surface(0x656e57));
    const top = new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH,CARD_HEIGHT), backMaterial);
    top.rotation.x = -Math.PI / 2; top.position.y = .009;
    top.receiveShadow = true; pack.add(top); mergeStaticMeshes(pack);
  }
  const deckStart = new THREE.Vector3(DECK_POSITION[0], TABLE_Y + .04, DECK_POSITION[2]);
  const pickup = new THREE.Vector3(-.06, TABLE_Y + .01, .50);
  // A small hinged triangle remains attached to the top of the pack. The
  // underside samples just its own corner index, never an airborne card face.
  const deckCorner = new THREE.Group(); deckCorner.name = 'Hinged top-card corner';
  deckCorner.position.set(.015, TABLE_Y + .045 - DECK_POSITION[1], .03);
  const cornerGeometry = new THREE.BufferGeometry();
  cornerGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, .03,0,0, .03,0,.04],3));
  cornerGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([.34,.72, .34,1, 0,1],2));
  cornerGeometry.computeVertexNormals();
  const peekMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: .55 });
  const peekFront = new THREE.Mesh(cornerGeometry, peekMaterial); peekFront.name = 'Attached corner index';
  const cornerBack = new THREE.Mesh(cornerGeometry, backMaterial.clone());
  (cornerBack.material as THREE.Material).side = THREE.BackSide;
  deckCorner.add(peekFront, cornerBack); deckCorner.visible = false; deck.add(deckCorner);
  // Compatibility reference identifies the attached corner; there is no private floating card.
  const peekCard = deckCorner;
  const targetPosition = new THREE.Vector3(), targetScale = new THREE.Vector3();
  const targetQuaternion = new THREE.Quaternion(), rigQuaternion = new THREE.Quaternion();
  const backQuaternion = new THREE.Quaternion();
  const angle = new THREE.Euler();
  let currentRound: Round | null = null, cardRevealed = false;
  let actorTime = 0, lastRound = 0, lastPhase: GamePhase = 'START';
  let hostGestureAt=-Infinity,lastSpeaker:ActorState['speaker']=null;
  let elapsedShoot = 0, phaseStartedAt = 0, showdownStartedAt = -1, sweepStartedAt = -1;
  let serial = 0, newest: CardSlot | null = null, slump = 0;

  function makeSlot(owner: 'player' | 'ai', index: number): CardSlot {
    const group = new THREE.Group();
    group.name = `${owner === 'player' ? 'Player' : 'Captive'} card ${index + 1}`;
    group.userData = { owner, index, held: false, tableFaceUp: false };
    const frontMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: owner === 'player' ? .70 : .52 });
    const geometry = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);
    const front = new THREE.Mesh(geometry, frontMaterial), back = new THREE.Mesh(geometry, backMaterial);
    front.position.z = .0007; back.position.z = -.0007; back.rotation.y = Math.PI;
    front.receiveShadow = back.receiveShadow = true;
    box(group, [CARD_WIDTH+.001,CARD_HEIGHT+.001,.001], [0, 0, 0], edgeMaterial);
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
    material.emissiveMap = material.map;
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
    const dealt = round ?? {player:[],ai:[],deck:[]};
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
    const count = (currentRound ?? {player:[],ai:[],deck:[]})[slot.owner].length;
    out.set(...tableCardPosition(slot.owner, slot.index, count));
  }

  function fanHome(slot: CardSlot, out: THREE.Vector3) {
    const count = (currentRound ?? {player:[],ai:[],deck:[]}).player.length;
    const offset = slot.index - (count - 1) / 2;
    const spacing = Math.min(.043, .20 / Math.max(1,count-1));
    const fanY = -.060 - Math.abs(offset)*.001;
    out.set(offset*spacing,fanY,-.37+slot.index*.0008);
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
      if (slot.owner === 'player') (slot.front.material as THREE.MeshStandardMaterial).emissiveIntensity = (cardRevealed ? THREE.MathUtils.lerp(.70, .12, layProgress) : .70) * (state.event?.kind === 'blackout' && (state.phase === 'PLAYER_DECISION' || state.phase === 'PLAYER_PEEKING') ? .055 : 1);
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
        targetQuaternion.setFromEuler(angle.set(-Math.PI / 2, 0, 0));
        group.quaternion.slerpQuaternions(slot.fromQuaternion, targetQuaternion, eased);
        group.scale.setScalar(THREE.MathUtils.lerp(slot.fromScale, 1, eased));
        group.userData.held = false; group.userData.tableFaceUp = layProgress >= .98;
        continue;
      }
      if (slot.owner === 'player') {
        const progress = THREE.MathUtils.clamp(slot.age / (CONFIG.DEAL_SPEED / 1000), 0, 1);
        const offset = fanHome(slot, targetPosition);
        targetQuaternion.setFromEuler(angle.set(-.08, offset * .018, THREE.MathUtils.clamp(-offset*.10,-.22,.22)));
        if (progress >= 1) {
          if (group.parent !== heldRig) {
            // Respect the deal deadline even if a slow frame skipped the pickup arc.
            heldRig.attach(group); group.position.copy(targetPosition);
            group.quaternion.copy(targetQuaternion); group.scale.setScalar(1);
          } else {
            const amount = 1 - Math.exp(-dt * 18);
            group.position.lerp(targetPosition, amount); group.quaternion.slerp(targetQuaternion, amount);
            group.scale.lerp(targetScale.setScalar(1), amount);
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
            group.scale.setScalar(THREE.MathUtils.lerp(1, 1, eased));
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
        group.rotation.set(-Math.PI / 2 + peek*.07, slot.flip, (0) + peek * .08);
        group.position.y += Math.abs(Math.sin(slot.flip)) * CARD_HEIGHT/2 + peek*.01;
        group.userData.held = false; group.userData.tableFaceUp = !hidden && progress >= .98;
      }
    }
  }


  const skeletons={captive:captiveRig,host:hostRig,guards:guardRigs,player:playerRig};
  const working=new THREE.Vector3();
  function flatGun(position:THREE.Vector3) { scene.attach(gun);gun.position.copy(position);gun.quaternion.copy(gunRestQuaternion);gun.scale.set(1,1,1);gunHolder=null; }
  function grip(rig:typeof captiveRig,side:'left'|'right') {rig.arms[side].hand.add(gun);gun.position.copy(socketPosition);gun.quaternion.copy(socketQuaternion);gun.scale.set(1,1,1);}
  function solveWorld(rig:typeof captiveRig,side:'left'|'right',target:THREE.Vector3,palm?:THREE.Quaternion,raised=false) {
    const local=rig.group.worldToLocal(target.clone()),localQ=palm?rig.group.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(palm):undefined;
    return rig.solveHand(side,local,raised?new THREE.Vector3(.5,.2,-.25):undefined,{allowRaisedElbow:raised,palmQuaternion:localQ});
  }
  function pointGun(rig:typeof captiveRig,side:'left'|'right',muzzle:THREE.Vector3,orientation:THREE.Quaternion,raised=false) {
    const palm=orientation.clone().multiply(socketQuaternion.clone().invert());
    const offset=socketPosition.clone().add(muzzlePoint.clone().applyQuaternion(socketQuaternion));
    const target=muzzle.clone().sub(offset.applyQuaternion(palm));
    for(let pass=0;pass<4;pass++) {
      solveWorld(rig,side,target,palm,raised);grip(rig,side);scene.updateMatrixWorld(true);
      target.add(muzzle.clone().sub(model.muzzlePoint.getWorldPosition(new THREE.Vector3())));
    }
    rig.setGrip(side,1,1,.8);
    gun.userData.muzzleError=model.muzzlePoint.getWorldPosition(new THREE.Vector3()).distanceTo(muzzle);
  }
  function atCamera(x:number,y:number,z:number) {return view.localToWorld(new THREE.Vector3(x,y,z));}
  function forcedShotPose(age:number) {
    const destination=atCamera(...FORCED_SHOT.root),walk=THREE.MathUtils.clamp(age/FORCED_SHOT.walkSeconds,0,1);
    host.position.lerpVectors(new THREE.Vector3(-1.05,.9,-.1),destination,walk);
    host.rotation.y=FORCED_SHOT.turn;
    hostRig.setStandingHeight(host.position.y);
    if(age<FORCED_SHOT.walkSeconds)flatGun(new THREE.Vector3(...GUN_PICKUP.player));
    else {
      const aspect=view instanceof THREE.PerspectiveCamera?view.aspect:16/9;
      const tremble=Math.sin(actorTime*29)*.0004;
      const target=atCamera(-.96*Math.tan(34*Math.PI/180)*aspect*.15,.012+tremble,-.15);
      const orientation=view.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),0));
      pointGun(hostRig,'right',target,orientation);
      gun.userData.forcedMuzzleTarget=target.toArray();
      hostRig.setGrip('right',1,THREE.MathUtils.smoothstep(age,3.1,3.5),THREE.MathUtils.smoothstep(age,1.8,2.1));gunHolder='host';
    }
    gun.userData.shotStage=age<1?'take':age<3.2?'temple':'squeeze';
  }
  function hideHostBody(forceActive:boolean) {
    const permitted=new Set<THREE.Object3D>();hostRig.arms.right.forearm.traverse(o=>{if(o instanceof THREE.Mesh && /Hollow .38 barrel|muzzle|Muzzle|Barrel front sight|Sight highlight|Finger|Thumb|Sleeve cuff/.test(o.name))permitted.add(o);});
    (forceActive?host:scene).traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      if(forceActive&&!permitted.has(object)){object.layers.disable(0);object.layers.enable(1);object.userData.forcedHidden=true;}
      else if(object.userData.forcedHidden){object.layers.set(0);delete object.userData.forcedHidden;}
    });
  }
  function playerPose(holding=false,progress=0) {
    playerRig.pose(holding?'player-hold-to-pull':'player-card-hand');
    const q=view.getWorldQuaternion(new THREE.Quaternion());
    solveWorld(playerRig,'left',atCamera(-.09,-.205,-.39),q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,-.12))));
    playerRig.setGrip('left',.8);playerRig.arms.left.thumb[0].rotation.x=-.55;playerRig.arms.left.thumb[1].rotation.x=-.30;
    solveWorld(playerRig,'right',atCamera(.23,-.28,-.28),q);
    if(holding) {
      const lift=THREE.MathUtils.smoothstep(progress,0,.65);
      const muzzle=atCamera(.20*(1-lift),-.26*(1-lift),-.24-.12*(1-lift));
      const orientation=q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2));
      pointGun(playerRig,'right',muzzle,orientation);
      playerRig.setGrip('right',1,progress,THREE.MathUtils.smoothstep(progress,.30,.7));gunHolder='player';
    }
  }
  function selfShot() {
    captiveRig.pose('self-shot');
    const temple=head.localToWorld(new THREE.Vector3(.092,0,.012));
    const orientation=captive.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/6)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI));
    pointGun(captiveRig,'right',temple,orientation,true);gunHolder='ai';gun.userData.temple=temple.toArray();
  }
  function hideExcept(target:THREE.Object3D) {
    for(const object of [captive,host,playerHands,...guardRigs.map(r=>r.group)])object.visible=object===target;
    chair.visible=target===captive;deck.visible=false;gun.visible=false;heldRig.visible=false;captiveHood.visible=false;cutter.visible=false;
    for(const slot of cardSlots)slot.group.visible=false;
  }
  function debugUpdate(time:number) {
    hideHostBody(false);
    const pose=debugPose!;
    if(['host-forced-shot','player-peek','host-dealing','hood-on','hood-mid-removal','hood-off','player-empty-hand','host-open-hand','host-speaking'].includes(pose)) {
      const saved=debugPose;debugPose=null;
      const peek=pose==='player-peek',forced=pose==='host-forced-shot',hoodPose=pose.startsWith('hood-'),empty=pose==='player-empty-hand',gesture=pose==='host-open-hand'||pose==='host-speaking',age=peek?.50:2.8;
      update(time,.5,{phase:hoodPose?'OPENING':empty||gesture?'PLAYER_DECISION':peek?'PLAYER_PEEKING':forced?'HOST_FORCE_SHOT':'DEALING',roundNumber:1,revealed:false,suspense:false,dead:null,shotEffect:null,
        forceShotAt:forced?Date.now()-age*1000:null,peekActor:peek?'player':null,peekStartedAt:Date.now()-age*1000,
        speaker:gesture?'host':null,hostVoiceLevel:gesture?1:0,cinematic:hoodPose?{stage:pose==='hood-on'?'hooded':pose==='hood-off'?'rules':'opponent-unhood',mode:'full',startedAt:Date.now()-(pose==='hood-mid-removal'?3577:0)}:null,peekedCard:peek?demo.player[0]:null,tiesCut:{player:true,ai:true}});
      debugPose=saved;
      if(hoodPose){host.visible=playerHands.visible=heldRig.visible=false;return captive;}
      if(empty){host.visible=captive.visible=heldRig.visible=false;return playerHands;}
      if(peek){captive.visible=host.visible=false;playerHands.visible=true;}
      else {captive.visible=playerHands.visible=false;heldRig.visible=false;}
      chair.visible=false;
      return peek?playerHands:host;
    }
    const rig=pose.startsWith('host-')?hostRig:pose.startsWith('guard-')?guardRigs[0]:pose.startsWith('player-')?playerRig:captiveRig;
    hideExcept(rig.group);rig.group.visible=true;rig.setRoom(debugRoom);
    rig.group.position.set(0,pose.startsWith('host-')||pose.startsWith('guard-')?.9:.45,0);
    rig.group.rotation.set(0,0,0);rig.pose(pose as PoseName,time);
    if(rig===captiveRig){chair.position.set(0,0,0);}
    if(pose.startsWith('host-')&&pose!=='host-idle') {rig.crouch(.15);}
    if(pose==='self-shot'){selfShot();gun.visible=true;}
    if(pose==='holding-revolver'||pose==='player-hold-to-pull') {grip(rig,'right');rig.setGrip('right',1,.7,.7);gun.visible=true;}
    if(pose==='host-sliding'){flatGun(new THREE.Vector3(.12,.76,.35));gun.visible=true;}
    if(pose.startsWith('player-')) {
      rig.group.position.set(0,-.75,0);
      playerPose(pose==='player-hold-to-pull',1);
      if(pose==='player-hold-to-pull')gun.visible=true;
      if(pose==='player-card-hand'){
        view.add(heldRig);heldRig.position.set(0,0,0);heldRig.rotation.set(0,0,0);heldRig.visible=true;
        setCards(demo,false);animateCards(time+2,.1,{phase:'PLAYER_DECISION',roundNumber:1,revealed:false,suspense:false,dead:null,shotEffect:null});
        for(const slot of cardSlots)slot.group.visible=slot.owner==='player';
      }
    }
    rig.constrainFingers();return rig.group;
  }
  function update(time:number,delta:number,state:ActorState) {
    restoreNearCameraHiding(scene);hideHostBody(false);
    actorTime=time;
    if(debugPose){debugTarget=debugUpdate(time);return;}
    if(heldRig.parent!==view){view.add(heldRig);heldRig.position.set(0,0,0);heldRig.rotation.set(0,0,0);}
    const dt=Math.max(0,delta),epoch=Date.now(),room=state.roomNumber??1;
    if(room!==currentRoom){currentRoom=room;captiveRig.setRoom(room);}
    if(state.roundNumber!==lastRound||state.phase!==lastPhase){
      if(state.roundNumber!==lastRound){lastRound=state.roundNumber;priorShotEffect=null;latchedShooter=null;gunHolder=null;shotAt=dropAt=-Infinity;}
      if(state.phase!==lastPhase){phaseStartedAt=time;lastPhase=state.phase;}
      if(state.phase==='SWEEPING'){sweepStartedAt=time;cardSlots.filter(s=>s.active).forEach(rememberWorld);}
    }
    elapsedShoot=time-phaseStartedAt;
    const shuffle=state.phase==='SHUFFLING'?Math.sin(Math.min(1,elapsedShoot/.50)*Math.PI*2):0;
    upperPack.position.set(shuffle*.045,.010+Math.abs(shuffle)*.015,0);upperPack.rotation.y=shuffle*.22;
    captive.visible=host.visible=playerHands.visible=true;chair.visible=true;deck.visible=true;heldRig.visible=true;gun.visible=true;
    captive.position.set(0,.45,-.90);captive.rotation.set(0,0,0);host.position.set(-.70,.90,-.35);host.rotation.set(0,Math.PI/2,0);playerHands.position.set(0,-.75,0);
    captiveRig.pose('seated-resting');hostRig.pose('host-idle');playerPose();
    for(const rig of guardRigs){rig.group.visible=false;rig.pose('guard-walking',time);}
    const cine=state.cinematic,stage=cine?.stage??state.storyStage??'',p=cinematicProgress(cine,epoch);
    const body=bodyLanguage(room,state.stress??.2,time,(state.chambersFired??0)+1,state.phase,state.tell?.disposition==='calm');
    const motion=state.reducedMotion?.25:1;
    captiveRig.chest.rotation.x+=body.breath*motion;captiveRig.head.rotation.y+=body.head*motion;
    captiveRig.spine.rotation.x+=body.hunch*.15;
    captiveRig.legs.right.thigh.rotation.x+=body.bounce*.8;
    captiveRig.legs.right.shin.rotation.x-=body.bounce*.8;
    for(const arm of Object.values(captiveRig.arms))for(const chain of arm.fingers)for(const digit of chain)digit.rotation.x+=Math.sin(time*41+digit.id)*body.tremor*motion;
    if(body.fidget==='host')head.rotation.y-=body.fidgetAmount*.18;
    if(body.fidget==='neck')head.rotation.z+=body.fidgetAmount*.08;
    if(body.fidget==='drum'||body.fidget==='felt')captiveRig.arms.left.fingers.forEach((chain,i)=>chain[0].rotation.x-=body.fidgetAmount*Math.max(0,Math.sin(time*9+i))*.25);
    if(body.fidget==='sweat'||body.fidget==='collar'||body.fidget==='tie')captiveRig.arms.left.forearm.rotation.x-=body.fidgetAmount*.55;
    if(state.tell&&state.phase==='PLAYER_DECISION') {
      if(state.tell.kind==='avert')head.rotation.y+=.22;
      if(state.tell.kind==='tap')captiveRig.arms.left.fingers.forEach((f,i)=>f[0].rotation.x-=Math.max(0,Math.sin(time*10+i))*.25);
    }
    if(state.speaker==='host'&&lastSpeaker!=='host')hostGestureAt=time;lastSpeaker=state.speaker;
    const active=state.speaker===undefined?'captive':state.speaker;
    const cv=active==='captive'?state.captiveVoiceLevel??state.voiceLevel??0:0,hv=active==='host'?state.hostVoiceLevel??state.voiceLevel??0:0;
    if(state.dead!=='ai')head.rotation.x+=cv*.01*motion;
    hostHead.rotation.x+=hv*.01*motion;
    const reaction=state.distantShot??state.ambientEvent;
    const eventTurn=reactionLevel(reaction,epoch),hostTurn=reactionLevel(reaction,epoch,true);
    head.rotation.y+=(reaction?.direction??1)*eventTurn*.6;hostHead.rotation.y+=(reaction?.direction??1)*hostTurn*.5;
    if(state.attention?.captive.away)head.rotation.y=state.attention.captive.direction*.72*state.attention.captive.amount;
    // The Host stands side-on at the left. A negative local yaw turns its mask
    // toward the player, so its public distraction turns toward the far wall.
    if(state.attention?.host.away)hostHead.rotation.y=.70*state.attention.host.amount;
    head.rotation.x-=eventDoorPulse(state.event,epoch)*.09;
    const hostHeadRotation=hostHead.rotation.clone();
    if(['SHUFFLING','DEALING','HITTING','DEALER_TURN','REVEAL','SWEEPING'].includes(state.phase)) {
      hostRig.pose('host-dealing',time);hostRig.crouch(.15);host.position.x=-.94;host.position.z=-.10;
      const palm=new THREE.Quaternion().setFromEuler(new THREE.Euler(1.05,0,0));
      const dealing=['DEALING','HITTING','DEALER_TURN'].includes(state.phase);
      const stroke=dealing?Math.sin((elapsedShoot*1000/CONFIG.DEAL_SPEED%1)*Math.PI):Math.abs(shuffle);
      solveWorld(hostRig,'right',new THREE.Vector3(DECK_POSITION[0],.95+.025*stroke,DECK_POSITION[2]+.010*stroke),palm);
    }
    if(cine&&cine.mode!=='transfer') {
      const covered=!['guard-exit','rules','cut-opponent','cut-player','rub-wrists','complete'].includes(stage);
      const removal=stage==='opponent-unhood'?THREE.MathUtils.smoothstep(p,.65,.94):0;hood.update(removal);captiveHood.visible=covered&&removal<.995;head.rotation.x-=Math.sin(removal*Math.PI)*.16;head.rotation.x+=THREE.MathUtils.smoothstep(removal,.85,1)*.08;
      if(['door-open','guard-approach','player-unhood','player-focus','opponent-unhood','guard-exit'].includes(stage)) {
        const guard=guards[0];guard.group.visible=true;
        const door=new THREE.Vector3(2.7,.9,-3.7),side=new THREE.Vector3(1.10,.9,1.05),far=new THREE.Vector3(1.05,.9,-1.35),opponent=new THREE.Vector3(.62,.9,-1.20);
        if(stage==='door-open')guard.group.position.copy(door);
        else if(stage==='guard-approach')guard.group.position.copy(routePoint([door,new THREE.Vector3(1.05,.9,-1.35),side],p));
        else if(stage==='player-unhood'||stage==='player-focus')guard.group.position.copy(side);
        else if(stage==='opponent-unhood')guard.group.position.copy(routePoint([side,far,opponent],Math.min(1,p/.65)));
        else guard.group.position.copy(routePoint([opponent,far,door],p));
        guard.group.rotation.y=-Math.PI/2;
        if(stage==='player-unhood') {guard.group.rotation.y=-Math.PI*.75;solveWorld(guard.rig,'right',atCamera(.44,.11,-.10),view.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-Math.PI/2,0))));}
        if(stage==='opponent-unhood'&&p>.65){const lift=THREE.MathUtils.smoothstep(p,.65,.94);guard.group.position.x-=.12*lift;solveWorld(guard.rig,'right',head.getWorldPosition(working).add(new THREE.Vector3(.03,.12+lift*.37,0)));guard.rig.setGrip('right',.65);}
        guard.foldedHoods.visible=stage==='guard-exit';guard.group.userData.hoodsCarried=stage==='guard-exit'?2:0;
      }
      cutter.visible=stage==='cut-opponent'||stage==='cut-player';
    } else {captiveHood.visible=false;cutter.visible=false;}
    if(cine?.mode==='transfer'){hood.update(0);captiveHood.visible=true;}
    if(cine?.mode==='transfer')guardRigs.forEach((rig,i)=>{rig.group.visible=true;rig.group.position.set(i?-.98:.98,.9,1.05);rig.group.rotation.y=i?Math.PI/2:-Math.PI/2;});
    const boundPlayer=state.tiesCut?.player===false,boundCaptive=state.tiesCut?.ai===false;
    if(boundCaptive){captiveRig.solveHand('left',new THREE.Vector3(-.045,.315,.35));captiveRig.solveHand('right',new THREE.Vector3(.045,.315,.35));}
    if(boundPlayer){solveWorld(playerRig,'left',atCamera(-.045,-.35,-.38));solveWorld(playerRig,'right',atCamera(.045,-.35,-.38));}
    captiveTie.visible=boundCaptive;playerTie.visible=boundPlayer;
    captiveTie.position.copy(leftHand.getWorldPosition(new THREE.Vector3())).lerp(rightHand.getWorldPosition(new THREE.Vector3()),.5);
    playerTie.position.copy(playerLeft.getWorldPosition(new THREE.Vector3())).lerp(playerRight.getWorldPosition(new THREE.Vector3()),.5);
    captiveTie.rotation.x=playerTie.rotation.x=Math.PI/2;
    const newShot=state.shotEffect&&state.shotEffect!==priorShotEffect;
    if(newShot){shotAt=time;latchedShooter=gunHolder==='ai'?'ai':'player';gun.getWorldPosition(shotPosition);gun.getWorldQuaternion(shotQuaternion);if(state.dead==='ai')dropAt=time;}
    priorShotEffect=state.shotEffect;
    const transfer=state.gunTransfer;
    if(transfer) {
      const t=gunTransferProgress(transfer,epoch),u=transfer.stage==='return'?1-t:t;
      const destination=new THREE.Vector3(...GUN_PICKUP[transfer.side]);
      const path=[gunRest,new THREE.Vector3(destination.x,gunRest.y,0),destination];
      flatGun(routePoint(path,u));gun.userData.shotStage='slide';
      hostRig.pose('host-sliding',time);hostRig.crouch(.15);
    } else if(state.phase==='AI_SHOOTING') {
      const age=state.aiShotStartedAt==null?0:Math.max(0,(epoch-state.aiShotStartedAt)/1000);
      const progress=state.aiShotStartedAt===undefined?Math.min(1,elapsedShoot/2):age/Math.max(1.5,(state.aiShotDurationMs??2000)/1000);
      if(progress>=.55){selfShot();gun.userData.shotStage='temple';}
      else if(progress>.10){flatGun(new THREE.Vector3(...GUN_PICKUP.ai));solveWorld(captiveRig,'right',gun.localToWorld(new THREE.Vector3(-.08,-.057,0)));if(progress>.25){grip(captiveRig,'right');captiveRig.setGrip('right',1);gunHolder='ai';}}
      else flatGun(new THREE.Vector3(...GUN_PICKUP.ai));
    } else if(state.phase==='PLAYER_SHOOTING'&&((state.triggerProgress??0)>0||state.spinning==='player')) {
      playerPose(true,Math.max(state.triggerProgress??0,state.spinning==='player'?.4:0));gun.userData.shotStage='player-hold';
    } else if(state.phase==='PLAYER_SHOOTING')flatGun(new THREE.Vector3(...GUN_PICKUP.player));
    else if(state.phase==='HOST_FORCE_SHOT'||state.forceShotAt!=null&&state.phase==='ROUND_RESULT') {
      const age=state.forceShotAt==null?0:(epoch-state.forceShotAt)/1000;
      forcedShotPose(age);
    } else if(state.shotEffect==='click'&&time-shotAt<.7) {
      const target=new THREE.Vector3(...GUN_PICKUP[latchedShooter??'player']);flatGun(shotPosition.clone().lerp(target,Math.min(1,(time-shotAt)/.7)));
    } else if(state.dead==='ai'&&Number.isFinite(dropAt)) {
      scene.attach(gun);gun.position.copy(shotPosition);gun.position.y=Math.max(.06,shotPosition.y-2*(time-dropAt)**2);gun.quaternion.copy(shotQuaternion);gunHolder=null;
    } else flatGun(gunRest);
    if(state.spinning){const serial=state.spinSerial??0;if(serial!==lastSpinSerial){lastSpinSerial=serial;spinStartedAt=time;spinFrom=revolverCylinder.rotation.x;}revolverCylinder.rotation.x=spinFrom+Math.PI*6*(1-(1-Math.min(1,(time-spinStartedAt)/.8))**3);}
    else revolverCylinder.rotation.x=(state.triggerProgress??0)*Math.PI/3;
    hammer.rotation.z=-THREE.MathUtils.smoothstep(state.triggerProgress??0,.3,.7)*.55;
    model.trigger.rotation.z=-(state.triggerProgress??0)*.18;
    gun.userData.holder=gunHolder??'table';gun.userData.holdProgress=state.triggerProgress??0;
    // Body poses reset their own head joints; public gaze and speech must win.
    hostHead.rotation.copy(hostHeadRotation);
    const peek=state.peekActor;
    if((state.peekSerial??0)!==lastPeekSerial){lastPeekSerial=state.peekSerial??0;peekStartedAt=time;}
    const peekAge=state.peekStartedAt!=null?(epoch-state.peekStartedAt)/1000:time-peekStartedAt;
    const peekProgress=THREE.MathUtils.clamp(peekAge/(CONFIG.PEEK_DURATION_MS/1000),0,1);
    // Move the pack into reach before lifting its attached corner. The hand
    // never chases an unreachable target at the Host's side of the table.
    const peekDeck=playerPeekDeck(peek==='player'?peekProgress:0),deckSlide=peekDeck.slide;
    deck.position.set(...peekDeck.position);
    const lift=peek==='player'?(deckSlide>.999?Math.sin(THREE.MathUtils.clamp((peekProgress-.20)/.60,0,1)*Math.PI):0):peek?Math.sin(peekProgress*Math.PI):0;
    deckCorner.visible=!!peek&&lift>.001;deckCorner.rotation.x=-lift*1.15;deckCorner.userData.attachedToDeck=true;
    if(peek==='player'&&state.peekedCard){
      if(peekIdentity!==state.peekedCard.id){peekIdentity=state.peekedCard.id;peekMaterial.map?.dispose();peekMaterial.map=cardTexture(state.peekedCard);peekMaterial.emissiveMap=peekMaterial.map;peekMaterial.needsUpdate=true;}
      if(deckSlide>.999){
        solveWorld(playerRig,'right',deckCorner.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(.08,.065,.15)),new THREE.Quaternion().setFromEuler(new THREE.Euler(.15,-Math.PI*.75,0)));
        playerRig.setGrip('right',.35);playerRig.arms.right.fingers[0].forEach(joint=>joint.rotation.x=-.25);
      }
    }
    else if(peekIdentity){peekIdentity='';peekMaterial.map?.dispose();peekMaterial.map=peekMaterial.emissiveMap=null;peekMaterial.needsUpdate=true;}
    peekFront.visible=peek==='player'&&!!state.peekedCard;deckCorner.userData.identity=peek==='player'?state.peekedCard?.id??null:null;
    // Keep the held fan and its hand together, clear of the private corner.
    const fanAside=peek==='player'?THREE.MathUtils.smoothstep(peekProgress,0,.15)*(1-THREE.MathUtils.smoothstep(peekProgress,.85,1)):0;
    heldRig.position.set(fanAside?-.24*fanAside:0,fanAside?-.06*fanAside:0,0);
    if(fanAside>0)solveWorld(playerRig,'left',atCamera(-.09-.24*fanAside,-.205-.06*fanAside,-.39),view.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,-.12))));
    const busyLeft=!cardRevealed&&currentRound?.player.length&& !['START','OPENING','TRANSITION','SWEEPING'].includes(state.phase);
    if(!busyLeft&&!boundPlayer){solveWorld(playerRig,'left',atCamera(-.20,-.46,-.43),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI,0)));playerRig.setGrip('left',.20);}
    if(!boundPlayer&&!['PLAYER_SHOOTING','HOST_FORCE_SHOT','PLAYER_PEEKING'].includes(state.phase)){solveWorld(playerRig,'right',atCamera(.25,-.48,-.38),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI,0)));playerRig.setGrip('right',.20);}
    if(state.speaker==='host' && !['SHUFFLING','DEALING','HITTING','DEALER_TURN','HOST_FORCE_SHOT'].includes(state.phase)&&time-hostGestureAt<1.5){hostRig.solveHand('left',new THREE.Vector3(-.10,.20,.22));hostRig.setGrip('left',.18);}
    for(const rig of [captiveRig,hostRig,playerRig,...guardRigs])rig.constrainFingers();
    const hiddenCards=['START','OPENING','TRANSITION','ENDING_WIN'].includes(state.phase);
    animateCards(time,dt,state);
    if(hiddenCards){heldRig.visible=false;cardSlots.forEach(slot=>{slot.group.visible=false;slot.group.userData.held=false;slot.group.userData.tableFaceUp=false;});}
    if(state.dead==='ai'){slump=Math.min(1,slump+dt/1.2);captiveRig.spine.rotation.x=slump*1.3;}else slump=0;
    const eye=view.getWorldPosition(new THREE.Vector3()),monitorTarget=new THREE.Vector3(1.0,1.6,-3.4);
    const dealing=['SHUFFLING','DEALING','HITTING','DEALER_TURN','SWEEPING'].includes(state.phase);
    const hostTarget=state.attention?.host.away?eye.clone().lerp(monitorTarget,state.attention.host.amount):dealing?deck.getWorldPosition(new THREE.Vector3()):state.phase==='AI_SHOOTING'||state.phase==='PEEKING'||state.addressedTo==='captive'||state.speaker==='captive'?head.getWorldPosition(new THREE.Vector3()):eye;
    const captiveTarget=state.attention?.captive.away?eye.clone().lerp(new THREE.Vector3(state.attention.captive.direction*2,1.1,-.4),state.attention.captive.amount):(state.distantShot||state.ambientEvent)&&eventTurn>0?new THREE.Vector3((state.distantShot?.direction??state.ambientEvent?.direction??1)*3,1.1,-1):state.phase==='AI_SHOOTING'?gun.getWorldPosition(new THREE.Vector3()):state.speaker==='captive'&&state.addressedTo==='host'?hostHead.getWorldPosition(new THREE.Vector3()):dealing||state.phase==='PEEKING'?new THREE.Vector3(0,.76,-.27):eye;
    if(state.phase!=='HOST_FORCE_SHOT')lookAtTarget(hostRig,hostTarget,dt,hv*.01*motion);
    if(state.dead!=='ai'&&gunHolder!=='ai'&&!captiveHood.visible)lookAtTarget(captiveRig,captiveTarget,dt,cv*.01*motion);
    const forceActive=state.phase==='HOST_FORCE_SHOT'||state.forceShotAt!=null&&state.phase==='ROUND_RESULT';
    const allowed=forceActive?[hostRig.arms.right.forearm]:[];
    hideHostBody(forceActive);
    applyNearCameraHiding(scene,view,forceActive,allowed);
  }
  let debugTarget:THREE.Group=captive;
  return {chair,guards,cutter,captiveTie,playerTie,captiveLegs:captiveRig.legs,standingHostLegs:hostRig.legs,
    stranger:captive,captive,head,captiveHead:head,leftHand,rightHand,host,hostHead,hostLeftHand,hostRightHand,captiveHood,
    playerHands,heldRig,deck,gun,hammer,cylinder:revolverCylinder,peekCard,peekFront,deckCorner,cardSlots,skeletons,
    setCards,update,setDebugPose:(pose:string,room:1|2|3=1)=>{debugPose=pose as DebugPoseName;debugRoom=room;},get debugTarget(){return debugTarget;}};
}
