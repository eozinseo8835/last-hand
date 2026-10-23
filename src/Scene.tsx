import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CONFIG, type Card, type GamePhase, type Round } from './game';
import { createRoom, decisionEvent } from './scene/room';
import { tableAudio } from './audio';
import { eventDoorPulse, type OpponentTell, type RoundEvent, type Side } from './tension';
import { createActors } from './scene/actors';
import { createLookKeys, createLookState, dragLook, shouldRecenter, updateKeyboardLook, updateLook } from './scene/camera';

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

const retroFragment = `
  uniform sampler2D sceneTexture;
  uniform float time;
  uniform float triggerDarkening;
  uniform float heartbeatPulse;
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
    vec3 color = texture2D(sceneTexture, vUv).rgb;
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
    color *= mix(vignette, 1., highlight * .85);
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
    const camera = new THREE.PerspectiveCamera(58, 16 / 9, .055, 28);
    camera.rotation.order = 'YXZ';
    const room = createRoom(world);
    world.add(camera);
    const actors = createActors(world, camera);
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const blood = new THREE.Group();
    const bloodMap = splatterTexture();
    const bloodMaterial = new THREE.MeshBasicMaterial({ map: bloodMap, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const wallStain = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.25), bloodMaterial);
    wallStain.position.set(0, 1.7, -4.075);
    const tableStain = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .9), bloodMaterial);
    tableStain.rotation.x = -Math.PI / 2;
    tableStain.position.set(0, .889, -.62);
    blood.add(wallStain, tableStain); blood.visible = false; world.add(blood);
    const muzzle = new THREE.PointLight('#fff1bd', 0, 4, 2); world.add(muzzle);

    const target = new THREE.WebGLRenderTarget(640, CONFIG.PIXEL_HEIGHT, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
    });
    const postScene = new THREE.Scene();
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const postMaterial = new THREE.ShaderMaterial({
      uniforms: { sceneTexture: { value: target.texture }, time: { value: 0 }, triggerDarkening: { value: 0 }, heartbeatPulse: { value: 0 } },
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
      if (event.button !== 0 || latest.current.lookDisabled || shouldRecenter(latest.current.phase, latest.current.suspense)) return;
      dragging = true; lastX = event.clientX; lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-dragging');
      event.preventDefault();
    }
    function pointerMove(event: PointerEvent) {
      if (!dragging) return;
      if (!latest.current.lookDisabled && !shouldRecenter(latest.current.phase, latest.current.suspense)) {
        dragLook(look, event.clientX - lastX, event.clientY - lastY, CONFIG.LOOK_SENSITIVITY);
      }
      lastX = event.clientX; lastY = event.clientY;
    }
    function pointerUp(event: PointerEvent) {
      dragging = false; canvas.classList.remove('is-dragging');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('lostpointercapture', pointerUp);

    let frame = 0, lastTime = performance.now(), startTime = lastTime;
    let previousCards: Round | null | undefined;
    let previousRound = -1, previousRevealed = false, previousEffect: SceneProps['shotEffect'] = null;
    let previousRecenter = latest.current.recenterToken, previousPhase = latest.current.phase;
    let impulse = 0, flash = 0, deathProgress = 0, renderedFrames = 0;
    let fpsStart = performance.now(), fpsFrames = 0;
    const gunPosition = new THREE.Vector3();
    function animate(now: number) {
      const cameraDelta = Math.max(0, (now - lastTime) / 1000);
      const dt = Math.min(cameraDelta, .05); lastTime = now;
      const time = (now - startTime) / 1000, state = latest.current;
      const epoch = Date.now(), event = decisionEvent(state.phase, state.event, epoch);
      const replay = state.phase === 'SHUFFLING' && state.roundNumber === 1 && previousPhase !== 'SHUFFLING';
      if (replay) {
        look = createLookState(); clearKeys(); impulse = flash = deathProgress = 0;
        blood.visible = false; previousEffect = null; room.reset();
      }
      if (state.round !== previousCards || state.roundNumber !== previousRound || state.revealed !== previousRevealed) {
        actors.setCards(state.round ? { player: state.round.player, ai: state.round.ai, deck: [] } : null, state.revealed);
        previousCards = state.round; previousRound = state.roundNumber; previousRevealed = state.revealed;
      }
      if (state.recenterToken !== previousRecenter) {
        clearKeys(); look.targetYaw = look.targetPitch = 0; previousRecenter = state.recenterToken;
      }
      const locked = shouldRecenter(state.phase, state.suspense);
      if (state.lookDisabled) clearKeys();
      updateKeyboardLook(look, keys, cameraDelta, CONFIG.LOOK_KEY_SPEED, locked || !!state.lookDisabled);
      updateLook(look, cameraDelta, locked);
      if (state.shotEffect && state.shotEffect !== previousEffect) {
        impulse = state.shotEffect === 'shot' ? 1 : .28;
        flash = state.shotEffect === 'shot' ? 1 : 0;
      }
      previousEffect = state.shotEffect;
      previousPhase = state.phase;
      impulse = Math.max(0, impulse - dt * 1.6);
      flash = Math.max(0, flash - dt * 10);
      if (state.dead === 'player') deathProgress = Math.min(1, deathProgress + dt / 1.8);
      else deathProgress = 0;
      blood.visible = state.dead === 'ai' && CONFIG.GORE_LEVEL !== 'low';
      const sway = Math.sin(time * 1.15) * .0025;
      const doorShake = eventDoorPulse(event, epoch) * (motionPreference.matches ? .2 : 1);
      camera.position.set(Math.sin(time * .7) * .005, 1.85 + Math.sin(time * 1.1) * .007 - deathProgress * .38, 2.65);
      camera.position.x += Math.sin(time * 79) * doorShake * .006;
      camera.rotation.set(-.173 + look.pitch + sway + Math.sin(time * 73) * impulse * .025, look.yaw + Math.sin(time * 61) * impulse * .018, -deathProgress * .62 + Math.cos(time * 82) * impulse * .012);
      camera.rotation.x += Math.sin(time * 87 + .7) * doorShake * .005;
      camera.rotation.z += Math.cos(time * 73) * doorShake * .003;
      camera.updateMatrixWorld(true);
      room.update(time, dt, state.danger, state.suspense, impulse, event, epoch);
      const voiceLevel = tableAudio.getVoiceLevel();
      const heartbeat = tableAudio.getHeartbeatLevel();
      actors.update(time, dt, { ...state, event, voiceLevel, reducedMotion: motionPreference.matches });
      postMaterial.uniforms.triggerDarkening.value = state.phase === 'PLAYER_SHOOTING' ? Math.max(0, Math.min(1, state.triggerProgress ?? 0)) : 0;
      postMaterial.uniforms.heartbeatPulse.value = heartbeat * (motionPreference.matches ? .2 : 1);
      canvas.dataset.voiceLevel = voiceLevel.toFixed(4);
      canvas.dataset.heartbeatLevel = heartbeat.toFixed(4);
      canvas.dataset.triggerProgress = (state.triggerProgress ?? 0).toFixed(4);
      canvas.dataset.triggerHeld = String(!!state.triggerHeld);
      canvas.dataset.event = event?.kind ?? '';
      canvas.dataset.doorPulse = doorShake.toFixed(4);
      canvas.dataset.peekVisible = String(actors.peekCard.visible);
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
      renderer.setRenderTarget(target); renderer.render(world, camera);
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
      room.reset(); room.dispose();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clearKeys);
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
