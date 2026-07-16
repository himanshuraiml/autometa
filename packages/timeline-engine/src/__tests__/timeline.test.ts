import { describe, it, expect } from 'vitest';
import { generateTimeline } from '../index';
import type { TimelineSourceEvent } from '../index';

describe('Timeline Engine', () => {
  it('should assign the event index as symbolIndex to timeline keyframes', () => {
    const events: TimelineSourceEvent[] = [
      { event: 'enter_state', stateId: 'q0', symbolIndex: 0 },
      { event: 'transition', edgeId: 'e0', symbolIndex: 0 },
      { event: 'enter_state', stateId: 'q1', symbolIndex: 1 },
      { event: 'accept', stateId: 'q1', symbolIndex: 1 }
    ];

    const timeline = generateTimeline(events, 800);
    
    // Check that we have keyframes and each keyframe uses the event index for symbolIndex
    expect(timeline.keyframes.length).toBeGreaterThan(0);
    
    // Keyframe for event index 0 (enter_state)
    const kf0 = timeline.keyframes.find(kf => kf.id.startsWith('kf-0-'));
    expect(kf0).toBeDefined();
    expect(kf0?.symbolIndex).toBe(0);

    // Keyframe for event index 1 (transition)
    const kf1 = timeline.keyframes.find(kf => kf.id.startsWith('kf-1-'));
    expect(kf1).toBeDefined();
    expect(kf1?.symbolIndex).toBe(1);

    // Keyframe for event index 2 (enter_state)
    const kf2 = timeline.keyframes.find(kf => kf.id.startsWith('kf-2-'));
    expect(kf2).toBeDefined();
    expect(kf2?.symbolIndex).toBe(2);

    // Keyframe for event index 3 (accept)
    const kf3 = timeline.keyframes.find(kf => kf.id.startsWith('kf-3-'));
    expect(kf3).toBeDefined();
    expect(kf3?.symbolIndex).toBe(3);
  });
});
