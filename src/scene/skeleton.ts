import {createHostCoat,createHostMask} from './hostCoat';
import * as THREE from 'three';
import { solveTwoBone } from './rig';
import { HUMAN, POSES, type PoseName, type Triple } from './poses';

export type CharacterRole='host'|'captive'|'guard'|'player';
export type RigSide='left'|'right';
export type ReachDiagnostics={requestedDistance:number;targetDistance:number;reachLimit:number;relocateRequired:boolean;elbowAngle:number;shoulder:THREE.Vector3;elbow:THREE.Vector3;wrist:THREE.Vector3;wristLimited:boolean};
export type SkeletonArm={shoulder:THREE.Group;upper:THREE.Group;forearm:THREE.Group;hand:THREE.Group;palm:THREE.Mesh;fingers:THREE.Group[][];thumb:THREE.Group[];upperMesh:THREE.Mesh;lowerMesh:THREE.Mesh;lengths:readonly[number,number];diagnostics:ReachDiagnostics};
export type SkeletonLeg={thigh:THREE.Group;shin:THREE.Group;foot:THREE.Group;upperMesh:THREE.Mesh;lowerMesh:THREE.Mesh;lengths:readonly[number,number]};
const DOWN=new THREE.Vector3(0,-1,0), IDENTITY=new THREE.Quaternion(), HAND_BIND=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
function joint(parent:THREE.Object3D,name:string,position:Triple=[0,0,0]) {const node=new THREE.Group();node.name=name;node.position.set(...position);node.userData.bindPosition=[...position];parent.add(node);return node;}
function material(color:number,skin=false) {return new THREE.MeshStandardMaterial({color,roughness:skin?.72:.92,metalness:0,flatShading:true,emissive:skin?color:0,emissiveIntensity:skin?.12:0});}
function mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,mat:THREE.Material,name:string,position:Triple=[0,0,0]) {const item=new THREE.Mesh(geometry,mat);item.name=name;item.position.set(...position);item.castShadow=true;item.receiveShadow=true;parent.add(item);return item;}
function block(parent:THREE.Object3D,size:Triple,at:Triple,mat:THREE.Material,name:string) {return mesh(parent,new THREE.BoxGeometry(...size),mat,name,at);}
function segment(parent:THREE.Object3D,length:number,radius:number,mat:THREE.Material,name:string,axis:'y'|'z'='y') {
  const geometry=new THREE.CylinderGeometry(radius,radius*.82,length,mat instanceof THREE.MeshStandardMaterial&&!mat.flatShading?24:7);
  if(axis==='z')geometry.rotateX(Math.PI/2);
  const item=mesh(parent,geometry,mat,name,axis==='y'?[0,-length/2,0]:[0,0,length/2]);
  item.userData={skeletonSegment:true,restLength:length,axis};return item;
}
function cap(parent:THREE.Object3D,radius:number,mat:THREE.Material,name:string) {return mesh(parent,new THREE.SphereGeometry(radius,7,5),mat,name);}
function orientChain(upper:THREE.Object3D,lower:THREE.Object3D,root:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,maxFlex=HUMAN.elbowFlexLimit) {
  const u=b.clone().sub(a).normalize(),v=c.clone().sub(b).normalize();
  const bend=v.clone().addScaledVector(u,-v.dot(u));
  if(bend.lengthSq()<1e-8)bend.set(0,0,1).addScaledVector(u,-u.z);
  bend.normalize();
  const y=u.clone().negate(),z=bend.clone(),x=y.clone().cross(z).normalize();z.crossVectors(x,y).normalize();
  const basis=new THREE.Matrix4().makeBasis(x,y,z),q=new THREE.Quaternion().setFromRotationMatrix(basis);
  const rootWorld=root.getWorldQuaternion(new THREE.Quaternion());q.premultiply(rootWorld);
  const parentWorld=upper.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
  upper.quaternion.copy(parentWorld).multiply(q);
  lower.rotation.set(-Math.min(maxFlex,Math.acos(THREE.MathUtils.clamp(u.dot(v),-1,1))),0,0);
}

