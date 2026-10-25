import {reactionPose,type Reaction,type ReactionKind} from '../reactions';
import {smooth} from '../pickup';
import {soundReaction,type WorldSound} from '../worldSound';
import {lookAtTarget} from './gaze';
import { createBurlapHood } from './hood';
import { restoreNearCameraHiding, applyNearCameraHiding } from './visibility';
import * as THREE from 'three';
import { CONFIG, type Card, type GamePhase, type Round } from '../game';
import { mergeStaticMeshes } from './merge';
import { cinematicProgress, type CinematicState } from '../cinematics';
import { bodyLanguage } from '../bodyLanguage';
import { type OpponentTell, type RoundEvent, type Side } from '../tension';
import { type AmbientEvent, type DistantShot } from '../roomLife';
import type { Attention } from '../attention';
import { OPPONENTS } from '../campaign';
import { CARD_WIDTH, CARD_HEIGHT, DECK_POSITION, GUN_REST, GUN_PICKUP, HOST_SEAT, tableCardPosition, playerPeekDeck, gunSlidePoint } from '../tableLayout';
import { gunTransferProgress, type GunTransfer } from '../gunTransfer';
import { createCharacter } from './skeleton';
import { type PoseName, type DebugPoseName } from './poses';
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
  worldSound?:WorldSound|null;reaction?:Reaction|null;
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
/** Captive card hand, in the captive's body space: held up in front of the chest, faces toward the
 * captive, backs squarely toward the player, tilted so the captive looks down onto them. */
