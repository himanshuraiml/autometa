import React from 'react';
import { PlayCircle, Search, Bell, ExternalLink, BookOpen, Sparkles } from 'lucide-react';
import { Button } from '@autometa/ui';
import { formatRelativeTime, type SavedLesson } from '../utils/lessonHistory';

interface DashboardViewProps {
  onNavigate: (view: 'graph' | 'grammars' | 'lessons') => void;
  onNewSimulation: () => void;
  recentProjects: any[];
  continueProject: any;
  onSelectProject: (proj: any) => void;
  lessonHistory: SavedLesson[];
  onSelectLesson: (lesson: SavedLesson) => void;
}

const getThumbnailUrl = (type: string) => {
  switch (type) {
    case 'DFA':
      return "https://lh3.googleusercontent.com/aida-public/AB6AXuBjBpTMm6RqH_V5te3krUHr0YJXm0zpnt4_v4O_sb_wLAG2nebd0r3p1vgCDUibjslx7Tj82Rc8LIr5nNpQ0bo34QoWyZJ75V9s2-5DjTMJqvz0YxgkxBS46VEg5Vjuv3Ww0g7gd-Ah01UNA2_AMXf8m19YnYa6xbSCqXUsv9Xv7ka-1UeSb-VCfkTrlpNtSq7X0N02Ha1EgGCKz6U4y5ceGAuXg_7pCGwr7lqpN4P7gFxIpc2Ajxzh_1rdmKRrTCbzBmqxQjT8dz8-";
    case 'NFA':
      return "https://lh3.googleusercontent.com/aida-public/AB6AXuCjAokSYyQcTrQQblJsYlYAKwqjGBd12jIUnLtoEmiGFXJSst2Hk40N4CxL_fYWqqzaeV0u0LAo74Bo3rHxk8_BqSVvL3oUbeDVMJJ6rWkP7khzJLxEWx4SrlXFzTun4BW-rtu8841dMpyPYh8hlC7M2e47opAvEMpdlT8geBxsGvCj8Qw0-SK6wyKswHb_lEysxFJyt0USR4cHrYL4iw-vPyNfiSbm-XT0mjXF4IgZb3t7yzsD7dIJLX_OVBH-jVQHIFriLeSLB9Nc";
    case 'PDA':
      return "https://lh3.googleusercontent.com/aida-public/AB6AXuA-B4xfRLi-WP5cFr3JKIwHv6BYywUm_zWXSD6kTpJT4jZSd60XZ44e2aL83ZMGFybgAo8Wfke8bUwl3KPvCmHcuJMVo4EyjaTNd3QvarKBmX6cxvXw1vyaCZy2uq9IZcQOF0_x79h3eEGJCmFi3QI8glyiYsVE12j8pTNYoeUpAIqKNhcNzAtt01wlqc-Y7vGfu6ktfpO-Ah5KxGvUFzEK-2DZOdfD5vgs9qFaIr6D8o9eJECNg3aVwuEtbATy8sFn4G6VE7VLrzR4";
    case 'TM':
      return "https://lh3.googleusercontent.com/aida-public/AB6AXuC1Z9Y7lZt3xtz-lOUGYxf6GRr96zusSyi_Peq3ege_r1UffLGwFPpfMW2vmIPCHFZpG2xI5f_FlLbY1BYq1DjnSWgbJkPbI-GR7dnNs_kpY1NbraFYSIY_puM_TM6xW0APR7yh-SYhm2fA4ZvQUBiWMD9XIyHghx1Pfz5wM-BAIhnqc5UBtTxPVTS3ToDKmOKIttHkC_S1EujOF6Iqys708tkX0yLAKmfcSKB2_6FBDQEYtCFxzqcsn2SFb7zEMT7rERse1i2OE6EC";
    default:
      return "https://lh3.googleusercontent.com/aida-public/AB6AXuBjBpTMm6RqH_V5te3krUHr0YJXm0zpnt4_v4O_sb_wLAG2nebd0r3p1vgCDUibjslx7Tj82Rc8LIr5nNpQ0bo34QoWyZJ75V9s2-5DjTMJqvz0YxgkxBS46VEg5Vjuv3Ww0g7gd-Ah01UNA2_AMXf8m19YnYa6xbSCqXUsv9Xv7ka-1UeSb-VCfkTrlpNtSq7X0N02Ha1EgGCKz6U4y5ceGAuXg_7pCGwr7lqpN4P7gFxIpc2Ajxzh_1rdmKRrTCbzBmqxQjT8dz8-";
  }
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onNewSimulation,
  recentProjects,
  continueProject,
  onSelectProject,
  lessonHistory,
  onSelectLesson
}) => {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#060B1A]">
      {/* Top App Bar inside Dashboard */}
      <header className="h-16 w-full bg-[#060B1A] flex items-center justify-between px-8 border-b border-white/10 shrink-0 select-none">
        <div className="flex items-center gap-8">
          <span className="text-base font-extrabold tracking-tight text-white">Studio Dashboard</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              className="bg-white/5 border border-white/10 rounded-full pl-9 pr-4 py-1.5 text-xs w-60 focus:outline-none focus:border-[#3b82f6] transition-colors text-white placeholder-gray-500" 
              placeholder="Search projects..." 
              type="text"
            />
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#00f0ff] to-[#ff007f] flex items-center justify-center font-bold text-xs text-black shadow-glow-blue/10 cursor-pointer">
            RK
          </div>
          <button className="p-2 text-gray-400 hover:text-white cursor-pointer transition-colors bg-transparent border-none">
            <Bell className="w-4 h-4" />
          </button>
          <button className="px-4 py-1.5 border border-white/10 rounded-lg text-xs font-bold hover:bg-white/5 transition-colors cursor-pointer text-gray-300">
            Export
          </button>
          <button className="px-4 py-1.5 aurora-btn text-white rounded-lg text-xs font-bold hover:opacity-90 transition-all cursor-pointer border-none">
            Share
          </button>
        </div>
      </header>

      {/* Main Dashboard Panels Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Canvas Central content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar flex flex-col gap-8">
          {/* Welcome Card */}
          <section className="relative h-48 rounded-2xl overflow-hidden flex flex-col justify-center px-8 bg-[#18253F]/60 border border-white/10 shrink-0">
            <div className="absolute inset-0 bg-gradient-to-r from-[#3b82f6]/10 to-[#8b5cf6]/10 opacity-30"></div>
            <div className="relative z-10">
              <h2 className="text-3xl font-extrabold text-white max-w-2xl leading-tight mb-2">
                Welcome back, Professor.
              </h2>
              <p className="text-base font-semibold text-[#00f0ff] uppercase tracking-wider font-bold">
                Ready to push the boundaries of logic?
              </p>
            </div>
          </section>

          {/* Continue Editing Section */}
          {continueProject && (
            <section className="shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Continue Editing</h3>
                <span className="text-xs font-bold text-[#3b82f6] flex items-center gap-1 hover:underline cursor-pointer">
                  View History →
                </span>
              </div>
              <div className="bg-[#18253F]/40 border border-white/10 rounded-2xl p-5 flex flex-col lg:flex-row gap-6 group cursor-pointer transition-all hover:border-[#3b82f6]/40">
                <div className="relative w-full lg:w-1/2 aspect-video rounded-xl overflow-hidden bg-black/40 border border-white/5">
                  <img 
                    className="w-full h-full object-cover" 
                    src={getThumbnailUrl(continueProject.type)} 
                    alt="Project preview"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                    <span className="px-2 py-0.5 bg-[#3b82f6]/20 backdrop-blur-md text-[#3b82f6] font-mono text-[9px] border border-[#3b82f6]/30 rounded font-bold uppercase tracking-widest">
                      {continueProject.type === 'DFA' ? 'COMPILER_LEXER_V2' : `${continueProject.type}_SIMULATION`}
                    </span>
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-between py-1">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-[#3b82f6]/10 rounded-full text-[9px] font-bold text-[#3b82f6] border border-[#3b82f6]/20 uppercase">
                        Active Simulation
                      </span>
                      <span className="text-[10px] text-gray-400">Last modified {continueProject.lastModified}</span>
                    </div>
                    <h4 className="text-xl font-bold mb-2 text-white">{continueProject.name}</h4>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      {continueProject.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <Button onClick={() => onSelectProject(continueProject)} className="flex-1 !bg-gradient-to-r !from-[#8b5cf6] !to-[#d946ef] !border-none !text-white">
                      Open Editor
                    </Button>
                    <button 
                      onClick={() => onSelectProject(continueProject)}
                      className="p-3 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer bg-transparent"
                    >
                      <PlayCircle className="w-5 h-5 text-[#3b82f6]" />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Recent Projects Grid */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Recent Projects</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              {recentProjects.map((proj) => (
                <div 
                  key={proj.id}
                  onClick={() => onSelectProject(proj)}
                  className="bg-[#18253F]/40 border border-white/10 p-4 rounded-xl hover:border-[#3b82f6]/50 transition-all group cursor-pointer flex flex-col gap-3"
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
                    <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium">
                      <span>{proj.type} • {proj.nodes?.length || 0} States</span>
                      <span>{proj.lastModified}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent Lessons Grid */}
          {lessonHistory.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Recent Lessons</h3>
                <button
                  onClick={() => onNavigate('lessons')}
                  className="text-xs font-bold text-[#3b82f6] flex items-center gap-1 hover:underline cursor-pointer bg-transparent border-none"
                >
                  Open Lesson Builder →
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {lessonHistory.map((lesson) => (
                  <div
                    key={lesson.id}
                    onClick={() => onSelectLesson(lesson)}
                    className="bg-[#18253F]/40 border border-white/10 p-4 rounded-xl hover:border-[#00f0ff]/50 transition-all group cursor-pointer flex flex-col gap-3"
                  >
                    <div className="w-full aspect-[16/9] rounded-lg bg-black/40 overflow-hidden border border-white/5 relative flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-[#00f0ff]/40 group-hover:text-[#00f0ff]/70 transition-colors" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white truncate mb-0.5">{lesson.topic}</h5>
                      <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium">
                        <span>{[lesson.difficulty, `${lesson.slides.length} slides`].filter(Boolean).join(' • ')}</span>
                        <span>{formatRelativeTime(lesson.savedAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Quick Start Templates Row */}
          <section className="mb-4">
            <h3 className="text-sm font-extrabold text-white mb-4 uppercase tracking-wider">Quick Start Templates</h3>
            <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
              {[
                { title: "Regex to NFA", desc: "Thompson's Construction", color: "text-blue-400", bg: "bg-blue-500/10" },
                { title: "Pumping Lemma", desc: "Interactive Bounds Checker", color: "text-purple-400", bg: "bg-purple-500/10" },
                { title: "DFA Minimizer", desc: "Myhill-Nerode Algorithm", color: "text-green-400", bg: "bg-green-500/10" }
              ].map((tmpl, idx) => (
                <button 
                  key={idx}
                  onClick={onNewSimulation}
                  className="flex-shrink-0 flex items-center gap-4 bg-[#18253F]/30 border border-white/10 px-5 py-4 rounded-xl hover:bg-white/5 transition-all cursor-pointer text-left"
                >
                  <div className={`w-10 h-10 rounded-lg ${tmpl.bg} flex items-center justify-center ${tmpl.color} font-black text-sm`}>
                    ★
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{tmpl.title}</p>
                    <p className="text-[10px] text-gray-400">{tmpl.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Right Side: Activity Timeline & Resources panels */}
        <div className="w-[320px] border-l border-white/10 p-6 flex flex-col gap-8 overflow-y-auto shrink-0 bg-[#0A1024]/40">
          {/* Activity Timeline */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Activity Timeline</h3>
            <div className="flex flex-col gap-5 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
              
              {/* Event 1 */}
              <div className="flex gap-4 relative">
                <div className="w-6 h-6 rounded-full bg-[#00f0ff]/10 border border-[#00f0ff]/30 flex items-center justify-center z-10 shrink-0 mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-[#00f0ff]" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-black text-[#00f0ff] uppercase tracking-wider">Simulation Success • 10m ago</span>
                  <p className="text-xs text-gray-300">Lexer DFA passed all 42 unit tests.</p>
                </div>
              </div>

              {/* Interactive AI Callout Box */}
              <div className="ml-10 p-4 rounded-xl bg-gradient-to-r from-[#22D3EE]/20 to-[#8B5CF6]/20 border border-[#22D3EE]/30 shadow-glow-blue/5">
                <p className="text-xs text-white font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[#22D3EE] rounded-full animate-ping" />
                  <span>AI: "Your state machine is perfectly minimal."</span>
                </p>
              </div>

              {/* Event 2 */}
              <div className="flex gap-4 relative">
                <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center z-10 shrink-0 mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-gray-500" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">New Project • 2h ago</span>
                  <p className="text-xs text-gray-300">Started 'Turing Tape Machine' experiment.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Resources Card Section */}
          <div className="mt-auto">
            <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">Resources</h3>
            <button 
              onClick={() => onNavigate('lessons')}
              className="w-full flex items-center justify-between p-4 bg-[#18253F]/40 border border-white/10 hover:border-[#00f0ff]/30 rounded-xl transition-all cursor-pointer text-left text-xs font-bold text-white hover:bg-white/5"
            >
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-[#00f0ff]" />
                <span>Automata Theory Basics</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
