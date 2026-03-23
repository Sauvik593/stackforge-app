import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Hide the static SEO HTML the moment React boots.
// Crawlers see the full content in the raw HTML.
// Real users see the React app — no flash of static content.
const staticEl = document.getElementById('sf-static')
if (staticEl) staticEl.style.display = 'none'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
