import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './styles/global.css'
import './styles/avatar.css'

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 掛載點')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
