import type { AnimationTimeline } from '@autometa/timeline-engine';

export interface NodeVisualState {
  glow: number;          // 0 to 1
  scale: number;         // 1 to 1.2
  pulse: boolean;
  shake?: boolean;
  morph?: number;
  rotate?: number;
  fade?: number;
}

export interface EdgeVisualState {
  active: boolean;
  traversalProgress: number; // 0 to 1
}

export interface RenderState {
  nodes: Record<string, NodeVisualState>;
  edges: Record<string, EdgeVisualState>;
  status: 'accepted' | 'rejected' | null;
  symbolIndex: number;
}

/**
 * Calculates the interpolated visual state of all nodes and edges
 * for a given playhead position (in milliseconds).
 */
export const calculateRenderState = (
  timeline: AnimationTimeline,
  playheadTime: number
): RenderState => {
  const nodes: Record<string, NodeVisualState> = {};
  const edges: Record<string, EdgeVisualState> = {};
  let status: 'accepted' | 'rejected' | null = null;
  let symbolIndex = 0;

  // Find all keyframes that intersect with playheadTime
  const activeKeyframes = timeline.keyframes.filter(
    kf => playheadTime >= kf.startTime && playheadTime <= kf.startTime + kf.duration
  );

  // Fallback: use last keyframe if playhead is beyond the timeline duration
  if (activeKeyframes.length === 0 && timeline.keyframes.length > 0 && playheadTime > timeline.duration) {
    const lastKf = timeline.keyframes[timeline.keyframes.length - 1];
    activeKeyframes.push(lastKf);
  }

  // Iterate over active keyframes and interpolate values
  activeKeyframes.forEach(kf => {
    const elapsed = playheadTime - kf.startTime;
    const rawProgress = kf.duration > 0 ? elapsed / kf.duration : 1;
    const progress = Math.min(Math.max(rawProgress, 0), 1); // Clamp to [0, 1]

    if (kf.symbolIndex !== undefined) {
      symbolIndex = kf.symbolIndex;
    }

    switch (kf.type) {
      case 'NODE_GLOW':
        if (kf.targetId) {
          const scaleOffset = 0.15 * Math.sin(progress * Math.PI);
          nodes[kf.targetId] = {
            glow: progress,
            scale: 1 + scaleOffset,
            pulse: true,
          };
        }
        break;

      case 'ACTIVE_STATES_UPDATE':
        if (kf.activeIds) {
          kf.activeIds.forEach(id => {
            nodes[id] = {
              glow: 0.8,
              scale: 1.05,
              pulse: false,
            };
          });
        }
        break;

      case 'EDGE_TRAVERSAL':
        if (kf.targetId) {
          edges[kf.targetId] = {
            active: true,
            traversalProgress: progress,
          };
        }
        break;

      case 'STATUS_FLASH':
        if (kf.status) {
          status = kf.status;
        }
        if (kf.activeIds) {
          const scaleOffset = 0.1 * Math.sin(progress * Math.PI * 4); // 2 full waves
          kf.activeIds.forEach(id => {
            nodes[id] = {
              glow: kf.status === 'accepted' ? 1 : 0.5,
              scale: 1 + Math.abs(scaleOffset),
              pulse: true,
            };
          });
        }
        break;

      case 'NODE_SHAKE':
        if (kf.activeIds) {
          kf.activeIds.forEach(id => {
            nodes[id] = {
              ...(nodes[id] || { glow: 0, scale: 1, pulse: false }),
              shake: true
            };
          });
        }
        break;

      case 'NODE_MORPH':
        if (kf.targetId) {
          nodes[kf.targetId] = {
            ...(nodes[kf.targetId] || { glow: 0, scale: 1, pulse: false }),
            morph: progress
          };
        }
        break;

      case 'NODE_ROTATE':
        if (kf.targetId) {
          nodes[kf.targetId] = {
            ...(nodes[kf.targetId] || { glow: 0, scale: 1, pulse: false }),
            rotate: progress * 360
          };
        }
        break;

      case 'NODE_FADE':
        if (kf.targetId) {
          nodes[kf.targetId] = {
            ...(nodes[kf.targetId] || { glow: 0, scale: 1, pulse: false }),
            fade: 1 - progress
          };
        }
        break;

      default:
        break;
    }
  });

  return {
    nodes,
    edges,
    status,
    symbolIndex,
  };
};
