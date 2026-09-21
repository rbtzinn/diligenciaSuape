import React, { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, matchPath, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ViewType } from '../types';
import type { DiligenceItem } from '../features/diligence/types';
import { useAuth } from '../features/auth/context/AuthContext';
import { LoginView } from '../features/auth/components/LoginView';
import { AppShell } from '../components/layout/AppShell';
import { InvestigationWorkspace } from '../features/diligence/components/InvestigationWorkspace';
import { HistoryView } from '../features/history/components/HistoryView';
import { DataSourcesView } from '../features/sources/components/DataSourcesView';
import { useDiligence } from '../features/diligence/hooks/useDiligence';
import { HistoryStorage } from '../features/history/services/history.storage';

const SECTIONS = new Set(['overview', 'suape', 'mapa', 'noticias', 'dossie', 'relatorio']);

function DiligenceIndexRedirect() {
  const { id } = useParams();
  return <Navigate to={`/diligence/${encodeURIComponent(id || '')}/overview`} replace />;
}

export const App: React.FC = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPathRef = useRef(location.pathname);
  currentPathRef.current = location.pathname;

  const routeMatch = matchPath('/diligence/:id/:section', location.pathname);
  const routeId = routeMatch?.params.id;
  const routeSection = routeMatch?.params.section;
  const currentView: ViewType = routeId ? 'dashboard'
    : location.pathname === '/history' ? 'history'
    : location.pathname === '/sources' ? 'sources' : 'chat';

  const [selectedDiligence, setSelectedDiligence] = useState<DiligenceItem | null>(null);
  const [loadedDiligence, setLoadedDiligence] = useState<DiligenceItem | null>(null);
  const [routeLoad, setRouteLoad] = useState<{ id: string; status: 'loading' | 'missing' | 'error' } | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [prefilledCnpj, setPrefilledCnpj] = useState('');

  const updateHistoryBadge = async () => {
    const total = await HistoryStorage.count();
    setHistoryCount(total);
  };

  useEffect(() => {
    if (isAuthenticated) void updateHistoryBadge();
  }, [currentView, isAuthenticated]);

  const {
    isLoading, error, steps, currentDiligence, runDiligence, resetDiligence,
  } = useDiligence((newDiligence) => {
    void updateHistoryBadge();
    setSelectedDiligence(newDiligence);
    // Se o usuário abriu outra tela durante a consulta, o resultado fica salvo.
    if (currentPathRef.current === '/') {
      navigate(`/diligence/${encodeURIComponent(newDiligence.id)}/overview`);
    }
  });

  const routeDiligence = routeId
    ? [selectedDiligence, currentDiligence, loadedDiligence].find((item) => item?.id === routeId) || null
    : null;

  useEffect(() => {
    if (!isAuthenticated || !routeId || routeDiligence) return;
    let active = true;
    setRouteLoad({ id: routeId, status: 'loading' });
    HistoryStorage.getById(routeId)
      .then((item) => {
        if (!active) return;
        if (item) setLoadedDiligence(item);
        else setRouteLoad({ id: routeId, status: 'missing' });
      })
      .catch(() => {
        if (active) setRouteLoad({ id: routeId, status: 'error' });
      });
    return () => { active = false; };
  }, [isAuthenticated, routeId, routeDiligence]);

  const handleOpenDashboard = (diligence: DiligenceItem) => {
    setSelectedDiligence(diligence);
    navigate(`/diligence/${encodeURIComponent(diligence.id)}/overview`);
  };

  const handleNewSearch = () => {
    resetDiligence();
    setSelectedDiligence(null);
    setPrefilledCnpj('');
    navigate('/');
  };

  const handleDrillCompany = (cnpj: string) => {
    resetDiligence();
    setSelectedDiligence(null);
    setPrefilledCnpj(cnpj);
    navigate('/');
    void runDiligence(cnpj);
  };

  if (isAuthLoading) {
    return <div className="grid min-h-dvh w-full place-items-center bg-canvas text-base text-ink-3">Carregando Diligência 360…</div>;
  }
  if (!isAuthenticated) return <LoginView />;

  const workspace = (diligence: DiligenceItem | null) => (
    <InvestigationWorkspace
      diligence={diligence}
      onSearch={runDiligence}
      isLoading={isLoading}
      error={error}
      steps={steps}
      historyCount={historyCount}
      onNewSearch={handleNewSearch}
      onOpenHistory={() => navigate('/history')}
      onOpenSources={() => navigate('/sources')}
      onDrillCompany={handleDrillCompany}
      prefilledCnpj={prefilledCnpj}
    />
  );

  const diligencePage = !routeId || !routeSection || !SECTIONS.has(routeSection)
    ? <Navigate to={routeId ? `/diligence/${encodeURIComponent(routeId)}/overview` : '/'} replace />
    : routeDiligence
      ? workspace(routeDiligence)
      : routeLoad?.id === routeId && routeLoad.status !== 'loading'
        ? (
          <div className="grid min-h-dvh place-content-center gap-4 bg-canvas px-6 text-center text-ink">
            <h1 className="text-xl font-bold">Diligência indisponível</h1>
            <p className="max-w-md text-sm text-ink-3">
              {routeLoad.status === 'missing'
                ? 'Não foi possível encontrar esta diligência no histórico.'
                : 'Não foi possível carregar esta diligência agora.'}
            </p>
            <button type="button" className="text-sm font-semibold text-brand underline" onClick={() => navigate('/history')}>
              Voltar ao histórico
            </button>
          </div>
        )
        : <div role="status" className="grid min-h-dvh place-items-center bg-canvas text-sm text-ink-3">Carregando diligência…</div>;

  return (
    <AppShell
      currentView={currentView}
      onNavigate={(view) => {
        if (view === 'chat') handleNewSearch();
        else if (view === 'dashboard' && routeId) navigate(`/diligence/${encodeURIComponent(routeId)}/overview`);
        else navigate(view === 'history' ? '/history' : '/sources');
      }}
      historyCount={historyCount}
      onSelectRecent={handleOpenDashboard}
      immersive={currentView === 'chat' || currentView === 'dashboard'}
    >
      <Routes>
        <Route path="/" element={workspace(null)} />
        <Route path="/history" element={<HistoryView onOpenDiligence={handleOpenDashboard} onNewDiligence={handleNewSearch} />} />
        <Route path="/sources" element={<DataSourcesView />} />
        <Route path="/diligence/:id" element={<DiligenceIndexRedirect />} />
        <Route path="/diligence/:id/:section" element={diligencePage} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
};
