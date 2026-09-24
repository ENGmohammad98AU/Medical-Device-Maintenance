import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { prepareIsolation } from './llm/browserIsolation.js'

document.documentElement.setAttribute('dir', 'rtl')
document.documentElement.setAttribute('lang', 'ar')

document.getElementById('root')!.textContent = 'جارٍ تجهيز النظام…'
void prepareIsolation(new URL(`${import.meta.env.BASE_URL}llm-isolation-worker.js`, location.origin).href).then(() => {
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
})
