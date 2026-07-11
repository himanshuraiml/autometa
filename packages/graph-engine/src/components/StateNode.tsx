import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export interface StateNodeData {
  label: string;
  isStart?: boolean;
  isAccept?: boolean;
  isActive?: boolean;
  scale?: number;
  glow?: number;
  shake?: boolean;
  rotate?: number;
  fade?: number;
  morph?: number;
}

export const StateNode = memo((props: NodeProps) => {
  const { data, selected } = props;
  const nodeData = data as unknown as StateNodeData;
  const label = nodeData.label ?? '';
  const labelFontSizeClass = label.length > 8 ? 'text-[9px]' : label.length > 5 ? 'text-[11px]' : 'text-base';

  return (
    <div className="relative">
      {/* Start State Arrow Indicator */}
      {nodeData.isStart && (
        <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
          <svg width="40" height="20" className="text-[#00f0ff]">
            <defs>
              <marker id="start-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
              </marker>
            </defs>
            <line x1="0" y1="10" x2="32" y2="10" stroke="currentColor" strokeWidth="3" markerEnd="url(#start-arrow)" />
          </svg>
          <span className="text-[9px] text-[#00f0ff] uppercase font-bold absolute left-1 -top-4 tracking-wider">Start</span>
        </div>
      )}

      {/* Main Circle State representation */}
      <div 
        style={{
          transform: `scale(${nodeData.scale ?? 1}) ${nodeData.rotate ? `rotate(${nodeData.rotate}deg)` : ''}`,
          opacity: nodeData.fade,
          borderRadius: nodeData.morph !== undefined ? `${50 - (nodeData.morph * 40)}%` : undefined,
          animation: nodeData.shake ? 'shake 0.15s ease-in-out infinite' : undefined,
          boxShadow: (nodeData.glow ?? 0) > 0 
            ? `0 0 ${(nodeData.glow ?? 0) * 20}px rgba(0, 240, 255, ${(nodeData.glow ?? 0) * 0.6})` 
            : selected 
              ? '0 0 15px rgba(255, 0, 127, 0.4)' 
              : undefined,
          borderColor: (nodeData.glow ?? 0) > 0 
            ? '#00f0ff' 
            : selected 
              ? '#ff007f' 
              : 'rgba(156, 163, 175, 0.6)',
          backgroundColor: (nodeData.glow ?? 0) > 0
            ? `rgba(0, 240, 255, ${(nodeData.glow ?? 0) * 0.15})`
            : selected
              ? '#162035'
              : '#0d1324'
        }}
        className={`w-16 h-16 rounded-full flex items-center justify-center font-bold ${labelFontSizeClass} transition-all duration-150 relative select-none border-2 text-gray-200 overflow-hidden text-center leading-tight break-words px-1`}
      >
        {label}

        {/* Double border for Accept State */}
        {nodeData.isAccept && (
          <div 
            style={{
              borderRadius: nodeData.morph !== undefined ? `${50 - (nodeData.morph * 40)}%` : undefined,
              borderColor: (nodeData.glow ?? 0) > 0 
                ? '#00f0ff' 
                : selected 
                  ? '#ff007f' 
                  : 'rgba(156, 163, 175, 0.6)'
            }}
            className="absolute inset-1 rounded-full border-2 pointer-events-none"
          />
        )}
      </div>

      {/* Connection Handles */}
      <Handle type="target" position={Position.Left} id="left-in" style={{ left: '-4px', background: '#00f0ff' }} />
      <Handle type="source" position={Position.Left} id="left-out" style={{ left: '-4px', background: '#00f0ff' }} />

      <Handle type="target" position={Position.Right} id="right-in" style={{ right: '-4px', background: '#00f0ff' }} />
      <Handle type="source" position={Position.Right} id="right-out" style={{ right: '-4px', background: '#00f0ff' }} />

      <Handle type="target" position={Position.Top} id="top-in" style={{ top: '-4px', background: '#00f0ff' }} />
      <Handle type="source" position={Position.Top} id="top-out" style={{ top: '-4px', background: '#00f0ff' }} />

      <Handle type="target" position={Position.Bottom} id="bottom-in" style={{ bottom: '-4px', background: '#00f0ff' }} />
      <Handle type="source" position={Position.Bottom} id="bottom-out" style={{ bottom: '-4px', background: '#00f0ff' }} />
    </div>
  );
});

StateNode.displayName = 'StateNode';
