import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'
import './index.css'

// Interceptor to prepend reverse proxy prefix and inject user auth header dynamically
axios.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    if (window.location.pathname.includes('/tlachiametrics') && config.url && config.url.startsWith('/api/')) {
      config.url = '/tlachiametrics' + config.url;
    }
    try {
      const userJson = localStorage.getItem('tlachia_user');
      if (userJson) {
        const u = JSON.parse(userJson);
        if (u?.orcid) {
          config.headers['X-User-ORCID'] = u.orcid;
          config.headers['X-User-Name'] = u.name || '';
        }
      }
    } catch (e) {}
  }
  return config;
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

