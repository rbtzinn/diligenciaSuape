// ==========================================================
// DILIGÊNCIA 360 — Modal de Inserção Manual de Processo CNJ
// ==========================================================

import React, { useState } from 'react';
import { CNJ, ExtractedCNJ } from '../../../lib/cnj';
import { DiscoverySource } from '../types';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Modal } from '../../../components/ui/Modal';

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Vincular Processo Judicial"
      icon={<Icons.Scale size={18} />}
      size="md"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" onClick={handleConfirm} disabled={!val}>
            Vincular Processo
          </Button>
        </>
      }
    >
      <div>
        <label className="company-cell-label" style={{ marginBottom: '0.35rem', display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
          NÚMERO DO PROCESSO (CNJ)
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
        <label className="company-cell-label" style={{ marginBottom: '0.35rem', display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
          ORIGEM / JUSTIFICATIVA
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

      <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-2xs)', margin: 0 }}>
        Use apenas número obtido em documento ou fonte verificável. O sistema valida o dígito CNJ antes de vincular.
      </p>
    </Modal>
  );
};
