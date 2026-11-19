
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { bindNavigator } from './lib/go.js';
import { LangProvider } from './lib/i18n.jsx';
import { listenForThemeUpdates, loadPublishedTheme } from './lib/theme.js';

loadPublishedTheme().catch(() => {});
listenForThemeUpdates();


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

/* binds react-router's navigator into the legacy go() bridge (lib/go.js) */
function RouterBridge() {
  const nav = useNavigate();
  bindNavigator(nav);
  return null;
}

createRoot(document.getElementById('root')).render(
  <LangProvider>
    <BrowserRouter>
      <RouterBridge />
      <App />
    </BrowserRouter>
  </LangProvider>
);
