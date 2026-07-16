import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AudioEngineProvider } from '@/components/AudioEngineProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AudioEngineProvider>
      <App />
    </AudioEngineProvider>
  </StrictMode>,
)
