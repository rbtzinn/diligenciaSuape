import React, { useEffect, useRef, useState } from 'react';
import { CNPJ } from '../../../lib/cnpj';
import { Icons } from '../../../components/ui/Icons';

interface ExperienceLandingProps {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export const ExperienceLanding: React.FC<ExperienceLandingProps> = ({ value, error, onChange, onSubmit }) => {
  const launchTimer = useRef<number | null>(null);
  const [launching, setLaunching] = useState(false);
  const ready = value.trim().length > 0;

  useEffect(() => () => {
    if (launchTimer.current !== null) window.clearTimeout(launchTimer.current);
  }, []);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || launching) return;
    if (!CNPJ.validate(value) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onSubmit();
      return;
    }
    setLaunching(true);
    launchTimer.current = window.setTimeout(() => {
      launchTimer.current = null;
      onSubmit();
    }, 560);
  };

  return (
    <main className={`harbor-landing ${launching ? 'harbor-launching' : ''}`}>
      <div className="harbor-grid" aria-hidden="true" />
      <div className="harbor-landing-content">
        <section className="harbor-copy" aria-labelledby="landing-title">
          <p className="harbor-kicker"><span className="harbor-kicker-dot" /> Plataforma de investigação</p>
          <h1 id="landing-title" className="harbor-title">Conheça a empresa <span>por inteiro.</span></h1>
          <p className="harbor-intro">Um CNPJ abre a pesquisa: pessoas, vínculos, registros públicos e sinais que merecem leitura humana.</p>

          <form className="harbor-form" onSubmit={submit} aria-busy={launching}>
            <label htmlFor="investigation-cnpj">Qual empresa você quer investigar?</label>
            <div className="harbor-search">
              <span className="harbor-search-icon" aria-hidden="true"><Icons.Search size={22} /></span>
              <input
                id="investigation-cnpj"
                name="cnpj"
                type="text"
                autoComplete="off"
                inputMode="text"
                placeholder="Digite o CNPJ"
                value={value}
                onChange={(event) => onChange(CNPJ.mask(event.target.value))}
                readOnly={launching}
                autoFocus
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'investigation-cnpj-error' : undefined}
              />
              <button type="submit" disabled={!ready || launching} aria-label="Iniciar investigação">
                <span>{launching ? 'Preparando...' : 'Investigar'}</span><Icons.ArrowRight size={19} />
              </button>
            </div>
            {error ? <p id="investigation-cnpj-error" className="harbor-error" role="alert"><Icons.AlertCircle size={16} />{error}</p> : null}
            <p className="harbor-form-hint">A consulta utiliza fontes públicas. Nenhuma conclusão dispensa revisão humana.</p>
          </form>

          <div className="harbor-stages" aria-label="Etapas da diligência">
            <div><span>01</span><strong>Consultar</strong><small>Dados e fontes oficiais</small></div>
            <div><span>02</span><strong>Conectar</strong><small>Pessoas e empresas</small></div>
            <div><span>03</span><strong>Compreender</strong><small>Índice e evidências</small></div>
          </div>
        </section>

        <aside className="harbor-radar" aria-hidden="true">
          <div className="harbor-radar-top"><span>MAPA DE INVESTIGAÇÃO</span><span>VISÃO 360°</span></div>
          <div className="harbor-radar-stage">
            <svg viewBox="0 0 520 520" role="presentation">
              <defs>
                <linearGradient id="radar-line" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#8DE9E0" stopOpacity=".8" /><stop offset="1" stopColor="#6295D9" stopOpacity=".45" /></linearGradient>
                <radialGradient id="radar-glow"><stop stopColor="#59BBD3" stopOpacity=".38" /><stop offset="1" stopColor="#59BBD3" stopOpacity="0" /></radialGradient>
              </defs>
              <circle cx="260" cy="260" r="224" fill="url(#radar-glow)" />
              <circle cx="260" cy="260" r="192" className="radar-ring" />
              <circle cx="260" cy="260" r="145" className="radar-ring" />
              <circle cx="260" cy="260" r="96" className="radar-ring" />
              <path d="M260 38V482M38 260H482" className="radar-axis" />
              <path d="M260 260L135 142M260 260L398 127M260 260L421 313M260 260L131 393M135 142L398 127M421 313L398 127" className="radar-link" />
              <circle cx="260" cy="260" r="43" className="radar-core" />
              <circle cx="260" cy="260" r="31" className="radar-core-inner" />
              <circle cx="135" cy="142" r="9" className="radar-node" />
              <circle cx="398" cy="127" r="9" className="radar-node" />
              <circle cx="421" cy="313" r="9" className="radar-node" />
              <circle cx="131" cy="393" r="9" className="radar-node" />
              <text x="260" y="265" textAnchor="middle" className="radar-center-label">EMPRESA</text>
              <text x="80" y="118" className="radar-label">PESSOAS</text>
              <text x="404" y="105" className="radar-label">VÍNCULOS</text>
              <text x="430" y="340" className="radar-label">FONTES</text>
              <text x="58" y="425" className="radar-label">EVIDÊNCIAS</text>
            </svg>
            <div className="harbor-radar-beam" />
          </div>
          <div className="harbor-radar-bottom"><span><i /> FONTES CONECTADAS</span><span>ANÁLISE EM CAMADAS</span></div>
        </aside>
      </div>
    </main>
  );
};
