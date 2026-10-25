import * as THREE from 'three';

/** All dimensions are authored in metres; the same unscaled model is used everywhere. */
export const REVOLVER_DIMENSIONS = {
  cylinderLength: .070,
  cylinderRadius: .028,
  barrelLength: .091,
  barrelRadius: .010,
  gripHeight: .103,
  gripThickness: .030,
  nominalLength: .270,
} as const;
export const MUZZLE_LOCAL = [.151, .042, 0] as const;
export const GRIP_LOCAL = [-.080, -.057, 0] as const;
/** The grip runs along the palm: gun +Y follows the fingers, while +X
 * points across the hand. Curling digits close around the wooden grip. */
export const GRIP_SOCKET = {
  position: [0, .09, .11] as const,
  quaternion: [.5, .5, .5, .5] as const,
};

function material(name: string, color: number, metalness: number, roughness: number, emissive: number, emissiveIntensity: number) {
  return new THREE.MeshStandardMaterial({ name, color, metalness, roughness, emissive, emissiveIntensity, flatShading: true });
}
function addMesh(parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry, surface: THREE.Material, position: readonly [number, number, number]) {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.name = name; mesh.position.set(...position); mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function axisCylinder(radius: number, length: number, sides = 12, open = false) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, sides, 1, open);
  geometry.rotateZ(-Math.PI / 2); return geometry;
}
function faceRing(inner: number, outer: number) {
  const geometry = new THREE.RingGeometry(inner, outer, 12);
  geometry.rotateY(Math.PI / 2); return geometry;
}

/** A readable snub-nosed .38 silhouette, not an opaque box around the cylinder.
 * Mechanical pivots are independent children so cocking/spinning use rotation only.
 */
