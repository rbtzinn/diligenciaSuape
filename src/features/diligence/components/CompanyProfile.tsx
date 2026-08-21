// ==========================================================
// DILIGÊNCIA 360 — Componente Cadastro Empresarial (Compacto)
// ==========================================================

import React, { useState } from 'react';
import { CompanyData } from '../types';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Formatters } from '../../../lib/formatters';
import { CompanyDetailsDrawer } from './CompanyDetailsDrawer';

interface CompanyProfileProps {
  empresa: CompanyData;
  cnpjFmt: string;
}

export const CompanyProfile: React.FC<CompanyProfileProps> = ({ empresa, cnpjFmt }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const situacao = (empresa.descricao_situacao_cadastral || 'ATIVA').toUpperCase();
  const situacaoVariant = situacao === 'ATIVA' ? 'success' : 'critical';

  return (
    <>
      <Card
        title="Dados da Empresa"
        icon={<Icons.Building size={16} />}
        action={
          <Button variant="ghost" size="sm" onClick={() => setIsDrawerOpen(true)}>
            Ver cadastro completo ➜
          </Button>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
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
            <span className="company-cell-label">Localização</span>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
              {empresa.municipio || '—'} / {empresa.uf || '—'}
            </div>
          </div>
        </div>
      </Card>

      <CompanyDetailsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        empresa={empresa}
        cnpjFmt={cnpjFmt}
      />
    </>
  );
};
