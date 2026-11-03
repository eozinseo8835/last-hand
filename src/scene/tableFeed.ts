import * as THREE from 'three';
import { createCharacter, type HumanRig } from './skeleton';
import { createRevolverModel, GRIP_SOCKET } from './revolver';
import { createBurlapHood } from './hood';

/** What one other table is doing at this moment (worked out by the monitor wall, drawn here in 3D). */
export type TablePose = {
  table: number;
  time: number;
  action: 'deal' | 'flinch' | 'beg' | 'slam' | 'hide' | 'glitch' | 'waiting';
  progress: number;
  actionSeat: number;
  hoods: [number, number];
  tied: [boolean, boolean];
  hostCuts: 'player' | 'opponent' | null;
  dealing: boolean;
  dealProgress: number;
  /** Which seat holds the revolver to their own temple, or -1. Same ritual as at the player's table. */
  trigger: number;
};

/** Each other table seats two different captives; colours make every person distinct from the player's opponents. */
const SEATS: Record<number, [1 | 2 | 3, 1 | 2 | 3]> = { 2: [3, 1], 3: [2, 1], 4: [1, 3] };
const CLOTH: Record<number, [number | null, number | null]> = { 2: [null, 0x2f3a4a], 3: [null, 0x6b5a3a], 4: [0x3d2f45, null] };
/** A ceiling camera in a different corner of every room. */
const CAMERAS: Record<number, [number, number, number]> = { 2: [1.05, 1.95, 1.15], 3: [-.55, 2.0, 1.35], 4: [1.2, 1.95, -.95] };
const REST: [number, number, number] = [.10, .315, .35];

/**
 * A small real 3D room, rendered from a security-camera angle for every other table.
 * One set of actors is re-posed per table, so three feeds cost one scene.
 */
