export type MixState={active:boolean;fired:number;room:number;progress:number;holding:boolean;hesitating:boolean;stress:number;nervous:boolean;speaking:boolean};
export const tensionMix=(s:MixState)=>({ambient:s.progress>=.85?0:Math.max(0,1-s.progress/.85),pitch:35+Math.min(5,s.fired)*3,drone:.012+Math.min(5,s.fired)*.008});
/** Click-created audio buses and cosmetic audio-clock scheduling; no game RNG. */
export class SoundStage {
 readonly effects:GainNode;readonly voices:GainNode;readonly ambient:GainNode;readonly hearing:BiquadFilterNode;
 private drone:OscillatorNode[]=[];private droneGain:GainNode;private breathing:GainNode;private tinnitus:GainNode;
 private nextBreath=0;private nextHuman=0;private quietUntil=0;private wasHesitating=false;private phase=0;
 private levels={master:1,effects:1,voice:1};private targetMaster:GainNode;
 constructor(private ctx:AudioContext,master:GainNode,output:AudioNode){
  this.targetMaster=master;this.effects=ctx.createGain();this.voices=ctx.createGain();this.ambient=ctx.createGain();this.hearing=ctx.createBiquadFilter();this.hearing.type='lowpass';this.hearing.frequency.value=19000;this.hearing.Q.value=.5;
  for(const b of [this.effects,this.voices])b.connect(this.hearing);this.ambient.connect(this.effects);this.hearing.connect(master);
  const limiter=ctx.createWaveShaper(),curve=new Float32Array(16385);for(let i=0;i<curve.length;i++)curve[i]=.9*Math.tanh((i/(curve.length-1)*2-1)*2);limiter.curve=curve;
  if(typeof ctx.createDynamicsCompressor==='function'){const c=ctx.createDynamicsCompressor();c.threshold.value=-10;c.knee.value=6;c.ratio.value=12;c.attack.value=.001;c.release.value=.18;output.connect(c);c.connect(limiter);}else output.connect(limiter);
  limiter.connect(ctx.destination);
  this.droneGain=ctx.createGain();this.droneGain.gain.value=0;this.droneGain.connect(this.ambient);
  for(const f of [35,35.7,52.3]){const o=ctx.createOscillator();o.type='sine';o.frequency.value=f;o.connect(this.droneGain);o.start();this.drone.push(o);}
  this.breathing=ctx.createGain();this.breathing.connect(this.effects);this.tinnitus=ctx.createGain();this.tinnitus.connect(master);
 }
 position(source:AudioNode,x:number,z:number,destination:AudioNode){const p=this.ctx.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=1;p.positionX.value=x;p.positionY.value=0;p.positionZ.value=z;source.connect(p);p.connect(destination);return p;}
 volumes(levels:{master:number;effects:number;voice:number},muted=false){this.levels=levels;const t=this.ctx.currentTime;this.targetMaster.gain.setTargetAtTime(muted?0:.6*levels.master,t,.015);this.effects.gain.setTargetAtTime(levels.effects,t,.015);this.voices.gain.setTargetAtTime(levels.voice,t,.015);this.tinnitus.gain.value=levels.effects;}
 private noise(start:number,duration:number,volume:number,frequency:number,destination:AudioNode){const b=this.ctx.createBuffer(1,Math.ceil(duration*this.ctx.sampleRate),this.ctx.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++){const r=Math.sin((i+1)*78.233+this.phase++)*43758.5453;a[i]=((r-Math.floor(r))*2-1)*.7;};const s=this.ctx.createBufferSource(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();s.buffer=b;f.type='bandpass';f.frequency.value=frequency;f.Q.value=.7;g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(volume,start+duration*.3);g.gain.exponentialRampToValueAtTime(.0001,start+duration);s.connect(f);f.connect(g);g.connect(destination);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};s.start(start);s.stop(start+duration);}
 update(s:MixState){const t=this.ctx.currentTime,m=tensionMix(s);this.ambient.gain.setTargetAtTime(t<this.quietUntil?0:s.active?m.ambient:0,t,s.progress>0||t<this.quietUntil?.02:.7);this.droneGain.gain.setTargetAtTime(s.active?m.drone*(s.speaking?.6:1):0,t,.5);this.drone.forEach((o,i)=>o.frequency.setTargetAtTime(m.pitch*[1,1.02+s.fired*.002,1.495][i],t,.5));
  this.voices.gain.setTargetAtTime(this.levels.voice*(s.progress>=.85?0:1),t,.04);
  this.breathing.gain.setTargetAtTime(s.active&&!s.holding?1:0,t,.04);
  if(s.active&&!s.holding&&t>=this.nextBreath){this.noise(t,.9,.025,420,this.breathing);this.nextBreath=t+Math.max(1.15,3.5-s.fired*.3);}
  if(s.active&&s.stress>.25&&t>=this.nextHuman){const g=this.ctx.createGain(),p=this.position(g,0,-1.9,this.ambient);this.noise(t,.35,.012+s.stress*.018,s.nervous?1650:600,g);if(s.nervous&&s.stress>.65)for(let i=0;i<5;i++)this.noise(t+i*.06,.025,.012,2300,g);setTimeout(()=>{g.disconnect();p.disconnect();},1500);this.nextHuman=t+Math.max(1.4,6-s.stress*4);}
  if(s.hesitating&&!this.wasHesitating){const g=this.ctx.createGain(),p=this.position(g,0,-1.9,this.ambient);for(let i=0;i<5;i++)this.noise(t+i*.18,.14,.018,260+i*23,g);setTimeout(()=>{g.disconnect();p.disconnect();},1800);}this.wasHesitating=s.hesitating;
 }
 empty(){const t=this.ctx.currentTime;this.quietUntil=t+1;this.ambient.gain.cancelScheduledValues(t);this.ambient.gain.setValueAtTime(0,t);this.noise(t+1,1.8,.05,390,this.effects);}
 deafen(){const t=this.ctx.currentTime;this.hearing.frequency.cancelScheduledValues(t);this.hearing.frequency.setValueAtTime(19000,t);this.hearing.frequency.exponentialRampToValueAtTime(650,t+.04);this.hearing.frequency.exponentialRampToValueAtTime(19000,t+5);const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.setValueAtTime(4800,t);o.frequency.linearRampToValueAtTime(4600,t+5);g.gain.setValueAtTime(.025,t);g.gain.exponentialRampToValueAtTime(.0001,t+5);const wobble=this.ctx.createOscillator(),depth=this.ctx.createGain();wobble.frequency.value=4.5;depth.gain.value=7;wobble.connect(depth);depth.connect(o.detune);wobble.start(t);wobble.stop(t+5.1);o.connect(g);g.connect(this.tinnitus);o.onended=()=>{o.disconnect();g.disconnect();wobble.disconnect();depth.disconnect();};o.start(t);o.stop(t+5.1);}
}
