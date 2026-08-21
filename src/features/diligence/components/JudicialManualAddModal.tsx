// ==========================================================
// DILIGÊNCIA 360 — Modal de Inserção Manual de Processo CNJ
// ==========================================================

import React, { useState } from 'react';
import { CNJ, ExtractedCNJ } from '../../../lib/cnj';
import { DiscoverySource } from '../types';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface JudicialManualAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (extracted: ExtractedCNJ[], source: DiscoverySource, autoValidate?: boolean) => void;
}

export const JudicialManualAddModal: React.FC<JudicialManualAddModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [val, setVal] = useState('');
  const [desc, setDesc] = useState('Declaração do Fornecedor / Análise Manual');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const clean = CNJ.clean(val);
    if (!CNJ.validate(clean)) {
      setError('Número CNJ inválido. Verifique os 20 dígitos numéricos e o dígito verificador.');
      return;
    }

    const ext: ExtractedCNJ = {
      raw: val,
      normalized: clean,
      formatted: CNJ.format(clean),
      tribunalKey: `${clean.substring(13, 14)}.${clean.substring(14, 16)}`,
    };

    const source: DiscoverySource = {
      type: 'manual',
      name: desc.trim() || 'Inserção Manual',
      consultedAt: new Date().toISOString(),
      excerpt: 'Processo informado diretamente pelo analista de compliance.',
    };

    onAdd([ext], source, true);
    setVal('');
    setError(null);
    onClose();
  };

  return (
    <div className="drawer-overlay animate-fade-in" onClick={onClose}>
      <div
        className="animate-scale-up"
        style={{
          width: '90%',
          maxWidth: '520px',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Icons.Scale size={18} style={{ color: 'var(--brand-blue)' }} />
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
              Vincular Processo Judicial
            </h2>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            <Icons.Close size={16} />
          </button>
        </div>

        <div>
          <label className="company-cell-label" style={{ marginBottom: '0.25rem', display: 'block' }}>
            Número do Processo (CNJ)
          </label>
          <input
            type="text"
            className="input-control font-mono"
            placeholder="0000000-00.0000.0.00.0000"
            value={val}
            onChange={(e) => {
              setVal(CNJ.mask(e.target.value));
              setError(null);
            }}
            maxLength={25}
            autoFocus
          />
        </div>

        <div>
          <label className="company-cell-label" style={{ marginBottom: '0.25rem', display: 'block' }}>
            Origem / Justificativa
          </label>
          <input
            type="text"
            className="input-control"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Ex: Declarado na Habilitação / Certidão anexada"
          />
        </div>

        {error && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--status-high-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Icons.AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-2xs)' }}>
          Use apenas número obtido em documento ou fonte verificável. O sistema valida o dígito CNJ antes de vincular.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" onClick={handleConfirm} disabled={!val}>
            Vincular Processo
          </Button>
        </div>
      </div>
    </div>
  );
};