export function createTableStudio() {
  const scene = new THREE.Scene(); scene.name = 'other-table-studio'; scene.background = new THREE.Color(0x07090a);
  const camera = new THREE.PerspectiveCamera(58, 4 / 3, .05, 12); camera.name = 'other-table-cctv'; scene.add(camera);
  const surface = (color: number, roughness = .9) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); scene.add(mesh); return mesh;
  };
  // Concrete room, felt table, one hanging bulb: the same room the player is in.
  add(new THREE.PlaneGeometry(6, 6), surface(0x2a2c28), 0, 0, 0).rotation.x = -Math.PI / 2;
  for (const [x, z, ry] of [[0, -2.2, 0], [0, 2.2, Math.PI], [-2.2, 0, Math.PI / 2], [2.2, 0, -Math.PI / 2]] as const) add(new THREE.PlaneGeometry(4.4, 3), surface(0x353a33), x, 1.5, z).rotation.y = ry;
  add(new THREE.BoxGeometry(1.32, .05, 1.06), surface(0x1f2a22), 0, .70, 0);
  add(new THREE.BoxGeometry(1.2, .012, .94), surface(0x2b5a37, 1), 0, .73, 0);
  for (const x of [-.55, .55]) for (const z of [-.42, .42]) add(new THREE.BoxGeometry(.05, .7, .05), surface(0x1d2320), x, .35, z);
  add(new THREE.ConeGeometry(.16, .12, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x29302b, side: THREE.DoubleSide }), 0, 1.86, 0);
  add(new THREE.SphereGeometry(.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c8 }), 0, 1.80, 0);
  const bulb = new THREE.PointLight(0xffd9a0, 5.5, 5, 1.6); bulb.position.set(0, 1.78, 0); scene.add(bulb);
  scene.add(new THREE.HemisphereLight(0x9fb0a0, 0x161814, .55));
  for (const [x, z] of [[-.85, 0], [0, -.80], [0, .80]] as const) { add(new THREE.BoxGeometry(.43, .045, .38), surface(0x252e26), x, .43, z); }

  const captives = [createCharacter('captive', 1), createCharacter('captive', 1)];
  const seats: [number, number][] = [[-.80, 0], [.80, Math.PI]];
  captives.forEach((rig, index) => { rig.group.position.set(0, .45, seats[index][0]); rig.group.rotation.y = seats[index][1]; scene.add(rig.group); });
  const host = createCharacter('host', 1); host.group.position.set(-.85, .45, 0); host.group.rotation.y = Math.PI / 2; scene.add(host.group);
  const hoods = captives.map(rig => { const hood = createBurlapHood(); rig.head.add(hood.group); return hood; });
  const model = createRevolverModel(), gun = model.gun; scene.add(gun);
  const cardMaterial = surface(0xd8d0b0, .7), backMaterial = surface(0x6b1d1d, .7);
  const card = add(new THREE.BoxGeometry(.063, .003, .088), cardMaterial, 0, .74, 0);
  const deck = add(new THREE.BoxGeometry(.063, .02, .088), backMaterial, -.45, .745, 0);
  const handCards = captives.map((_, index) => [0, 1].map(k => add(new THREE.BoxGeometry(.063, .003, .088), k ? backMaterial : cardMaterial, (k - .5) * .08, .736, seats[index][0] * .55)));
  deck.rotation.y = .3;
  let currentTable = 0;

  function dress(table: number) {
    if (table === currentTable) return;
    currentTable = table;
    const looks = SEATS[table] ?? [1, 2], cloth = CLOTH[table] ?? [null, null];
    captives.forEach((rig, index) => { rig.setRoom(looks[index]); if (cloth[index] !== null) rig.clothingMaterial.color.setHex(cloth[index]!); });
  }
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const lerp = (a: readonly number[], b: readonly number[], t: number) => v(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);

  function poseCaptive(rig: HumanRig, seat: number, pose: TablePose) {
    rig.pose('seated-resting', pose.time);
    rig.chest.rotation.x += Math.sin(pose.time * 1.6 + seat * 2 + pose.table) * .025;
    rig.head.rotation.y += Math.sin(pose.time * .4 + seat * 3 + pose.table) * .18;
    if (pose.trigger === seat) {
      rig.pose('self-shot');
      rig.arms.right.hand.rotation.z += Math.sin(pose.time * 37 + seat) * .012;   // the hand shakes
      return;
    }
    if (pose.tied[seat]) { rig.solveHand('left', v(-.03, .30, .24)); rig.solveHand('right', v(.03, .30, .24)); return; }
    if (pose.actionSeat !== seat) return;
    const active = Math.sin(Math.min(1, Math.max(0, pose.progress)) * Math.PI);
    if (pose.action === 'flinch') { rig.head.rotation.x -= active * .4; rig.spine.rotation.x -= active * .18; }
    else if (pose.action === 'beg') { rig.solveHand('left', lerp([-.10, .315, .35], [-.16, .64, .33], active)); rig.solveHand('right', lerp(REST, [.16, .64, .33], active)); rig.head.rotation.x += active * .15; }
    else if (pose.action === 'hide') { rig.solveHand('left', lerp([-.10, .315, .35], [-.045, .74, .17], active)); rig.solveHand('right', lerp(REST, [.045, .74, .17], active)); rig.spine.rotation.x += active * .2; }
    else if (pose.action === 'slam') { const up = pose.progress < .4 ? Math.sin(pose.progress / .4 * Math.PI / 2) : Math.max(0, 1 - (pose.progress - .4) / .08); rig.solveHand('right', lerp(REST, [.12, .62, .40], up)); }
  }

  function render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, pose: TablePose) {
    dress(pose.table);
    captives.forEach((rig, seat) => {
      poseCaptive(rig, seat, pose);
      hoods[seat].update(1 - pose.hoods[seat]); hoods[seat].group.visible = pose.hoods[seat] < .995;
      handCards[seat].forEach(item => item.visible = !pose.tied[seat] && pose.hoods[seat] >= 1);
    });
    host.pose(pose.dealing ? (Math.sin(pose.dealProgress * Math.PI * 8) > 0 ? 'host-dealing' : 'host-sliding') : 'host-idle', pose.time);
    if (pose.hostCuts) host.solveHand('right', v(.55, .32, pose.hostCuts === 'player' ? .62 : -.62), undefined, { lean: true });
    host.updateCoat();
    // The revolver: in the shooter's hand at the temple, otherwise lying in the middle of the felt.
    if (pose.trigger >= 0) {
      captives[pose.trigger].arms.right.hand.add(gun);
      gun.position.set(...GRIP_SOCKET.position); gun.quaternion.set(...GRIP_SOCKET.quaternion);
    } else {
      scene.add(gun); gun.position.set(.08, .745, 0); gun.rotation.set(Math.PI / 2, 0, .4);
    }
    // A dealt card slides from the Host's deck to whichever seat is receiving.
    card.visible = pose.dealing;
    if (pose.dealing) {
      const step = (pose.dealProgress * 4) % 1, toward = Math.floor(pose.dealProgress * 4) % 2 ? -.48 : .48;
      card.position.set(-.42 + .42 * step, .74 + Math.sin(step * Math.PI) * .03, toward * step);
    }
    const eye = CAMERAS[pose.table] ?? CAMERAS[2];
    camera.position.set(...eye); camera.lookAt(-.12, .86, 0);
    scene.updateMatrixWorld(true);
    const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;   // the main room's shadow refresh belongs to the main room
    try { renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera); }
    finally { renderer.setRenderTarget(previous); renderer.shadowMap.needsUpdate = shadows; }
  }

  function dispose() {
    scene.traverse(object => {
      const mesh = object as THREE.Mesh; if (!mesh.isMesh) return;
      mesh.geometry.dispose(); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => m.dispose());
    });
  }
  return { scene, camera, captives, host, gun, render, dispose };
}
export type TableStudio = ReturnType<typeof createTableStudio>;
