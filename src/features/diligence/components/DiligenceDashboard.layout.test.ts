import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dashboard = readFileSync(fileURLToPath(new URL('./DiligenceDashboard.tsx', import.meta.url)), 'utf8');

describe('navegação da diligência', () => {
  it('segue a seção da URL e mantém a avaliação SUAPE em seção própria', () => {
    expect(dashboard).toContain('useParams<{ section: string }>()');
    expect(dashboard).toContain("isDashboardSection(section) ? section : 'overview'");
    expect(dashboard).toContain('navigate(`/diligence/${encodeURIComponent(diligence.id)}/${id}`)');
    expect(dashboard).toContain('Pesquisa automática');
    expect(dashboard).toContain('Complemento SUAPE');
    expect(dashboard).toContain("activeTab === 'suape'");
    expect(dashboard).toContain("hidden={activeTab !== 'suape'}");
  });

  it('oferece menu acessível no celular', () => {
    expect(dashboard).toContain('aria-label="Abrir seções da diligência"');
    expect(dashboard).toContain('aria-controls="diligence-sections"');
    expect(dashboard).toContain('aria-current={activeTab === section.id');
  });
});
