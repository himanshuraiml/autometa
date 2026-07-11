export type LLMProvider = 'Ollama' | 'Gemini' | 'OpenAI' | 'Groq' | 'Custom';

export interface LLMConfig {
  provider: LLMProvider;
  api_key: string;
  model?: string;
  base_url?: string;
}

const KEYS = {
  provider: 'autometa_api_provider',
  geminiKey: 'autometa_gemini_key',
  geminiModel: 'autometa_gemini_model',
  openaiKey: 'autometa_openai_key',
  openaiModel: 'autometa_openai_model',
  groqKey: 'autometa_groq_key',
  groqModel: 'autometa_groq_model',
  customKey: 'autometa_custom_key',
  customModel: 'autometa_custom_model',
  customBaseUrl: 'autometa_custom_base_url',
} as const;

export { KEYS as LLM_STORAGE_KEYS };

/** Reads the currently configured LLM provider/key/model straight from localStorage. */
export const getLLMConfig = (): LLMConfig => {
  const provider = (localStorage.getItem(KEYS.provider) as LLMProvider) || 'Ollama';

  switch (provider) {
    case 'Gemini':
      return {
        provider,
        api_key: localStorage.getItem(KEYS.geminiKey) || '',
        model: localStorage.getItem(KEYS.geminiModel) || undefined,
      };
    case 'OpenAI':
      return {
        provider,
        api_key: localStorage.getItem(KEYS.openaiKey) || '',
        model: localStorage.getItem(KEYS.openaiModel) || undefined,
      };
    case 'Groq':
      return {
        provider,
        api_key: localStorage.getItem(KEYS.groqKey) || '',
        model: localStorage.getItem(KEYS.groqModel) || undefined,
      };
    case 'Custom':
      return {
        provider,
        api_key: localStorage.getItem(KEYS.customKey) || '',
        model: localStorage.getItem(KEYS.customModel) || undefined,
        base_url: localStorage.getItem(KEYS.customBaseUrl) || undefined,
      };
    default:
      return { provider: 'Ollama', api_key: '' };
  }
};
