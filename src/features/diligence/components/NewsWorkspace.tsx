import { useMemo, useState } from 'react';
import type { AdverseMediaStatus, DiligenceItem } from '../types';
import { Button } from '../../../components/ui/Button';
import { AdverseMediaCard } from './AdverseMediaCard';
import { newsSubjects, safeNewsUrl } from '../utils/newsResults';

interface Props {
  diligence: DiligenceItem;
  busy: boolean;
  saving: boolean;
  notice: string | null;
  progress: Record<string, number | null>;
  onSearch: (subject: string, restart?: boolean) => void;
  onSave: () => void;
  onReview: (id: string, status: AdverseMediaStatus) => void;
  onAudit: () => void;
}

export function NewsWorkspace({ diligence, busy, saving, notice, progress, onSearch, onSave, onReview, onAudit }: Props) {
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [domain, setDomain] = useState('');
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState('relevance');
  const [limit, setLimit] = useState(20);
  const media = diligence.adverseMedia;
  const results = useMemo(() => media?.results || [], [media]);
  const people = [...new Set((diligence.socios || []).filter((p) => (p.cnpj_cpf_do_socio?.includes('*') || (p.cnpj_cpf_do_socio || '').replace(/\D/g, '').length !== 14) && p.nome_socio?.trim().split(/\s+/).length > 1).map((p) => p.nome_socio))];
  const domains = [...new Set(results.map((r) => r.domain).filter(Boolean))].sort();
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = useMemo(() => results.filter((r) => {
    if (subject && !newsSubjects(r).includes(subject)) return false;
    if (domain && r.domain !== domain) return false;
    if (kind === 'attention' && !r.matchedTerms.length) return false;
    if (kind === 'discarded' ? r.status !== 'discarded' : r.status === 'discarded') return false;
    return normalize([r.title, r.snippet, r.domain, ...newsSubjects(r)].join(' ')).includes(normalize(text));
  }).sort((a, b) => sort === 'date'
    ? (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0)
    : Number(b.matchStrength === 'high') - Number(a.matchStrength === 'high') || b.matchedTerms.length - a.matchedTerms.length),
  [results, subject, domain, kind, text, sort]);
  const finished = progress[subject] === null;
  const fieldClass = 'w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink';
  const failed = media?.queriesExecuted?.filter((q) => !q.ok || q.partial).length || 0;

  return <section className="mx-auto w-full max-w-6xl min-w-0 space-y-5 overflow-y-auto p-4 sm:p-6" aria-label="Notícias e links">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">Pesquisa de fontes públicas</p>
        <h1 className="text-2xl font-bold text-ink">Notícias e links</h1>
        <p className="mt-1 break-words text-sm text-ink-2">{diligence.razaoSocial} · {results.length} publicações reunidas</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onSave} disabled={busy || !media} isLoading={saving} loadingLabel="Salvando…">Salvar no dossiê</Button>
    </header>

    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="min-w-0 text-xs font-semibold text-ink-2">Quem você quer pesquisar?
          <select className={`${fieldClass} mt-1`} value={subject} disabled={busy || saving} onChange={(e) => { setSubject(e.target.value); setLimit(20); }}>
            <option value="">Empresa e todas as pessoas</option>
            <option value={diligence.razaoSocial}>{diligence.razaoSocial} (empresa)</option>
            {people.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <Button variant="secondary" onClick={() => onSearch(subject, finished)} disabled={saving} isLoading={busy} loadingLabel="Buscando publicações…">
          {finished ? 'Pesquisar novamente' : progress[subject] === undefined ? 'Ampliar busca gratuita' : 'Continuar busca gratuita'}
        </Button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">Busca por nome, contexto da empresa, localidade e termos de investigação. O CPF mascarado complementa a pesquisa quando disponível; ele não confirma sozinho a identidade.</p>
      {progress[subject] !== undefined && <p className="mt-2 text-xs text-ink-2">{finished ? 'Etapas deste plano percorridas. Isso não significa cobertura de toda a internet.' : `${progress[subject]} consultas percorridas; há outras etapas disponíveis.`}</p>}
      <p className="mt-2 text-xs text-ink-3">Sem API paga nesta busca. As fontes gratuitas podem limitar ou interromper consultas.</p>
    </div>

    {notice && <p role="status" className="rounded-md border border-line p-3 text-sm text-ink-2">{notice}</p>}
    {(!media?.ok || media.consultaParcial || failed > 0) && <div className="rounded-md border border-line p-3 text-sm text-ink-2">
      <strong>Cobertura incompleta.</strong> {failed > 0 ? `${failed} consultas com falha ou resposta parcial. ` : ''}{media?.aviso || 'Não foi possível verificar todas as fontes.'}
      {Boolean(media?.queriesExecuted?.length) && <button className="ml-2 underline" onClick={onAudit}>Ver consultas e fontes</button>}
    </div>}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-semibold text-ink-2">Filtrar publicações
        <input className={`${fieldClass} mt-1`} placeholder="Nome, palavra ou assunto" value={text} onChange={(e) => { setText(e.target.value); setLimit(20); }} />
      </label>
      <label className="text-xs font-semibold text-ink-2">Fonte
        <select className={`${fieldClass} mt-1`} value={domain} onChange={(e) => { setDomain(e.target.value); setLimit(20); }}><option value="">Todas as fontes</option>{domains.map((d) => <option key={d}>{d}</option>)}</select>
      </label>
      <label className="text-xs font-semibold text-ink-2">Conteúdo
        <select className={`${fieldClass} mt-1`} value={kind} onChange={(e) => { setKind(e.target.value); setLimit(20); }}><option value="all">Todas as menções</option><option value="attention">Com termos de atenção</option><option value="discarded">Descartadas na revisão</option></select>
      </label>
      <label className="text-xs font-semibold text-ink-2">Ordenação
        <select className={`${fieldClass} mt-1`} value={sort} onChange={(e) => setSort(e.target.value)}><option value="relevance">Correlação e termos</option><option value="date">Mais recentes primeiro</option></select>
      </label>
    </div>

    <div className="space-y-3" aria-busy={busy}>
      <p className="text-xs text-ink-3">{filtered.length} publicações neste filtro · títulos abrem a fonte em outra aba</p>
      {filtered.slice(0, limit).map((item) => <AdverseMediaCard key={item.id} item={item} onStatusChange={saving || busy ? undefined : onReview} />)}
      {!filtered.length && <p className="py-8 text-center text-sm text-ink-3">Nenhuma publicação neste filtro. Ajuste os filtros ou amplie a busca.</p>}
      {filtered.length > limit && <Button variant="secondary" onClick={() => setLimit(limit + 20)}>Mostrar mais 20 publicações</Button>}
    </div>

    <details className="rounded-md border border-line p-4">
      <summary className="cursor-pointer font-semibold text-ink">Diários oficiais · {diligence.officialGazettes?.results?.length || 0} publicações</summary>
      {!diligence.officialGazettes?.ok && <p className="mt-3 text-sm text-ink-3">A fonte de diários não respondeu nesta diligência.</p>}
      <ul className="divide-y divide-line-soft">
        {(diligence.officialGazettes?.results || []).filter((g) => !subject || !g.subjectName || g.subjectName === subject).map((g) => <li className="min-w-0 py-3 text-sm" key={g.id}>
          {safeNewsUrl(g.url || g.txtUrl) ? <a className="font-semibold underline" href={safeNewsUrl(g.url || g.txtUrl)} target="_blank" rel="noopener noreferrer">{g.territoryName} · {g.date || 'Data não informada'} ↗</a> : <strong>{g.territoryName} · Link indisponível</strong>}
          <p className="mt-1 break-words text-ink-2">{g.subjectName} · {g.excerpts?.[0]}</p>
        </li>)}
      </ul>
    </details>
  </section>;
}
