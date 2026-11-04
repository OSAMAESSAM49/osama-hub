import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { initPrefs } from '@/i18n'
import { loadFonts } from '@/services/fonts'
import { initPwa } from '@/services/pwa'
import '@/styles/index.css'

initPrefs()
initPwa()

const fontsReady = loadFonts().catch(() => undefined)
const timeout = new Promise((resolve) => setTimeout(resolve, 1500))

// A short wait keeps the first paint in the right typeface, without ever blocking on a slow load.
void Promise.race([fontsReady, timeout]).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