const AI_FAN_POSITION = [-.03, .55, .33] as const, AI_FAN_TILT = .40;
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
  // Oxblood backs with a bone border: clearly solid against the green felt and the dark clothes.
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 224;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#e2d8bd';
  context.fillRect(0, 0, 160, 224);
  context.fillStyle = '#6e1f1b';
  context.fillRect(9, 9, 142, 206);
  context.strokeStyle = '#b0533f';
  context.lineWidth = 2;
  for (let d = -224; d < 384; d += 14) {
    context.beginPath(); context.moveTo(d, 9); context.lineTo(d + 206, 215); context.stroke();
    context.beginPath(); context.moveTo(d, 215); context.lineTo(d + 206, 9); context.stroke();
  }
  context.fillStyle = '#e2d8bd';
  context.fillRect(9, 9, 142, 3); context.fillRect(9, 212, 142, 3); context.fillRect(9, 9, 3, 206); context.fillRect(148, 9, 3, 206);
  context.fillStyle = '#4c1512';
  context.fillRect(46, 70, 68, 84);
  context.strokeStyle = '#e2d8bd';
  context.lineWidth = 3;
  context.strokeRect(46, 70, 68, 84);
  context.fillStyle = '#e2d8bd';
  context.font = 'bold 30px monospace';
  context.textAlign = 'center';
  context.fillText('LH', 80, 112);
  context.font = '28px Georgia';
  context.fillText('✦', 80, 144);
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
  captive.position.set(0,.45,-.80); host.position.set(...HOST_SEAT);host.rotation.y=Math.PI/2;
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
  const aiHeldRig=new THREE.Group();aiHeldRig.name='Captive held card fan';captive.add(aiHeldRig);aiHeldRig.position.set(...AI_FAN_POSITION);aiHeldRig.rotation.set(AI_FAN_TILT,Math.PI,0);
  const heldRig=new THREE.Group(); heldRig.name='Hand-held player card fan'; view.add(heldRig);
  const chair=new THREE.Group();chair.name='Captive chair';chair.position.set(0,0,-.80);scene.add(chair);
  const chairMaterial=surface(0x252e26,.25,.8);
  box(chair,[.43,.045,.38],[0,.4275,0],chairMaterial);
  box(chair,[.43,.47,.035],[0,.71,-.18],chairMaterial);
  for(const x of [-.175,.175])for(const z of [-.15,.15]) box(chair,[.026,.43,.026],[x,.215,z],chairMaterial);
  mergeStaticMeshes(chair);
  const hostChair=chair.clone();hostChair.name='Host chair';hostChair.position.set(HOST_SEAT[0],0,HOST_SEAT[2]);hostChair.rotation.y=Math.PI/2;scene.add(hostChair);
  const rim=new THREE.PointLight(0xa3c6df,.30,2.2,2);rim.position.set(-1.25,1.55,-.75);scene.add(rim);
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
  let gunHolder:'player'|'ai'|'host'|null=null,latchedShooter:Side|'host'|null=null;
  let shotAt=-Infinity,priorShotEffect:ActorState['shotEffect']=null;
  let debugSound:WorldSound|null=null;let debugPose:DebugPoseName|null=null,debugRoom:1|2|3=1,currentRoom=1;
  let lastSpinSerial=0,spinStartedAt=-1,spinFrom=0,lastPeekSerial=0,peekStartedAt=-1,peekIdentity='';
  const cardSlots: CardSlot[] = [];
  const backTexture = cardBackTexture();
  const backMaterial = new THREE.MeshStandardMaterial({ map: backTexture, emissiveMap: backTexture, roughness: 1, emissive: 0xffffff, emissiveIntensity: .22 });
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
  let shootingLayStartedAt=-1;
  let elapsedShoot = 0, phaseStartedAt = 0, showdownStartedAt = -1, sweepStartedAt = -1;
  let serial = 0, newest: CardSlot | null = null, slump = 0;
  let dropAt=-Infinity,dropRound=-1;const dropFrom=new THREE.Vector3(),dropQuaternion=new THREE.Quaternion(),lastGunPosition=new THREE.Vector3(...GUN_REST),lastGunQuaternion=new THREE.Quaternion();

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
      cardSlots.filter(slot => slot.active).forEach(rememberWorld);
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
    const spacing = Math.min(.028, .22 / Math.max(1,count-1));
    const fanY = -.13 - Math.abs(offset)*.004;
    out.set(-.18-Math.max(0,count-4)*.008+offset*spacing,fanY,-.50+slot.index*.0005);
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
      if (cardRevealed||slot.owner==='player'&&shootingLayStartedAt>=0) {
        if(group.parent!==scene)rememberWorld(slot);
        tableHome(slot, targetPosition);
        const progress=cardRevealed?layProgress:Math.min(1,(time-shootingLayStartedAt)/.35),eased = 1 - Math.pow(1 - progress, 3);
        group.position.lerpVectors(slot.fromPosition, targetPosition, eased);
        group.position.y += Math.sin(progress * Math.PI) * .13;
        const down=slot.owner==='player'&&['PLAYER_SHOOTING','AI_SHOOTING','HOST_FORCE_SHOT','ROUND_RESULT'].includes(state.phase);
        targetQuaternion.setFromEuler(angle.set(-Math.PI / 2,down?Math.PI*smooth(0,.25,elapsedShoot):0,0));
        group.quaternion.slerpQuaternions(slot.fromQuaternion, targetQuaternion, eased);
        group.scale.setScalar(THREE.MathUtils.lerp(slot.fromScale, 1, eased));
        group.userData.held = false; group.userData.tableFaceUp = !down&&layProgress >= .98;
        continue;
      }
      if (slot.owner === 'player') {
        const progress = THREE.MathUtils.clamp(slot.age / (CONFIG.DEAL_SPEED / 1000), 0, 1);
        const offset = fanHome(slot, targetPosition);
        targetQuaternion.setFromEuler(angle.set(-.35, 0, THREE.MathUtils.clamp(-offset*.17,-.90,.90)));
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
        const progress=THREE.MathUtils.clamp(slot.age/(CONFIG.DEAL_SPEED/1000),0,1),count=currentRound?.ai.length??2,offset=slot.index-(count-1)/2;
        const heldPosition=new THREE.Vector3(offset*Math.min(.045,.24/Math.max(1,count-1)),-Math.abs(offset)*.006,slot.index*.0008),heldQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,-offset*.20));
        if(progress>=1){if(group.parent!==aiHeldRig)aiHeldRig.add(group);group.position.copy(heldPosition);group.quaternion.copy(heldQ);group.scale.setScalar(1);group.userData.held=true;}
        else {if(group.parent!==scene)scene.attach(group);const to=aiHeldRig.localToWorld(heldPosition.clone()),q=aiHeldRig.getWorldQuaternion(new THREE.Quaternion()).multiply(heldQ);group.position.lerpVectors(deckStart,to,smooth(0,1,progress));group.position.y+=Math.sin(progress*Math.PI)*.035;backQuaternion.setFromEuler(new THREE.Euler(-Math.PI/2,slot.index===1?Math.PI:0,0));group.quaternion.slerpQuaternions(backQuaternion,q,smooth(.3,1,progress));group.userData.held=false;}
        group.userData.tableFaceUp=false;

      }
    }
  }


  const skeletons={captive:captiveRig,host:hostRig,guards:guardRigs,player:playerRig};
  const working=new THREE.Vector3();
  /** At rest the grip faces the Host and the muzzle faces the player; at a pickup spot the grip faces the shooter's side. */
  const REST_YAW=-Math.PI/2;
  function flatQuaternion(yaw:number){return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw).multiply(gunRestQuaternion);}
  function flatGun(position:THREE.Vector3,yaw=REST_YAW) { scene.attach(gun);gun.position.copy(position);gun.quaternion.copy(flatQuaternion(yaw));gun.scale.set(1,1,1);gunHolder=null; }
  // The opposite seat approaches the exposed side of the grip; its wrist
  // uses the other palm roll, with the wood still inside the same palm.
  const MIRROR_HAND=new THREE.Matrix4().makeScale(-1,1,1),MIRROR_GUN=new THREE.Matrix4().makeScale(1,1,-1);
  function gripSocket(rig:typeof captiveRig,side:'left'|'right'='right'){
    const base=rig===captiveRig?{position:new THREE.Vector3(-.057,.025,.150),quaternion:new THREE.Quaternion(.5,-.5,.5,.5)}:{position:socketPosition.clone(),quaternion:socketQuaternion.clone()};
    if(side==='right')return base;
    // A left hand holds the same (left/right symmetric) revolver as the mirror image of the right-hand grip.
    const m=MIRROR_HAND.clone().multiply(new THREE.Matrix4().makeRotationFromQuaternion(base.quaternion)).multiply(MIRROR_GUN);
    return {position:base.position.clone().setX(-base.position.x),quaternion:new THREE.Quaternion().setFromRotationMatrix(m)};
  }
  function grip(rig:typeof captiveRig,side:'left'|'right') {const socket=gripSocket(rig,side);rig.arms[side].hand.add(gun);gun.position.copy(socket.position);gun.quaternion.copy(socket.quaternion);gun.scale.set(1,1,1);}
  function solveWorld(rig:typeof captiveRig,side:'left'|'right',target:THREE.Vector3,palm?:THREE.Quaternion,raised=false,fullGrip=false,lean=true) {
    const local=rig.group.worldToLocal(target.clone()),localQ=palm?rig.group.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(palm):undefined;
    return rig.solveHand(side,local,raised?new THREE.Vector3(.5,.2,-.25):undefined,{allowRaisedElbow:raised,palmQuaternion:localQ,fullGrip,lean});
  }
  function pointGun(rig:typeof captiveRig,side:'left'|'right',muzzle:THREE.Vector3,orientation:THREE.Quaternion,raised=false) {
    const socket=gripSocket(rig,side),palm=orientation.clone().multiply(socket.quaternion.clone().invert());
    const offset=socket.position.clone().add(muzzlePoint.clone().applyQuaternion(socket.quaternion));
    const target=muzzle.clone().sub(offset.applyQuaternion(palm));
    for(let pass=0;pass<4;pass++) {
      solveWorld(rig,side,target,palm,raised,true);grip(rig,side);scene.updateMatrixWorld(true);
      target.add(muzzle.clone().sub(model.muzzlePoint.getWorldPosition(new THREE.Vector3())));
    }
    rig.setGrip(side,1,1,.8);
    gun.userData.muzzleError=model.muzzlePoint.getWorldPosition(new THREE.Vector3()).distanceTo(muzzle);
  }
  function atCamera(x:number,y:number,z:number) {return view.localToWorld(new THREE.Vector3(x,y,z));}
  type Aim={muzzle:THREE.Vector3;q:THREE.Quaternion;raised?:boolean};
  /** A relaxed hand resting on the felt: fingers almost straight and together, thumb tucked alongside (no claw, no raised thumb). */
  function relaxHand(rig:typeof captiveRig,side:'left'|'right'){
    const arm=rig.arms[side];arm.fingers.forEach((chain,i)=>chain.forEach((joint,j)=>{joint.rotation.set(-(.04+.03*j+.01*i),0,0);}));
    arm.thumb[0].rotation.set(-.18,(side==='left'?-1:1)*.12,0);arm.thumb[1].rotation.set(-.10,0,0);
  }
  const Y_AXIS=new THREE.Vector3(0,1,0);
  /** Old (preferred) hold presentation: the muzzle turns toward the player's face and rises to the centre of view. */
  function playerAim(progress=0):Aim{
    const q=view.getWorldQuaternion(new THREE.Quaternion()),lift=THREE.MathUtils.smoothstep(progress,0,.65);
    return {muzzle:atCamera(.15*(1-lift),-.19*(1-lift),-.24-.15*(1-lift)),q:q.multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS,-Math.PI/2))};
  }
  function captiveAim():Aim{
    const muzzle=head.localToWorld(new THREE.Vector3(.092,0,.012));
    return {muzzle,q:captive.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/6,Math.PI,0))),raised:true};
  }
  /** The seated Host aims with its left (player-side) arm, extended from its own shoulder, never touching the player. */
  function hostAim():Aim{
    hostRig.group.updateWorldMatrix(true,true);
    // Classic sight line: the revolver sits in front of the mask, arm extended toward the player's head.
    const face=hostHead.getWorldPosition(new THREE.Vector3()),eye=view.getWorldPosition(new THREE.Vector3());
    const direction=eye.clone().sub(face).normalize(),muzzle=face.clone().addScaledVector(direction,.56);muzzle.y-=.06;
    direction.copy(eye).sub(muzzle).normalize();
    return {muzzle,q:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),direction)};
  }
  function finalAim(rig:typeof captiveRig):Aim{return rig===playerRig?playerAim(0):rig===hostRig?hostAim():captiveAim();}
  function shooterSide(rig:typeof captiveRig):'left'|'right'{return rig===hostRig?'left':'right';}
  function holderName(rig:typeof captiveRig){return rig===hostRig?'host':rig===playerRig?'player':'ai';}
  /** Resting palm (palm down, fingers toward the table centre) in world space. */
  function restingPalm(rig:typeof captiveRig){
    if(rig===playerRig)return view.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS,Math.PI));
    return rig.group.getWorldQuaternion(new THREE.Quaternion());
  }
  function aimGrip(rig:typeof captiveRig,side:'left'|'right',aim:Aim){
    const socket=gripSocket(rig,side),palm=aim.q.clone().multiply(socket.quaternion.clone().invert());
    const offset=socket.position.clone().add(muzzlePoint.clone().applyQuaternion(socket.quaternion));
    return {wrist:aim.muzzle.clone().sub(offset.applyQuaternion(palm)),palm};
  }
  function contactFor(rig:typeof captiveRig,side:'left'|'right',spot:THREE.Vector3,yaw:number){
    const socket=gripSocket(rig,side),palm=flatQuaternion(yaw).multiply(socket.quaternion.clone().invert());
    return {wrist:spot.clone().sub(socket.position.clone().applyQuaternion(palm)),palm};
  }
  /**
   * Direct grab shared by every shooter: the hand travels straight to the grip (tiny arc), the fingers close,
   * then the revolver lifts in one smooth motion to that shooter's own aim. The torso only leans a little.
   * k runs 0..1; running it backwards (1..0) is the set-down.
   */
  function directGrab(rig:typeof captiveRig,spot:THREE.Vector3,yaw:number,k:number,aim:Aim,lean:number){
    const side=shooterSide(rig),reach=smooth(0,.42,k),close=smooth(.38,.56,k),lift=smooth(.56,1,k);
    rig.spine.rotation.x+=lean*smooth(0,.35,k)*(1-smooth(.6,1,k));
    rig.group.updateWorldMatrix(true,true);
    if(lift<=0){
      const rest=rig.arms[side].hand.getWorldPosition(new THREE.Vector3()),restQ=restingPalm(rig),contact=contactFor(rig,side,spot,yaw);
      const wrist=rest.lerp(contact.wrist,reach);wrist.y+=Math.sin(reach*Math.PI)*.03;
      solveWorld(rig,side,wrist,restQ.slerp(contact.palm,smooth(0,.85,reach)),false,true,false);
      if(reach>=.999){grip(rig,side);gunHolder=holderName(rig);}else flatGun(spot,yaw);
      rig.setGrip(side,.18+.82*close,0,0);
    } else {
      // Wrist and palm travel together from the felt grip to the aim grip; the revolver stays in the palm socket.
      const contact=contactFor(rig,side,spot,yaw),finish=aimGrip(rig,side,aim),eased=lift*lift*(3-2*lift);
      const wrist=contact.wrist.clone().lerp(finish.wrist,eased);wrist.y+=Math.sin(lift*Math.PI)*.05;
      const shoulder=rig.arms[side].shoulder.getWorldPosition(new THREE.Vector3()),away=wrist.clone().sub(shoulder),minimum=.24*Math.sin(lift*Math.PI);
      if(away.length()<minimum)wrist.copy(shoulder).add(away.setLength(minimum));
      if(lift>=.999)pointGun(rig,side,aim.muzzle,aim.q,!!aim.raised);
      else {solveWorld(rig,side,wrist,contact.palm.clone().slerp(finish.palm,eased),!!aim.raised&&lift>.75,true,false);grip(rig,side);}
      rig.setGrip(side,1,0,0);gunHolder=holderName(rig);
    }
    gun.userData.pickupPhase=lift>0?'lift':close>0?'grip':'reach';gun.userData.pickupContact=reach>=.999;gun.userData.pickupProgress=k;
  }
  /** A short push from behind the revolver; the gun then glides on its own. */
  function pushHand(rig:typeof captiveRig,side:'left'|'right',gunAt:THREE.Vector3,k:number,from:THREE.Vector3){
    const reach=smooth(0,.45,k),back=smooth(.70,1,k),amount=reach*(1-back);
    rig.spine.rotation.x+=(rig===playerRig?-.10:.14)*amount;rig.group.updateWorldMatrix(true,true);
    const rest=rig.arms[side].hand.getWorldPosition(new THREE.Vector3()),behind=gunAt.clone().add(from.clone().sub(gunAt).setY(0).setLength(.10));behind.y=gunAt.y+.035;
    solveWorld(rig,side,rest.lerp(behind,amount),restingPalm(rig),false,false,false);relaxHand(rig,side);
  }
  const deliveryShooter=(side:Side)=>side==='ai'?captiveRig:playerRig;
  /** Fraction of the slide route the Host's hand actually pushes before the revolver glides on its own. */
  const PUSH=.07;
  /** The player's grab ends with the revolver gripped but still resting on the felt; holding raises it. */
  const PLAYER_GRIP_K=.56;
  /** Host pushes the revolver from its rest to the shooter's spot, then the shooter grabs it. */
  function deliverAndGrab(side:Side,p:number){
    const spot=new THREE.Vector3(...GUN_PICKUP[side]),hostSeat=new THREE.Vector3(...HOST_SEAT);
    const u=p<.17?0:p<.27?PUSH*smooth(.17,.27,p):PUSH+(1-PUSH)*(1-(1-THREE.MathUtils.clamp((p-.27)/.35,0,1))**2.4);
    const at=new THREE.Vector3(...gunSlidePoint(side,u));
    if(p<.62){hostRig.pose('host-idle');pushHand(hostRig,'left',new THREE.Vector3(...gunSlidePoint(side,Math.min(u,PUSH))),THREE.MathUtils.clamp(p/.42,0,1),hostSeat);flatGun(at,REST_YAW*(1-u));gun.userData.shotStage='slide';}
    if(p>=.60){const rig=deliveryShooter(side),k=THREE.MathUtils.clamp((p-.60)/.40,0,1);directGrab(rig,spot,0,rig===playerRig?k*PLAYER_GRIP_K:k,finalAim(rig),rig===playerRig?-.16:.12);gun.userData.shotStage='grab';}
  }
  /** After an empty click the shooter sets it down, then pushes it back to the rest in front of the Host. */
  function setDownAndReturn(rig:typeof captiveRig,side:Side|'host',p:number,startK=1){
    if(rig===hostRig){directGrab(hostRig,gunRest,REST_YAW,1-smooth(0,.8,p),hostAim(),.20);if(p>=.8)flatGun(gunRest);return;}
    const spot=new THREE.Vector3(...GUN_PICKUP[side==='ai'?'ai':'player']);
    if(p<.40){directGrab(rig,spot,0,startK*(1-smooth(0,.40,p)),rig===playerRig?playerAim(1):finalAim(rig),rig===playerRig?-.16:.12);return;}
    const u=p<.52?1:p<.60?1-.12*smooth(.52,.60,p):.88*(1-smooth(.60,.95,p));
    const at=new THREE.Vector3(...gunSlidePoint(side==='ai'?'ai':'player',u));
    const behindFrom=rig===playerRig?view.getWorldPosition(new THREE.Vector3()):captive.getWorldPosition(new THREE.Vector3());
    if(p<.80)pushHand(rig,'right',new THREE.Vector3(...gunSlidePoint(side==='ai'?'ai':'player',Math.max(u,.88))),THREE.MathUtils.clamp((p-.40)/.40,0,1),behindFrom);
    flatGun(at,REST_YAW*(1-u));gun.userData.shotStage='return';
  }
  /** A fatal shot: the revolver leaves the dead hand, falls, clatters once and stays where it lands. */
  function droppedGun(age:number){
    scene.attach(gun);gun.scale.set(1,1,1);gunHolder=null;
    const onTable=Math.abs(dropFrom.x)<.70&&Math.abs(dropFrom.z)<.58,floor=onTable?.772:.035,fall=Math.max(.001,Math.sqrt(2*Math.max(0,dropFrom.y-floor)/9.8));
    const t=Math.max(0,age),landed=t>=fall,bounceT=t-fall,bounce=landed&&bounceT<.18?Math.sin(bounceT/.18*Math.PI)*.018:0;
    const drift=new THREE.Vector3(-.10,0,.12).multiplyScalar(Math.min(t,fall)/fall);
    gun.position.copy(dropFrom).add(drift);gun.position.y=landed?floor+bounce:dropFrom.y-4.9*t*t;
    const settle=flatQuaternion(REST_YAW+.9);gun.quaternion.copy(dropQuaternion).slerp(settle,Math.min(1,t/(fall+.12)));
    gun.userData.shotStage='dropped';gun.userData.landed=landed;
  }
  /** Head snaps away from the muzzle at the shot; the body goes limp sideways in the chair and stays visible. */
  function slumpCaptive(age:number){
    const snap=1-Math.exp(-Math.max(0,age)/.06),limp=smooth(.05,.40,age);slump=limp;
    captiveRig.pose('seated-resting');captive.position.set(0,.45,-.80);captive.rotation.set(0,0,0);
    captiveRig.spine.rotation.set(.20*limp,0,.30*limp);captiveRig.chest.rotation.set(.12*limp,0,.10*limp);
    captiveRig.neck.rotation.set(.35*limp,0,.10*limp);
    captiveRig.head.rotation.set(.25*limp,-.18*snap,.62*snap);
    captiveRig.group.updateWorldMatrix(true,true);
    const hang=(x:number)=>new THREE.Vector3(x,.08-.05*limp,.16);
    for(const side of ['left','right'] as const){const restTarget=new THREE.Vector3(side==='left'?-.10:.10,.315,.35),target=restTarget.lerp(hang(side==='left'?-.27:.29),limp);captiveRig.solveHand(side,target,new THREE.Vector3(side==='left'?-.5:.5,.3,.0),{lean:false});captiveRig.setGrip(side,.25);}
    captive.userData.slumped=limp>.99;
  }
  /** The captive's left hand holds the fan from below: fingers up over the card backs (player side), thumb on the faces. */
  function holdCaptiveFan(){
    const up=new THREE.Vector3(0,Math.cos(AI_FAN_TILT),Math.sin(AI_FAN_TILT)),towardPlayer=new THREE.Vector3(0,-Math.sin(AI_FAN_TILT),Math.cos(AI_FAN_TILT));
    const wrist=new THREE.Vector3(...AI_FAN_POSITION).addScaledVector(up,-.20).addScaledVector(towardPlayer,.020);
    const palm=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),AI_FAN_TILT-Math.PI/2);
    captiveRig.solveHand('left',wrist,new THREE.Vector3(-.45,.20,.05),{lean:false,palmQuaternion:palm});captiveRig.setGrip('left',.55);
    captiveRig.arms.left.thumb[0].rotation.x=-.9;
  }
  function hostTwist(amount:number){host.rotation.y=Math.PI/2-.38*amount;host.updateWorldMatrix(true,true);}
  /** Timeout: the player sets the revolver down and pushes it back; the seated Host takes it and aims from its seat. */
  function forcedShotPose(age:number){
    host.position.set(...HOST_SEAT);hostTwist(0);hostRig.pose('host-idle');
    if(age<1.4){setDownAndReturn(playerRig,'player',age/1.4,PLAYER_GRIP_K);gun.userData.shotStage='return';return;}
    playerPose();
    const k=THREE.MathUtils.clamp((age-1.4)/1.2,0,1);hostTwist(smooth(.5,1,k));hostRig.pose('host-idle');
    if(k<1)directGrab(hostRig,gunRest,REST_YAW,k,hostAim(),.20);
    else {const aim=hostAim();pointGun(hostRig,'left',aim.muzzle,aim.q);hostRig.setGrip('left',1,smooth(3.9,4.2,age),1);gunHolder='host';gun.userData.forcedMuzzleTarget=aim.muzzle.toArray();}
    gun.userData.shotStage=age<2.6?'pickup':'aim';
  }
  function hideHostBody(_forceActive:boolean){scene.traverse(object=>{if(object.userData.forcedHidden){object.layers.set(0);delete object.userData.forcedHidden;}});}
  /** Empty first-person hands rest palm down on the felt edge, fingers relaxed and pointing into the table. */
  function restPlayerHand(side:'left'|'right'){
    const target=playerRig.group.worldToLocal(atCamera(side==='left'?-.24:.24,-.355,-.47)),palm=playerRig.group.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(restingPalm(playerRig));
    // Elbows out to the side and back toward the body, above the table rim, with the forearms lying on the felt.
    playerRig.solveHand(side,target,new THREE.Vector3(side==='left'?-.60:.60,.42,.30),{lean:false,palmQuaternion:palm});relaxHand(playerRig,side);
  }
  function playerPose(holding=false,progress=0) {
    playerRig.pose(holding?'player-hold-to-pull':'player-card-hand');
    const q=view.getWorldQuaternion(new THREE.Quaternion());
    solveWorld(playerRig,'left',atCamera(-.18-Math.max(0,(currentRound?.player.length??2)-4)*.008,-.28,-.53),q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,Math.PI,0))));
    playerRig.setGrip('left',.15);playerRig.arms.left.fingers.forEach(c=>c.forEach(j=>j.rotation.x=-.025));playerRig.arms.left.thumb[0].rotation.x=-1.15;playerRig.arms.left.thumb[1].rotation.x=-.60;
    const newest=cardSlots.filter(s=>s.active&&s.owner==='player').at(-1),regrip=newest?Math.sin(Math.min(1,Math.max(0,(actorTime-newest.born)/.5))*Math.PI):0;playerRig.arms.left.thumb[0].rotation.x+=regrip*.18;
    restPlayerHand('right');
    if(holding) {
      restPlayerHand('left');
      const raise=smooth(0,.25,progress);
      if(raise<1)directGrab(playerRig,new THREE.Vector3(...GUN_PICKUP.player),0,PLAYER_GRIP_K+(1-PLAYER_GRIP_K)*raise,playerAim(0),-.16);
      else {const aim=playerAim((progress-.25)/.75);pointGun(playerRig,'right',aim.muzzle,aim.q);}
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
    hostChair.visible=target===host;chair.visible=target===captive;deck.visible=false;gun.visible=false;heldRig.visible=false;captiveHood.visible=false;cutter.visible=false;
    for(const slot of cardSlots)slot.group.visible=false;
  }
  let reactionShake=0;
  function applyReaction(state:ActorState,epoch:number){
    const pose=reactionPose(state.reaction,epoch,{phase:state.phase,suspense:state.suspense,dead:!!state.dead,holding:gunHolder!==null||!!state.gunTransfer});
    reactionShake=0;captive.userData.reactionActive=pose.active;captive.userData.reactionImpact=null;captive.userData.jawClench=0;
    head.traverse(o=>{if(o.name==='Mouth')o.rotation.x=0;});
    if(!pose.active||!state.reaction)return pose;
    const age=pose.age,kind=pose.kind,room=state.reaction.room,envelope=Math.sin(Math.min(1,age/(state.reaction.duration/1000))*Math.PI);
    if(kind==='loss'){
      const impact=pose.impact,raise=Math.sin(Math.min(1,age/impact)*Math.PI/2),settle=smooth(impact,1.4,age);
      let wrist=new THREE.Vector3(.22,.79,-.43),palm=new THREE.Quaternion();
      if(room===1){wrist.y+=.17*raise*(1-settle)*(1-smooth(impact-.18,impact,age));captiveRig.setGrip('right',1);}
      else if(room===2){
        const face=head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(.10,-.015-age*.07,.09));
        wrist.lerp(face,smooth(0,.2,age)*(1-smooth(.65,.95,age)));palm.setFromEuler(new THREE.Euler(-.3,0,0));
        captiveRig.setGrip('right',.22);captive.userData.jawClench=envelope;head.traverse(o=>{if(o.name==='Mouth')o.rotation.x=-envelope*.35;});
      }else {wrist.y+=.018*Math.sin(Math.min(1,age/impact)*Math.PI);captiveRig.setGrip('right',.20);captiveRig.arms.right.fingers[0].forEach(j=>j.rotation.x=-.12);}
      solveWorld(captiveRig,'right',wrist,palm,room===2,true);
      // Additive, analytic impulses start from freshly computed table transforms each frame.
      const strength=room===1?1:room===2?.45:.10,jump=Math.abs(pose.ring)*.009*strength;
      for(const slot of cardSlots)if(slot.active&&slot.group.visible&&slot.group.parent===scene)slot.group.position.y+=jump;
      if(gunHolder===null){gun.position.y+=Math.abs(pose.ring)*.002*strength;gun.rotation.z+=pose.ring*.018*strength;}
      reactionShake=pose.ring*.002*strength;
      if(age>=impact)captive.userData.reactionImpact={id:state.reaction.id,sound:pose.sound,position:captiveRig.arms.right.hand.getWorldPosition(new THREE.Vector3()).toArray()};
    }else if(kind==='survive'){
      captiveRig.chest.rotation.x+=envelope*.035;captiveRig.arms.right.shoulder.rotation.x+=envelope*.045;
      if(age>.12)captive.userData.reactionImpact={id:state.reaction.id,sound:pose.sound,position:head.getWorldPosition(new THREE.Vector3()).toArray()};
    }else if(kind==='player-click'){
      captiveRig.chest.rotation.z+=Math.sin(Math.min(1,age/.3)*Math.PI)*.025;
    }else if(kind==='relief'){
      captiveRig.chest.rotation.x+=envelope*.025;
      if(age>.12)captive.userData.reactionImpact={id:state.reaction.id,sound:pose.sound,position:head.getWorldPosition(new THREE.Vector3()).toArray()};
    }
    if(!cardRevealed&&cardSlots.some(slot=>slot.active&&slot.owner==='ai'))holdCaptiveFan();
    captiveRig.constrainFingers();return pose;
  }
  function debugUpdate(time:number) {
    hideHostBody(false);
    const pose=debugPose!;
    if(pose.startsWith('reaction-')){
      const saved=debugPose;debugPose=null;setCards(demo,true);
      const kind=pose.slice(9) as ReactionKind,age=time%2.5;
      update(time,.05,{phase:'ROUND_RESULT',roundNumber:1,revealed:true,suspense:false,dead:null,shotEffect:null,roomNumber:debugRoom,
        reaction:{id:Math.floor(time/2.5)+1,kind,room:debugRoom,startedAt:Date.now()-age*1000,duration:kind==='glare'?1800:1500}});
      debugPose=saved;playerHands.visible=heldRig.visible=false;return captive;
    }
    if(['host-forced-shot','player-peek','host-dealing','hood-on','hood-mid-removal','hood-off','player-empty-hand','host-open-hand','host-speaking','host-seated','opponent-card-hand','gaze-test','pickup-player','pickup-ai','pickup-host'].includes(pose)) {
      const saved=debugPose;debugPose=null;
      const isPickup=pose.startsWith('pickup-'),isCapGrip=pose==='opponent-card-hand'||pose==='gaze-test',pickupOwner=pose==='pickup-ai'?'ai':pose==='pickup-host'?'host':'player';
      if(isCapGrip||isPickup)setCards(demo,false);
      const peek=pose==='player-peek',forced=pose==='host-forced-shot',hoodPose=pose.startsWith('hood-'),empty=pose==='player-empty-hand',gesture=pose==='host-open-hand'||pose==='host-speaking',age=peek?.50:2.8;
      update(time,.5,{worldSound:debugSound,gunTransfer:isPickup?{stage:'to-shooter',side:pickupOwner==='ai'?'ai':'player',owner:pickupOwner,startedAt:Date.now()-((time%2)/1.5)*1500,duration:1500}:null,phase:isPickup?pickupOwner==='ai'?'AI_SHOOTING':'PLAYER_SHOOTING':hoodPose?'OPENING':empty||gesture||isCapGrip||pose==='host-seated'?'PLAYER_DECISION':peek?'PLAYER_PEEKING':forced?'HOST_FORCE_SHOT':'DEALING',roundNumber:1,revealed:false,suspense:false,dead:null,shotEffect:null,
        forceShotAt:forced?Date.now()-age*1000:null,peekActor:peek?'player':null,peekStartedAt:Date.now()-age*1000,
        speaker:gesture?'host':null,hostVoiceLevel:gesture?1:0,cinematic:hoodPose?{stage:pose==='hood-on'?'hooded':pose==='hood-off'?'rules':'opponent-unhood',mode:'full',startedAt:Date.now()-(pose==='hood-mid-removal'?3577:0)}:null,peekedCard:peek?demo.player[0]:null,tiesCut:{player:true,ai:true}});
      debugPose=saved;
      if(isCapGrip){animateCards(time+2,.1,{phase:'PLAYER_DECISION',roundNumber:1,revealed:false,suspense:false,dead:null,shotEffect:null});host.visible=playerHands.visible=heldRig.visible=hostChair.visible=false;for(const slot of cardSlots)slot.group.visible=slot.owner==='ai';return captive;}
      if(isPickup){host.visible=pickupOwner==='host';captive.visible=pickupOwner==='ai';playerHands.visible=pickupOwner==='player';heldRig.visible=false;cardSlots.forEach(s=>s.group.visible=false);hostChair.visible=host.visible;chair.visible=captive.visible;return pickupOwner==='host'?host:pickupOwner==='ai'?captive:playerHands;}
      if(hoodPose){host.visible=playerHands.visible=heldRig.visible=false;return captive;}
      if(empty){host.visible=captive.visible=heldRig.visible=false;return playerHands;}
      if(peek){captive.visible=host.visible=false;playerHands.visible=true;}
      else {captive.visible=playerHands.visible=false;heldRig.visible=false;}
      chair.visible=false;
      return peek?playerHands:host;
    }
    const rig=pose.startsWith('host-')?hostRig:pose.startsWith('guard-')?guardRigs[0]:pose.startsWith('player-')?playerRig:captiveRig;
    hideExcept(rig.group);rig.group.visible=true;rig.setRoom(debugRoom);
    rig.group.position.set(0,pose.startsWith('guard-')?.9:.45,0);
    rig.group.rotation.set(0,0,0);rig.pose(pose as PoseName,time);
    if(rig===captiveRig){chair.position.set(0,0,0);}

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
    if(playerHands.parent!==view){view.attach(playerHands);playerHands.rotation.set(0,0,0);playerHands.scale.set(1,1,1);}
    if(heldRig.parent!==view){view.add(heldRig);heldRig.position.set(0,0,0);heldRig.rotation.set(0,0,0);}
    const dt=Math.max(0,delta),epoch=Date.now(),room=state.roomNumber??1;
    if(room!==currentRoom){currentRoom=room;captiveRig.setRoom(room);}
    if(state.roundNumber!==lastRound||state.phase!==lastPhase){
      if(state.roundNumber!==lastRound){lastRound=state.roundNumber;priorShotEffect=null;latchedShooter=null;gunHolder=null;shotAt=-Infinity;}
      if(state.phase!==lastPhase){phaseStartedAt=time;lastPhase=state.phase;if(['PLAYER_SHOOTING','AI_SHOOTING','HOST_FORCE_SHOT'].includes(state.phase)&&shootingLayStartedAt<0){shootingLayStartedAt=time;cardSlots.filter(s=>s.active&&s.owner==='player').forEach(rememberWorld);}else if(['PLAYER_DECISION','SHUFFLING','START'].includes(state.phase))shootingLayStartedAt=-1;}
      if(state.phase==='SWEEPING'){sweepStartedAt=time;cardSlots.filter(s=>s.active).forEach(rememberWorld);}
    }
    elapsedShoot=time-phaseStartedAt;
    const shuffle=state.phase==='SHUFFLING'?Math.sin(Math.min(1,elapsedShoot/.50)*Math.PI*2):0;
    upperPack.position.set(shuffle*.045,.010+Math.abs(shuffle)*.015,0);upperPack.rotation.y=shuffle*.22;
    captive.visible=host.visible=playerHands.visible=true;hostChair.visible=true;chair.visible=true;deck.visible=true;heldRig.visible=true;gun.visible=true;
    captive.position.set(0,.45,-.80);captive.rotation.set(0,0,0);host.position.set(...HOST_SEAT);host.rotation.set(0,Math.PI/2,0);playerHands.position.set(0,-.75,0);
    captiveRig.pose('seated-resting');hostRig.pose('host-idle');relaxHand(hostRig,'left');relaxHand(hostRig,'right');relaxHand(captiveRig,'right');playerPose();
    if(!cardRevealed&&cardSlots.some(slot=>slot.active&&slot.owner==='ai'))holdCaptiveFan();
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
    const hostHeadRotation=hostHead.rotation.clone();
    if(['SHUFFLING','DEALING','HITTING','DEALER_TURN','REVEAL','SWEEPING'].includes(state.phase)) {
      hostRig.pose('host-dealing',time);
      const palm=new THREE.Quaternion().setFromEuler(new THREE.Euler(1.05,0,0));
      const dealing=['DEALING','HITTING','DEALER_TURN'].includes(state.phase);
      const stroke=dealing?Math.sin((elapsedShoot*1000/CONFIG.DEAL_SPEED%1)*Math.PI):Math.abs(shuffle);
      solveWorld(hostRig,'right',new THREE.Vector3(DECK_POSITION[0],.80+.025*stroke,DECK_POSITION[2]+.010*stroke),palm);
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
      if(cutter.visible){const g=guards[0],playerCut=stage==='cut-player';g.group.visible=true;g.group.position.set(playerCut?.60:.55,playerCut?.75:.60,playerCut?.55:-.5);g.group.rotation.y=-Math.PI/2;g.rig.pose('guard-walking',0);g.rig.setStandingHeight(g.group.position.y);g.rig.spine.rotation.x=.75;g.rig.group.updateWorldMatrix(true,true);const target=playerCut?atCamera(0,-.35,-.38):new THREE.Vector3(0,.78,-.45);g.rig.solveHand('right',g.group.worldToLocal(target),undefined,{lean:false});g.rig.setGrip('right',.6);g.rig.arms.right.hand.add(cutter);}

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
    if(newShot){shotAt=time;latchedShooter=gunHolder??(state.dead==='ai'?'ai':'player');
      if(state.shotEffect==='shot'&&state.dead==='ai'){dropFrom.copy(lastGunPosition);dropQuaternion.copy(lastGunQuaternion);dropAt=time;}}
    if(state.roundNumber!==dropRound){dropRound=state.roundNumber;if(state.dead!=='ai')dropAt=-Infinity;}
    priorShotEffect=state.shotEffect;
    const transfer=state.dead==='ai'?null:state.gunTransfer;
    const forceAge=(epoch-(state.forceShotAt??epoch))/1000;
    if(state.dead==='ai'&&Number.isFinite(dropAt))droppedGun(time-dropAt);
    else if(transfer){const p=gunTransferProgress(transfer,epoch);
      if(transfer.stage==='to-shooter'){if(transfer.owner==='host')forcedShotPose(1.4+p*1.2);else deliverAndGrab(transfer.side,p);}
      else setDownAndReturn(transfer.owner==='host'?hostRig:transfer.side==='ai'?captiveRig:playerRig,transfer.owner??transfer.side,p);}
    else if(state.phase==='HOST_FORCE_SHOT'||state.forceShotAt!=null&&state.phase==='ROUND_RESULT'&&forceAge<4400/1000)forcedShotPose(forceAge);
    else if(state.shotEffect&&time-shotAt<.2){if(latchedShooter==='ai')selfShot();else if(latchedShooter==='host')forcedShotPose(4.2);else playerPose(true,1);}
    else if(state.phase==='AI_SHOOTING')selfShot();
    else if(state.phase==='PLAYER_SHOOTING'){playerPose(true,state.triggerProgress??0);}
    else flatGun(gunRest);
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
    heldRig.position.set(0,0,0);
    if(peek==='player')solveWorld(playerRig,'left',atCamera(-.18,-.28,-.53),view.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,Math.PI,0))));
    const busyLeft=!cardRevealed&&shootingLayStartedAt<0&&currentRound?.player.length&& !['START','OPENING','TRANSITION','SWEEPING'].includes(state.phase);
    if(!busyLeft&&!boundPlayer&&peek!=='player')restPlayerHand('left');
    const playerRightBusy=gunHolder==='player'||!!transfer&&transfer.side==='player'||state.phase==='PLAYER_PEEKING'||state.phase==='HOST_FORCE_SHOT'&&forceAge<1.4;
    if(!boundPlayer&&!playerRightBusy)restPlayerHand('right');
    if(state.speaker==='host' && !['SHUFFLING','DEALING','HITTING','DEALER_TURN','HOST_FORCE_SHOT'].includes(state.phase)&&time-hostGestureAt<1.5){hostRig.solveHand('left',new THREE.Vector3(-.10,.20,.22));hostRig.setGrip('left',.18);}
    for(const rig of [captiveRig,hostRig,playerRig,...guardRigs])rig.constrainFingers();
    const hiddenCards=['START','OPENING','TRANSITION','ENDING_WIN'].includes(state.phase);
    animateCards(time,dt,state);
    if(hiddenCards){heldRig.visible=false;cardSlots.forEach(slot=>{slot.group.visible=false;slot.group.userData.held=false;slot.group.userData.tableFaceUp=false;});}
    if(state.dead==='ai'&&Number.isFinite(dropAt))slumpCaptive(time-dropAt);else slump=0;
    const reaction=applyReaction(state,epoch);
    const eye=view.getWorldPosition(new THREE.Vector3()),ownCards=aiHeldRig.getWorldPosition(new THREE.Vector3()),gunPoint=gun.getWorldPosition(new THREE.Vector3()),hostPoint=hostHead.getWorldPosition(new THREE.Vector3());
    const sound=state.worldSound??debugSound,capSound=soundReaction(sound,epoch),hostSound=soundReaction(sound,epoch,true);
    const dealing=['SHUFFLING','DEALING','HITTING','DEALER_TURN','SWEEPING'].includes(state.phase),shooting=['AI_SHOOTING','PLAYER_SHOOTING','HOST_FORCE_SHOT'].includes(state.phase)||!!transfer;
    const recentPlayer=['HITTING','REVEAL','SWEEPING','PLAYER_PEEKING'].includes(state.phase)&&time-phaseStartedAt<1.2;
    let captiveTarget=shooting?gunPoint:state.speaker==='host'||dealing?hostPoint:state.speaker==='captive'?state.addressedTo==='host'?hostPoint:eye:state.phase==='REVEAL'?time-phaseStartedAt<.7?new THREE.Vector3(0,.76,.27):eye:recentPlayer?eye:ownCards;
    if(!shooting&&!state.speaker&&!dealing&&!recentPlayer){if(room===1){const glance=Math.floor(time/3)%3;captiveTarget=glance===0?ownCards:glance===1?eye:gunPoint;}else if(room===2)captiveTarget=time%13<1?ownCards:eye;}
    if(!shooting&&!state.speaker&&!dealing&&state.attention?.captive.away)captiveTarget=state.attention.captive.returning?eye:ownCards;
    const hostTarget=state.phase==='HOST_FORCE_SHOT'?eye:shooting?gunPoint:state.speaker==='host'?state.addressedTo==='captive'?head.getWorldPosition(new THREE.Vector3()):eye:state.speaker==='captive'?head.getWorldPosition(new THREE.Vector3()):dealing||state.attention?.host.away&&!state.attention.host.returning?deck.getWorldPosition(new THREE.Vector3()):eye;
    if(reaction.active&&reaction.gaze)captiveTarget=reaction.gaze==='player'?eye:new THREE.Vector3(0,.76,-.27);
    if(capSound>0&&sound){captiveTarget=new THREE.Vector3(...sound.position);captiveRig.chest.rotation.z+=Math.sin(Math.min(1,(epoch-sound.at)/180)*Math.PI)*sound.loudness*(room===1?.08:room===3?.02:.045);}
    lookAtTarget(hostRig,hostSound>0&&sound?new THREE.Vector3(...sound.position):hostTarget,hostSound>0?dt*.55:dt,hv*.01*motion);
    if(state.dead!=='ai'&&gunHolder!=='ai'&&!captiveHood.visible)lookAtTarget(captiveRig,captiveTarget,capSound>0?dt*1.8:dt,cv*.01*motion);
    captive.userData.gazePriority=capSound>0?'sound':reaction.active&&reaction.gaze?'reaction':shooting||recentPlayer||state.speaker||dealing?'context':'cards';
    const forceActive=state.phase==='HOST_FORCE_SHOT'||state.forceShotAt!=null&&state.phase==='ROUND_RESULT';
    const allowed:THREE.Object3D[]=[];
    hostRig.updateCoat();hideHostBody(false);
    applyNearCameraHiding(scene,view,forceActive,allowed);
    // Remember where the revolver was drawn this frame; a fatal shot drops it from exactly there.
    gun.updateWorldMatrix(true,false);gun.getWorldPosition(lastGunPosition);gun.getWorldQuaternion(lastGunQuaternion);
  }
  let debugTarget:THREE.Group=captive;
  return {get reactionShake(){return reactionShake;},hostChair,aiHeldRig,chair,guards,cutter,captiveTie,playerTie,captiveLegs:captiveRig.legs,standingHostLegs:hostRig.legs,
    stranger:captive,captive,head,captiveHead:head,leftHand,rightHand,host,hostHead,hostLeftHand,hostRightHand,captiveHood,
    playerHands,heldRig,deck,gun,hammer,cylinder:revolverCylinder,peekCard,peekFront,deckCorner,cardSlots,skeletons,
    setDebugSound:(sound:WorldSound)=>{debugSound=sound;},setCards,update,setDebugPose:(pose:string,room:1|2|3=1)=>{debugPose=pose as DebugPoseName;debugRoom=room;},get debugTarget(){return debugTarget;}};
}
