import type { GunTransfer } from './gunTransfer';
import { createCharacter } from './scene/skeleton';
import type { Attention } from './attention';
import { bodyLanguage, shotBodyOnly } from './bodyLanguage';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CONFIG, type Card, type GamePhase, type Round } from './game';
import { createRoom, decisionEvent, isExitStage } from './scene/room';
import { tableAudio } from './audio';
import { eventDoorPulse, type OpponentTell, type RoundEvent, type Side } from './tension';
import { createActors } from './scene/actors';
import { createCeilingFeed, createMonitorWall } from './scene/monitors';
import { cameraRecenter, createLeanState, createLookKeys, createLookState, dragLook, updateKeyboardLook, updateLean, updateLook, wheelLean } from './scene/camera';
import { cinematicProgress, focusRecovery, hoodCoverage, type CinematicState } from './cinematics';
import type { AmbientEvent, DistantShot } from './roomLife';
import { playerPeekDeck } from './tableLayout';

export type SceneProps = {
  phase: GamePhase;
  round: Round | null;
  roundNumber: number;
  revealed: boolean;
  suspense: boolean;
  dead: 'player' | 'ai' | null;
  shotEffect: 'click' | 'shot' | null;
  danger: boolean;
  recenterToken: number;
  lookDisabled?: boolean;
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
  storyStage?: string;
  feedDeaths?: number[];
  feedDeathSerial?: number;
  guestsRemaining?: number;
  cinematic?: CinematicState | null;
  tiesCut?: { player: boolean; ai: boolean };
  distantShot?: DistantShot | null;
  ambientEvent?: AmbientEvent | null;
  aiShotStartedAt?: number | null;
  aiShotDurationMs?: number;
  gunTransfer?: GunTransfer | null;
  attention?: Attention; stress?: number; caught?: 'host' | 'captive' | 'ai' | null;
  peekStartedAt?: number | null; forceShotAt?: number | null;
  onOpponentInView?: (visible: boolean) => void;
};

function splatterTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4a1711';
  let seed = 93;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 64; i++) {
    const angle = random() * Math.PI * 2, radius = random() * 54;
    ctx.beginPath(); ctx.ellipse(64 + Math.cos(angle) * radius, 64 + Math.sin(angle) * radius, 2 + random() * 12, 1 + random() * 5, angle, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function hoodPresentation(cinematic: CinematicState | null | undefined, now = Date.now()) {
  const progress = cinematicProgress(cinematic, now), covered = hoodCoverage(cinematic, now);
  const recovery = focusRecovery(cinematic, now);
  const lifting = cinematic?.stage === 'player-unhood';
  const dropping = cinematic?.stage === 'transfer-hood';
  const focusing = cinematic?.stage === 'player-focus';
  const elapsed = cinematic ? Math.max(0, (now - cinematic.startedAt) / 1000) : 0;
  const tug = lifting ? Math.sin(Math.min(1, progress / .33) * Math.PI) : 0;
  const drop = focusing ? Math.sin(Math.min(1, elapsed / .3) * Math.PI) : 0;
  const carrying = cinematic?.mode === 'transfer' && ['lift', 'dragging', 'door'].includes(cinematic.stage);
  const carry = carrying ? cinematic.stage === 'lift' ? progress : 1 : 0;
  const drag = cinematic?.mode === 'transfer' ? cinematic.stage === 'dragging' ? progress : cinematic.stage === 'door' ? 1 : 0 : 0;
  return { covered: lifting || dropping ? 1 : covered, lift: lifting ? progress : 0,
    drop: dropping ? progress : 1, blur: focusing ? 1 - recovery : 0,
    glare: focusing ? Math.exp(-elapsed * 5.5) : 0, squint: focusing ? (1 - recovery) * .68 : 0,
    cameraX: drag * 2.7, cameraY: tug * .055 - drop * .016 + carry * .14, cameraZ: -tug * .045 - drag * 6.3, cameraPitch: -tug * .04 + drop * .016 };
}

export const retroFragment = `
  uniform sampler2D sceneTexture;
  uniform float time;
  uniform float triggerDarkening;
  uniform float heartbeatPulse;
  uniform float forcedContact;
  uniform float hoodCovered;
  uniform float hoodLift;
  uniform float hoodDrop;
  uniform float focusBlur;
  uniform float glare;
  uniform float squint;
  varying vec2 vUv;
  float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233)) + time * .29) * 43758.5453); }
  float bayer(vec2 p) {
    vec2 q = mod(floor(p), 4.);
    if(q.y < 1.) return q.x < 1. ? 0. : q.x < 2. ? 8. : q.x < 3. ? 2. : 10.;
    if(q.y < 2.) return q.x < 1. ? 12. : q.x < 2. ? 4. : q.x < 3. ? 14. : 6.;
    if(q.y < 3.) return q.x < 1. ? 3. : q.x < 2. ? 11. : q.x < 3. ? 1. : 9.;
    return q.x < 1. ? 15. : q.x < 2. ? 7. : q.x < 3. ? 13. : 5.;
  }
  void main() {
    vec2 pixel = vec2(1. / 640., 1. / 360.);
    float radius = forcedContact * (1. - smoothstep(0., .12, vUv.x)) * 1.8 + focusBlur * 7. + hoodCovered * 10.;
    vec3 color = texture2D(sceneTexture, vUv).rgb;
    if (radius > .01) {
      color *= .28;
    color += texture2D(sceneTexture, vUv + pixel * vec2(radius, 0.)).rgb * .12;
    color += texture2D(sceneTexture, vUv - pixel * vec2(radius, 0.)).rgb * .12;
    color += texture2D(sceneTexture, vUv + pixel * vec2(0., radius)).rgb * .12;
    color += texture2D(sceneTexture, vUv - pixel * vec2(0., radius)).rgb * .12;
    color += texture2D(sceneTexture, vUv + pixel * vec2(radius, radius)).rgb * .06;
    color += texture2D(sceneTexture, vUv - pixel * vec2(radius, radius)).rgb * .06;
    color += texture2D(sceneTexture, vUv + pixel * vec2(radius, -radius)).rgb * .06;
    color += texture2D(sceneTexture, vUv + pixel * vec2(-radius, radius)).rgb * .06;
    }
    color = pow(max(color, vec3(0.)), vec3(1. / 2.2));
    color *= vec3(1.035, 1.015, .94);
    float ordered = (bayer(gl_FragCoord.xy) / 16. - .5) * .75;
    vec3 levels = vec3(28., 30., 26.);
    color = floor(color * levels + ordered) / levels;
    color += (noise(gl_FragCoord.xy) - .5) * .018;
    vec2 uv = (vUv - .5) * vec2(1.12, 1.);
    float vignette = 1. - smoothstep(.16, .77, length(uv)) * .72;
    vignette *= 1. - smoothstep(.03, .72, length(uv)) * triggerDarkening * (.30 + heartbeatPulse * .12);
    float highlight = smoothstep(.88, 1., max(color.r, max(color.g, color.b)));
    vignette *= 1. - smoothstep(.10, .66, length(uv)) * squint;
    color *= mix(vignette, 1., highlight * .85);
    color += vec3(1.3, 1.2, 1.03) * glare * .85;
    // Burlap is attached to the head. Its threads breathe, while real blurred
    // room lights behind the weave shift with the player's seated look.
    float breath = sin(time * 1.65) * .009 + sin(time * .83) * .004;
    vec2 clothUV = (vUv - .5) * (1. + breath) + .5;
    clothUV.y += hoodLift * .95;
    clothUV.x += sin(vUv.y * 8.) * hoodLift * .035;
    vec2 weave = fract(clothUV * vec2(112., 78.));
    float gap = smoothstep(.36, .47, weave.x) * (1. - smoothstep(.53, .64, weave.x));
    gap *= smoothstep(.32, .45, weave.y) * (1. - smoothstep(.55, .68, weave.y));
    float strands = .72 + sin(clothUV.x * 704.) * .12 + cos(clothUV.y * 490.) * .10;
    vec3 cloth = vec3(.021, .017, .011) * strands;
    cloth += min(color, vec3(1.)) * (.007 + gap * .11);
    float lifted = hoodLift < .001 ? 1. : smoothstep(hoodLift - .035, hoodLift + .035, vUv.y);
    float dropped = hoodDrop > .999 ? 1. : hoodDrop < .001 ? 0. : smoothstep(1. - hoodDrop - .035, 1. - hoodDrop + .035, vUv.y);
    float cover = hoodCovered * lifted * dropped;
    color = mix(color, cloth, cover);
    gl_FragColor = vec4(max(color, vec3(0.)), 1.);
  }
`;

/** Rendering consumes a public view of the game; no deck or revolver secrets enter this layer. */
export default function Scene(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;
    // DOM-only tests do not provide a GPU. The actual scene is validated in Chromium.
    if (!('WebGLRenderingContext' in window)) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setUnavailable(true); return;
    }
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    const canvas = renderer.domElement;
    canvas.className = 'pixel-canvas';
    canvas.setAttribute('aria-label', '3D bunker. Hold the left mouse button and drag, or use W A S D, to look around.');
    canvas.dataset.testid = 'bunker-canvas';
    mount.appendChild(canvas);

    const world = new THREE.Scene();
    world.background = new THREE.Color('#090d0b');
    world.fog = new THREE.FogExp2('#0c110f', .135);
    const camera = new THREE.PerspectiveCamera(68, 16 / 9, .055, 28);
    camera.rotation.order = 'YXZ';
    const room = createRoom(world);
    world.add(camera);
    const actors = createActors(world, camera);
    const monitors = createMonitorWall(world);
    const ceilingFeed = createCeilingFeed(world, monitors.group);
    monitors.setCeilingTexture(ceilingFeed.target.texture);
    // The first-person hands and this overhead body represent the same player.
    // Only the surveillance camera sees layer 1, so the seated POV stays intact.
    const surveillanceRig = createCharacter('captive',1);
    const surveillancePlayer = surveillanceRig.group;
    surveillancePlayer.name = 'surveillance-player-body';
    surveillancePlayer.userData.actorRole = 'player';
    surveillancePlayer.position.set(0,.45,.90); surveillancePlayer.rotation.y=Math.PI;
    surveillanceRig.pose('seated-resting');
    surveillancePlayer.traverse(object=>object.layers.set(1)); world.add(surveillancePlayer);
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const dustGeometry=new THREE.BufferGeometry(),dustPositions=new Float32Array(90);for(let i=0;i<30;i++){dustPositions[i*3]=Math.sin(i*7)*.8;dustPositions[i*3+1]=1.4+(i%7)*.07;dustPositions[i*3+2]=-.3+(i%5)*.15;}dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:0xb7ac8a,size:.006,transparent:true,opacity:0}));world.add(dust);let dustAt=-Infinity;
    const blood = new THREE.Group();
    const bloodMap = splatterTexture();
    const bloodMaterial = new THREE.MeshBasicMaterial({ map: bloodMap, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const wallStain = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.25), bloodMaterial);
    wallStain.position.set(0, 1.7, -4.075);
    const tableStain = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .9), bloodMaterial);
    tableStain.rotation.x = -Math.PI / 2;
    tableStain.position.set(0,.752,-.28);
    blood.add(wallStain, tableStain); blood.visible = false; world.add(blood);
    const muzzle = new THREE.PointLight('#fff1bd', 0, 4, 2); world.add(muzzle);

    const target = new THREE.WebGLRenderTarget(640, CONFIG.PIXEL_HEIGHT, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
    });
    const postScene = new THREE.Scene();
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const postMaterial = new THREE.ShaderMaterial({
      uniforms: { sceneTexture: { value: target.texture }, time: { value: 0 }, triggerDarkening: { value: 0 }, heartbeatPulse: { value: 0 }, forcedContact: {value:0}, hoodCovered: { value: 0 }, hoodLift: { value: 0 }, hoodDrop: { value: 1 }, focusBlur: { value: 0 }, glare: { value: 0 }, squint: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: retroFragment,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial); postScene.add(quad);
    function resize() {
      const bounds = mount!.getBoundingClientRect();
      const aspect = bounds.width / Math.max(1, bounds.height);
      const width = Math.round(CONFIG.PIXEL_HEIGHT * aspect);
      renderer.setSize(width, CONFIG.PIXEL_HEIGHT, false);
      target.setSize(width, CONFIG.PIXEL_HEIGHT);
      camera.aspect = aspect; camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize); observer.observe(mount); resize();

    let look = createLookState();
    if (latest.current.phase === 'START') look.yaw = look.targetYaw = .20;
    const keys = createLookKeys();
    const lean = createLeanState();
    const keyBindings = { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' } as const;
    function clearKeys() {
      keys.left = keys.right = keys.up = keys.down = false;
      look.yawVelocity = look.pitchVelocity = 0;
    }
    function keyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || latest.current.lookDisabled) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const direction = keyBindings[event.code as keyof typeof keyBindings];
      if (direction) { keys[direction] = true; event.preventDefault(); }
    }
    function keyUp(event: KeyboardEvent) {
      const direction = keyBindings[event.code as keyof typeof keyBindings];
      if (direction) keys[direction] = false;
    }
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clearKeys);
    let dragging = false, lastX = 0, lastY = 0;
    function pointerDown(event: PointerEvent) {
      if (event.button !== 0 || latest.current.lookDisabled || cameraRecenter(latest.current.phase, latest.current.suspense, latest.current.cinematic)) return;
      dragging = true; lastX = event.clientX; lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-dragging');
      event.preventDefault();
    }
    function pointerMove(event: PointerEvent) {
      if (!dragging) return;
      if (!latest.current.lookDisabled && !cameraRecenter(latest.current.phase, latest.current.suspense, latest.current.cinematic)) {
        dragLook(look, event.clientX - lastX, event.clientY - lastY, CONFIG.LOOK_SENSITIVITY);
      }
      lastX = event.clientX; lastY = event.clientY;
    }
    function pointerUp(event: PointerEvent) {
      dragging = false; canvas.classList.remove('is-dragging');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
    function wheel(event: WheelEvent) {
      const state = latest.current;
      if (state.lookDisabled || state.phase !== 'PLAYER_DECISION') return;
      event.preventDefault();
      wheelLean(lean, event.deltaY, CONFIG.LEAN_DISTANCE, true);
    }
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('lostpointercapture', pointerUp);

    let frame = 0, lastTime = performance.now(), startTime = lastTime;
    let previousCards: Round | null | undefined;
    let previousRound = -1, previousRevealed = false, previousEffect: SceneProps['shotEffect'] = null;
    let previousRecenter = latest.current.recenterToken, previousPhase = latest.current.phase;
    let previousRoom = latest.current.roomNumber ?? 1, previousStoryStage = latest.current.storyStage ?? '';
    let storyStartedAt = 0, winPose = false;
    const finalCameraPosition = new THREE.Vector3(), finalCameraQuaternion = new THREE.Quaternion();
    let impulse = 0, flash = 0, deathProgress = 0, renderedFrames = 0;
    let fpsStart = performance.now(), fpsFrames = 0;
    const gunPosition = new THREE.Vector3(), captiveScreen = new THREE.Vector3();
    let opponentVisible: boolean | null = null, contactSerial = -1, lastHeel = -1;
    function animate(now: number) {
      const cameraDelta = Math.max(0, (now - lastTime) / 1000);
      const dt = Math.min(cameraDelta, .05); lastTime = now;
      const time = (now - startTime) / 1000, state = latest.current;
      const epoch = Date.now(), event = decisionEvent(state.phase, state.event, epoch);
      const roomNumber = state.roomNumber ?? 1;
      const replay = (state.phase === 'OPENING' && previousPhase !== 'OPENING') ||
        (state.roomNumber === undefined && state.phase === 'SHUFFLING' && state.roundNumber === 1 && previousPhase !== 'SHUFFLING');
      const enteringRoom = roomNumber !== previousRoom;
      if (state.phase !== previousPhase) storyStartedAt = time;
      if ((state.storyStage ?? '') !== previousStoryStage) { previousStoryStage = state.storyStage ?? ''; storyStartedAt = time; }
      const stageElapsed = time - storyStartedAt;
      if (replay || enteringRoom) {
        look = createLookState(); clearKeys(); lean.amount = lean.target = 0; impulse = flash = deathProgress = 0;
        blood.visible = false; dustAt=-Infinity; previousEffect = null; room.reset(); monitors.reset(); ceilingFeed.reset();
        if (replay) winPose = false;
      }
      previousRoom = roomNumber;
      if (state.round !== previousCards || state.roundNumber !== previousRound || state.revealed !== previousRevealed) {
        actors.setCards(state.round ? { player: state.round.player, ai: state.round.ai, deck: [] } : null, state.revealed);
        previousCards = state.round; previousRound = state.roundNumber; previousRevealed = state.revealed;
      }
      if (state.recenterToken !== previousRecenter) {
        clearKeys(); look.targetYaw = look.targetPitch = 0; previousRecenter = state.recenterToken;
      }
      const locked = cameraRecenter(state.phase, state.suspense, state.cinematic);
      updateLean(lean, cameraDelta, CONFIG.LEAN_DISTANCE, state.phase !== 'PLAYER_DECISION' || !!state.lookDisabled);
      const hood = hoodPresentation(state.cinematic, epoch);
      if (state.lookDisabled) clearKeys();
      updateKeyboardLook(look, keys, cameraDelta, CONFIG.LOOK_KEY_SPEED, locked || !!state.lookDisabled);
      updateLook(look, cameraDelta, locked);
      if (state.shotEffect && state.shotEffect !== previousEffect) {
        impulse = state.shotEffect === 'shot' ? 1.5 : .28;
        flash = state.shotEffect === 'shot' ? 1 : 0;if(state.shotEffect==='shot')dustAt=time;
      }
      dust.position.y=-Math.min(1.3,Math.max(0,time-dustAt)*.35);(dust.material as THREE.PointsMaterial).opacity=Math.max(0,1-(time-dustAt)/4)*.5;
      previousEffect = state.shotEffect;
      previousPhase = state.phase;
      impulse = Math.max(0, impulse - dt * 1.6);
      flash = Math.max(0, flash - dt * 10);
      if (state.dead === 'player') deathProgress = Math.min(1, deathProgress + dt / 1.8);
      else deathProgress = 0;
      const feedSlump = state.dead === 'player' && state.phase === 'ENDING_DEATH' && state.storyStage !== 'fall' ? 1 : deathProgress;
      surveillancePlayer.rotation.set(-feedSlump * 1.3, Math.PI, -feedSlump * .14);
      surveillancePlayer.position.y = .45 - feedSlump * .05;
      blood.visible = state.dead === 'ai' && CONFIG.GORE_LEVEL !== 'low';
      const sway = Math.sin(time * 1.15) * .0025;
      const distantAge = state.distantShot ? (epoch - state.distantShot.startedAt) / 1000 : -1;
      const distantShake = distantAge >= 0 && distantAge < .65 ? Math.exp(-distantAge * 8) : 0;
      const doorShake = (eventDoorPulse(event, epoch) + distantShake * .55) * (motionPreference.matches ? .2 : 1);
      camera.position.set(Math.sin(time * .7) * .005, 1.20 + Math.sin(time * 1.1) * .007 - deathProgress * .38 - lean.amount * .16 + hood.cameraY * (motionPreference.matches ? .2 : 1), 1.05 - lean.amount + hood.cameraZ * (motionPreference.matches ? .2 : 1));
      camera.position.x += Math.sin(time * 79) * doorShake * .006 + hood.cameraX;
      camera.rotation.set(-.12 + look.pitch + sway + Math.sin(time * 73) * impulse * .025, look.yaw + Math.sin(time * 61) * impulse * .018, -deathProgress * .62 + Math.cos(time * 82) * impulse * .012);
      camera.rotation.x += Math.sin(time * 87 + .7) * doorShake * .005 + hood.cameraPitch * (motionPreference.matches ? .2 : 1);
      camera.rotation.z += Math.cos(time * 73) * doorShake * .003;
      if (isExitStage(state.phase, state.storyStage)) {
        const stage = state.storyStage ?? 'door';
        if (stage === 'door') camera.lookAt(2.7, 1.35, -4.1);
        else {
          const progress = stage === 'stairs' ? THREE.MathUtils.smoothstep(Math.min(1, stageElapsed / 4), 0, 1) : 1;
          // Walk around the table before climbing the actual stair geometry outside the door.
          const approach = Math.min(1, progress / .36), climb = Math.max(0, (progress - .36) / .64);
          camera.position.set(2.7 * Math.min(1, approach * 2.2), 1.85 + climb * 2.8,
            approach < 1 ? THREE.MathUtils.lerp(1.05, -4.8, approach) : THREE.MathUtils.lerp(-4.8, -10.0, climb));
          if (!motionPreference.matches && stage === 'stairs') camera.position.y += Math.sin(stageElapsed * 10) * .016;
          camera.lookAt(2.7, THREE.MathUtils.lerp(1.65, 4.35, climb), -10.6);
          if (stage === 'viewers') camera.lookAt(3.18, 3.35, -8.45);
        }
        finalCameraPosition.copy(camera.position); finalCameraQuaternion.copy(camera.quaternion); winPose = true;
      } else if (state.phase === 'GAME_OVER' && winPose) {
        camera.position.copy(finalCameraPosition); camera.quaternion.copy(finalCameraQuaternion);
      }
      if (state.phase === 'PLAYER_PEEKING') {
        const age = state.peekStartedAt == null ? 0 : Math.max(0,(epoch-state.peekStartedAt)/CONFIG.PEEK_DURATION_MS);
        const leanPeek = Math.sin(Math.min(1,age)*Math.PI);
        camera.position.x -= leanPeek * .16;
        camera.position.z -= leanPeek * .14;
        const deckLook = new THREE.Vector3(...playerPeekDeck(age).position);
        const facing = camera.quaternion.clone(); camera.lookAt(deckLook);
        camera.quaternion.slerpQuaternions(facing, camera.quaternion.clone(), Math.min(1,leanPeek*2));
      }
      const contact=state.phase==='HOST_FORCE_SHOT'&&state.forceShotAt!=null?THREE.MathUtils.smoothstep((epoch-state.forceShotAt)/1000,1.1,1.35):0;
      camera.rotation.y-=contact*.055;
      camera.updateMatrixWorld(true);
      room.update(time, dt, state.danger, state.suspense, impulse, event, epoch, {
        roomNumber: state.roomNumber, phase: state.phase === 'GAME_OVER' && winPose ? 'ENDING_WIN' : state.phase,
        storyStage: state.storyStage, stageElapsed, cinematic: state.cinematic, distantShot: state.distantShot, ambientEvent: state.ambientEvent,
      });
      const hostVoiceLevel = tableAudio.getVoiceLevel('host'), captiveVoiceLevel = tableAudio.getVoiceLevel('captive');
      const voiceLevel = captiveVoiceLevel;
      const heartbeat = tableAudio.getHeartbeatLevel();camera.rotation.z+=heartbeat*.0015*(motionPreference.matches?.2:1);
      const shotProgress=state.phase==='PLAYER_SHOOTING'?state.triggerProgress??0:state.phase==='HOST_FORCE_SHOT'?Math.min(1,(epoch-(state.forceShotAt??epoch))/2500*.85):state.phase==='AI_SHOOTING'&&state.aiShotStartedAt?Math.min(1,(epoch-state.aiShotStartedAt)/Math.max(1,(state.aiShotDurationMs??2000)-1000)*.85):0;
      tableAudio.setSoundState({active:state.phase!=='START'&&!state.dead,fired:state.chambersFired??0,room:roomNumber,progress:shotProgress,holding:!!state.triggerHeld,hesitating:state.phase==='AI_SHOOTING',stress:state.stress??.2,nervous:roomNumber===1,speaking:!!state.speaker});
      actors.update(time, dt, { ...state, roomNumber, event, voiceLevel, hostVoiceLevel, captiveVoiceLevel, reducedMotion: motionPreference.matches });
      tableAudio.setListener([camera.position.x,camera.position.y-1.2,camera.position.z-1.05],camera.getWorldDirection(new THREE.Vector3()).toArray(),new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion).toArray());
      for(const [speaker,head]of [['host',actors.hostHead],['captive',actors.captiveHead]] as const)tableAudio.setVoicePosition(speaker,head.getWorldPosition(new THREE.Vector3()).sub(new THREE.Vector3(0,1.2,1.05)).toArray());
      const seen = actors.captiveHead.getWorldPosition(captiveScreen).project(camera);
      const inView = seen.z > -1 && seen.z < 1 && Math.abs(seen.x) <= .4 && Math.abs(seen.y) <= 1;
      if (inView !== opponentVisible) { opponentVisible = inView; state.onOpponentInView?.(inView); }
      const body = bodyLanguage(roomNumber, state.stress ?? .2, time, (state.chambersFired ?? 0) + 1, state.phase, state.tell?.disposition === 'calm');
      if (!shotBodyOnly(state.phase) && state.phase === 'PLAYER_DECISION' && !state.dead) {
        if (body.fidget && body.fidgetAmount > .25 && contactSerial !== body.serial) {
          contactSerial = body.serial; tableAudio.playContact(body.fidget, state.stress ?? .2);
        }
        const heel = Math.floor(time * (4 + (state.stress ?? 0) * 2));
        if (body.bounce > .008 && lastHeel !== heel) { lastHeel = heel; tableAudio.playContact('heel', state.stress ?? .2); }
      }
      monitors.update(state, time, epoch);
      const signalLost = (state.phase === 'ENDING_DEATH' && state.storyStage === 'no-signal') || (state.phase === 'GAME_OVER' && state.dead === 'player');
      monitors.setSignalLost(signalLost);
      postMaterial.uniforms.forcedContact.value=contact;
      postMaterial.uniforms.triggerDarkening.value = contact>0 ? .7*contact : state.phase === 'PLAYER_SHOOTING' ? Math.max(0, Math.min(1, state.triggerProgress ?? 0)) : 0;
      postMaterial.uniforms.heartbeatPulse.value = heartbeat * (motionPreference.matches ? .2 : 1);
      postMaterial.uniforms.hoodCovered.value = hood.covered;
      postMaterial.uniforms.hoodLift.value = hood.lift;
      postMaterial.uniforms.hoodDrop.value = hood.drop;
      postMaterial.uniforms.focusBlur.value = hood.blur;
      postMaterial.uniforms.glare.value = hood.glare+flash*.9;
      postMaterial.uniforms.squint.value = hood.squint;
      canvas.dataset.hoodCoverage = hood.covered.toFixed(3); canvas.dataset.hoodLift = hood.lift.toFixed(3);
      canvas.dataset.focusBlur = hood.blur.toFixed(3); canvas.dataset.glare = hood.glare.toFixed(3);
      canvas.dataset.lean = lean.amount.toFixed(4); canvas.dataset.targetLean = lean.target.toFixed(4);
      canvas.dataset.distantShot = state.distantShot?.id ?? ''; canvas.dataset.ambientEvent = state.ambientEvent?.kind ?? '';
      canvas.dataset.tiesCut = String(!!state.tiesCut?.player);
      canvas.dataset.voiceLevel = voiceLevel.toFixed(4);
      canvas.dataset.heartbeatLevel = heartbeat.toFixed(4);
      canvas.dataset.triggerProgress = (state.triggerProgress ?? 0).toFixed(4);
      canvas.dataset.triggerHeld = String(!!state.triggerHeld);
      canvas.dataset.event = event?.kind ?? '';
      canvas.dataset.roomNumber = String(roomNumber); canvas.dataset.storyStage = state.storyStage ?? '';
      canvas.dataset.speaker = tableAudio.getVoiceSpeaker() ?? '';
      canvas.dataset.hostVoiceLevel = hostVoiceLevel.toFixed(4); canvas.dataset.captiveVoiceLevel = captiveVoiceLevel.toFixed(4);
      canvas.dataset.animatedSpeaker = hostVoiceLevel > 0 ? 'host' : captiveVoiceLevel > 0 ? 'captive' : '';
      canvas.dataset.shotTarget = state.phase === 'AI_SHOOTING' ? 'captive' : state.phase === 'PLAYER_SHOOTING' ? 'player' : '';
      const castRoles = new Set<string>(); let visibleGuards = 0;
      world.traverse(object => {
        const role = object.userData.actorRole;
        if (role === 'guard') { if (object.visible) visibleGuards++; }
        else if (role) castRoles.add(role);
      });
      canvas.dataset.tablePeople = String(castRoles.size); canvas.dataset.guards = String(visibleGuards);
      canvas.dataset.monitorMode = monitors.group.userData.mode;
      canvas.dataset.monitorFeeds = String(monitors.group.userData.feedCount);
      canvas.dataset.doorPulse = doorShake.toFixed(4);
      canvas.dataset.peekVisible = String(actors.peekCard.visible && actors.peekCard.parent === actors.heldRig);
      canvas.dataset.deckCorner = String(actors.deckCorner.visible);
      canvas.dataset.peekWindow = String(!!state.attention?.window);
      canvas.dataset.hostAway = String(!!state.attention?.host.away);
      canvas.dataset.captiveAway = String(!!state.attention?.captive.away);
      canvas.dataset.opponentInView = String(opponentVisible);
      canvas.dataset.stress = (state.stress ?? 0).toFixed(3);
      canvas.dataset.gunHolder = String(actors.gun.userData.holder);
      canvas.dataset.peekActor = state.peekActor ?? '';
      canvas.dataset.spinning = state.spinning ?? '';
      canvas.dataset.cylinderAngle = actors.cylinder.rotation.x.toFixed(4);
      canvas.dataset.hammerAngle = actors.hammer.rotation.z.toFixed(4);
      canvas.dataset.tell = state.phase === 'PLAYER_DECISION' ? state.tell?.kind ?? '' : '';
      actors.gun.getWorldPosition(gunPosition);
      muzzle.position.copy(gunPosition); muzzle.intensity = flash * 22;
      canvas.dataset.yaw = look.yaw.toFixed(5); canvas.dataset.pitch = look.pitch.toFixed(5);
      canvas.dataset.targetYaw = look.targetYaw.toFixed(5); canvas.dataset.targetPitch = look.targetPitch.toFixed(5);
      canvas.dataset.cameraLocked = String(locked); canvas.dataset.phase = state.phase;
      canvas.dataset.blood = String(blood.visible); canvas.dataset.strangerSlumped = String(state.dead === 'ai');
      canvas.dataset.round = String(state.roundNumber);
      canvas.dataset.playerCards = String(state.round?.player.length ?? 0);
      canvas.dataset.dealerCards = String(state.round?.ai.length ?? 0);
      canvas.dataset.playerTableFaces = String(actors.cardSlots.filter(slot => slot.group.visible && slot.group.userData.owner === 'player' && slot.group.userData.tableFaceUp).length);
      canvas.dataset.heldCards = String(actors.cardSlots.filter(slot => slot.group.visible && slot.group.userData.owner === 'player' && slot.group.userData.held).length);
      postMaterial.uniforms.time.value = time;
      // A lower shadow refresh rate suits the period look and leaves the GPU headroom.
      renderer.shadowMap.needsUpdate = renderedFrames++ % 4 === 0;
      const ceilingActive = !signalLost && state.phase !== 'GAME_OVER' && (roomNumber === 3 || state.phase === 'ENDING_DEATH');
      ceilingFeed.render(renderer, time, ceilingActive);
      canvas.dataset.ceilingFeed = String(ceilingActive); canvas.dataset.ceilingFrames = String(ceilingFeed.frames);
      renderer.setRenderTarget(target); renderer.render(world, camera);
      const deathMonitor = state.phase === 'ENDING_DEATH' && state.storyStage !== 'fall';
      postMaterial.uniforms.sceneTexture.value = signalLost ? monitors.signalTexture : deathMonitor ? ceilingFeed.target.texture : target.texture;
      if (++fpsFrames > 0 && now - fpsStart > 1000) {
        canvas.dataset.fps = (fpsFrames * 1000 / (now - fpsStart)).toFixed(1);
        canvas.dataset.drawCalls = String(renderer.info.render.calls);
        canvas.dataset.triangles = String(renderer.info.render.triangles);
        fpsStart = now; fpsFrames = 0;
      }
      renderer.setRenderTarget(null); renderer.render(postScene, postCamera);
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      tableAudio.setSoundState({active:false,fired:0,room:1,progress:0,holding:false,hesitating:false,stress:0,nervous:false,speaking:false});dustGeometry.dispose();(dust.material as THREE.PointsMaterial).dispose();
      room.reset(); room.dispose();
      monitors.dispose(); ceilingFeed.dispose();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clearKeys);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('lostpointercapture', pointerUp);
      const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
      world.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material);
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
          }
        }
      });
      textures.forEach(texture => texture.dispose()); materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
      quad.geometry.dispose(); postMaterial.dispose(); target.dispose(); renderer.dispose(); canvas.remove();
    };
  }, []);

  return <div ref={host} className="room-art three-scene">{unavailable && <div className="renderer-warning" role="alert">This room needs WebGL.<br/>Enable hardware acceleration in Chrome, then reload.</div>}</div>;
}
