import { memo } from 'react';
import { EdgeLabelRenderer, getBezierPath, useStore } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

export interface TransitionEdgeData {
  label: string;
  isActive?: boolean;
  traversalProgress?: number;
  /** Pixel separation for edges sharing the same source→target. */
  parallelOffset?: number;
  loopDirection?: 'top' | 'right' | 'bottom' | 'left';
}

function hasIntermediateNode(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourceId: string,
  targetId: string,
  nodes: Node[] | undefined
): boolean {
  if (!nodes || nodes.length <= 2) return false;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const L2 = dx * dx + dy * dy;
  if (L2 < 400) return false;

  for (const n of nodes) {
    if (n.id === sourceId || n.id === targetId) continue;
    const width = n.measured?.width ?? 64;
    const height = n.measured?.height ?? 64;
    const nx = n.position.x + width / 2;
    const ny = n.position.y + height / 2;

    const t = ((nx - sourceX) * dx + (ny - sourceY) * dy) / L2;
    if (t > 0.08 && t < 0.92) {
      const projX = sourceX + t * dx;
      const projY = sourceY + t * dy;
      const distSq = (nx - projX) ** 2 + (ny - projY) ** 2;
      if (distSq < 50 * 50) {
        return true;
      }
    }
  }
  return false;
}

