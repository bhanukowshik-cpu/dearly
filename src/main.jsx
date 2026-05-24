import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LaunchFilm from './components/LaunchFilm/LaunchFilm.jsx'

const Root = window.location.pathname === '/launch-film' ? LaunchFilm : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
