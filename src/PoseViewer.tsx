import {tableAudio} from './audio';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createActors, type ActorState } from './scene/actors';
import { retroFragment } from './Scene';
import { playerPeekDeck, HOST_HEAD } from './tableLayout';
import './poseViewer.css';

export const POSE_CASES = [
  ...([1, 2, 3] as const).flatMap(room => ['seated-resting', 'talking', 'reaching-cards', 'holding-revolver', 'self-shot'].map(pose => ({ pose, room, label: `${['Nervous Man', 'Gambler', 'Survivor'][room - 1]} · ${pose.replaceAll('-', ' ')}` }))),
  ...['host-idle', 'host-dealing', 'host-sliding'].map(pose => ({ pose, room: 1 as const, label: `Host · ${pose.replace('host-', '').replaceAll('-', ' ')}` })),
  { pose: 'guard-walking', room: 1 as const, label: 'Guard · walking' },
  { pose: 'player-card-hand', room: 1 as const, label: 'Player · card hand' },
  { pose: 'player-hold-to-pull', room: 1 as const, label: 'Player · hold to pull' },
  { pose: 'host-forced-shot', room: 1 as const, label: 'Host · forced shot (front = seated view)' },
  { pose: 'player-peek', room: 1 as const, label: 'Player · PEEK' },
 ...['host-seated','opponent-card-hand','pickup-player','pickup-ai','pickup-host','gaze-test','host-speaking','hood-on','hood-mid-removal','hood-off','player-empty-hand','host-open-hand'].map(pose=>({pose,room:1 as const,label:pose.replaceAll('-',' ')})),

];
export type PoseSelection = { pose: string; room: 1 | 2 | 3; view: 'front' | 'side'; pixel: boolean; animate: boolean; time: number };
export function poseSelection(search: string): PoseSelection {
  const params = new URLSearchParams(search);
  const pose = params.get('pose') ?? 'seated-resting';
  const room = Math.max(1, Math.min(3, Number(params.get('room')) || 1)) as 1 | 2 | 3;
  const known = POSE_CASES.find(item => item.pose === pose && item.room === room) ?? POSE_CASES[0];
  return { pose: known.pose, room: known.room, view: params.get('view') === 'side' ? 'side' : 'front',
    pixel: params.get('pixel') === '1', animate: params.get('animate') === '1', time: Math.max(0, Number(params.get('time')) || 1.35) };
}
type ArmLike = { shoulder: THREE.Object3D; forearm: THREE.Object3D; hand: THREE.Object3D; lengths: readonly number[];
  diagnostics?: { requestedDistance: number; targetDistance: number; reachLimit: number; relocateRequired: boolean } };
