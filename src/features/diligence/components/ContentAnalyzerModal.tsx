// ==========================================================
// DILIGÊNCIA 360 — Modal de Análise de Conteúdo e Extração CNJ
// ==========================================================

import React, { useState, useMemo } from 'react';
import { CNJ, ExtractedCNJ } from '../../../lib/cnj';
import { DiscoverySourceType, DiscoverySource } from '../types';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Modal } from '../../../components/ui/Modal';

interface ContentAnalyzerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExtractAndSave: (extracted: ExtractedCNJ[], source: DiscoverySource) => void;
}

const SOURCE_OPTIONS: { type: DiscoverySourceType; label: string; defaultName: string }[] = [
  { type: 'judicial_gazette', label: 'Diário de Justiça (DJEN / DJe)', defaultName: 'Publicação DJEN' },
  { type: 'certificate', label: 'Certidão Judicial de Distribuição', defaultName: 'Certidão Estadual/Federal' },
  { type: 'adverse_media', label: 'Notícia / Mídia / Imprensa', defaultName: 'Matéria Jornalística' },
  { type: 'internal_document', label: 'Documento Interno / Licitação', defaultName: 'Declaração de Fornecedor' },
  { type: 'text_import', label: 'Texto Livre / Outro Conteúdo', defaultName: 'Importação Textual' },
];

export const ContentAnalyzerModal: React.FC<ContentAnalyzerModalProps> = ({
  isOpen,
  onClose,
  onExtractAndSave,
}) => {
  const [sourceType, setSourceType] = useState<DiscoverySourceType>('judicial_gazette');
  const [sourceName, setSourceName] = useState('Publicação DJEN');
  const [sourceUrl, setSourceUrl] = useState('');
  const [content, setContent] = useState('');

  const extracted = useMemo(() => {
    return CNJ.extractFromText(content);
  }, [content]);

  const handleSourceTypeChange = (type: DiscoverySourceType) => {
    setSourceType(type);
    const opt = SOURCE_OPTIONS.find((o) => o.type === type);
    if (opt) setSourceName(opt.defaultName);
  };

  const handleConfirm = () => {
    if (extracted.length === 0) return;

    const source: DiscoverySource = {
      type: sourceType,
      name: sourceName.trim() || 'Fonte Não Informada',
      url: sourceUrl.trim() || undefined,
      consultedAt: new Date().toISOString(),
      excerpt: content.trim().substring(0, 250),
    };

    onExtractAndSave(extracted, source);
    setContent('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Analisar Conteúdo e Extrair Processos CNJ"
      icon={<Icons.FileText size={18} />}
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleConfirm}
            disabled={extracted.length === 0}
            icon={<Icons.Check size={16} />}
          >
            {extracted.length > 0
              ? `Integrar ${extracted.length} Processo(s) Descoberto(s)`
              : 'Nenhum Processo Encontrado'}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
        Cole abaixo qualquer trecho de publicação, certidão, notícia ou documento. O extrator identificará e validará automaticamente os números de processo CNJ.
      </p>

      {/* Seleção de Tipo de Fonte */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label className="company-cell-label" style={{ marginBottom: '0.35rem', display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            TIPO DE ORIGEM
          </label>
          <select
            className="input-control"
            value={sourceType}
            onChange={(e) => handleSourceTypeChange(e.target.value as DiscoverySourceType)}
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.type} value={opt.type}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="company-cell-label" style={{ marginBottom: '0.35rem', display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            IDENTIFICAÇÃO DA FONTE
          </label>
          <input
            type="text"
            className="input-control"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="Ex: DJEN Edição 142 / Certidão TJPE"
          />
        </div>
      </div>

      <div>
        <label className="company-cell-label" style={{ marginBottom: '0.35rem', display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
          LINK / REFERÊNCIA (OPCIONAL)
        </label>
        <input
          type="text"
          className="input-control"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>

      {/* Textarea para Conteúdo */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
          <label className="company-cell-label" style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            TEXTO DO CONTEÚDO
          </label>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
            {extracted.length} processo(s) válido(s) detectado(s)
          </span>
        </div>
        <textarea
          className="input-control font-mono"
          rows={6}
          placeholder="Cole aqui o texto da publicação, despacho judicial, intimação ou certidão..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ fontSize: 'var(--text-xs)', resize: 'vertical' }}
          autoFocus
        />
      </div>

      {/* Prévia de Números Detectados */}
      {extracted.length > 0 && (
        <div
          style={{
            padding: '0.75rem',
            backgroundColor: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--font-semibold)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
            Processos CNJ Identificados ({extracted.length}):
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {extracted.map((ext) => (
              <span
                key={ext.normalized}
                className="font-mono badge badge-neutral"
                style={{ fontSize: 'var(--text-xs)' }}
              >
                {ext.formatted}
              </span>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};
