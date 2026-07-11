import { useEffect, useState } from 'react';
import { Settings, Sparkles, Blocks } from 'lucide-react';
import { Button } from '@autometa/ui';
import { PluginManager } from './PluginManager';
import { LLM_STORAGE_KEYS, type LLMProvider } from '../utils/llmConfig';

export type SettingsTab = 'ai' | 'plugins';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'ai', label: 'AI Models', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'plugins', label: 'Plugins', icon: <Blocks className="w-3.5 h-3.5" /> },
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
    className={`w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00f0ff] ${mono ? 'font-mono' : ''}`}
  />
);

export const SettingsModal = ({ isOpen, onClose, initialTab = 'ai' }: SettingsModalProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

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

  // Re-hydrate from localStorage every time the modal opens so edits from a
  // previous session (or a different tab) are reflected instead of stale defaults.
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setProvider((localStorage.getItem(LLM_STORAGE_KEYS.provider) as LLMProvider) || 'Ollama');
    setGeminiKey(localStorage.getItem(LLM_STORAGE_KEYS.geminiKey) || '');
    setGeminiModel(localStorage.getItem(LLM_STORAGE_KEYS.geminiModel) || '');
    setOpenaiKey(localStorage.getItem(LLM_STORAGE_KEYS.openaiKey) || '');
    setOpenaiModel(localStorage.getItem(LLM_STORAGE_KEYS.openaiModel) || '');
    setGroqKey(localStorage.getItem(LLM_STORAGE_KEYS.groqKey) || '');
    setGroqModel(localStorage.getItem(LLM_STORAGE_KEYS.groqModel) || '');
    setCustomBaseUrl(localStorage.getItem(LLM_STORAGE_KEYS.customBaseUrl) || '');
    setCustomModel(localStorage.getItem(LLM_STORAGE_KEYS.customModel) || '');
    setCustomKey(localStorage.getItem(LLM_STORAGE_KEYS.customKey) || '');
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem(LLM_STORAGE_KEYS.provider, provider);
    localStorage.setItem(LLM_STORAGE_KEYS.geminiKey, geminiKey);
    localStorage.setItem(LLM_STORAGE_KEYS.geminiModel, geminiModel);
    localStorage.setItem(LLM_STORAGE_KEYS.openaiKey, openaiKey);
    localStorage.setItem(LLM_STORAGE_KEYS.openaiModel, openaiModel);
    localStorage.setItem(LLM_STORAGE_KEYS.groqKey, groqKey);
    localStorage.setItem(LLM_STORAGE_KEYS.groqModel, groqModel);
    localStorage.setItem(LLM_STORAGE_KEYS.customBaseUrl, customBaseUrl);
    localStorage.setItem(LLM_STORAGE_KEYS.customModel, customModel);
    localStorage.setItem(LLM_STORAGE_KEYS.customKey, customKey);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl h-[600px] max-h-[90vh] bg-[#0a0f1d] border border-white/10 rounded-2xl shadow-2xl animate-fade-in select-none flex overflow-hidden">
        {/* Left tab rail */}
        <div className="w-48 shrink-0 border-r border-white/10 bg-black/30 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 px-2 pb-4 mb-2 border-b border-white/10">
            <Settings className="w-4 h-4 text-[#00f0ff] animate-spin-slow" />
            <span className="text-xs font-black uppercase tracking-widest text-white">Settings</span>
          </div>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer border text-left ${
                activeTab === tab.id
                  ? 'bg-[#00f0ff]/10 text-[#00f0ff] border-[#00f0ff]/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 bg-transparent border-transparent'
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
            {activeTab === 'ai' && (
              <>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">AI Model Configuration</h3>

                <div className="flex flex-col gap-1">
                  <FieldLabel>LLM Provider</FieldLabel>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as LLMProvider)}
                    className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00f0ff]"
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

            {activeTab === 'plugins' && <PluginManager />}
          </div>

          {activeTab === 'ai' && (
            <div className="flex gap-3 justify-end p-4 border-t border-white/10 shrink-0">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave}>Save Config</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
