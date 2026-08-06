/**
 * Storage for LLM API keys.
 *
 * - Inside the Tauri desktop app, keys live in the OS keychain (macOS Keychain
 *   / Windows Credential Manager) via the shell's `secret_get`/`secret_set`
 *   commands. Any value found in localStorage is migrated into the keychain
 *   once and then removed, so plaintext keys don't linger on disk.
 * - In plain web dev there is no keychain; keys stay in localStorage.
 *
 * `initSecretStore()` must complete before the first `getSecret` call —
 * main.tsx awaits it before rendering — so reads can stay synchronous for
 * callers like getLLMConfig() that run inside request handlers.
 */

export const SECRET_NAMES = [
  'autometa_gemini_key',
  'autometa_openai_key',
  'autometa_groq_key',
  'autometa_custom_key',
  'autometa_github_token',
] as const;

export type SecretName = (typeof SECRET_NAMES)[number];

const cache = new Map<SecretName, string>();
let useKeychain = false;

const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function initSecretStore(): Promise<void> {
  if (!isTauri()) {
    for (const name of SECRET_NAMES) {
      cache.set(name, localStorage.getItem(name) || '');
    }
    return;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    for (const name of SECRET_NAMES) {
      let value = (await invoke<string | null>('secret_get', { name })) || '';

      // One-time migration of a key stored by an older build in localStorage.
      const legacy = localStorage.getItem(name);
      if (!value && legacy) {
        await invoke('secret_set', { name, value: legacy });
        value = legacy;
      }
      if (legacy !== null) localStorage.removeItem(name);

      cache.set(name, value);
    }
    useKeychain = true;
  } catch (err) {
    // Older shell without the commands: fall back to localStorage semantics.
    console.error('Keychain unavailable, falling back to localStorage:', err);
    for (const name of SECRET_NAMES) {
      cache.set(name, localStorage.getItem(name) || '');
    }
  }
}

export function getSecret(name: SecretName): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  // Not initialized yet (shouldn't happen — init runs before render).
  return localStorage.getItem(name) || '';
}

export async function setSecret(name: SecretName, value: string): Promise<void> {
  cache.set(name, value);
  if (useKeychain) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('secret_set', { name, value });
  } else {
    localStorage.setItem(name, value);
  }
}
