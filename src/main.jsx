import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Vite mounts the application to the element with id "root"
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
