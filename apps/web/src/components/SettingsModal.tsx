import { useEffect, useState } from 'react';
import { Settings, Sparkles, Blocks, Keyboard } from 'lucide-react';
import { Button } from '@autometa/ui';
import { SubmachineLibrary } from './SubmachineLibrary';
import { LLM_STORAGE_KEYS, type LLMProvider } from '../utils/llmConfig';
import { getSecret, setSecret } from '../utils/secretStore';
import { EDITOR_SHORTCUT_GROUPS } from '../utils/shortcuts';
import { useToast } from './ToastProvider';

export type SettingsTab = 'general' | 'ai' | 'submachines' | 'shortcuts';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
  theme: 'light' | 'dark';
  onChangeTheme: (theme: 'light' | 'dark') => void;
}

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <Settings className="w-3.5 h-3.5" /> },
  { id: 'ai', label: 'AI Models', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'submachines', label: 'Submachines', icon: <Blocks className="w-3.5 h-3.5" /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard className="w-3.5 h-3.5" /> },
];

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="text-xs text-gray-400 font-bold uppercase">{children}</label>
);

const TextField = ({
  value, onChange, placeholder, mono = false, type = "text"
}: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; type?: string }) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className={`w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00e5a3] focus:ring-2 focus:ring-[#00e5a3]/20 transition-all ${mono ? 'font-mono' : ''}`}
  />
);