export function createRevolverModel() {
  const gun = new THREE.Group(); gun.name = 'Shared six-chamber revolver';
  gun.userData = { modelId: 'procedural-38', realScale: true, nominalLength: REVOLVER_DIMENSIONS.nominalLength };
  const steel = material('Gunmetal', 0x798b83, .52, .30, 0x1a211e, .22);
  const cylinderSteel = material('Brushed cylinder steel', 0x88978e, .50, .34, 0x202822, .20);
  const edge = material('Subtle steel rim', 0xb1b9a9, .45, .24, 0x374336, .16);
  const dark = material('Recessed metal', 0x17201c, .30, .58, 0x08100b, .10);
  const wood = material('Curved walnut grip', 0x78482b, .03, .76, 0x2d170b, .20);
  const checkering = material('Walnut checkering', 0x462a1c, .02, .88, 0x130b06, .10);
  const box = (name: string, size: [number, number, number], position: [number, number, number], surface: THREE.Material = steel) =>
    addMesh(gun, name, new THREE.BoxGeometry(...size), surface, position);

  // An open frame leaves the round cylinder outline visible from either side.
  box('Frame rear strap', [.019, .078, .036], [-.058, .024, 0]);
  box('Frame top strap', [.132, .009, .028], [-.002, .063, 0]);
  box('Frame bottom strap', [.092, .010, .030], [-.012, -.006, 0]);
  box('Barrel breech', [.029, .026, .028], [.050, .042, 0]);
  box('Top strap highlight', [.124, .0015, .021], [-.002, .068, 0], edge);

  const barrel = addMesh(gun, 'Hollow .38 barrel', axisCylinder(.010, .091, 12, true), steel, [.1055, .042, 0]);
  barrel.userData.length = REVOLVER_DIMENSIONS.barrelLength;
  const bore = addMesh(gun, 'Recessed muzzle bore', axisCylinder(.0042, .012, 10), dark, [.143, .042, 0]);
  bore.userData.aperture = true;
  addMesh(gun, 'Muzzle steel crown', faceRing(.0043, .010), edge, MUZZLE_LOCAL);
  box('Barrel front sight', [.009, .009, .006], [.139, .055, 0], dark);
  box('Sight highlight', [.007, .0015, .004], [.139, .060, 0], edge);
  box('Ejector rod', [.072, .005, .006], [.101, .028, -.011], cylinderSteel);

  const cylinder = new THREE.Group(); cylinder.name = 'Revolver cylinder';
  cylinder.position.set(.005, .025, 0); cylinder.userData.length = REVOLVER_DIMENSIONS.cylinderLength; gun.add(cylinder);
  addMesh(cylinder, 'Six chamber cylinder body', axisCylinder(.028, .070, 18), cylinderSteel, [0, 0, 0]);
  for (const direction of [-1, 1]) {
    addMesh(cylinder, `${direction > 0 ? 'Front' : 'Rear'} cylinder hub`, axisCylinder(.006, .002, 10), edge, [direction * .036, 0, 0]);
    for (let chamber = 0; chamber < 6; chamber++) {
      const angle = chamber * Math.PI / 3, y = Math.cos(angle) * .018, z = Math.sin(angle) * .018;
      const hole = addMesh(cylinder, `${direction > 0 ? 'Front' : 'Rear'} chamber ${chamber + 1} bore`, axisCylinder(.0043, .0024, 10), dark, [direction * .0358, y, z]);
      hole.userData.chamberHole = chamber + 1;
      const ring = addMesh(cylinder, `${direction > 0 ? 'Front' : 'Rear'} chamber ${chamber + 1} rim`, faceRing(.0043, .0053), steel, [direction * .0371, y, z]);
      if (direction < 0) ring.rotation.y = Math.PI;
    }
  }
  for (let flute = 0; flute < 6; flute++) {
    const angle = flute * Math.PI / 3;
    const groove = addMesh(cylinder, `Cylinder flute ${flute + 1}`, new THREE.BoxGeometry(.046, .0014, .005), dark,
      [-.003, Math.cos(angle) * .028, Math.sin(angle) * .028]);
    groove.rotation.x = angle;
  }

  // Bevelled, curved wooden grip with a narrow metal backstrap.
  const gripShape = new THREE.Shape();
  gripShape.moveTo(-.062, -.004); gripShape.lineTo(-.045, -.018);
  gripShape.quadraticCurveTo(-.054, -.044, -.066, -.087);
  gripShape.quadraticCurveTo(-.068, -.106, -.079, -.107);
  gripShape.lineTo(-.107, -.103); gripShape.quadraticCurveTo(-.120, -.100, -.119, -.085);
  gripShape.quadraticCurveTo(-.099, -.045, -.087, -.020); gripShape.closePath();
  const gripGeometry = new THREE.ExtrudeGeometry(gripShape, { depth: .030, bevelEnabled: true, bevelThickness: .002, bevelSize: .002, bevelSegments: 1, steps: 1, curveSegments: 4 });
  gripGeometry.translate(0, 0, -.015);
  addMesh(gun, 'Curved wooden grip', gripGeometry, wood, [0, 0, 0]);
  const strap = new THREE.CatmullRomCurve3([new THREE.Vector3(-.065, -.009, -.0175), new THREE.Vector3(-.090, -.052, -.0175), new THREE.Vector3(-.116, -.088, -.0175)]);
  addMesh(gun, 'Grip steel backstrap', new THREE.TubeGeometry(strap, 7, .0025, 5, false), steel, [0, 0, 0]);
  for (const side of [-1, 1]) {
    for (let line = 0; line < 6; line++) {
      const ridge = box(`Grip checkering ${side}:${line}`, [.026, .0018, .0012], [-.084 - line * .0025, -.046 - line * .008, side * .0173], checkering);
      ridge.rotation.z = -.28;
    }
    const screwGeometry = new THREE.CylinderGeometry(.0032, .0032, .0018, 8); screwGeometry.rotateX(Math.PI / 2);
    addMesh(gun, `Grip screw ${side}`, screwGeometry, edge, [-.087, -.065, side * .018]);
  }

  const guardGeometry = new THREE.TorusGeometry(.019, .0024, 5, 16); guardGeometry.scale(1.16, .96, .75);
  addMesh(gun, 'Ring trigger guard', guardGeometry, steel, [-.016, -.025, 0]);
  const trigger = new THREE.Group(); trigger.name = 'Revolver trigger'; trigger.position.set(-.019, -.007, 0); gun.add(trigger);
  const triggerCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(.007, -.012, 0), new THREE.Vector3(-.001, -.027, 0));
  addMesh(trigger, 'Curved trigger', new THREE.TubeGeometry(triggerCurve, 6, .0019, 5, false), dark, [0, 0, 0]);

  const hammer = new THREE.Group(); hammer.name = 'Revolver hammer'; hammer.position.set(-.060, .054, 0); gun.add(hammer);
  const hammerShape = new THREE.Shape(); hammerShape.moveTo(-.008, -.004); hammerShape.lineTo(-.018, .015);
  hammerShape.lineTo(-.011, .027); hammerShape.lineTo(.002, .021); hammerShape.lineTo(.003, .002); hammerShape.closePath();
  const hammerGeometry = new THREE.ExtrudeGeometry(hammerShape, { depth: .009, bevelEnabled: false, curveSegments: 1 }); hammerGeometry.translate(0, 0, -.0045);
  addMesh(hammer, 'Hammer spur', hammerGeometry, steel, [0, 0, 0]);
  hammer.userData.restAngle = trigger.userData.restAngle = 0;

  const muzzlePoint = new THREE.Object3D(); muzzlePoint.name = 'Revolver muzzle contact'; muzzlePoint.position.set(...MUZZLE_LOCAL); gun.add(muzzlePoint);
  const gripPoint = new THREE.Object3D(); gripPoint.name = 'Revolver grip center'; gripPoint.position.set(...GRIP_LOCAL); gun.add(gripPoint);
  return { gun, hammer, cylinder, revolverCylinder: cylinder, trigger, muzzlePoint, gripPoint };
}
