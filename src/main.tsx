// ==========================================================
// DILIGÊNCIA 360 — Entrada Principal (main.tsx)
// ==========================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './features/auth/context/AuthContext';
import { App } from './app/App';

// Tokens primeiro: todo o resto os consome.
import './styles/tokens.css';
import './styles/index.css';

// Primitivos de UI, na mesma posição de cascata que ocupavam dentro do index.css.
import './styles/components/button.css';
import './styles/components/badge.css';
import './styles/components/card.css';

import './styles/animations.css';
import './styles/sidebar/navigation.css';
import './styles/sidebar/user-and-recents.css';
import './styles/sidebar/logout-dialog.css';
import './styles/sidebar/workspace-header.css';
import './styles/dashboard.css';
import './styles/dossier-v3/questionnaire.css';
import './styles/dossier-v3/return-review.css';
import './styles/dossier-v3/risk-override.css';
import './styles/dossier-v3/evidence.css';
import './styles/drawer.css';
import './styles/governance-history/coverage.css';
import './styles/governance-history/people.css';
// Telas que só tinham estilo dentro do responsive-overrides.
// Importadas imediatamente antes dele para manter a ordem de cascata.
import './styles/components/history.css';
import './styles/components/sources.css';
import './styles/components/help.css';
import './styles/components/person-sanctions.css';

import './styles/responsive-overrides.css';
import './styles/investigation-experience/landing.css';
import './styles/investigation-experience/progress.css';
import './styles/investigation-experience/summary.css';
import './styles/investigation-experience/actions.css';
import './styles/investigation-experience/responsive.css';

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
