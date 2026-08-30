import { describe, it, expect } from 'vitest';
import { formatMediaProviders, formatMediaPlan } from './mediaSources';

describe('formatMediaProviders', () => {
  it('traduz o identificador do provedor para o nome legível', () => {
    expect(formatMediaProviders(['brave-news'])).toBe('Brave News');
    expect(formatMediaProviders(['gdelt-doc'])).toBe('GDELT DOC 2.0');
  });

  it('junta múltiplos provedores', () => {
    expect(formatMediaProviders(['brave-web', 'google-news-rss'])).toBe('Brave Web + Google News RSS');
  });

  it('não repete o mesmo provedor', () => {
    expect(formatMediaProviders(['brave-news', 'brave-news'])).toBe('Brave News');
  });

  it('mostra o identificador cru quando não há tradução', () => {
    expect(formatMediaProviders(['fonte-nova'])).toBe('fonte-nova');
  });

  it('usa o fallback quando a lista está vazia ou ausente', () => {
    expect(formatMediaProviders([], 'Fonte X')).toBe('Fonte X');
    expect(formatMediaProviders(undefined)).toBe('Fontes públicas');
    expect(formatMediaProviders([null, ''] as never)).toBe('Fontes públicas');
  });
});

describe('formatMediaPlan', () => {
  it('extrai o número da versão', () => {
    expect(formatMediaPlan('plan-v2')).toBe('Busca ampliada v2');
  });

  it('devolve o texto cru quando não casa com o padrão', () => {
    expect(formatMediaPlan('experimental')).toBe('experimental');
  });

  it('trata ausência como plano legado', () => {
    expect(formatMediaPlan()).toBe('Plano legado');
    expect(formatMediaPlan('')).toBe('Plano legado');
  });
});
