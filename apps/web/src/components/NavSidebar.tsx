import { Home, Tv, Blocks, BookOpen, GraduationCap, Library, HelpCircle, Settings, Plus, GitCompare } from 'lucide-react';
import logoImg from '../assets/logo.jpg';

export type AppView = 'dashboard' | 'graph' | 'grammars' | 'lessons' | 'practice' | 'library' | 'operations';

interface NavSidebarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onNewSimulation: () => void;
}

const NAV_ITEMS: { id: AppView; name: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', name: 'Home', icon: <Home className="w-4 h-4" /> },
  { id: 'graph', name: 'Editor', icon: <Tv className="w-4 h-4" /> },
  { id: 'grammars', name: 'Grammars', icon: <Blocks className="w-4 h-4" /> },
  { id: 'operations', name: 'Compare & Combine', icon: <GitCompare className="w-4 h-4" /> },
  { id: 'lessons', name: 'Lesson Builder', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'practice', name: 'Practice', icon: <GraduationCap className="w-4 h-4" /> },
  { id: 'library', name: 'Library', icon: <Library className="w-4 h-4" /> },
];

/** Global left navigation sidebar. */
export const NavSidebar = ({ activeView, onNavigate, onOpenHelp, onOpenSettings, onNewSimulation }: NavSidebarProps) => (
  <aside className="w-[260px] h-screen bg-[var(--bg-secondary)] border-r border-[var(--border-color)] flex flex-col py-8 z-30 shrink-0 select-none text-[var(--text-main)]" aria-label="Main navigation">
    {/* Brand Logo & Title */}
    <div className="px-8 mb-8">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center p-0.5 border border-[var(--border-color)] shadow-sm">
          <img src={logoImg} alt="Autometa Logo" className="w-full h-full object-contain rounded" />
        </div>
        <h1 className="font-extrabold text-lg tracking-wider text-[var(--color-ui-accent)] uppercase">
          Autometa
        </h1>
      </div>
      <p className="text-[8.5px] text-[var(--text-muted)] font-medium uppercase tracking-wider pl-9">Visualize, Simulate, Understand</p>
    </div>

    {/* Navigation List */}
    <nav className="flex-1 flex flex-col gap-1 px-4">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          aria-current={activeView === item.id ? 'page' : undefined}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all border-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--border-color)]/30 ${
            activeView === item.id
              ? 'bg-[var(--bg-primary)] text-[var(--text-main)] border border-[var(--border-color)] font-extrabold shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-panel-hover)] bg-transparent'
          }`}
        >
          <div className="flex items-center gap-3">
            {item.icon}
            <span className="text-xs">{item.name}</span>
          </div>
        </button>
      ))}

      {/* Help button opens the editor tutorial (jumps to the editor first if needed) */}
      <button
        onClick={onOpenHelp}
        className="w-full flex items-center px-4 py-3 rounded-xl transition-all border-none cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-panel-hover)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--border-color)]/30"
      >
        <div className="flex items-center gap-3">
          <HelpCircle className="w-4 h-4" />
          <span className="text-xs">Help</span>
        </div>
      </button>

      {/* Settings button opens the unified Settings modal */}
      <button
        onClick={onOpenSettings}
        className="w-full flex items-center px-4 py-3 rounded-xl transition-all border-none cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-panel-hover)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--border-color)]/30"
      >
        <div className="flex items-center gap-3">
          <Settings className="w-4 h-4" />
          <span className="text-xs">Settings</span>
        </div>
      </button>
    </nav>

    {/* New Simulation Button */}
    <div className="px-6 mb-6">
      <button
        onClick={onNewSimulation}
        className="w-full py-3 bg-[var(--color-ui-accent)] text-[var(--bg-primary)] border border-[var(--border-color-active)] font-extrabold text-xs rounded-full flex items-center justify-center gap-2 hover:opacity-95 active:scale-95 transition-all border-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--border-color)]"
      >
        <Plus className="w-4 h-4 stroke-[3]" />
        <span>New Simulation</span>
      </button>
    </div>
  </aside>
);