/** Memoized — large automata have far more edges than states. */
export const TransitionEdge = memo(({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  selected,
}: EdgeProps) => {
  const edgeData = data as TransitionEdgeData | undefined;
  const label      = edgeData?.label         || '';
  const isActive   = edgeData?.isActive      || false;
  const parallelOffset = edgeData?.parallelOffset ?? 0;
  const isSelfLoop = source === target;

  const allEdges = useStore((s) => s.edges);
  const allNodes = useStore((s) => s.nodes);

  // Compute effective parallel curvature offset
  let effectiveOffset = parallelOffset;

  if (!isSelfLoop && allEdges && allEdges.length > 0) {
    const pairEdges = allEdges.filter(
      (e) => (e.source === source && e.target === target) || (e.source === target && e.target === source)
    );

    if (pairEdges.length > 1) {
      const forwardEdges = pairEdges.filter((e) => e.source === source && e.target === target);
      const reverseEdges = pairEdges.filter((e) => e.source === target && e.target === source);

      const forwardIndex = forwardEdges.findIndex((e) => e.id === id);
      const reverseIndex = reverseEdges.findIndex((e) => e.id === id);

      if (reverseEdges.length > 0) {
        // Bi-directional edge pair (e.g. q2->q3 and q3->q2).
        // Negative offset ensures left-to-right edge curves UPWARDS (-Y)
        // and right-to-left edge curves DOWNWARDS (+Y), bowing OUTWARDS
        // into clean, non-overlapping arches as seen in standard state diagrams.
        if (forwardIndex !== -1) {
          effectiveOffset = -(38 + forwardIndex * 28);
        } else if (reverseIndex !== -1) {
          effectiveOffset = -(38 + reverseIndex * 28);
        }
      } else if (effectiveOffset === 0) {
        // Multiple parallel edges in exact same direction
        const total = forwardEdges.length;
        effectiveOffset = (forwardIndex - (total - 1) / 2) * 36;
      }
    } else if (effectiveOffset === 0) {
      const isTop = sourcePosition === 'top' && targetPosition === 'top';
      const isBottom = sourcePosition === 'bottom' && targetPosition === 'bottom';
      const isIntermediate = hasIntermediateNode(sourceX, sourceY, targetX, targetY, source, target, allNodes);

      if (isTop) {
        effectiveOffset = -40;
      } else if (isBottom) {
        effectiveOffset = 40;
      } else if (isIntermediate) {
        // Non-immediate neighbour transition spanning over another node:
        // curve into an arch so it passes above/below intermediate nodes
        const dx = targetX - sourceX;
        const length = Math.hypot(dx, targetY - sourceY) || 1;
        const archDist = Math.min(80, 42 + length * 0.08);
        effectiveOffset = dx >= 0 ? -archDist : archDist;
      }
    }
  }

  let edgePath = '';
  let labelX   = 0;
  let labelY   = 0;

  // ─── Self-loop ────────────────────────────────────────────────────────────
  if (isSelfLoop) {
    const direction = edgeData?.loopDirection ?? 'top';
    const distance  = 60 + Math.abs(effectiveOffset);
    const radius    = 25;
    const v = {
      top:    { x:  0, y: -1, px:  1, py:  0 },
      right:  { x:  1, y:  0, px:  0, py:  1 },
      bottom: { x:  0, y:  1, px:  1, py:  0 },
      left:   { x: -1, y:  0, px:  0, py:  1 },
    }[direction];

    const tipX  = sourceX + v.x * distance;
    const tipY  = sourceY + v.y * distance;
    const cp2x  = tipX + v.px * radius;
    const cp2y  = tipY + v.py * radius;
    edgePath    = `M ${sourceX} ${sourceY} C ${tipX - v.px * radius} ${tipY - v.py * radius}, ${cp2x} ${cp2y}, ${sourceX} ${sourceY}`;
    labelX      = sourceX + v.x * (distance - 15);
    labelY      = sourceY + v.y * (distance - 15);

  // ─── Curved transition edge (for parallel / bi-directional edges or manual offsets) ───
  } else if (effectiveOffset !== 0) {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.hypot(dx, dy) || 1;

    // Perpendicular unit vector (-dy/L, dx/L)
    const perpX = (-dy / length) * effectiveOffset;
    const perpY = (dx  / length) * effectiveOffset;

    // Quadratic bezier control point
    const controlX = (sourceX + targetX) / 2 + perpX * 1.8;
    const controlY = (sourceY + targetY) / 2 + perpY * 1.8;

    edgePath = `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`;

    // Label at parametric midpoint of quadratic bezier (t = 0.5)
    labelX = 0.25 * sourceX + 0.5 * controlX + 0.25 * targetX;
    labelY = 0.25 * sourceY + 0.5 * controlY + 0.25 * targetY;

  // ─── Standard single transition (clean, straight React Flow Bezier path) ───
  } else {
    const [path, lx, ly] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    edgePath = path;
    labelX   = lx;
    labelY   = ly;
  }

  // ─── Colours ──────────────────────────────────────────────────────────────
  const strokeColor = isActive
    ? 'var(--color-blue)'
    : selected
      ? 'var(--color-violet)'
      : 'var(--edge-stroke-idle)';
  const strokeWidth = isActive ? 3 : selected ? 2.5 : 1.75;

  // ─── Arrowhead marker ─────────────────────────────────────────────────────
  // SVG's native orient="auto" automatically calculates the exact tangent of
  // the path (straight line, quadratic bezier, or React Flow bezier) at the
  // endpoint (targetX, targetY) and rotates the arrowhead perfectly.
  const markerId = `arrow-${id}`;
  const AW = 11;
  const AH = 8;

  const traversalProgress = edgeData?.traversalProgress;
  const description = `Transition from ${source} to ${target}${label ? ` on ${label}` : ''}`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth={AW}
          markerHeight={AH}
          refX={AW}
          refY={AH / 2}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon
            points={`0 0, ${AW} ${AH / 2}, 0 ${AH}`}
            fill={strokeColor}
            strokeLinejoin="round"
          />
        </marker>
      </defs>

      <title>{description}</title>

      <path
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
        aria-label={description}
        style={{
          ...style,
          filter: isActive
            ? 'drop-shadow(0 0 5px var(--color-blue))'
            : selected
              ? 'drop-shadow(0 0 4px var(--color-violet))'
              : 'drop-shadow(0 0 3px var(--edge-stroke-idle))',
        }}
      />

      {/* Traversal animation dot */}
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

      {/* Label pill */}
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
              color: isActive
                ? 'var(--color-blue)'
                : selected
                  ? 'var(--color-violet)'
                  : 'var(--edge-stroke-idle)',
              border: `1px solid ${
                isActive ? 'var(--color-blue)'
                : selected ? 'var(--color-violet)'
                : 'var(--edge-stroke-idle)'
              }`,
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
