// ==========================================================
// DILIGÊNCIA 360 — Entrada Principal (main.tsx)
// ==========================================================

import React from 'react';
import ReactDOM from 'react-dom/client';

// Ordem obrigatória. Os tokens vêm primeiro porque todo o resto os
// consome; tailwind.css declara a ordem das camadas logo depois; e
// base.css entra na camada `base`, abaixo dos utilitários.
import './styles/tokens.css';
import './styles/tailwind.css';
import './styles/base.css';
import './styles/experience.css';
import './styles/suape-layout.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento raiz (#root) não encontrado no DOM.');
}

const root = ReactDOM.createRoot(rootElement);

// O Questionário de Diligência é respondido pela empresa, de fora de
// SUAPE: não tem login e não pode depender do Firebase. Por isso não
// passa pelo App — o módulo do Firebase falha ao carregar sem as
// variáveis de ambiente, e levaria a página pública junto.
const isPublicQuestionnaire = /^\/questionario\/?$/.test(window.location.pathname);

if (isPublicQuestionnaire) {
  void import('./features/questionnaire/QuestionnaireForm').then(({ QuestionnaireForm }) => {
    document.title = 'Questionário de Diligência — SUAPE';
    root.render(
      <React.StrictMode>
        <QuestionnaireForm />
      </React.StrictMode>,
    );
  });
} else {
  void Promise.all([
    import('react-router-dom'),
    import('./features/auth/context/AuthContext'),
    import('./app/App'),
  ]).then(([{ BrowserRouter }, { AuthProvider }, { App }]) => {
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </React.StrictMode>,
    );
  });
}
