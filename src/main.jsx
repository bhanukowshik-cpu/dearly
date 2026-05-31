import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LaunchFilm from './components/LaunchFilm/LaunchFilm.jsx'
import EmailPreview from './components/EmailPreview/EmailPreview.jsx'
import VoicePlayback from './components/VoicePlayback/VoicePlayback.jsx'

const path = window.location.pathname
const Root = path === '/launch-film'   ? LaunchFilm
           : path === '/email-preview' ? EmailPreview
           : /^\/v\/.+/.test(path)     ? VoicePlayback
           : App

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <Root />
    </StrictMode>
)
