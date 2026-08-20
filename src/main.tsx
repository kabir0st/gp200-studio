import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AudioEngineProvider } from '@/components/AudioEngineProvider'
import { registerServiceWorker } from '@/core/registerServiceWorker'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AudioEngineProvider>
      <App />
    </AudioEngineProvider>
  </StrictMode>,
)

registerServiceWorker()