type RigLike = { group: THREE.Group; chest?: THREE.Object3D; dimensions?: { chestWidth?: number }; arms: { left: ArmLike; right: ArmLike } };
type DebugActors = ReturnType<typeof createActors> & {
  setDebugPose?: (pose: string, room?: 1 | 2 | 3) => void;
  debugTarget?: THREE.Group;
  skeletons?: { captive: RigLike; host: RigLike; guards: RigLike[]; player: RigLike };
};
export type PoseMetrics = {
  pose: string; room: number; fixedLengths: boolean; unitScales: boolean;
  measuredSegments: number; maxLengthError: number; arms: Array<{ side: string; upper: number; forearm: number; elbow: number; elbowBelowShoulder: boolean; lateral: number; targetRatio: number | null; requestedRatio: number | null; relocationRequired: boolean }>;
  restGeometry: boolean | null; reachable: boolean | null; gunScale: boolean; gunParent: string; skinLightness: number | null;
};
export function measurePose(rig: RigLike | undefined, target: THREE.Object3D, gun: THREE.Object3D, selection: PoseSelection): PoseMetrics {
  target.updateWorldMatrix(true, true);
  const metrics: PoseMetrics = { pose: selection.pose, room: selection.room, fixedLengths: true, unitScales: true, measuredSegments: 0,
    maxLengthError: 0, arms: [], restGeometry: null, reachable: null, gunScale: gun.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-7,
    gunParent: gun.parent?.name ?? '', skinLightness: null };
  target.traverse(object => {
    if (object.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-7) metrics.unitScales = false;
    if (!(object instanceof THREE.Mesh)) return;
    const length = object.userData.restLength;
    if (object.userData.skeletonSegment && typeof length === 'number') {
      const axis = object.userData.axis === 'z' ? new THREE.Vector3(0, 0, length / 2) : new THREE.Vector3(0, length / 2, 0);
      const measured = object.localToWorld(axis.clone()).distanceTo(object.localToWorld(axis.clone().negate()));
      metrics.maxLengthError = Math.max(metrics.maxLengthError, Math.abs(measured - length));
      metrics.measuredSegments++;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial && (object.name.toLowerCase().includes('palm') || object.name.toLowerCase().includes('finger'))) {
        const hsl = { h: 0, s: 0, l: 0 }; material.color.getHSL(hsl);
        metrics.skinLightness = Math.max(metrics.skinLightness ?? 0, hsl.l);
      }
    }
  });
  metrics.fixedLengths = metrics.measuredSegments > 0 && metrics.maxLengthError < 1e-6;
  if (rig) {
    for (const [side, arm] of Object.entries(rig.arms)) {
      if (selection.pose === 'player-card-hand' && side === 'right' || selection.pose === 'player-hold-to-pull' && side === 'left') continue;
      if(selection.pose==='host-forced-shot'&&side==='left')continue;
      const shoulder = arm.shoulder.getWorldPosition(new THREE.Vector3());
      const elbow = arm.forearm.getWorldPosition(new THREE.Vector3());
      const wrist = arm.hand.getWorldPosition(new THREE.Vector3());
      const a = shoulder.clone().sub(elbow), b = wrist.clone().sub(elbow);
      const angle = THREE.MathUtils.radToDeg(a.angleTo(b));
      const local = rig.group.worldToLocal(elbow.clone());
      const diagnostics = arm.diagnostics;
      const torsoWidth = rig.dimensions?.chestWidth ?? Number(rig.chest?.userData.width ?? .32);
      metrics.arms.push({ side, upper: shoulder.distanceTo(elbow), forearm: elbow.distanceTo(wrist), elbow: angle,
        elbowBelowShoulder: elbow.y < shoulder.y, lateral: Math.abs(local.x) - torsoWidth / 2,
        targetRatio: diagnostics ? diagnostics.targetDistance / (arm.lengths[0] + arm.lengths[1]) : null,
        requestedRatio: diagnostics ? diagnostics.requestedDistance / (arm.lengths[0] + arm.lengths[1]) : null,
        relocationRequired: diagnostics?.relocateRequired ?? false });
    }
    metrics.fixedLengths &&= metrics.arms.every(arm => { const expected = rig.arms[arm.side as 'left'|'right'].lengths; return Math.abs(arm.upper - expected[0]) < 1e-6 && Math.abs(arm.forearm - expected[1]) < 1e-6; });
    metrics.reachable = metrics.arms.every(arm => arm.targetRatio !== null && arm.targetRatio <= .900001 && !arm.relocationRequired);
    if (selection.pose === 'seated-resting') metrics.restGeometry = metrics.arms.every(arm => arm.elbowBelowShoulder && arm.lateral >= .049999 && arm.lateral <= .120001 && arm.elbow >= 80 && arm.elbow <= 110);
  }
  return metrics;
}

declare global {
  interface Window {
    __playPoseSound?:(side:number)=>void;
    __poseViewer?: { ready: boolean; selection: PoseSelection; metrics: PoseMetrics | null; cases: typeof POSE_CASES };
    __poseCaptureReady?: boolean;
    __setPoseView?: (selection: Partial<PoseSelection>) => void;
    __setPoseSelection?: (selection: Partial<PoseSelection>) => void;
  }
}
function visibleBounds(target: THREE.Object3D) {
  target.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  target.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    let visible = true;
    for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) visible = false;
    if (!visible) return;
    object.geometry.computeBoundingBox();
    if (object.geometry.boundingBox) bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return bounds;
}
const baseState: ActorState = { phase: 'PLAYER_DECISION', suspense: false, dead: null, shotEffect: null, roundNumber: 1, revealed: false, tiesCut: { player: true, ai: true } };

