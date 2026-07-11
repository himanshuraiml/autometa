import { useState } from 'react';
import { ToggleLeft, ToggleRight, Blocks } from 'lucide-react';

interface PluginItem {
  id: string;
  name: string;
  category: string;
  description: string;
  active: boolean;
}

export const PluginManager = () => {
  const [plugins, setPlugins] = useState<PluginItem[]>([
    { id: 'sorting', name: 'Sorting Visualizer', category: 'CS Core', description: 'Interactive bubble, quick, and merge sort animation states.', active: true },
    { id: 'compiler', name: 'Compiler Parser', category: 'CS Systems', description: 'Lexical analysis token stream and AST tree generator.', active: true },
    { id: 'os', name: 'OS Scheduler', category: 'CS Systems', description: 'CPU Scheduling simulation (FIFO, RR, Shortest Job First).', active: false },
    { id: 'database', name: 'DB Query Optimizer', category: 'CS Systems', description: 'Visual relational algebra expression execution tree.', active: false },
    { id: 'ml', name: 'ML Neural Net', category: 'CS AI', description: 'Forward propagation and weights adjustments visualization.', active: false }
  ]);

  const togglePlugin = (id: string) => {
    setPlugins(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center border-b border-white/10 pb-3">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <Blocks className="w-4 h-4 text-[#00f0ff]" /> Plugin Architecture
        </h3>
        <span className="text-[10px] bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/20 font-bold px-2 py-0.5 rounded">
          Modular v1.0
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {plugins.map(p => (
          <div 
            key={p.id}
            className={`p-3.5 rounded-xl border transition-all duration-200 flex justify-between items-center bg-black/40 ${
              p.active 
                ? 'border-[#00f0ff]/30 shadow-glow-blue/5' 
                : 'border-white/5 opacity-70'
            }`}
          >
            <div className="flex flex-col gap-0.5 max-w-[70%]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-white">{p.name}</span>
                <span className="text-[9px] text-gray-500 uppercase font-black bg-white/5 px-1.5 py-0.5 rounded">
                  {p.category}
                </span>
              </div>
              <p className="text-[10px] text-gray-400">{p.description}</p>
            </div>

            <button 
              onClick={() => togglePlugin(p.id)}
              className="text-[#00f0ff] hover:text-[#ff007f] transition-colors cursor-pointer border-none bg-transparent"
            >
              {p.active ? (
                <ToggleRight className="w-8 h-8 text-[#00f0ff]" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-gray-600" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
