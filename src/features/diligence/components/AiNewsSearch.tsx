import { useState } from 'react';
import type { AiLeadsResult, DiligenceItem } from '../types';
import { request } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { safeNewsUrl } from '../utils/newsResults';

export function AiNewsSearch({ diligence, subject }: { diligence: DiligenceItem; subject: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiLeadsResult>();
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(6);
  const [searchedSubject, setSearchedSubject] = useState('');
  const search = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await request<AiLeadsResult>('/api/ai/news-research', {
        method: 'POST', timeoutMs: 180000,
        body: JSON.stringify({
          empresa: { razaoSocial: diligence.razaoSocial, nomeFantasia: diligence.nomeFantasia, cnpj: diligence.cnpj,
            municipio: diligence.empresa?.municipio, uf: diligence.empresa?.uf },
          socios: (diligence.socios || []).filter((person) => !subject || person.nome_socio === subject)
            .map((person) => ({ nome_socio: person.nome_socio })),
        }),
      });
      if (!response.ok) throw new Error(response.erro || 'A pesquisa não pôde ser concluída.');
      setResult(response);
      setSearchedSubject(subject || 'Empresa e quadro societário');
      setLimit(6);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na pesquisa.');
    } finally { setBusy(false); }
  };
  const links = result?.resultados?.filter((item) => safeNewsUrl(item.url)) || [];
  return <section className="min-w-0 overflow-hidden rounded-xl border border-brand/20 bg-surface shadow-sm" aria-label="Pesquisa ampliada com IA">
    <div className="flex flex-col items-stretch gap-4 bg-brand-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-brand">Mais caminhos de pesquisa</p>
        <h2 className="mt-1 text-lg font-bold text-ink">Pesquisa ampliada com IA</h2>
        <p className="mt-2 max-w-prose text-sm text-ink-2">A IA cria consultas sobre a empresa e os nomes selecionados, pesquisa na web e usa os resultados para escolher novas buscas.</p>
      </div>
      <Button className="w-full sm:w-auto sm:shrink-0" variant="primary" onClick={search} isLoading={busy} loadingLabel="Pesquisando na web…">Pesquisar com IA</Button>
    </div>
    <div className="min-w-0 space-y-3 p-4 [overflow-wrap:anywhere] sm:p-5">
      <p className="text-xs text-ink-3">Até duas rodadas e 12 consultas. Os links vêm dos buscadores; a disponibilidade depende das fontes e da cota de IA configurada.</p>
      {busy && <p role="status" className="text-sm text-brand">Planejando consultas e pesquisando novas fontes. Isso pode levar alguns minutos.</p>}
      {error && <p role="alert" className="text-sm text-high-text">{error}</p>}
      {result && <>
        <p className="text-sm font-semibold text-ink">{searchedSubject} · {links.length} links · {result.consultasExecutadas?.length || 0} consultas</p>
        <p className="text-xs text-ink-3">{result.aviso}</p>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {links.slice(0, limit).map((item) => <article key={item.url} className="min-w-0 rounded-lg border border-line p-4 [overflow-wrap:anywhere]">
            <a className="font-semibold text-brand hover:underline" href={safeNewsUrl(item.url)} target="_blank" rel="noopener noreferrer">{item.title} ↗</a>
            <p className="mt-1 text-xs text-ink-3">{item.domain}{item.publishedAt ? ` · ${item.publishedAt}` : ''}</p>
            <p className="mt-2 text-sm text-ink-2">{item.snippet}</p>
            <details className="mt-3 text-xs text-ink-3"><summary className="cursor-pointer">Como este link foi encontrado</summary><p className="mt-2">{item.origemConsulta}</p><p>{item.motivoDaConsulta}</p></details>
          </article>)}
        </div>
        {!links.length && <p className="text-sm text-ink-2">Nenhum link retornado nesta pesquisa.</p>}
        {links.length > limit && <Button variant="secondary" onClick={() => setLimit((n) => n + 6)}>Mostrar mais links</Button>}
        <details className="text-xs text-ink-3"><summary className="cursor-pointer">Consultas executadas</summary><ul className="mt-2 space-y-2 [overflow-wrap:anywhere]">{result.consultasExecutadas?.map((query, i) => <li key={i}>{query.termo} · {query.ok ? `${query.resultCount || 0} resultados` : 'Falhou'}</li>)}</ul></details>
      </>}
    </div>
  </section>;
}
