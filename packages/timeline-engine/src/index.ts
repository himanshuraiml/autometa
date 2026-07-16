export type KeyframeType = 
  | 'NODE_GLOW' 
  | 'EDGE_TRAVERSAL' 
  | 'ACTIVE_STATES_UPDATE' 
  | 'STATUS_FLASH'
  | 'NODE_SHAKE'
  | 'NODE_MORPH'
  | 'NODE_ROTATE'
  | 'NODE_FADE';

export interface AnimationKeyframe {
  id: string;
  startTime: number; // millisecond timestamp relative to timeline start
  duration: number;  // duration of this keyframe animation in ms
  type: KeyframeType;
  targetId?: string; // Node ID or Edge ID
  activeIds?: string[]; // List of Node IDs (for active sets)
  symbol?: string;
  symbolIndex?: number;
  status?: 'accepted' | 'rejected';
}

export interface AnimationTimeline {
  duration: number; // Total duration of timeline in ms
  keyframes: AnimationKeyframe[];
}

/**
 * Structurally matches @autometa/simulation-engine's SimulationEvent so this
 * package stays decoupled from the simulator while the seam remains
 * type-checked (extra fields like `time` are allowed by structural typing).
 */
export interface TimelineSourceEvent {
  event: 'enter_state' | 'transition' | 'active_states' | 'accept' | 'reject';
  stateId?: string;
  activeStateIds?: string[];
  edgeId?: string;
  symbol?: string;
  symbolIndex?: number;
}

/**
 * Maps simulation events into a time-scaled animation timeline.
 * stepDuration controls how long each state highlight or transition takes.
 */
export const generateTimeline = (
  events: TimelineSourceEvent[],
  stepDuration: number = 800
): AnimationTimeline => {
  const keyframes: AnimationKeyframe[] = [];
  let currentTime = 0;

  events.forEach((event, idx) => {
    const baseKeyframe = {
      id: `kf-${idx}-${event.event}-${Date.now()}`,
      symbol: event.symbol,
      symbolIndex: idx,
    };

    switch (event.event) {
      case 'enter_state':
        keyframes.push({
          ...baseKeyframe,
          startTime: currentTime,
          duration: stepDuration * 0.4,
          type: 'NODE_GLOW',
          targetId: event.stateId,
        });
        currentTime += stepDuration * 0.4;
        break;

      case 'active_states':
        keyframes.push({
          ...baseKeyframe,
          startTime: currentTime,
          duration: stepDuration * 0.2,
          type: 'ACTIVE_STATES_UPDATE',
          activeIds: event.activeStateIds,
        });
        currentTime += stepDuration * 0.2;
        break;

      case 'transition':
        // Edge traversal gets a slightly longer duration for smooth visual tracking
        keyframes.push({
          ...baseKeyframe,
          startTime: currentTime,
          duration: stepDuration * 0.8,
          type: 'EDGE_TRAVERSAL',
          targetId: event.edgeId,
        });
        currentTime += stepDuration * 0.8;
        break;

      case 'accept':
      case 'reject':
        keyframes.push({
          ...baseKeyframe,
          startTime: currentTime,
          duration: stepDuration,
          type: 'STATUS_FLASH',
          status: event.event === 'accept' ? 'accepted' : 'rejected',
          activeIds: event.activeStateIds || (event.stateId ? [event.stateId] : []),
        });
        if (event.event === 'reject') {
          keyframes.push({
            ...baseKeyframe,
            id: `kf-shake-${idx}-${Date.now()}`,
            startTime: currentTime,
            duration: stepDuration * 0.5,
            type: 'NODE_SHAKE',
            activeIds: event.activeStateIds || (event.stateId ? [event.stateId] : []),
          });
        }
        currentTime += stepDuration;
        break;
      
      default:
        break;
    }
  });

  return {
    duration: currentTime,
    keyframes,
  };
};
