// ==========================================================
// DILIGÊNCIA 360 — Entrada Principal (main.tsx)
// ==========================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './features/auth/context/AuthContext';
import { App } from './app/App';

// Ordem obrigatória. Os tokens vêm primeiro porque todo o resto os
// consome; tailwind.css declara a ordem das camadas logo depois; e
// base.css entra na camada `base`, abaixo dos utilitários.
import './styles/tokens.css';
import './styles/tailwind.css';
import './styles/base.css';

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
