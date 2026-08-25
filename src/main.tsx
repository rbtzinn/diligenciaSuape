// ==========================================================
// DILIGÊNCIA 360 — Entrada Principal (main.tsx)
// ==========================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './features/auth/context/AuthContext';
import { App } from './app/App';

import './styles/index.css';
import './styles/animations.css';
import './styles/sidebar.css';
import './styles/chat.css';
import './styles/dashboard.css';
import './styles/dossier-v3.css';
import './styles/kpi.css';
import './styles/drawer.css';
import './styles/governance-history.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento raiz (#root) não encontrado no DOM.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
