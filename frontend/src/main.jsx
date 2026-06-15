import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { initTheme } from './hooks/useTheme.js'
import { validateClientEnv } from './lib/validateEnv.js'
import './styles/theme.css'
import './index.css'
import './App.css'
import './styles/saas-ui.css'
import App from './App.jsx'

initTheme()
validateClientEnv()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
