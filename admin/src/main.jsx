/* ArixGear ADMIN — SPA entry. One HTML shell at /admin; react-router (basename /admin). */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { bindNavigator } from './lib/nav.js';
import { LangProvider } from './lib/i18n.jsx';

/* binds react-router's navigator into the nav bridge (lib/nav.js) */
function RouterBridge() {
  const nav = useNavigate();
  bindNavigator(nav);
  return null;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename="/admin">
    <RouterBridge />
    <LangProvider>
      <App />
    </LangProvider>
  </BrowserRouter>
);
