// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { measurePose, POSE_CASES, poseSelection } from './PoseViewer';

describe('development production-pose inspection', () => {
  it('retains all original pose cases and adds the forced-shot and PEEK regressions', () => {
    expect(POSE_CASES).toHaveLength(50);
    for (const room of [1,2,3]) expect(POSE_CASES.filter(item=>item.room===room&&!item.pose.startsWith('host-')&&!item.pose.startsWith('guard-')&&!item.pose.startsWith('player-')&&!item.pose.startsWith('hood-')&&!item.pose.startsWith('pickup-')&&!item.pose.startsWith('reaction-')&&!['opponent-card-hand','gaze-test'].includes(item.pose))).toHaveLength(5);
    expect(new Set(POSE_CASES.map(item=>`${item.room}:${item.pose}`)).size).toBe(50);
    expect(poseSelection('?pose=host-forced-shot')).toMatchObject({pose:'host-forced-shot'});
    expect(poseSelection('?pose=player-peek')).toMatchObject({pose:'player-peek'});
  });
  it('accepts reproducible query controls and rejects unknown pose names', () => {
    expect(poseSelection('?debug=poses&pose=self-shot&room=3&view=side&pixel=1&time=2')).toMatchObject({pose:'self-shot',room:3,view:'side',pixel:true,time:2});
    expect(poseSelection('?pose=unknown&room=NaN&view=back')).toMatchObject({pose:'seated-resting',room:1,view:'front',pixel:false});
  });
  it('measures segment geometry instead of printing unconditional pass labels', () => {
    const target=new THREE.Group(), gun=new THREE.Group();
    const bone=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.30,6),new THREE.MeshStandardMaterial());
    bone.userData={skeletonSegment:true,restLength:.30,axis:'y'}; target.add(bone); target.updateMatrixWorld(true);
    const selection=poseSelection('');
    const clean=measurePose(undefined,target,gun,selection);
    expect(clean.measuredSegments).toBe(1); expect(clean.fixedLengths).toBe(true);
    bone.scale.y=1.2; target.updateMatrixWorld(true);
    const broken=measurePose(undefined,target,gun,selection);
    expect(broken.fixedLengths).toBe(false); expect(broken.unitScales).toBe(false); expect(broken.maxLengthError).toBeCloseTo(.06);
  });
});
