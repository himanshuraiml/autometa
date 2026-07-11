import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

export interface TransitionEdgeData {
  label: string;
  isActive?: boolean;
  traversalProgress?: number;
}

export const TransitionEdge = ({
  id: _id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  selected,
}: EdgeProps) => {
  const edgeData = data as TransitionEdgeData | undefined;
  const label = edgeData?.label || '';
  const isActive = edgeData?.isActive || false;

  // Determine if it's a self loop
  const isSelfLoop = Math.abs(sourceX - targetX) < 10 && Math.abs(sourceY - targetY) < 10;

  let edgePath = '';
  let labelX = 0;
  let labelY = 0;

  if (isSelfLoop) {
    // Loop upwards
    const radius = 25;
    edgePath = `M ${sourceX} ${sourceY} C ${sourceX - radius} ${sourceY - 60}, ${sourceX + radius} ${sourceY - 60}, ${sourceX} ${sourceY}`;
    labelX = sourceX;
    labelY = sourceY - 45;
  } else {
    // Standard transition path
    const [path, lx, ly] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    edgePath = path;
    labelX = lx;
    labelY = ly;
  }

  const strokeColor = isActive 
    ? '#00f0ff' 
    : selected 
      ? '#ff007f' 
      : 'rgba(156, 163, 175, 0.6)';

  const strokeWidth = isActive ? 3 : selected ? 2.5 : 2;

  const traversalProgress = edgeData?.traversalProgress;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          filter: isActive ? 'drop-shadow(0 0 5px rgba(0, 240, 255, 0.5))' : undefined,
        }}
      />
      {traversalProgress !== undefined && traversalProgress > 0 && traversalProgress < 1 && (
        <circle
          r="5"
          fill="#00f0ff"
          style={{
            offsetPath: `path('${edgePath}')`,
            offsetDistance: `${traversalProgress * 100}%`,
          }}
          className="shadow-[0_0_10px_#00f0ff] pointer-events-none"
        />
      )}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: '#0a0f1d',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 'bold',
              color: isActive ? '#00f0ff' : '#e2e8f0',
              border: `1px solid ${isActive ? '#00f0ff' : 'rgba(255,255,255,0.1)'}`,
              pointerEvents: 'all',
              userSelect: 'none',
            }}
            className="shadow-lg"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
