import { describe, it, expect } from 'vitest';
import type { AnimationTimeline } from '@autometa/timeline-engine';
import { calculateRenderState } from '../index';

const timelineOf = (keyframes: AnimationTimeline['keyframes']): AnimationTimeline => ({
  duration: keyframes.reduce((max, kf) => Math.max(max, kf.startTime + kf.duration), 0),
  keyframes,
});

describe('calculateRenderState', () => {
  it('returns empty defaults for a timeline with no keyframes', () => {
    const state = calculateRenderState({ duration: 0, keyframes: [] }, 0);
    expect(state).toEqual({ nodes: {}, edges: {}, status: null, symbolIndex: 0 });
  });

  it('interpolates NODE_GLOW progress and the sinusoidal scale bump mid-keyframe', () => {
    const timeline = timelineOf([
      { id: 'kf-1', startTime: 0, duration: 100, type: 'NODE_GLOW', targetId: 's0' },
    ]);
    const state = calculateRenderState(timeline, 50);
    expect(state.nodes.s0.glow).toBeCloseTo(0.5);
    expect(state.nodes.s0.scale).toBeCloseTo(1 + 0.15 * Math.sin(0.5 * Math.PI));
    expect(state.nodes.s0.pulse).toBe(true);
  });

  it('clamps progress to 1 at the exact end of a keyframe', () => {
    const timeline = timelineOf([
      { id: 'kf-1', startTime: 0, duration: 100, type: 'NODE_GLOW', targetId: 's0' },
    ]);
    const state = calculateRenderState(timeline, 100);
    expect(state.nodes.s0.glow).toBeCloseTo(1);
  });

  it('lights up every id in an ACTIVE_STATES_UPDATE keyframe', () => {
    const timeline = timelineOf([
      { id: 'kf-1', startTime: 0, duration: 100, type: 'ACTIVE_STATES_UPDATE', activeIds: ['s0', 's1'] },
    ]);
    const state = calculateRenderState(timeline, 10);
    expect(state.nodes.s0).toEqual({ glow: 0.8, scale: 1.05, pulse: false });
    expect(state.nodes.s1).toEqual({ glow: 0.8, scale: 1.05, pulse: false });
  });

  it('marks an edge active with traversal progress during EDGE_TRAVERSAL', () => {
    const timeline = timelineOf([
      { id: 'kf-1', startTime: 0, duration: 200, type: 'EDGE_TRAVERSAL', targetId: 'e0' },
    ]);
    const state = calculateRenderState(timeline, 100);
    expect(state.edges.e0).toEqual({ active: true, traversalProgress: 0.5 });
  });

  it('reports accepted/rejected status from STATUS_FLASH and highlights active ids', () => {
    const timeline = timelineOf([
      { id: 'kf-1', startTime: 0, duration: 100, type: 'STATUS_FLASH', status: 'accepted', activeIds: ['s2'] },
    ]);
    const state = calculateRenderState(timeline, 0);
    expect(state.status).toBe('accepted');
    expect(state.nodes.s2.glow).toBe(1);
  });

  it('dims the glow for a rejected STATUS_FLASH', () => {
    const timeline = timelineOf([
      { id: 'kf-1', startTime: 0, duration: 100, type: 'STATUS_FLASH', status: 'rejected', activeIds: ['s2'] },
    ]);
    const state = calculateRenderState(timeline, 0);
    expect(state.status).toBe('rejected');
    expect(state.nodes.s2.glow).toBe(0.5);
  });

  it('sets shake on NODE_SHAKE while preserving a prior visual state for the same node', () => {
    const timeline = timelineOf([
      { id: 'kf-glow', startTime: 0, duration: 100, type: 'NODE_GLOW', targetId: 's0' },
      { id: 'kf-shake', startTime: 0, duration: 100, type: 'NODE_SHAKE', activeIds: ['s0'] },
    ]);
    const state = calculateRenderState(timeline, 50);
    expect(state.nodes.s0.shake).toBe(true);
    // NODE_GLOW's glow/scale for the same node/time should still be present.
    expect(state.nodes.s0.glow).toBeCloseTo(0.5);
  });

  it('applies a default visual state for NODE_SHAKE when no prior keyframe touched the node', () => {
    const timeline = timelineOf([
      { id: 'kf-shake', startTime: 0, duration: 100, type: 'NODE_SHAKE', activeIds: ['s9'] },
    ]);
    const state = calculateRenderState(timeline, 10);
    expect(state.nodes.s9).toEqual({ glow: 0, scale: 1, pulse: false, shake: true });
  });

  it('tracks symbolIndex from whichever active keyframe carries it', () => {
    const timeline = timelineOf([
      { id: 'kf-1', startTime: 0, duration: 100, type: 'NODE_GLOW', targetId: 's0', symbolIndex: 3 },
    ]);
    const state = calculateRenderState(timeline, 10);
    expect(state.symbolIndex).toBe(3);
  });

  it('falls back to the last keyframe when the playhead has moved past the timeline duration', () => {
    const timeline = timelineOf([
      { id: 'kf-1', startTime: 0, duration: 100, type: 'STATUS_FLASH', status: 'accepted', activeIds: ['s0'] },
    ]);
    const state = calculateRenderState(timeline, 5000);
    expect(state.status).toBe('accepted');
    expect(state.nodes.s0.glow).toBe(1);
  });

  it('interpolates NODE_MORPH, NODE_ROTATE, and NODE_FADE independently', () => {
    const morphTimeline = timelineOf([{ id: 'kf-morph', startTime: 0, duration: 100, type: 'NODE_MORPH', targetId: 's0' }]);
    expect(calculateRenderState(morphTimeline, 50).nodes.s0.morph).toBeCloseTo(0.5);

    const rotateTimeline = timelineOf([{ id: 'kf-rotate', startTime: 0, duration: 100, type: 'NODE_ROTATE', targetId: 's0' }]);
    expect(calculateRenderState(rotateTimeline, 50).nodes.s0.rotate).toBeCloseTo(180);

    const fadeTimeline = timelineOf([{ id: 'kf-fade', startTime: 0, duration: 100, type: 'NODE_FADE', targetId: 's0' }]);
    expect(calculateRenderState(fadeTimeline, 25).nodes.s0.fade).toBeCloseTo(0.75);
  });

  it('returns empty state when the playhead sits before any keyframe starts', () => {
    const timeline = timelineOf([
      { id: 'kf-1', startTime: 500, duration: 100, type: 'NODE_GLOW', targetId: 's0' },
    ]);
    const state = calculateRenderState(timeline, 0);
    expect(state).toEqual({ nodes: {}, edges: {}, status: null, symbolIndex: 0 });
  });
});
