import * as THREE from 'three';
import { createFixedLimb, type FixedLimb } from './rig';

export type HandRig = { group: THREE.Group; fingers: THREE.Group[]; thumb: THREE.Group; tips: THREE.Group[] };
export function articulatedHand(material: THREE.MeshStandardMaterial): HandRig {
  const group = new THREE.Group(), palm = new THREE.Mesh(new THREE.BoxGeometry(.16, .055, .14), material);
  palm.position.z = .045; palm.castShadow = palm.receiveShadow = true; group.add(palm);
  const fingers: THREE.Group[] = [], tips: THREE.Group[] = [];
  let thumbBone: THREE.Group | null = null;
  for (let index = 0; index < 5; index++) {
    const thumb = index === 4, finger = new THREE.Group();
    finger.name = thumb ? 'Thumb bone' : `${['Index', 'Middle', 'Ring', 'Little'][index]} finger bone`;
    finger.userData.fingerIndex = index;
    finger.position.set(thumb ? -.09 : (index - 1.5) * .042, -.002, thumb ? .025 : .105);
    if (thumb) finger.rotation.y = -.85;
    const length = thumb ? .092 : [.105, .128, .12, .095][index];
    let parent = finger;
    for (let part = 0; part < 3; part++) {
      const bone = new THREE.Group(); bone.name = `${finger.name} phalanx ${part + 1}`;
      if (part) bone.position.z = length / 3;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(thumb ? .040 : .030, .032, length / 3), material);
      mesh.position.z = length / 6; mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.anatomyFinger = true; bone.add(mesh); parent.add(bone); parent = bone;
      if (part === 2) tips.push(bone);
    }
    group.add(finger);
    if (thumb) thumbBone = finger; else fingers.push(finger);
  }
  return { group, fingers, thumb: thumbBone!, tips };
}

/** A wrist is an IK endpoint; meshes have authored lengths and never receive a length scale. */
export function replaceArm(parent: THREE.Object3D, upper: THREE.Mesh, lower: THREE.Mesh, hand: THREE.Group, material: THREE.MeshStandardMaterial, name: string) {
  upper.removeFromParent(); lower.removeFromParent();
  const limb = createFixedLimb(parent, .42, .40, .085, material, name);
  upper.visible = lower.visible = false;
  return { limb, hand, solve(shoulder: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3) {
    const pose = limb.update(shoulder, target, pole); hand.position.copy(pose.end); return pose;
  } };
}

export function makeLegs(parent: THREE.Group, material: THREE.MeshStandardMaterial, shoes: THREE.MeshStandardMaterial, seated: boolean, name: string) {
  const group = new THREE.Group(); group.name = `${name} articulated legs`; parent.add(group);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(.45, .22, .29), material);
  pelvis.position.y = seated ? -.16 : .04; pelvis.castShadow = true; group.add(pelvis);
  const limbs: FixedLimb[] = [], feet: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const limb = createFixedLimb(group, seated ? .44 : .44, seated ? .60 : .42, .105, material, `${name} ${side < 0 ? 'left' : 'right'} leg`);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.21, .115, .34), shoes);
    foot.name = `${name} shoe`; foot.castShadow = foot.receiveShadow = true; group.add(foot);
    limbs.push(limb); feet.push(foot);
  }
  function update(walk = 0, time = 0, kneeBounce = 0) {
    for (let index = 0; index < 2; index++) {
      const x = index ? .17 : -.17, stride = Math.sin(time * 8 + index * Math.PI) * walk;
      const root = new THREE.Vector3(x, seated ? -.18 : .03, 0);
      const ankle = new THREE.Vector3(x, -.78 + (seated ? Math.max(0, kneeBounce) : Math.max(0, stride) * .12), seated ? .44 : .05 + stride * .24);
      const pole = new THREE.Vector3(x, seated ? -.18 : -.35, seated ? 1 : .4);
      limbs[index].update(root, ankle, pole); feet[index].position.copy(limbs[index].pose.end).add(new THREE.Vector3(0, -.025, .08));
      feet[index].rotation.x = seated ? -kneeBounce : -stride * .12;
    }
  }
  update(); return { group, limbs, feet, update };
}

export function gripFingers(hand: HandRig, amount: number, trigger: number, cock: number) {
  hand.fingers.forEach((finger, index) => {
    finger.rotation.x = index ? -amount * 1.05 : -(.15 + trigger * .62) * amount;
    finger.children.forEach((part, partIndex) => {
      if (part instanceof THREE.Group) part.rotation.x = index ? -amount * .42 : -trigger * .30;
      // The remaining knuckles are nested inside their proximal segment.
      if (partIndex === 0) part.traverse(child => { if (child instanceof THREE.Group && child !== part) child.rotation.x = index ? -amount * .42 : -trigger * .30; });
    });
  });
  hand.thumb.rotation.y = -.85 + amount * .9; hand.thumb.rotation.x = -amount * .45 - cock * .28;
}

export function guardCharacter(material: THREE.MeshStandardMaterial, black: THREE.MeshStandardMaterial, gloves: THREE.MeshStandardMaterial) {
  const group = new THREE.Group(); group.name = 'Silent guard'; group.userData = { actorRole: 'guard', canSpeak: false };
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(.28, .25, .65, 6), material); torso.position.y = .46; torso.scale.z = .67; group.add(torso);
  const head = new THREE.Group(); head.position.y = .99; group.add(head);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), black); hood.scale.set(.18, .25, .17); head.add(hood);
  for (const x of [-.063, .063]) { const eye = new THREE.Mesh(new THREE.BoxGeometry(.055, .018, .018), gloves); eye.position.set(x, .04, .156); head.add(eye); }
  const left = articulatedHand(gloves), right = articulatedHand(gloves); group.add(left.group, right.group); left.group.scale.x = -1;
  const leftLimb = createFixedLimb(group, .42, .40, .09, material, 'guard left arm');
  const rightLimb = createFixedLimb(group, .42, .40, .09, material, 'guard right arm');
  const legs = makeLegs(group, material, black, false, 'guard');
  const bag = new THREE.Mesh(new THREE.BoxGeometry(.24, .27, .13), material); bag.position.set(.24, .07, .18); group.add(bag);
  const foldedHoods = new THREE.Group(); foldedHoods.name = 'Pocketed burlap hoods';
  foldedHoods.position.set(.24,.14,.26); group.add(foldedHoods); foldedHoods.visible=false;
  const burlap = new THREE.MeshStandardMaterial({color:0x49402d,roughness:1,flatShading:true});
  for (let index=0;index<2;index++) { const cloth=new THREE.Mesh(new THREE.DodecahedronGeometry(.10,0),burlap); cloth.position.x=index*.09-.04; cloth.scale.set(.7,1,.5); foldedHoods.add(cloth); }
  group.position.y = .86; group.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true; });
  function pose(time: number, walking: number, target?: THREE.Vector3) {
    legs.update(walking, time);
    for (const [side, limb, hand] of [[-1, leftLimb, left], [1, rightLimb, right]] as const) {
      const shoulder = new THREE.Vector3(side * .28, .72, 0);
      const point = target && side === 1 ? group.worldToLocal(target.clone()) : new THREE.Vector3(side * .35, .06, Math.sin(time * 8 + side) * walking * .14);
      const result = limb.update(shoulder, point, new THREE.Vector3(side * .58, .30, .2)); hand.group.position.copy(result.end);
      hand.group.rotation.set(-Math.PI / 2, 0, 0); gripFingers(hand, target && side === 1 ? .9 : .15, 0, 0);
    }
  }
  return { group, head, left, right, legs, leftLimb, rightLimb, foldedHoods, pose };
}
