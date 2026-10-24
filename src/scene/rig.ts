import * as THREE from 'three';

export type TwoBonePose = { root: THREE.Vector3; joint: THREE.Vector3; end: THREE.Vector3; reached: boolean };
const EPSILON = 1e-5;

/** Analytic two-bone IK. Reach is clamped; the two authored bone lengths never change. */
export function solveTwoBone(root: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, upper: number, lower: number): TwoBonePose {
  if (!(upper > 0) || !(lower > 0)) throw new RangeError('IK bone lengths must be positive.');
  const direction = target.clone().sub(root), requestedDistance = direction.length();
  if (requestedDistance < EPSILON) direction.set(0, 0, 1); else direction.multiplyScalar(1 / requestedDistance);
  const distance = THREE.MathUtils.clamp(requestedDistance, Math.abs(upper - lower) + EPSILON, upper + lower - EPSILON);
  const bend = pole.clone().sub(root).addScaledVector(direction, -pole.clone().sub(root).dot(direction));
  if (bend.lengthSq() < EPSILON) {
    bend.set(Math.abs(direction.y) < .9 ? 0 : 1, Math.abs(direction.y) < .9 ? 1 : 0, 0);
    bend.addScaledVector(direction, -bend.dot(direction));
  }
  bend.normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const joint = root.clone().addScaledVector(direction, along).addScaledVector(bend, height);
  const end = root.clone().addScaledVector(direction, distance);
  return { root: root.clone(), joint, end, reached: Math.abs(requestedDistance - distance) < EPSILON * 2 };
}

export type FixedLimb = {
  upper: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  lower: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  joint: THREE.Mesh;
  lengths: readonly [number, number];
  pose: TwoBonePose;
  update(root: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3): TwoBonePose;
};

/** Length is baked into geometry; animation uses translation and rotation only. */
export function createFixedLimb(parent: THREE.Object3D, upperLength: number, lowerLength: number, radius: number, material: THREE.MeshStandardMaterial, name: string): FixedLimb {
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * .93, upperLength, 6), material);
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(radius * .90, radius * .74, lowerLength, 6), material);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * .96, 6, 4), material);
  upper.name = `${name} upper`; lower.name = `${name} lower`; joint.name = `${name} joint`;
  for (const mesh of [upper, lower, joint]) { mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); }
  upper.userData = { anatomyBone: true, restLength: upperLength, limb: name, segment: 'upper' };
  lower.userData = { anatomyBone: true, restLength: lowerLength, limb: name, segment: 'lower' };
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const limb: FixedLimb = {
    upper, lower, joint, lengths: [upperLength, lowerLength],
    pose: solveTwoBone(new THREE.Vector3(), new THREE.Vector3(0, upperLength, 0), new THREE.Vector3(0, 0, 1), upperLength, lowerLength),
    update(root, target, pole) {
      const pose = solveTwoBone(root, target, pole, upperLength, lowerLength);
      for (const [mesh, a, b] of [[upper, pose.root, pose.joint], [lower, pose.joint, pose.end]] as const) {
        mesh.position.copy(a).lerp(b, .5);
        direction.subVectors(b, a).normalize(); mesh.quaternion.setFromUnitVectors(up, direction);
        mesh.userData.start = a.toArray(); mesh.userData.end = b.toArray();
      }
      joint.position.copy(pose.joint); limb.pose = pose; return pose;
    },
  };
  return limb;
}