export const SettingsModal = ({ isOpen, onClose, initialTab = 'general', onChangeTheme }: SettingsModalProps) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  const [themePreference, setThemePreference] = useState<'light' | 'dark' | 'system'>(() => {
    const stored = localStorage.getItem('autometa-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return 'system';
  });

  const [provider, setProvider] = useState<LLMProvider>('Ollama');
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [groqModel, setGroqModel] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [customKey, setCustomKey] = useState('');

  // Re-hydrate every time the modal opens so edits from a previous session
  // (or a different tab) are reflected instead of stale defaults. Non-secret
  // settings come from localStorage; API keys come from the secret store.
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    const stored = localStorage.getItem('autometa-theme');
    setThemePreference(stored === 'light' || stored === 'dark' ? stored : 'system');
    setProvider((localStorage.getItem(LLM_STORAGE_KEYS.provider) as LLMProvider) || 'Ollama');
    setGeminiKey(getSecret(LLM_STORAGE_KEYS.geminiKey));
    setGeminiModel(localStorage.getItem(LLM_STORAGE_KEYS.geminiModel) || '');
    setOpenaiKey(getSecret(LLM_STORAGE_KEYS.openaiKey));
    setOpenaiModel(localStorage.getItem(LLM_STORAGE_KEYS.openaiModel) || '');
    setGroqKey(getSecret(LLM_STORAGE_KEYS.groqKey));
    setGroqModel(localStorage.getItem(LLM_STORAGE_KEYS.groqModel) || '');
    setCustomBaseUrl(localStorage.getItem(LLM_STORAGE_KEYS.customBaseUrl) || '');
    setCustomModel(localStorage.getItem(LLM_STORAGE_KEYS.customModel) || '');
    setCustomKey(getSecret(LLM_STORAGE_KEYS.customKey));
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleThemeChange = (pref: 'light' | 'dark' | 'system') => {
    setThemePreference(pref);
    if (pref === 'system') {
      localStorage.removeItem('autometa-theme');
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      onChangeTheme(systemTheme);
    } else {
      localStorage.setItem('autometa-theme', pref);
      onChangeTheme(pref);
    }
  };

  const handleSave = async () => {
    localStorage.setItem(LLM_STORAGE_KEYS.provider, provider);
    localStorage.setItem(LLM_STORAGE_KEYS.geminiModel, geminiModel);
    localStorage.setItem(LLM_STORAGE_KEYS.openaiModel, openaiModel);
    localStorage.setItem(LLM_STORAGE_KEYS.groqModel, groqModel);
    localStorage.setItem(LLM_STORAGE_KEYS.customBaseUrl, customBaseUrl);
    localStorage.setItem(LLM_STORAGE_KEYS.customModel, customModel);
    try {
      await Promise.all([
        setSecret(LLM_STORAGE_KEYS.geminiKey, geminiKey),
        setSecret(LLM_STORAGE_KEYS.openaiKey, openaiKey),
        setSecret(LLM_STORAGE_KEYS.groqKey, groqKey),
        setSecret(LLM_STORAGE_KEYS.customKey, customKey),
      ]);
    } catch (err) {
      console.error('Failed to store API keys in the keychain:', err);
      showToast('Could not save API keys to the system keychain.', 'error');
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl h-[600px] max-h-[90vh] bg-[#0b121e] border border-white/5 rounded-2xl shadow-2xl animate-fade-in select-none flex overflow-hidden">
        {/* Left tab rail */}
        <div className="w-48 shrink-0 border-r border-white/10 bg-black/20 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 px-2 pb-4 mb-2 border-b border-white/10">
            <Settings className="w-4 h-4 text-[#00e5a3] animate-spin-slow" />
            <span className="text-xs font-black uppercase tracking-widest text-white">Settings</span>
          </div>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer border text-left focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30 ${
                activeTab === tab.id
                  ? 'bg-[#00e5a3]/10 text-[#00e5a3] border-[#00e5a3]/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 bg-transparent border-transparent'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
            {activeTab === 'general' && (
              <>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">General Settings</h3>

                <div className="flex flex-col gap-1.5 mt-2">
                  <FieldLabel>Theme Mode</FieldLabel>
                  <select
                    value={themePreference}
                    onChange={(e) => handleThemeChange(e.target.value as 'light' | 'dark' | 'system')}
                    className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00e5a3] focus:ring-2 focus:ring-[#00e5a3]/20 transition-all cursor-pointer"
                  >
                    <option value="system">Follow System Preference</option>
                    <option value="light">Light Theme</option>
                    <option value="dark">Dark Theme</option>
                  </select>
                  <p className="text-xs text-gray-500 leading-relaxed mt-1">
                    Choose your interface color preference. Monochromatic frame elements will adapt, while active simulation elements remain colorful.
                  </p>
                </div>
              </>
            )}

            {activeTab === 'ai' && (
              <>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">AI Model Configuration</h3>

                <div className="flex flex-col gap-1">
                  <FieldLabel>LLM Provider</FieldLabel>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as LLMProvider)}
                    className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00e5a3] focus:ring-2 focus:ring-[#00e5a3]/20 transition-all"
                  >
                    <option value="Ollama">Local Ollama (Default)</option>
                    <option value="Gemini">Gemini API (Google)</option>
                    <option value="OpenAI">OpenAI API</option>
                    <option value="Groq">Groq Cloud API</option>
                    <option value="Custom">Custom / Other (OpenAI-compatible)</option>
                  </select>
                </div>

                {provider === 'Ollama' && (
                  <p className="text-xs text-gray-500 leading-relaxed animate-fade-in">
                    Uses your local Ollama server (qwen2.5-coder:7b, falling back to llama3.2:1b). No API key needed — just make sure Ollama is running.
                  </p>
                )}

                {provider === 'Gemini' && (
                  <div className="flex flex-col gap-3 animate-fade-in">
                    <div className="flex flex-col gap-1">
                      <FieldLabel>Gemini API Key</FieldLabel>
                      <TextField type="password" mono value={geminiKey} onChange={setGeminiKey} placeholder="AIzaSy..." />
                    </div>
                    <div className="flex flex-col gap-1">
                      <FieldLabel>Model</FieldLabel>
                      <TextField mono value={geminiModel} onChange={setGeminiModel} placeholder="gemini-2.5-flash (default)" />
                    </div>
                  </div>
                )}

                {provider === 'OpenAI' && (
                  <div className="flex flex-col gap-3 animate-fade-in">
                    <div className="flex flex-col gap-1">
                      <FieldLabel>OpenAI API Key</FieldLabel>
                      <TextField type="password" mono value={openaiKey} onChange={setOpenaiKey} placeholder="sk-proj-..." />
                    </div>
                    <div className="flex flex-col gap-1">
                      <FieldLabel>Model</FieldLabel>
                      <TextField mono value={openaiModel} onChange={setOpenaiModel} placeholder="gpt-4o-mini (default)" />
                    </div>
                  </div>
                )}

                {provider === 'Groq' && (
                  <div className="flex flex-col gap-3 animate-fade-in">
                    <div className="flex flex-col gap-1">
                      <FieldLabel>Groq API Key</FieldLabel>
                      <TextField type="password" mono value={groqKey} onChange={setGroqKey} placeholder="gsk_..." />
                    </div>
                    <div className="flex flex-col gap-1">
                      <FieldLabel>Model</FieldLabel>
                      <TextField mono value={groqModel} onChange={setGroqModel} placeholder="llama-3.3-70b-versatile (default)" />
                    </div>
                  </div>
                )}

                {provider === 'Custom' && (
                  <div className="flex flex-col gap-3 animate-fade-in">
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Point at any OpenAI-compatible chat completions endpoint — OpenRouter, Together, Fireworks, a local LM Studio / vLLM server, etc.
                    </p>
                    <div className="flex flex-col gap-1">
                      <FieldLabel>Base URL</FieldLabel>
                      <TextField mono value={customBaseUrl} onChange={setCustomBaseUrl} placeholder="https://openrouter.ai/api/v1" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <FieldLabel>Model</FieldLabel>
                      <TextField mono value={customModel} onChange={setCustomModel} placeholder="meta-llama/llama-3.3-70b-instruct" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <FieldLabel>API Key (optional)</FieldLabel>
                      <TextField type="password" mono value={customKey} onChange={setCustomKey} placeholder="Leave blank if the endpoint needs none" />
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'submachines' && <SubmachineLibrary />}

            {activeTab === 'shortcuts' && (
              <>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">Editor Shortcuts</h3>
                {EDITOR_SHORTCUT_GROUPS.map((group) => (
                  <div key={group.title} className="flex flex-col gap-2">
                    <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{group.title}</h4>
                    <div className="flex flex-col gap-1 bg-white/5 rounded-xl border border-white/5 overflow-hidden">
                      {group.entries.map((entry) => (
                        <div
                          key={entry.action}
                          className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-white/5 last:border-b-0"
                        >
                          <span className="text-xs text-gray-300">{entry.action}</span>
                          <span className="text-[11px] font-mono font-bold text-[#00e5a3] bg-black/40 border border-white/10 rounded px-2 py-0.5 whitespace-nowrap">
                            {entry.keys}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {activeTab === 'ai' || activeTab === 'general' ? (
            <div className="flex gap-3 justify-end p-4 border-t border-white/10 shrink-0">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave}>Save Config</Button>
            </div>
          ) : (
            <div className="flex gap-3 justify-end p-4 border-t border-white/10 shrink-0">
              <Button onClick={onClose}>Close</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
