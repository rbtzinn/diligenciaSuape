// ==========================================================
// DILIGÊNCIA 360 — Seção de Processos Judiciais (DataJud)
// Enriquecimento e auditoria processual oficial por número CNJ
// ==========================================================

import React, { useState } from 'react';
import { JudicialProcessItem } from '../types';
import { DiligenceService } from '../services/diligence.service';
import { JudicialProcessCard } from './JudicialProcessCard';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface JudicialSectionProps {
  processos: JudicialProcessItem[];
  onAddProcesso: (processo: JudicialProcessItem) => void;
  onRemoveProcesso: (numeroLimpo: string) => void;
  onOpenDetails: (processo: JudicialProcessItem) => void;
}

export const JudicialSection: React.FC<JudicialSectionProps> = ({
  processos,
  onAddProcesso,
  onRemoveProcesso,
  onOpenDetails,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleMask = (val: string) => {
    let clean = val.replace(/\D/g, '').substring(0, 20);
    if (clean.length > 16) {
      clean = clean.replace(/^(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{0,4})/, '$1-$2.$3.$4.$5.$6');
    } else if (clean.length > 14) {
      clean = clean.replace(/^(\d{7})(\d{2})(\d{4})(\d{1})(\d{0,2})/, '$1-$2.$3.$4.$5');
    } else if (clean.length > 13) {
      clean = clean.replace(/^(\d{7})(\d{2})(\d{4})(\d{0,1})/, '$1-$2.$3.$4');
    } else if (clean.length > 9) {
      clean = clean.replace(/^(\d{7})(\d{2})(\d{0,4})/, '$1-$2.$3');
    } else if (clean.length > 7) {
      clean = clean.replace(/^(\d{7})(\d{0,2})/, '$1-$2');
    }
    return clean;
  };

  const handleSearch = async (numToSearch: string) => {
    const clean = numToSearch.replace(/\D/g, '');
    if (clean.length !== 20) {
      setErrorMsg('Número CNJ inválido. Informe os 20 dígitos no formato NNNNNNN-DD.AAAA.J.TR.OOOO');
      return;
    }
    if (processos.some((p) => p.numeroLimpo === clean)) {
      setErrorMsg('Este processo já foi vinculado à presente diligência.');
      return;
    }

    setErrorMsg(null);
    setLoadingStep('Consultando DataJud...');

    try {
      const res = await DiligenceService.getProcessoJudicial(clean);
      if (!res.ok) {
        setErrorMsg(res.erro || 'Processo não localizado no tribunal competente.');
        setLoadingStep(null);
        return;
      }

      const newProcess: JudicialProcessItem = {
        numero: res.numero || numToSearch,
        numeroLimpo: res.numeroLimpo || clean,
        tribunal: res.tribunal || 'Tribunal',
        tribunalNome: res.tribunalNome || '',
        grau: res.grau || 'G1',
        classe: res.classe || { codigo: 0, nome: 'Não informada' },
        categoria: res.categoria || { id: 'outros', label: 'Outras Ações', badgeVariant: 'neutral' },
        assuntos: res.assuntos || [],
        orgaoJulgador: res.orgaoJulgador || { codigo: 0, nome: 'Não informado' },
        dataAjuizamento: res.dataAjuizamento || '',
        nivelSigilo: res.nivelSigilo ?? 0,
        sistema: res.sistema || 'PJe',
        formato: res.formato || 'Eletrônico',
        ultimaAtualizacao: res.ultimaAtualizacao || '',
        totalMovimentos: res.totalMovimentos || 0,
        movimentos: res.movimentos || [],
        fonte: res.fonte || 'CNJ - DataJud',
        consultadoEm: res.consultadoEm || new Date().toISOString(),
      };

      onAddProcesso(newProcess);
      setInputVal('');
      setIsAdding(false);
      setLoadingStep(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro na comunicação');
      setLoadingStep(null);
    }
  };

  return (
    <Card
      title="Processos Judiciais (DataJud / CNJ)"
      icon={<Icons.Scale size={16} />}
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="badge badge-neutral" style={{ fontSize: 'var(--text-2xs)' }}>
            {processos.length} vinculado(s)
          </span>
          {!isAdding && (
            <Button
              variant="primary"
              size="sm"
              icon={<Icons.Plus size={14} />}
              onClick={() => {
                setIsAdding(true);
                setErrorMsg(null);
              }}
            >
              Adicionar processo
            </Button>
          )}
        </div>
      }
      className="dash-full-width"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {isAdding && (
          <div
            className="animate-fade-in"
            style={{
              padding: '1rem',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
                Enriquecer Processo Judicial via CNJ
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setIsAdding(false);
                  setErrorMsg(null);
                }}
              >
                Cancelar
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="input-control font-mono"
                placeholder="0000000-00.0000.0.00.0000"
                value={inputVal}
                onChange={(e) => setInputVal(handleMask(e.target.value))}
                disabled={!!loadingStep}
                maxLength={25}
                style={{ flex: 1, minWidth: '240px' }}
                autoFocus
              />
              <Button
                variant="primary"
                size="md"
                onClick={() => handleSearch(inputVal)}
                disabled={!inputVal || !!loadingStep}
              >
                {loadingStep ? <Icons.Loader size={16} /> : <Icons.Search size={16} />}
                <span>{loadingStep || 'Consultar DataJud'}</span>
              </Button>
            </div>

            {errorMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-xs)', color: 'var(--status-high-text)' }}>
                <Icons.AlertTriangle size={14} />
                <span>{errorMsg}</span>
              </div>
            )}

            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-2xs)' }}>
              Informe somente número localizado em documento ou fonte verificável. A consulta apenas enriquece um processo conhecido.
            </p>
          </div>
        )}

        {processos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.25rem 0', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
            Nenhum processo judicial vinculado a esta diligência até o momento.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {processos.map((proc) => (
              <JudicialProcessCard
                key={proc.numeroLimpo}
                proc={proc}
                onOpenDetails={onOpenDetails}
                onRemove={onRemoveProcesso}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};
