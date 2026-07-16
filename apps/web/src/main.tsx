import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initSecretStore } from './utils/secretStore'

// API keys are loaded (and, under Tauri, migrated into the OS keychain)
// before first render so getLLMConfig() can stay synchronous.
initSecretStore().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