/**
 * One lofted torso (waist → chest → rounded shoulders → trapezius slope → neck base) in chest space.
 * Replaces the box chest and flat clavicle slab, so the shoulder caps sit inside a sloped shoulder line
 * instead of poking up from the corners of a box. Joint positions are unchanged.
 */
export const TORSO_PROFILE:readonly (readonly [number,number,number])[]=[
  [-.20,.155,.094],[-.06,.172,.104],[.06,.192,.108],[.140,.218,.102],[.188,.228,.090],[.212,.168,.075],[.232,.075,.058],[.244,.050,.045],
];
function torsoGeometry(){
  const sides=24,rows=TORSO_PROFILE.length,positions:number[]=[],indices:number[]=[];
  for(const [y,w,d] of TORSO_PROFILE)for(let i=0;i<sides;i++){
    // Superellipse cross-section: squarer than an ellipse, rounder than a box.
    const a=i/sides*Math.PI*2,c=Math.cos(a),s=Math.sin(a),k=2/3.2;
    positions.push(Math.sign(c)*Math.abs(c)**k*w,y,Math.sign(s)*Math.abs(s)**k*d);
  }
  for(let j=0;j<rows-1;j++)for(let i=0;i<sides;i++){const a=j*sides+i,b=j*sides+(i+1)%sides;indices.push(a,a+sides,b,b,a+sides,b+sides);}
  const top=positions.length/3;positions.push(0,TORSO_PROFILE[rows-1][0]+.004,0);
  for(let i=0;i<sides;i++)indices.push((rows-1)*sides+i,(rows-1)*sides+(i+1)%sides,top);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

export function createCharacter(role:CharacterRole,room:1|2|3=1) {
  const group=new THREE.Group();group.name=`${role} human skeleton`;group.userData={actorRole:role,proceduralSkeleton:true};
  const pelvis=joint(group,`${role} pelvis`),spine=joint(pelvis,`${role} spine`,[0,.14,0]),chest=joint(spine,`${role} chest`,[0,.27,0]);
  chest.userData.width=.34;
  const neck=joint(chest,`${role} neck`,[0,.23,0]),head=joint(neck,`${role} head`,[0,.125,0]);
  const cloth=material(role==='host'?0x161d1b:role==='guard'?0x25302b:role==='player'?0x303b31:0x465348);
  if(role==='host'){cloth.flatShading=false;cloth.roughness=1;}
  const flesh=material(role==='host'?0xb7a28b:role==='guard'?0x5d6253:0xb29c80,true),black=material(0x17211b),shoeMat=material(0x20271f);
  const handSkin=role==='host'?new THREE.MeshStandardMaterial({color:0x1b1f1c,roughness:.55,metalness:.05,flatShading:true}):flesh;
  const bodyMeshes:THREE.Mesh[]=[];
  bodyMeshes.push(block(pelvis,[.29,.14,.19],[0,.02,0],cloth,'Hip clothing'),block(spine,[.28,.24,.17],[0,.06,0],cloth,'Abdomen'),mesh(chest,torsoGeometry(),cloth,'Chest clothing'));
  bodyMeshes.push(mesh(neck,new THREE.CylinderGeometry(.039,.046,.130,8),flesh,'Neck skin',[0,-.015,0]));
  const headLooks:THREE.Group[]=[];
  for(let index=0;index<(role==='captive'?3:1);index++) {
    const look=joint(head,`${role} head look ${index+1}`);headLooks.push(look);
    const skullGeo=new THREE.SphereGeometry(1,9,7);skullGeo.scale(.090,.115,.083);
    const skull=mesh(look,skullGeo,role==='host'||role==='guard'?black:flesh,'Cranium');bodyMeshes.push(skull);
    if(role==='host') {
      skull.visible=false;createHostMask(look);
    } else if(role==='guard') {
      bodyMeshes.push(block(look,[.112,.020,.013],[0,.024,.077],flesh,'Balaclava eye opening'));
      for(const x of [-.030,.030])bodyMeshes.push(block(look,[.013,.009,.007],[x,.025,.086],black,'Guard eye'));
    } else {
      const hair=material(index===2?0x8c8d86:index===1?0x241f19:0x3a3226);
      // Distinct silhouettes: messy hair (nervous), slicked back (gambler), receding grey (survivor).
      const crownGeo=new THREE.SphereGeometry(1,8,5,0,Math.PI*2,0,Math.PI*.48);
      // Same proven cap as before (hair edge recessed behind the face), reshaped per character: fuller, slicked flat, or receding.
      crownGeo.scale(index===2?.093:index===1?.095:.093,index===1?.120:.119,index===2?.085:index===1?.089:.086);
      bodyMeshes.push(mesh(look,crownGeo,hair,'Hair',index===2?[0,.003,-.013]:index===1?[0,.004,-.006]:[0,.003,-.005]));
      if(index===0){
        // Messy tufts falling over the forehead and sticking out at the crown.
        // Uneven fringe strands hanging onto the forehead plus a few sticking up at the crown.
        // Uneven fringe lying flat on the forehead, plus a few strands sticking up at the crown.
        for(const [x,y,z,rx,rz,w,l] of [[-.032,.066,.077,-.30,.20,.024,.034],[-.004,.069,.080,-.25,-.06,.026,.040],[.026,.066,.077,-.32,-.24,.022,.032],
          [-.020,.116,.012,.55,.35,.020,.036],[.018,.118,-.018,.70,-.40,.018,.032]] as const){
          const strand=block(look,[w,l,.008],[x,y,z],hair,'Messy hair strand');strand.rotation.set(rx,0,rz);bodyMeshes.push(strand);
        }
        const bag=material(0x6f5a48);for(const x of [-.034,.034])bodyMeshes.push(block(look,[.022,.005,.006],[x,.010,.080],bag,'Dark under-eye'));
        const sweat=new THREE.MeshStandardMaterial({color:0xdfe8e4,emissive:0x8fa6a0,emissiveIntensity:.5,roughness:.2});
        for(const [x,y] of [[.030,.066],[-.022,.074],[.052,.040]] as const)bodyMeshes.push(mesh(look,new THREE.SphereGeometry(.0045,5,4),sweat,'Sweat bead',[x,y,.079]));
      }
      if(index===1){
        // Side parting line and stubble shadow over the jaw.
        bodyMeshes.push(block(look,[.004,.006,.060],[.030,.108,.030],material(0x5a4a34),'Hair parting'));
        const stubbleGeo=new THREE.SphereGeometry(1,12,6,Math.PI*.15,Math.PI*.70,Math.PI*.58,Math.PI*.30);stubbleGeo.scale(.093,.118,.086);
        bodyMeshes.push(mesh(look,stubbleGeo,material(0x8c7864,true),'Stubble'));
      }
      if(index===2){
        // Thick grey beard and a pale scar across the left cheek.
        const beardGeo=new THREE.SphereGeometry(1,12,6,Math.PI*.10,Math.PI*.80,Math.PI*.64,Math.PI*.30);beardGeo.scale(.096,.122,.092);
        const beard=material(0x9a9a8e,true);beard.emissiveIntensity=.22;
        bodyMeshes.push(mesh(look,beardGeo,beard,'Beard'));
        bodyMeshes.push(block(look,[.040,.024,.024],[0,-.090,.062],beard,'Beard chin'),block(look,[.054,.011,.010],[0,-.037,.081],beard,'Moustache'));
        const scar=block(look,[.005,.036,.004],[-.050,-.006,.071],material(0xc79a86,true),'Cheek scar');scar.rotation.z=.55;bodyMeshes.push(scar);
      }
      for(const x of [-.034,.034]) {
        bodyMeshes.push(block(look,[.018,index===0?.012:.009,.010],[x,.023,.078],black,'Human eye'));
        const brow=block(look,[.025,.006,.008],[x,.045+(index===1&&x>0?.007:0),.073],hair,'Eyebrow');brow.rotation.z=index===0?-Math.sign(x)*.20:index===1&&x>0?-.18:index===2?Math.sign(x)*.08:0;bodyMeshes.push(brow);
      }
      const noseGeo=new THREE.ConeGeometry(.014,.045,5);noseGeo.rotateX(Math.PI/2);bodyMeshes.push(mesh(look,noseGeo,flesh,'Nose',[0,-.005,.087]));
      const mouth=block(look,[index===1?.044:index===0?.026:.034,index===0?.008:.005,.008],[index===1?.006:0,-.048,.076],black,'Mouth');mouth.rotation.z=index===1?.14:0;bodyMeshes.push(mouth);
      if(index===2)for(const y of [.058,.071])bodyMeshes.push(block(look,[.066,.003,.004],[0,y,.069],hair,'Forehead crease'));
    }
  }
  // Collars and the loosened tie retain each captive's silhouette.
  const shirt=material(0x9b9882);bodyMeshes.push(block(chest,[.10,.13,.018],[0,.085,.112],shirt,'Shirt opening'));
  const tie=block(chest,[.024,.22,.013],[.008,.005,.124],black,'Loosened tie');bodyMeshes.push(tie);
  const hoodie=mesh(neck,new THREE.TorusGeometry(.074,.020,4,9),cloth,'Captive hood collar',[0,-.019,-.006]);hoodie.rotation.x=Math.PI/2;bodyMeshes.push(hoodie);
  // Per-captive clothing details (shown by setRoom): hoodie strings and pocket, gambler's vest, survivor's work-jacket collar and zip.
  const outfit=[1,2,3].map(n=>{const g=joint(chest,`${role} outfit ${n}`);g.visible=false;return g;});
  const string=material(0xd8d3c2),pocket=material(0x3f463f),vest=material(0x2c2822),jacket=material(0x3f3424),zip=material(0x9c9a8a);
  for(const x of [-.028,.028]){const m=mesh(outfit[0],new THREE.CylinderGeometry(.004,.004,.11,4),string,'Hoodie drawstring',[x,.150,.112]);m.rotation.x=-.12;bodyMeshes.push(m);}
  bodyMeshes.push(block(outfit[0],[.17,.075,.016],[0,-.115,.100],pocket,'Hoodie pocket'));
  for(const x of [-1,1]){const panel=block(outfit[1],[.085,.30,.014],[x*.058,-.035,.110],vest,'Waistcoat panel');panel.rotation.z=x*.10;bodyMeshes.push(panel);}
  for(const y of [-.03,-.08,-.13])bodyMeshes.push(block(outfit[1],[.010,.010,.006],[.012,y,.119],material(0x8a7a4a),'Waistcoat button'));
  for(const x of [-1,1]){const flap=block(outfit[2],[.070,.050,.014],[x*.055,.205,.090],jacket,'Jacket collar');flap.rotation.set(-.5,0,x*.45);bodyMeshes.push(flap);}
  bodyMeshes.push(block(outfit[2],[.008,.34,.006],[0,-.030,.112],zip,'Jacket zip'));
  for(const x of [-1,1])bodyMeshes.push(block(outfit[2],[.050,.030,.010],[x*.10,.040,.106],jacket,'Chest pocket flap'));
  // Guards wear a tactical vest with pouches.
  const tactical=joint(chest,`${role} tactical vest`);tactical.visible=role==='guard';
  const vestMat=material(0x161b18);bodyMeshes.push(block(tactical,[.30,.30,.030],[0,-.02,.100],vestMat,'Tactical vest front'),block(tactical,[.30,.30,.030],[0,-.02,-.100],vestMat,'Tactical vest back'));
  for(const x of [-.09,0,.09])bodyMeshes.push(block(tactical,[.065,.070,.035],[x,-.10,.125],material(0x222a24),'Vest pouch'));

  const arms={} as Record<RigSide,SkeletonArm>;
  for(const side of ['left','right'] as const) {
    const sign=side==='left'?-1:1;
    const shoulder=joint(chest,`${role} ${side} shoulder`,[sign*.20,.17,0]);
    const upper=joint(shoulder,`${role} ${side} upper arm`),forearm=joint(upper,`${role} ${side} forearm`,[0,-HUMAN.upperArm,0]);
    const hand=joint(forearm,`${role} ${side} wrist`,[0,-HUMAN.forearm,0]);hand.quaternion.copy(HAND_BIND);hand.userData.bindQuaternion=HAND_BIND.toArray();
    const upperMesh=segment(upper,HUMAN.upperArm,role==='host'?.056:.050,cloth,'Upper sleeve'),lowerMesh=segment(forearm,HUMAN.forearm,role==='host'?.050:.041,cloth,'Forearm sleeve');
    if(role==='host')(lowerMesh.geometry as THREE.CylinderGeometry).dispose(),lowerMesh.geometry=new THREE.CylinderGeometry(.050,.062,HUMAN.forearm,18,1,true);
    cap(upper,.047,cloth,'Shoulder cap');cap(forearm,.042,cloth,'Elbow cap');cap(hand,.023,handSkin,'Wrist cap');
    segment(forearm,.030,role==='host'?.064:.042,role==='host'?cloth:material(0x475245),'Sleeve cuff').position.y=-HUMAN.forearm+.015;
    const palm=block(hand,[.075,.028,.10],[0,0,.050],handSkin,'Skin palm');palm.receiveShadow=false;
    const fingers:THREE.Group[][]=[];
    for(let digit=0;digit<4;digit++) {
      const chain:THREE.Group[]=[],total=[.075,.080,.076,.065][digit],lengths=[total*.36,total*.34,total*.30];
      let parent=hand;
      for(let part=0;part<3;part++) {
        const bone=joint(parent,`${role} ${side} ${['index','middle','ring','little'][digit]} ${part+1}`,part===0?[(side==='left'?1:-1)*(.027-digit*.018),0,.10]:[0,0,lengths[part-1]]);
        bone.userData={...bone.userData,fingerIndex:digit,phalanx:part+1};
        const skin=block(bone,[.014,.014,lengths[part]],[0,0,lengths[part]/2],handSkin,'Finger skin');skin.receiveShadow=false;cap(bone,.0075,handSkin,'Finger knuckle');chain.push(bone);parent=bone;
      }
      fingers.push(chain);
    }
    const thumb:THREE.Group[]=[];let thumbParent=hand;
    for(let part=0;part<2;part++) {
      const bone=joint(thumbParent,`${role} ${side} thumb ${part+1}`,part===0?[side==='left'?.043:-.043,0,.032]:[0,0,.028]);
      bone.userData={...bone.userData,fingerIndex:4,phalanx:part+1};
      const skin=block(bone,[.020,.019,.028],[0,0,.014],handSkin,'Thumb skin');skin.receiveShadow=false;cap(bone,.010,handSkin,'Thumb knuckle');thumb.push(bone);thumbParent=bone;
    }
    arms[side]={shoulder,upper,forearm,hand,palm,fingers,thumb,upperMesh,lowerMesh,lengths:[HUMAN.upperArm,HUMAN.forearm],diagnostics:{requestedDistance:0,targetDistance:0,reachLimit:.513,relocateRequired:false,elbowAngle:90,shoulder:new THREE.Vector3(),elbow:new THREE.Vector3(),wrist:new THREE.Vector3(),wristLimited:false}};
  }
  // Gambler's gold ring on the right ring finger; survivor's elbow patches.
  const ring=mesh(arms.right.fingers[2][0],new THREE.TorusGeometry(.0095,.0028,5,10),new THREE.MeshStandardMaterial({color:0xc9a64a,metalness:.8,roughness:.3,emissive:0x3a2c08,emissiveIntensity:.4}),'Gold ring',[0,0,.012]);ring.visible=false;
  const elbowPatches=(['left','right'] as const).map(side=>{const patch=block(arms[side].forearm,[.060,.060,.020],[0,-.045,-.040],material(0x2e261a),'Elbow patch');patch.visible=false;bodyMeshes.push(patch);return patch;});
  const legs={} as Record<RigSide,SkeletonLeg>;
  for(const side of ['left','right'] as const) {
    const sign=side==='left'?-1:1,thigh=joint(pelvis,`${role} ${side} thigh`,[sign*.105,0,0]),shin=joint(thigh,`${role} ${side} shin`,[0,-HUMAN.thigh,0]),foot=joint(shin,`${role} ${side} foot`,[0,-HUMAN.shin,0]);
    const upperMesh=segment(thigh,HUMAN.thigh,.065,cloth,'Trouser thigh'),lowerMesh=segment(shin,HUMAN.shin,.053,cloth,'Trouser shin');
    bodyMeshes.push(upperMesh,lowerMesh,cap(thigh,.067,cloth,'Hip cap'),cap(shin,.059,cloth,'Knee cap'),block(foot,[.095,.085,.25],[0,.0425,.080],shoeMat,'Shoe'));
    legs[side]={thigh,shin,foot,upperMesh,lowerMesh,lengths:[HUMAN.thigh,HUMAN.shin]};
  }
  const coat=role==='host'?createHostCoat(pelvis,spine):null;
  if(role==='host')bodyMeshes.forEach(m=>{m.visible=false;});
  let activeRoom=room;
  function setRoom(next:1|2|3) {
    activeRoom=next;headLooks.forEach((look,index)=>look.visible=role!=='captive'||index===next-1);
    // Faded grey hoodie (nervous), shirt sleeves under a waistcoat (gambler), worn brown work jacket (survivor).
    if(role==='captive') {cloth.color.setHex([0x58605a,0x8b8573,0x5c4a33][next-1]);flesh.color.setHex([0xbfae98,0xb1997e,0xa89880][next-1]);flesh.emissive.copy(flesh.color);}
    outfit.forEach((g,index)=>g.visible=role==='captive'&&index===next-1);ring.visible=role==='captive'&&next===2;
    elbowPatches.forEach(patch=>patch.visible=role==='captive'&&next===3);
    tie.visible=role==='captive'&&next===2;hoodie.visible=role==='captive'&&next===1;
    group.userData.roomNumber=next;
  }
  function setGrip(side:RigSide,amount:number,trigger=0,cock=0) {
    const arm=arms[side],a=THREE.MathUtils.clamp(amount,.12,1);
    arm.fingers.forEach((chain,index)=>chain.forEach((bone,part)=>{bone.rotation.x=-(index===0?(part===0?1.0+trigger*.25:.18+trigger*.25):[.60,.92,.82][part])*a;}));
    const sign=side==='left'?-1:1;
    arm.thumb[0].rotation.set(-(.25+a*.28+cock*.12),sign*.38,sign*.12);
    arm.thumb[1].rotation.x=-a*.65;
  }
  function rootPosition(object:THREE.Object3D) {group.updateWorldMatrix(true,true);return group.worldToLocal(object.getWorldPosition(new THREE.Vector3()));}
  function leanToward(target:THREE.Vector3,maxAngle=HUMAN.leanLimit) {
    const center=rootPosition(chest),dx=target.x-center.x,dz=target.z-center.z;
    const angle=Math.min(HUMAN.leanLimit,Math.max(0,maxAngle),Math.hypot(dx,dz)*.70),direction=Math.atan2(dx,dz);
    spine.rotation.x=Math.cos(direction)*angle;spine.rotation.z=-Math.sin(direction)*angle;
    group.updateWorldMatrix(true,true);
  }
  function solveHand(side:RigSide,targetInRoot:THREE.Vector3,poleInRoot?:THREE.Vector3,options:{allowRaisedElbow?:boolean;lean?:boolean;palmQuaternion?:THREE.Quaternion;fullGrip?:boolean}={}) {
    const arm=arms[side];group.updateWorldMatrix(true,true);
    let shoulder=rootPosition(arm.shoulder);
    if(options.lean!==false&&shoulder.distanceTo(targetInRoot)>HUMAN.reachRatio*(HUMAN.upperArm+HUMAN.forearm)) {leanToward(targetInRoot);shoulder=rootPosition(arm.shoulder);}
    const requestedDistance=shoulder.distanceTo(targetInRoot),reachLimit=HUMAN.reachRatio*(HUMAN.upperArm+HUMAN.forearm);
    const minimum=Math.sqrt(HUMAN.upperArm**2+HUMAN.forearm**2+2*HUMAN.upperArm*HUMAN.forearm*Math.cos(HUMAN.elbowFlexLimit));
    const direction=targetInRoot.clone().sub(shoulder).normalize();if(direction.lengthSq()<.01)direction.copy(DOWN);
    const effective=shoulder.clone().addScaledVector(direction,THREE.MathUtils.clamp(requestedDistance,minimum+.00001,reachLimit));
    const sign=side==='left'?-1:1,pole=poleInRoot?.clone()??new THREE.Vector3(sign*.28,.25,-.10);
    if(!options.allowRaisedElbow)pole.y=Math.min(pole.y,shoulder.y-.05);
    let solution=solveTwoBone(shoulder,effective,pole,HUMAN.upperArm,HUMAN.forearm);
    if(!options.allowRaisedElbow&&solution.joint.y>shoulder.y) {pole.y=shoulder.y-.45;solution=solveTwoBone(shoulder,effective,pole,HUMAN.upperArm,HUMAN.forearm);}
    orientChain(arm.upper,arm.forearm,group,solution.root,solution.joint,solution.end);
    group.updateWorldMatrix(true,true);
    const desiredWorld=group.getWorldQuaternion(new THREE.Quaternion()).multiply(options.palmQuaternion??IDENTITY);
    // Radius/ulna pronation rotates around the forearm's own long axis. It
    // changes palm orientation without moving the elbow or wrist endpoint.
    // Absorb that twist here rather than bending a wrist through 180 degrees.
    const untwisted=arm.forearm.quaternion.clone();
    let bestTwist=0,bestScore=Infinity;
    const local=new THREE.Quaternion(),delta=new THREE.Quaternion(),euler=new THREE.Euler();
    local.copy(arm.forearm.getWorldQuaternion(new THREE.Quaternion())).invert().multiply(desiredWorld);
    delta.copy(HAND_BIND).invert().multiply(local);euler.setFromQuaternion(delta,'XYZ');
    const needsPronation=Math.max(Math.abs(euler.x),Math.abs(euler.y),Math.abs(euler.z))>HUMAN.wristLimit;
    // The analytic elbow frame has no fixed anatomical roll zero. During a
    // cross-table grip search the full reference circle, retaining wrist limits.
    const referenceSteps=options.fullGrip?24:12;
    for(let step=-referenceSteps;needsPronation&&step<=referenceSteps;step++) {
      const twist=step*Math.PI/24;
      arm.forearm.quaternion.copy(untwisted).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),twist));
      local.copy(arm.forearm.getWorldQuaternion(new THREE.Quaternion())).invert().multiply(desiredWorld);
      delta.copy(HAND_BIND).invert().multiply(local);euler.setFromQuaternion(delta,'XYZ');
      const score=Math.max(Math.abs(euler.x),Math.abs(euler.y),Math.abs(euler.z)) + Math.abs(twist)*.04;
      if(score<bestScore) {bestScore=score;bestTwist=twist;}
    }
    arm.forearm.quaternion.copy(untwisted).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),bestTwist));
    arm.forearm.userData.pronation=bestTwist;
    local.copy(arm.forearm.getWorldQuaternion(new THREE.Quaternion())).invert().multiply(desiredWorld);
    delta.copy(HAND_BIND).invert().multiply(local);euler.setFromQuaternion(delta,'XYZ');
    const before=[euler.x,euler.y,euler.z];
    euler.set(...before.map(value=>THREE.MathUtils.clamp(value,-HUMAN.wristLimit,HUMAN.wristLimit)) as [number,number,number]);
    arm.hand.quaternion.copy(HAND_BIND).multiply(new THREE.Quaternion().setFromEuler(euler));
    arm.hand.userData.wristAngles=[euler.x,euler.y,euler.z];
    group.updateWorldMatrix(true,true);
    const elbow=rootPosition(arm.forearm),wrist=rootPosition(arm.hand);
    const u=shoulder.clone().sub(elbow).normalize(),v=wrist.clone().sub(elbow).normalize();
    arm.diagnostics={requestedDistance,targetDistance:shoulder.distanceTo(wrist),reachLimit,relocateRequired:requestedDistance>reachLimit+.0001||requestedDistance<minimum-.0001,
      elbowAngle:THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(u.dot(v),-1,1))),shoulder,elbow,wrist,wristLimited:before.some((value,index)=>Math.abs(value-[euler.x,euler.y,euler.z][index])>.001)};
    arm.hand.userData.reach=arm.diagnostics;
    return arm.diagnostics;
  }
  function setStandingHeight(height:number) {
    group.position.y=height;group.updateWorldMatrix(true,true);
    for(const side of ['left','right'] as const) {
      const leg=legs[side],a=rootPosition(leg.thigh),target=new THREE.Vector3(a.x,-height,.015),pole=new THREE.Vector3(a.x,-height*.45,.5);
      const p=solveTwoBone(a,target,pole,HUMAN.thigh,HUMAN.shin);orientChain(leg.thigh,leg.shin,group,p.root,p.joint,p.end,Math.PI*.9);
      group.updateWorldMatrix(true,true);leg.foot.quaternion.copy(leg.shin.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(group.getWorldQuaternion(new THREE.Quaternion()));
    }
  }
  function pose(name:PoseName,time=0) {
    const data=POSES[name];spine.rotation.set(...data.spine);chest.rotation.set(0,0,0);neck.rotation.set(0,0,0);head.rotation.set(...data.head);
    for(const side of ['left','right'] as const) {
      const arm=arms[side],a=data[side];arm.shoulder.rotation.set(0,0,0);arm.upper.rotation.set(...a.upper);arm.forearm.rotation.set(...a.forearm);
      const leg=legs[side];leg.thigh.rotation.set(data.seated?-Math.PI/2:0,0,0);leg.shin.rotation.set(data.seated?Math.PI/2:0,0,0);leg.foot.rotation.set(0,0,0);
      solveHand(side,new THREE.Vector3(...a.target),new THREE.Vector3(...a.pole),{lean:false,allowRaisedElbow:data.raisedElbow,palmQuaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(...a.wrist))});
      setGrip(side,a.grip??.1,name==='self-shot'?.8:0,name==='self-shot'?1:0);
    }
    if(data.walk) {
      for(const side of ['left','right'] as const) {const sign=side==='left'?-1:1,swing=Math.sin(time*6)*sign;legs[side].thigh.rotation.x=swing*.22;legs[side].shin.rotation.x=Math.max(0,-swing)*.32;legs[side].foot.rotation.x=-legs[side].thigh.rotation.x-legs[side].shin.rotation.x;arms[side].upper.rotation.x-=swing*.22;}
    }
    coat?.update();group.userData.pose=name;group.updateWorldMatrix(true,true);
  }
  function constrainFingers(){for(const arm of Object.values(arms)){for(const chain of [...arm.fingers,arm.thumb])for(const digit of chain){digit.rotation.x=THREE.MathUtils.clamp(digit.rotation.x,-Math.PI/2,-.015);digit.rotation.z=0;}}}
  function setFirstPerson(enabled:boolean) {bodyMeshes.forEach(item=>item.visible=!enabled);head.visible=!enabled;for(const leg of Object.values(legs))leg.thigh.visible=!enabled;}
  setRoom(activeRoom);pose(role==='host'?'host-idle':role==='guard'?'guard-walking':'seated-resting');
  return {updateCoat:()=>coat?.update(),group,pelvis,spine,chest,neck,head,arms,legs,bodyMeshes,skinMaterial:flesh,clothingMaterial:cloth,pose,solveHand,setGrip,leanToward,setRoom,setFirstPerson,constrainFingers,setStandingHeight,crouch:(drop:number)=>setStandingHeight(.9-THREE.MathUtils.clamp(drop,0,.25))};
}
export type HumanRig=ReturnType<typeof createCharacter>;
