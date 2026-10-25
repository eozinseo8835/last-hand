import * as T from 'three';
/** A single draped surface, with smooth normals and no stacked torso slabs. */
export function createHostCoat(pelvis:T.Object3D,spine:T.Object3D){
 const rings=20,sides=32,vertices:number[]=[],indices:number[]=[];
 for(let j=0;j<=rings;j++){const t=j/rings,y=-.40+t*.99,w=T.MathUtils.lerp(.275,.19,T.MathUtils.smoothstep(t,.35,.75)),depth=T.MathUtils.lerp(.29,.115,T.MathUtils.smoothstep(t,.35,.8)),drape=.18*(1-T.MathUtils.smoothstep(t,.25,.65));for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,fold=1+.022*Math.sin(a*7+t*3);vertices.push(Math.cos(a)*w*fold,y,Math.sin(a)*depth*fold+drape);if(j<rings&&i<sides){const n=j*sides+i,r=j*sides+(i+1)%sides;indices.push(n,n+sides,r,r,n+sides,r+sides);}}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
 const coat=new T.Mesh(g,new T.MeshStandardMaterial({color:0x17201e,roughness:.93,side:T.DoubleSide}));coat.name='Continuous seated Host coat';coat.castShadow=true;pelvis.add(coat);
 const base=vertices.slice(),v=new T.Vector3(),pivot=new T.Vector3(0,.14,0);
 return {coat,update(){const a=g.attributes.position;for(let i=0;i<a.count;i++){v.fromArray(base,i*3);const weight=T.MathUtils.smoothstep(v.y,.02,.44),b=v.clone().sub(pivot).applyQuaternion(spine.quaternion).add(pivot);v.lerp(b,weight);a.setXYZ(i,v.x,v.y,v.z);}a.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();}};
}
export function createHostMask(head:T.Object3D){
 const dark=new T.MeshStandardMaterial({color:0x111917,roughness:1,side:T.DoubleSide});
 const hoodGeo=new T.SphereGeometry(1,32,20,Math.PI*.85,Math.PI*1.3,0,Math.PI*.96);hoodGeo.scale(.126,.185,.126);
 const hood=new T.Mesh(hoodGeo,dark);hood.name='Deep Host hood';hood.position.y=.012;head.add(hood);
 const s=new T.Shape();s.moveTo(0,.102);s.bezierCurveTo(.068,.10,.078,.025,.055,-.055);s.bezierCurveTo(.035,-.10,-.035,-.10,-.055,-.055);s.bezierCurveTo(-.078,.025,-.068,.10,0,.102);
 for(const x of [-.043,.015]){const hole=new T.Path();hole.moveTo(x,.025);hole.lineTo(x+.028,.025);hole.lineTo(x+.028,.032);hole.lineTo(x,.032);hole.closePath();s.holes.push(hole);}
 const g=new T.ExtrudeGeometry(s,{depth:.004,bevelEnabled:true,bevelSize:.0015,bevelThickness:.001,bevelSegments:2,curveSegments:24});
 const mask=new T.Mesh(g,new T.MeshStandardMaterial({color:0xc9c9b8,roughness:.83}));mask.name='Featureless Host mask';mask.userData.flatFace=true;mask.position.z=.048;head.add(mask);
 const ridge=new T.Mesh(new T.ConeGeometry(.010,.048,4),mask.material);ridge.name='Subtle mask nose ridge';ridge.rotation.x=Math.PI/2;ridge.position.set(0,-.002,.055);head.add(ridge);
 return {mask,hood};
}
