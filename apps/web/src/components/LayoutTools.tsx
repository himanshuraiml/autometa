import { AlignCenterHorizontal, AlignCenterVertical, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Grid3X3, Magnet } from 'lucide-react';
import { useGraphStore } from '../store/useGraphStore';

const Tooltip = ({ children }: { children: React.ReactNode }) => (
  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-[10px] font-bold text-black dark:text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-20">
    {children}
  </span>
);

export const LayoutTools = ({ snapToGrid, setSnapToGrid }: { snapToGrid: boolean; setSnapToGrid: (value: boolean) => void }) => {
  const { autoLayout, alignNodes, distributeNodes } = useGraphStore();
  return <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0b1220]/90 p-1 shadow-xl">
    <button onClick={autoLayout} aria-label="Auto layout (layered by transitions)" className="relative group p-1.5 rounded text-slate-300 hover:text-[#00e5a3] hover:bg-white/5 border-0 bg-transparent cursor-pointer">
      <Grid3X3 size={15} />
      <Tooltip>Auto Layout (Layered by transitions)</Tooltip>
    </button>
    <button onClick={() => alignNodes('center')} aria-label="Align horizontally" className="relative group p-1.5 rounded text-slate-300 hover:text-[#00e5a3] hover:bg-white/5 border-0 bg-transparent cursor-pointer">
      <AlignCenterHorizontal size={15} />
      <Tooltip>Align Horizontally</Tooltip>
    </button>
    <button onClick={() => alignNodes('middle')} aria-label="Align vertically" className="relative group p-1.5 rounded text-slate-300 hover:text-[#00e5a3] hover:bg-white/5 border-0 bg-transparent cursor-pointer">
      <AlignCenterVertical size={15} />
      <Tooltip>Align Vertically</Tooltip>
    </button>
    <button onClick={() => distributeNodes('horizontal')} aria-label="Distribute horizontally" className="relative group p-1.5 rounded text-slate-300 hover:text-[#00e5a3] hover:bg-white/5 border-0 bg-transparent cursor-pointer">
      <AlignHorizontalDistributeCenter size={15} />
      <Tooltip>Distribute Horizontally</Tooltip>
    </button>
    <button onClick={() => distributeNodes('vertical')} aria-label="Distribute vertically" className="relative group p-1.5 rounded text-slate-300 hover:text-[#00e5a3] hover:bg-white/5 border-0 bg-transparent cursor-pointer">
      <AlignVerticalDistributeCenter size={15} />
      <Tooltip>Distribute Vertically</Tooltip>
    </button>
    <button onClick={() => setSnapToGrid(!snapToGrid)} aria-label={snapToGrid ? 'Disable snap to grid' : 'Enable snap to grid'} className={`relative group p-1.5 rounded border-0 cursor-pointer ${snapToGrid ? 'text-[#00e5a3] bg-[#00e5a3]/10' : 'text-slate-300 bg-transparent hover:bg-white/5'}`}>
      <Magnet size={15} />
      <Tooltip>{snapToGrid ? 'Disable Snap to Grid' : 'Enable Snap to Grid'}</Tooltip>
    </button>
  </div>;
};
