import * as T from 'three';
/** A single draped surface, with smooth normals and no stacked torso slabs. */
export function createHostCoat(pelvis:T.Object3D,spine:T.Object3D){
 const rings=20,sides=32,vertices:number[]=[],indices:number[]=[];
 for(let j=0;j<=rings;j++){const t=j/rings,y=-.40+t*.99,w=T.MathUtils.lerp(.275,.19,T.MathUtils.smoothstep(t,.35,.75)),depth=T.MathUtils.lerp(.29,.115,T.MathUtils.smoothstep(t,.35,.8)),drape=.18*(1-T.MathUtils.smoothstep(t,.25,.65));for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,fold=1+.040*Math.sin(a*7+t*3)+.018*Math.sin(a*17-t*5);vertices.push(Math.cos(a)*w*fold,y,Math.sin(a)*depth*fold+drape);if(j<rings&&i<sides){const n=j*sides+i,r=j*sides+(i+1)%sides;indices.push(n,n+sides,r,r,n+sides,r+sides);}}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
 const coat=new T.Mesh(g,new T.MeshStandardMaterial({color:0x121816,roughness:.96,side:T.DoubleSide}));coat.name='Continuous seated Host coat';coat.castShadow=true;pelvis.add(coat);
 const base=vertices.slice(),v=new T.Vector3(),pivot=new T.Vector3(0,.14,0);
 return {coat,update(){const a=g.attributes.position;for(let i=0;i<a.count;i++){v.fromArray(base,i*3);const weight=T.MathUtils.smoothstep(v.y,.02,.44),b=v.clone().sub(pivot).applyQuaternion(spine.quaternion).add(pivot);v.lerp(b,weight);a.setXYZ(i,v.x,v.y,v.z);}a.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();}};
}
const sq=(n:number)=>n*n;
/** Worn off-white porcelain look with grime collecting around the eyes and one hairline crack. */
function maskTexture():T.Texture|null{
 // Headless tests and DOM-less environments simply get the plain material colour.
 if(typeof document==='undefined')return null;
 const c=document.createElement('canvas');c.width=128;c.height=160;const g=c.getContext('2d');
 if(!g||typeof g.createRadialGradient!=='function'||typeof g.fillRect!=='function')return null;
 const base=g.createRadialGradient(64,70,8,64,80,92);base.addColorStop(0,'#d8d3bf');base.addColorStop(.7,'#bdb7a0');base.addColorStop(1,'#8d8873');g.fillStyle=base;g.fillRect(0,0,128,160);
 for(let i=0;i<260;i++){const x=(i*53+17)%128,y=(i*97+31)%160;g.fillStyle=`rgba(60,52,38,${.03+(i%5)*.012})`;g.fillRect(x,y,1+(i%3),1);}
 for(const x of [42,86]){const r=g.createRadialGradient(x,66,2,x,66,20);r.addColorStop(0,'rgba(40,34,26,.55)');r.addColorStop(1,'rgba(40,34,26,0)');g.fillStyle=r;g.fillRect(x-22,44,44,44);}
 g.strokeStyle='rgba(48,40,30,.75)';g.lineWidth=1;g.beginPath();g.moveTo(80,8);g.lineTo(76,30);g.lineTo(83,44);g.lineTo(79,58);g.stroke();
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.magFilter=T.NearestFilter;t.minFilter=T.NearestFilter;t.generateMipmaps=false;return t;
}
/**
 * A real 3D mask (convex oval shell with brow ridge, nose and cheeks) whose almond eye holes are pure black,
 * recessed inside a soft, irregular cloth hood with a pitch-black interior. No drawn lines, no mouth.
 */
export function createHostMask(head:T.Object3D){
 const cloth=new T.MeshStandardMaterial({color:0x101614,roughness:1,side:T.DoubleSide});
 const voidMat=new T.MeshBasicMaterial({color:0x000000,side:T.DoubleSide});
 // Hood: a sphere opened at the front, then sculpted: drooping peak, soft uneven rim, folds, cowl over the shoulders.
 const hoodGeo=new T.SphereGeometry(1,40,28,Math.PI*.80,Math.PI*1.40,0,Math.PI*.92);
 const pos=hoodGeo.attributes.position,v=new T.Vector3();
 for(let i=0;i<pos.count;i++){
  v.fromBufferAttribute(pos,i);
  const front=Math.max(0,v.z),angle=Math.atan2(v.x,v.z),fold=1+.035*Math.sin(angle*9+v.y*5)+.02*Math.sin(angle*23);
  let x=v.x*.112*fold,y=v.y*.150,z=v.z*.128*fold;
  if(v.y>.35&&front>.2){z+=.030*front*(v.y-.35);y-=.022*front;}            // peak droops forward over the brow
  if(v.y<-.25){const flare=(-.25-v.y)*.55;x*=1+flare;z*=1+flare*.6;}         // cowl spreads onto the shoulders
  pos.setXYZ(i,x,y,z);
 }
 hoodGeo.computeVertexNormals();
 const hood=new T.Mesh(hoodGeo,cloth);hood.name='Deep Host hood';hood.position.set(0,.010,-.004);hood.castShadow=true;head.add(hood);
 const innerGeo=new T.SphereGeometry(1,16,12);innerGeo.scale(.090,.122,.055);const inner=new T.Mesh(innerGeo,voidMat);inner.position.set(0,.006,-.045);inner.name='Hood darkness';head.add(inner);
 // Mask shell: front part of a sphere, flattened into a face-shaped oval.
 const shell=new T.SphereGeometry(1,28,24,Math.PI*.5-1.05,2.10,.30,2.45);
 const sp=shell.attributes.position;
 for(let i=0;i<sp.count;i++){
  v.fromBufferAttribute(sp,i);
  let x=v.x*.066,y=v.y*.094,z=v.z*.040;
  if(y<-.03)x*=1-(-.03-y)*2.2;                                                 // narrower jaw
  z+=.010*Math.exp(-sq((y-.030)/.012))*(1-Math.min(1,Math.abs(x)/.06));       // brow ridge
  z+=.016*Math.exp(-sq(x/.010)-sq((y+.006)/.024));                           // nose
  z+=.005*Math.exp(-sq((Math.abs(x)-.032)/.014)-sq((y+.020)/.014));          // cheekbones
  sp.setXYZ(i,x,y,z);
 }
 shell.computeVertexNormals();
 const maskMap=maskTexture();
 const mask=new T.Mesh(shell,new T.MeshStandardMaterial({map:maskMap,color:maskMap?0xffffff:0xc9c4ae,roughness:.78,emissive:0x2a2822,emissiveIntensity:.25}));
 mask.name='Featureless Host mask';mask.userData.flatFace=false;mask.userData.realMask=true;mask.position.set(0,-.004,.012);mask.castShadow=true;head.add(mask);
 // Almond eye holes: pure black, sitting on the shell surface so they read as openings into the dark hood.
 const almond=new T.Shape();almond.moveTo(-.015,0);almond.quadraticCurveTo(0,.0085,.015,.001);almond.quadraticCurveTo(0,-.0055,-.015,0);
 const eyeGeo=new T.ShapeGeometry(almond,8);
 for(const side of [-1,1]){
  // Mirrored geometry (not a negative scale) keeps every object at unit scale.
  const geo=side<0?eyeGeo:eyeGeo.clone().scale(-1,1,1);
  const eye=new T.Mesh(geo,voidMat);eye.name='Hollow mask eye';eye.position.set(side*.026,.012,.012+.0395);eye.rotation.set(-.10,side*.32,side*-.10);head.add(eye);
 }
 return {mask,hood};
}
