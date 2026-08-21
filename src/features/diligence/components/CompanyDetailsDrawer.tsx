// ==========================================================
// DILIGÊNCIA 360 — Drawer de Detalhes Cadastrais da Empresa
// Visualização completa de endereço, CNAE, porte e capital social
// ==========================================================

import React from 'react';
import { CompanyData } from '../types';
import { Drawer } from '../../../components/ui/Drawer';
import { Badge } from '../../../components/ui/Badge';
import { Formatters } from '../../../lib/formatters';

interface CompanyDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  empresa: CompanyData;
  cnpjFmt: string;
}

export const CompanyDetailsDrawer: React.FC<CompanyDetailsDrawerProps> = ({
  isOpen,
  onClose,
  empresa,
  cnpjFmt,
}) => {
  const situacao = (empresa.descricao_situacao_cadastral || 'ATIVA').toUpperCase();
  const situacaoVariant = situacao === 'ATIVA' ? 'success' : 'critical';

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={empresa.razao_social || 'Dados da Empresa'}
      subtitle={`CNPJ: ${cnpjFmt} • Fonte: Receita Federal`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Identificação */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.85rem',
            padding: '1rem',
            backgroundColor: 'var(--bg-surface-subtle)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
          }}
        >
          <div>
            <span className="company-cell-label">Situação na Receita Federal</span>
            <div style={{ marginTop: '0.25rem' }}>
              <Badge variant={situacaoVariant}>{situacao === 'ATIVA' ? '✓ Ativa e Regular' : situacao}</Badge>
            </div>
          </div>

          <div>
            <span className="company-cell-label">Fundada em</span>
            <div className="font-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
              {Formatters.date(empresa.data_inicio_atividade)}
            </div>
          </div>

          <div>
            <span className="company-cell-label">Tamanho da Empresa</span>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
              {empresa.descricao_porte || empresa.porte || 'Demais'}
            </div>
          </div>

          <div>
            <span className="company-cell-label">Capital Registrado</span>
            <div className="font-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
              {Formatters.currency(empresa.capital_social)}
            </div>
          </div>
        </div>

        {/* Atividade Econômica & Natureza Jurídica */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span className="company-cell-label">Atividade e Tipo de Empresa</span>
          <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              <strong>Atividade Principal:</strong> {empresa.cnae_fiscal || '—'} — {empresa.cnae_fiscal_descricao || 'Não informado'}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              <strong>Tipo Jurídico:</strong> {empresa.natureza_juridica || 'Não informada'}
            </div>
          </div>
        </div>

        {/* Endereço & Contato */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span className="company-cell-label">Endereço e Contato</span>
          <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
              {empresa.logradouro || 'Endereço não informado'}, {empresa.numero || 'S/N'} {empresa.complemento ? `— ${empresa.complemento}` : ''}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              {empresa.bairro || ''} • {empresa.municipio || ''} / {empresa.uf || ''} • CEP {empresa.cep || ''}
            </div>
            {(empresa.email || empresa.ddd_telefone_1) && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '0.3rem' }}>
                Telefone: {empresa.ddd_telefone_1 || '—'} | E-mail: {empresa.email || '—'}
              </div>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
};
