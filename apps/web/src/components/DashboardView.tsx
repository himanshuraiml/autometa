import React, { useState } from 'react';
import { PlayCircle, Search, Bell, BookOpen, Sparkles, Regex } from 'lucide-react';
import { Button } from '@autometa/ui';
import { formatRelativeTime, type SavedLesson } from '../utils/lessonHistory';

interface DashboardViewProps {
  onNavigate: (view: 'graph' | 'grammars' | 'lessons') => void;
  recentProjects: any[];
  continueProject: any;
  onSelectProject: (proj: any) => void;
  onViewHistory: () => void;
  onOpenMinimizer: () => void;
  onOpenRegexToNfa: () => void;
  lessonHistory: SavedLesson[];
  onSelectLesson: (lesson: SavedLesson) => void;
}

// Thumbnails are generated locally as SVG data URIs: the app must work fully
// offline, so no external image hosts.
const THUMBNAIL_THEMES: Record<string, { from: string; to: string }> = {
  DFA: { from: '#0e7490', to: '#155e75' },
  NFA: { from: '#7c3aed', to: '#4c1d95' },
  Mealy: { from: '#b45309', to: '#78350f' },
  Moore: { from: '#be185d', to: '#831843' },
  PDA: { from: '#047857', to: '#064e3b' },
  TM: { from: '#b91c1c', to: '#7f1d1d' },
};

