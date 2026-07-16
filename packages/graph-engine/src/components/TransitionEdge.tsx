import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

export interface TransitionEdgeData {
  label: string;
  isActive?: boolean;
  traversalProgress?: number;
  /** Pixel separation for edges sharing the same endpoints. */
  parallelOffset?: number;
  loopDirection?: 'top' | 'right' | 'bottom' | 'left';
}

/** Memoized like StateNode — large automata have far more edges than states, so this matters more for render cost. */
export const TransitionEdge = memo(({
  id: _id,
  source,
  target,
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

  const isSelfLoop = source === target;
  const parallelOffset = edgeData?.parallelOffset ?? 0;

  let edgePath = '';
  let labelX = 0;
  let labelY = 0;

  if (isSelfLoop) {
    const direction = edgeData?.loopDirection ?? 'top';
    const distance = 60 + Math.abs(parallelOffset);
    const radius = 25;
    const vectors = {
      top: { x: 0, y: -1, px: 1, py: 0 }, right: { x: 1, y: 0, px: 0, py: 1 },
      bottom: { x: 0, y: 1, px: 1, py: 0 }, left: { x: -1, y: 0, px: 0, py: 1 },
    }[direction];
    const tipX = sourceX + vectors.x * distance;
    const tipY = sourceY + vectors.y * distance;
    edgePath = `M ${sourceX} ${sourceY} C ${tipX - vectors.px * radius} ${tipY - vectors.py * radius}, ${tipX + vectors.px * radius} ${tipY + vectors.py * radius}, ${sourceX} ${sourceY}`;
    labelX = sourceX + vectors.x * (distance - 15);
    labelY = sourceY + vectors.y * (distance - 15);
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
    // A perpendicular translation makes parallel transitions legible while
    // retaining React Flow's endpoint-aware Bezier curve.
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.hypot(dx, dy) || 1;
    const offsetX = (-dy / length) * parallelOffset;
    const offsetY = (dx / length) * parallelOffset;
    edgePath = parallelOffset
      ? `M ${sourceX} ${sourceY} Q ${(sourceX + targetX) / 2 + offsetX} ${(sourceY + targetY) / 2 + offsetY} ${targetX} ${targetY}`
      : path;
    labelX = parallelOffset ? (sourceX + targetX) / 2 + offsetX : lx;
    labelY = parallelOffset ? (sourceY + targetY) / 2 + offsetY : ly;
  }

  const strokeColor = isActive 
    ? 'var(--color-blue)' 
    : selected 
      ? 'var(--color-violet)' 
      : 'var(--border-color)';

  const strokeWidth = isActive ? 3 : selected ? 2.5 : 2;

  const traversalProgress = edgeData?.traversalProgress;

  const description = `Transition from ${source} to ${target}${label ? ` on ${label}` : ''}`;

  return (
    <>
      <title>{description}</title>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        aria-label={description}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          filter: isActive ? 'drop-shadow(0 0 5px var(--color-blue))' : undefined,
        }}
      />
      {traversalProgress !== undefined && traversalProgress > 0 && traversalProgress < 1 && (
        <circle
          r="5"
          fill="var(--color-blue)"
          style={{
            offsetPath: `path('${edgePath}')`,
            offsetDistance: `${traversalProgress * 100}%`,
          }}
          className="shadow-[0_0_10px_var(--color-blue)] pointer-events-none"
        />
      )}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: 'var(--bg-primary)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 'bold',
              color: isActive ? 'var(--color-blue)' : 'var(--text-main)',
              border: `1px solid ${isActive ? 'var(--color-blue)' : 'var(--border-color)'}`,
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
});

TransitionEdge.displayName = 'TransitionEdge';
