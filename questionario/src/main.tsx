// ==========================================================
// Questionário de Diligência de SUAPE — entrada
// ==========================================================
// Aplicação à parte do Diligência 360: página pública, sem login e
// sem banco, publicada num projeto próprio da Vercel.
// ==========================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QuestionnaireForm } from './questionnaire/QuestionnaireForm';

// Mesma ordem do app principal: tokens, camadas do Tailwind, base.
import './styles/tokens.css';
import './styles/tailwind.css';
import './styles/base.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Elemento raiz (#root) não encontrado no DOM.');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QuestionnaireForm />
  </React.StrictMode>,
);
