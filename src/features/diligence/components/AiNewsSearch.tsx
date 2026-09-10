import { useEffect, useRef, useState } from 'react';
import type { AiLeadsResult, DiligenceItem } from '../types';
import { ApiError, request } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { safeNewsUrl } from '../utils/newsResults';
import {
  browserNewsStorage,
  loadNewsSession,
  mergeNewsResult,
  newsSessionStorageKey,
  queryKey,
  saveNewsSession,
  type NewsSession,
} from '../services/ai-news-session';

type Props = { diligence: DiligenceItem; subject: string };

export function AiNewsSearch(props: Props) {
  return <ResearchPanel key={`${props.diligence.id}:${props.subject}`} {...props} />;
}

function ResearchPanel({ diligence, subject }: Props) {
  const storageKey = newsSessionStorageKey(diligence.id, subject);
  const [session, setSession] = useState(() => loadNewsSession(browserNewsStorage(), storageKey));
  const current = useRef(session);
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(6);
  const [cooldown, setCooldown] = useState(0);
  const [cooling, setCooling] = useState(false);
  useEffect(() => () => { active.current?.abort(); }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooling(false), Math.max(0, cooldown - Date.now()));
    return () => clearTimeout(timer);
  }, [cooldown]);

  const commit = (value: NewsSession) => {
    current.current = value;
    setSession(value);
    saveNewsSession(browserNewsStorage(), storageKey, value);
  };
  const search = async () => {
    if (active.current || cooling) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    const input = {
      empresa: { razaoSocial: diligence.razaoSocial, nomeFantasia: diligence.nomeFantasia, cnpj: diligence.cnpj,
        municipio: diligence.empresa?.municipio, uf: diligence.empresa?.uf },
      socios: (diligence.socios || []).filter((p) => !subject || p.nome_socio === subject).map((p) => ({ nome_socio: p.nome_socio })),
    };
    const call = (step: 'plan' | 'search', body: object) => request<AiLeadsResult>(`/api/ai/news-research/${step}`, {
      method: 'POST', timeoutMs: step === 'plan' ? 50000 : 25000,
      requireAuth: true, signal: controller.signal, body: JSON.stringify({ ...input, ...body }),
    });
    // A resume executes saved queries without spending another AI call.
    const targetRound = current.current.pending.length ? current.current.round : current.current.round + 2;
    try {
      while (current.current.pending.length || current.current.round < targetRound) {
        if (controller.signal.aborted) break;
        let state = current.current;
        if (!state.pending.length) {
          setPhase(`Preparando consultas · rodada ${state.round + 1}`);
          const plan = await call('plan', { contexto: {
            consultasExecutadas: (state.result.consultasExecutadas || []).map((q) => q.termo),
            resultados: (state.result.resultados || []).slice(0, 12).map(({ title, snippet }) => ({ title, snippet })),
          } });
          if (controller.signal.aborted) break;
          if (!plan.ok) throw new Error(plan.erro || 'Não foi possível preparar as consultas.');
          state = { ...state, round: state.round + 1, pending: plan.consultas || [], result: mergeNewsResult(state.result, plan) };
          commit(state);
          if (!state.pending.length) break;
        }
        const batch = [...state.pending];
        for (let i = 0; i < batch.length; i += 2) {
          if (controller.signal.aborted) break;
          setPhase(`Pesquisando fontes · rodada ${state.round} · consultas ${i + 1}–${Math.min(i + 2, batch.length)}`);
          const response = await call('search', { consultas: batch.slice(i, i + 2) });
          if (controller.signal.aborted) break;
          const completed = new Set((response.consultasExecutadas || []).filter((q) => q.ok).map(queryKey));
          const previous = current.current;
          commit({ ...previous, result: mergeNewsResult(previous.result, response),
            pending: previous.pending.filter((q) => !completed.has(queryKey(q))) });
        }
        if (controller.signal.aborted) break;
        if (current.current.pending.length) {
          throw new Error('Algumas consultas não responderam. Use Continuar pesquisa para tentar apenas as pendentes. Veja os detalhes das fontes abaixo.');
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'A etapa falhou. Seus resultados anteriores foram preservados.');
        if (err instanceof ApiError && (err.status === 429 || err.retryAfterSeconds)) {
          setCooldown(Date.now() + (err.retryAfterSeconds || 60) * 1000);
          setCooling(true);
        }
      }
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); setPhase(''); }
    }
  };
  const result = session.result;
  const queries = result.consultasExecutadas || [];
  const links = result.resultados?.filter((item) => safeNewsUrl(item.url)) || [];
  const hasProgress = session.round > 0 || queries.length > 0;
  return <section className="min-w-0 overflow-hidden rounded-xl border border-brand/20 bg-surface shadow-sm" aria-label="Pesquisa ampliada com IA">
    <div className="flex flex-col items-stretch gap-4 bg-brand-soft p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-brand">Mais caminhos de pesquisa</p>
        <h2 className="mt-1 text-lg font-bold text-ink">Pesquisa ampliada com IA</h2>
        <p className="mt-2 max-w-prose text-sm text-ink-2">A IA prepara consultas e usa os títulos e trechos encontrados para sugerir novas pesquisas. Os links aparecem conforme as etapas terminam.</p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:shrink-0">
        <Button className="w-full" variant="primary" onClick={search} disabled={cooling} isLoading={busy} loadingLabel="Pesquisando…">
          {cooling ? 'Aguarde o limite liberar' : session.pending.length ? 'Continuar pesquisa' : hasProgress ? 'Aprofundar pesquisa' : 'Pesquisar com IA'}
        </Button>
        {busy && <Button variant="secondary" size="sm" onClick={() => active.current?.abort()}>Pausar pesquisa</Button>}
      </div>
    </div>
    <div className="min-w-0 space-y-3 p-4 [overflow-wrap:anywhere] sm:p-5">
      <p className="text-xs text-ink-3">Até duas rodadas por vez, com quatro consultas por rodada. A disponibilidade depende das fontes e da cota gratuita.</p>
      {busy && <p role="status" className="text-sm text-brand">{phase}</p>}
      {error && <p role="alert" className="text-sm text-high-text">{error}</p>}
      {cooling && <p className="text-xs text-ink-2">Novas tentativas foram pausadas. O botão será liberado após o intervalo informado; a disponibilidade da cota ainda depende do provedor.</p>}
      {hasProgress && <>
        <p className="text-sm font-semibold text-ink">{subject || 'Empresa e quadro societário'} · {links.length} links · {queries.filter((q) => q.ok).length} consultas respondidas{session.pending.length ? ` · ${session.pending.length} pendentes` : ''}</p>
        <p className="text-xs text-ink-3">Resultados preservados nesta aba mesmo ao atualizar a página ou navegar pelo dossiê.</p>
        {result.modelo && <p className="text-xs text-ink-3">Plano: {result.provedor} · {result.modelo}</p>}
        <p className="text-xs text-ink-3">{result.aviso}</p>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {links.slice(0, limit).map((item) => <article key={item.url} className="min-w-0 rounded-lg border border-line p-4 [overflow-wrap:anywhere]">
            <a className="font-semibold text-brand hover:underline" href={safeNewsUrl(item.url)} target="_blank" rel="noopener noreferrer">{item.title} ↗</a>
            <p className="mt-1 text-xs text-ink-3">{item.domain}{item.publishedAt ? ` · ${item.publishedAt}` : ''}</p>
            <p className="mt-2 text-sm text-ink-2">{item.snippet}</p>
            <details className="mt-3 text-xs text-ink-3"><summary className="cursor-pointer">Como este link foi encontrado</summary><p className="mt-2">{item.origemConsulta}</p><p>{item.motivoDaConsulta}</p></details>
          </article>)}
        </div>
        {!links.length && !busy && <p className="text-sm text-ink-2">{queries.some((q) => q.ok) ? 'As consultas respondidas não retornaram links. Isso não comprova ausência de notícias.' : 'Ainda não houve uma consulta concluída. Confira as falhas e retome a pesquisa.'}</p>}
        {links.length > limit && <Button variant="secondary" onClick={() => setLimit((n) => n + 6)}>Mostrar mais links</Button>}
        <details className="text-xs text-ink-3"><summary className="cursor-pointer">Consultas e disponibilidade das fontes</summary>
          <ul className="mt-2 space-y-3">{queries.map((query) => <li key={queryKey(query)}>
            <p>{query.termo} · {query.ok ? `${query.resultCount || 0} resultados${query.partial ? ' · cobertura parcial' : ''}` : query.erro || 'Consulta não concluída'}</p>
            <ul className="mt-1 space-y-1">{query.attempts?.filter((a) => !a.skipped).map((a, i) => <li key={i}>{a.provider}: {a.ok ? 'respondeu' : a.erro || `HTTP ${a.status || 502}`}</li>)}</ul>
          </li>)}</ul>
        </details>
      </>}
    </div>
  </section>;
}