const getThumbnailUrl = (type: string) => {
  const theme = THUMBNAIL_THEMES[type] ?? THUMBNAIL_THEMES.DFA;
  const label = THUMBNAIL_THEMES[type] ? type : 'FA';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${theme.from}"/><stop offset="1" stop-color="${theme.to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="320" height="180" fill="url(#g)"/>` +
    `<circle cx="70" cy="90" r="26" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="3"/>` +
    `<circle cx="250" cy="90" r="26" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="3"/>` +
    `<circle cx="250" cy="90" r="19" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>` +
    `<line x1="96" y1="90" x2="218" y2="90" stroke="rgba(255,255,255,0.55)" stroke-width="3"/>` +
    `<polygon points="224,90 210,82 210,98" fill="rgba(255,255,255,0.55)"/>` +
    `<text x="160" y="42" font-family="system-ui, sans-serif" font-size="24" font-weight="700" fill="rgba(255,255,255,0.9)" text-anchor="middle">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  recentProjects,
  continueProject,
  onSelectProject,
  onViewHistory,
  onOpenMinimizer,
  onOpenRegexToNfa,
  lessonHistory,
  onSelectLesson
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const query = searchQuery.trim().toLowerCase();

  const filteredProjects = query
    ? recentProjects.filter((proj) => (proj.name || '').toLowerCase().includes(query))
    : recentProjects;
  const filteredLessons = query
    ? lessonHistory.filter((lesson) => (lesson.topic || '').toLowerCase().includes(query))
    : lessonHistory;
  const hasNoResults = query.length > 0 && filteredProjects.length === 0 && filteredLessons.length === 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#050811]">
      {/* Top App Bar inside Dashboard */}
      <header className="h-16 w-full bg-[#050811] flex items-center justify-between px-8 border-b border-white/10 shrink-0 select-none">
        <div className="flex items-center gap-8">
          <span className="text-sm font-black uppercase tracking-widest text-slate-100">Studio Dashboard</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-full pl-9 pr-4 py-1.5 text-xs w-60 focus:outline-none focus:border-[#00e5a3] focus:ring-2 focus:ring-[#00e5a3]/20 transition-all text-white placeholder-slate-500"
              placeholder="Search projects & lessons..."
              type="text"
              aria-label="Search projects and lessons"
            />
          </div>
          <button 
            aria-label="Notifications"
            className="p-2 text-slate-400 hover:text-white cursor-pointer transition-colors bg-transparent border-none rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30"
          >
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Dashboard Panels Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Canvas Central content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar flex flex-col gap-8">
          {/* Welcome Card */}
          <section className="relative h-48 rounded-2xl overflow-hidden flex flex-col justify-center px-8 bg-gradient-to-br from-[#0c1223]/80 to-[#0e172a]/80 border border-white/5 shadow-glass backdrop-blur-glass shrink-0">
            <div className="absolute inset-0 bg-gradient-to-r from-[#00e5a3]/5 to-[#8b5cf6]/8 opacity-40"></div>
            <div className="relative z-10">
              <h2 className="text-2xl font-black text-white max-w-2xl leading-tight mb-2 tracking-wide">
                Welcome back, Professor.
              </h2>
              <p className="text-xs font-bold text-[#00e5a3] uppercase tracking-widest">
                Ready to push the boundaries of logic?
              </p>
            </div>
          </section>

          {/* Quick Start Templates Row */}
          <section className="mb-2">
            <h3 className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-widest">Quick Start</h3>
            <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
              {[
                { title: "Regex to NFA", desc: "Thompson's Construction", color: "text-[#0ea5e9]", bg: "bg-[#0ea5e9]/10", icon: <Regex className="w-4 h-4" />, onClick: onOpenRegexToNfa },
                { title: "DFA Minimizer", desc: "Myhill-Nerode Algorithm", color: "text-[#00e5a3]", bg: "bg-[#00e5a3]/10", icon: <span className="font-black text-sm">★</span>, onClick: onOpenMinimizer },
                { title: "Automata Theory Basics", desc: "Open Lesson Builder", color: "text-[#8b5cf6]", bg: "bg-[#8b5cf6]/10", icon: <BookOpen className="w-4 h-4" />, onClick: () => onNavigate('lessons') }
              ].map((tmpl, idx) => (
                <button
                  key={idx}
                  onClick={tmpl.onClick}
                  className="flex-shrink-0 flex items-center gap-4 bg-[#0c1223]/40 border border-white/5 px-5 py-4 rounded-xl hover:bg-[#0c1223]/70 hover:border-[#00e5a3]/30 transition-all duration-300 cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30"
                >
                  <div className={`w-10 h-10 rounded-lg ${tmpl.bg} flex items-center justify-center ${tmpl.color}`}>
                    {tmpl.icon}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{tmpl.title}</p>
                    <p className="text-[10px] text-slate-400">{tmpl.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Continue Editing Section */}
          {continueProject && (
            <section className="shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Continue Editing</h3>
                <button
                  onClick={onViewHistory}
                  className="text-xs font-bold text-[#0ea5e9] flex items-center gap-1 hover:underline cursor-pointer bg-transparent border-none focus:outline-none"
                >
                  View History →
                </button>
              </div>
              <div className="bg-[#0c1223]/40 border border-white/5 rounded-2xl p-6 flex flex-col lg:flex-row gap-6 group cursor-pointer transition-all duration-300 hover:border-[#00e5a3]/30 hover:bg-[#0c1223]/60 shadow-md">
                <div className="relative w-full lg:w-1/2 aspect-video rounded-xl overflow-hidden bg-black/40 border border-white/5">
                  <img 
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" 
                    src={getThumbnailUrl(continueProject.type)} 
                    alt="Project preview"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                    <span className="px-2 py-0.5 bg-[#0ea5e9]/10 backdrop-blur-md text-[#38bdf8] font-mono text-[9px] border border-[#0ea5e9]/20 rounded font-bold uppercase tracking-widest">
                      {continueProject.type === 'DFA' ? 'COMPILER_LEXER_V2' : `${continueProject.type}_SIMULATION`}
                    </span>
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-between py-1">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-[#00e5a3]/10 rounded-full text-[9px] font-bold text-[#00e5a3] border border-[#00e5a3]/20 uppercase tracking-wider">
                        Active Simulation
                      </span>
                      <span className="text-[10px] text-slate-400">Last modified {continueProject.lastModified}</span>
                    </div>
                    <h4 className="text-xl font-bold mb-2 text-white">{continueProject.name}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {continueProject.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <Button 
                      onClick={() => onSelectProject(continueProject)} 
                      className="flex-1 !bg-gradient-to-r !from-[#00e5a3] !to-[#8b5cf6] !border-none !text-black !font-bold hover:opacity-90 transition-opacity"
                    >
                      Open Editor
                    </Button>
                    <button 
                      onClick={() => onSelectProject(continueProject)}
                      aria-label="Run simulation"
                      className="p-3 border border-white/10 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer bg-transparent focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30"
                    >
                      <PlayCircle className="w-5 h-5 text-[#00e5a3]" />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Recent Projects Grid */}
          {filteredProjects.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Projects</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {filteredProjects.map((proj) => (
                  <div 
                    key={proj.id}
                    onClick={() => onSelectProject(proj)}
                    className="bg-[#0c1223]/40 border border-white/5 p-4 rounded-xl hover:border-[#00e5a3]/30 hover:bg-[#0c1223]/70 transition-all duration-300 group cursor-pointer flex flex-col gap-3 shadow-md focus-within:ring-2 focus-within:ring-[#00e5a3]/30"
                  >
                    <div className="w-full aspect-[16/9] rounded-lg bg-black/40 overflow-hidden border border-white/5 relative">
                      <img 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                        src={getThumbnailUrl(proj.type)} 
                        alt={proj.name}
                      />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white truncate mb-0.5">{proj.name}</h5>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                        <span>{proj.type} • {proj.nodes?.length || 0} States</span>
                        <span>{proj.lastModified}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {hasNoResults && (
            <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-white/10 rounded-2xl bg-[#0c1223]/20 text-center animate-fade-in">
              <Search className="w-8 h-8 text-slate-500 mb-3" />
              <p className="text-sm font-semibold text-gray-300">No matching items found</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">We couldn't find any projects or lessons matching "{searchQuery.trim()}". Try checking your spelling or using different keywords.</p>
              <button 
                onClick={() => setSearchQuery('')} 
                className="mt-4 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30"
              >
                Clear Search
              </button>
            </div>
          )}

          {/* Recent Lessons Grid */}
          {filteredLessons.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Lessons</h3>
                <button
                  onClick={() => onNavigate('lessons')}
                  className="text-xs font-bold text-[#0ea5e9] flex items-center gap-1 hover:underline cursor-pointer bg-transparent border-none focus:outline-none"
                >
                  Open Lesson Builder →
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {filteredLessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    onClick={() => onSelectLesson(lesson)}
                    className="bg-[#0c1223]/40 border border-white/5 p-4 rounded-xl hover:border-[#8b5cf6]/30 hover:bg-[#0c1223]/70 transition-all duration-300 group cursor-pointer flex flex-col gap-3 shadow-md focus-within:ring-2 focus-within:ring-[#8b5cf6]/30"
                  >
                    <div className="w-full aspect-[16/9] rounded-lg bg-black/40 overflow-hidden border border-white/5 relative flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-[#8b5cf6]/30 group-hover:text-[#8b5cf6]/60 transition-colors" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white truncate mb-0.5">{lesson.topic}</h5>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                        <span>{[lesson.difficulty, `${lesson.slides.length} slides`].filter(Boolean).join(' • ')}</span>
                        <span>{formatRelativeTime(lesson.savedAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