export default function PoseViewer() {
  const mount = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState(() => poseSelection(location.search));
  const latest = useRef(selection); latest.current = selection;
  const [metrics, setMetrics] = useState<PoseMetrics | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const select = (patch: Partial<PoseSelection>) => { setSelection(previous => { const next={...previous,...patch}; return JSON.stringify(next)===JSON.stringify(previous)?previous:next; }); };
    window.__setPoseSelection = window.__setPoseView = select;
    return () => { delete window.__setPoseSelection; delete window.__setPoseView; };
  }, []);
  useEffect(() => {
    const params = new URLSearchParams({ debug: 'poses', pose: selection.pose, room: String(selection.room), view: selection.view, pixel: String(Number(selection.pixel)), time: String(selection.time) });
    if (selection.animate) params.set('animate', '1');
    history.replaceState(null, '', `?${params}`);
  }, [selection]);
  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false }); }
    catch { setError('WebGL is unavailable. Enable hardware acceleration to inspect the production poses.'); return; }
    renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18;
    const canvas = renderer.domElement; canvas.dataset.testid = 'pose-canvas'; host.appendChild(canvas);
    const world = new THREE.Scene(); world.background = new THREE.Color('#18201e');
    const productionCamera = new THREE.PerspectiveCamera(68, 16 / 9, .055, 30); productionCamera.position.set(0, 1.2, 1.05); productionCamera.rotation.x = -.12; world.add(productionCamera);
    const camera = new THREE.PerspectiveCamera(39, 1, .02, 30);
    const actors = createActors(world, productionCamera) as DebugActors;
    window.__playPoseSound=(side:number)=>{tableAudio.init();const sound={id:`debug:${Date.now()}`,at:Date.now(),source:'positioned-test',position:[side*2,1.2,-.2] as const,loudness:1};actors.setDebugSound(sound);tableAudio.playAmbient({id:sound.id,kind:'pipe',startedAt:sound.at,duration:1400,loud:true,direction:side,seed:31,position:sound.position});setSelection(s=>({...s,pose:'gaze-test',animate:true}));};
    const hemisphere = new THREE.HemisphereLight(0xe0e6d4, 0x343c35, 1.3); world.add(hemisphere);
    const key = new THREE.DirectionalLight(0xffe9ca, 3.0); key.position.set(1, 4, 4); world.add(key);
    const fill = new THREE.DirectionalLight(0xb9d4d0, 1.5); fill.position.set(-3, 2, -1); world.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0x202a25, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -.005; world.add(floor);
    const grid = new THREE.GridHelper(8, 32, 0x3b5047, 0x293a32); grid.position.y = .001; world.add(grid);
    const table = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.56, .025, 1.20)), new THREE.LineBasicMaterial({ color: 0x72857b, transparent: true, opacity: .38 })); table.position.y = .75; world.add(table);
    const target = new THREE.WebGLRenderTarget(640, 360, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const material = new THREE.ShaderMaterial({ uniforms: { sceneTexture: { value: target.texture }, time: { value: 0 }, triggerDarkening: { value: 0 }, heartbeatPulse: { value: 0 }, forcedContact: {value:0}, hoodCovered: { value: 0 }, hoodLift: { value: 0 }, hoodDrop: { value: 1 }, focusBlur: { value: 0 }, glare: { value: 0 }, squint: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: retroFragment, depthTest: false, depthWrite: false, toneMapped: false });
    const post = new THREE.Scene(), postCamera = new THREE.Camera();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material); post.add(quad);
    let frame = 0, previousKey = '', dirty = true, width = 1, height = 1;
    const resize = new ResizeObserver(entries => { const bounds = entries[0].contentRect; width = Math.max(1, bounds.width); height = Math.max(1, bounds.height); dirty = true; }); resize.observe(host);
    function animate(now: number) {
      const state = latest.current, identity = JSON.stringify(state), changed = identity !== previousKey;
      if (changed || dirty || state.animate) {
        if (!actors.setDebugPose) { setError('The production pose rebuild is not available in this checkout.'); frame = requestAnimationFrame(animate); return; }
        if (changed) actors.setDebugPose(state.pose, state.room);
        const time = state.animate ? now / 1000 : state.time;
        productionCamera.aspect=width/height;productionCamera.updateProjectionMatrix();
        productionCamera.position.set(0,1.2,1.05);productionCamera.rotation.set(-.12,0,0);if(state.pose==='host-forced-shot')productionCamera.lookAt(HOST_HEAD[0],HOST_HEAD[1]-.02,HOST_HEAD[2]);
        if(state.pose==='player-peek'){
          productionCamera.position.x-=.16;productionCamera.position.z-=.14;
          productionCamera.lookAt(new THREE.Vector3(...playerPeekDeck(.5).position));
        }
        actors.update(time, state.animate ? 1 / 60 : 0, { ...baseState, roomNumber: state.room });
        world.updateMatrixWorld(true);
        const inspected = actors.debugTarget ?? actors.captive;
        const bounds = visibleBounds(inspected);
        if (['host-sliding', 'host-dealing'].includes(state.pose) && actors.gun.visible) bounds.union(visibleBounds(actors.gun));
        if(state.pose.startsWith('pickup-'))bounds.union(visibleBounds(actors.gun));
        if(state.pose==='player-card-hand')bounds.union(visibleBounds(actors.heldRig));
        if (bounds.isEmpty()) bounds.setFromCenterAndSize(new THREE.Vector3(0, .9, 0), new THREE.Vector3(.8, 1.8, .8));
        const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
        const distance = Math.max(.8, size.y / 2 / Math.tan(THREE.MathUtils.degToRad(39 / 2)), Math.max(size.x, size.z) * 1.1) * 1.35;
        const facing = inspected.getWorldQuaternion(new THREE.Quaternion());
        const direction = new THREE.Vector3(state.view === 'side' ? 1 : 0, .035, state.view === 'side' ? 0 : 1).applyQuaternion(facing).normalize();
        camera.aspect = width / height; camera.position.copy(center).addScaledVector(direction, distance); camera.lookAt(center); camera.updateProjectionMatrix();
        camera.layers.set(0);
        if(state.pose==='host-forced-shot'){
          if(state.view==='front'){camera.fov=68;camera.position.copy(productionCamera.position);camera.quaternion.copy(productionCamera.quaternion);}
          else {camera.fov=39;camera.layers.enable(1);}
          camera.updateProjectionMatrix();
        } else if(camera.fov!==39){camera.fov=39;camera.updateProjectionMatrix();}
        const h = state.pixel ? 360 : Math.round(height), w = Math.round(h * width / height);
        renderer.setSize(w, h, false); target.setSize(w, h); canvas.style.imageRendering = state.pixel ? 'pixelated' : 'auto';
        canvas.dataset.pose = state.pose; canvas.dataset.room = String(state.room); canvas.dataset.view = state.view; canvas.dataset.pixel = String(state.pixel);
        material.uniforms.forcedContact.value=0;
        if (state.pixel) { renderer.setRenderTarget(target); renderer.render(world, camera); renderer.setRenderTarget(null); material.uniforms.time.value = time; renderer.render(post, postCamera); }
        else { renderer.setRenderTarget(null); renderer.render(world, camera); }
        const rigs = actors.skeletons;
        const rig = state.pose==='pickup-player'?rigs?.player:state.pose==='pickup-ai'?rigs?.captive:state.pose==='pickup-host'?rigs?.host:state.pose.startsWith('host-') ? rigs?.host : state.pose.startsWith('guard-') ? rigs?.guards[0] : state.pose.startsWith('player-') ? rigs?.player : rigs?.captive;
        const currentMetrics = measurePose(rig, inspected, actors.gun, state);
        window.__poseViewer = { ready: true, selection: state, metrics: currentMetrics, cases: POSE_CASES }; window.__poseCaptureReady = true;
        if (changed || dirty) setMetrics(currentMetrics);
        previousKey = identity; dirty = false;
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect();delete window.__playPoseSound;tableAudio.playAmbient(null);
      const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
      world.traverse(object => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
        geometries.add(object.geometry);
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(mat); for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
        }
      });
      textures.forEach(texture => texture.dispose()); materials.forEach(mat => mat.dispose()); geometries.forEach(geometry => geometry.dispose());
      material.dispose(); quad.geometry.dispose(); target.dispose(); renderer.dispose(); canvas.remove(); window.__poseCaptureReady = false;
    };
  }, []);
  const index = Math.max(0, POSE_CASES.findIndex(item => item.pose === selection.pose && item.room === selection.room));
  function chooseCase(next: number) { const item = POSE_CASES[(next + POSE_CASES.length) % POSE_CASES.length]; setSelection(previous => ({ ...previous, pose: item.pose, room: item.room })); }
  const checks = metrics ? [['Fixed bone lengths', metrics.fixedLengths], ['Joint unit scale', metrics.unitScales], ['Reach ≤90%', metrics.reachable], ['Resting elbows', metrics.restGeometry], ['One revolver scale', metrics.gunScale]] as const : [];
  return <main className="pose-viewer">
    <header><div><span className="pose-eyebrow">LAST HAND · DEVELOPMENT ONLY</span><h1>Production pose inspection</h1><p>Actual game skeletons, authored poses and shared revolver. Front/side × clear/pixel; forced-shot front uses the seated camera.</p></div><a href="/">Return to game</a></header>
    <nav aria-label="Pose viewer controls"><button onClick={() => chooseCase(index - 1)}>Previous</button><label>Pose<select value={index} onChange={event => chooseCase(Number(event.target.value))}>{POSE_CASES.map((item, i) => <option key={`${item.room}-${item.pose}`} value={i}>{String(i + 1).padStart(2, '0')} · {item.label}</option>)}</select></label><button onClick={() => chooseCase(index + 1)}>Next</button><label>View<select value={selection.view} onChange={event => setSelection(previous => ({ ...previous, view: event.target.value as PoseSelection['view'] }))}><option value="front">Front</option><option value="side">Side</option></select></label><label className="pose-check"><input type="checkbox" checked={selection.pixel} onChange={event => setSelection(previous => ({ ...previous, pixel: event.target.checked }))}/>Pixel effect</label><label className="pose-check"><input type="checkbox" checked={selection.animate} onChange={event => setSelection(previous => ({ ...previous, animate: event.target.checked }))}/>Animate</label></nav>
    <section className="pose-inspection"><div className="pose-stage" ref={mount} aria-label="Production pose inspection render"/>{error && <p role="alert">{error}</p>}<aside><h2>{POSE_CASES[index].label}</h2><p className="pose-view-label">{selection.view.toUpperCase()} · PIXEL {selection.pixel ? 'ON' : 'OFF'}</p><ul>{checks.map(([label, pass]) => <li key={label}><span>{label}</span><b className={pass === null ? '' : pass ? 'check-pass' : 'check-fail'}>{pass === null ? 'N/A' : pass ? 'PASS' : 'FAIL'}</b></li>)}</ul>{metrics && <><p>{metrics.measuredSegments} measured segments · max length error {metrics.maxLengthError.toExponential(1)} m</p>{metrics.arms.map(arm => <div className="pose-arm" key={arm.side}><h3>{arm.side} arm</h3><p>Upper {arm.upper.toFixed(3)} m · forearm {arm.forearm.toFixed(3)} m<br/>Elbow {arm.elbow.toFixed(1)}° · outside torso {(arm.lateral * 100).toFixed(1)} cm<br/>Reach {arm.targetRatio === null ? 'unknown' : `${(arm.targetRatio * 100).toFixed(1)}%`} · requested {arm.requestedRatio === null ? 'unknown' : `${(arm.requestedRatio * 100).toFixed(1)}%`}</p></div>)}<p>Gun parent: {metrics.gunParent || 'scene'}<br/>Skin material lightness: {metrics.skinLightness === null ? 'unknown' : metrics.skinLightness.toFixed(2)}</p></>}<p className="pose-note">Wire outline marks the 0.75 m table. Geometry checks accompany visual review; material lightness alone does not establish correct lighting or grip.</p></aside></section>
    <div className="pose-sound-controls"><button onClick={()=>window.__playPoseSound?.(-1)}>Play sound on left</button><button onClick={()=>window.__playPoseSound?.(1)}>Play sound on right</button><label>Pose time <input aria-label="Pose time" type="range" min="0" max="1.5" step=".025" value={selection.time} onChange={e=>setSelection(s=>({...s,time:Number(e.target.value),animate:false}))}/></label></div><footer>{index + 1} / {POSE_CASES.length} cases · query controls: pose, room, view, pixel, time</footer>
  </main>;
}
