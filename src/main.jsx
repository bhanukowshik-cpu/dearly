import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LaunchFilm from './components/LaunchFilm/LaunchFilm.jsx'
import EmailPreview from './components/EmailPreview/EmailPreview.jsx'

const path = window.location.pathname
const Root = path === '/launch-film'   ? LaunchFilm
           : path === '/email-preview' ? EmailPreview
           : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
