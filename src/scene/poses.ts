/** Numeric authored rotations (radians), wrist targets and elbow poles, in pelvis space.
 * IK refines upper/forearm rotations; geometry and joint offsets are immutable.
 */
export const HUMAN = { seatHeight:.45, tableHeight:.75, shoulderWidth:.40, shoulderHeight:.58,
  upperArm:.30, forearm:.27, hand:.18, palm:.10, fingers:.08, thigh:.45, shin:.45, foot:.25, head:.23,
  reachRatio:.9, leanLimit:25*Math.PI/180, elbowFlexLimit:150*Math.PI/180, wristLimit:70*Math.PI/180 } as const;
export type Triple = readonly [number,number,number];
export type ArmPose = { upper:Triple; forearm:Triple; wrist:Triple; target:Triple; pole:Triple; grip?:number };
export type JointPose = { seated:boolean; spine:Triple; head:Triple; left:ArmPose; right:ArmPose; raisedElbow?:boolean; walk?:boolean };
const arm = (side:number,target:Triple,grip=0):ArmPose => ({upper:[-.08,0,side*.08],forearm:[1.35,0,0],wrist:[0,0,0],target,pole:[side*.38,.25,-.10],grip});
const seated = (spine:Triple=[0,0,0]):JointPose => ({seated:true,spine,head:[0,0,0],left:arm(-1,[-.10,.315,.35],.12),right:arm(1,[.10,.315,.35],.12)});
const standing = ():JointPose => ({seated:false,spine:[0,0,0],head:[0,0,0],left:arm(-1,[-.06,.10,.07],.12),right:arm(1,[.06,.10,.07],.12)});
export const POSES = {
  'seated-resting':seated(),
  talking:{...seated(),head:[.025,-.025,.01] as Triple},
  'reaching-cards':{...seated([.18,0,0]),right:arm(1,[.10,.315,.48],.06)},
  'holding-revolver':{...seated([.05,0,0]),right:{...arm(1,[.13,.36,.32],1),wrist:[-.65,0,.12] as Triple}},
  'self-shot':{...seated(),raisedElbow:true,right:{...arm(1,[.331,.6333641386247653,.076],1),pole:[.5,.2,-.25] as Triple,wrist:[-2*Math.PI/3,0,Math.PI/2] as Triple}},
  'host-idle':seated(),
  'host-dealing':{...seated(),spine:[.24,0,0] as Triple,right:{...arm(1,[.10,.315,.35],.15),wrist:[1.1,0,0] as Triple}},
  'host-sliding':{...seated(),spine:[.32,0,0] as Triple,right:{...arm(1,[.10,.315,.40],.30),wrist:[1.1,0,0] as Triple}},
  'guard-walking':{...standing(),walk:true,left:{...arm(-1,[-.22,.075,0]),wrist:[1.1,0,0] as Triple},right:{...arm(1,[.22,.075,0]),wrist:[1.1,0,0] as Triple}},
  'player-card-hand':{...seated(),left:{...arm(-1,[-.10,.35,.38],.7),wrist:[-.22,0,.16] as Triple}},
  'player-hold-to-pull':{...seated(),right:{...arm(1,[.12,.40,.38],1),wrist:[-.3,0,0] as Triple}},
} satisfies Record<string,JointPose>;
export type PoseName = keyof typeof POSES;
export const POSE_NAMES = Object.keys(POSES) as PoseName[];
export type DebugPoseName = `reaction-${import('../reactions').ReactionKind}` | PoseName | 'host-forced-shot' | 'player-peek' | 'hood-on' | 'hood-mid-removal' | 'hood-off' | 'player-empty-hand' | 'host-open-hand' | 'host-speaking' | 'host-seated' | 'opponent-card-hand' | 'pickup-player' | 'pickup-ai' | 'pickup-host' | 'gaze-test';
